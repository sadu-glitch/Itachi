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
import hashlib  # Add this at the top with other imports
from typing import Optional, Dict, List, Tuple

class IncrementalProcessor:
    """Handles incremental data processing logic"""
    
    def __init__(self, db_manager):
        self.db_manager = db_manager
    
    def create_tracking_tables(self):
        """Create tables to track processed data - SAFE TO RUN MULTIPLE TIMES"""
        
        create_tracking_query = text("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'processing_tracking')
            BEGIN
                CREATE TABLE processing_tracking (
                    [id] INT IDENTITY(1,1) PRIMARY KEY,
                    [table_name] NVARCHAR(100) NOT NULL,
                    [record_id] NVARCHAR(100) NOT NULL,
                    [record_hash] NVARCHAR(64) NOT NULL,
                    [batch_id] NVARCHAR(100) NOT NULL,
                    [processed_date] DATETIME2 DEFAULT GETDATE() NOT NULL,
                    [last_modified] DATETIME2 NOT NULL
                )
                
                CREATE UNIQUE INDEX IX_processing_tracking_unique 
                ON processing_tracking(table_name, record_id)
                
                CREATE INDEX IX_processing_tracking_batch 
                ON processing_tracking(batch_id)
                
                PRINT '✅ Created processing_tracking table'
            END
            ELSE
            BEGIN
                PRINT '✅ processing_tracking table already exists'
            END
        """)
        
        create_sessions_query = text("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'processing_sessions')
            BEGIN
                CREATE TABLE processing_sessions (
                    [session_id] NVARCHAR(100) PRIMARY KEY,
                    [processing_mode] NVARCHAR(20) NOT NULL,
                    [start_time] DATETIME2 NOT NULL,
                    [end_time] DATETIME2 NULL,
                    [status] NVARCHAR(20) NOT NULL,
                    [records_processed] INT DEFAULT 0,
                    [new_records] INT DEFAULT 0,
                    [updated_records] INT DEFAULT 0,
                    [error_message] NVARCHAR(MAX) NULL
                )
                
                PRINT '✅ Created processing_sessions table'
            END
            ELSE
            BEGIN
                PRINT '✅ processing_sessions table already exists'
            END
        """)
        
        try:
            with self.db_manager.engine.connect() as conn:
                conn.execute(create_tracking_query)
                conn.execute(create_sessions_query)
                conn.commit()
                logger.info("✅ Incremental processing tables ready")
        except Exception as e:
            logger.error(f"❌ Error creating tracking tables: {str(e)}")
            raise
    
    def get_record_hash(self, record: pd.Series) -> str:
        """Generate hash for a record to detect changes"""
        key_fields = []
        for col, val in record.items():
            if pd.notna(val):
                key_fields.append(f"{col}:{str(val)}")
        
        content = "|".join(sorted(key_fields))
        return hashlib.sha256(content.encode()).hexdigest()
    
    def get_new_and_changed_records(self, table_name: str, current_data: pd.DataFrame, 
                                   id_column: str) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Identify new, changed, and unchanged records
        Returns: (new_records, changed_records, unchanged_records)
        """
        
        try:
            query = text("""
                SELECT record_id, record_hash, processed_date
                FROM processing_tracking 
                WHERE table_name = :table_name
            """)
            
            with self.db_manager.engine.connect() as conn:
                previous_df = pd.read_sql_query(query, conn, params={"table_name": table_name})
            
            if previous_df.empty:
                logger.info(f"🆕 First processing run for {table_name} - all {len(current_data)} records are new")
                return current_data, pd.DataFrame(), pd.DataFrame()
            
            previous_hashes = dict(zip(previous_df['record_id'], previous_df['record_hash']))
            
            new_records = []
            changed_records = []
            unchanged_records = []
            
            for idx, record in current_data.iterrows():
                record_id = str(record[id_column])
                current_hash = self.get_record_hash(record)
                
                if record_id not in previous_hashes:
                    new_records.append(record)
                elif previous_hashes[record_id] != current_hash:
                    changed_records.append(record)
                else:
                    unchanged_records.append(record)
            
            new_df = pd.DataFrame(new_records) if new_records else pd.DataFrame()
            changed_df = pd.DataFrame(changed_records) if changed_records else pd.DataFrame()
            unchanged_df = pd.DataFrame(unchanged_records) if unchanged_records else pd.DataFrame()
            
            logger.info(f"📊 {table_name}: {len(new_df)} new, {len(changed_df)} changed, {len(unchanged_df)} unchanged")
            
            return new_df, changed_df, unchanged_df
            
        except Exception as e:
            logger.warning(f"⚠️ Error in incremental analysis for {table_name}: {str(e)}")
            logger.info(f"🔄 Falling back to full processing for {table_name}")
            return current_data, pd.DataFrame(), pd.DataFrame()

    def update_processing_tracking(self, table_name: str, processed_records: pd.DataFrame, 
                                 id_column: str, batch_id: str):
        """Update tracking table with processed records"""
        
        if processed_records.empty:
            return
            
        tracking_records = []
        for idx, record in processed_records.iterrows():
            tracking_records.append({
                'table_name': table_name,
                'record_id': str(record[id_column]),
                'record_hash': self.get_record_hash(record),
                'batch_id': batch_id,
                'last_modified': datetime.now()
            })
        
        try:
            with self.db_manager.engine.connect() as conn:
                for tracking_record in tracking_records:
                    merge_query = text("""
                        MERGE processing_tracking AS target
                        USING (VALUES (:table_name, :record_id, :record_hash, :batch_id, :last_modified)) 
                            AS source (table_name, record_id, record_hash, batch_id, last_modified)
                        ON target.table_name = source.table_name AND target.record_id = source.record_id
                        WHEN MATCHED THEN
                            UPDATE SET record_hash = source.record_hash, 
                                     batch_id = source.batch_id,
                                     last_modified = source.last_modified,
                                     processed_date = GETDATE()
                        WHEN NOT MATCHED THEN
                            INSERT (table_name, record_id, record_hash, batch_id, last_modified)
                            VALUES (source.table_name, source.record_id, source.record_hash, 
                                   source.batch_id, source.last_modified);
                    """)
                    
                    conn.execute(merge_query, tracking_record)
                conn.commit()
                
                logger.info(f"✅ Updated tracking for {len(tracking_records)} {table_name} records")
                
        except Exception as e:
            logger.error(f"❌ Error updating tracking for {table_name}: {str(e)}")

# Initialize incremental processor globally
incremental_processor = None

def get_incremental_processor():
    """Get or create incremental processor instance"""
    global incremental_processor
    if incremental_processor is None:
        incremental_processor = IncrementalProcessor(db_manager)
    return incremental_processor



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sap_msp_processor")

# -----------------------------------------------------------------------------
# DATABASE CONFIGURATION
# -----------------------------------------------------------------------------

# Database connection parameters
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"
DB_USER = "msp_admin"
DB_PASSWORD = os.getenv("DB_PASSWORD")  # Set this environment variable

# Processing constants
BATCH_SIZE = 1000
MAX_WORKERS = 8
CACHE_EXPIRY = 3600

# -----------------------------------------------------------------------------
# HELPER FUNCTIONS
# -----------------------------------------------------------------------------

def safe_float_conversion(value):
    """Safely convert value to float, handling European formats"""
    if pd.isna(value):
        return 0.0
        
    str_value = str(value).strip()
    if not str_value:
        return 0.0
    
    # Remove currency symbols, keep only digits, comma, dot, minus
    cleaned = ""
    for char in str_value:
        if char.isdigit() or char in [',', '.', '-']:
            cleaned += char
    
    if not cleaned:
        return 0.0
    
    try:
        return float(cleaned)
    except ValueError:
        try:
            # European format handling
            if ',' in cleaned and '.' in cleaned:
                last_dot = cleaned.rindex('.')
                last_comma = cleaned.rindex(',')
                
                if last_dot > last_comma:
                    # US format: remove commas
                    cleaned = cleaned.replace(',', '')
                else:
                    # European format: replace dots, comma becomes decimal
                    cleaned = cleaned.replace('.', '')
                    cleaned = cleaned.replace(',', '.')
            else:
                # Only comma exists, treat as decimal separator
                cleaned = cleaned.replace(',', '.')
                
            return float(cleaned)
        except (ValueError, IndexError):
            logger.warning(f"Could not convert '{str_value}' to float, using 0")
            return 0.0

def safe_get(row, column, default=None):
    """Safely get value from pandas row"""
    if column not in row or pd.isna(row[column]):
        return default
    return row[column]

def make_json_serializable(obj, _seen=None):
    """Convert objects to JSON serializable format with circular reference protection"""
    if _seen is None:
        _seen = set()
    
    obj_id = id(obj)
    if obj_id in _seen:
        return f"<Circular Reference: {type(obj).__name__}>"
    
    if isinstance(obj, (dict, list, pd.Series, pd.DataFrame)):
        _seen.add(obj_id)
    
    try:
        if isinstance(obj, pd.Timestamp):
            return obj.strftime('%Y-%m-%d %H:%M:%S')
        elif isinstance(obj, pd.Series):
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
            try:
                return {k: make_json_serializable(v, _seen.copy()) for k, v in obj.__dict__.items() 
                       if not k.startswith('_')}
            except:
                return str(obj)
        else:
            return obj
    except Exception as e:
        return str(obj) if obj is not None else None
    finally:
        if obj_id in _seen:
            _seen.discard(obj_id)

class JSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for pandas and numpy types"""
    def default(self, obj):
        if isinstance(obj, float):
            if np.isnan(obj):
                return None
            elif np.isinf(obj) and obj > 0:
                return "Infinity"
            elif np.isinf(obj) and obj < 0:
                return "-Infinity"
        
        try:
            return make_json_serializable(obj)
        except Exception as e:
            return str(obj) if obj is not None else None

