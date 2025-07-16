import pandas as pd
import numpy as np
import re
import json
import os
from datetime import datetime
import logging
import concurrent.futures
import functools
from typing import Dict, List, Any, Optional, Tuple, Set
import time
import pyodbc
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("msp_sap_integration")

# Database connection parameters
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"
DB_USER = "msp_admin"
DB_PASSWORD = os.getenv("DB_PASSWORD")

# Constants
BATCH_SIZE = 1000
MAX_WORKERS = 8
CACHE_EXPIRY = 3600

# [Your existing helper functions - keeping them unchanged]
def safe_float_conversion(value):
    """
    Safely convert a value to float, handling various number formats:
    - European format (comma as decimal separator)
    - Currency symbols (€, $, etc.)
    - Thousands separators (dot in European format, comma in US format)
    """
    if pd.isna(value):
        return 0.0
        
    # Convert to string first
    str_value = str(value).strip()
    
    # Return 0 for empty strings
    if not str_value:
        return 0.0
    
    # Remove currency symbols and other non-numeric characters
    # Keep only digits, comma, dot, minus sign
    cleaned = ""
    for char in str_value:
        if char.isdigit() or char in [',', '.', '-']:
            cleaned += char
    
    # If empty after cleaning, return 0
    if not cleaned:
        return 0.0
    
    try:
        # Try direct conversion first (works for US format)
        return float(cleaned)
    except ValueError:
        # European format handling
        try:
            # For European format: replace decimal comma with dot
            # If both dot and comma exist, assume the last one is the decimal separator
            if ',' in cleaned and '.' in cleaned:
                # Get the positions of the last dot and comma
                last_dot = cleaned.rindex('.')
                last_comma = cleaned.rindex(',')
                
                if last_dot > last_comma:
                    # US format with thousands separator (e.g., 1,234.56)
                    # Remove all commas
                    cleaned = cleaned.replace(',', '')
                else:
                    # European format with thousands separator (e.g., 1.234,56)
                    # Replace all dots with empty string and the last comma with dot
                    cleaned = cleaned.replace('.', '')
                    cleaned = cleaned.replace(',', '.')
            else:
                # Only comma exists, treat as decimal separator
                cleaned = cleaned.replace(',', '.')
                
            return float(cleaned)
        except (ValueError, IndexError):
            # If still fails, log and return 0
            logger.warning(f"Could not convert '{str_value}' to float, using 0 instead")
            return 0.0
        
def safe_get(row, column, default=None):
    """
    Safely get a value from a pandas row, converting NaN to a default value
    """
    if column not in row or pd.isna(row[column]):
        return default
    return row[column]

