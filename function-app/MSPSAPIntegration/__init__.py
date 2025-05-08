import azure.functions as func
import logging
import json
import os
from azure.storage.blob import ContainerClient

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')
    
    try:
        # Get SAS URLs
        mock_data_url = os.environ.get("MOCK_DATA_SAS_URL")
        processed_data_url = os.environ.get("PROCESSED_DATA_SAS_URL")
        
        if not mock_data_url or not processed_data_url:
            return func.HttpResponse(
                json.dumps({
                    "status": "error", 
                    "message": "Missing SAS URL environment variables"
                }),
                mimetype="application/json",
                status_code=500
            )
        
        # Test connection to blob storage
        mock_container = ContainerClient.from_container_url(mock_data_url)
        blob_list = list(mock_container.list_blobs(max_results=5))
        
        # Return success with list of available blobs
        return func.HttpResponse(
            json.dumps({
                "status": "success", 
                "message": "Connection test successful",
                "available_blobs": [blob.name for blob in blob_list]
            }),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        logging.error(f"Error: {str(e)}", exc_info=True)
        return func.HttpResponse(
            json.dumps({"status": "error", "message": f"Error: {str(e)}"}),
            mimetype="application/json",
            status_code=500
        )