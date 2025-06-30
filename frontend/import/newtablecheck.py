"""
check_migration.py - Quick Migration Status Checker
==================================================

Simple script to check if the migration worked.
Just run this to see the status!
"""

import os
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Database connection (same as your main script)
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"
DB_USER = "msp_admin"
DB_PASSWORD = os.getenv("DB_PASSWORD")

def check_migration_status():
    """Check if migration worked"""
    
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
            print("🔌 Connected to database successfully!")
            print("=" * 50)
            
            # Check 1: Does the table exist?
            table_check = conn.execute(text("""
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'transactions_normalized'
            """)).scalar()
            
            if table_check == 0:
                print("❌ Table 'transactions_normalized' does NOT exist")
                print("   Migration was not completed.")
                return
            else:
                print("✅ Table 'transactions_normalized' exists!")
            
            # Check 2: How many records?
            record_count = conn.execute(text("""
                SELECT COUNT(*) FROM transactions_normalized
            """)).scalar()
            
            print(f"📊 Records in normalized table: {record_count:,}")
            
            if record_count == 0:
                print("⚠️  Table exists but is empty - migration was interrupted")
            else:
                print("✅ Table has data - migration worked!")
            
            # Check 3: Sample data
            if record_count > 0:
                print("\n📋 Sample records:")
                sample_data = conn.execute(text("""
                    SELECT TOP 5 
                        transaction_id,
                        category,
                        department,
                        amount,
                        booking_date
                    FROM transactions_normalized
                """)).fetchall()
                
                for row in sample_data:
                    print(f"  {row[0]} | {row[1]} | {row[2]} | €{row[3] or 0:.2f} | {row[4] or 'N/A'}")
            
            # Check 4: Performance test
            if record_count > 0:
                print("\n⚡ Performance test:")
                import time
                
                start_time = time.time()
                direct_costs = conn.execute(text("""
                    SELECT COUNT(*) FROM transactions_normalized 
                    WHERE category = 'DIRECT_COST'
                """)).scalar()
                query_time = time.time() - start_time
                
                print(f"   Found {direct_costs:,} direct costs in {query_time:.3f} seconds")
                
                if query_time < 1.0:
                    print("   🚀 FAST! Migration successful!")
                else:
                    print("   🐌 Slow - might need indexes")
            
            # Check 5: Categories breakdown
            if record_count > 0:
                print("\n📈 Data breakdown by category:")
                categories = conn.execute(text("""
                    SELECT category, COUNT(*) as count
                    FROM transactions_normalized
                    GROUP BY category
                    ORDER BY count DESC
                """)).fetchall()
                
                for cat, count in categories:
                    print(f"   {cat}: {count:,} records")
            
            print("\n" + "=" * 50)
            if record_count > 0:
                print("🎉 MIGRATION STATUS: SUCCESS!")
                print("✅ Your normalized table is ready to use!")
            else:
                print("⚠️  MIGRATION STATUS: INCOMPLETE")
                print("   Table exists but no data was migrated")
                
    except Exception as e:
        print(f"❌ Error checking migration: {str(e)}")

if __name__ == "__main__":
    print("🔍 Checking Migration Status...")
    check_migration_status()