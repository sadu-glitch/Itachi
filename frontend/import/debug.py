"""
debug_json.py - JSON Data Debugger and Fixer
===========================================

This will help us understand what's wrong with your JSON data and fix it.
"""

import os
import json
import logging
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Database connection
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"
DB_USER = "msp_admin"
DB_PASSWORD = os.getenv("DB_PASSWORD")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debug")

def debug_json_data():
    """Debug the JSON data structure issue"""
    
    if not DB_PASSWORD:
        print("❌ DB_PASSWORD not set!")
        return
    
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
            
            # Get the raw JSON data
            query = text("""
                SELECT data 
                FROM processing_results 
                WHERE result_type = 'transactions'
                ORDER BY created_at DESC
            """)
            
            result = conn.execute(query).fetchone()
            
            if not result:
                print("❌ No transaction data found")
                return
            
            raw_data = result[0]
            print(f"📊 Raw data type: {type(raw_data)}")
            print(f"📊 Raw data length: {len(raw_data):,} characters")
            print(f"📊 First 200 characters: {raw_data[:200]}")
            print(f"📊 Last 200 characters: {raw_data[-200:]}")
            print()
            
            # Try to parse as JSON
            try:
                parsed_data = json.loads(raw_data)
                print("✅ JSON parsing successful")
                print(f"📊 Parsed data type: {type(parsed_data)}")
                print(f"📊 Top-level keys: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'Not a dict'}")
                
                if isinstance(parsed_data, dict) and 'transactions' in parsed_data:
                    transactions = parsed_data['transactions']
                    print(f"📊 Transactions type: {type(transactions)}")
                    print(f"📊 Transactions length: {len(transactions) if hasattr(transactions, '__len__') else 'No length'}")
                    
                    if isinstance(transactions, str):
                        print("🚨 PROBLEM FOUND: 'transactions' is a STRING, not a LIST!")
                        print(f"📊 String starts with: {transactions[:100]}")
                        print("🔧 Attempting to fix...")
                        
                        # Try to parse the string as JSON
                        try:
                            fixed_transactions = json.loads(transactions)
                            print(f"✅ Fixed! Now it's a {type(fixed_transactions)} with {len(fixed_transactions)} items")
                            
                            # Check first few items
                            if len(fixed_transactions) > 0:
                                print(f"📋 First transaction type: {type(fixed_transactions[0])}")
                                if isinstance(fixed_transactions[0], dict):
                                    print(f"📋 First transaction keys: {list(fixed_transactions[0].keys())[:10]}")
                                else:
                                    print(f"📋 First transaction value: {fixed_transactions[0]}")
                            
                            # Save the fixed data
                            save_fixed_data(conn, parsed_data, fixed_transactions)
                            
                        except json.JSONDecodeError as e:
                            print(f"❌ Cannot fix the transactions string: {str(e)}")
                            
                    elif isinstance(transactions, list):
                        print("✅ Transactions is correctly a list")
                        if len(transactions) > 0:
                            print(f"📋 First transaction type: {type(transactions[0])}")
                            if isinstance(transactions[0], dict):
                                print(f"📋 First transaction keys: {list(transactions[0].keys())[:10]}")
                        
                else:
                    print("❌ No 'transactions' key found in data")
                    
            except json.JSONDecodeError as e:
                print(f"❌ JSON parsing failed: {str(e)}")
                print("📊 This suggests the data is corrupted or not valid JSON")
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def save_fixed_data(conn, original_data, fixed_transactions):
    """Save the fixed data back to the database"""
    print("💾 Saving fixed data...")
    
    try:
        # Create the corrected data structure
        fixed_data = original_data.copy()
        fixed_data['transactions'] = fixed_transactions
        
        # Convert back to JSON
        fixed_json = json.dumps(fixed_data, separators=(',', ':'))
        
        # Save with a new result_type to avoid overwriting original
        insert_query = text("""
            INSERT INTO processing_results (result_type, data, created_at, processing_date)
            VALUES (:result_type, :data, :created_at, :processing_date)
        """)
        
        from datetime import datetime
        timestamp = datetime.now()
        
        conn.execute(insert_query, {
            "result_type": "transactions_fixed",
            "data": fixed_json,
            "created_at": timestamp,
            "processing_date": timestamp.isoformat()
        })
        conn.commit()
        
        print("✅ Fixed data saved as 'transactions_fixed'")
        print("🔧 You can now run migration using the fixed data")
        
    except Exception as e:
        print(f"❌ Failed to save fixed data: {str(e)}")

def check_all_processing_results():
    """Check all processing results to understand the data better"""
    
    if not DB_PASSWORD:
        print("❌ DB_PASSWORD not set!")
        return
    
    try:
        quoted_password = quote_plus(str(DB_PASSWORD))
        sqlalchemy_url = (
            f"mssql+pyodbc://{DB_USER}:{quoted_password}@{DB_SERVER}/{DB_NAME}"
            f"?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
        )
        engine = create_engine(sqlalchemy_url)
        
        with engine.connect() as conn:
            print("🔍 Checking all processing results...")
            
            query = text("""
                SELECT 
                    result_type,
                    LEN(data) as data_length,
                    created_at,
                    LEFT(data, 100) as data_sample
                FROM processing_results 
                ORDER BY created_at DESC
            """)
            
            results = conn.execute(query).fetchall()
            
            print(f"📊 Found {len(results)} processing results:")
            print("-" * 80)
            
            for row in results:
                result_type, data_length, created_at, data_sample = row
                print(f"Type: {result_type}")
                print(f"Length: {data_length:,} characters")
                print(f"Created: {created_at}")
                print(f"Sample: {data_sample}...")
                print("-" * 80)
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def main():
    """Main function"""
    print("🔍 JSON Data Debugger")
    print("=" * 40)
    print()
    
    print("1. Debugging JSON structure...")
    debug_json_data()
    
    print("\n" + "=" * 40)
    print("2. Checking all processing results...")
    check_all_processing_results()

if __name__ == "__main__":
    main()