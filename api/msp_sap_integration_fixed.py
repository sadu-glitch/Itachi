import pandas as pd
import numpy as np
import re
import json
import os
from datetime import datetime
from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
import logging
import concurrent.futures
import functools
from typing import Dict, List, Any, Optional, Tuple, Set
import time
import io

# [Your existing imports]
import pandas as pd
import numpy as np
import re
import json
# etc...

# Add these helper functions after all imports
def safe_float_conversion(value):
    """
    Safely convert a value to float, handling various number formats:
    - European format (comma as decimal separator)
    - Currency symbols (€, $, etc.)
    - Thousands separators (dot in European format, comma in US format)
    """
    if pd.isna(value):
        return 0.0
        
    # Convert to string firsttt
    str_value = str(value).strip()
    
    # Return 0 for empty strings
    if not str_value:
        return 0.0
    
    # Remove currency symbols and other non-numeric charactersss
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

# 1. Enhance the make_json_serializable function to better handle NaN values
def make_json_serializable(obj):
    """
    Convert objects that are not JSON serializable to serializable formats
    """
    if isinstance(obj, pd.Timestamp):
        return obj.strftime('%Y-%m-%d %H:%M:%S')
    elif isinstance(obj, pd.Series):
        # Convert NaN values to None in Series
        return {k: None if pd.isna(v) else make_json_serializable(v) for k, v in obj.to_dict().items()}
    elif isinstance(obj, pd.DataFrame):
        # Handle NaN values in DataFrame
        records = obj.to_dict(orient='records')
        return [{k: None if pd.isna(v) else make_json_serializable(v) for k, v in record.items()} for record in records]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return [None if pd.isna(x) else make_json_serializable(x) for x in obj.tolist()]
    elif pd.isna(obj):
        return None
    else:
        return obj

