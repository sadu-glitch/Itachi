import logging
import azure.functions as func
import sys
import os

# Add shared folder to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'shared'))

# Import the main function from the shared module
# You can modify this import based on what you need from msp_sap_integration_fixed.py
from msp_sap_integration_fixed import main as process_integration

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("HTTP trigger received a request.")
    
    # Preserve the existing name parameter functionality
    name = req.params.get('name')
    if not name:
        try:
            req_body = req.get_json()
        except ValueError:
            req_body = {}
        name = req_body.get('name')

    # If a name was provided, return the greeting
    if name:
        return func.HttpResponse(f"Hello, {name}!")
    else:
        try:
            # If no name was provided, run the SAP integration process
            process_integration()
            return func.HttpResponse(
                "SAP integration process completed successfully.",
                status_code=200
            )
        except Exception as e:
            logging.error(f'Error in SAP integration process: {str(e)}')
            return func.HttpResponse(
                f"Error during processing: {str(e)}",
                status_code=500
            )