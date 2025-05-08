import logging
import azure.functions as func
import sys
import os

# Add shared folder to path - this should point to shared inside function-app
shared_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared')
sys.path.append(shared_path)

try:
    # Log the available paths
    logging.info(f"System path: {sys.path}")
    
    # Log the contents of the shared directory
    if os.path.exists(shared_path):
        logging.info(f"Shared directory exists. Contents: {os.listdir(shared_path)}")
    else:
        logging.error(f"Shared directory does not exist: {shared_path}")
    
    # Import the main function from the shared module
    from msp_sap_integration_fixed import main as process_integration
except Exception as e:
    logging.error(f"Import error: {str(e)}")
    raise

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