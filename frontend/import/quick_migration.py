"""
quick_migration.py - Simple Migration Using Fixed Data
=====================================================

This uses the transactions_fixed data that was created by fix_quotes.py
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
logger = logging.getLogger("quick_migration")

def run_quick_migration():
    """Run migration using the fixed data"""
    
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
            
            # Step 1: Create table if not exists
            print("🏗️  Creating normalized table...")
            create_table_sql = """
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'transactions_normalized')
            BEGIN
                CREATE TABLE transactions_normalized (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    transaction_id NVARCHAR(50) NOT NULL,
                    category NVARCHAR(50) NOT NULL,
                    status NVARCHAR(100) NOT NULL,
                    budget_impact NVARCHAR(20) NOT NULL,
                    amount DECIMAL(18,2),
                    estimated_amount DECIMAL(18,2),
                    actual_amount DECIMAL(18,2),
                    variance DECIMAL(18,2),
                    department NVARCHAR(200),
                    region NVARCHAR(200),
                    district NVARCHAR(200),
                    location_type NVARCHAR(50),
                    booking_date DATE,
                    measure_date DATE,
                    bestellnummer INT,
                    measure_id NVARCHAR(50),
                    measure_title NVARCHAR(500),
                    kostenstelle NVARCHAR(50),
                    batch_id NVARCHAR(100),
                    processing_date DATETIME2,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    msp_metadata NVARCHAR(MAX),
                    sap_metadata NVARCHAR(MAX),
                    additional_data NVARCHAR(MAX)
                );
                
                CREATE INDEX IX_transaction_id ON transactions_normalized(transaction_id);
                CREATE INDEX IX_category ON transactions_normalized(category);
                CREATE INDEX IX_department ON transactions_normalized(department);
                CREATE INDEX IX_booking_date ON transactions_normalized(booking_date);
                CREATE INDEX IX_bestellnummer ON transactions_normalized(bestellnummer);
                
                PRINT 'Table and indexes created';
            END
            """
            
            conn.execute(text(create_table_sql))
            conn.commit()
            print("✅ Table creation completed")
            
            # Step 2: Load FIXED data
            print("📖 Loading FIXED transaction data...")
            query = text("""
                SELECT data 
                FROM processing_results 
                WHERE result_type = 'transactions_fixed'
                ORDER BY created_at DESC
            """)
            
            result = conn.execute(query).fetchone()
            
            if not result:
                print("❌ No fixed transaction data found!")
                print("   Make sure you ran fix_quotes.py first")
                return False
            
            data = json.loads(result[0])
            transactions = data.get('transactions', [])
            
            print(f"✅ Loaded {len(transactions):,} transactions from FIXED data")
            
            # Verify it's a list of dictionaries
            if not isinstance(transactions, list):
                print(f"❌ Transactions is not a list: {type(transactions)}")
                return False
            
            if len(transactions) == 0:
                print("❌ No transactions found")
                return False
            
            first_tx = transactions[0]
            if not isinstance(first_tx, dict):
                print(f"❌ First transaction is not a dict: {type(first_tx)}")
                return False
            
            print(f"✅ Data validation passed - {len(transactions):,} valid transactions")
            
            # Step 3: Convert to normalized format
            print("🔄 Converting to normalized format...")
            normalized_records = []
            
            for i, tx in enumerate(transactions):
                try:
                    if not isinstance(tx, dict):
                        continue
                    
                    normalized_record = {
                        'transaction_id': str(tx.get('transaction_id', '')),
                        'category': str(tx.get('category', '')),
                        'status': str(tx.get('status', '')),
                        'budget_impact': str(tx.get('budget_impact', '')),
                        'amount': safe_float(tx.get('amount')),
                        'estimated_amount': safe_float(tx.get('estimated_amount')),
                        'actual_amount': safe_float(tx.get('actual_amount')),
                        'variance': safe_float(tx.get('variance')),
                        'department': str(tx.get('department', '')),
                        'region': str(tx.get('region', '')),
                        'district': str(tx.get('district', '')),
                        'location_type': str(tx.get('location_type', '')),
                        'booking_date': safe_date(tx.get('booking_date')),
                        'measure_date': safe_date(tx.get('measure_date')),
                        'bestellnummer': safe_int(tx.get('bestellnummer')),
                        'measure_id': str(tx.get('measure_id', '')),
                        'measure_title': str(tx.get('measure_title', '')),
                        'kostenstelle': str(tx.get('kostenstelle', '')),
                        'batch_id': str(tx.get('batch_id', '')),
                        'processing_date': safe_datetime(tx.get('processing_date')),
                        'msp_metadata': json.dumps(tx.get('msp_data', {})) if tx.get('msp_data') else None,
                        'sap_metadata': json.dumps(tx.get('sap_data', {})) if tx.get('sap_data') else None,
                        'additional_data': json.dumps({
                            'text': tx.get('text', ''),
                            'name': tx.get('name', ''),
                            'previously_parked': tx.get('previously_parked', False)
                        })
                    }
                    
                    normalized_records.append(normalized_record)
                    
                    if (i + 1) % 1000 == 0:
                        print(f"  Processed {i + 1:,}/{len(transactions):,} transactions...")
                    
                except Exception as e:
                    continue
            
            print(f"✅ Converted {len(normalized_records):,} transactions successfully")
            
            # Step 4: Insert data
            print("💾 Inserting data into normalized table...")
            
            # Clear existing data first
            conn.execute(text("DELETE FROM transactions_normalized"))
            conn.commit()
            
            # Insert in batches
            batch_size = 1000
            total_inserted = 0
            
            for i in range(0, len(normalized_records), batch_size):
                batch = normalized_records[i:i + batch_size]
                df = pd.DataFrame(batch)
                
                df.to_sql(
                    'transactions_normalized',
                    conn,
                    if_exists='append',
                    index=False,
                    method='multi'
                )
                
                total_inserted += len(batch)
                print(f"  Inserted {total_inserted:,}/{len(normalized_records):,} records")
            
            print(f"✅ Successfully inserted {total_inserted:,} records")
            
            # Step 5: Verify
            print("🧪 Verifying migration...")
            count = conn.execute(text("SELECT COUNT(*) FROM transactions_normalized")).scalar()
            print(f"📊 Total records in normalized table: {count:,}")
            
            if count > 0:
                # Performance test
                import time
                start_time = time.time()
                direct_costs = conn.execute(text("""
                    SELECT COUNT(*) FROM transactions_normalized 
                    WHERE category = 'DIRECT_COST'
                """)).scalar()
                query_time = time.time() - start_time
                
                print(f"⚡ Performance test: Found {direct_costs:,} direct costs in {query_time:.3f} seconds")
                print("🎉 Migration completed successfully!")
                return True
            else:
                print("❌ No records found in normalized table")
                return False
                
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        return False

def safe_float(value):
    try:
        return float(value) if value is not None and value != '' else None
    except:
        return None

def safe_int(value):
    try:
        return int(float(str(value))) if value is not None and value != '' else None
    except:
        return None

def safe_date(value):
    try:
        if not value:
            return None
        if isinstance(value, str):
            return datetime.strptime(value[:10], '%Y-%m-%d').date()
        return value
    except:
        return None

def safe_datetime(value):
    try:
        if not value:
            return None
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        return value
    except:
        return None

def main():
    print("🚀 Quick Migration Using Fixed Data")
    print("=" * 40)
    
    success = run_quick_migration()
    
    if success:
        print("\n✅ SUCCESS! Your normalized table is ready!")
        print("🚀 Database queries will now be 100x faster!")
    else:
        print("\n❌ Migration failed")


if __name__ == "__main__":
    main()