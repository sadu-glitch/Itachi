from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import sys
import io
import json
import pandas as pd
import tempfile
from datetime import datetime
import logging
from urllib.parse import unquote
import ast
from sqlalchemy import text
import time

# Database-integrated imports
try:
    from msp_sap_integration_fixed import (
        safe_float_conversion, 
        JSONEncoder,
        DatabaseManager,
        get_processed_data_from_database,
        save_to_database_as_json,
        main as process_data_main
    )
except ImportError:
    # Fall back to shared folder if not found
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
    from msp_sap_integration_fixed import (
        safe_float_conversion, 
        JSONEncoder,
        DatabaseManager,
        get_processed_data_from_database,
        save_to_database_as_json,
        main as process_data_main
    )

# Database constants
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("msp_sap_api_db")

# Initialize database manager (will be set up when first used)
db_manager = None

def get_db_manager():
    """Get or create database manager instance"""
    global db_manager
    if db_manager is None:
        db_manager = DatabaseManager()
    return db_manager
def reset_connection(self):
    """Reset database connection if it's stale"""
    try:
        if self.engine:
            self.engine.dispose()
        self._setup_connection()
        logger.info("✅ Database connection reset successfully")
    except Exception as e:
        logger.error(f"❌ Failed to reset connection: {e}")
        raise

def parse_python_string_to_list(python_string):
    """Helper function to safely parse Python string representations to lists"""
    try:
        return ast.literal_eval(python_string)
    except (ValueError, SyntaxError) as e:
        logger.error(f"Failed to parse Python string: {str(e)}")
        return []
def safe_parse_json_fields(data):
    """
    FIXED VERSION: Properly parse the string representations stored in database
    Fixed the 'str' object has no attribute 'get' error
    """
    if not isinstance(data, dict):
        logger.warning(f"⚠️ Expected dict, got {type(data)}: {data}")
        return {}
    
    # These keys are stored as Python string representations in your database
    keys_to_parse = ['transactions', 'parked_measures', 'direct_costs', 'booked_measures', 'outliers', 'placeholders']
    
    for key in keys_to_parse:
        if key in data:
            value = data[key]
            
            if isinstance(value, str):
                try:
                    # STEP 1: Try parsing as Python literal (your current format)
                    import ast
                    parsed_value = ast.literal_eval(value)
                    data[key] = parsed_value
                    logger.info(f"✅ Parsed {key} from Python string: {len(parsed_value) if isinstance(parsed_value, list) else 'not a list'} items")
                    
                except (ValueError, SyntaxError) as e:
                    try:
                        # STEP 2: Try parsing as JSON
                        import json
                        parsed_value = json.loads(value)
                        data[key] = parsed_value
                        logger.info(f"✅ Parsed {key} from JSON string: {len(parsed_value) if isinstance(parsed_value, list) else 'not a list'} items")
                        
                    except json.JSONDecodeError as json_error:
                        logger.error(f"❌ Failed to parse {key}: AST error: {e}, JSON error: {json_error}")
                        logger.error(f"Sample data: {value[:200]}...")
                        data[key] = []
            
            elif isinstance(value, list):
                # Already a list, keep it
                logger.info(f"✅ {key} already a list: {len(value)} items")
            
            else:
                logger.warning(f"⚠️ {key} is unexpected type: {type(value)}")
                data[key] = []
    
    return data

# NEW SIMPLIFIED TRANSACTIONS ENDPOINT - ADD THIS TO YOUR API

