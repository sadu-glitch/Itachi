"""
fix_quotes.py - Fix Python String Format to JSON
===============================================

This fixes the single quote vs double quote issue in your transaction data.
"""

import os
import json
import ast
import logging
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus
from datetime import datetime

# Database connection
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"
DB_USER = "msp_admin"
DB_PASSWORD = os.getenv("DB_PASSWORD")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_quotes")

def fix_python_quotes_to_json():
    """Fix the Python string format to proper JSON format"""
    
    if not DB_PASSWORD:
        print("❌ DB_PASSWORD not set!")
        return False
    
    try:
        # Connect to database
        quoted_password = quote_plus(str(DB_PASSWORD))
        sqlalchemy_url = (
            f"mssql+pyodbc://{DB_USER}:{quoted_password}@{DB_SERVER}/{DB_NAME}"
            f"?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
        )
        engine = create_engine(sqlalchemy_url)
        
        with engine.connect() as conn:
            print("🔌 Connected to database")
            
            # Get the corrupted data
            query = text("""
                SELECT data 
                FROM processing_results 
                WHERE result_type = 'transactions'
                ORDER BY created_at DESC
            """)
            
            result = conn.execute(query).fetchone()
            if not result:
                print("❌ No transaction data found")
                return False
            
            print("📖 Loading corrupted data...")
            raw_data = result[0]
            parsed_data = json.loads(raw_data)
            
            # Get the problematic transactions string
            transactions_str = parsed_data['transactions']
            print(f"📊 Transactions string length: {len(transactions_str):,} characters")
            print(f"📊 First 100 chars: {transactions_str[:100]}")
            
            # Fix the Python format by using ast.literal_eval
            print("🔧 Converting Python string format to proper Python objects...")
            try:
                # Use ast.literal_eval to safely parse Python string representation
                transactions_list = ast.literal_eval(transactions_str)
                print(f"✅ Successfully parsed! Got {len(transactions_list):,} transactions")
                
                # Verify it's a list of dictionaries
                if isinstance(transactions_list, list) and len(transactions_list) > 0:
                    first_tx = transactions_list[0]
                    if isinstance(first_tx, dict):
                        print(f"✅ First transaction is a dict with keys: {list(first_tx.keys())[:10]}")
                    else:
                        print(f"❌ First transaction is not a dict: {type(first_tx)}")
                        return False
                else:
                    print("❌ Not a valid list of transactions")
                    return False
                
            except (ValueError, SyntaxError) as e:
                print(f"❌ ast.literal_eval failed: {str(e)}")
                return False
            
            # Create the corrected data structure
            print("🔧 Creating corrected data structure...")
            corrected_data = parsed_data.copy()
            corrected_data['transactions'] = transactions_list  # Replace string with actual list
            
            # Also fix other arrays that might have the same problem
            for key in ['direct_costs', 'booked_measures', 'parked_measures', 'outliers', 'placeholders']:
                if key in corrected_data and isinstance(corrected_data[key], str):
                    try:
                        corrected_data[key] = ast.literal_eval(corrected_data[key])
                        print(f"✅ Fixed {key} array")
                    except:
                        print(f"⚠️  Could not fix {key}, keeping as is")
            
            # Convert back to JSON (proper format)
            print("💾 Saving corrected data...")
            corrected_json = json.dumps(corrected_data, separators=(',', ':'))
            
            # Save the corrected data
            insert_query = text("""
                INSERT INTO processing_results (result_type, data, created_at, processing_date)
                VALUES (:result_type, :data, :created_at, :processing_date)
            """)
            
            timestamp = datetime.now()
            conn.execute(insert_query, {
                "result_type": "transactions_fixed",
                "data": corrected_json,
                "created_at": timestamp,
                "processing_date": timestamp.isoformat()
            })
            conn.commit()
            
            print("✅ Corrected data saved as 'transactions_fixed'")
            
            # Verify the fix
            print("🧪 Verifying the fix...")
            verify_query = text("""
                SELECT data 
                FROM processing_results 
                WHERE result_type = 'transactions_fixed'
                ORDER BY created_at DESC
            """)
            
            verify_result = conn.execute(verify_query).fetchone()
            if verify_result:
                verify_data = json.loads(verify_result[0])
                verify_transactions = verify_data['transactions']
                
                if isinstance(verify_transactions, list):
                    print(f"✅ Verification successful! {len(verify_transactions):,} transactions in proper format")
                    
                    # Check first transaction
                    if len(verify_transactions) > 0:
                        first_tx = verify_transactions[0]
                        print(f"📋 Sample transaction: {first_tx}")
                    
                    return True
                else:
                    print("❌ Verification failed - still not a list")
                    return False
            else:
                print("❌ Could not verify - fixed data not found")
                return False
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def main():
    """Main function"""
    print("🔧 Python Quotes to JSON Fixer")
    print("=" * 40)
    print("This will fix the single quote vs double quote issue")
    print()
    
    success = fix_python_quotes_to_json()
    
    if success:
        print("\n🎉 SUCCESS! Your data has been fixed!")
        print("✅ You can now run the migration using 'transactions_fixed' data")
        print("\nNext step: Run migration_fixed.py")
    else:
        print("\n❌ Failed to fix the data")

if __name__ == "__main__":
    main()