class DatabaseManager:
    """
    Manages database connections and operations with FIXED date handling
    """
    
    def __init__(self):
        self.connection_string = None
        self.engine = None
        self._setup_connection()
    
    def _setup_connection(self):
        """Setup database connection string and SQLAlchemy engine"""
        try:
            # Validate that password is set
            if not DB_PASSWORD:
                raise ValueError("DB_PASSWORD environment variable is not set or is empty")
            
            # Build connection string for pyodbc
            self.connection_string = (
                f"DRIVER={{ODBC Driver 18 for SQL Server}};"
                f"SERVER={DB_SERVER};"
                f"DATABASE={DB_NAME};"
                f"UID={DB_USER};"
                f"PWD={DB_PASSWORD};"
                f"Encrypt=yes;"
                f"TrustServerCertificate=no;"
                f"Connection Timeout=30;"
            )
            
            # Build SQLAlchemy connection string
            quoted_password = quote_plus(str(DB_PASSWORD))
            sqlalchemy_url = (
                f"mssql+pyodbc://{DB_USER}:{quoted_password}@{DB_SERVER}/{DB_NAME}"
                f"?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
            )
            
            self.engine = create_engine(sqlalchemy_url, fast_executemany=True)
            logger.info("✅ Database connection configured successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to setup database connection: {str(e)}")
            raise
    
    def test_connection(self):
        """Test the database connection"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT 1 as test")).fetchone()
                logger.info("✅ Database connection test successful")
                return True
        except Exception as e:
            logger.error(f"❌ Database connection test failed: {str(e)}")
            return False
    
    def get_latest_batch_id(self, table_name: str, batch_pattern: str) -> str:
        """Get the most recent batch_id for a table"""
        try:
            query = text(f"""
                SELECT TOP 1 batch_id 
                FROM {table_name} 
                WHERE batch_id LIKE :pattern 
                ORDER BY upload_date DESC, batch_id DESC
            """)
            
            with self.engine.connect() as conn:
                result = conn.execute(query, {"pattern": batch_pattern}).fetchone()
                if result:
                    logger.info(f"Latest batch for {table_name}: {result[0]}")
                    return result[0]
                else:
                    logger.warning(f"No batches found for {table_name} with pattern {batch_pattern}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting latest batch for {table_name}: {str(e)}")
            raise
    
    def read_table_as_dataframe(self, table_name: str, batch_id: str = None, column_mapping: dict = None) -> pd.DataFrame:
        """
        🔧 FIXED: Read table data as pandas DataFrame with FORCED STRING DTYPES for date columns
        This prevents pandas from auto-converting ISO date strings to datetime objects
        """
        try:
            # Build the query
            if batch_id:
                query = f"SELECT * FROM {table_name} WHERE batch_id = '{batch_id}'"
            else:
                query = f"SELECT * FROM {table_name}"
            
            # 🔧 FIX #1: Define dtype mapping to force ALL date columns to stay as strings
            # This prevents pandas from converting "2025-05-27" → datetime.date(2025, 5, 27)
            
            # Define known date columns that should NEVER be converted
            date_columns_to_preserve = [
                'datum',           # MSP date field
                'anfangsdatum',    # MSP start date
                'enddatum',        # MSP end date
                'buchungsdatum',   # SAP booking date
                'upload_date',     # System upload date
                'created_at',      # System created date
                'processing_date'  # System processing date
            ]
            
            # 🔧 FIX #2: Create dtype dictionary to force string type for ALL potential date columns
            dtype_dict = {}
            
            # First, read just the column names to see what we're dealing with
            with self.engine.connect() as conn:
                # Get column information
                column_query = text(f"""
                    SELECT COLUMN_NAME, DATA_TYPE 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = :table_name
                """)
                
                # Extract table name without schema if needed
                clean_table_name = table_name.split('.')[-1] if '.' in table_name else table_name
                
                columns_info = conn.execute(column_query, {"table_name": clean_table_name}).fetchall()
                
                # Force string dtype for known date columns AND any datetime-type columns
                for col_name, col_type in columns_info:
                    col_name_lower = col_name.lower()
                    col_type_lower = col_type.lower()
                    
                    # Force string for known date columns
                    if col_name_lower in [dc.lower() for dc in date_columns_to_preserve]:
                        dtype_dict[col_name] = 'string'
                        logger.info(f"🔧 Forcing {col_name} to string type (known date column)")
                    
                    # Force string for any SQL datetime/date type columns
                    elif any(dt in col_type_lower for dt in ['date', 'time', 'timestamp']):
                        dtype_dict[col_name] = 'string'
                        logger.info(f"🔧 Forcing {col_name} to string type (SQL date type: {col_type})")
            
            # 🔧 FIX #3: Read data with forced string dtypes for date columns
            logger.info(f"📊 Reading {table_name} with {len(dtype_dict)} forced string columns...")
            
            df = pd.read_sql_query(
                query, 
                self.engine,
                dtype=dtype_dict  # 🔧 This forces date columns to stay as strings!
            )
            
            # 🔧 FIX #4: Double-check and convert any remaining datetime objects to strings
            for col in df.columns:
                if df[col].dtype == 'object':
                    # Check if this column contains datetime objects
                    sample_non_null = df[col].dropna()
                    if len(sample_non_null) > 0:
                        first_val = sample_non_null.iloc[0]
                        
                        # If it's a datetime-like object, convert the entire column to string
                        if hasattr(first_val, 'strftime') or str(type(first_val)) in ['<class \'datetime.date\'>', '<class \'datetime.datetime\'>', '<class \'pandas._libs.tslibs.timestamps.Timestamp\'>']:
                            logger.info(f"🔧 Converting remaining datetime objects in {col} to strings")
                            df[col] = df[col].apply(lambda x: x.strftime('%Y-%m-%d') if (pd.notna(x) and hasattr(x, 'strftime')) else str(x) if pd.notna(x) else x)
            
            # CRITICAL: Create a completely independent copy to break any database references
            df = df.copy(deep=True)
            
            # Apply column mapping if provided (to maintain compatibility with existing code)
            if column_mapping:
                df = df.rename(columns=column_mapping)
            
            # CRITICAL: Reset index and ensure clean DataFrame
            df = df.reset_index(drop=True)
            
            # 🔧 FIX #5: Log sample date values to verify they're strings
            for col in df.columns:
                col_lower = col.lower()
                if any(date_term in col_lower for date_term in ['datum', 'date', 'zeit', 'time']):
                    sample_vals = df[col].dropna().head(3).tolist()
                    logger.info(f"📅 Date column {col} sample values: {sample_vals} (types: {[type(v).__name__ for v in sample_vals]})")
            
            logger.info(f"✅ Read {len(df)} records from {table_name} with proper string date handling")
            return df
            
        except Exception as e:
            logger.error(f"❌ Error reading {table_name}: {str(e)}")
            raise


# ==============================================================================
# ENHANCED JSON SERIALIZATION - HANDLES ALL DATETIME OBJECTS
# ==============================================================================

def make_json_serializable(obj, _seen=None):
    """
    🔧 ENHANCED: Convert objects that are not JSON serializable to serializable formats
    Now handles ALL datetime object types that might slip through
    """
    if _seen is None:
        _seen = set()
    
    # Check for circular references
    obj_id = id(obj)
    if obj_id in _seen:
        return f"<Circular Reference: {type(obj).__name__}>"
    
    if isinstance(obj, (dict, list, pd.Series, pd.DataFrame)):
        _seen.add(obj_id)
    
    try:
        # 🔧 FIX #6: Handle ALL possible datetime object types
        if isinstance(obj, pd.Timestamp):
            return obj.strftime('%Y-%m-%d')
        elif hasattr(obj, 'strftime'):  # This catches datetime.date, datetime.datetime, etc.
            return obj.strftime('%Y-%m-%d')
        elif str(type(obj)) in ['<class \'datetime.date\'>', '<class \'datetime.datetime\'>']:
            # Fallback for datetime objects
            return obj.strftime('%Y-%m-%d') if hasattr(obj, 'strftime') else str(obj)
        elif isinstance(obj, pd.Series):
            # Convert Series to simple dict, avoiding circular references
            result = {}
            for k, v in obj.items():
                try:
                    if pd.isna(v):
                        result[str(k)] = None
                    else:
                        result[str(k)] = make_json_serializable(v, _seen.copy())
                except:
                    result[str(k)] = str(v) if v is not None else None
            return result
        elif isinstance(obj, pd.DataFrame):
            # Convert DataFrame to simple list of dicts
            try:
                records = obj.to_dict(orient='records')
                result = []
                for record in records:
                    clean_record = {}
                    for k, v in record.items():
                        try:
                            if pd.isna(v):
                                clean_record[str(k)] = None
                            else:
                                clean_record[str(k)] = make_json_serializable(v, _seen.copy())
                        except:
                            clean_record[str(k)] = str(v) if v is not None else None
                    result.append(clean_record)
                return result
            except:
                return f"<DataFrame with {len(obj)} rows>"
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            if np.isnan(obj):
                return None
            return float(obj)
        elif isinstance(obj, np.ndarray):
            try:
                return [make_json_serializable(x, _seen.copy()) for x in obj.tolist()]
            except:
                return f"<Array with {len(obj)} items>"
        elif isinstance(obj, dict):
            result = {}
            for k, v in obj.items():
                try:
                    if pd.isna(v):
                        result[str(k)] = None
                    else:
                        result[str(k)] = make_json_serializable(v, _seen.copy())
                except:
                    result[str(k)] = str(v) if v is not None else None
            return result
        elif isinstance(obj, (list, tuple)):
            try:
                return [make_json_serializable(item, _seen.copy()) for item in obj]
            except:
                return f"<List with {len(obj)} items>"
        elif pd.isna(obj):
            return None
        elif hasattr(obj, '__dict__'):
            # For custom objects, convert to simple dict
            try:
                return {k: make_json_serializable(v, _seen.copy()) for k, v in obj.__dict__.items() 
                       if not k.startswith('_')}
            except:
                return str(obj)
        else:
            return obj
    except Exception as e:
        # 🔧 FIX #7: Enhanced fallback for any datetime-like objects
        obj_str = str(obj)
        if 'datetime.date(' in obj_str and ')' in obj_str:
            # Extract date from string representation like "datetime.date(2025, 5, 27)"
            try:
                # Parse the datetime.date string format
                import re
                match = re.search(r'datetime\.date\((\d+),\s*(\d+),\s*(\d+)\)', obj_str)
                if match:
                    year, month, day = match.groups()
                    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            except:
                pass
        
        # Ultimate fallback
        return str(obj) if obj is not None else None
    finally:
        if obj_id in _seen:
            _seen.discard(obj_id)


class JSONEncoder(json.JSONEncoder):
    """
    🔧 ENHANCED: Custom JSON encoder that handles pandas and numpy types with enhanced datetime support
    """
    def default(self, obj):
        # Handle NaN, infinity, and -infinity
        if isinstance(obj, float):
            if np.isnan(obj):
                return None
            elif np.isinf(obj) and obj > 0:
                return "Infinity"
            elif np.isinf(obj) and obj < 0:
                return "-Infinity"
        
        # 🔧 FIX #8: Enhanced datetime handling in JSON encoder
        if hasattr(obj, 'strftime'):
            return obj.strftime('%Y-%m-%d')
        
        try:
            return make_json_serializable(obj)
        except Exception as e:
            # Enhanced fallback for datetime objects
            obj_str = str(obj)
            if 'datetime.date(' in obj_str:
                try:
                    import re
                    match = re.search(r'datetime\.date\((\d+),\s*(\d+),\s*(\d+)\)', obj_str)
                    if match:
                        year, month, day = match.groups()
                        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                except:
                    pass
            
            # Ultimate fallback
            return str(obj) if obj is not None else None


# ==============================================================================
# VERIFICATION FUNCTION - CHECKS DATE HANDLING
# ==============================================================================

def verify_date_handling_in_dataframe(df: pd.DataFrame, df_name: str) -> None:
    """
    🔍 VERIFICATION: Check that all date columns are properly handled as strings
    """
    logger.info(f"🔍 Verifying date handling in {df_name}...")
    
    date_columns = []
    problematic_columns = []
    
    for col in df.columns:
        col_lower = col.lower()
        if any(date_term in col_lower for date_term in ['datum', 'date', 'zeit', 'time']):
            date_columns.append(col)
            
            # Check data types in this column
            sample_non_null = df[col].dropna()
            if len(sample_non_null) > 0:
                unique_types = set(type(val).__name__ for val in sample_non_null.head(10))
                
                # Check for problematic types
                problematic_types = [t for t in unique_types if 'datetime' in t.lower() or 'timestamp' in t.lower()]
                
                if problematic_types:
                    problematic_columns.append((col, problematic_types))
                    logger.warning(f"⚠️  {df_name}.{col} contains datetime objects: {problematic_types}")
                else:
                    logger.info(f"✅ {df_name}.{col} properly handled as strings")
    
    if problematic_columns:
        logger.error(f"❌ {df_name} has {len(problematic_columns)} columns with datetime objects!")
        for col, types in problematic_columns:
            logger.error(f"   - {col}: {types}")
        return False
    else:
        logger.info(f"✅ {df_name} date handling verification passed ({len(date_columns)} date columns)")
        return True
    
# Initialize database manager
db_manager = DatabaseManager()

# -----------------------------------------------------------------------------
# COLUMN MAPPING FOR COMPATIBILITY
# -----------------------------------------------------------------------------

# Define column mappings to maintain compatibility with existing code
SAP_COLUMN_MAPPING = {
    'belegnummer': 'Belegnummer',
    'kostenstelle': 'Kostenstelle', 
    'betrag_in_hauswaehrung': 'Betrag in Hauswährung',
    'text_field': 'Text',
    'buchungsdatum': 'Buchungsdatum'
}

MSP_COLUMN_MAPPING = {
    'bestellnummer': 'Bestellnummer',
    'titel_der_massnahme': 'Titel der Maßnahme',
    'benoetiges_budget': 'Benötigtes Budget (Geschätzt)',
    'gruppen': 'Gruppen',
    'datum': 'Datum',
    'name_field': 'Name',
    'anfangsdatum': 'Anfangsdatum',      # Start date field
    'enddatum': 'Enddatum'               # End date field
}

FLOOR_MAPPING_COLUMNS = {
    'department': 'Department',
    'region': 'Region', 
    'district': 'District',
    'kostenstelle': 'Kostenstelle'
}

HQ_MAPPING_COLUMNS = {
    'bezeichnung': 'Bezeichnung',
    'abteilung': 'Abteilung',
    'kostenstelle': 'Kostenstelle '  # Note the trailing space for compatibility
}

# -----------------------------------------------------------------------------
# Simple data models without dataclasses to avoid inheritance issues
# -----------------------------------------------------------------------------

class LocationInfo:
    """Simple class to store location information with fallback for empty values"""
    
    def __init__(self, department, region, district):
        self.department = None if pd.isna(department) else department
        self.region = None if pd.isna(region) else region
        self.district = None if pd.isna(district) else district
    
    def to_dict(self):
        return {
            'department': self.department,
            'region': self.region,
            'district': self.district
        }

# -----------------------------------------------------------------------------
# Cache implementation
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# PROPER DATABASE STORAGE FUNCTIONS
# -----------------------------------------------------------------------------

def save_direct_costs_to_table(direct_costs_data: List[Dict], batch_id: str, batch_timestamp: datetime) -> None:
    """Save direct costs to proper table"""
    if not direct_costs_data:
        return
    
    try:
        df = pd.DataFrame(direct_costs_data)
        df['batch_id'] = batch_id
        df['created_at'] = batch_timestamp
        
        # Rename columns to match database
        column_mapping = {
            'text': 'text_description'
        }
        df = df.rename(columns=column_mapping)
        
        # Select only existing columns
        db_columns = [
            'transaction_id', 'amount', 'text_description', 'booking_date',
            'category', 'status', 'budget_impact', 'department', 'region',
            'district', 'location_type', 'batch_id', 'created_at'
        ]
        available_columns = [col for col in db_columns if col in df.columns]
        df = df[available_columns]
        
        # Convert date columns
        if 'booking_date' in df.columns:
            df['booking_date'] = pd.to_datetime(df['booking_date'], errors='coerce')
        
        df.to_sql('direct_costs', db_manager.engine, if_exists='append', index=False)
        logger.info(f"✅ Saved {len(df)} direct costs to proper table")
        
    except Exception as e:
        logger.error(f"❌ Error saving direct costs: {str(e)}")
        raise

def save_booked_measures_to_table(booked_measures_data: List[Dict], batch_id: str, batch_timestamp: datetime) -> None:
    """Save booked measures to proper table"""
    if not booked_measures_data:
        return
    
    try:
        df = pd.DataFrame(booked_measures_data)
        df['batch_id'] = batch_id
        df['created_at'] = batch_timestamp
        
        # Rename columns to match database
        column_mapping = {
            'text': 'text_description'
        }
        df = df.rename(columns=column_mapping)
        
        # Select only existing columns
        db_columns = [
            'transaction_id', 'measure_id', 'bestellnummer', 'measure_title',
            'estimated_amount', 'actual_amount', 'text_description',
            'booking_date', 'measure_date', 'category', 'status',
            'previously_parked', 'budget_impact', 'department', 'region',
            'district', 'location_type', 'batch_id', 'created_at'
        ]
        available_columns = [col for col in db_columns if col in df.columns]
        df = df[available_columns]
        
        # Convert date columns
        for date_col in ['booking_date', 'measure_date']:
            if date_col in df.columns:
                df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        
        df.to_sql('booked_measures', db_manager.engine, if_exists='append', index=False)
        logger.info(f"✅ Saved {len(df)} booked measures to proper table")
        
    except Exception as e:
        logger.error(f"❌ Error saving booked measures: {str(e)}")
        raise

def save_parked_measures_to_table(parked_measures_data: List[Dict], batch_id: str, batch_timestamp: datetime) -> None:
    """Save parked measures to proper table"""
    if not parked_measures_data:
        return
    
    try:
        df = pd.DataFrame(parked_measures_data)
        df['batch_id'] = batch_id
        df['created_at'] = batch_timestamp
        
        # Rename columns to match database
        column_mapping = {
            'name': 'responsible_name'
        }
        df = df.rename(columns=column_mapping)
        
        # Select only existing columns
        db_columns = [
            'measure_id', 'bestellnummer', 'measure_title', 'estimated_amount',
            'measure_date', 'responsible_name', 'category', 'status',
            'budget_impact', 'department', 'region', 'district',
            'location_type', 'batch_id', 'created_at'
        ]
        available_columns = [col for col in db_columns if col in df.columns]
        df = df[available_columns]
        
        # Convert date columns
        if 'measure_date' in df.columns:
            df['measure_date'] = pd.to_datetime(df['measure_date'], errors='coerce')
        
        df.to_sql('parked_measures', db_manager.engine, if_exists='append', index=False)
        logger.info(f"✅ Saved {len(df)} parked measures to proper table")
        
    except Exception as e:
        logger.error(f"❌ Error saving parked measures: {str(e)}")
        raise

def save_processing_statistics(processed_data: Dict, batch_id: str, batch_timestamp: datetime) -> None:
    """Save processing statistics to proper table"""
    try:
        stats_data = {
            'batch_id': batch_id,
            'processing_date': batch_timestamp,
            'total_sap_transactions': processed_data.get('statistics', {}).get('total_sap_transactions', 0),
            'total_msp_measures': processed_data.get('statistics', {}).get('total_msp_measures', 0),
            'direct_costs_count': processed_data.get('statistics', {}).get('direct_costs_count', 0),
            'booked_measures_count': processed_data.get('statistics', {}).get('booked_measures_count', 0),
            'parked_measures_count': processed_data.get('statistics', {}).get('parked_measures_count', 0)
        }
        
        stats_df = pd.DataFrame([stats_data])
        stats_df.to_sql('processing_statistics', db_manager.engine, if_exists='append', index=False)
        logger.info(f"✅ Saved processing statistics to proper table")
        
    except Exception as e:
        logger.error(f"❌ Error saving processing statistics: {str(e)}")
        raise

def save_to_proper_database_tables(processed_data: Dict) -> None:
    """
    Save processed data to proper SQL tables instead of JSON blob
    """
    logger.info("💾 Saving processed data to proper SQL tables...")
    
    try:
        # Get current timestamp for this batch
        batch_timestamp = datetime.now()
        batch_id = f"BATCH_{batch_timestamp.strftime('%Y%m%d_%H%M%S')}"
        
        # Save each data type to its proper table
        save_direct_costs_to_table(processed_data.get('direct_costs', []), batch_id, batch_timestamp)
        save_booked_measures_to_table(processed_data.get('booked_measures', []), batch_id, batch_timestamp)
        save_parked_measures_to_table(processed_data.get('parked_measures', []), batch_id, batch_timestamp)
        save_processing_statistics(processed_data, batch_id, batch_timestamp)
        
        logger.info(f"✅ Successfully saved all data to proper SQL tables with batch_id: {batch_id}")
        
        # WICHTIG: Auch noch die alte JSON-Struktur speichern für Kompatibilität
        logger.info("💾 Also saving in old JSON format for API compatibility...")
        save_to_database_as_json("transactions", processed_data)
        
    except Exception as e:
        logger.error(f"❌ Error saving to proper tables: {str(e)}")
        raise

# Neue Query-Funktionen für bessere Performance
def get_parked_measures_from_table() -> pd.DataFrame:
    """Get parked measures from proper SQL table"""
    query = """
    SELECT 
        bestellnummer,
        measure_title,
        estimated_amount,
        status,
        department,
        location_type,
        measure_date,
        responsible_name,
        category,
        created_at
    FROM parked_measures
    WHERE category IN ('PARKED_MEASURE', 'UNASSIGNED_MEASURE')
    ORDER BY bestellnummer
    """
    return pd.read_sql(query, db_manager.engine)


class Cache:
    """Simple in-memory cache with expiry"""
    
    def __init__(self, expiry_seconds=3600):
        self._cache = {}
        self._timestamps = {}
        self._expiry_seconds = expiry_seconds
    
    def get(self, key):
        """Get value from cache if it exists and is not expired"""
        if key not in self._cache:
            return None
            
        timestamp = self._timestamps.get(key, 0)
        if time.time() - timestamp > self._expiry_seconds:
            # Expired
            del self._cache[key]
            del self._timestamps[key]
            return None
            
        return self._cache[key]
    
    def set(self, key, value):
        """Set value in cache with current timestamp"""
        self._cache[key] = value
        self._timestamps[key] = time.time()
    
    def clear(self):
        """Clear all cached values"""
        self._cache.clear()
        self._timestamps.clear()

# Initialize caches
kostenstelle_cache = Cache(CACHE_EXPIRY)
bestellnummer_cache = Cache(CACHE_EXPIRY)
department_cache = Cache(CACHE_EXPIRY)

# -----------------------------------------------------------------------------
# DATABASE DATA LOADING FUNCTIONS (REPLACEMENT FOR BLOB OPERATIONS)
# -----------------------------------------------------------------------------

def read_from_database(table_type: str) -> pd.DataFrame:
    """
    Read data from database tables based on table type with DATE VERIFICATION
    This replaces the read_from_blob function
    """
    logger.info(f"Reading {table_type} data from database...")
    
    if table_type == "sap":
        # Get latest SAP batch
        latest_batch = db_manager.get_latest_batch_id("sap_transactions", "BULK_IMPORT_%")
        if not latest_batch:
            raise ValueError("No SAP data found in database")
        
        # Read SAP data with column mapping
        df = db_manager.read_table_as_dataframe(
            "sap_transactions", 
            latest_batch, 
            SAP_COLUMN_MAPPING
        )
        
        # 🔧 ADD THIS: Verify date handling
        verify_date_handling_in_dataframe(df, "SAP")
        
    elif table_type == "msp":
        # Get latest MSP batch  
        latest_batch = db_manager.get_latest_batch_id("msp_measures", "MSP_%")
        if not latest_batch:
            raise ValueError("No MSP data found in database")
        
        # Read MSP data with column mapping
        df = db_manager.read_table_as_dataframe(
            "msp_measures",
            latest_batch,
            MSP_COLUMN_MAPPING
        )
        
        # 🔧 ADD THIS: Verify date handling
        verify_date_handling_in_dataframe(df, "MSP")
        
    elif table_type == "mapping_floor":
        # Get latest Floor mapping batch
        latest_batch = db_manager.get_latest_batch_id("kostenstelle_mapping_floor", "BULK_IMPORT_%")
        if not latest_batch:
            raise ValueError("No Floor mapping data found in database")
        
        # Read Floor mapping data with column mapping
        df = db_manager.read_table_as_dataframe(
            "kostenstelle_mapping_floor",
            latest_batch,
            FLOOR_MAPPING_COLUMNS
        )
        
    elif table_type == "mapping_hq":
        # Get latest HQ mapping batch
        latest_batch = db_manager.get_latest_batch_id("kostenstelle_mapping_hq", "HQ_FIX_%")
        if not latest_batch:
            raise ValueError("No HQ mapping data found in database")
        
        # Read HQ mapping data with column mapping
        df = db_manager.read_table_as_dataframe(
            "kostenstelle_mapping_hq",
            latest_batch,
            HQ_MAPPING_COLUMNS
        )
        
    else:
        raise ValueError(f"Unknown table type: {table_type}")
    
    return df

def save_to_database_as_json(table_name: str, data: Any) -> None:
    """
    Save processed data to a results table in the database
    This replaces saving JSON files to blob storage
    """
    logger.info(f"Saving processed data to database table: {table_name}")
    
    try:
        # STEP 1: Clean the data to remove circular references BEFORE JSON encoding
        logger.info("🧹 Cleaning data to remove circular references...")
        clean_data = make_json_serializable(data)
        
        # STEP 2: Convert cleaned data to JSON string
        logger.info("📝 Converting to JSON...")
        json_data = json.dumps(clean_data, cls=JSONEncoder, separators=(',', ':'))
        
        # STEP 3: Create timestamp for this processing run
        timestamp = datetime.now()
        
        # STEP 4: Create results table if it doesn't exist
        create_results_table_query = text("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'processing_results')
            BEGIN
                CREATE TABLE processing_results (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    result_type NVARCHAR(100) NOT NULL,
                    data NVARCHAR(MAX) NOT NULL,
                    created_at DATETIME2 NOT NULL,
                    processing_date NVARCHAR(50)
                )
            END
        """)
        
        # STEP 5: Save to database
        with db_manager.engine.connect() as conn:
            # Create table if needed
            conn.execute(create_results_table_query)
            conn.commit()
            
            # Delete previous results of the same type
            delete_query = text("DELETE FROM processing_results WHERE result_type = :result_type")
            conn.execute(delete_query, {"result_type": table_name})
            
            # Insert new result
            insert_query = text("""
                INSERT INTO processing_results (result_type, data, created_at, processing_date)
                VALUES (:result_type, :data, :created_at, :processing_date)
            """)
            
            conn.execute(insert_query, {
                "result_type": table_name,
                "data": json_data,
                "created_at": timestamp,
                "processing_date": timestamp.isoformat()
            })
            conn.commit()
            
        logger.info(f"✅ Successfully saved {table_name} to database")
        
    except Exception as e:
        logger.error(f"❌ Error saving {table_name} to database: {str(e)}")
        # Don't re-raise the exception with undefined variables
        raise Exception(f"Failed to save {table_name} to database: {str(e)}")