# -----------------------------------------------------------------------------
# DATABASE MANAGER
# -----------------------------------------------------------------------------

class DatabaseManager:
    """Manages database connections and operations"""
    
    def __init__(self):
        self.connection_string = None
        self.engine = None
        self._setup_connection()
    
    def _setup_connection(self):
        """Setup database connection"""
        try:
            if not DB_PASSWORD:
                raise ValueError("DB_PASSWORD environment variable is not set")
            
            # SQLAlchemy connection string
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
        """Test database connection"""
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
        """Read table data as pandas DataFrame"""
        try:
            if batch_id:
                query = f"SELECT * FROM {table_name} WHERE batch_id = '{batch_id}'"
            else:
                query = f"SELECT * FROM {table_name}"
            
            df = pd.read_sql_query(query, self.engine)
            df = df.copy(deep=True)
            
            if column_mapping:
                df = df.rename(columns=column_mapping)
            
            df = df.reset_index(drop=True)
            logger.info(f"Read {len(df)} records from {table_name}")
            return df
            
        except Exception as e:
            logger.error(f"Error reading {table_name}: {str(e)}")
            raise

# Initialize database manager
db_manager = DatabaseManager()

# -----------------------------------------------------------------------------
# COLUMN MAPPINGS
# -----------------------------------------------------------------------------

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
    'name_field': 'Name'
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
    'kostenstelle': 'Kostenstelle '  # Note the trailing space
}

# -----------------------------------------------------------------------------
# DATA MODELS
# -----------------------------------------------------------------------------

class LocationInfo:
    """Store location information"""
    
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
# CACHE IMPLEMENTATION
# -----------------------------------------------------------------------------

class Cache:
    """Simple in-memory cache with expiry"""
    
    def __init__(self, expiry_seconds=3600):
        self._cache = {}
        self._timestamps = {}
        self._expiry_seconds = expiry_seconds
    
    def get(self, key):
        if key not in self._cache:
            return None
            
        timestamp = self._timestamps.get(key, 0)
        if time.time() - timestamp > self._expiry_seconds:
            del self._cache[key]
            del self._timestamps[key]
            return None
            
        return self._cache[key]
    
    def set(self, key, value):
        self._cache[key] = value
        self._timestamps[key] = time.time()
    
    def clear(self):
        self._cache.clear()
        self._timestamps.clear()

# Initialize caches
kostenstelle_cache = Cache(CACHE_EXPIRY)
bestellnummer_cache = Cache(CACHE_EXPIRY)
department_cache = Cache(CACHE_EXPIRY)

# -----------------------------------------------------------------------------
# DATA LOADING FUNCTIONS (DATABASE-ONLY)
# -----------------------------------------------------------------------------

def read_from_database(table_type: str) -> pd.DataFrame:
    """Read data from database tables based on table type"""
    logger.info(f"Reading {table_type} data from database...")
    
    if table_type == "sap":
        latest_batch = db_manager.get_latest_batch_id("sap_transactions", "BULK_IMPORT_%")
        if not latest_batch:
            raise ValueError("No SAP data found in database")
        df = db_manager.read_table_as_dataframe("sap_transactions", latest_batch, SAP_COLUMN_MAPPING)
        
    elif table_type == "msp":
        latest_batch = db_manager.get_latest_batch_id("msp_measures", "MSP_%")
        if not latest_batch:
            raise ValueError("No MSP data found in database")
        df = db_manager.read_table_as_dataframe("msp_measures", latest_batch, MSP_COLUMN_MAPPING)
        
    elif table_type == "mapping_floor":
        latest_batch = db_manager.get_latest_batch_id("kostenstelle_mapping_floor", "BULK_IMPORT_%")
        if not latest_batch:
            raise ValueError("No Floor mapping data found in database")
        df = db_manager.read_table_as_dataframe("kostenstelle_mapping_floor", latest_batch, FLOOR_MAPPING_COLUMNS)
        
    elif table_type == "mapping_hq":
        latest_batch = db_manager.get_latest_batch_id("kostenstelle_mapping_hq", "HQ_FIX_%")
        if not latest_batch:
            raise ValueError("No HQ mapping data found in database")
        df = db_manager.read_table_as_dataframe("kostenstelle_mapping_hq", latest_batch, HQ_MAPPING_COLUMNS)
        
    else:
        raise ValueError(f"Unknown table type: {table_type}")
    
    return df
