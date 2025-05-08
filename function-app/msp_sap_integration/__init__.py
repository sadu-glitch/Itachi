import logging
import azure.functions as func
import sys
import os

try:
    # Try importing dependencies
    import pandas as pd
    import numpy as np
    from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
    
    # If successful, try importing the main module
    shared_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared')
    sys.path.append(shared_path)
    
    from msp_sap_integration_fixed import main as process_integration
    
    # Flag to indicate if we can run the full process
    CAN_RUN_FULL_PROCESS = True
    
except ImportError as e:
    logging.error(f"Import error: {str(e)}")
    # Flag to indicate we can't run the full process
    CAN_RUN_FULL_PROCESS = False

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