def read_previous_processed_data() -> Dict:
    """
    Read previously processed data from database
    This replaces reading the transactions.json file from blob storage
    """
    try:
        query = text("""
            SELECT data 
            FROM processing_results 
            WHERE result_type = 'transactions'
            ORDER BY created_at DESC
        """)
        
        with db_manager.engine.connect() as conn:
            result = conn.execute(query).fetchone()
            
            if result:
                previous_data = json.loads(result[0])
                logger.info("Successfully loaded previous processed data from database")
                return previous_data
            else:
                logger.warning("No previous processed data found in database")
                return {"transactions": [], "parked_measures": []}
                
    except Exception as e:
        logger.warning(f"Could not load previous data from database: {str(e)}")
        return {"transactions": [], "parked_measures": []}

# -----------------------------------------------------------------------------
# Main function - MODIFIED FOR DATABASE
# -----------------------------------------------------------------------------

def main() -> None:
    """
    Main function to process the daily data from database tables
    """
    start_time = time.time()
    logger.info('🚀 Database-integrated data processing started at: %s', datetime.now())
    
    try:
        # Step 0: Test database connection
        if not db_manager.test_connection():
            raise ConnectionError("Cannot connect to database")
        
        # Step 1: Extract data from database tables (REPLACES BLOB READING)
        logger.info("📊 Loading data from database tables...")
        sap_data = read_from_database("sap")
        msp_data = read_from_database("msp")
        mapping_floor = read_from_database("mapping_floor")
        mapping_hq = read_from_database("mapping_hq")
        
        # 🔧 ADD THIS: Final verification that all critical data has proper date handling
        logger.info("🔍 Final verification of date handling across all datasets...")
        sap_ok = verify_date_handling_in_dataframe(sap_data, "SAP_FINAL")
        msp_ok = verify_date_handling_in_dataframe(msp_data, "MSP_FINAL")
        
        if not sap_ok or not msp_ok:
            raise ValueError("❌ Date handling verification failed! Check logs above.")
        
        logger.info("✅ All date handling verification passed!")
        
        # Log column names for debugging
        logger.info(f"SAP data columns: {sap_data.columns.tolist()}")
        logger.info(f"MSP data columns: {msp_data.columns.tolist()}")
        logger.info(f"Mapping Floor columns: {mapping_floor.columns.tolist()}")
        logger.info(f"Mapping HQ columns: {mapping_hq.columns.tolist()}")
        
        # Retrieve previous processed data for comparison and tracking (FROM DATABASE)
        previous_data = read_previous_processed_data()
        
        # Step 2: Create indexes for faster lookups
        logger.info("🔍 Creating indexes for data lookups...")
        msp_index = create_msp_index(msp_data)
        mapping_index = create_mapping_index(mapping_floor, mapping_hq)
        previous_parked_index = create_previous_parked_index(previous_data)
        
        # Clear caches before processing
        kostenstelle_cache.clear()
        bestellnummer_cache.clear()
        department_cache.clear()
        
        # Step 3: Process data in batches with parallelization
        logger.info("⚡ Processing data in parallel batches...")
        processed_data = process_data_in_batches(
            sap_data, 
            msp_data, 
            msp_index,
            mapping_index, 
            previous_parked_index,
            previous_data
        )
        
        # Step 4: Save processed data to database (REPLACES BLOB SAVING)
        logger.info("💾 Saving processed data to database...")
        save_to_proper_database_tables(processed_data)
        
        # Step 5: Generate frontend-specific views (SAVES TO DATABASE)
        logger.info("🎨 Generating frontend views...")
        generate_frontend_views_to_database(processed_data)
        
        elapsed_time = time.time() - start_time
        logger.info('✅ Database-integrated processing completed successfully in %.2f seconds at: %s', 
                   elapsed_time, datetime.now())

        # Test new vs old structure
        logger.info("🧪 Running new vs old structure test...")
        test_new_vs_old_structure()
    
    except Exception as e:
        logger.error('❌ Error in data processing: %s', str(e), exc_info=True)
        raise
