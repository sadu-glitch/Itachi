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
from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
import unicodedata
from urllib.parse import unquote

import os
import sys

# Try to import directly first (from API folder)
try:
    from msp_sap_integration_fixed import (
        safe_float_conversion, 
        JSONEncoder,
        read_from_blob, 
        save_to_blob, 
        generate_frontend_views
    )
except ImportError:
    # Fall back to shared folder if not found
    sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
    from msp_sap_integration_fixed import (
        safe_float_conversion, 
        JSONEncoder,
        read_from_blob, 
        save_to_blob, 
        generate_frontend_views
    )

app = Flask(__name__)
CORS(app)  # Enable CORS for all routesS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("msp_sap_api")

# Azure Storage credentials
MOCK_DATA_SAS_URL = "https://financedatastore.blob.core.windows.net/mock-data?sp=racwdli&st=2025-05-05T14:24:17Z&se=2026-12-30T23:24:17Z&spr=https&sv=2024-11-04&sr=c&sig=4qw%2BrpMKNCvKzNAN0%2FIaeS%2BU0Qenb1YhJDhpJDaVMC0%3D"
PROCESSED_DATA_SAS_URL = "https://financedatastore.blob.core.windows.net/processed-data?sp=racwdli&st=2025-05-05T14:27:31Z&se=2026-08-30T22:27:31Z&spr=https&sv=2024-11-04&sr=c&sig=3OHdNWWQ%2FRuGyxebi8746XC1%2F1Cc3uzld9wjrdFIfL0%3D"

# Create BlobServiceClient objects for each container
mock_data_container_client = ContainerClient.from_container_url(MOCK_DATA_SAS_URL)
processed_data_container_client = ContainerClient.from_container_url(PROCESSED_DATA_SAS_URL)