def read_from_database_with_incremental(table_type: str, force_full: bool = False) -> Dict:
    """
    Enhanced data reading with optional incremental processing
    Falls back to full processing if incremental fails
    """
    
    # Generate session ID for tracking
    session_id = f"SESSION_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{table_type}"
    processing_mode = "FULL" if force_full else "INCREMENTAL"
    
    logger.info(f"📖 Reading {table_type} data in {processing_mode} mode...")
    
    try:
        # Initialize incremental processor
        processor = get_incremental_processor()
        processor.create_tracking_tables()
        
        # Start processing session tracking
        start_session_query = text("""
            INSERT INTO processing_sessions (session_id, processing_mode, start_time, status)
            VALUES (:session_id, :processing_mode, :start_time, 'RUNNING')
        """)
        
        with db_manager.engine.connect() as conn:
            conn.execute(start_session_query, {
                "session_id": session_id,
                "processing_mode": processing_mode,
                "start_time": datetime.now()
            })
            conn.commit()
        
        # Read current data using existing function
        current_data = read_from_database(table_type)
        
        # Determine ID column for each table type
        id_columns = {
            "sap": "Belegnummer",
            "msp": "Bestellnummer", 
            "mapping_floor": "Kostenstelle",
            "mapping_hq": "Kostenstelle "  # Note the trailing space
        }
        
        id_column = id_columns.get(table_type)
        if not id_column:
            raise ValueError(f"Unknown table type: {table_type}")
        
        if force_full:
            # Full processing mode
            new_records = current_data
            changed_records = pd.DataFrame()
            unchanged_records = pd.DataFrame()
            processing_needed = current_data
            logger.info(f"🔄 FULL mode: processing all {len(processing_needed)} {table_type} records")
        else:
            # Incremental processing mode
            new_records, changed_records, unchanged_records = processor.get_new_and_changed_records(
                table_type, current_data, id_column
            )
            
            processing_needed = pd.concat([new_records, changed_records], ignore_index=True)
            
            if processing_needed.empty:
                logger.info(f"✅ No new or changed {table_type} data found")
            else:
                logger.info(f"⚡ INCREMENTAL mode: processing {len(processing_needed)} {table_type} records")
        
        # Update tracking for processed records
        if not processing_needed.empty:
            # Get latest batch ID
            table_mapping = {
                "sap": ("sap_transactions", "BULK_IMPORT_%"),
                "msp": ("msp_measures", "MSP_%"),
                "mapping_floor": ("kostenstelle_mapping_floor", "BULK_IMPORT_%"),
                "mapping_hq": ("kostenstelle_mapping_hq", "HQ_FIX_%")
            }
            
            table_name, batch_pattern = table_mapping[table_type]
            latest_batch = db_manager.get_latest_batch_id(table_name, batch_pattern)
            
            processor.update_processing_tracking(
                table_type, processing_needed, id_column, latest_batch
            )
        
        # Update session with success
        update_session_query = text("""
            UPDATE processing_sessions 
            SET end_time = :end_time, 
                status = 'COMPLETED',
                records_processed = :records_processed,
                new_records = :new_records,
                updated_records = :updated_records
            WHERE session_id = :session_id
        """)
        
        with db_manager.engine.connect() as conn:
            conn.execute(update_session_query, {
                "session_id": session_id,
                "end_time": datetime.now(),
                "records_processed": len(processing_needed),
                "new_records": len(new_records),
                "updated_records": len(changed_records)
            })
            conn.commit()
        
        return {
            "data": processing_needed,
            "full_data": current_data,
            "processing_mode": processing_mode,
            "session_id": session_id,
            "stats": {
                "total_records": len(current_data),
                "new_records": len(new_records),
                "changed_records": len(changed_records),
                "unchanged_records": len(unchanged_records),
                "processing_needed": len(processing_needed)
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Error in incremental processing for {table_type}: {str(e)}")
        
        # Update session with error
        try:
            error_session_query = text("""
                UPDATE processing_sessions 
                SET end_time = :end_time, 
                    status = 'FAILED',
                    error_message = :error_message
                WHERE session_id = :session_id
            """)
            
            with db_manager.engine.connect() as conn:
                conn.execute(error_session_query, {
                    "session_id": session_id,
                    "end_time": datetime.now(),
                    "error_message": str(e)
                })
                conn.commit()
        except:
            pass  # Don't fail if we can't update session
        
        # Fall back to full processing using existing function
        logger.info(f"🔄 Falling back to full processing for {table_type}")
        full_data = read_from_database(table_type)
        
        return {
            "data": full_data,
            "full_data": full_data,
            "processing_mode": "FULL_FALLBACK",
            "session_id": session_id,
            "stats": {
                "total_records": len(full_data),
                "new_records": len(full_data),
                "changed_records": 0,
                "unchanged_records": 0,
                "processing_needed": len(full_data)
            }
        }

def read_previous_processed_data() -> Dict:
    """Read previously processed data from normalized table (DATABASE-ONLY)"""
    try:
        query = text("""
            SELECT DISTINCT batch_id, processing_date
            FROM transactions_normalized
            ORDER BY processing_date DESC
        """)
        
        with db_manager.engine.connect() as conn:
            latest_batch = conn.execute(query).fetchone()
            
            if not latest_batch:
                logger.warning("No previous processed data found in normalized table")
                return {"transactions": [], "parked_measures": []}
            
            batch_id = latest_batch[0]
            logger.info(f"Loading previous data from batch: {batch_id}")
            
            # Load previous transactions from normalized table
            transactions_query = text("""
                SELECT * FROM transactions_normalized 
                WHERE batch_id = :batch_id
            """)
            
            df = pd.read_sql_query(transactions_query, db_manager.engine, params={"batch_id": batch_id})
            
            # Convert DataFrame back to transaction format
            transactions = []
            parked_measures = []
            
            for _, row in df.iterrows():
                transaction = {
                    'transaction_id': row['transaction_id'],
                    'category': row['category'],
                    'status': row['status'],
                    'budget_impact': row['budget_impact'],
                    'amount': row['amount'],
                    'estimated_amount': row['estimated_amount'],
                    'actual_amount': row['actual_amount'],
                    'variance': row['variance'],
                    'department': row['department'],
                    'region': row['region'],
                    'district': row['district'],
                    'location_type': row['location_type'],
                    'booking_date': str(row['booking_date']) if row['booking_date'] else None,
                    'measure_date': str(row['measure_date']) if row['measure_date'] else None,
                    'bestellnummer': row['bestellnummer'],
                    'measure_id': row['measure_id'],
                    'measure_title': row['measure_title'],
                    'kostenstelle': row['kostenstelle']
                }
                
                # Parse metadata if available
                if row['msp_metadata']:
                    try:
                        transaction['msp_data'] = json.loads(row['msp_metadata'])
                    except:
                        pass
                        
                if row['sap_metadata']:
                    try:
                        transaction['sap_data'] = json.loads(row['sap_metadata'])
                    except:
                        pass
                        
                if row['additional_data']:
                    try:
                        additional = json.loads(row['additional_data'])
                        transaction.update(additional)
                    except:
                        pass
                
                transactions.append(transaction)
                
                # Separate parked measures
                if row['category'] in ['PARKED_MEASURE', 'UNASSIGNED_MEASURE']:
                    parked_measures.append(transaction)
            
            logger.info(f"Successfully loaded {len(transactions)} previous transactions from normalized table")
            return {"transactions": transactions, "parked_measures": parked_measures}
                
    except Exception as e:
        logger.warning(f"Could not load previous data from normalized table: {str(e)}")
        return {"transactions": [], "parked_measures": []}

# -----------------------------------------------------------------------------
# NORMALIZED TABLE FUNCTIONS
# -----------------------------------------------------------------------------

def create_normalized_table():
    """Create normalized transactions table"""
    create_table_query = text("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'transactions_normalized')
        BEGIN
            CREATE TABLE transactions_normalized (
                [id] INT IDENTITY(1,1) PRIMARY KEY,
                [transaction_id] NVARCHAR(100) NULL,
                [category] NVARCHAR(50) NULL,
                [status] NVARCHAR(100) NULL,
                [budget_impact] NVARCHAR(50) NULL,
                [amount] DECIMAL(18,2) NULL,
                [estimated_amount] DECIMAL(18,2) NULL,
                [actual_amount] DECIMAL(18,2) NULL,
                [variance] DECIMAL(18,2) NULL,
                [department] NVARCHAR(200) NULL,
                [region] NVARCHAR(200) NULL,
                [district] NVARCHAR(200) NULL,
                [location_type] NVARCHAR(50) NULL,
                [booking_date] DATE NULL,
                [measure_date] DATE NULL,
                [bestellnummer] INT NULL,
                [measure_id] NVARCHAR(50) NULL,
                [measure_title] NVARCHAR(500) NULL,
                [kostenstelle] NVARCHAR(50) NULL,
                [batch_id] NVARCHAR(100) NOT NULL,
                [processing_date] DATETIME2 NOT NULL,
                [created_at] DATETIME2 DEFAULT GETDATE() NOT NULL,
                [msp_metadata] NVARCHAR(MAX) NULL,
                [sap_metadata] NVARCHAR(MAX) NULL,
                [additional_data] NVARCHAR(MAX) NULL
            )
            
            CREATE INDEX IX_transactions_normalized_batch_id ON transactions_normalized(batch_id)
            CREATE INDEX IX_transactions_normalized_processing_date ON transactions_normalized(processing_date)
            CREATE INDEX IX_transactions_normalized_category ON transactions_normalized(category)
            CREATE INDEX IX_transactions_normalized_department ON transactions_normalized(department)
            CREATE INDEX IX_transactions_normalized_bestellnummer ON transactions_normalized(bestellnummer)
        END
    """)
    return create_table_query

def save_to_normalized_table(processed_data: Dict, batch_id: str = None) -> None:
    """Save processed data to normalized table (DATABASE-ONLY)"""
    logger.info("💾 Saving processed data to normalized table...")
    
    try:
        if not batch_id:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            batch_id = f"PROCESSED_{timestamp}"
        
        processing_date = datetime.now()
        
        # Create table if needed
        create_table_query = create_normalized_table()
        
        with db_manager.engine.connect() as conn:
            conn.execute(create_table_query)
            conn.commit()
            logger.info("✅ Normalized table ready")
            
            # Clear previous data for this batch
            delete_query = text("DELETE FROM transactions_normalized WHERE batch_id = :batch_id")
            conn.execute(delete_query, {"batch_id": batch_id})
            
            # Prepare data for insertion
            transactions_to_insert = []
            transactions = processed_data.get('transactions', [])
            
            for transaction in transactions:
                if not isinstance(transaction, dict):
                    continue
                
                normalized_record = {
                    'transaction_id': safe_extract_string(transaction, 'transaction_id'),
                    'category': safe_extract_string(transaction, 'category'),
                    'status': safe_extract_string(transaction, 'status'),
                    'budget_impact': safe_extract_string(transaction, 'budget_impact'),
                    'amount': safe_extract_decimal(transaction, 'amount'),
                    'estimated_amount': safe_extract_decimal(transaction, 'estimated_amount'),
                    'actual_amount': safe_extract_decimal(transaction, 'actual_amount'),
                    'variance': safe_extract_decimal(transaction, 'variance'),
                    'department': safe_extract_string(transaction, 'department', max_length=200),
                    'region': safe_extract_string(transaction, 'region', max_length=200),
                    'district': safe_extract_string(transaction, 'district', max_length=200),
                    'location_type': safe_extract_string(transaction, 'location_type'),
                    'booking_date': safe_extract_date(transaction, 'booking_date'),
                    'measure_date': safe_extract_date(transaction, 'measure_date'),
                    'bestellnummer': safe_extract_integer(transaction, 'bestellnummer'),
                    'measure_id': safe_extract_string(transaction, 'measure_id'),
                    'measure_title': safe_extract_string(transaction, 'measure_title', max_length=500),
                    'kostenstelle': safe_extract_string(transaction, 'kostenstelle'),
                    'batch_id': batch_id,
                    'processing_date': processing_date,
                    'msp_metadata': safe_extract_json_metadata(transaction, 'msp_data'),
                    'sap_metadata': safe_extract_json_metadata(transaction, 'sap_data'),
                    'additional_data': safe_extract_additional_data(transaction)
                }
                
                transactions_to_insert.append(normalized_record)
            
            # Insert in batches
            if transactions_to_insert:
                insert_query = text("""
                    INSERT INTO transactions_normalized (
                        transaction_id, category, status, budget_impact, amount,
                        estimated_amount, actual_amount, variance, department, region,
                        district, location_type, booking_date, measure_date, bestellnummer,
                        measure_id, measure_title, kostenstelle, batch_id, processing_date,
                        msp_metadata, sap_metadata, additional_data
                    ) VALUES (
                        :transaction_id, :category, :status, :budget_impact, :amount,
                        :estimated_amount, :actual_amount, :variance, :department, :region,
                        :district, :location_type, :booking_date, :measure_date, :bestellnummer,
                        :measure_id, :measure_title, :kostenstelle, :batch_id, :processing_date,
                        :msp_metadata, :sap_metadata, :additional_data
                    )
                """)
                
                # Insert in chunks
                chunk_size = 500
                for i in range(0, len(transactions_to_insert), chunk_size):
                    chunk = transactions_to_insert[i:i + chunk_size]
                    conn.execute(insert_query, chunk)
                
                conn.commit()
                
            logger.info(f"✅ Successfully saved {len(transactions_to_insert)} records to normalized table")
            
    except Exception as e:
        logger.error(f"❌ Error saving to normalized table: {str(e)}")
        raise

# -----------------------------------------------------------------------------
# FRONTEND VIEWS FUNCTIONS (DATABASE-ONLY)
# -----------------------------------------------------------------------------

def create_frontend_views_table():
    """Create table for frontend views"""
    create_table_query = text("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'frontend_views')
        BEGIN
            CREATE TABLE frontend_views (
                [id] INT IDENTITY(1,1) PRIMARY KEY,
                [view_type] NVARCHAR(100) NOT NULL,
                [view_data] NVARCHAR(MAX) NOT NULL,
                [created_at] DATETIME2 DEFAULT GETDATE() NOT NULL,
                [processing_date] DATETIME2 NOT NULL
            )
            
            CREATE INDEX IX_frontend_views_type ON frontend_views(view_type)
            CREATE INDEX IX_frontend_views_processing_date ON frontend_views(processing_date)
        END
    """)
    return create_table_query

def create_budget_allocation_table():
    """Create table for budget allocation data"""
    create_table_query = text("""
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'budget_allocation')
        BEGIN
            CREATE TABLE budget_allocation (
                [id] INT IDENTITY(1,1) PRIMARY KEY,
                [allocation_type] NVARCHAR(20) NOT NULL,
                [allocation_key] NVARCHAR(500) NOT NULL,
                [allocated_budget] DECIMAL(18,2) NOT NULL DEFAULT 0,
                [location_type] NVARCHAR(50) NULL,
                [last_updated] DATETIME2 NULL,
                [created_at] DATETIME2 DEFAULT GETDATE() NOT NULL,
                [updated_at] DATETIME2 DEFAULT GETDATE() NOT NULL
            )
            
            CREATE UNIQUE INDEX IX_budget_allocation_unique ON budget_allocation(allocation_type, allocation_key)
            CREATE INDEX IX_budget_allocation_type ON budget_allocation(allocation_type)
        END
    """)
    return create_table_query

def save_frontend_view_to_database(view_type: str, view_data: Any) -> None:
    """Save frontend view data to database (DATABASE-ONLY)"""
    try:
        processing_date = datetime.now()
        
        create_table_query = create_frontend_views_table()
        
        with db_manager.engine.connect() as conn:
            conn.execute(create_table_query)
            conn.commit()
            
            # Delete previous data of this view type
            delete_query = text("DELETE FROM frontend_views WHERE view_type = :view_type")
            conn.execute(delete_query, {"view_type": view_type})
            
            # Convert data to JSON
            clean_data = make_json_serializable(view_data)
            json_data = json.dumps(clean_data, cls=JSONEncoder, separators=(',', ':'))
            
            # Insert new data
            insert_query = text("""
                INSERT INTO frontend_views (view_type, view_data, processing_date)
                VALUES (:view_type, :view_data, :processing_date)
            """)
            
            conn.execute(insert_query, {
                "view_type": view_type,
                "view_data": json_data,
                "processing_date": processing_date
            })
            conn.commit()
            
        logger.info(f"✅ Successfully saved {view_type} view to database")
        
    except Exception as e:
        logger.error(f"❌ Error saving {view_type} view: {str(e)}")
        raise

def read_budget_allocation_from_database() -> Dict:
    """Read budget allocation data from database (DATABASE-ONLY)"""
    try:
        query = text("""
            SELECT allocation_type, allocation_key, allocated_budget, location_type, last_updated
            FROM budget_allocation
        """)
        
        with db_manager.engine.connect() as conn:
            results = conn.execute(query).fetchall()
            
            if not results:
                logger.warning("No budget allocation found in database")
                return {"departments": {}, "regions": {}, "last_updated": None}
            
            departments = {}
            regions = {}
            last_updated = None
            
            for row in results:
                allocation_type, allocation_key, allocated_budget, location_type, updated = row
                
                if allocation_type == 'departments':
                    departments[allocation_key] = {
                        'allocated_budget': float(allocated_budget),
                        'location_type': location_type
                    }
                elif allocation_type == 'regions':
                    regions[allocation_key] = {
                        'allocated_budget': float(allocated_budget),
                        'location_type': location_type
                    }
                
                if updated and (not last_updated or updated > last_updated):
                    last_updated = updated
            
            budget_data = {
                'departments': departments,
                'regions': regions,
                'last_updated': last_updated.isoformat() if last_updated else None
            }
            
            logger.info("Successfully loaded budget allocation from database")
            return budget_data
                
    except Exception as e:
        logger.warning(f"Could not load budget allocation from database: {str(e)}")
        return {"departments": {}, "regions": {}, "last_updated": None}

def save_budget_allocation_to_database(budget_data: Dict) -> None:
    """Save budget allocation data to database (DATABASE-ONLY)"""
    try:
        validate_budget_integrity(budget_data)
        
        create_table_query = create_budget_allocation_table()
        
        with db_manager.engine.connect() as conn:
            conn.execute(create_table_query)
            conn.commit()
            
            # Clear existing data
            conn.execute(text("DELETE FROM budget_allocation"))
            
            # Insert departments
            departments = budget_data.get('departments', {})
            for dept_key, dept_data in departments.items():
                insert_query = text("""
                    INSERT INTO budget_allocation (allocation_type, allocation_key, allocated_budget, location_type, last_updated)
                    VALUES (:allocation_type, :allocation_key, :allocated_budget, :location_type, :last_updated)
                """)
                
                conn.execute(insert_query, {
                    "allocation_type": "departments",
                    "allocation_key": dept_key,
                    "allocated_budget": dept_data.get('allocated_budget', 0),
                    "location_type": dept_data.get('location_type'),
                    "last_updated": datetime.now() if budget_data.get('last_updated') else None
                })
            
            # Insert regions
            regions = budget_data.get('regions', {})
            for region_key, region_data in regions.items():
                insert_query = text("""
                    INSERT INTO budget_allocation (allocation_type, allocation_key, allocated_budget, location_type, last_updated)
                    VALUES (:allocation_type, :allocation_key, :allocated_budget, :location_type, :last_updated)
                """)
                
                conn.execute(insert_query, {
                    "allocation_type": "regions",
                    "allocation_key": region_key,
                    "allocated_budget": region_data.get('allocated_budget', 0),
                    "location_type": region_data.get('location_type'),
                    "last_updated": datetime.now() if budget_data.get('last_updated') else None
                })
            
            conn.commit()
            
        logger.info("✅ Budget allocation saved to database successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to save budget allocation: {str(e)}")
        raise

def create_budget_backup_in_database() -> str:
    """Create a timestamped backup of current budget allocation (DATABASE-ONLY)"""
    try:
        current_budget = read_budget_allocation_from_database()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"budget_allocation_backup_{timestamp}"
        
        save_frontend_view_to_database(backup_name, current_budget)
        logger.info(f"✅ Budget backup created: {backup_name}")
        return backup_name
        
    except Exception as e:
        logger.error(f"❌ Failed to create budget backup: {str(e)}")
        return None

def validate_budget_integrity(budget_data):
    """Validate that budget data is not corrupted"""
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
    
    logger.info(f"✅ Budget validation passed - Total budget: €{total_budget:,.2f}")
    return True

def generate_frontend_views_to_database(processed_data: Dict) -> None:
    """Generate frontend views and save to database (DATABASE-ONLY)"""
    start_time = time.time()
    
    # 1. Department-level view with location type
    departments = {}
    
    transactions = processed_data.get('transactions', [])
    if not isinstance(transactions, list):
        logger.error(f"Expected transactions to be a list, got {type(transactions)}")
        transactions = []
    
    for tx in transactions:
        if not isinstance(tx, dict):
            logger.warning(f"Skipping invalid transaction item: {type(tx)}")
            continue
            
        dept = tx.get('department', '')
        if not dept:
            continue
        
        location_type = tx.get('location_type', 'Unknown')
        dept_key = f"{dept}|{location_type}"
        
        if dept_key not in departments:
            departments[dept_key] = {
                'name': dept,
                'location_type': location_type,
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
            
        # Track regions
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
        if not isinstance(tx, dict):
            continue
            
        region = tx.get('region', '')
        dept = tx.get('department', '')
        
        if not region or not dept:
            continue
        
        location_type = tx.get('location_type', 'Unknown')
        region_key = f"{dept}|{region}|{location_type}"
        
        if region_key not in regions:
            regions[region_key] = {
                'department': dept,
                'name': region,
                'location_type': location_type,
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
            
        # Track districts
        district = tx.get('district', '')
        if district:
            regions[region_key]['districts'].add(district)
    
    # Convert to list and finalize
    regions_list = []
    for region_key, region_data in regions.items():
        region_data['districts'] = list(region_data['districts'])
        region_data['total_amount'] = region_data['booked_amount'] + region_data['reserved_amount']
        regions_list.append(region_data)
    
    # 3. Awaiting assignment view
    awaiting_assignment = {}
    
    for transaction in transactions:
        if not isinstance(transaction, dict):
            continue
            
        if transaction.get('category') != 'UNASSIGNED_MEASURE':
            continue
            
        if transaction.get('status') != 'Awaiting Assignment':
            continue
            
        dept = transaction.get('department', '')
        location_type = transaction.get('location_type', 'Unknown')
        
        if not dept:
            dept = 'Unassigned'
        
        if dept not in awaiting_assignment:
            awaiting_assignment[dept] = []
            
        safe_measure = {
            'measure_id': transaction.get('measure_id', ''),
            'bestellnummer': transaction.get('bestellnummer', 0),
            'measure_title': transaction.get('measure_title', ''),
            'estimated_amount': safe_float_conversion(transaction.get('estimated_amount', 0)),
            'measure_date': transaction.get('measure_date', ''),
            'department': dept,
            'location_type': location_type,
            'name': transaction.get('name', ''),
            'text': transaction.get('text', ''),
            'status': transaction.get('status', ''),
            'category': transaction.get('category', '')
        }
            
        awaiting_assignment[dept].append(safe_measure)
    
    # 4. BULLETPROOF Budget allocation preservation (DATABASE VERSION)
    logger.info("🔒 BULLETPROOF BUDGET PRESERVATION - Starting with database storage...")
    
    try:
        existing_budget = read_budget_allocation_from_database()
        logger.info(f"✅ Loaded existing budget with {len(existing_budget.get('departments', {}))} departments")
        
        if 'departments' not in existing_budget:
            existing_budget['departments'] = {}
        if 'regions' not in existing_budget:
            existing_budget['regions'] = {}
            
    except Exception as e:
        logger.info(f"📝 No existing budget found, creating new one: {str(e)}")
        existing_budget = {
            'departments': {},
            'regions': {},
            'last_updated': None
        }
    
    # PRESERVE ALL existing budget data
    preserved_departments = existing_budget['departments'].copy()
    preserved_regions = existing_budget['regions'].copy()
    
    logger.info(f"🔒 PRESERVING {len(preserved_departments)} existing department budgets")
    logger.info(f"🔒 PRESERVING {len(preserved_regions)} existing region budgets")
    
    # Only ADD new departments/regions with zero budgets
    new_departments_added = 0
    new_regions_added = 0
    
    # Add new departments (only if they don't exist)
    for dept in departments_list:
        dept_key = f"{dept['name']}|{dept['location_type']}"
        
        if dept_key not in preserved_departments:
            preserved_departments[dept_key] = {
                'allocated_budget': 0,
                'location_type': dept['location_type']
            }
            new_departments_added += 1
            logger.info(f"➕ ADDED new department: {dept_key}")
        else:
            existing_budget_amount = preserved_departments[dept_key].get('allocated_budget', 0)
            logger.info(f"🔒 PRESERVED department: {dept_key} (budget: €{existing_budget_amount:,.2f})")
    
    # Add new regions (only if they don't exist)
    for region in regions_list:
        region_key = f"{region['department']}|{region['name']}|{region['location_type']}"
        
        if region_key not in preserved_regions:
            preserved_regions[region_key] = {
                'allocated_budget': 0,
                'location_type': region['location_type']
            }
            new_regions_added += 1
            logger.info(f"➕ ADDED new region: {region_key}")
        else:
            existing_budget_amount = preserved_regions[region_key].get('allocated_budget', 0)
            logger.info(f"🔒 PRESERVED region: {region_key} (budget: €{existing_budget_amount:,.2f})")
    
    # Create final budget allocation
    final_budget_allocation = {
        'departments': preserved_departments,
        'regions': preserved_regions,
        'last_updated': existing_budget.get('last_updated')
    }
    
    # Calculate preservation statistics
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
    
    # Save with backup logic TO DATABASE
    try:
        create_budget_backup_in_database()
        save_budget_allocation_to_database(final_budget_allocation)
        logger.info(f"💾 Successfully saved budget data with ALL existing budgets preserved")
        
    except Exception as save_error:
        logger.error(f"❌ CRITICAL: Failed to save budget data: {str(save_error)}")
        raise
    
    logger.info("🔒 BULLETPROOF BUDGET PRESERVATION - Completed successfully")
    
    # Save views to database in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        executor.submit(save_frontend_view_to_database, "frontend_departments", {'departments': departments_list})
        executor.submit(save_frontend_view_to_database, "frontend_regions", {'regions': regions_list})
        executor.submit(save_frontend_view_to_database, "frontend_awaiting_assignment", awaiting_assignment)
    
    elapsed_time = time.time() - start_time
    logger.info(f"Generated frontend views in {elapsed_time:.2f} seconds")

# -----------------------------------------------------------------------------
# SAFE DATA EXTRACTION HELPERS
# -----------------------------------------------------------------------------

def safe_extract_string(transaction: dict, key: str, max_length: int = None) -> str:
    """Safely extract string value with length limits"""
    value = transaction.get(key)
    if value is None or pd.isna(value):
        return None
    
    str_value = str(value).strip()
    if not str_value:
        return None
        
    if max_length and len(str_value) > max_length:
        str_value = str_value[:max_length]
        
    return str_value

def safe_extract_decimal(transaction: dict, key: str) -> float:
    """Safely extract decimal value"""
    value = transaction.get(key)
    if value is None or pd.isna(value):
        return None
    
    try:
        return float(value)
    except (ValueError, TypeError):
        return None

def safe_extract_integer(transaction: dict, key: str) -> int:
    """Safely extract integer value"""
    value = transaction.get(key)
    if value is None or pd.isna(value):
        return None
    
    try:
        return int(value)
    except (ValueError, TypeError):
        return None

def safe_extract_date(transaction: dict, key: str) -> str:
    """Safely extract and format date value"""
    value = transaction.get(key)
    if value is None or pd.isna(value):
        return None
    
    try:
        date_str = str(value).strip()
        if not date_str:
            return None
            
        date_formats = ['%Y-%m-%d', '%d.%m.%Y', '%m/%d/%Y', '%Y-%m-%d %H:%M:%S']
        
        for date_format in date_formats:
            try:
                parsed_date = datetime.strptime(date_str.split(' ')[0], date_format)
                return parsed_date.strftime('%Y-%m-%d')
            except ValueError:
                continue
                
        return None
        
    except Exception:
        return None

def safe_extract_json_metadata(transaction: dict, key: str) -> str:
    """Safely extract and serialize metadata as JSON"""
    value = transaction.get(key)
    if value is None or pd.isna(value):
        return None
    
    try:
        clean_value = make_json_serializable(value)
        return json.dumps(clean_value, cls=JSONEncoder, separators=(',', ':'))
    except Exception as e:
        logger.warning(f"Could not serialize metadata for key {key}: {str(e)}")
        return None

def safe_extract_additional_data(transaction: dict) -> str:
    """Extract additional data that doesn't fit in specific columns"""
    excluded_keys = {
        'transaction_id', 'category', 'status', 'budget_impact', 'amount',
        'estimated_amount', 'actual_amount', 'variance', 'department', 'region',
        'district', 'location_type', 'booking_date', 'measure_date', 'bestellnummer',
        'measure_id', 'measure_title', 'kostenstelle', 'msp_data', 'sap_data'
    }
    
    additional_data = {}
    for key, value in transaction.items():
        if key not in excluded_keys and value is not None and not pd.isna(value):
            additional_data[key] = value
    
    if additional_data:
        try:
            clean_data = make_json_serializable(additional_data)
            return json.dumps(clean_data, cls=JSONEncoder, separators=(',', ':'))
        except Exception:
            return None
    
    return None

# -----------------------------------------------------------------------------
# INDEXING FUNCTIONS
# -----------------------------------------------------------------------------

def create_msp_index(msp_data: pd.DataFrame) -> Dict[int, pd.Series]:
    """Create index of MSP data by Bestellnummer"""
    msp_index = {}
    
    for idx, row in msp_data.iterrows():
        bestellnummer = row['Bestellnummer']
        msp_index[bestellnummer] = row
        
    logger.info(f"Created MSP index with {len(msp_index)} entries")
    return msp_index

def create_mapping_index(mapping_floor: pd.DataFrame, mapping_hq: pd.DataFrame) -> Dict[str, LocationInfo]:
    """Create index for Kostenstelle mapping"""
    mapping_index = {}
    
    # Index HQ mappings
    for _, row in mapping_hq.iterrows():
        kostenstelle_col = 'Kostenstelle ' if 'Kostenstelle ' in row.index else 'Kostenstelle'
        kostenstelle = str(safe_get(row, kostenstelle_col, '')).strip()
        
        if not kostenstelle:
            continue
            
        mapping_index[kostenstelle] = LocationInfo(
            department=safe_get(row, 'Abteilung', ''),
            region=safe_get(row, 'Bezeichnung', ''),
            district='HQ'
        )
    
    # Index Floor mappings
    for _, row in mapping_floor.iterrows():
        extracted_digits = str(safe_get(row, 'Kostenstelle', '')).strip()
        
        if not extracted_digits:
            continue
            
        mapping_index[f"FLOOR_{extracted_digits}"] = LocationInfo(
            department=safe_get(row, 'Department', ''),
            region=safe_get(row, 'Region', ''),
            district=safe_get(row, 'District', 'Floor')
        )
    
    logger.info(f"Created mapping index with {len(mapping_index)} entries")
    return mapping_index

def create_previous_parked_index(previous_data: Dict) -> Dict[int, Dict]:
    """Create index of previously parked measures by Bestellnummer"""
    previous_parked_index = {}
    
    for parked in previous_data.get('parked_measures', []):
        if 'bestellnummer' in parked:
            previous_parked_index[parked['bestellnummer']] = parked
    
    logger.info(f"Created index of {len(previous_parked_index)} previously parked measures")
    return previous_parked_index

# -----------------------------------------------------------------------------
# CACHED HELPER FUNCTIONS
# -----------------------------------------------------------------------------

@functools.lru_cache(maxsize=1024)
def extract_bestellnummer_cached(text_field: str) -> Optional[int]:
    """Extract 4-digit Bestellnummer (≥3000) from text field with caching"""
    cached_result = bestellnummer_cache.get(text_field)
    if cached_result is not None:
        return cached_result
    
    # Find 4-digit numbers ≥3000
    matches = re.findall(r'\b\d{4}\b', text_field)
    valid_numbers = [int(num) for num in matches if int(num) >= 3000]
    
    result = valid_numbers[0] if valid_numbers else None
    bestellnummer_cache.set(text_field, result)
    return result

def map_kostenstelle_cached(kostenstelle: str, mapping_index: Dict[str, LocationInfo]) -> Optional[Tuple[LocationInfo, str]]:
    """Map Kostenstelle to location with caching"""
    cached_result = kostenstelle_cache.get(kostenstelle)
    if cached_result is not None:
        return cached_result
    
    if not kostenstelle:
        return None
    
    kostenstelle = str(kostenstelle).strip()
    if '.' in kostenstelle:
        kostenstelle = kostenstelle.split('.')[0]
    
    if len(kostenstelle) < 5:
        return None
    
    location_type = None
    
    if kostenstelle.startswith('1'):
        # HQ Kostenstelle
        result = mapping_index.get(kostenstelle)
        location_type = 'HQ'
    
    elif kostenstelle.startswith('3'):
        # Floor Kostenstelle - extract digits 2-6
        extracted_digits = kostenstelle[1:6]
        
        result = mapping_index.get(extracted_digits)
        if result is None:
            result = mapping_index.get(f"FLOOR_{extracted_digits}")
            
        if result is None:
            stripped_digits = extracted_digits.lstrip('0')
            result = mapping_index.get(stripped_digits)
            if result is None:
                result = mapping_index.get(f"FLOOR_{stripped_digits}")
        
        if result is not None:
            location_type = 'Floor'
    
    else:
        result = None
    
    final_result = (result, location_type) if result is not None else None
    kostenstelle_cache.set(kostenstelle, final_result)
    return final_result

def extract_department_from_gruppen_cached(gruppen_field: str) -> Optional[str]:
    """Extract department from Gruppen field with caching"""
    if pd.isna(gruppen_field) or not gruppen_field:
        return ''
        
    gruppen_field = str(gruppen_field)
    
    cached_result = department_cache.get(gruppen_field)
    if cached_result is not None:
        return cached_result
    
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
    
    # Split Gruppen field by commas
    gruppen_entries = [entry.strip() for entry in gruppen_field.split(',')]
    
    # Count department occurrences
    department_counts = {}
    
    for entry in gruppen_entries:
        entry = entry.replace('Kundenbetreuungsregion', '').replace('Vertriebsregion', '').strip()
        
        for code in department_mapping.keys():
            if f"Abteilung {code}" in entry:
                if code in department_counts:
                    department_counts[code] += 1
                else:
                    department_counts[code] = 1
                break
    
    if not department_counts:
        result = ''
    elif len(department_counts) == 1:
        dept_code = list(department_counts.keys())[0]
        result = department_mapping[dept_code]
    else:
        # Multiple departments - return most frequent
        max_count = 0
        most_frequent_dept = None
        
        for dept, count in department_counts.items():
            if count > max_count:
                max_count = count
                most_frequent_dept = dept
        
        result = department_mapping.get(most_frequent_dept, '')
    
    department_cache.set(gruppen_field, result)
    return result

def infer_location_type_from_department(department: str) -> str:
    """Infer location type (Floor/HQ) from department name"""
    if not department:
        return 'Unknown'
        
    floor_department_indicators = [
        'Abteilung Baden-Württemberg',
        'Abteilung Schleswig-Holstein',
        'Abteilung Mecklenburg-Vorpommern',
        'Abteilung Nordrhein-Westfalen',
        'Abteilung Sachsen-Anhalt',
        'Abteilung Hessen',
        'Abteilung Bayern',
        'BW', 'SH', 'MV', 'NRW', 'ST', 'HE', 'BY'
    ]
    
    for indicator in floor_department_indicators:
        if indicator in department:
            return 'Floor'
    
    if 'HV' in department or 'Hauptverwaltung' in department:
        return 'HQ'
    
    return 'Unknown'

# -----------------------------------------------------------------------------
# BATCH PROCESSING FUNCTIONS
# -----------------------------------------------------------------------------

def process_data_in_batches(
    sap_data: pd.DataFrame, 
    msp_data: pd.DataFrame, 
    msp_index: Dict[int, pd.Series],
    mapping_index: Dict[str, LocationInfo], 
    previous_parked_index: Dict[int, Dict],
    previous_data: Dict
) -> Dict:
    """Process data in parallel batches for improved performance"""
    
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
    
    # Prepare final result
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
    """Process a batch of SAP transactions with improved NaN handling"""
    
    direct_costs = []
    booked_measures = []
    outliers = []
    matched_bestellnummern = set()
    
    for _, transaction in batch.iterrows():
        # Extract and process Kostenstelle
        kostenstelle = str(safe_get(transaction, 'Kostenstelle', ''))
        location_result = map_kostenstelle_cached(kostenstelle, mapping_index)
        
        if location_result is None:
            # Could not map Kostenstelle to location
            location_info = LocationInfo('', '', '')
            location_type = 'Unknown'
            
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
                'location_type': location_type
            })
            continue
        
        # Unpack location result
        location_info, location_type = location_result
        
        # Extract Bestellnummer from Text field
        text_field = str(safe_get(transaction, 'Text', ''))
        bestellnummer = extract_bestellnummer_cached(text_field)
        
        if bestellnummer is None:
            # No valid Bestellnummer found - direct cost
            direct_costs.append({
                'transaction_id': str(safe_get(transaction, 'Belegnummer', '')),
                'amount': safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0)),
                'text': text_field,
                'booking_date': str(safe_get(transaction, 'Buchungsdatum', '')),
                'kostenstelle': kostenstelle,
                'category': 'DIRECT_COST',
                'status': 'Direct Booked',
                'budget_impact': 'Booked',
                'department': location_info.department or '',
                'region': location_info.region or '',
                'district': location_info.district or '',
                'location_type': location_type
            })
            continue
        
        # Look for matching Bestellnummer in MSP data
        matching_measure = msp_index.get(bestellnummer)
        
        if matching_measure is None:
            # Valid Bestellnummer but no matching MSP measure
            direct_costs.append({
                'transaction_id': str(safe_get(transaction, 'Belegnummer', '')),
                'amount': safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0)),
                'text': text_field,
                'booking_date': str(safe_get(transaction, 'Buchungsdatum', '')),
                'kostenstelle': kostenstelle,
                'bestellnummer': bestellnummer,
                'category': 'DIRECT_COST',
                'status': 'Direct Booked',
                'budget_impact': 'Booked',
                'department': location_info.department or '',
                'region': location_info.region or '',
                'district': location_info.district or '',
                'location_type': location_type
            })
            continue
        
        # Match found - link transaction with MSP measure
        matched_bestellnummern.add(bestellnummer)
        
        # Check if this was previously a parked measure
        previously_parked = bestellnummer in previous_parked_index
        
        # Get estimated and actual amounts
        estimated_amount = safe_float_conversion(safe_get(matching_measure, 'Benötigtes Budget (Geschätzt)', 0))
        actual_amount = safe_float_conversion(safe_get(transaction, 'Betrag in Hauswährung', 0))
        
        # Create safe dictionaries
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
            'kostenstelle': kostenstelle,
            'category': 'BOOKED_MEASURE',
            'status': 'SAP-MSP Booked',
            'previously_parked': previously_parked,
            'budget_impact': 'Booked',
            'department': location_info.department or '',
            'region': location_info.region or '',
            'district': location_info.district or '',
            'location_type': location_type,
            'msp_data': measure_data,
            'sap_data': transaction_data
        })
    
    return {
        'direct_costs': direct_costs,
        'booked_measures': booked_measures,
        'outliers': outliers,
        'matched_bestellnummern': matched_bestellnummern
    }