# -----------------------------------------------------------------------------
# MODIFIED FRONTEND VIEW GENERATION FOR DATABASE
# -----------------------------------------------------------------------------

def generate_frontend_views_to_database(processed_data: Dict) -> None:
    """
    Generate specialized views for frontend consumption and save to database
    REPLACES the blob storage approach with database storage
    """
    start_time = time.time()
    
    # 1. Department-level view with location type
    departments = {}
    
    # SAFETY CHECK: Ensure transactions is a list and contains valid dictionaries
    transactions = processed_data.get('transactions', [])
    if not isinstance(transactions, list):
        logger.error(f"Expected transactions to be a list, got {type(transactions)}")
        transactions = []
    
    for tx in transactions:
        # SAFETY CHECK: Ensure tx is a dictionary
        if not isinstance(tx, dict):
            logger.warning(f"Skipping invalid transaction item: {type(tx)} - {str(tx)[:100]}")
            continue
            
        # Get department with empty string fallback
        dept = tx.get('department', '')
        if not dept:
            continue
        
        # Get location type with 'Unknown' fallback
        location_type = tx.get('location_type', 'Unknown')
            
        # The key now includes the department name and location type
        dept_key = f"{dept}|{location_type}"
        
        if dept_key not in departments:
            departments[dept_key] = {
                'name': dept,
                'location_type': location_type,  # Add the location type
                'booked_amount': 0,
                'reserved_amount': 0,
                'regions': set()
            }
        
        # Add to appropriate budget category
        if tx.get('budget_impact') == 'Booked':
            amount_val = tx.get('amount', 0) or tx.get('actual_amount', 0)
            departments[dept_key]['booked_amount'] += safe_float_conversion(amount_val)
        elif tx.get('budget_impact') == 'Reserved':
            departments[dept_key]['reserved_amount'] += safe_float_conversion(tx.get('estimated_amount', 0))
            
        # Track regions - skip empty region values
        region = tx.get('region', '')
        if region:
            departments[dept_key]['regions'].add(region)
    
    # Convert to list and finalize
    departments_list = []
    for dept_key, dept_data in departments.items():
        dept_data['regions'] = list(dept_data['regions'])
        dept_data['total_amount'] = dept_data['booked_amount'] + dept_data['reserved_amount']
        departments_list.append(dept_data)
    
    # 2. Region-level view with location type
    regions = {}
    
    for tx in transactions:
        # SAFETY CHECK: Ensure tx is a dictionary
        if not isinstance(tx, dict):
            continue
            
        # Get region and department with empty string fallback
        region = tx.get('region', '')
        dept = tx.get('department', '')
        
        if not region or not dept:
            continue
        
        # Get location type with 'Unknown' fallback
        location_type = tx.get('location_type', 'Unknown')
            
        # The key now includes the department, region, and location type
        region_key = f"{dept}|{region}|{location_type}"
        
        if region_key not in regions:
            regions[region_key] = {
                'department': dept,
                'name': region,
                'location_type': location_type,  # Add the location type
                'booked_amount': 0,
                'reserved_amount': 0,
                'districts': set()
            }
        
        # Add to appropriate budget category
        if tx.get('budget_impact') == 'Booked':
            amount_val = tx.get('amount', 0) or tx.get('actual_amount', 0)
            regions[region_key]['booked_amount'] += safe_float_conversion(amount_val)
        elif tx.get('budget_impact') == 'Reserved':
            regions[region_key]['reserved_amount'] += safe_float_conversion(tx.get('estimated_amount', 0))
            
        # Track districts - skip empty district values
        district = tx.get('district', '')
        if district:
            regions[region_key]['districts'].add(district)
    
    # Convert to list and finalize
    regions_list = []
    for region_key, region_data in regions.items():
        region_data['districts'] = list(region_data['districts'])
        region_data['total_amount'] = region_data['booked_amount'] + region_data['reserved_amount']
        regions_list.append(region_data)
    
    # 3. Awaiting assignment view (UNASSIGNED measures grouped by department and location type)
    awaiting_assignment = {}
    
    # Look for UNASSIGNED_MEASURE transactions in all transactions (not just parked_measures)
    for transaction in transactions:
        # SAFETY CHECK: Ensure transaction is a dictionary
        if not isinstance(transaction, dict):
            continue
            
        # FIXED: Look for UNASSIGNED_MEASURE category instead of checking status
        if transaction.get('category') != 'UNASSIGNED_MEASURE':
            continue
            
        # Double-check status to be sure
        if transaction.get('status') != 'Awaiting Assignment':
            continue
            
        # Get department with empty string fallback
        dept = transaction.get('department', '')
        location_type = transaction.get('location_type', 'Unknown')
        
        if not dept:
            # If no department, put in 'Unassigned' category
            dept = 'Unassigned'
        
        # Use simple department name as key (not combined with location_type)
        # This is what the frontend expects based on your API structure
        if dept not in awaiting_assignment:
            awaiting_assignment[dept] = []
            
        # Create a safe version of the measure data
        safe_measure = {
            'measure_id': transaction.get('measure_id', ''),
            'bestellnummer': transaction.get('bestellnummer', 0),
            'measure_title': transaction.get('measure_title', ''),
            'estimated_amount': safe_float_conversion(transaction.get('estimated_amount', 0)),
            'measure_date': transaction.get('measure_date', ''),
            'department': dept,
            'location_type': location_type,
            'name': transaction.get('name', ''),
            'text': transaction.get('text', ''),  # Add text field
            'status': transaction.get('status', ''),
            'category': transaction.get('category', '')
        }
            
        awaiting_assignment[dept].append(safe_measure)
    
    # 4. BULLETPROOF Budget allocation preservation - MODIFIED FOR DATABASE
    logger.info("🔒 BULLETPROOF BUDGET PRESERVATION - Starting with database storage...")
    
    # STEP 1: Always load existing budget data FIRST (never start from scratch)
    try:
        existing_budget = read_budget_allocation_from_database()
        logger.info(f"✅ Loaded existing budget file with {len(existing_budget.get('departments', {}))} departments")
        
        # Ensure structure exists
        if 'departments' not in existing_budget:
            existing_budget['departments'] = {}
        if 'regions' not in existing_budget:
            existing_budget['regions'] = {}
            
    except Exception as e:
        logger.info(f"📝 No existing budget file found, creating new one: {str(e)}")
        existing_budget = {
            'departments': {},
            'regions': {},
            'last_updated': None
        }
    
    # STEP 2: PRESERVE ALL EXISTING BUDGET DATA (never overwrite non-zero budgets)
    preserved_departments = existing_budget['departments'].copy()
    preserved_regions = existing_budget['regions'].copy()
    
    logger.info(f"🔒 PRESERVING {len(preserved_departments)} existing department budgets")
    logger.info(f"🔒 PRESERVING {len(preserved_regions)} existing region budgets")
    
    # STEP 3: Only ADD new departments/regions with zero budgets (never modify existing)
    new_departments_added = 0
    new_regions_added = 0
    
    # Add new departments (only if they don't exist)
    for dept in departments_list:
        dept_key = f"{dept['name']}|{dept['location_type']}"
        
        if dept_key not in preserved_departments:
            preserved_departments[dept_key] = {
                'allocated_budget': 0,  # Only new departments get 0
                'location_type': dept['location_type']
            }
            new_departments_added += 1
            logger.info(f"➕ ADDED new department: {dept_key}")
        else:
            # Log that we're preserving existing budget
            existing_budget_amount = preserved_departments[dept_key].get('allocated_budget', 0)
            logger.info(f"🔒 PRESERVED department: {dept_key} (budget: €{existing_budget_amount:,.2f})")
    
    # Add new regions (only if they don't exist)
    for region in regions_list:
        region_key = f"{region['department']}|{region['name']}|{region['location_type']}"
        
        if region_key not in preserved_regions:
            preserved_regions[region_key] = {
                'allocated_budget': 0,  # Only new regions get 0
                'location_type': region['location_type']
            }
            new_regions_added += 1
            logger.info(f"➕ ADDED new region: {region_key}")
        else:
            # Log that we're preserving existing budget
            existing_budget_amount = preserved_regions[region_key].get('allocated_budget', 0)
            logger.info(f"🔒 PRESERVED region: {region_key} (budget: €{existing_budget_amount:,.2f})")
    
    # STEP 4: Create the final budget allocation (all existing data preserved)
    final_budget_allocation = {
        'departments': preserved_departments,
        'regions': preserved_regions,
        'last_updated': existing_budget.get('last_updated')  # Don't change timestamp unless budgets were actually modified
    }
    
    # STEP 5: Calculate preservation statistics
    total_preserved_budget = 0
    non_zero_departments = 0
    
    for dept_data in preserved_departments.values():
        budget = dept_data.get('allocated_budget', 0)
        if budget > 0:
            non_zero_departments += 1
            total_preserved_budget += budget
    
    logger.info(f"💰 BUDGET PRESERVATION SUMMARY:")
    logger.info(f"   - Preserved departments: {len(preserved_departments)}")
    logger.info(f"   - Departments with budgets: {non_zero_departments}")
    logger.info(f"   - Total preserved budget: €{total_preserved_budget:,.2f}")
    logger.info(f"   - New departments added: {new_departments_added}")
    logger.info(f"   - New regions added: {new_regions_added}")
    
    # STEP 6: Save with backup logic TO DATABASE
    try:
        # First, create a backup of the current budget allocation
        create_budget_backup_in_database()
        
        # Save the preserved budget data TO DATABASE
        save_budget_allocation_to_database(final_budget_allocation)
        logger.info(f"💾 Successfully saved budget data with ALL existing budgets preserved")
        
    except Exception as save_error:
        logger.error(f"❌ CRITICAL: Failed to save budget data: {str(save_error)}")
        raise  # Don't continue if we can't save budgets
    
    logger.info("🔒 BULLETPROOF BUDGET PRESERVATION - Completed successfully")
    
    # Save the views to database in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        executor.submit(save_to_database_as_json, "frontend_departments", {'departments': departments_list})
        executor.submit(save_to_database_as_json, "frontend_regions", {'regions': regions_list})
        executor.submit(save_to_database_as_json, "frontend_awaiting_assignment", awaiting_assignment)
    
    elapsed_time = time.time() - start_time
    logger.info(f"Generated frontend views in {elapsed_time:.2f} seconds")