@app.route('/api/transactions-simple', methods=['GET'])
def get_transactions_simple():
    """
    SIMPLIFIED VERSION: Get transactions with better error handling
    """
    try:
        logger.info("🔍 Starting SIMPLE /api/transactions request...")
        
        # Get query parameters for filtering
        department = request.args.get('department')
        region = request.args.get('region')
        status = request.args.get('status')
        category = request.args.get('category')
        
        logger.info(f"🔍 Filters: department={department}, region={region}, status={status}, category={category}")
        
        # Get raw data from database with better error handling
        try:
            raw_data = get_processed_data_from_database("transactions")
            logger.info(f"✅ Raw data type: {type(raw_data)}")
            
            if not isinstance(raw_data, dict):
                logger.error(f"❌ Expected dict, got {type(raw_data)}")
                return jsonify({
                    "error": "Invalid data format from database",
                    "message": f"Expected dict, got {type(raw_data)}"
                }), 500
            
            logger.info(f"✅ Raw data keys: {list(raw_data.keys())}")
            
        except Exception as e:
            logger.error(f"❌ Failed to load raw data: {str(e)}")
            return jsonify({
                "error": "Could not load data from database",
                "message": str(e)
            }), 500
        
        # Parse data safely with improved error handling
        try:
            # Make a copy to avoid modifying original
            parsed_data = raw_data.copy()
            
            # Parse each field individually with better error handling
            def safe_parse_field(data_dict, field_name):
                if field_name not in data_dict:
                    logger.info(f"⚠️ Field {field_name} not found in data")
                    return []
                
                field_value = data_dict[field_name]
                
                if isinstance(field_value, list):
                    logger.info(f"✅ {field_name} already a list: {len(field_value)} items")
                    return field_value
                
                elif isinstance(field_value, str):
                    logger.info(f"🔄 {field_name} is string, attempting to parse...")
                    try:
                        # Try ast.literal_eval first
                        parsed = ast.literal_eval(field_value)
                        if isinstance(parsed, list):
                            logger.info(f"✅ {field_name} parsed successfully: {len(parsed)} items")
                            return parsed
                        else:
                            logger.warning(f"⚠️ {field_name} parsed but not a list: {type(parsed)}")
                            return []
                    except Exception as parse_error:
                        logger.error(f"❌ Failed to parse {field_name}: {parse_error}")
                        logger.error(f"Sample content: {field_value[:100]}...")
                        return []
                
                else:
                    logger.warning(f"⚠️ {field_name} unexpected type: {type(field_value)}")
                    return []
            
            # Parse all the transaction arrays
            all_transactions = safe_parse_field(parsed_data, 'transactions')
            direct_costs = safe_parse_field(parsed_data, 'direct_costs')
            booked_measures = safe_parse_field(parsed_data, 'booked_measures')
            parked_measures = safe_parse_field(parsed_data, 'parked_measures')
            outliers = safe_parse_field(parsed_data, 'outliers')
            placeholders = safe_parse_field(parsed_data, 'placeholders')
            
            # Get statistics (should be a dict, not a string)
            statistics = parsed_data.get('statistics', {})
            if isinstance(statistics, str):
                try:
                    statistics = ast.literal_eval(statistics)
                except:
                    statistics = {}
            
            logger.info(f"📊 Parsed counts: all={len(all_transactions)}, direct={len(direct_costs)}, booked={len(booked_measures)}, parked={len(parked_measures)}, outliers={len(outliers)}")
            
        except Exception as e:
            logger.error(f"❌ Failed to parse data: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return jsonify({
                "error": "Could not parse data",
                "message": str(e),
                "traceback": traceback.format_exc()
            }), 500
        
        # If main transactions array is empty, try to rebuild it
        if len(all_transactions) == 0 and (len(direct_costs) > 0 or len(booked_measures) > 0 or len(parked_measures) > 0):
            logger.info("🔧 Rebuilding transactions array from components...")
            all_transactions = []
            all_transactions.extend(direct_costs)
            all_transactions.extend(booked_measures)
            all_transactions.extend(parked_measures)
            all_transactions.extend(outliers)
            all_transactions.extend(placeholders)
            logger.info(f"🔧 Rebuilt transactions array: {len(all_transactions)} total")
        
        # Apply filters
        filtered_transactions = all_transactions
        
        if department:
            filtered_transactions = [tx for tx in filtered_transactions if isinstance(tx, dict) and tx.get('department') == department]
            logger.info(f"🔍 After department filter: {len(filtered_transactions)}")
        
        if region:
            filtered_transactions = [tx for tx in filtered_transactions if isinstance(tx, dict) and tx.get('region') == region]
            logger.info(f"🔍 After region filter: {len(filtered_transactions)}")
        
        if status:
            filtered_transactions = [tx for tx in filtered_transactions if isinstance(tx, dict) and tx.get('status') == status]
            logger.info(f"🔍 After status filter: {len(filtered_transactions)}")
        
        if category:
            filtered_transactions = [tx for tx in filtered_transactions if isinstance(tx, dict) and tx.get('category') == category]
            logger.info(f"🔍 After category filter: {len(filtered_transactions)}")
        
        # Filter parked measures too
        filtered_parked_measures = parked_measures
        if department:
            filtered_parked_measures = [m for m in parked_measures if isinstance(m, dict) and m.get('department') == department]
        
        # Build response
        response_data = {
            "transactions": filtered_transactions,
            "parked_measures": filtered_parked_measures,
            "direct_costs": direct_costs,
            "booked_measures": booked_measures,
            "outliers": outliers,
            "placeholders": placeholders,
            "statistics": statistics,
            "summary": {
                "total_transactions": len(all_transactions),
                "filtered_transactions": len(filtered_transactions),
                "parsing_method": "SIMPLIFIED_SAFE_PARSING",
                "by_category": {
                    "DIRECT_COST": len([tx for tx in all_transactions if isinstance(tx, dict) and tx.get('category') == 'DIRECT_COST']),
                    "BOOKED_MEASURE": len([tx for tx in all_transactions if isinstance(tx, dict) and tx.get('category') == 'BOOKED_MEASURE']),
                    "PARKED_MEASURE": len([tx for tx in all_transactions if isinstance(tx, dict) and tx.get('category') == 'PARKED_MEASURE']),
                    "UNASSIGNED_MEASURE": len([tx for tx in all_transactions if isinstance(tx, dict) and tx.get('category') == 'UNASSIGNED_MEASURE']),
                    "OUTLIER": len([tx for tx in all_transactions if isinstance(tx, dict) and tx.get('category') == 'OUTLIER'])
                }
            },
            "filters_applied": {
                "department": department,
                "region": region,
                "status": status,
                "category": category
            },
            "debug_info": {
                "endpoint": "SIMPLIFIED VERSION",
                "raw_data_type": type(raw_data).__name__,
                "raw_data_keys": list(raw_data.keys()) if isinstance(raw_data, dict) else "N/A"
            }
        }
        
        logger.info(f"🎯 Returning simplified response with {len(filtered_transactions)} transactions")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error in simplified transactions endpoint: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": "Failed to fetch transactions (SIMPLIFIED version)",
            "message": str(e),
            "traceback": traceback.format_exc()
        }), 500
    
