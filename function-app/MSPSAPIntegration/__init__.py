import azure.functions as func
import logging
import json
import os
from msp_sap_integration_fixed import main as process_data

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')

    try:
        # Execute the MSP SAP Integration process
        process_data()
        
        # Return successs response
        return func.HttpResponse(
            json.dumps({"status": "success", "message": "MSP SAP Integration completed successfully"}),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        logging.error(f"Error in MSP SAP Integration: {str(e)}", exc_info=True)
        return func.HttpResponse(
            json.dumps({"status": "error", "message": f"Error: {str(e)}"}),
            mimetype="application/json",
            status_code=500
        )