def process_parked_measures(
    msp_data: pd.DataFrame, 
    matched_bestellnummern: Set[int],
    previous_parked_index: Dict[int, Dict]
) -> List[Dict]:
    """Process unmatched MSP measures with improved NaN handling and correct categorization"""
    
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
            
            # Determine correct category and status based on assignment
            if manual_assignment:
                category = 'PARKED_MEASURE'
                status = 'Manually assigned, awaiting SAP'
                region = manual_assignment.get('region', '')
                district = manual_assignment.get('district', '')
            else:
                category = 'UNASSIGNED_MEASURE'
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
                'category': category,
                'status': status,
                'budget_impact': 'Reserved',
                'department': department,
                'region': region,
                'district': district,
                'location_type': location_type,
                'manual_assignment': manual_assignment,
                'msp_data': measure_data
            }
                
            parked_measures.append(parked_measure)
    
    return parked_measures

# -----------------------------------------------------------------------------
# MAIN PROCESSING FUNCTION
# -----------------------------------------------------------------------------

def main() -> None:
    """Main function to process SAP-MSP data and save to normalized table (DATABASE-ONLY)"""
    start_time = time.time()
    logger.info('🚀 Database-only SAP-MSP processing started at: %s', datetime.now())
    
    try:
        # Step 0: Test database connection
        if not db_manager.test_connection():
            raise ConnectionError("Cannot connect to database")
        
        # Step 1: Load data from database tables (DATABASE-ONLY)
        logger.info("📊 Loading data from database tables...")
        sap_data = read_from_database("sap")
        msp_data = read_from_database("msp")
        mapping_floor = read_from_database("mapping_floor")
        mapping_hq = read_from_database("mapping_hq")
        
        # Log data info
        logger.info(f"SAP data: {len(sap_data)} records")
        logger.info(f"MSP data: {len(msp_data)} records")
        logger.info(f"Floor mapping: {len(mapping_floor)} records")
        logger.info(f"HQ mapping: {len(mapping_hq)} records")
        
        # Retrieve previous processed data for comparison (DATABASE-ONLY)
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
        
        # Step 4: Save processed data to normalized table (DATABASE-ONLY)
        logger.info("💾 Saving processed data to normalized table...")
        save_to_normalized_table(processed_data)
        
        # Step 5: Generate frontend-specific views (DATABASE-ONLY)
        logger.info("🎨 Generating frontend views...")
        generate_frontend_views_to_database(processed_data)
        
        # Step 6: Log summary statistics
        stats = processed_data['statistics']
        logger.info("📊 Processing Summary:")
        logger.info(f"   Total SAP transactions: {stats['total_sap_transactions']}")
        logger.info(f"   Total MSP measures: {stats['total_msp_measures']}")
        logger.info(f"   Direct costs: {stats['direct_costs_count']}")
        logger.info(f"   Booked measures: {stats['booked_measures_count']}")
        logger.info(f"   Parked measures: {stats['parked_measures_count']}")
        logger.info(f"   Outliers: {stats['outliers_count']}")
        
        elapsed_time = time.time() - start_time
        logger.info('✅ Database-only processing completed successfully in %.2f seconds at: %s', 
                   elapsed_time, datetime.now())
    
    except Exception as e:
        logger.error('❌ Error in data processing: %s', str(e), exc_info=True)
        raise

