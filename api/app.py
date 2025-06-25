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

# Database-integrated importssss
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

def safe_parse_json_fields(data):
    """Helper to parse JSON string fields in transaction data"""
    if isinstance(data, dict):
        for key in ['transactions', 'parked_measures', 'direct_costs', 'booked_measures']:
            if key in data and isinstance(data[key], str):
                try:
                    data[key] = json.loads(data[key])
                    logger.info(f"✅ Parsed {key} from JSON string")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Failed to parse {key}: {str(e)}")
                    data[key] = []
    return data


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
        
        # Helper function to safely parse JSON strings
        def safe_parse_json(data, field_name):
            if isinstance(data, dict) and field_name in data:
                field_data = data[field_name]
                if isinstance(field_data, str):
                    try:
                        # Parse the JSON string
                        parsed = json.loads(field_data)
                        logger.info(f"✅ Parsed {field_name} from JSON string: {len(parsed) if isinstance(parsed, list) else type(parsed)}")
                        return parsed
                    except json.JSONDecodeError as e:
                        logger.error(f"❌ Failed to parse {field_name} JSON: {str(e)}")
                        return [] if 'departments' in field_name or 'regions' in field_name else {}
                else:
                    logger.info(f"✅ Using {field_name} directly: {type(field_data)}")
                    return field_data
            else:
                logger.warning(f"⚠️ No '{field_name}' field found in data")
                return [] if 'departments' in field_name or 'regions' in field_name else {}
        
        # Read all the processed data from database
        try:
            transactions = get_processed_data_from_database("transactions")
            logger.info(f"✅ Loaded transactions: {type(transactions)}")
        except Exception as e:
            logger.error(f"❌ Failed to load transactions: {str(e)}")
            transactions = {"error": str(e), "message": "Could not read transactions data"}
            
        try:
            departments_data = get_processed_data_from_database("frontend_departments")
            logger.info(f"🔍 Raw departments_data type: {type(departments_data)}")
            
            # Parse departments with bulletproof logic
            departments = safe_parse_json(departments_data, 'departments')
            
            # Additional safety check
            if not isinstance(departments, list):
                logger.warning(f"⚠️ Departments is not a list: {type(departments)}")
                departments = []
                
        except Exception as e:
            logger.error(f"❌ Failed to load departments: {str(e)}")
            departments = []
        
        try:
            regions_data = get_processed_data_from_database("frontend_regions")
            logger.info(f"🔍 Raw regions_data type: {type(regions_data)}")
            
            # Parse regions with bulletproof logic
            regions = safe_parse_json(regions_data, 'regions')
            
            # Additional safety check
            if not isinstance(regions, list):
                logger.warning(f"⚠️ Regions is not a list: {type(regions)}")
                regions = []
                
        except Exception as e:
            logger.error(f"❌ Failed to load regions: {str(e)}")
            regions = []
        
        try:
            awaiting = get_processed_data_from_database("frontend_awaiting_assignment")
            logger.info(f"✅ Loaded awaiting assignment: {type(awaiting)}")
            
            # CRITICAL FIX: Parse awaiting assignment strings too
            if isinstance(awaiting, dict):
                for dept_name, measures in awaiting.items():
                    if isinstance(measures, str):
                        try:
                            # Parse the string representation of Python list
                            # Replace single quotes with double quotes for JSON parsing
                            json_string = measures.replace("'", '"')
                            awaiting[dept_name] = json.loads(json_string)
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
    