# -----------------------------------------------------------------------------
# DATABASE BUDGET MANAGEMENT FUNCTIONS
# -----------------------------------------------------------------------------

def read_budget_allocation_from_database() -> Dict:
    """
    Read budget allocation data from database
    """
    try:
        query = text("""
            SELECT data 
            FROM processing_results 
            WHERE result_type = 'budget_allocation'
            ORDER BY created_at DESC
        """)
        
        with db_manager.engine.connect() as conn:
            result = conn.execute(query).fetchone()
            
            if result:
                budget_data = json.loads(result[0])
                logger.info("Successfully loaded budget allocation from database")
                return budget_data
            else:
                logger.warning("No budget allocation found in database")
                return {"departments": {}, "regions": {}, "last_updated": None}
                
    except Exception as e:
        logger.warning(f"Could not load budget allocation from database: {str(e)}")
        return {"departments": {}, "regions": {}, "last_updated": None}

def save_budget_allocation_to_database(budget_data: Dict) -> None:
    """
    Save budget allocation data to database
    """
    try:
        # Validate budget integrity first
        validate_budget_integrity(budget_data)
        
        # Save to database using the same mechanism as other results
        save_to_database_as_json("budget_allocation", budget_data)
        logger.info("✅ Budget allocation saved to database successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to save budget allocation: {str(e)}")
        raise

