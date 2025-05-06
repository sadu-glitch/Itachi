import logging
import azure.functions as func
from .. import msp_sap_integration_fixed

def main(mytimer: func.TimerRequest) -> None:
    logging.info('Python timer trigger function started')
    
    try:
        # Run the data processing
        msp_sap_integration_fixed.main()
        logging.info('Data processing completed successfully')
    except Exception as e:
        logging.error(f'Error in data processing: {str(e)}')
        raise

    # Änderung für GitHub Deployment-Test