# -----------------------------------------------------------------------------
# API FUNCTIONS FOR RETRIEVING DATA FROM DATABASE
# -----------------------------------------------------------------------------

def get_processed_data_from_normalized_table(batch_id: str = None) -> Dict:
    """API function to retrieve processed data from normalized table"""
    try:
        if batch_id:
            query = text("""
                SELECT * FROM transactions_normalized 
                WHERE batch_id = :batch_id
                ORDER BY id
            """)
            params = {"batch_id": batch_id}
        else:
            query = text("""
                SELECT * FROM transactions_normalized 
                WHERE batch_id = (
                    SELECT TOP 1 batch_id 
                    FROM transactions_normalized 
                    ORDER BY processing_date DESC
                )
                ORDER BY id
            """)
            params = {}
        
        df = pd.read_sql_query(query, db_manager.engine, params=params)
        
        # Convert DataFrame back to transaction format
        transactions = []
        for _, row in df.iterrows():
            transaction = {
                'transaction_id': row['transaction_id'],
                'category': row['category'],
                'status': row['status'],
                'budget_impact': row['budget_impact'],
                'amount': float(row['amount']) if row['amount'] is not None else None,
                'estimated_amount': float(row['estimated_amount']) if row['estimated_amount'] is not None else None,
                'actual_amount': float(row['actual_amount']) if row['actual_amount'] is not None else None,
                'variance': float(row['variance']) if row['variance'] is not None else None,
                'department': row['department'],
                'region': row['region'],
                'district': row['district'],
                'location_type': row['location_type'],
                'booking_date': str(row['booking_date']) if row['booking_date'] else None,
                'measure_date': str(row['measure_date']) if row['measure_date'] else None,
                'bestellnummer': int(row['bestellnummer']) if row['bestellnummer'] is not None else None,
                'measure_id': row['measure_id'],
                'measure_title': row['measure_title'],
                'kostenstelle': row['kostenstelle']
            }
            
            # Parse metadata if available
            if row['msp_metadata']:
                try:
                    transaction['msp_data'] = json.loads(row['msp_metadata'])
                except:
                    pass
                    
            if row['sap_metadata']:
                try:
                    transaction['sap_data'] = json.loads(row['sap_metadata'])
                except:
                    pass
                    
            if row['additional_data']:
                try:
                    additional = json.loads(row['additional_data'])
                    transaction.update(additional)
                except:
                    pass
            
            transactions.append(transaction)
        
        # Separate by category
        direct_costs = [t for t in transactions if t.get('category') == 'DIRECT_COST']
        booked_measures = [t for t in transactions if t.get('category') == 'BOOKED_MEASURE']
        parked_measures = [t for t in transactions if t.get('category') in ['PARKED_MEASURE', 'UNASSIGNED_MEASURE']]
        
        return {
            'transactions': transactions,
            'direct_costs': direct_costs,
            'booked_measures': booked_measures,
            'parked_measures': parked_measures,
            'statistics': {
                'total_transactions': len(transactions),
                'direct_costs_count': len(direct_costs),
                'booked_measures_count': len(booked_measures),
                'parked_measures_count': len(parked_measures)
            }
        }
        
    except Exception as e:
        logger.error(f"Error retrieving processed data: {str(e)}")
        raise

