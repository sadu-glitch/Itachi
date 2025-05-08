import logging
import azure.functions as func
import sys

# Flag to indicate if we can run the full process
CAN_RUN_FULL_PROCESS = False

try:
    # Try importing dependencies step by step with detailed logging
    logging.info("Starting imports...")
    
    import pandas as pd
    logging.info("Imported pandas")
    
    import numpy as np
    logging.info("Imported numpy")
    
    from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
    logging.info("Imported azure.storage.blob")
    
    # Import the processing function from the original file name
    from .msp_sap_integration_fixed import main as process_integration
    logging.info("Successfully imported process_integration")
    
    # Log the Python path for debugging
    logging.info(f"Python path: {sys.path}")
    
    # If we made it here, all imports succeeded
    CAN_RUN_FULL_PROCESS = True
    
except ImportError as e:
    logging.error(f"Import error: {str(e)}")
    logging.error(f"Python path: {sys.path}")
    # We'll leave CAN_RUN_FULL_PROCESS as False

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
        if CAN_RUN_FULL_PROCESS:
            try:
                # Run the full process
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
        else:
            # Return a message about missing dependencies
            return func.HttpResponse(
                "Cannot run the full process because required packages are missing. "
                "Please check the deployment and ensure all requirements are installed.",
                status_code=500
            )