def create_budget_backup_in_database() -> str:
    """
    Create a timestamped backup of the current budget allocation in database
    """
    try:
        current_budget = read_budget_allocation_from_database()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"budget_allocation_backup_{timestamp}"
        
        # Save backup with timestamped name
        save_to_database_as_json(backup_name, current_budget)
        logger.info(f"✅ Budget backup created: {backup_name}")
        return backup_name
        
    except Exception as e:
        logger.error(f"❌ Failed to create budget backup: {str(e)}")
        return None

def validate_budget_integrity(budget_data):
    """
    Validate that budget data is not accidentally corrupted
    """
    if not isinstance(budget_data, dict):
        raise ValueError("Budget data must be a dictionary")
    
    if 'departments' not in budget_data or 'regions' not in budget_data:
        raise ValueError("Budget data missing required sections")
    
    # Check for reasonable budget values
    total_budget = 0
    for dept_data in budget_data['departments'].values():
        budget = dept_data.get('allocated_budget', 0)
        if budget < 0:
            raise ValueError(f"Negative budget found: {budget}")
        total_budget += budget
    
    # Log validation results
    logger.info(f"✅ Budget validation passed - Total budget: €{total_budget:,.2f}")
    return True

# -----------------------------------------------------------------------------
# Indexing functions (UNCHANGED - they work with DataFrames)
# -----------------------------------------------------------------------------

def create_msp_index(msp_data: pd.DataFrame) -> Dict[int, pd.Series]:
    """
    Create an index of MSP data by Bestellnummer for fast lookups
    """
    msp_index = {}
    
    for idx, row in msp_data.iterrows():
        bestellnummer = row['Bestellnummer']
        msp_index[bestellnummer] = row
        
    logger.info(f"Created MSP index with {len(msp_index)} entries")
    return msp_index

def create_mapping_index(mapping_floor: pd.DataFrame, mapping_hq: pd.DataFrame) -> Dict[str, LocationInfo]:
    """
    Create an index for Kostenstelle mapping with protection against NaN values
    """
    mapping_index = {}
    
    # Index HQ mappings (starting with 1)
    for _, row in mapping_hq.iterrows():
        # Account for the trailing space in the column name "Kostenstelle "
        kostenstelle_col = 'Kostenstelle ' if 'Kostenstelle ' in row.index else 'Kostenstelle'
        kostenstelle = str(safe_get(row, kostenstelle_col, '')).strip()
        
        # Skip empty kostenstelle
        if not kostenstelle:
            continue
            
        mapping_index[kostenstelle] = LocationInfo(
            department=safe_get(row, 'Abteilung', ''),  # Empty string as fallback
            region=safe_get(row, 'Bezeichnung', ''),    # Empty string as fallback
            district='HQ'                               # Always set district to HQ
        )
    
    # Index Floor mappings (starting with 3, extract digits 2-5)
    for _, row in mapping_floor.iterrows():
        extracted_digits = str(safe_get(row, 'Kostenstelle', '')).strip()
        
        # Skip empty kostenstelle
        if not extracted_digits:
            continue
            
        # We'll store with a special prefix to indicate it's for Floor
        mapping_index[f"FLOOR_{extracted_digits}"] = LocationInfo(
            department=safe_get(row, 'Department', ''),  # Empty string as fallback
            region=safe_get(row, 'Region', ''),          # Empty string as fallback
            district=safe_get(row, 'District', 'Floor')  # 'Floor' as fallback
        )
    
    logger.info(f"Created mapping index with {len(mapping_index)} entries")
    return mapping_index

def create_previous_parked_index(previous_data: Dict) -> Dict[int, Dict]:
    """
    Create an index of previously parked measures by Bestellnummer
    """
    previous_parked_index = {}
    
    for parked in previous_data.get('parked_measures', []):
        if 'bestellnummer' in parked:
            previous_parked_index[parked['bestellnummer']] = parked
    
    logger.info(f"Created index of {len(previous_parked_index)} previously parked measures")
    return previous_parked_index

# -----------------------------------------------------------------------------
# Batch processing functions (UNCHANGED - they work with DataFrames)
# -----------------------------------------------------------------------------

def process_data_in_batches(
    sap_data: pd.DataFrame, 
    msp_data: pd.DataFrame, 
    msp_index: Dict[int, pd.Series],
    mapping_index: Dict[str, LocationInfo], 
    previous_parked_index: Dict[int, Dict],
    previous_data: Dict
) -> Dict:
    """
    Process data in parallel batches for improved performance
    """
    # Initialize result containers
    direct_costs = []
    booked_measures = []
    outliers = []
    matched_bestellnummern = set()
    
    # Split SAP data into batches
    total_records = len(sap_data)
    num_batches = (total_records + BATCH_SIZE - 1) // BATCH_SIZE
    
    logger.info(f"Processing {total_records} SAP records in {num_batches} batches with {MAX_WORKERS} workers")
    
    # Process batches in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        
        for i in range(num_batches):
            start_idx = i * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, total_records)
            batch = sap_data.iloc[start_idx:end_idx]
            
            future = executor.submit(
                process_sap_batch, 
                batch, 
                msp_index,
                mapping_index,
                previous_parked_index
            )
            futures.append(future)
        
        # Collect results
        for future in concurrent.futures.as_completed(futures):
            batch_results = future.result()
            direct_costs.extend(batch_results['direct_costs'])
            booked_measures.extend(batch_results['booked_measures'])
            outliers.extend(batch_results['outliers'])
            matched_bestellnummern.update(batch_results['matched_bestellnummern'])
    
    # Process parked measures (unmatched MSP measures)
    parked_measures = process_parked_measures(
        msp_data, 
        matched_bestellnummern, 
        previous_parked_index
    )
    
    # Get placeholders from previous data (maintain them)
    placeholders = previous_data.get('placeholders', [])
    
    # Prepare the final result
    result = {
        'transactions': [*direct_costs, *booked_measures, *parked_measures, *placeholders],
        'direct_costs': direct_costs,
        'booked_measures': booked_measures,
        'parked_measures': parked_measures,
        'outliers': outliers,
        'placeholders': placeholders,
        'processing_date': datetime.now().isoformat(),
        'statistics': {
            'total_sap_transactions': len(sap_data),
            'total_msp_measures': len(msp_data),
            'direct_costs_count': len(direct_costs),
            'booked_measures_count': len(booked_measures),
            'parked_measures_count': len(parked_measures),
            'outliers_count': len(outliers),
            'placeholders_count': len(placeholders)
        }
    }
    
    return result