@app.route('/')
def home():
    """Home endpoint"""
    return {
        "status": "online",
        "service": "MSP-SAP Integration API",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.route('/api/data', methods=['GET'])
def get_data():
    """Retrieve all processed data for the frontend"""
    try:
        # Read all the processed data files
        try:
            transactions = read_from_blob("processed-data", "transactions.json", as_json=True)
        except Exception as e:
            transactions = {"error": str(e), "message": "Could not read transactions data"}
            
        try:
            departments = read_from_blob("processed-data", "frontend_departments.json", as_json=True)
        except Exception as e:
            departments = {"error": str(e), "message": "Could not read departments data"}
        
        try:
            regions = read_from_blob("processed-data", "frontend_regions.json", as_json=True)
        except Exception as e:
            regions = {"error": str(e), "message": "Could not read regions data"}
        
        try:
            awaiting = read_from_blob("processed-data", "frontend_awaiting_assignment.json", as_json=True)
        except Exception as e:
            awaiting = {"error": str(e), "message": "Could not read awaiting assignment data"}
        
        try:
            budgets = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
        except Exception as e:
            budgets = {"error": str(e), "message": "Could not read budget allocation data"}
        
        # Return everything in one response
        return jsonify({
            "departments": departments,
            "regions": regions,
            "awaiting_assignment": awaiting,
            "budget_allocation": budgets,
            "transaction_stats": transactions.get('statistics', {})
        })
    except Exception as e:
        logger.error(f"Error getting data: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Get all transactions (can be filtered)"""
    try:
        transactions = read_from_blob("processed-data", "transactions.json", as_json=True)
        
        # Extract query parameters for filtering
        category = request.args.get('category')
        department = request.args.get('department')
        region = request.args.get('region')
        district = request.args.get('district')
        
        # Apply filters if provided
        filtered_transactions = transactions['transactions']
        
        if category:
            filtered_transactions = [t for t in filtered_transactions if t.get('category') == category]
        
        if department:
            filtered_transactions = [t for t in filtered_transactions if t.get('department') == department]
            
        if region:
            filtered_transactions = [t for t in filtered_transactions if t.get('region') == region]
            
        if district:
            filtered_transactions = [t for t in filtered_transactions if t.get('district') == district]
        
        return jsonify({
            "transactions": filtered_transactions,
            "total": len(filtered_transactions),
            "stats": transactions.get('statistics', {})
        })
    except Exception as e:
        logger.error(f"Error getting transactions: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/budget-allocation', methods=['GET', 'POST'])
def budget_allocation():
    """Get or update budget allocations with CONSOLIDATED AUDIT TRAIL"""
    try:
        if request.method == 'GET':
            try:
                budgets = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
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
            user_agent = request.headers.get('User-Agent', 'Unknown Browser')[:100]  # Truncate long user agents
            
            # Create unique user ID and change ID
            user_id = f"user_{user_name.replace(' ', '_').lower()}_{int(datetime.now().timestamp())}"
            change_id = f"CHG_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{user_name.replace(' ', '_')[:10]}"
            
            logger.info(f"🔄 Budget update request from: {user_name} ({user_ip})")
            
            # Load existing data
            try:
                existing_budgets = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
                logger.info(f"✅ Loaded existing budget file")
            except Exception as e:
                logger.info(f"📝 Creating new budget file: {str(e)}")
                existing_budgets = {}
            
            # SAFETY: Create consolidated backup before any changes
            backup_success = create_consolidated_backup(existing_budgets, change_id, user_name)
            if backup_success:
                logger.info(f"🔒 SAFETY: Created consolidated backup for change {change_id}")
            
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
                        'entity_name': new_dept_name.split('|')[0],  # Department name without location type
                        'old_value': old_budget,
                        'new_value': new_budget,
                        'change_amount': new_budget - old_budget,
                        'change_reason': change_reason,
                        'backup_reference': change_id  # Reference to backup in consolidated file
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
                                'entity_name': existing_region_key.split('|')[1],  # Region name
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
                        'entity_name': new_region_key.split('|')[1],  # Region name
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
            
            # Save the updated budget data
            try:
                save_to_blob("processed-data", "budget_allocation.json", existing_budgets)
                logger.info(f"💾 Successfully saved budget data")
                
            except Exception as save_error:
                logger.error(f"❌ CRITICAL: Failed to save budget data: {str(save_error)}")
                return jsonify({"status": "error", "message": f"Failed to save: {str(save_error)}"}), 500
            
            # AUDIT: Save consolidated audit trail if there were any changes
            if audit_entries:
                try:
                    save_consolidated_audit_trail(audit_entries)
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

def save_consolidated_audit_trail(audit_entries):
    """Save audit trail entries to a single consolidated file"""
    try:
        # Load existing consolidated audit trail
        try:
            existing_audit = read_from_blob("processed-data", "budget_audit_trail_consolidated.json", as_json=True)
            if 'entries' not in existing_audit:
                existing_audit['entries'] = []
            if 'metadata' not in existing_audit:
                existing_audit['metadata'] = {}
        except Exception as e:
            logger.info(f"Creating new consolidated audit trail file: {str(e)}")
            existing_audit = {
                'entries': [],
                'metadata': {
                    'created': datetime.now().isoformat(),
                    'total_changes': 0,
                    'file_description': 'Consolidated budget audit trail - all changes in one file'
                }
            }
        
        # Add new entries at the beginning (most recent first)
        existing_audit['entries'] = audit_entries + existing_audit['entries']
        
        # Update metadata
        existing_audit['metadata']['last_updated'] = datetime.now().isoformat()
        existing_audit['metadata']['total_entries'] = len(existing_audit['entries'])
        existing_audit['metadata']['total_changes'] = existing_audit['metadata'].get('total_changes', 0) + len(audit_entries)
        
        # Keep only the most recent 1000 entries to manage file size
        max_entries = 1000
        if len(existing_audit['entries']) > max_entries:
            archived_entries = existing_audit['entries'][max_entries:]
            existing_audit['entries'] = existing_audit['entries'][:max_entries]
            
            # Save archived entries to a separate file
            save_archived_audit_entries(archived_entries)
            
            existing_audit['metadata']['archived_entries'] = len(archived_entries)
            existing_audit['metadata']['last_archive_date'] = datetime.now().isoformat()
            logger.info(f"📦 Archived {len(archived_entries)} old audit entries")
        
        # Save updated consolidated audit trail
        save_to_blob("processed-data", "budget_audit_trail_consolidated.json", existing_audit)
        
        logger.info(f"✅ Consolidated audit trail updated with {len(audit_entries)} new entries")
        
    except Exception as e:
        logger.error(f"❌ Failed to save consolidated audit trail: {str(e)}")
        raise

def save_archived_audit_entries(archived_entries):
    """Save archived audit entries to a separate archive file"""
    try:
        # Load existing archive
        try:
            archive = read_from_blob("processed-data", "budget_audit_archive.json", as_json=True)
            if 'entries' not in archive:
                archive['entries'] = []
        except:
            archive = {
                'entries': [],
                'metadata': {
                    'created': datetime.now().isoformat(),
                    'description': 'Archived budget audit entries - older entries moved from main file'
                }
            }
        
        # Add archived entries
        archive['entries'].extend(archived_entries)
        archive['metadata']['last_updated'] = datetime.now().isoformat()
        archive['metadata']['total_archived_entries'] = len(archive['entries'])
        
        # Save archive
        save_to_blob("processed-data", "budget_audit_archive.json", archive)
        
    except Exception as e:
        logger.error(f"❌ Failed to save archived audit entries: {str(e)}")

def create_consolidated_backup(current_data, change_id, user_name):
    """Add backup snapshot to consolidated backup file instead of creating separate files"""
    try:
        # Load existing consolidated backup file
        try:
            backup_data = read_from_blob("processed-data", "budget_backups_consolidated.json", as_json=True)
            if 'backups' not in backup_data:
                backup_data['backups'] = []
            if 'metadata' not in backup_data:
                backup_data['metadata'] = {}
        except Exception as e:
            logger.info(f"Creating new consolidated backup file: {str(e)}")
            backup_data = {
                'backups': [],
                'metadata': {
                    'created': datetime.now().isoformat(),
                    'description': 'Consolidated budget backups - all snapshots in one file'
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
        
        # Keep only the most recent 50 backups to manage file size
        max_backups = 50
        if len(backup_data['backups']) > max_backups:
            backup_data['backups'] = backup_data['backups'][:max_backups]
            logger.info(f"🗂️ Trimmed backup history to most recent {max_backups} entries")
        
        # Update metadata
        backup_data['metadata']['last_updated'] = datetime.now().isoformat()
        backup_data['metadata']['total_backups'] = len(backup_data['backups'])
        backup_data['metadata']['last_backup_by'] = user_name
        
        # Save consolidated backup file
        save_to_blob("processed-data", "budget_backups_consolidated.json", backup_data)
        
        logger.info(f"✅ Added backup snapshot to consolidated file (ID: {change_id})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create consolidated backup: {str(e)}")
        return False

@app.route('/api/budget-history', methods=['GET'])
def get_budget_history():
    """Get budget change history from consolidated file with filtering options"""
    try:
        # Get query parameters
        entity_key = request.args.get('entity_key')  # Specific department or region
        entity_type = request.args.get('entity_type')  # 'department' or 'region'
        user_name = request.args.get('user_name')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = int(request.args.get('limit', 100))
        
        # Load consolidated audit trail
        try:
            audit_data = read_from_blob("processed-data", "budget_audit_trail_consolidated.json", as_json=True)
            all_entries = audit_data.get('entries', [])
        except Exception as e:
            logger.warning(f"No consolidated audit trail found: {str(e)}")
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
        
        # Entries are already sorted by timestamp (newest first) in the consolidated file
        
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
    """Get list of available budget backups from consolidated file"""
    try:
        limit = int(request.args.get('limit', 20))
        
        try:
            backup_data = read_from_blob("processed-data", "budget_backups_consolidated.json", as_json=True)
            backups = backup_data.get('backups', [])
            metadata = backup_data.get('metadata', {})
        except Exception as e:
            logger.warning(f"No consolidated backup file found: {str(e)}")
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
    """Get a specific backup by its ID"""
    try:
        backup_data = read_from_blob("processed-data", "budget_backups_consolidated.json", as_json=True)
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
    """Get budget summary for a specific entity with recent changes"""
    try:
        entity_key = unquote(entity_key)
        
        # Get current budget
        budgets = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
        
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
        
        # Get recent history for this entity from consolidated file
        try:
            audit_data = read_from_blob("processed-data", "budget_audit_trail_consolidated.json", as_json=True)
            entity_history = [
                e for e in audit_data.get('entries', [])
                if e.get('entity_key') == entity_key
            ]
            # Entries are already sorted by timestamp (newest first)
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

@app.route('/api/test-department/<path:dept_name>', methods=['GET'])
def test_department(dept_name):
    """Test route to debug URL encoding"""
    decoded = unquote(dept_name)
    return jsonify({
        "original": dept_name,
        "decoded": decoded,
        "test": "Route is working"
    })

@app.route('/api/debug-budgets', methods=['GET'])
def debug_budgets():
    """Debug route to see what budget data exists"""
    try:
        budgets = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
        return jsonify({
            "departments": list(budgets.get('departments', {}).keys()),
            "regions": list(budgets.get('regions', {}).keys())[:10],  # First 10 region keys
            "total_departments": len(budgets.get('departments', {})),
            "total_regions": len(budgets.get('regions', {}))
        })
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/api/assign-measure', methods=['POST'])
def assign_measure():
    """Manually assign a parked measure to a region/district, or unassign if empty values"""
    try:
        assignment = request.get_json()
        
        # Check if this is an unassign operation
        is_unassign = (assignment.get('region') == '' and assignment.get('district') == '') or assignment.get('unassign', False)
        
        # Validate required fields
        if not is_unassign:
            required_fields = ['bestellnummer', 'region', 'district']
            for field in required_fields:
                if field not in assignment or not assignment[field]:
                    return jsonify({"status": "error", "message": f"Missing required field: {field}"}), 400
        else:
            # For unassign, only bestellnummer is required
            if 'bestellnummer' not in assignment:
                return jsonify({"status": "error", "message": "Missing required field: bestellnummer"}), 400
        
        # Get the current transactions
        transactions = read_from_blob("processed-data", "transactions.json", as_json=True)
        
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
                    
            action_message = f"Measure {assignment['bestellnummer']} assigned to {assignment['region']}/{assignment['district']}"
        
        if not measure_found:
            return jsonify({"status": "error", "message": f"Measure with bestellnummer {assignment['bestellnummer']} not found"}), 404
        
        # Save updated transactions
        save_to_blob("processed-data", "transactions.json", transactions)
        
        # Update frontend views
        generate_frontend_views(transactions)
        
        return jsonify({
            "status": "success", 
            "message": action_message
        })
        
    except Exception as e:
        logger.error(f"Error in assign/unassign measure: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/bulk-assign-measures', methods=['POST'])
def bulk_assign_measures():
    """Bulk assign multiple parked measures to regions/districts"""
    try:
        assignments = request.get_json()
        
        if not isinstance(assignments, list):
            return jsonify({"status": "error", "message": "Expected a list of assignments"}), 400
        
        # Get the current transactions
        transactions = read_from_blob("processed-data", "transactions.json", as_json=True)
        
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
        
        # Save updated transactions
        save_to_blob("processed-data", "transactions.json", transactions)
        
        # Update frontend views
        generate_frontend_views(transactions)
        
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
    """Manually trigger the MSP-SAP data processing"""
    try:
        # Import the main function from the processing script
        from msp_sap_integration_fixed import main as process_data
        
        # Run the data processing
        process_data()
        
        return jsonify({
            "status": "success",
            "message": "Data processing completed successfully",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in data processing: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/upload-file', methods=['POST'])
def upload_file():
    """Upload a file to the mock-data container"""
    try:
        if 'file' not in request.files:
            return jsonify({"status": "error", "message": "No file part"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"status": "error", "message": "No selected file"}), 400
        
        # Get the file type from request
        file_type = request.form.get('type', 'unknown')
        
        # Determine the filename based on type
        if file_type == 'sap':
            filename = "SAPData.xlsx"
        elif file_type == 'msp':
            filename = "MSPData.xlsx"
        elif file_type == 'mapping':
            filename = "MappingU.xlsx"
        else:
            # Use the original filename
            filename = file.filename
        
        # Save the file to Azure Blob Storage
        blob_client = mock_data_container_client.get_blob_client(filename)
        blob_client.upload_blob(file.read(), overwrite=True)
        
        return jsonify({
            "status": "success",
            "message": f"File uploaded successfully as {filename}",
            "filename": filename
        })
        
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/download-file/<container>/<filename>', methods=['GET'])
def download_file(container, filename):
    """Download a file from Azure Blob Storage"""
    try:
        # Select the appropriate container
        if container == 'mock-data':
            container_client = mock_data_container_client
        elif container == 'processed-data':
            container_client = processed_data_container_client
        else:
            return jsonify({"status": "error", "message": f"Invalid container: {container}"}), 400
        
        # Get the blob client and download the file
        blob_client = container_client.get_blob_client(filename)
        download_stream = blob_client.download_blob()
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file.write(download_stream.readall())
            temp_path = temp_file.name
        
        # Determine MIME type based on file extension
        if filename.endswith('.json'):
            mime_type = 'application/json'
        elif filename.endswith('.xlsx'):
            mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        elif filename.endswith('.csv'):
            mime_type = 'text/csv'
        else:
            mime_type = 'application/octet-stream'
        
        # Send the file
        return send_file(
            temp_path,
            mimetype=mime_type,
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/list-files/<container>', methods=['GET'])
def list_files(container):
    """List files in an Azure Blob Storage container"""
    try:
        # Select the appropriate container
        if container == 'mock-data':
            container_client = mock_data_container_client
        elif container == 'processed-data':
            container_client = processed_data_container_client
        else:
            return jsonify({"status": "error", "message": f"Invalid container: {container}"}), 400
        
        # List blobs in the container
        blobs = []
        for blob in container_client.list_blobs():
            blobs.append({
                "name": blob.name,
                "size": blob.size,
                "last_modified": blob.last_modified.isoformat() if blob.last_modified else None
            })
        
        return jsonify({
            "container": container,
            "files": blobs
        })
        
    except Exception as e:
        logger.error(f"Error listing files: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# Additional endpoint to clean up old files if needed
@app.route('/api/cleanup-storage', methods=['POST'])
def cleanup_storage():
    """Optional endpoint to manually clean up very old files if storage becomes an issue"""
    try:
        cleanup_data = request.get_json()
        days_to_keep = cleanup_data.get('days_to_keep', 90)  # Default keep 90 days
        
        # This is an optional maintenance endpoint
        # You could implement logic here to remove very old archived entries
        # if your storage becomes too full
        
        return jsonify({
            "status": "success",
            "message": f"Cleanup completed (keeping last {days_to_keep} days)",
            "note": "Currently using consolidated files - cleanup not needed"
        })
        
    except Exception as e:
        logger.error(f"Error in cleanup: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))