def get_frontend_view_from_database(view_type: str) -> Dict:
    """API function to retrieve frontend view data from database"""
    try:
        query = text("""
            SELECT view_data 
            FROM frontend_views 
            WHERE view_type = :view_type
            ORDER BY created_at DESC
        """)
        
        with db_manager.engine.connect() as conn:
            result = conn.execute(query, {"view_type": view_type}).fetchone()
            
            if result:
                data = json.loads(result[0])
                logger.info(f"Retrieved {view_type} view from database")
                return data
            else:
                logger.warning(f"No {view_type} view found in database")
                return {}
                
    except Exception as e:
        logger.error(f"Error retrieving {view_type} view: {str(e)}")
        raise

def get_available_batches() -> List[Dict]:
    """Get list of all available processing batches"""
    try:
        query = text("""
            SELECT DISTINCT batch_id, processing_date, COUNT(*) as transaction_count
            FROM transactions_normalized 
            GROUP BY batch_id, processing_date
            ORDER BY processing_date DESC
        """)
        
        with db_manager.engine.connect() as conn:
            results = conn.execute(query).fetchall()
            return [
                {
                    'batch_id': row[0], 
                    'processing_date': row[1].isoformat(),
                    'transaction_count': row[2]
                } 
                for row in results
            ]
            
    except Exception as e:
        logger.error(f"Error getting available batches: {str(e)}")
        return []