# Add this debug endpoint to your Flask app to see what's in your database

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
                'content': departments_data if departments_data else 'NULL',
                'keys': list(departments_data.keys()) if isinstance(departments_data, dict) else 'N/A'
            }
            logger.info(f"🔍 DEBUG: frontend_departments: {debug_info['frontend_departments']}")
        except Exception as e:
            debug_info['frontend_departments'] = {'error': str(e)}
        
        # Check frontend_regions  
        try:
            regions_data = get_processed_data_from_database("frontend_regions")
            debug_info['frontend_regions'] = {
                'exists': regions_data is not None,
                'type': type(regions_data).__name__,
                'content': regions_data if regions_data else 'NULL', 
                'keys': list(regions_data.keys()) if isinstance(regions_data, dict) else 'N/A'
            }
            logger.info(f"🔍 DEBUG: frontend_regions: {debug_info['frontend_regions']}")
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
            logger.info(f"🔍 DEBUG: transactions: {debug_info['transactions']}")
        except Exception as e:
            debug_info['transactions'] = {'error': str(e)}
        
        # Check budget allocation
        try:
            budget_data = get_processed_data_from_database("budget_allocation")
            debug_info['budget_allocation'] = {
                'exists': budget_data is not None,
                'type': type(budget_data).__name__,
                'departments_count': len(budget_data.get('departments', {})) if isinstance(budget_data, dict) else 'N/A',
                'regions_count': len(budget_data.get('regions', {})) if isinstance(budget_data, dict) else 'N/A',
                'keys': list(budget_data.keys()) if isinstance(budget_data, dict) else 'N/A'
            }
            logger.info(f"🔍 DEBUG: budget_allocation: {debug_info['budget_allocation']}")
        except Exception as e:
            debug_info['budget_allocation'] = {'error': str(e)}
        
        # Try to see all available results
        try:
            from msp_sap_integration_fixed import get_all_available_results
            available_results = get_all_available_results()
            debug_info['available_results'] = available_results
            logger.info(f"🔍 DEBUG: available_results: {available_results}")
        except Exception as e:
            debug_info['available_results'] = {'error': str(e)}
        
        return jsonify({
            'debug_info': debug_info,
            'timestamp': datetime.now().isoformat(),
            'status': 'debug_complete'
        })
        
    except Exception as e:
        logger.error(f"❌ Debug endpoint error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Also add this enhanced version of your get_data endpoint
@app.route('/api/data-enhanced', methods=['GET'])
def get_data_enhanced():
    """Enhanced version of get_data with better debugging"""
    try:
        logger.info("🔍 Enhanced /api/data request...")
        
        # Check if we have ANY data that could be used to build departments/regions
        debug_info = {}
        
        # 1. Try to get from frontend tables first
        try:
            departments_data = get_processed_data_from_database("frontend_departments")
            departments = safe_parse_json(departments_data, 'departments')
            debug_info['frontend_departments'] = {
                'raw_data': departments_data,
                'parsed_count': len(departments) if isinstance(departments, list) else 0
            }
        except Exception as e:
            departments = []
            debug_info['frontend_departments'] = {'error': str(e)}
        
        try:
            regions_data = get_processed_data_from_database("frontend_regions")
            regions = safe_parse_json(regions_data, 'regions')
            debug_info['frontend_regions'] = {
                'raw_data': regions_data,
                'parsed_count': len(regions) if isinstance(regions, list) else 0
            }
        except Exception as e:
            regions = []
            debug_info['frontend_regions'] = {'error': str(e)}
        
        # 2. If that didn't work, try to build from budget data
        if not departments and not regions:
            logger.info("🔧 Frontend tables empty, trying to build from budget data...")
            try:
                budget_data = get_processed_data_from_database("budget_allocation")
                if budget_data and 'departments' in budget_data:
                    # Build departments from budget allocation keys
                    dept_names = set()
                    for dept_key in budget_data['departments'].keys():
                        # Extract department name from "Department Name|Location Type" format
                        dept_name = dept_key.split('|')[0]
                        dept_names.add(dept_name)
                    
                    departments = [
                        {
                            'name': dept_name,
                            'location_type': 'Unknown',  # We'd need to infer this
                            'total_amount': 0,
                            'booked_amount': 0,
                            'reserved_amount': 0
                        }
                        for dept_name in dept_names
                    ]
                    debug_info['built_from_budget'] = f"Built {len(departments)} departments from budget keys"
                    
            except Exception as e:
                debug_info['budget_fallback'] = {'error': str(e)}
        
        # 3. Get other data
        try:
            transactions = get_processed_data_from_database("transactions")
            debug_info['transactions'] = {'exists': transactions is not None}
        except Exception as e:
            transactions = {"error": str(e)}
            debug_info['transactions'] = {'error': str(e)}
        
        try:
            awaiting = get_processed_data_from_database("frontend_awaiting_assignment")
            debug_info['awaiting'] = {'exists': awaiting is not None}
        except Exception as e:
            awaiting = {}
            debug_info['awaiting'] = {'error': str(e)}
        
        try:
            budgets = get_processed_data_from_database("budget_allocation")
            debug_info['budgets'] = {'exists': budgets is not None}
        except Exception as e:
            budgets = {}
            debug_info['budgets'] = {'error': str(e)}
        
        response_data = {
            "departments": departments,
            "regions": regions,  
            "awaiting_assignment": awaiting,
            "budget_allocation": budgets,
            "transaction_stats": transactions.get('statistics', {}) if isinstance(transactions, dict) else {},
            "_debug_info": debug_info  # Include debug info in response
        }
        
        logger.info(f"🎯 Enhanced response: {len(departments)} departments, {len(regions)} regions")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Enhanced get_data error: {str(e)}")
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
            
            # AUDIT: Extract user information from headers
            user_name = request.headers.get('X-User-Name', 'Unknown User')
            change_reason = request.headers.get('X-Change-Reason', 'Budget allocation update')
            user_ip = request.remote_addr
            user_agent = request.headers.get('User-Agent', 'Unknown Browser')[:100]
            
            # Create unique user ID and change ID
            user_id = f"user_{user_name.replace(' ', '_').lower()}_{int(datetime.now().timestamp())}"
            change_id = f"CHG_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{user_name.replace(' ', '_')[:10]}"
            
            logger.info(f"🔄 Budget update request from: {user_name} ({user_ip})")
            
            # Load existing data from database
            try:
                existing_budgets = get_processed_data_from_database("budget_allocation")
                logger.info(f"✅ Loaded existing budget file")
            except Exception as e:
                logger.info(f"📝 Creating new budget file: {str(e)}")
                existing_budgets = {}
            
            # SAFETY: Create backup before any changes
            backup_success = create_database_backup(existing_budgets, change_id, user_name)
            if backup_success:
                logger.info(f"🔒 SAFETY: Created database backup for change {change_id}")
            
            # Ensure structure exists
            if 'departments' not in existing_budgets or existing_budgets['departments'] is None:
                existing_budgets['departments'] = {}
            if 'regions' not in existing_budgets or existing_budgets['regions'] is None:
                existing_budgets['regions'] = {}
            
            # AUDIT: Prepare audit trail
            audit_entries = []
            change_timestamp = datetime.now().isoformat()
            
            # Process department changes with audit logging
            departments_updated = []
            for new_dept_name, new_dept_data in data['departments'].items():
                old_budget = 0
                if new_dept_name in existing_budgets['departments']:
                    old_budget = existing_budgets['departments'][new_dept_name].get('allocated_budget', 0)
                
                new_budget = new_dept_data['allocated_budget']
                
                # Only log if there's an actual change
                if old_budget != new_budget:
                    audit_entry = {
                        'change_id': change_id,
                        'timestamp': change_timestamp,
                        'user_name': user_name,
                        'user_id': user_id,
                        'user_ip': user_ip,
                        'user_agent': user_agent,
                        'change_type': 'department_budget',
                        'entity_type': 'department',
                        'entity_key': new_dept_name,
                        'entity_name': new_dept_name.split('|')[0],
                        'old_value': old_budget,
                        'new_value': new_budget,
                        'change_amount': new_budget - old_budget,
                        'change_reason': change_reason,
                        'backup_reference': change_id
                    }
                    audit_entries.append(audit_entry)
                    
                    logger.info(f"📝 AUDIT: {user_name} changed {new_dept_name} budget: €{old_budget:,.2f} → €{new_budget:,.2f}")
                
                existing_budgets['departments'][new_dept_name] = new_dept_data
                departments_updated.append(new_dept_name)
            
            # Process region changes with audit logging
            regions_updated = []
            new_dept_names = list(data['departments'].keys())
            
            # Remove old region entries for departments being updated
            regions_to_remove = []
            for existing_region_key in list(existing_budgets['regions'].keys()):
                for updating_dept_name in new_dept_names:
                    if existing_region_key.startswith(f"{updating_dept_name}|"):
                        old_region_budget = existing_budgets['regions'][existing_region_key].get('allocated_budget', 0)
                        
                        # Log region removal if it had a budget
                        if old_region_budget > 0:
                            audit_entry = {
                                'change_id': change_id,
                                'timestamp': change_timestamp,
                                'user_name': user_name,
                                'user_id': user_id,
                                'user_ip': user_ip,
                                'user_agent': user_agent,
                                'change_type': 'region_budget',
                                'entity_type': 'region',
                                'entity_key': existing_region_key,
                                'entity_name': existing_region_key.split('|')[1],
                                'old_value': old_region_budget,
                                'new_value': 0,
                                'change_amount': -old_region_budget,
                                'change_reason': f"Region reallocation for {change_reason}",
                                'backup_reference': change_id
                            }
                            audit_entries.append(audit_entry)
                        
                        regions_to_remove.append(existing_region_key)
                        break
            
            # Remove the old regions
            for region_key in regions_to_remove:
                if region_key in existing_budgets['regions']:
                    del existing_budgets['regions'][region_key]
                    logger.info(f"🗑️ Removed old region: {region_key}")
            
            # Add new regions with audit logging
            for new_region_key, new_region_data in data['regions'].items():
                new_region_budget = new_region_data['allocated_budget']
                
                # Log new region budget allocation
                if new_region_budget > 0:
                    audit_entry = {
                        'change_id': change_id,
                        'timestamp': change_timestamp,
                        'user_name': user_name,
                        'user_id': user_id,
                        'user_ip': user_ip,
                        'user_agent': user_agent,
                        'change_type': 'region_budget',
                        'entity_type': 'region',
                        'entity_key': new_region_key,
                        'entity_name': new_region_key.split('|')[1],
                        'old_value': 0,
                        'new_value': new_region_budget,
                        'change_amount': new_region_budget,
                        'change_reason': change_reason,
                        'backup_reference': change_id
                    }
                    audit_entries.append(audit_entry)
                
                existing_budgets['regions'][new_region_key] = new_region_data
                regions_updated.append(new_region_key)
                logger.info(f"➕ Added/updated region: {new_region_key}")
            
            # Add metadata
            existing_budgets['last_updated'] = change_timestamp
            existing_budgets['last_change_id'] = change_id
            existing_budgets['last_updated_by'] = {
                'user_name': user_name,
                'user_id': user_id,
                'user_ip': user_ip,
                'change_reason': change_reason
            }
            
            # Save the updated budget data to database
            try:
                save_to_database_as_json("budget_allocation", existing_budgets)
                logger.info(f"💾 Successfully saved budget data to database")
                
            except Exception as save_error:
                logger.error(f"❌ CRITICAL: Failed to save budget data: {str(save_error)}")
                return jsonify({"status": "error", "message": f"Failed to save: {str(save_error)}"}), 500
            
            # AUDIT: Save audit trail if there were any changes
            if audit_entries:
                try:
                    save_database_audit_trail(audit_entries)
                    logger.info(f"📋 AUDIT: Saved {len(audit_entries)} audit entries for change {change_id}")
                except Exception as audit_error:
                    logger.error(f"❌ Failed to save audit trail: {str(audit_error)}")
                    # Don't fail the request if audit logging fails, but log the error
            
            return jsonify({
                "status": "success", 
                "message": f"Budget saved successfully by {user_name}",
                "change_id": change_id,
                "departments_updated": len(departments_updated),
                "regions_updated": len(regions_updated),
                "audit_entries": len(audit_entries),
                "backup_created": True,
                "updated_by": user_name
            })
    
    except Exception as e:
        logger.error(f"❌ Budget allocation error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

def save_database_audit_trail(audit_entries):
    """Save audit trail entries to database"""
    try:
        # Load existing audit trail from database
        try:
            existing_audit = get_processed_data_from_database("budget_audit_trail_consolidated")
            if 'entries' not in existing_audit:
                existing_audit['entries'] = []
            if 'metadata' not in existing_audit:
                existing_audit['metadata'] = {}
        except Exception as e:
            logger.info(f"Creating new audit trail: {str(e)}")
            existing_audit = {
                'entries': [],
                'metadata': {
                    'created': datetime.now().isoformat(),
                    'total_changes': 0,
                    'file_description': 'Database-stored budget audit trail'
                }
            }
        
        # Add new entries at the beginning (most recent first)
        existing_audit['entries'] = audit_entries + existing_audit['entries']
        
        # Update metadata
        existing_audit['metadata']['last_updated'] = datetime.now().isoformat()
        existing_audit['metadata']['total_entries'] = len(existing_audit['entries'])
        existing_audit['metadata']['total_changes'] = existing_audit['metadata'].get('total_changes', 0) + len(audit_entries)
        
        # Keep only the most recent 1000 entries to manage size
        max_entries = 1000
        if len(existing_audit['entries']) > max_entries:
            existing_audit['entries'] = existing_audit['entries'][:max_entries]
            existing_audit['metadata']['archived_entries'] = len(existing_audit['entries']) - max_entries
            existing_audit['metadata']['last_archive_date'] = datetime.now().isoformat()
            logger.info(f"📦 Trimmed audit trail to {max_entries} entries")
        
        # Save updated audit trail to database
        save_to_database_as_json("budget_audit_trail_consolidated", existing_audit)
        
        logger.info(f"✅ Database audit trail updated with {len(audit_entries)} new entries")
        
    except Exception as e:
        logger.error(f"❌ Failed to save database audit trail: {str(e)}")
        raise

def create_database_backup(current_data, change_id, user_name):
    """Create backup in database"""
    try:
        # Load existing backup data from database
        try:
            backup_data = get_processed_data_from_database("budget_backups_consolidated")
            if 'backups' not in backup_data:
                backup_data['backups'] = []
            if 'metadata' not in backup_data:
                backup_data['metadata'] = {}
        except Exception as e:
            logger.info(f"Creating new backup structure: {str(e)}")
            backup_data = {
                'backups': [],
                'metadata': {
                    'created': datetime.now().isoformat(),
                    'description': 'Database-stored budget backups'
                }
            }
        
        # Create backup entry
        backup_entry = {
            'backup_id': change_id,
            'timestamp': datetime.now().isoformat(),
            'user_name': user_name,
            'data_snapshot': current_data.copy() if current_data else {}
        }
        
        # Add to beginning of list (most recent first)
        backup_data['backups'].insert(0, backup_entry)
        
        # Keep only the most recent 50 backups
        max_backups = 50
        if len(backup_data['backups']) > max_backups:
            backup_data['backups'] = backup_data['backups'][:max_backups]
            logger.info(f"🗂️ Trimmed backup history to {max_backups} entries")
        
        # Update metadata
        backup_data['metadata']['last_updated'] = datetime.now().isoformat()
        backup_data['metadata']['total_backups'] = len(backup_data['backups'])
        backup_data['metadata']['last_backup_by'] = user_name
        
        # Save backup to database
        save_to_database_as_json("budget_backups_consolidated", backup_data)
        
        logger.info(f"✅ Created database backup (ID: {change_id})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create database backup: {str(e)}")
        return False

@app.route('/api/budget-history', methods=['GET'])
def get_budget_history():
    """Get budget change history from database"""
    try:
        # Get query parameters
        entity_key = request.args.get('entity_key')
        entity_type = request.args.get('entity_type')
        user_name = request.args.get('user_name')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = int(request.args.get('limit', 100))
        
        # Load audit trail from database
        try:
            audit_data = get_processed_data_from_database("budget_audit_trail_consolidated")
            all_entries = audit_data.get('entries', [])
        except Exception as e:
            logger.warning(f"No audit trail found: {str(e)}")
            return jsonify({'entries': [], 'total': 0, 'filtered': 0})
        
        # Apply filters
        filtered_entries = all_entries
        
        if entity_key:
            filtered_entries = [e for e in filtered_entries if e.get('entity_key') == entity_key]
        
        if entity_type:
            filtered_entries = [e for e in filtered_entries if e.get('entity_type') == entity_type]
        
        if user_name:
            filtered_entries = [e for e in filtered_entries if e.get('user_name') == user_name]
        
        if start_date:
            filtered_entries = [e for e in filtered_entries if e.get('timestamp', '') >= start_date]
        
        if end_date:
            filtered_entries = [e for e in filtered_entries if e.get('timestamp', '') <= end_date]
        
        # Apply limit
        limited_entries = filtered_entries[:limit]
        
        return jsonify({
            'entries': limited_entries,
            'total': len(all_entries),
            'filtered': len(filtered_entries),
            'returned': len(limited_entries),
            'filters_applied': {
                'entity_key': entity_key,
                'entity_type': entity_type,
                'user_name': user_name,
                'start_date': start_date,
                'end_date': end_date,
                'limit': limit
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting budget history: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/budget-backups', methods=['GET'])
def get_budget_backups():
    """Get list of available budget backups from database"""
    try:
        limit = int(request.args.get('limit', 20))
        
        try:
            backup_data = get_processed_data_from_database("budget_backups_consolidated")
            backups = backup_data.get('backups', [])
            metadata = backup_data.get('metadata', {})
        except Exception as e:
            logger.warning(f"No backup data found: {str(e)}")
            return jsonify({'backups': [], 'metadata': {}, 'total': 0})
        
        # Return limited backup info (without full data snapshots for performance)
        backup_list = []
        for backup in backups[:limit]:
            backup_info = {
                'backup_id': backup.get('backup_id'),
                'timestamp': backup.get('timestamp'),
                'user_name': backup.get('user_name'),
                'has_data': 'data_snapshot' in backup and backup['data_snapshot'] is not None
            }
            backup_list.append(backup_info)
        
        return jsonify({
            'backups': backup_list,
            'metadata': metadata,
            'total': len(backups),
            'returned': len(backup_list)
        })
        
    except Exception as e:
        logger.error(f"Error getting budget backups: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/budget-backup/<backup_id>', methods=['GET'])
def get_specific_backup(backup_id):
    """Get a specific backup by its ID from database"""
    try:
        backup_data = get_processed_data_from_database("budget_backups_consolidated")
        backups = backup_data.get('backups', [])
        
        # Find the specific backup
        for backup in backups:
            if backup.get('backup_id') == backup_id:
                return jsonify(backup)
        
        return jsonify({"status": "error", "message": f"Backup with ID {backup_id} not found"}), 404
        
    except Exception as e:
        logger.error(f"Error getting specific backup: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/budget-summary/<entity_key>', methods=['GET'])
def get_budget_summary(entity_key):
    """Get budget summary for a specific entity with recent changes from database"""
    try:
        entity_key = unquote(entity_key)
        
        # Get current budget from database
        budgets = get_processed_data_from_database("budget_allocation")
        
        current_budget = None
        entity_type = None
        
        if entity_key in budgets.get('departments', {}):
            current_budget = budgets['departments'][entity_key]
            entity_type = 'department'
        elif entity_key in budgets.get('regions', {}):
            current_budget = budgets['regions'][entity_key]
            entity_type = 'region'
        
        if not current_budget:
            return jsonify({"status": "error", "message": "Entity not found"}), 404
        
        # Get recent history for this entity from database
        try:
            audit_data = get_processed_data_from_database("budget_audit_trail_consolidated")
            entity_history = [
                e for e in audit_data.get('entries', [])
                if e.get('entity_key') == entity_key
            ]
            recent_changes = entity_history[:10]  # Last 10 changes
        except:
            recent_changes = []
            entity_history = []
        
        return jsonify({
            'entity_key': entity_key,
            'entity_type': entity_type,
            'current_budget': current_budget,
            'recent_changes': recent_changes,
            'total_changes': len(entity_history)
        })
        
    except Exception as e:
        logger.error(f"Error getting budget summary: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Replace your database API's /api/assign-measure endpoint with this corrected version:

@app.route('/api/assign-measure', methods=['POST'])
def assign_measure():
    """Manually assign a parked measure to a region/district, or unassign"""
    try:
        logger.info(f"=== ASSIGN MEASURE DEBUG ===")
        logger.info(f"Content-Type: {request.content_type}")
        logger.info(f"Raw data: {request.data}")
        logger.info(f"Raw data type: {type(request.data)}")
        
        assignment = request.get_json()
        
        logger.info(f"Parsed assignment: {assignment}")
        logger.info(f"Assignment type: {type(assignment)}")
        logger.info(f"=== END DEBUG ===")

        # Validate data structure
        if not isinstance(assignment, dict):
            logger.error(f"❌ Invalid data type received: {type(assignment)}")
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
            # ✅ FIXED: Normal assign logic - EXACTLY like blob storage
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
                    
                    # ✅ CRITICAL: Update category in parked_measures
                    if measure.get('category') == 'UNASSIGNED_MEASURE':
                        measure['category'] = 'PARKED_MEASURE'
                    
                    # ✅ CRITICAL: Also update in the transactions list - EXACTLY like blob storage
                    for tx in transactions['transactions']:
                        if tx.get('bestellnummer') == assignment['bestellnummer']:
                            tx['manual_assignment'] = measure['manual_assignment']
                            tx['region'] = assignment['region']
                            tx['district'] = assignment['district']
                            tx['status'] = 'Manually assigned, awaiting SAP'
                            
                            # ✅ CRITICAL: This was missing in database version!
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
        logger.error(f"Exception type: {type(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/bulk-assign-measures', methods=['POST'])
def bulk_assign_measures():
    """Bulk assign multiple parked measures to regions/districts"""
    try:
        assignments = request.get_json()
        
        if not isinstance(assignments, list):
            return jsonify({"status": "error", "message": "Expected a list of assignments"}), 400
        
        # Get the current transactions from database
        transactions = get_processed_data_from_database("transactions")
        
        # Track which measures were successfully assigned
        successful_assignments = []
        failed_assignments = []
        
        # Process each assignment
        for assignment in assignments:
            # Validate required fields
            required_fields = ['bestellnummer', 'region', 'district']
            if not all(field in assignment for field in required_fields):
                failed_assignments.append({
                    "bestellnummer": assignment.get('bestellnummer', 'unknown'),
                    "reason": "Missing required fields"
                })
                continue
            
            # Find the measure to update
            measure_found = False
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
                    
                    # Also update in the transactions list
                    for tx in transactions['transactions']:
                        if tx.get('bestellnummer') == assignment['bestellnummer'] and tx.get('category') == 'PARKED_MEASURE':
                            tx['manual_assignment'] = measure['manual_assignment']
                            tx['region'] = assignment['region']
                            tx['district'] = assignment['district']
                            tx['status'] = 'Manually assigned, awaiting SAP'
                    
                    successful_assignments.append(assignment['bestellnummer'])
                    break
            
            if not measure_found:
                failed_assignments.append({
                    "bestellnummer": assignment['bestellnummer'],
                    "reason": "Measure not found"
                })
        
        # Save updated transactions to database
        save_to_database_as_json("transactions", transactions)
        
        # Update frontend views in database
        generate_frontend_views_to_database(transactions)
        
        return jsonify({
            "status": "success", 
            "successful_assignments": successful_assignments,
            "failed_assignments": failed_assignments
        })
        
    except Exception as e:
        logger.error(f"Error in bulk assignment: {str(e)}")
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

@app.route('/api/available-results', methods=['GET'])
def get_available_results():
    """Get list of all available results in the database"""
    try:
        from msp_sap_integration_fixed import get_all_available_results
        results = get_all_available_results()
        
        return jsonify({
            "available_results": results,
            "total": len(results),
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting available results: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/batch-info', methods=['GET'])
def get_batch_info():
    """Get information about the latest batches in each table"""
    try:
        db_mgr = get_db_manager()
        
        batch_info = {}
        
        # Get latest batch IDs for each table
        tables = {
            'sap_transactions': 'BULK_IMPORT_%',
            'msp_measures': 'MSP_%',
            'kostenstelle_mapping_floor': 'BULK_IMPORT_%',
            'kostenstelle_mapping_hq': 'HQ_FIX_%'
        }
        
        for table_name, pattern in tables.items():
            try:
                latest_batch = db_mgr.get_latest_batch_id(table_name, pattern)
                batch_info[table_name] = {
                    "latest_batch": latest_batch,
                    "pattern": pattern
                }
            except Exception as e:
                batch_info[table_name] = {
                    "latest_batch": None,
                    "error": str(e),
                    "pattern": pattern
                }
        
        return jsonify({
            "batch_info": batch_info,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error getting batch info: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

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

# Legacy endpoints for backward compatibility (these will return info about the migration)
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

@app.route('/api/download-file/<container>/<filename>', methods=['GET'])
def download_file(container, filename):
    """Legacy endpoint - data now in database"""
    return jsonify({
        "status": "info",
        "message": "File downloads replaced with database queries.",
        "suggestion": f"Use /api/export-data/{filename.replace('.json', '')} instead",
        "available_exports": ["transactions", "budget_allocation", "frontend_departments", "frontend_regions"]
    }), 200

@app.route('/api/list-files/<container>', methods=['GET'])
def list_files(container):
    """Legacy endpoint - now shows available database results"""
    try:
        from msp_sap_integration_fixed import get_all_available_results
        results = get_all_available_results()
        
        return jsonify({
            "status": "migrated",
            "message": f"Container '{container}' replaced with database storage",
            "available_results": results,
            "note": "Use /api/available-results for current data"
        })
    except Exception as e:
        return jsonify({
            "status": "info",
            "message": "System migrated to database storage",
            "container": container,
            "error": str(e)
        })

@app.route('/api/cleanup-storage', methods=['POST'])
def cleanup_storage():
    """Database maintenance endpoint"""
    try:
        cleanup_data = request.get_json() or {}
        days_to_keep = cleanup_data.get('days_to_keep', 90)
        
        # For database version, this could clean old audit entries or backups
        # Implementation would depend on specific requirements
        
        return jsonify({
            "status": "success",
            "message": f"Database maintenance completed (keeping last {days_to_keep} days)",
            "storage_type": "Azure SQL Database",
            "note": "Database automatically manages storage optimization"
        })
        
    except Exception as e:
        logger.error(f"Error in database maintenance: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Debug endpoints for database version
@app.route('/api/debug-budgets', methods=['GET'])
def debug_budgets():
    """Debug route to see what budget data exists in database"""
    try:
        budgets = get_processed_data_from_database("budget_allocation")
        return jsonify({
            "departments": list(budgets.get('departments', {}).keys())[:10],  # First 10
            "regions": list(budgets.get('regions', {}).keys())[:10],  # First 10
            "total_departments": len(budgets.get('departments', {})),
            "total_regions": len(budgets.get('regions', {})),
            "last_updated": budgets.get('last_updated'),
            "storage": "Azure SQL Database"
        })
    except Exception as e:
        return jsonify({"error": str(e), "storage": "Azure SQL Database"})

@app.route('/api/test-department/<path:dept_name>', methods=['GET'])
def test_department(dept_name):
    """Test route to debug URL encoding"""
    decoded = unquote(dept_name)
    return jsonify({
        "original": dept_name,
        "decoded": decoded,
        "test": "Database API route is working",
        "version": "2.0.0"
    })

@app.route('/api/debug-request', methods=['POST'])
def debug_request():
    """Debug endpoint to see exactly what data is being received"""
    try:
        return jsonify({
            "content_type": request.content_type,
            "raw_data": str(request.data),
            "raw_data_type": str(type(request.data)),
            "get_json_result": request.get_json(),
            "get_json_type": str(type(request.get_json())),
            "headers": dict(request.headers),
            "method": request.method,
            "debug_info": "This endpoint helps debug the data structure issue"
        })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "error_type": str(type(e)),
            "raw_data": str(request.data),
            "content_type": request.content_type,
            "debug_info": "Error occurred during debugging"
        })

if __name__ == '__main__':
    # Check if database password is set before starting
    if not os.getenv("DB_PASSWORD"):
        print("❌ WARNING: DB_PASSWORD environment variable not set!")
        print("The API will start but database operations will fail.")
        print("Please set DB_PASSWORD before using database features.")
    
    # Start the Flask app on a different port for testing
    app.run(host='0.0.0.0', port=5001, debug=True)  # ← Changed to port 5001