@app.route('/')
def home():
    """Home endpoint"""
    return {
        "status": "online",
        "service": "MSP-SAP Integration API (Database Version)",
        "version": "2.0.0",
        "storage": "Azure SQL Database",
        "timestamp": datetime.now().isoformat()
    }

@app.route('/api/data', methods=['GET'])
def get_data():
    """Retrieve all processed data for the frontend from database"""
    try:
        logger.info("🔍 Starting /api/data request...")
        
        # Read all the processed data from database
        try:
            transactions = get_processed_data_from_database("transactions")
            logger.info(f"✅ Loaded transactions: {type(transactions)}")
        except Exception as e:
            logger.error(f"❌ Failed to load transactions: {str(e)}")
            transactions = {"error": str(e), "message": "Could not read transactions data"}
            
        try:
            departments_data = get_processed_data_from_database("frontend_departments")
            logger.info(f"🔍 Raw departments_data: {departments_data}")
            
            # ✅ FIXED: Use enhanced parsing with Python string support
            if departments_data and 'departments' in departments_data:
                dept_string = departments_data['departments']
                if isinstance(dept_string, str):
                    departments = parse_python_string_to_list(dept_string)
                    logger.info(f"✅ Parsed departments from Python string: {len(departments)} items")
                else:
                    departments = dept_string if isinstance(dept_string, list) else []
            else:
                departments = []
                
        except Exception as e:
            logger.error(f"❌ Failed to load departments: {str(e)}")
            departments = []
        
        try:
            regions_data = get_processed_data_from_database("frontend_regions")
            logger.info(f"🔍 Raw regions_data: {regions_data}")
            
            # ✅ FIXED: Use enhanced parsing with Python string support
            if regions_data and 'regions' in regions_data:
                regions_string = regions_data['regions']
                if isinstance(regions_string, str):
                    regions = parse_python_string_to_list(regions_string)
                    logger.info(f"✅ Parsed regions from Python string: {len(regions)} items")
                else:
                    regions = regions_string if isinstance(regions_string, list) else []
            else:
                regions = []
                
        except Exception as e:
            logger.error(f"❌ Failed to load regions: {str(e)}")
            regions = []
        
        try:
            awaiting = get_processed_data_from_database("frontend_awaiting_assignment")
            logger.info(f"✅ Loaded awaiting assignment: {type(awaiting)}")
            
            # Parse awaiting assignment strings too
            if isinstance(awaiting, dict):
                for dept_name, measures in awaiting.items():
                    if isinstance(measures, str):
                        try:
                            awaiting[dept_name] = parse_python_string_to_list(measures)
                            logger.info(f"✅ Parsed awaiting measures for {dept_name}")
                        except Exception as parse_error:
                            logger.error(f"❌ Failed to parse awaiting measures for {dept_name}: {str(parse_error)}")
                            awaiting[dept_name] = []
            
        except Exception as e:
            logger.error(f"❌ Failed to load awaiting assignment: {str(e)}")
            awaiting = {}
        
        try:
            budgets = get_processed_data_from_database("budget_allocation")
            logger.info(f"✅ Loaded budget allocation: {type(budgets)}")
        except Exception as e:
            logger.error(f"❌ Failed to load budget allocation: {str(e)}")
            budgets = {}
        
        # Build the response
        response_data = {
            "departments": departments,
            "regions": regions,  
            "awaiting_assignment": awaiting,
            "budget_allocation": budgets,
            "transaction_stats": transactions.get('statistics', {}) if isinstance(transactions, dict) else {}
        }
        
        logger.info(f"🎯 FINAL RESPONSE SUMMARY:")
        logger.info(f"  - departments: {len(departments)} items (type: {type(departments)})")
        logger.info(f"  - regions: {len(regions)} items (type: {type(regions)})")
        logger.info(f"  - awaiting_assignment: {type(awaiting)} with {len(awaiting)} departments")
        logger.info(f"  - budget_allocation: {type(budgets)}")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Critical error in /api/data: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Get transactions data - FIXED VERSION"""
    try:
        logger.info("🔍 Starting /api/transactions request...")
        
        # Get query parameters for filtering
        department = request.args.get('department')
        region = request.args.get('region')
        status = request.args.get('status')
        category = request.args.get('category')
        
        logger.info(f"🔍 Filters: department={department}, region={region}, status={status}, category={category}")
        
        # Get the complete transactions data from database
        try:
            transactions_data = get_processed_data_from_database("transactions")
            logger.info(f"✅ Loaded transactions data from database: {type(transactions_data)}")
            
            # Parse any JSON string fields that might exist
            transactions_data = safe_parse_json_fields(transactions_data)
            
        except Exception as e:
            logger.error(f"❌ Failed to load transactions: {str(e)}")
            return jsonify({
                "transactions": [],
                "parked_measures": [],
                "direct_costs": [],
                "booked_measures": [],
                "error": "Could not load transactions data",
                "message": str(e)
            }), 500
        
        # ✅ CRITICAL FIX: Extract arrays with proper parsing for ALL arrays
        all_transactions = transactions_data.get('transactions', [])
        parked_measures = transactions_data.get('parked_measures', [])
        direct_costs = transactions_data.get('direct_costs', [])
        booked_measures = transactions_data.get('booked_measures', [])
        outliers = transactions_data.get('outliers', [])
        placeholders = transactions_data.get('placeholders', [])
        statistics = transactions_data.get('statistics', {})

        # ✅ STEP 1: Parse string representations if needed for ALL arrays
        def ensure_list(data, array_name):
            if isinstance(data, str):
                try:
                    parsed = parse_python_string_to_list(data)
                    logger.info(f"✅ Parsed {array_name} from string: {len(parsed)} items")
                    return parsed
                except Exception as e:
                    logger.error(f"❌ Failed to parse {array_name}: {e}")
                    return []
            elif isinstance(data, list):
                logger.info(f"✅ {array_name} already a list: {len(data)} items")
                return data
            else:
                logger.warning(f"⚠️ {array_name} is unexpected type: {type(data)}")
                return []

        # Apply parsing to ALL arrays
        all_transactions = ensure_list(all_transactions, "transactions")
        parked_measures = ensure_list(parked_measures, "parked_measures")
        direct_costs = ensure_list(direct_costs, "direct_costs")
        booked_measures = ensure_list(booked_measures, "booked_measures")
        outliers = ensure_list(outliers, "outliers")
        placeholders = ensure_list(placeholders, "placeholders")

        # ✅ STEP 2: If transactions array is STILL empty, rebuild it from components
        if len(all_transactions) == 0 and (len(direct_costs) > 0 or len(booked_measures) > 0 or len(parked_measures) > 0):
            logger.info("🔧 FIXING: transactions array is empty, rebuilding from component arrays...")
            
            # Rebuild the complete transactions array from components
            all_transactions = []
            
            # Add direct costs
            if direct_costs:
                all_transactions.extend(direct_costs)
                logger.info(f"✅ Added {len(direct_costs)} direct costs to transactions")
            
            # Add booked measures  
            if booked_measures:
                all_transactions.extend(booked_measures)
                logger.info(f"✅ Added {len(booked_measures)} booked measures to transactions")
            
            # Add parked measures
            if parked_measures:
                all_transactions.extend(parked_measures)
                logger.info(f"✅ Added {len(parked_measures)} parked measures to transactions")
            
            # Add outliers if they exist
            if outliers:
                all_transactions.extend(outliers)
                logger.info(f"✅ Added {len(outliers)} outliers to transactions")
            
            # Add placeholders if they exist
            if placeholders:
                all_transactions.extend(placeholders)
                logger.info(f"✅ Added {len(placeholders)} placeholders to transactions")
            
            logger.info(f"🔧 FIXED: Rebuilt transactions array with {len(all_transactions)} total transactions")

        logger.info(f"📊 FINAL COUNTS: all={len(all_transactions)}, parked={len(parked_measures)}, direct={len(direct_costs)}, booked={len(booked_measures)}, outliers={len(outliers)}")

        # ✅ STEP 3: Validate the arrays contain correct data types
        def validate_array_content(array, array_name):
            if len(array) > 0:
                sample = array[0]
                if isinstance(sample, dict):
                    logger.info(f"✅ {array_name} contains proper dict objects")
                    if 'category' in sample:
                        categories = list(set([item.get('category', 'NO_CATEGORY') for item in array[:100]]))  # Check first 100
                        logger.info(f"✅ {array_name} categories: {categories}")
                else:
                    logger.warning(f"⚠️ {array_name} contains {type(sample)} instead of dict")

        validate_array_content(all_transactions, "all_transactions")
        validate_array_content(parked_measures, "parked_measures") 
        validate_array_content(direct_costs, "direct_costs")
        validate_array_content(booked_measures, "booked_measures")
        
        # Apply filters to the main transactions array (which contains all transaction types)
        filtered_transactions = all_transactions
        
        if department:
            filtered_transactions = [
                tx for tx in filtered_transactions 
                if tx.get('department') == department
            ]
            logger.info(f"🔍 After department filter '{department}': {len(filtered_transactions)} transactions")
        
        if region:
            filtered_transactions = [
                tx for tx in filtered_transactions 
                if tx.get('region') == region
            ]
            logger.info(f"🔍 After region filter '{region}': {len(filtered_transactions)} transactions")
        
        if status:
            filtered_transactions = [
                tx for tx in filtered_transactions 
                if tx.get('status') == status
            ]
            logger.info(f"🔍 After status filter '{status}': {len(filtered_transactions)} transactions")
        
        if category:
            filtered_transactions = [
                tx for tx in filtered_transactions 
                if tx.get('category') == category
            ]
            logger.info(f"🔍 After category filter '{category}': {len(filtered_transactions)} transactions")
        
        # Also filter parked_measures if department filter is applied (this is what your components need)
        filtered_parked_measures = parked_measures
        if department:
            filtered_parked_measures = [
                measure for measure in parked_measures 
                if measure.get('department') == department
            ]
            logger.info(f"🔍 Filtered parked measures for '{department}': {len(filtered_parked_measures)} measures")
        
        # Build comprehensive response based on your processing code structure
        response_data = {
            # Main transactions array (filtered)
            "transactions": filtered_transactions,
            
            # Separate arrays for specific use cases (important for your components)
            "parked_measures": filtered_parked_measures,
            "direct_costs": direct_costs,
            "booked_measures": booked_measures,
            "outliers": outliers,
            "placeholders": placeholders,
            
            # Statistics from processing
            "statistics": statistics,
            
            # Summary information
            "summary": {
                "total_transactions": len(all_transactions),
                "filtered_transactions": len(filtered_transactions),
                "by_category": {
                    "DIRECT_COST": len([tx for tx in all_transactions if tx.get('category') == 'DIRECT_COST']),
                    "BOOKED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'BOOKED_MEASURE']),
                    "PARKED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'PARKED_MEASURE']),
                    "UNASSIGNED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'UNASSIGNED_MEASURE']),
                    "OUTLIER": len([tx for tx in all_transactions if tx.get('category') == 'OUTLIER'])
                },
                "by_budget_impact": {
                    "Booked": len([tx for tx in all_transactions if tx.get('budget_impact') == 'Booked']),
                    "Reserved": len([tx for tx in all_transactions if tx.get('budget_impact') == 'Reserved']),
                    "None": len([tx for tx in all_transactions if tx.get('budget_impact') == 'None'])
                },
                "by_location_type": {
                    "Floor": len([tx for tx in all_transactions if tx.get('location_type') == 'Floor']),
                    "HQ": len([tx for tx in all_transactions if tx.get('location_type') == 'HQ']),
                    "Unknown": len([tx for tx in all_transactions if tx.get('location_type') == 'Unknown'])
                }
            },
            
            # Filters that were applied
            "filters_applied": {
                "department": department,
                "region": region,
                "status": status,
                "category": category
            },
            
            # Processing metadata
            "processing_date": transactions_data.get('processing_date'),
            "data_source": "Azure SQL Database"
        }
        
        logger.info(f"🎯 Returning {len(filtered_transactions)} transactions with {len(filtered_parked_measures)} parked measures")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error in /api/transactions: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "transactions": [],
            "parked_measures": [],
            "direct_costs": [],
            "booked_measures": [],
            "error": "Failed to fetch transactions",
            "message": str(e)
        }), 500

@app.route('/api/transactions-fixed', methods=['GET'])
def get_transactions_fixed():
    """
    FIXED VERSION: Get transactions with proper parsing and debugging
    """
    try:
        logger.info("🔍 Starting FIXED /api/transactions request...")
        
        # Get query parameters
        department = request.args.get('department')
        region = request.args.get('region')
        status = request.args.get('status')
        category = request.args.get('category')
        
        logger.info(f"🔍 Filters: department={department}, region={region}, status={status}, category={category}")
        
        # Get raw data from database
        try:
            raw_transactions_data = get_processed_data_from_database("transactions")
            logger.info(f"✅ Raw data type: {type(raw_transactions_data)}")
            
            if isinstance(raw_transactions_data, dict):
                logger.info(f"✅ Raw data keys: {list(raw_transactions_data.keys())}")
                
                # Check the transactions field specifically
                trans_field = raw_transactions_data.get('transactions')
                logger.info(f"✅ Transactions field type: {type(trans_field)}")
                
                if isinstance(trans_field, str):
                    logger.info(f"✅ Transactions field is string, first 200 chars: {trans_field[:200]}...")
            
        except Exception as e:
            logger.error(f"❌ Failed to load raw transactions: {str(e)}")
            return jsonify({
                "error": "Could not load raw transactions data",
                "message": str(e)
            }), 500
        
        # Parse the data using FIXED function
        try:
            parsed_transactions_data = safe_parse_json_fields(raw_transactions_data.copy())
            logger.info(f"✅ Parsed data successfully")
            
            # Validate parsing worked
            transactions = parsed_transactions_data.get('transactions', [])
            logger.info(f"✅ Parsed transactions type: {type(transactions)}")
            logger.info(f"✅ Parsed transactions count: {len(transactions) if isinstance(transactions, list) else 'NOT A LIST'}")
            
            if isinstance(transactions, list) and len(transactions) > 0:
                sample_tx = transactions[0]
                logger.info(f"✅ Sample transaction type: {type(sample_tx)}")
                if isinstance(sample_tx, dict):
                    logger.info(f"✅ Sample transaction keys: {list(sample_tx.keys())}")
                    logger.info(f"✅ Sample category: {sample_tx.get('category', 'NO_CATEGORY')}")
            
        except Exception as e:
            logger.error(f"❌ Failed to parse transactions: {str(e)}")
            return jsonify({
                "error": "Could not parse transactions data",
                "message": str(e),
                "raw_data_type": type(raw_transactions_data).__name__
            }), 500
        
        # ✅ CRITICAL FIX: Extract arrays with proper parsing for ALL arrays
        all_transactions = parsed_transactions_data.get('transactions', [])
        parked_measures = parsed_transactions_data.get('parked_measures', [])
        direct_costs = parsed_transactions_data.get('direct_costs', [])
        booked_measures = parsed_transactions_data.get('booked_measures', [])
        outliers = parsed_transactions_data.get('outliers', [])
        placeholders = parsed_transactions_data.get('placeholders', [])
        statistics = parsed_transactions_data.get('statistics', {})

        # ✅ STEP 1: Parse string representations if needed for ALL arrays
        def ensure_list(data, array_name):
            if isinstance(data, str):
                try:
                    parsed = parse_python_string_to_list(data)
                    logger.info(f"✅ Parsed {array_name} from string: {len(parsed)} items")
                    return parsed
                except Exception as e:
                    logger.error(f"❌ Failed to parse {array_name}: {e}")
                    return []
            elif isinstance(data, list):
                logger.info(f"✅ {array_name} already a list: {len(data)} items")
                return data
            else:
                logger.warning(f"⚠️ {array_name} is unexpected type: {type(data)}")
                return []

        # Apply parsing to ALL arrays
        all_transactions = ensure_list(all_transactions, "transactions")
        parked_measures = ensure_list(parked_measures, "parked_measures")
        direct_costs = ensure_list(direct_costs, "direct_costs")
        booked_measures = ensure_list(booked_measures, "booked_measures")
        outliers = ensure_list(outliers, "outliers")
        placeholders = ensure_list(placeholders, "placeholders")

        # ✅ STEP 2: If transactions array is STILL empty, rebuild it from components
        if len(all_transactions) == 0 and (len(direct_costs) > 0 or len(booked_measures) > 0 or len(parked_measures) > 0):
            logger.info("🔧 FIXING: transactions array is empty, rebuilding from component arrays...")
            
            # Rebuild the complete transactions array from components
            all_transactions = []
            
            # Add direct costs
            if direct_costs:
                all_transactions.extend(direct_costs)
                logger.info(f"✅ Added {len(direct_costs)} direct costs to transactions")
            
            # Add booked measures  
            if booked_measures:
                all_transactions.extend(booked_measures)
                logger.info(f"✅ Added {len(booked_measures)} booked measures to transactions")
            
            # Add parked measures
            if parked_measures:
                all_transactions.extend(parked_measures)
                logger.info(f"✅ Added {len(parked_measures)} parked measures to transactions")
            
            # Add outliers if they exist
            if outliers:
                all_transactions.extend(outliers)
                logger.info(f"✅ Added {len(outliers)} outliers to transactions")
            
            # Add placeholders if they exist
            if placeholders:
                all_transactions.extend(placeholders)
                logger.info(f"✅ Added {len(placeholders)} placeholders to transactions")
            
            logger.info(f"🔧 FIXED: Rebuilt transactions array with {len(all_transactions)} total transactions")

        logger.info(f"📊 FINAL COUNTS: all={len(all_transactions)}, parked={len(parked_measures)}, direct={len(direct_costs)}, booked={len(booked_measures)}, outliers={len(outliers)}")

        # ✅ STEP 3: Validate the arrays contain correct data types
        def validate_array_content(array, array_name):
            if len(array) > 0:
                sample = array[0]
                if isinstance(sample, dict):
                    logger.info(f"✅ {array_name} contains proper dict objects")
                    if 'category' in sample:
                        categories = list(set([item.get('category', 'NO_CATEGORY') for item in array[:100]]))  # Check first 100
                        logger.info(f"✅ {array_name} categories: {categories}")
                else:
                    logger.warning(f"⚠️ {array_name} contains {type(sample)} instead of dict")

        validate_array_content(all_transactions, "all_transactions")
        validate_array_content(parked_measures, "parked_measures") 
        validate_array_content(direct_costs, "direct_costs")
        validate_array_content(booked_measures, "booked_measures")
        
        # Apply filters
        filtered_transactions = all_transactions
        
        if department:
            filtered_transactions = [tx for tx in filtered_transactions if tx.get('department') == department]
            logger.info(f"🔍 After department filter: {len(filtered_transactions)} transactions")
        
        if region:
            filtered_transactions = [tx for tx in filtered_transactions if tx.get('region') == region]
            logger.info(f"🔍 After region filter: {len(filtered_transactions)} transactions")
        
        if status:
            filtered_transactions = [tx for tx in filtered_transactions if tx.get('status') == status]
            logger.info(f"🔍 After status filter: {len(filtered_transactions)} transactions")
        
        if category:
            filtered_transactions = [tx for tx in filtered_transactions if tx.get('category') == category]
            logger.info(f"🔍 After category filter: {len(filtered_transactions)} transactions")
        
        # Filter parked measures
        filtered_parked_measures = parked_measures
        if department:
            filtered_parked_measures = [measure for measure in parked_measures if measure.get('department') == department]
        
        # Build response
        response_data = {
            "transactions": filtered_transactions,
            "parked_measures": filtered_parked_measures,
            "direct_costs": direct_costs,
            "booked_measures": booked_measures,
            "outliers": outliers,
            "placeholders": placeholders,
            "statistics": statistics,
            "summary": {
                "total_transactions": len(all_transactions),
                "filtered_transactions": len(filtered_transactions),
                "parsing_success": True,
                "raw_data_type": type(raw_transactions_data).__name__,
                "by_category": {
                    "DIRECT_COST": len([tx for tx in all_transactions if tx.get('category') == 'DIRECT_COST']),
                    "BOOKED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'BOOKED_MEASURE']),
                    "PARKED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'PARKED_MEASURE']),
                    "UNASSIGNED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'UNASSIGNED_MEASURE']),
                    "OUTLIER": len([tx for tx in all_transactions if tx.get('category') == 'OUTLIER'])
                }
            },
            "filters_applied": {
                "department": department,
                "region": region,
                "status": status,
                "category": category
            },
            "debug_info": {
                "endpoint": "FIXED VERSION",
                "parsing_method": "safe_parse_json_fields_FIXED",
                "arrays_rebuilt": len(all_transactions) > 0
            }
        }
        
        logger.info(f"🎯 Returning FIXED response with {len(filtered_transactions)} transactions")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error in FIXED transactions endpoint: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": "Failed to fetch transactions (FIXED version)",
            "message": str(e)
        }), 500

@app.route('/api/assign-measure', methods=['POST'])
def assign_measure():
    """Manually assign a parked measure to a region/district, or unassign"""
    try:
        assignment = request.get_json()

        # Validate data structure
        if not isinstance(assignment, dict):
            return jsonify({
                "status": "error", 
                "message": f"Expected dict, got {type(assignment)}",
                "received_data": str(assignment)
            }), 400

        # Check if this is an unassign operation
        is_unassign = (assignment.get('region') == '' and assignment.get('district') == '') or assignment.get('unassign', False)
        
        # Validate required fields
        if not is_unassign:
            required_fields = ['bestellnummer', 'region', 'district']
            missing_fields = [field for field in required_fields if field not in assignment or not assignment[field]]
            if missing_fields:
                return jsonify({
                    "status": "error", 
                    "message": f"Missing required fields: {', '.join(missing_fields)}"
                }), 400
        else:
            # For unassign, only bestellnummer is required
            if 'bestellnummer' not in assignment:
                return jsonify({
                    "status": "error", 
                    "message": "Missing required field: bestellnummer"
                }), 400
        
        # Get the current transactions from database
        transactions = get_processed_data_from_database("transactions")
        transactions = safe_parse_json_fields(transactions) 
        
        # Find the measure to update
        measure_found = False
        action_message = ""
        
        if is_unassign:
            # Unassign logic
            for measure in transactions['parked_measures']:
                if measure['bestellnummer'] == assignment['bestellnummer']:
                    measure_found = True
                    measure['manual_assignment'] = None
                    measure['region'] = ''
                    measure['district'] = ''
                    measure['status'] = 'Awaiting Assignment'
                    if measure.get('category') == 'PARKED_MEASURE':
                        measure['category'] = 'UNASSIGNED_MEASURE'
                    break
            
            # Also update in transactions list
            for tx in transactions['transactions']:
                if (tx.get('bestellnummer') == assignment['bestellnummer'] and 
                    tx.get('status') == 'Manually assigned, awaiting SAP'):
                    measure_found = True
                    tx['manual_assignment'] = None
                    tx['region'] = ''
                    tx['district'] = ''
                    tx['status'] = 'Awaiting Assignment'
                    if tx.get('category') == 'PARKED_MEASURE':
                        tx['category'] = 'UNASSIGNED_MEASURE'
                    break
                    
            action_message = f"Measure {assignment['bestellnummer']} moved back to awaiting assignment"
            
        else:
            # Normal assign logic
            for measure in transactions['parked_measures']:
                if measure['bestellnummer'] == assignment['bestellnummer']:
                    measure_found = True
                    measure['manual_assignment'] = {
                        'region': assignment['region'],
                        'district': assignment['district']
                    }
                    measure['region'] = assignment['region']
                    measure['district'] = assignment['district']
                    measure['status'] = 'Manually assigned, awaiting SAP'
                    
                    # Update category in parked_measures
                    if measure.get('category') == 'UNASSIGNED_MEASURE':
                        measure['category'] = 'PARKED_MEASURE'
                    
                    # Also update in the transactions list
                    for tx in transactions['transactions']:
                        if tx.get('bestellnummer') == assignment['bestellnummer']:
                            tx['manual_assignment'] = measure['manual_assignment']
                            tx['region'] = assignment['region']
                            tx['district'] = assignment['district']
                            tx['status'] = 'Manually assigned, awaiting SAP'
                            
                            if tx.get('category') == 'UNASSIGNED_MEASURE':
                                tx['category'] = 'PARKED_MEASURE'
                            break
                    break
                    
            action_message = f"Measure {assignment['bestellnummer']} assigned to {assignment['region']}/{assignment['district']}"
        
        if not measure_found:
            return jsonify({
                "status": "error", 
                "message": f"Measure with bestellnummer {assignment['bestellnummer']} not found"
            }), 404
        
        # ✅ FIXED: Save with retry logic (INSIDE the function)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                save_to_database_as_json("transactions", transactions)
                logger.info(f"✅ Successfully saved on attempt {attempt + 1}")
                break
            except Exception as save_error:
                logger.warning(f"⚠️ Save attempt {attempt + 1} failed: {str(save_error)}")
                if attempt == max_retries - 1:
                    raise  # Re-raise the error if all retries failed
                time.sleep(1)  # Wait 1 second before retry
        
        return jsonify({
            "status": "success", 
            "message": action_message
        })
        
    except Exception as e:
        logger.error(f"Error in assign/unassign measure: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/budget-allocation', methods=['GET', 'POST'])
def budget_allocation():
    """Get or update budget allocations with database storage and audit trail"""
    try:
        if request.method == 'GET':
            try:
                budgets = get_processed_data_from_database("budget_allocation")
                logger.info(f"📊 Returning budget data with {len(budgets.get('departments', {}))} departments")
                return jsonify(budgets)
            except Exception as e:
                logger.warning(f"⚠️ No budget file found, returning empty structure: {str(e)}")
                return jsonify({
                    "departments": {},
                    "regions": {},
                    "last_updated": None
                })
        
        elif request.method == 'POST':
            data = request.get_json()
            
            if not data:
                return jsonify({"status": "error", "message": "No data provided"}), 400
            
            # Validate data structure
            if 'departments' not in data or 'regions' not in data:
                return jsonify({"status": "error", "message": "Invalid data structure"}), 400
            
            # Save the updated budget data to database
            try:
                save_to_database_as_json("budget_allocation", data)
                logger.info(f"💾 Successfully saved budget data to database")
                
                return jsonify({
                    "status": "success", 
                    "message": "Budget saved successfully"
                })
                
            except Exception as save_error:
                logger.error(f"❌ CRITICAL: Failed to save budget data: {str(save_error)}")
                return jsonify({"status": "error", "message": f"Failed to save: {str(save_error)}"}), 500
    
    except Exception as e:
        logger.error(f"❌ Budget allocation error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/process', methods=['POST'])
def trigger_processing():
    """Manually trigger the MSP-SAP data processing using database"""
    try:
        # Set database password if needed
        if not os.getenv("DB_PASSWORD"):
            return jsonify({
                "status": "error", 
                "message": "Database password not configured. Please set DB_PASSWORD environment variable."
            }), 500
        
        # Run the database-integrated data processing
        process_data_main()
        
        return jsonify({
            "status": "success",
            "message": "Database-integrated data processing completed successfully",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in data processing: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/database-status', methods=['GET'])
def database_status():
    """Check database connection status"""
    try:
        db_mgr = get_db_manager()
        connection_ok = db_mgr.test_connection()
        
        return jsonify({
            "database_connected": connection_ok,
            "server": "msp-sap-database-sadu.database.windows.net",
            "database": "Marketing",
            "status": "connected" if connection_ok else "disconnected",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error checking database status: {str(e)}")
        return jsonify({
            "database_connected": False,
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/api/debug-data', methods=['GET'])
def debug_data():
    """Debug endpoint to see what's actually in the database"""
    try:
        logger.info("🔍 DEBUG: Starting debug data check...")
        
        # Check what's actually in the database for each table
        debug_info = {}
        
        # Check frontend_departments
        try:
            departments_data = get_processed_data_from_database("frontend_departments")
            debug_info['frontend_departments'] = {
                'exists': departments_data is not None,
                'type': type(departments_data).__name__,
                'keys': list(departments_data.keys()) if isinstance(departments_data, dict) else 'N/A'
            }
        except Exception as e:
            debug_info['frontend_departments'] = {'error': str(e)}
        
        # Check frontend_regions  
        try:
            regions_data = get_processed_data_from_database("frontend_regions")
            debug_info['frontend_regions'] = {
                'exists': regions_data is not None,
                'type': type(regions_data).__name__,
                'keys': list(regions_data.keys()) if isinstance(regions_data, dict) else 'N/A'
            }
        except Exception as e:
            debug_info['frontend_regions'] = {'error': str(e)}
        
        # Check transactions
        try:
            transactions_data = get_processed_data_from_database("transactions")
            debug_info['transactions'] = {
                'exists': transactions_data is not None,
                'type': type(transactions_data).__name__,
                'has_transactions': 'transactions' in transactions_data if isinstance(transactions_data, dict) else False,
                'keys': list(transactions_data.keys()) if isinstance(transactions_data, dict) else 'N/A'
            }
        except Exception as e:
            debug_info['transactions'] = {'error': str(e)}
        
        return jsonify({
            'debug_info': debug_info,
            'timestamp': datetime.now().isoformat(),
            'status': 'debug_complete'
        })
        
    except Exception as e:
        logger.error(f"❌ Debug endpoint error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for database version"""
    try:
        # Test database connection
        db_mgr = get_db_manager()
        db_connected = db_mgr.test_connection()
        
        # Get database password status
        db_password_set = bool(os.getenv("DB_PASSWORD"))
        
        # Try to get some data
        try:
            transactions = get_processed_data_from_database("transactions")
            data_available = bool(transactions)
            last_processing = transactions.get('processing_date', 'Unknown')
        except:
            data_available = False
            last_processing = 'No data'
        
        status = "healthy" if (db_connected and db_password_set and data_available) else "unhealthy"
        
        return jsonify({
            "status": status,
            "version": "2.0.0 (Database)",
            "database": {
                "connected": db_connected,
                "password_configured": db_password_set,
                "server": "msp-sap-database-sadu.database.windows.net",
                "database": "Marketing"
            },
            "data": {
                "available": data_available,
                "last_processing": last_processing
            },
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

# Additional helper endpoints
@app.route('/api/export-data/<result_type>', methods=['GET'])
def export_data(result_type):
    """Export processed data as JSON file for download"""
    try:
        # Get data from database
        data = get_processed_data_from_database(result_type)
        
        if not data:
            return jsonify({"status": "error", "message": f"No data found for {result_type}"}), 404
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as temp_file:
            json.dump(data, temp_file, cls=JSONEncoder, indent=2)
            temp_path = temp_file.name
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{result_type}_{timestamp}.json"
        
        # Send the file
        return send_file(
            temp_path,
            mimetype='application/json',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error exporting data: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Legacy endpoints for backward compatibility
@app.route('/api/upload-file', methods=['POST'])
def upload_file():
    """Legacy endpoint - now data comes from database"""
    return jsonify({
        "status": "info",
        "message": "File upload no longer needed. System now reads data directly from Azure SQL Database.",
        "migration_info": {
            "old_method": "Excel files via blob storage",
            "new_method": "Direct database integration",
            "data_source": "Azure SQL Database tables"
        }
    }), 200

if __name__ == '__main__':
    # Check if database password is set before starting
    if not os.getenv("DB_PASSWORD"):
        print("❌ WARNING: DB_PASSWORD environment variable not set!")
        print("The API will start but database operations will fail.")
        print("Please set DB_PASSWORD before using database features.")
    
    # Start the Flask app
    app.run(host='0.0.0.0', port=5001, debug=True)