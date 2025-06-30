"""
fix_insertion.py - Complete the Data Insertion
==============================================

The table was created but data insertion failed. Let's fix that.
"""

import os
import pandas as pd
import json
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
logger = logging.getLogger("fix_insertion")

def fix_insertion():
    """Complete the data insertion that was interrupted"""
    
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
        engine = create_engine(sqlalchemy_url, fast_executemany=True)
        
        with engine.connect() as conn:
            print("🔌 Connected to database")
            
            # Check table exists and is empty
            count = conn.execute(text("SELECT COUNT(*) FROM transactions_normalized")).scalar()
            print(f"📊 Current records in table: {count}")
            
            if count > 0:
                print("⚠️  Table already has data. Clearing it first...")
                conn.execute(text("DELETE FROM transactions_normalized"))
                conn.commit()
                print("✅ Table cleared")
            
            # Load the fixed data
            print("📖 Loading fixed transaction data...")
            query = text("""
                SELECT data 
                FROM processing_results 
                WHERE result_type = 'transactions_fixed'
                ORDER BY created_at DESC
            """)
            
            result = conn.execute(query).fetchone()
            
            if not result:
                print("❌ No fixed transaction data found!")
                return False
            
            data = json.loads(result[0])
            transactions = data.get('transactions', [])
            
            print(f"✅ Loaded {len(transactions):,} transactions from fixed data")
            
            # Convert to normalized format with better error handling
            print("🔄 Converting to normalized format...")
            normalized_records = []
            errors = 0
            
            for i, tx in enumerate(transactions):
                try:
                    if not isinstance(tx, dict):
                        errors += 1
                        continue
                    
                    # Safer field extraction
                    record = {}
                    
                    # String fields
                    record['transaction_id'] = safe_string(tx.get('transaction_id'))
                    record['category'] = safe_string(tx.get('category'))
                    record['status'] = safe_string(tx.get('status'))
                    record['budget_impact'] = safe_string(tx.get('budget_impact'))
                    record['department'] = safe_string(tx.get('department'))
                    record['region'] = safe_string(tx.get('region'))
                    record['district'] = safe_string(tx.get('district'))
                    record['location_type'] = safe_string(tx.get('location_type'))
                    record['measure_id'] = safe_string(tx.get('measure_id'))
                    record['measure_title'] = safe_string(tx.get('measure_title'))
                    record['kostenstelle'] = safe_string(tx.get('kostenstelle'))
                    record['batch_id'] = safe_string(tx.get('batch_id'))
                    
                    # Numeric fields
                    record['amount'] = safe_decimal(tx.get('amount'))
                    record['estimated_amount'] = safe_decimal(tx.get('estimated_amount'))
                    record['actual_amount'] = safe_decimal(tx.get('actual_amount'))
                    record['variance'] = safe_decimal(tx.get('variance'))
                    record['bestellnummer'] = safe_int(tx.get('bestellnummer'))
                    
                    # Date fields
                    record['booking_date'] = safe_date(tx.get('booking_date'))
                    record['measure_date'] = safe_date(tx.get('measure_date'))
                    record['processing_date'] = safe_datetime(tx.get('processing_date'))
                    
                    # JSON fields
                    record['msp_metadata'] = safe_json(tx.get('msp_data'))
                    record['sap_metadata'] = safe_json(tx.get('sap_data'))
                    record['additional_data'] = safe_json({
                        'text': tx.get('text', ''),
                        'name': tx.get('name', ''),
                        'previously_parked': tx.get('previously_parked', False)
                    })
                    
                    normalized_records.append(record)
                    
                    if (i + 1) % 1000 == 0:
                        print(f"  Converted {i + 1:,}/{len(transactions):,} transactions...")
                    
                except Exception as e:
                    errors += 1
                    if errors <= 5:  # Log first 5 errors
                        print(f"⚠️  Error processing transaction {i}: {str(e)}")
                    continue
            
            print(f"✅ Converted {len(normalized_records):,} transactions ({errors} errors)")
            
            if len(normalized_records) == 0:
                print("❌ No records to insert!")
                return False
            
            # Insert data using pandas (more reliable for bulk inserts)
            print("💾 Inserting data into normalized table...")
            
            try:
                # Create DataFrame
                df = pd.DataFrame(normalized_records)
                
                # Insert in smaller batches to avoid timeouts
                batch_size = 500
                total_inserted = 0
                
                for i in range(0, len(df), batch_size):
                    batch_df = df.iloc[i:i + batch_size]
                    
                    # Insert batch
                    batch_df.to_sql(
                        'transactions_normalized',
                        conn,
                        if_exists='append',
                        index=False,
                        method='multi'
                    )
                    
                    total_inserted += len(batch_df)
                    print(f"  ✅ Inserted {total_inserted:,}/{len(df):,} records")
                
                print(f"🎉 Successfully inserted {total_inserted:,} records!")
                
                # Verify insertion
                final_count = conn.execute(text("SELECT COUNT(*) FROM transactions_normalized")).scalar()
                print(f"📊 Final count in table: {final_count:,}")
                
                if final_count > 0:
                    print("✅ Data insertion completed successfully!")
                    return True
                else:
                    print("❌ Insertion failed - no records found")
                    return False
                    
            except Exception as e:
                print(f"❌ Bulk insert failed: {str(e)}")
                print("🔧 Trying row-by-row insertion...")
                return try_row_by_row_insert(conn, normalized_records)
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def try_row_by_row_insert(conn, normalized_records):
    """Fallback: Insert row by row"""
    try:
        insert_sql = text("""
            INSERT INTO transactions_normalized (
                transaction_id, category, status, budget_impact, amount, estimated_amount,
                actual_amount, variance, department, region, district, location_type,
                booking_date, measure_date, bestellnummer, measure_id, measure_title,
                kostenstelle, batch_id, processing_date, msp_metadata, sap_metadata, additional_data
            ) VALUES (
                :transaction_id, :category, :status, :budget_impact, :amount, :estimated_amount,
                :actual_amount, :variance, :department, :region, :district, :location_type,
                :booking_date, :measure_date, :bestellnummer, :measure_id, :measure_title,
                :kostenstelle, :batch_id, :processing_date, :msp_metadata, :sap_metadata, :additional_data
            )
        """)
        
        successful_inserts = 0
        failed_inserts = 0
        
        for i, record in enumerate(normalized_records):
            try:
                conn.execute(insert_sql, record)
                successful_inserts += 1
                
                if (i + 1) % 100 == 0:
                    conn.commit()  # Commit every 100 records
                    print(f"  Inserted {successful_inserts:,} records...")
                    
            except Exception as e:
                failed_inserts += 1
                if failed_inserts <= 5:
                    print(f"⚠️  Failed to insert record {i}: {str(e)}")
        
        conn.commit()  # Final commit
        
        print(f"✅ Row-by-row insertion completed:")
        print(f"   Successful: {successful_inserts:,}")
        print(f"   Failed: {failed_inserts:,}")
        
        return successful_inserts > 0
        
    except Exception as e:
        print(f"❌ Row-by-row insertion failed: {str(e)}")
        return False

