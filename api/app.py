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

# Database-integrated imports
try:
    from msp_sap_integration_fixed import (
        safe_float_conversion, 
        JSONEncoder,
        DatabaseManager,
        get_processed_data_from_database,
        save_to_database_as_json,
        generate_frontend_views_to_database,
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
        generate_frontend_views_to_database,
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

def parse_python_string_to_list(python_string):
    """Helper function to safely parse Python string representations to lists"""
    try:
        return ast.literal_eval(python_string)
    except (ValueError, SyntaxError) as e:
        logger.error(f"Failed to parse Python string: {str(e)}")
        return []

def safe_parse_json_fields_WORKING(data):
    """
    WORKING VERSION: Properly parse the string representations stored in database
    """
    if not isinstance(data, dict):
        return data
    
    # These keys are stored as Python string representations in your database
    keys_to_parse = ['transactions', 'parked_measures', 'direct_costs', 'booked_measures', 'outliers', 'placeholders']
    
    for key in keys_to_parse:
        if key in data:
            value = data[key]
            
            if isinstance(value, str) and len(value) > 0:
                try:
                    # Method 1: Try JSON parsing first (fastest)
                    import json
                    parsed_value = json.loads(value)
                    data[key] = parsed_value
                    logger.info(f"✅ JSON parsed {key}: {len(parsed_value) if isinstance(parsed_value, list) else 'not a list'} items")
                    continue
                    
                except json.JSONDecodeError:
                    logger.info(f"🔍 JSON failed for {key}, trying AST...")
                    
                    try:
                        # Method 2: Try AST literal eval (for Python string representations)
                        import ast
                        parsed_value = ast.literal_eval(value)
                        data[key] = parsed_value
                        logger.info(f"✅ AST parsed {key}: {len(parsed_value) if isinstance(parsed_value, list) else 'not a list'} items")
                        continue
                        
                    except (ValueError, SyntaxError) as ast_error:
                        logger.error(f"❌ AST failed for {key}: {ast_error}")
                        
                        # Method 3: Manual fix for common issues
                        try:
                            # Fix common Python string representation issues
                            fixed_value = value.replace("'", '"')  # Replace single quotes with double quotes
                            fixed_value = fixed_value.replace('True', 'true')  # Fix boolean values
                            fixed_value = fixed_value.replace('False', 'false')
                            fixed_value = fixed_value.replace('None', 'null')
                            
                            parsed_value = json.loads(fixed_value)
                            data[key] = parsed_value
                            logger.info(f"✅ Manual fix parsed {key}: {len(parsed_value) if isinstance(parsed_value, list) else 'not a list'} items")
                            continue
                            
                        except json.JSONDecodeError as manual_error:
                            logger.error(f"❌ Manual fix failed for {key}: {manual_error}")
                            logger.error(f"Sample data: {value[:200]}...")
                            data[key] = []
                            
            elif isinstance(value, list):
                # Already a list, keep it
                logger.info(f"✅ {key} already a list: {len(value)} items")
            
            else:
                logger.warning(f"⚠️ {key} is unexpected type: {type(value)}")
                data[key] = []
    
    return data

@app.route('/')
def home():
    """Home endpoint"""
    return {
        "status": "online",
        "service": "MSP-SAP Integration API (Database Version)",
        "version": "2.1.0",
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

# ✅ MAIN WORKING ENDPOINT - USE THIS ONE!
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Get transactions data - WORKING VERSION WITH PROPER PARSING"""
    try:
        logger.info("🔧 Starting WORKING /api/transactions request...")
        
        # Get query parameters
        department = request.args.get('department')
        region = request.args.get('region')
        status = request.args.get('status')
        category = request.args.get('category')
        
        logger.info(f"🔍 Filters: department={department}, region={region}, status={status}, category={category}")
        
        # Get raw data from database
        raw_transactions_data = get_processed_data_from_database("transactions")
        logger.info(f"✅ Raw data loaded: {type(raw_transactions_data)}")
        
        if not raw_transactions_data:
            return jsonify({
                "error": "No transaction data found in database"
            }), 404
        
        # ✅ WORKING FIX: Use the new parsing function
        parsed_data = safe_parse_json_fields_WORKING(raw_transactions_data.copy())
        logger.info("✅ Data parsed with WORKING function")
        
        # Extract arrays
        all_transactions = parsed_data.get('transactions', [])
        parked_measures = parsed_data.get('parked_measures', [])
        direct_costs = parsed_data.get('direct_costs', [])
        booked_measures = parsed_data.get('booked_measures', [])
        outliers = parsed_data.get('outliers', [])
        placeholders = parsed_data.get('placeholders', [])
        statistics = parsed_data.get('statistics', {})
        
        logger.info(f"📊 WORKING FIX RESULTS:")
        logger.info(f"   - all_transactions: {len(all_transactions)}")
        logger.info(f"   - booked_measures: {len(booked_measures)}")
        logger.info(f"   - parked_measures: {len(parked_measures)}")
        logger.info(f"   - direct_costs: {len(direct_costs)}")
        logger.info(f"   - outliers: {len(outliers)}")
        
        # ✅ If main transactions array is empty but components exist, rebuild it
        if len(all_transactions) == 0 and (len(direct_costs) > 0 or len(booked_measures) > 0 or len(parked_measures) > 0):
            logger.info("🔧 Rebuilding main transactions array...")
            
            all_transactions = []
            
            if direct_costs:
                all_transactions.extend(direct_costs)
                logger.info(f"✅ Added {len(direct_costs)} direct costs")
            
            if booked_measures:
                all_transactions.extend(booked_measures)
                logger.info(f"✅ Added {len(booked_measures)} booked measures")
            
            if parked_measures:
                all_transactions.extend(parked_measures)
                logger.info(f"✅ Added {len(parked_measures)} parked measures")
            
            if outliers:
                all_transactions.extend(outliers)
                logger.info(f"✅ Added {len(outliers)} outliers")
            
            if placeholders:
                all_transactions.extend(placeholders)
                logger.info(f"✅ Added {len(placeholders)} placeholders")
            
            logger.info(f"🔧 Rebuilt transactions array: {len(all_transactions)} total")
        
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
        
        # Filter other arrays by department if specified
        filtered_parked_measures = parked_measures
        filtered_booked_measures = booked_measures
        filtered_direct_costs = direct_costs
        
        if department:
            filtered_parked_measures = [m for m in parked_measures if m.get('department') == department]
            filtered_booked_measures = [m for m in booked_measures if m.get('department') == department]
            filtered_direct_costs = [m for m in direct_costs if m.get('department') == department]
        
        # Build response
        response_data = {
            "transactions": filtered_transactions,
            "parked_measures": filtered_parked_measures,
            "direct_costs": filtered_direct_costs,
            "booked_measures": filtered_booked_measures,
            "outliers": outliers,
            "placeholders": placeholders,
            "statistics": statistics,
            "summary": {
                "total_transactions": len(all_transactions),
                "filtered_transactions": len(filtered_transactions),
                "by_category": {
                    "BOOKED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'BOOKED_MEASURE']),
                    "PARKED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'PARKED_MEASURE']),
                    "UNASSIGNED_MEASURE": len([tx for tx in all_transactions if tx.get('category') == 'UNASSIGNED_MEASURE']),
                    "DIRECT_COST": len([tx for tx in all_transactions if tx.get('category') == 'DIRECT_COST']),
                    "OUTLIER": len([tx for tx in all_transactions if tx.get('category') == 'OUTLIER'])
                },
                "array_counts": {
                    "booked_measures": len(booked_measures),
                    "parked_measures": len(parked_measures),
                    "direct_costs": len(direct_costs),
                    "outliers": len(outliers)
                }
            },
            "working_fix_info": {
                "method": "WORKING_FIX",
                "parsing_success": True,
                "arrays_parsed_correctly": len(booked_measures) > 0 and len(parked_measures) > 0,
                "data_source": "Azure SQL Database with proper string parsing"
            },
            "filters_applied": {
                "department": department,
                "region": region,
                "status": status,
                "category": category
            }
        }
        
        logger.info(f"🎯 WORKING FIX returning: {len(filtered_transactions)} transactions, {len(filtered_booked_measures)} booked, {len(filtered_parked_measures)} parked")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error in WORKING FIX endpoint: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            "error": "Failed in working fix endpoint",
            "message": str(e),
            "traceback": traceback.format_exc()
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
        transactions = safe_parse_json_fields_WORKING(transactions) 
        
        # Find the measure to update
        measure_found = False
        
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
        
        # Save updated transactions to database
        save_to_database_as_json("transactions", transactions)
        
        # Update frontend views in database
        generate_frontend_views_to_database(transactions)
        
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
            "version": "2.1.0 (Database + Fixed Parsing)",
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
    # Check if database password is set before startingg
    if not os.getenv("DB_PASSWORD"):
        print("❌ WARNING: DB_PASSWORD environment variable not set!")
        print("The API will start but database operations will fail.")
        print("Please set DB_PASSWORD before using database features.")
    
    # Start the Flask app
    app.run(host='0.0.0.0', port=5001, debug=True)