def main_with_incremental(force_full: bool = False) -> None:
    """
    Enhanced main function with incremental processing support
    Falls back to original main() if anything goes wrong
    """
    start_time = time.time()
    mode = "FULL" if force_full else "INCREMENTAL"
    
    logger.info('🚀 Enhanced SAP-MSP processing started in %s mode at: %s', mode, datetime.now())
    
    try:
        # Step 0: Test database connection (same as original)
        if not db_manager.test_connection():
            raise ConnectionError("Cannot connect to database")
        
        # Step 1: Load data with incremental logic
        logger.info(f"📊 Loading data in {mode} mode...")
        
        sap_result = read_from_database_with_incremental("sap", force_full)
        msp_result = read_from_database_with_incremental("msp", force_full)
        mapping_floor_result = read_from_database_with_incremental("mapping_floor", force_full)
        mapping_hq_result = read_from_database_with_incremental("mapping_hq", force_full)
        
        # Extract data for processing
        sap_data = sap_result["data"]
        msp_data = msp_result["data"]
        mapping_floor = mapping_floor_result["data"] 
        mapping_hq = mapping_hq_result["data"]
        
        # Log processing stats
        logger.info(f"📊 Data Loading Summary:")
        logger.info(f"   SAP: {sap_result['stats']['processing_needed']} to process ({sap_result['stats']['new_records']} new, {sap_result['stats']['changed_records']} changed)")
        logger.info(f"   MSP: {msp_result['stats']['processing_needed']} to process ({msp_result['stats']['new_records']} new, {msp_result['stats']['changed_records']} changed)")
        logger.info(f"   Floor Mapping: {mapping_floor_result['stats']['processing_needed']} to process")
        logger.info(f"   HQ Mapping: {mapping_hq_result['stats']['processing_needed']} to process")
        
        # Check if there's anything to process
        total_to_process = (len(sap_data) + len(msp_data) + 
                          len(mapping_floor) + len(mapping_hq))
        
        if total_to_process == 0 and not force_full:
            logger.info("✅ No new or changed data found - processing completed successfully")
            logger.info("💡 Use --full flag to force complete reprocessing if needed")
            return
        
        # For lookups and indexes, we need full datasets
        full_sap_data = sap_result["full_data"]
        full_msp_data = msp_result["full_data"]
        full_mapping_floor = mapping_floor_result["full_data"]
        full_mapping_hq = mapping_hq_result["full_data"]
        
        logger.info(f"📚 Full datasets loaded for indexes:")
        logger.info(f"   SAP: {len(full_sap_data)} records")
        logger.info(f"   MSP: {len(full_msp_data)} records") 
        logger.info(f"   Floor Mapping: {len(full_mapping_floor)} records")
        logger.info(f"   HQ Mapping: {len(full_mapping_hq)} records")
        
        # Step 2: Load previous processed data (same as original)
        previous_data = read_previous_processed_data()
        
        # Step 3: Create indexes using full datasets (same as original)
        logger.info("🔍 Creating indexes for data lookups...")
        msp_index = create_msp_index(full_msp_data)
        mapping_index = create_mapping_index(full_mapping_floor, full_mapping_hq)
        previous_parked_index = create_previous_parked_index(previous_data)
        
        # Clear caches (same as original)
        kostenstelle_cache.clear()
        bestellnummer_cache.clear()
        department_cache.clear()
        
        # Step 4: Process the data
        if force_full or not sap_data.empty:
            logger.info(f"⚡ Processing {len(sap_data)} SAP transactions...")
            
            # Use existing processing function but with filtered SAP data
            processed_data = process_data_in_batches(
                sap_data,  # Only new/changed SAP data
                full_msp_data,  # Full MSP data for lookups
                msp_index,
                mapping_index,
                previous_parked_index,
                previous_data
            )
            
            # For incremental mode, merge with existing data
            if not force_full and previous_data.get('transactions'):
                logger.info("🔄 Merging incremental results with existing data...")
                
                # Get IDs of transactions we just processed
                processed_transaction_ids = {
                    t.get('transaction_id') for t in processed_data['transactions'] 
                    if t.get('transaction_id')
                }
                
                # Keep existing transactions that weren't reprocessed
                existing_transactions = previous_data['transactions']
                preserved_transactions = [
                    t for t in existing_transactions 
                    if t.get('transaction_id') not in processed_transaction_ids
                ]
                
                # Combine preserved + newly processed
                all_transactions = preserved_transactions + processed_data['transactions']
                
                # Update the processed data structure
                processed_data['transactions'] = all_transactions
                
                # Recalculate statistics
                processed_data['statistics'].update({
                    'total_transactions': len(all_transactions),
                    'preserved_transactions': len(preserved_transactions),
                    'newly_processed': len(processed_data['transactions']) - len(preserved_transactions)
                })
                
                logger.info(f"📊 Merge Summary:")
                logger.info(f"   Preserved: {len(preserved_transactions)} transactions")
                logger.info(f"   Newly processed: {len(processed_data['transactions']) - len(preserved_transactions)} transactions")
                logger.info(f"   Total: {len(all_transactions)} transactions")
        else:
            logger.info("⏭️ No SAP data to process, using existing processed data")
            processed_data = previous_data
        
        # Step 5: Save processed data (same as original)
        logger.info("💾 Saving processed data to normalized table...")
        save_to_normalized_table(processed_data)
        
        # Step 6: Generate frontend views (same as original)
        logger.info("🎨 Generating frontend views...")
        generate_frontend_views_to_database(processed_data)
        
        # Step 7: Log summary statistics
        stats = processed_data['statistics']
        logger.info("📊 Final Processing Summary:")
        logger.info(f"   Processing mode: {mode}")
        logger.info(f"   Total transactions: {stats.get('total_transactions', 'N/A')}")
        logger.info(f"   Direct costs: {stats.get('direct_costs_count', 'N/A')}")
        logger.info(f"   Booked measures: {stats.get('booked_measures_count', 'N/A')}")
        logger.info(f"   Parked measures: {stats.get('parked_measures_count', 'N/A')}")
        
        if 'preserved_transactions' in stats:
            logger.info(f"   Preserved from previous: {stats['preserved_transactions']}")
        if 'newly_processed' in stats:
            logger.info(f"   Newly processed: {stats['newly_processed']}")
        
        elapsed_time = time.time() - start_time
        logger.info('✅ Enhanced processing completed successfully in %.2f seconds at: %s', 
                   elapsed_time, datetime.now())
    
    except Exception as e:
        logger.error('❌ Error in enhanced processing: %s', str(e), exc_info=True)
        
        # FALLBACK: Try original main() function
        logger.info('🔄 Attempting fallback to original processing...')
        try:
            main()  # Call your original main function
            logger.info('✅ Fallback to original processing successful')
        except Exception as fallback_error:
            logger.error('❌ Fallback also failed: %s', str(fallback_error), exc_info=True)
            raise

# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    
    try:
        # Check if database password is set
        if not DB_PASSWORD:
            print("❌ ERROR: DB_PASSWORD environment variable not set!")
            print("\nPlease set the database password using one of these methods:")
            print("1. Command Prompt: set DB_PASSWORD=your_password")
            print("2. PowerShell: $env:DB_PASSWORD=\"your_password\"")
            print("3. Add to Windows Environment Variables permanently")
            exit(1)
        
        logger.info(f"🔐 Using database password: {'*' * len(str(DB_PASSWORD))}")
        
        # Test database connection first
        logger.info("🔌 Testing database connection...")
        if not db_manager.test_connection():
            logger.error("❌ Database connection test failed!")
            exit(1)
        
        # Parse command line arguments
        force_full = "--full" in sys.argv
        use_original = "--original" in sys.argv
        help_requested = "--help" in sys.argv or "-h" in sys.argv
        
        if help_requested:
            print("\n🔧 SAP-MSP Data Processor")
            print("="*50)
            print("Usage: python script.py [options]")
            print("\nOptions:")
            print("  (no args)     Run in INCREMENTAL mode (default)")
            print("  --full        Run in FULL processing mode")
            print("  --original    Use original main() function")
            print("  --help, -h    Show this help message")
            print("\nModes:")
            print("  INCREMENTAL:  Only process new/changed data (faster)")
            print("  FULL:         Process all data from scratch")
            print("  ORIGINAL:     Use legacy processing (backup)")
            print("\nExamples:")
            print("  python script.py                # Incremental processing")
            print("  python script.py --full         # Full reprocessing")
            print("  python script.py --original     # Use legacy method")
            exit(0)
        
        if use_original:
            print("🔄 Running in ORIGINAL/LEGACY mode")
            print("💡 This uses the original main() function as backup")
            main()  # Call original function
        else:
            if force_full:
                print("🔄 Running in FULL processing mode")
                print("💡 This will process ALL data from scratch")
            else:
                print("⚡ Running in INCREMENTAL processing mode")
                print("💡 This will only process new/changed data")
                print("💡 Use --full flag to force complete reprocessing")
                print("💡 Use --original flag to use legacy processing")
            
            # Run enhanced processing
            main_with_incremental(force_full=force_full)
        
        # Optional: Show processing session summary
        try:
            query = text("""
                SELECT TOP 5 session_id, processing_mode, start_time, status, 
                       records_processed, new_records, updated_records
                FROM processing_sessions 
                ORDER BY start_time DESC
            """)
            
            with db_manager.engine.connect() as conn:
                sessions = conn.execute(query).fetchall()
                
                if sessions:
                    print("\n📊 Recent Processing Sessions:")
                    print("-" * 80)
                    for session in sessions:
                        session_id, mode, start_time, status, processed, new, updated = session
                        print(f"{start_time.strftime('%Y-%m-%d %H:%M')} | {mode:11} | {status:9} | "
                              f"Processed: {processed:4} | New: {new:3} | Updated: {updated:3}")
        except Exception as e:
            logger.warning(f"Could not display session summary: {str(e)}")
        
    except Exception as e:
        logger.error(f"💥 Fatal error in main execution: {str(e)}", exc_info=True)
        exit(1)