def safe_string(value, max_length=None):
    """Safely convert to string"""
    try:
        if value is None:
            return ''
        result = str(value)
        if max_length and len(result) > max_length:
            result = result[:max_length]
        return result
    except:
        return ''

def safe_decimal(value):
    """Safely convert to decimal"""
    try:
        if value is None or value == '':
            return None
        return float(value)
    except:
        return None

def safe_int(value):
    """Safely convert to int"""
    try:
        if value is None or value == '':
            return None
        return int(float(str(value)))
    except:
        return None

def safe_date(value):
    """Safely convert to date"""
    try:
        if not value:
            return None
        if isinstance(value, str):
            return datetime.strptime(value[:10], '%Y-%m-%d').date()
        return value
    except:
        return None

def safe_datetime(value):
    """Safely convert to datetime"""
    try:
        if not value:
            return None
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        return value
    except:
        return None

def safe_json(value):
    """Safely convert to JSON string"""
    try:
        if not value:
            return None
        return json.dumps(value)
    except:
        return None

def main():
    print("🔧 Fixing Data Insertion")
    print("=" * 30)
    
    success = fix_insertion()
    
    if success:
        print("\n🎉 SUCCESS! Data insertion completed!")
        print("Now run: python verify_table.py")
    else:
        print("\n❌ Insertion still failed")

if __name__ == "__main__":
    main()