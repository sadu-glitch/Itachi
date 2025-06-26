#!/usr/bin/env python3
"""
Database Diagnostic Script for MSP-SAP Integration
Run this to diagnose what's actually in your database
"""

import os
import json
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine, text
from urllib.parse import quote_plus

# Database connection parameters
DB_SERVER = "msp-sap-database-sadu.database.windows.net"
DB_NAME = "Marketing"
DB_USER = "msp_admin"
DB_PASSWORD = os.getenv("DB_PASSWORD")

def setup_database_connection():
    """Setup database connection"""
    if not DB_PASSWORD:
        raise ValueError("DB_PASSWORD environment variable not set")
    
    quoted_password = quote_plus(str(DB_PASSWORD))
    sqlalchemy_url = (
        f"mssql+pyodbc://{DB_USER}:{quoted_password}@{DB_SERVER}/{DB_NAME}"
        f"?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
    )
    
    engine = create_engine(sqlalchemy_url)
    return engine

def diagnose_database():
    """Run comprehensive database diagnostics"""
    print("🔍 MSP-SAP Database Diagnostics")
    print("=" * 50)
    
    engine = setup_database_connection()
    
    # Test connection
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1 as test")).fetchone()
            print("✅ Database connection: SUCCESS")
    except Exception as e:
        print(f"❌ Database connection: FAILED - {e}")
        return
    
    print("\n1. PROCESSING RESULTS TABLE ANALYSIS")
    print("-" * 40)
    
    # Check what's in processing_results
    try:
        query = text("""
            SELECT 
                result_type,
                created_at,
                LEN(data) as data_length,
                CASE 
                    WHEN ISJSON(data) = 1 THEN 'Valid JSON'
                    ELSE 'Invalid JSON'
                END as json_status
            FROM processing_results 
            ORDER BY created_at DESC
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql_query(query, conn)
            
        if len(df) > 0:
            print("Processing results found:")
            for _, row in df.iterrows():
                print(f"  • {row['result_type']}: {row['data_length']:,} chars, {row['json_status']}, {row['created_at']}")
        else:
            print("❌ No processing results found!")
            
    except Exception as e:
        print(f"❌ Error reading processing_results: {e}")
    
    print("\n2. SOURCE DATA ANALYSIS")
    print("-" * 40)
    
    # Check source tables
    source_tables = [
        ("sap_transactions", "BULK_IMPORT_%"),
        ("msp_measures", "MSP_%"),
        ("kostenstelle_mapping_floor", "BULK_IMPORT_%"),
        ("kostenstelle_mapping_hq", "HQ_FIX_%")
    ]
    
    for table_name, pattern in source_tables:
        try:
            query = text(f"""
                SELECT 
                    COUNT(*) as total_records,
                    COUNT(DISTINCT batch_id) as batch_count,
                    MAX(upload_date) as latest_date
                FROM {table_name}
                WHERE batch_id LIKE :pattern
            """)
            
            with engine.connect() as conn:
                result = conn.execute(query, {"pattern": pattern}).fetchone()
                
            print(f"  • {table_name}: {result[0]:,} records, {result[1]} batches, latest: {result[2]}")
            
        except Exception as e:
            print(f"  ❌ {table_name}: Error - {e}")
    
    print("\n3. TRANSACTIONS DATA DEEP DIVE")
    print("-" * 40)
    
    # Get the actual transactions data
    try:
        query = text("""
            SELECT TOP 1 data 
            FROM processing_results 
            WHERE result_type = 'transactions'
            ORDER BY created_at DESC
        """)
        
        with engine.connect() as conn:
            result = conn.execute(query).fetchone()
            
        if result:
            data_str = result[0]
            print(f"Raw data type: {type(data_str)}")
            print(f"Raw data length: {len(data_str):,} characters")
            print(f"First 200 chars: {data_str[:200]}...")
            
            # Try to parse as JSON
            try:
                data = json.loads(data_str)
                print(f"✅ Successfully parsed as JSON")
                print(f"Top-level keys: {list(data.keys())}")
                
                # Analyze transactions array
                transactions = data.get('transactions', [])
                print(f"Transactions count: {len(transactions)}")
                
                if len(transactions) > 0:
                    sample_tx = transactions[0]
                    print(f"Sample transaction keys: {list(sample_tx.keys())}")
                    print(f"Sample transaction category: {sample_tx.get('category', 'NO_CATEGORY')}")
                    print(f"Sample transaction budget_impact: {sample_tx.get('budget_impact', 'NO_IMPACT')}")
                    
                    # Count by category
                    category_counts = {}
                    for tx in transactions:
                        cat = tx.get('category', 'NO_CATEGORY')
                        category_counts[cat] = category_counts.get(cat, 0) + 1
                    
                    print("Category breakdown:")
                    for cat, count in category_counts.items():
                        print(f"  • {cat}: {count}")
                        
                    # Count by budget impact
                    impact_counts = {}
                    for tx in transactions:
                        impact = tx.get('budget_impact', 'NO_IMPACT')
                        impact_counts[impact] = impact_counts.get(impact, 0) + 1
                    
                    print("Budget impact breakdown:")
                    for impact, count in impact_counts.items():
                        print(f"  • {impact}: {count}")
                
                # Check other arrays
                for key in ['parked_measures', 'direct_costs', 'booked_measures']:
                    arr = data.get(key, [])
                    print(f"{key} count: {len(arr)}")
                    
            except json.JSONDecodeError as e:
                print(f"❌ JSON parsing failed: {e}")
                print("This suggests the data is stored in a non-standard format")
                
        else:
            print("❌ No transactions data found in database")
            
    except Exception as e:
        print(f"❌ Error analyzing transactions data: {e}")
    
    print("\n4. SAMPLE SOURCE DATA")
    print("-" * 40)
    
    # Get sample SAP data
    try:
        query = text("""
            SELECT TOP 3 
                belegnummer,
                kostenstelle,
                betrag_in_hauswaehrung,
                LEFT(text_field, 50) as text_preview,
                buchungsdatum
            FROM sap_transactions 
            ORDER BY upload_date DESC
        """)
        
        with engine.connect() as conn:
            sap_sample = pd.read_sql_query(query, conn)
            
        print("SAP Transactions Sample:")
        for _, row in sap_sample.iterrows():
            print(f"  • Beleg: {row['belegnummer']}, Kostenstelle: {row['kostenstelle']}, Betrag: {row['betrag_in_hauswaehrung']}")
            print(f"    Text: {row['text_preview']}...")
            
    except Exception as e:
        print(f"❌ Error getting SAP sample: {e}")
    
    # Get sample MSP data
    try:
        query = text("""
            SELECT TOP 3 
                bestellnummer,
                LEFT(titel_der_massnahme, 50) as title_preview,
                benoetiges_budget,
                LEFT(gruppen, 30) as gruppen_preview
            FROM msp_measures 
            ORDER BY upload_date DESC
        """)
        
        with engine.connect() as conn:
            msp_sample = pd.read_sql_query(query, conn)
            
        print("\nMSP Measures Sample:")
        for _, row in msp_sample.iterrows():
            print(f"  • Bestellnummer: {row['bestellnummer']}, Budget: {row['benoetiges_budget']}")
            print(f"    Title: {row['title_preview']}...")
            print(f"    Gruppen: {row['gruppen_preview']}...")
            
    except Exception as e:
        print(f"❌ Error getting MSP sample: {e}")
    
    print("\n5. PROCESSING RECOMMENDATIONS")
    print("-" * 40)
    print("Based on the analysis above:")
    print("1. Check if source tables have recent data")
    print("2. Verify JSON parsing is working correctly")
    print("3. Run the processing script manually to see output")
    print("4. Check for data type mismatches in storage/retrieval")
    
def test_manual_processing():
    """Test what happens when we manually process a small sample"""
    print("\n🧪 MANUAL PROCESSING TEST")
    print("=" * 30)
    
    engine = setup_database_connection()
    
    # Get a small sample of SAP data
    try:
        query = text("""
            SELECT TOP 10 
                belegnummer,
                kostenstelle,
                betrag_in_hauswaehrung,
                text_field,
                buchungsdatum
            FROM sap_transactions 
            ORDER BY upload_date DESC
        """)
        
        with engine.connect() as conn:
            sap_df = pd.read_sql_query(query, conn)
            
        print(f"Got {len(sap_df)} SAP transactions for testing")
        
        # Test the extract_bestellnummer function manually
        import re
        
        bestellnummer_found = 0
        for _, row in sap_df.iterrows():
            text_field = str(row['text_field'])
            matches = re.findall(r'\b\d{4}\b', text_field)
            valid_numbers = [int(num) for num in matches if int(num) >= 3000]
            
            if valid_numbers:
                bestellnummer_found += 1
                print(f"  • Found Bestellnummer {valid_numbers[0]} in: {text_field[:50]}...")
        
        print(f"Found Bestellnummer in {bestellnummer_found}/{len(sap_df)} transactions")
        
        if bestellnummer_found == 0:
            print("❌ This could explain why you're only seeing DIRECT_COST transactions!")
            print("The Bestellnummer extraction might not be working with your data format")
            
    except Exception as e:
        print(f"❌ Manual processing test failed: {e}")

if __name__ == "__main__":
    if not DB_PASSWORD:
        print("❌ Please set DB_PASSWORD environment variable")
        print("Example: export DB_PASSWORD='your_password'")
    else:
        diagnose_database()
        test_manual_processing()