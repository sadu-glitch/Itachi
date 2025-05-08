import logging
import azure.functions as func

try:
    from msp_sap_integration_fixed import main as process_integration
    CAN_RUN_FULL_PROCESS = True
except ImportError as e:
    logging.error(f"Import error: {str(e)}")
    CAN_RUN_FULL_PROCESS = False

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("HTTP trigger received a request.")
    
    name = req.params.get('name')
    if not name:
        try:
            req_body = req.get_json()
        except ValueError:
            req_body = {}
        name = req_body.get('name')

    if name:
        return func.HttpResponse(f"Hello, {name}!")
    else:
        if CAN_RUN_FULL_PROCESS:
            try:
                process_integration()
                return func.HttpResponse("SAP integration process completed successfully.", status_code=200)
            except Exception as e:
                logging.error(f'Error in SAP integration process: {str(e)}')
                return func.HttpResponse(f"Error during processing: {str(e)}", status_code=500)
        else:
            return func.HttpResponse(
                "Cannot run the full process because required packages are missing.",
                status_code=500
            )
