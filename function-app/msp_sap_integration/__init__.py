import logging
import azure.functions as func
import sys

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
        # No try/catch here - let errors bubble up to show proper status
        logging.info("Beginning imports...")
        
        # Import pandas and log result
        import pandas as pd
        logging.info("✓ Successfully imported pandas")
            
        # Import numpy and log result
        import numpy as np
        logging.info("✓ Successfully imported numpy")
            
        # Import Azure blob storage and log result
        from azure.storage.blob import BlobServiceClient, BlobClient, ContainerClient
        logging.info("✓ Successfully imported azure.storage.blob")
            
        # Import the processing function and log result
        from .msp_sap_integration_fixed import main as process_integration
        logging.info("✓ Successfully imported msp_sap_integration_fixed")
            
        # Log the Python path
        logging.info(f"Python path: {sys.path}")
            
        # All imports successful, run the process
        process_integration()
        return func.HttpResponse(
            "SAP integration process completed successfully.",
            status_code=200
        )