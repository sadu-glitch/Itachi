from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import io
import json
import pandas as pd
import tempfile
from datetime import datetime
import logging
from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
from msp_sap_integration_fixed import safe_float_conversion, JSONEncoder

# Import our processing functionsss
from msp_sap_integration_fixed import (
    read_from_blob, 
    save_to_blob, 
    generate_frontend_views,
    safe_float_conversion,
    JSONEncoder
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
    """Get or update budget allocations"""
    try:
        if request.method == 'GET':
            # Get current budget allocations
            try:
                budgets = read_from_blob("processed-data", "budget_allocation.json", as_json=True)
                return jsonify(budgets)
            except Exception as e:
                return jsonify({"status": "error", "message": f"Could not read budget allocation: {str(e)}"}), 404
        
        elif request.method == 'POST':
            # Update budget allocations
            data = request.get_json()
            
            if not data:
                return jsonify({"status": "error", "message": "No data provided"}), 400
            
            # Validate data structure
            if 'departments' not in data or 'regions' not in data:
                return jsonify({"status": "error", "message": "Invalid data structure"}), 400
            
            # Save to Azure Blob Storage
            save_to_blob("processed-data", "budget_allocation.json", data)
            
            return jsonify({"status": "success", "message": "Budget allocation updated successfully"})
    
    except Exception as e:
        logger.error(f"Error in budget allocation: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/assign-measure', methods=['POST'])
def assign_measure():
    """Manually assign a parked measure to a region/district"""
    try:
        assignment = request.get_json()
        
        # Validate required fields
        required_fields = ['bestellnummer', 'region', 'district']
        for field in required_fields:
            if field not in assignment:
                return jsonify({"status": "error", "message": f"Missing required field: {field}"}), 400
        
        # Get the current transactions
        transactions = read_from_blob("processed-data", "transactions.json", as_json=True)
        
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
                
                break
        
        if not measure_found:
            return jsonify({"status": "error", "message": f"Measure with bestellnummer {assignment['bestellnummer']} not found"}), 404
        
        # Save updated transactions
        save_to_blob("processed-data", "transactions.json", transactions)
        
        # Update frontend views
        generate_frontend_views(transactions)
        
        return jsonify({
            "status": "success", 
            "message": f"Measure {assignment['bestellnummer']} assigned to {assignment['region']}/{assignment['district']}"
        })
        
    except Exception as e:
        logger.error(f"Error assigning measure: {str(e)}")
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))