def process_sap_batch(
    batch: pd.DataFrame, 
    msp_index: Dict[int, pd.Series],
    mapping_index: Dict[str, LocationInfo],
    previous_parked_index: Dict[int, Dict]
) -> Dict:
    """
    Process a batch of SAP transactions with improved NaN handling
    """
    direct_costs = []
    booked_measures = []
    outliers = []
    matched_bestellnummern = set()
    
    for _, transaction in batch.iterrows():
        # Extract and process Kostenstelle
        kostenstelle = str(safe_get(transaction, 'Kostenstelle', ''))
        location_result = map_kostenstelle_cached(kostenstelle, mapping_index)
        
        if location_result is None:
            # Could not map Kostenstelle to location - create default LocationInfo
            location_info = LocationInfo('', '', '')
            location_type = 'Unknown'  # New field for location type
            
            outliers.append({
                'transaction_id': str(safe_get(transaction, 'Belegnummer', '')),
                'amount': safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0)),
                'kostenstelle': kostenstelle,
                'text': str(safe_get(transaction, 'Text', '')),
                'booking_date': str(safe_get(transaction, 'Buchungsdatum', '')),
                'category': 'OUTLIER',
                'status': 'Unknown Location',
                'budget_impact': 'None',
                'department': '',
                'region': '',
                'district': '',
                'location_type': location_type  # Add the location type field
            })
            continue
        
        # Unpack the location result tuple
        location_info, location_type = location_result
        
        # Extract Bestellnummer from Text field
        text_field = str(safe_get(transaction, 'Text', ''))
        bestellnummer = extract_bestellnummer_cached(text_field)
        
        if bestellnummer is None:
            # No valid Bestellnummer found
            direct_costs.append({
                'transaction_id': str(safe_get(transaction, 'Belegnummer', '')),
                'amount': safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0)),
                'text': text_field,
                'booking_date': str(safe_get(transaction, 'Buchungsdatum', '')),
                'category': 'DIRECT_COST',
                'status': 'Direct Booked',
                'budget_impact': 'Booked',
                'department': location_info.department or '',
                'region': location_info.region or '',
                'district': location_info.district or '',
                'location_type': location_type  # Add the location type field
            })
            continue
        
        # Look for matching Bestellnummer in MSP data
        matching_measure = msp_index.get(bestellnummer)
        
        if matching_measure is None:
            # Valid Bestellnummer, but no matching MSP measure
            direct_costs.append({
                'transaction_id': str(safe_get(transaction, 'Belegnummer', '')),
                'amount': safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0)),
                'text': text_field,
                'booking_date': str(safe_get(transaction, 'Buchungsdatum', '')),
                'category': 'DIRECT_COST',
                'status': 'Direct Booked',
                'budget_impact': 'Booked',
                'department': location_info.department or '',
                'region': location_info.region or '',
                'district': location_info.district or '',
                'location_type': location_type  # Add the location type field
            })
            continue
        
        # Match found - link transaction with MSP measure
        matched_bestellnummern.add(bestellnummer)
        
        # Check if this was previously a parked measure
        previously_parked = bestellnummer in previous_parked_index
        
        # Get estimated and actual amounts with safe conversion
        estimated_amount = safe_float_conversion(safe_get(matching_measure, 'Benötigtes Budget (Geschätzt)', 0))
        actual_amount = safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0))
        
        # Create dictionary with safe handling for all fields
        measure_data = {k: None if pd.isna(v) else v for k, v in matching_measure.to_dict().items()}
        transaction_data = {k: None if pd.isna(v) else v for k, v in transaction.to_dict().items()}
        
        booked_measures.append({
            'transaction_id': str(safe_get(transaction, 'Belegnummer', '')),
            'measure_id': str(bestellnummer),
            'bestellnummer': int(bestellnummer),
            'measure_title': safe_get(matching_measure, 'Titel der Maßnahme', ''),
            'estimated_amount': estimated_amount,
            'actual_amount': actual_amount,
            'variance': actual_amount - estimated_amount,
            'text': text_field,
            'booking_date': str(safe_get(transaction, 'Buchungsdatum', '')),
            'measure_date': str(safe_get(matching_measure, 'Datum', '')),
            'category': 'BOOKED_MEASURE',
            'status': 'SAP-MSP Booked',
            'previously_parked': previously_parked,
            'budget_impact': 'Booked',
            'department': location_info.department or '',
            'region': location_info.region or '',
            'district': location_info.district or '',
            'location_type': location_type,  # Add the location type field
            'msp_data': measure_data,
            'sap_data': transaction_data
        })
    
    return {
        'direct_costs': direct_costs,
        'booked_measures': booked_measures,
        'outliers': outliers,
        'matched_bestellnummern': matched_bestellnummern
    }

# -----------------------------------------------------------------------------
# TEST FUNCTION FOR VALIDATION
# -----------------------------------------------------------------------------

def test_new_vs_old_structure():
    """Test ob neue und alte Struktur gleiche Daten liefern"""
    try:
        # Alte Methode (JSON)
        old_data = get_processed_data_from_database("transactions")
        old_parked_count = len(old_data.get('parked_measures', []))
        
        # Neue Methode (SQL Tabelle)
        new_data = get_parked_measures_from_table()
        new_parked_count = len(new_data)
        
        logger.info(f"📊 Old JSON method: {old_parked_count} parked measures")
        logger.info(f"📊 New table method: {new_parked_count} parked measures")
        
        if old_parked_count == new_parked_count:
            logger.info("✅ Both methods return same count - migration successful!")
            return True
        else:
            logger.warning(f"⚠️ Count mismatch - investigate differences")
            return False
            
    except Exception as e:
        logger.error(f"❌ Test failed: {str(e)}")
        return False

def process_parked_measures(
    msp_data: pd.DataFrame, 
    matched_bestellnummern: Set[int],
    previous_parked_index: Dict[int, Dict]
) -> List[Dict]:
    """
    Process unmatched MSP measures with improved NaN handling and correct categorization
    """
    parked_measures = []
    
    for _, measure in msp_data.iterrows():
        bestellnummer = safe_get(measure, 'Bestellnummer')
        
        if bestellnummer is None:
            continue
            
        if bestellnummer not in matched_bestellnummern:
            # This measure has no matching SAP transaction yet
            # Check if it was previously parked and has manual assignment
            manual_assignment = None
            previous_location_type = None
            
            if bestellnummer in previous_parked_index:
                if 'manual_assignment' in previous_parked_index[bestellnummer]:
                    manual_assignment = previous_parked_index[bestellnummer]['manual_assignment']
                # Get the location_type from previous data if available
                if 'location_type' in previous_parked_index[bestellnummer]:
                    previous_location_type = previous_parked_index[bestellnummer]['location_type']
            
            # Extract department from Gruppen field
            gruppen = safe_get(measure, 'Gruppen', '')
            department = extract_department_from_gruppen_cached(gruppen)
            
            # Determine location type based on previous data or department name
            if previous_location_type:
                location_type = previous_location_type
            else:
                # Infer location type from department name
                location_type = infer_location_type_from_department(department)
            
            # Use safe conversion for estimated amount
            estimated_amount = safe_float_conversion(safe_get(measure, 'Benötigtes Budget (Geschätzt)', 0))
            
            # Create dictionary with safe handling for all fields
            measure_data = {k: None if pd.isna(v) else v for k, v in measure.to_dict().items()}
            
            # FIXED: Determine correct category and status based on assignment
            if manual_assignment:
                category = 'PARKED_MEASURE'
                status = 'Manually assigned, awaiting SAP'
                region = manual_assignment.get('region', '')
                district = manual_assignment.get('district', '')
            else:
                category = 'UNASSIGNED_MEASURE'  # ← NEW CATEGORY
                status = 'Awaiting Assignment'
                region = ''
                district = ''
            
            parked_measure = {
                'measure_id': str(bestellnummer),
                'bestellnummer': int(bestellnummer),
                'measure_title': safe_get(measure, 'Titel der Maßnahme', ''),
                'estimated_amount': estimated_amount,
                'measure_date': str(safe_get(measure, 'Datum', '')),
                'name': safe_get(measure, 'Name', ''),
                'category': category,  # ← FIXED: Now correctly categorized
                'status': status,      # ← FIXED: Now correctly set
                'budget_impact': 'Reserved',
                'department': department,
                'region': region,      # ← FIXED: Empty until assigned
                'district': district,  # ← FIXED: Empty until assigned
                'location_type': location_type,
                'manual_assignment': manual_assignment,
                'msp_data': measure_data
            }
                
            parked_measures.append(parked_measure)
    
    return parked_measures

def infer_location_type_from_department(department: str) -> str:
    """
    Infer the location type (Floor or HQ) from department name
    """
    if not department:
        return 'Unknown'
        
    # Department names that indicate Floor departments
    # This is just an example, you'll need to customize this based on your actual department names
    floor_department_indicators = [
        'Abteilung Baden-Württemberg',
        'Abteilung Schleswig-Holstein',
        'Abteilung Mecklenburg-Vorpommern',
        'Abteilung Nordrhein-Westfalen',
        'Abteilung Sachsen-Anhalt',
        'Abteilung Hessen',
        'Abteilung Bayern',
        'BW',
        'SH',
        'MV',
        'NRW',
        'ST',
        'HE',
        'BY'
    ]
    
    # Check if any of the floor department indicators are in the department name
    for indicator in floor_department_indicators:
        if indicator in department:
            return 'Floor'
    
    # If it contains 'HV' or 'Hauptverwaltung', it's HQ
    if 'HV' in department or 'Hauptverwaltung' in department:
        return 'HQ'
    
    # Default to Unknown if we can't determine
    return 'Unknown'

# -----------------------------------------------------------------------------
# Cached helper functions (FIXED - removed excessive logging)
# -----------------------------------------------------------------------------

@functools.lru_cache(maxsize=1024)
def extract_bestellnummer_cached(text_field: str) -> Optional[int]:
    """
    Extract 4-digit Bestellnummer (≥3000) from text field with caching
    """
    # Check cache first
    cached_result = bestellnummer_cache.get(text_field)
    if cached_result is not None:
        return cached_result
    
    # Cache miss - compute result
    # Find all 4-digit numbers in the text
    matches = re.findall(r'\b\d{4}\b', text_field)
    
    # Filter for numbers ≥3000
    valid_numbers = [int(num) for num in matches if int(num) >= 3000]
    
    result = valid_numbers[0] if valid_numbers else None
    
    # Cache the result
    bestellnummer_cache.set(text_field, result)
    return result