class JSONEncoder(json.JSONEncoder):
    """
    Custom JSON encoder that handles pandas and numpy types
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
        return make_json_serializable(obj)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("msp_sap_integration")

# Azure Storage credentials
MOCK_DATA_SAS_URL = "https://financedatastore.blob.core.windows.net/mock-data?sp=racwdli&st=2025-05-05T14:24:17Z&se=2026-12-30T23:24:17Z&spr=https&sv=2024-11-04&sr=c&sig=4qw%2BrpMKNCvKzNAN0%2FIaeS%2BU0Qenb1YhJDhpJDaVMC0%3D"
PROCESSED_DATA_SAS_URL = "https://financedatastore.blob.core.windows.net/processed-data?sp=racwdli&st=2025-05-05T14:27:31Z&se=2026-08-30T22:27:31Z&spr=https&sv=2024-11-04&sr=c&sig=3OHdNWWQ%2FRuGyxebi8746XC1%2F1Cc3uzld9wjrdFIfL0%3D"

# Create BlobServiceClient objects for each container
mock_data_container_client = ContainerClient.from_container_url(MOCK_DATA_SAS_URL)
processed_data_container_client = ContainerClient.from_container_url(PROCESSED_DATA_SAS_URL)

# Constants
BATCH_SIZE = 1000  # Number of records to process in a batch
MAX_WORKERS = 8    # Maximum number of parallel workers
CACHE_EXPIRY = 3600  # Cache expiry in seconds

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
# Main function
# -----------------------------------------------------------------------------

def main() -> None:
    """
    Main function to process the daily data from raw containers
    """
    start_time = time.time()
    logger.info('Data processing started at: %s', datetime.now())
    
    try:
        # Step 1: Extract data from mock-data container
        logger.info("Loading data from mock-data container...")
        sap_data = read_from_blob("mock-data", "SAPData.xlsx")
        msp_data = read_from_blob("mock-data", "MSPData.xlsx")
        mapping_floor = read_from_blob("mock-data", "MappingU.xlsx", sheet_name="Floor")
        mapping_hq = read_from_blob("mock-data", "MappingU.xlsx", sheet_name="HQ")
        
        # Log column names for debugging
        logger.info(f"SAP data columns: {sap_data.columns.tolist()}")
        logger.info(f"MSP data columns: {msp_data.columns.tolist()}")
        logger.info(f"Mapping Floor columns: {mapping_floor.columns.tolist()}")
        logger.info(f"Mapping HQ columns: {mapping_hq.columns.tolist()}")
        
        # Retrieve previous processed data for comparison and tracking
        try:
            previous_data = read_from_blob("processed-data", "transactions.json", as_json=True)
        except Exception as e:
            logger.warning(f"No previous data found, initializing: {str(e)}")
            previous_data = {"transactions": [], "parked_measures": []}
        
        # Step 2: Create indexes for faster lookups
        logger.info("Creating indexes for data lookups...")
        msp_index = create_msp_index(msp_data)
        mapping_index = create_mapping_index(mapping_floor, mapping_hq)
        previous_parked_index = create_previous_parked_index(previous_data)
        
        # Clear caches before processing
        kostenstelle_cache.clear()
        bestellnummer_cache.clear()
        department_cache.clear()
        
        # Step 3: Process data in batches with parallelization
        logger.info("Processing data in parallel batches...")
        processed_data = process_data_in_batches(
            sap_data, 
            msp_data, 
            msp_index,
            mapping_index, 
            previous_parked_index,
            previous_data
        )
        
        # Step 4: Save processed data to processed-data container
        logger.info("Saving processed data...")
        save_to_blob("processed-data", "transactions.json", processed_data)
        
        # Step 5: Generate frontend-specific views
        logger.info("Generating frontend views...")
        generate_frontend_views(processed_data)
        
        elapsed_time = time.time() - start_time
        logger.info('Data processing completed successfully in %.2f seconds at: %s', 
                   elapsed_time, datetime.now())
    
    except Exception as e:
        logger.error('Error in data processing: %s', str(e), exc_info=True)
        raise

# -----------------------------------------------------------------------------
# Indexing functions
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
# Batch processing functions
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

def process_parked_measures(
    msp_data: pd.DataFrame, 
    matched_bestellnummern: Set[int],
    previous_parked_index: Dict[int, Dict]
) -> List[Dict]:
    """
    Process unmatched MSP measures with improved NaN handling
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
                # You may need to customize this based on your specific department naming convention
                location_type = infer_location_type_from_department(department)
            
            # Use safe conversion for estimated amount
            estimated_amount = safe_float_conversion(safe_get(measure, 'Benötigtes Budget (Geschätzt)', 0))
            
            # Create dictionary with safe handling for all fields
            measure_data = {k: None if pd.isna(v) else v for k, v in measure.to_dict().items()}
            
            parked_measure = {
                'measure_id': str(bestellnummer),
                'bestellnummer': int(bestellnummer),
                'measure_title': safe_get(measure, 'Titel der Maßnahme', ''),
                'estimated_amount': estimated_amount,
                'measure_date': str(safe_get(measure, 'Datum', '')),
                'name': safe_get(measure, 'Name', ''),
                'category': 'PARKED_MEASURE',
                'status': 'Manually assigned, awaiting SAP' if manual_assignment else 'Awaiting Assignment',
                'budget_impact': 'Reserved',
                'department': department,
                'region': manual_assignment.get('region', '') if manual_assignment else '',
                'district': manual_assignment.get('district', '') if manual_assignment else '',
                'location_type': location_type,  # Add the location type field
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
# Cached helper functions
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
        
        # Log for debugging
        logger.info(f"Extracted Kostenstelle digits: {extracted_digits} from {kostenstelle}")
        
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
# IO functions
# -----------------------------------------------------------------------------

def read_from_blob(container_name: str, blob_name: str, sheet_name=None, as_json=False) -> Any:
    """
    Read data from Azure Blob Storage using the appropriate container client
    """
    logger.info(f"Reading {blob_name} from {container_name} container")
    
    start_time = time.time()
    
    # Select the appropriate container client
    if container_name == "mock-data":
        container_client = mock_data_container_client
    elif container_name == "processed-data":
        container_client = processed_data_container_client
    else:
        raise ValueError(f"Unknown container name: {container_name}")
    
    # Get blob client for the blob
    blob_client = container_client.get_blob_client(blob_name)
    
    # Download the blob
    try:
        download_stream = blob_client.download_blob()
        
        if blob_name.endswith('.csv'):
            # For CSV files
            content = download_stream.readall()
            data = pd.read_csv(io.BytesIO(content))
        elif blob_name.endswith('.xlsx'):
            # For Excel files
            content = download_stream.readall()
            if sheet_name:
                # Read specific sheet if provided
                data = pd.read_excel(io.BytesIO(content), sheet_name=sheet_name)
            else:
                # Read first sheet if no sheet name provided
                data = pd.read_excel(io.BytesIO(content))
        elif as_json:
            # For JSON files
            content = download_stream.readall()
            data = json.loads(content.decode('utf-8'))
        else:
            # For other blob types
            data = download_stream.readall()
    except Exception as e:
        logger.error(f"Error reading blob {blob_name}: {str(e)}")
        raise
    
    elapsed_time = time.time() - start_time
    logger.info(f"Read {blob_name} in {elapsed_time:.2f} seconds")
    return data

def save_to_blob(container_name: str, blob_name: str, data: Any) -> None:
    """
    Save data to Azure Blob Storage using the appropriate container client
    """
    logger.info(f"Saving {blob_name} to {container_name} container")
    
    start_time = time.time()
    
    # Select the appropriate container client
    if container_name == "mock-data":
        container_client = mock_data_container_client
    elif container_name == "processed-data":
        container_client = processed_data_container_client
    else:
        raise ValueError(f"Unknown container name: {container_name}")
    
    # Get blob client for the blob
    blob_client = container_client.get_blob_client(blob_name)
    
    # Prepare data for upload
    if isinstance(data, dict):
        # Use the custom JSONEncoder to handle pandas types
        upload_data = json.dumps(data, indent=2, cls=JSONEncoder).encode('utf-8')
    else:
        upload_data = data
    
    # Upload the blob
    try:
        blob_client.upload_blob(upload_data, overwrite=True)
    except Exception as e:
        logger.error(f"Error uploading blob {blob_name}: {str(e)}")
        raise
    
    elapsed_time = time.time() - start_time
    logger.info(f"Saved {blob_name} in {elapsed_time:.2f} seconds")

# -----------------------------------------------------------------------------
# Frontend view generation
# -----------------------------------------------------------------------------

def generate_frontend_views(processed_data: Dict) -> None:
    """
    Generate specialized views for frontend consumption with improved NaN handling
    """
    start_time = time.time()
    
    # 1. Department-level view with location type
    departments = {}
    
    for tx in processed_data['transactions']:
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
    
    for tx in processed_data['transactions']:
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
    
    # 3. Awaiting assignment view (parked measures grouped by department and location type)
    awaiting_assignment = {}
    
    for measure in processed_data['parked_measures']:
        if measure.get('status') != 'Awaiting Assignment':
            continue
            
        # Get department with empty string fallback
        dept = measure.get('department', '')
        location_type = measure.get('location_type', 'Unknown')  # Get location type
        
        if not dept:
            # If no department, put in 'Unassigned' category
            dept = 'Unassigned'
        
        # Create a combined key for department and location type
        dept_key = f"{dept}|{location_type}"
            
        if dept_key not in awaiting_assignment:
            awaiting_assignment[dept_key] = []
            
        # Create a safe version of the measure data
        safe_measure = {
            'measure_id': measure.get('measure_id', ''),
            'bestellnummer': measure.get('bestellnummer', 0),
            'measure_title': measure.get('measure_title', ''),
            'estimated_amount': safe_float_conversion(measure.get('estimated_amount', 0)),
            'measure_date': measure.get('measure_date', ''),
            'department': dept,
            'location_type': location_type,  # Add the location type
            'name': measure.get('name', '')  # Empty string as fallback
        }
            
        awaiting_assignment[dept_key].append(safe_measure)
    
    # Save the views to blob storage in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        executor.submit(save_to_blob, "processed-data", "frontend_departments.json", {'departments': departments_list})
        executor.submit(save_to_blob, "processed-data", "frontend_regions.json", {'regions': regions_list})
        executor.submit(save_to_blob, "processed-data", "frontend_awaiting_assignment.json", awaiting_assignment)
    
    # 4. Budget allocation view (to be populated by the frontend)
    # Initialize with default values based on departments and regions
    budget_allocation = {
        'departments': {},
        'regions': {}
    }
    
    for dept in departments_list:
        # Include location_type in the key
        dept_key = f"{dept['name']}|{dept['location_type']}"
        budget_allocation['departments'][dept_key] = {
            'allocated_budget': 0,  # To be set by admin
            'location_type': dept['location_type']  # Add location type
        }
        
    for region in regions_list:
        # Include location_type in the key
        region_key = f"{region['department']}|{region['name']}|{region['location_type']}"
        budget_allocation['regions'][region_key] = {
            'allocated_budget': 0,  # To be set by admin
            'location_type': region['location_type']  # Add location type
        }
    
    # Try to read existing budget allocation
    try:
        existing_budget = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
        # Merge with initialized structure
        for dept_key, dept_data in existing_budget.get('departments', {}).items():
            if dept_key in budget_allocation['departments']:
                budget_allocation['departments'][dept_key] = dept_data
                
        for region_key, region_data in existing_budget.get('regions', {}).items():
            if region_key in budget_allocation['regions']:
                budget_allocation['regions'][region_key] = region_data
    except Exception as e:
        logger.warning(f"No existing budget allocation found: {str(e)}")
    
    save_to_blob("processed-data", "budget_allocation.json", budget_allocation)
    
    elapsed_time = time.time() - start_time
    logger.info(f"Generated frontend views in {elapsed_time:.2f} seconds")