def map_kostenstelle_cached(kostenstelle: str, mapping_index: Dict[str, LocationInfo]) -> Optional[Tuple[LocationInfo, str]]:
    """
    Map Kostenstelle to location information with caching
    Returns a tuple of (LocationInfo, location_type) where location_type is 'Floor' or 'HQ'
    """
    # Check cache first
    cached_result = kostenstelle_cache.get(kostenstelle)
    if cached_result is not None:
        return cached_result
    
    # Cache miss - compute result
    # Ensure kostenstelle is a string without decimal part
    if not kostenstelle:
        return None
    
    # Strip any decimal portion and whitespace
    kostenstelle = str(kostenstelle).strip()
    if '.' in kostenstelle:
        kostenstelle = kostenstelle.split('.')[0]
    
    # Ensure we have at least 5 digits
    if len(kostenstelle) < 5:
        return None
    
    location_type = None  # Will be set to 'Floor' or 'HQ'
    
    if kostenstelle.startswith('1'):
        # HQ Kostenstelle - use full 8-digit number
        result = mapping_index.get(kostenstelle)
        location_type = 'HQ'
    
    elif kostenstelle.startswith('3'):
        # Floor Kostenstelle - extract digits 2-6 (to get the 5 digits after the leading '3')
        # For example: 35020400 → 50204
        extracted_digits = kostenstelle[1:6]
        
        # First try direct lookup
        result = mapping_index.get(extracted_digits)
        
        # If not found, try with FLOOR_ prefix (depending on how you created your index)
        if result is None:
            result = mapping_index.get(f"FLOOR_{extracted_digits}")
            
        # If still not found, try some error correction (like removing leading zeros)
        if result is None:
            # Try without leading zeros
            stripped_digits = extracted_digits.lstrip('0')
            result = mapping_index.get(stripped_digits)
            if result is None:
                result = mapping_index.get(f"FLOOR_{stripped_digits}")
        
        if result is not None:
            location_type = 'Floor'
    
    else:
        result = None
    
    # Prepare the result (both location info and type)
    final_result = (result, location_type) if result is not None else None
    
    # Cache the result
    kostenstelle_cache.set(kostenstelle, final_result)
    return final_result

def extract_department_from_gruppen_cached(gruppen_field: str) -> Optional[str]:
    """
    Extract department information from Gruppen field with caching
    """
    if pd.isna(gruppen_field) or not gruppen_field:
        return ''  # Return empty string instead of None
        
    gruppen_field = str(gruppen_field)
    
    # Check cache first
    cached_result = department_cache.get(gruppen_field)
    if cached_result is not None:
        return cached_result
    
    # Cache miss - compute result
    # Department mapping
    department_mapping = {
        'BW': 'Abteilung Baden-Württemberg (BW)',
        'SH/Ni/HH/HB': 'Abteilung Schleswig-Holstein, Niedersachsen, Hamburg, Bremen (SH/Ni/HH/HB)',
        'MV/BB/BE': 'Abteilung Mecklenburg-Vorpommern, Brandenburg, Berlin (MV/BB/BE)',
        'NRW Nord': 'Abteilung Nordrhein-Westfalen Nord (NRW Nord)',
        'NRW Süd': 'Abteilung Nordrhein-Westfalen Süd (NRW Süd)',
        'ST/TH/SN': 'Abteilung Sachsen-Anhalt, Thüringen, Sachsen (ST/TH/SN)',
        'HE/RP/SL': 'Abteilung Hessen, Rheinland-Pfalz, Saarland (HE/RP/SL)',
        'BY': 'Abteilung Bayern (BY)'
    }
    
    # Split the Gruppen field by commas or similar delimiters
    gruppen_entries = [entry.strip() for entry in gruppen_field.split(',')]
    
    # Count department occurrences
    department_counts = {}
    
    for entry in gruppen_entries:
        # Clean up the entry and look for department codes
        entry = entry.replace('Kundenbetreuungsregion', '').replace('Vertriebsregion', '').strip()
        
        for code in department_mapping.keys():
            if f"Abteilung {code}" in entry:
                if code in department_counts:
                    department_counts[code] += 1
                else:
                    department_counts[code] = 1
                break
    
    if not department_counts:
        result = ''  # Return empty string instead of None
    # If only one department found
    elif len(department_counts) == 1:
        dept_code = list(department_counts.keys())[0]
        result = department_mapping[dept_code]
    else:
        # If multiple departments found, return the one with highest count
        max_count = 0
        most_frequent_dept = None
        
        for dept, count in department_counts.items():
            if count > max_count:
                max_count = count
                most_frequent_dept = dept
        
        result = department_mapping.get(most_frequent_dept, '')  # Empty string as fallback
    
    # Cache the result
    department_cache.set(gruppen_field, result)
    return result

# -----------------------------------------------------------------------------
# API FUNCTIONS FOR EXTERNAL ACCESS
# -----------------------------------------------------------------------------

def get_processed_data_from_database(result_type: str = "transactions") -> Dict:
    """
    API function to retrieve processed data from database
    """
    try:
        query = text("""
            SELECT data 
            FROM processing_results 
            WHERE result_type = :result_type
            ORDER BY created_at DESC
        """)
        
        with db_manager.engine.connect() as conn:
            result = conn.execute(query, {"result_type": result_type}).fetchone()
            
            if result:
                data = json.loads(result[0])
                logger.info(f"Retrieved {result_type} data from database")
                return data
            else:
                logger.warning(f"No {result_type} data found in database")
                return {}
                
    except Exception as e:
        logger.error(f"Error retrieving {result_type} data: {str(e)}")
        raise

def get_all_available_results() -> List[str]:
    """
    Get list of all available result types in the database
    """
    try:
        query = text("""
            SELECT DISTINCT result_type, MAX(created_at) as latest
            FROM processing_results 
            GROUP BY result_type
            ORDER BY latest DESC
        """)
        
        with db_manager.engine.connect() as conn:
            results = conn.execute(query).fetchall()
            return [row[0] for row in results]
            
    except Exception as e:
        logger.error(f"Error getting available results: {str(e)}")
        return []

def test_date_handling():
    """Test that date handling works correctly"""
    logger.info("🧪 Testing date handling fix...")
    
    try:
        # Read MSP data (the problematic one)
        msp_data = read_from_database("msp")
        
        # Check specific date columns
        for col in ['Datum', 'datum']:  # Check both mapped and original names
            if col in msp_data.columns:
                sample_dates = msp_data[col].dropna().head(3).tolist()
                logger.info(f"📅 {col} samples: {sample_dates}")
                logger.info(f"📅 {col} types: {[type(d).__name__ for d in sample_dates]}")
                
                # Verify they're strings, not datetime objects
                for date_val in sample_dates:
                    if 'datetime' in str(type(date_val)):
                        logger.error(f"❌ Found datetime object in {col}: {date_val} ({type(date_val)})")
                        return False
                    else:
                        logger.info(f"✅ Proper string date: {date_val} ({type(date_val)})")
        
        # Test JSON serialization
        logger.info("🧪 Testing JSON serialization...")
        test_record = msp_data.iloc[0].to_dict()
        json_str = json.dumps(test_record, cls=JSONEncoder)
        logger.info(f"✅ JSON serialization successful: {len(json_str)} characters")
        
        # Check for problematic datetime strings in JSON
        if 'datetime.date(' in json_str:
            logger.error(f"❌ Found datetime.date() in JSON: {json_str[:200]}...")
            return False
        
        logger.info("✅ Date handling test passed!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Date handling test failed: {str(e)}")
        return False
# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    try:
        # Check if database password is set
        if not DB_PASSWORD:
            print("❌ ERROR: DB_PASSWORD environment variable not set!")
            print("\nPlease set the database password using one of these methods:")
            print("1. Command Prompt: set DB_PASSWORD=your_password")
            print("2. PowerShell: $env:DB_PASSWORD=\"your_password\"")
            print("3. Add to Windows Environment Variables permanently")
            print("\nAlternatively, you can set it in the script temporarily for testing:")
            print("Add this line after the imports: os.environ['DB_PASSWORD'] = 'your_password'")
            exit(1)
        
        logger.info(f"🔐 Using database password: {'*' * len(str(DB_PASSWORD))}")
        
        # Test database connection first
        logger.info("🔌 Testing database connection...")
        if not db_manager.test_connection():
            logger.error("❌ Database connection test failed!")
            exit(1)
        
        # 🔧 ADD THIS: Test date handling BEFORE running main processing
        logger.info("🧪 Running date handling test...")
        if not test_date_handling():
            logger.error("❌ Date handling test failed! Fix date issues before processing.")
            exit(1)
        
        # Run the main processing function
        main()
        
        # Optional: Print summary of available results
        available_results = get_all_available_results()
        logger.info(f"✅ Available results in database: {available_results}")
        
    except Exception as e:
        logger.error(f"💥 Fatal error in main execution: {str(e)}", exc_info=True)
        exit(1)
