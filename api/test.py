import requests
import json
from datetime import datetime

def test_transaction_types():
    """
    Simple script to test all transaction types from your API
    Run this in VS Code to see samples of each transaction category
    """
    
    # Your API endpoint
    api_url = "http://localhost:5001/api/transactions-simple"
    
    print("🧪 Testing Transaction Types from MSP-SAP API")
    print("=" * 60)
    print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    try:
        # Fetch data from API
        print("📡 Fetching data from API...")
        response = requests.get(api_url)
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.status_code}")
            print(f"Response: {response.text}")
            return
        
        data = response.json()
        print("✅ API Response received successfully!")
        print()
        
        # Display summary statistics
        print("📊 SUMMARY STATISTICS")
        print("-" * 30)
        
        summary = data.get('summary', {})
        by_category = summary.get('by_category', {})
        
        for category, count in by_category.items():
            print(f"  {category}: {count:,} transactions")
        
        print(f"  TOTAL: {summary.get('total_transactions', 0):,} transactions")
        print()
        
        # Test each transaction type
        transaction_types = [
            ('BOOKED_MEASURE', 'booked_measures', '💰', 'SAP + MSP Matched'),
            ('DIRECT_COST', 'direct_costs', '💳', 'SAP Only (No MSP Match)'),
            ('PARKED_MEASURE', 'parked_measures', '🅿️', 'MSP Manually Assigned'),
            ('UNASSIGNED_MEASURE', 'parked_measures', '❓', 'MSP Awaiting Assignment'),
            ('OUTLIER', 'outliers', '⚠️', 'Unknown Location')
        ]
        
        for category_name, data_key, icon, description in transaction_types:
            print(f"{icon} {category_name}")
            print(f"Description: {description}")
            print("-" * 50)
            
            # Get the array
            transactions = data.get(data_key, [])
            
            if data_key == 'parked_measures':
                # Filter by category for parked measures (contains both PARKED and UNASSIGNED)
                transactions = [t for t in transactions if t.get('category') == category_name]
            
            if transactions:
                count = len(transactions)
                print(f"Count: {count:,} transactions")
                
                # Show sample transaction
                sample = transactions[0]
                print("\n📋 Sample Transaction:")
                
                # Key fields to display
                key_fields = [
                    ('category', 'Category'),
                    ('status', 'Status'),
                    ('budget_impact', 'Budget Impact'),
                    ('department', 'Department'),
                    ('region', 'Region'),
                    ('district', 'District'),
                    ('location_type', 'Location Type'),
                    ('bestellnummer', 'Bestellnummer'),
                    ('measure_title', 'Measure Title'),
                    ('actual_amount', 'Actual Amount'),
                    ('estimated_amount', 'Estimated Amount'),
                    ('amount', 'Amount'),
                    ('booking_date', 'Booking Date'),
                    ('measure_date', 'Measure Date'),
                    ('text', 'Text')
                ]
                
                for field_key, field_name in key_fields:
                    if field_key in sample:
                        value = sample[field_key]
                        if value is not None and value != '':
                            # Format amounts nicely
                            if 'amount' in field_key.lower() and isinstance(value, (int, float)):
                                print(f"  {field_name}: €{value:,.2f}")
                            else:
                                print(f"  {field_name}: {value}")
                
                # Show additional samples if available
                if count > 1:
                    print(f"\n📈 Additional Samples (showing up to 3 more):")
                    for i, tx in enumerate(transactions[1:4], 1):
                        dept = tx.get('department', 'Unknown')[:30]
                        title = tx.get('measure_title', tx.get('text', 'No title'))[:40]
                        amount = tx.get('actual_amount') or tx.get('estimated_amount') or tx.get('amount')
                        amount_str = f"€{amount:,.2f}" if amount else "No amount"
                        print(f"    {i}. {dept} | {title} | {amount_str}")
                
            else:
                print("Count: 0 transactions")
                print("  (No transactions of this type found)")
            
            print("\n" + "="*60 + "\n")
        
        # Test filtering capabilities
        print("🔍 TESTING FILTERING CAPABILITIES")
        print("-" * 40)
        
        # Test department filter
        all_transactions = data.get('transactions', [])
        # Filter out any non-dict items that might have slipped through
        valid_transactions = [t for t in all_transactions if isinstance(t, dict)]
        departments = list(set([t.get('department') for t in valid_transactions if t.get('department')]))
        if departments:
            test_dept = departments[0]
            filter_url = f"{api_url}?department={test_dept}"
            
            print(f"Testing department filter: '{test_dept}'")
            filter_response = requests.get(filter_url)
            
            if filter_response.status_code == 200:
                filter_data = filter_response.json()
                filtered_count = len(filter_data.get('transactions', []))
                print(f"✅ Filter works! Found {filtered_count} transactions for this department")
            else:
                print(f"❌ Filter test failed: {filter_response.status_code}")
        
        print()
        
        # Test data quality
        print("🔬 DATA QUALITY CHECK")
        print("-" * 25)
        
        all_transactions = data.get('transactions', [])
        # Filter out any non-dict items that might have slipped through
        valid_transactions = [t for t in all_transactions if isinstance(t, dict)]
        
        # Check for required fields
        required_fields = ['category', 'budget_impact', 'department']
        quality_issues = 0
        
        for field in required_fields:
            missing_count = sum(1 for t in valid_transactions if not t.get(field))
            if missing_count > 0:
                print(f"⚠️  {missing_count} transactions missing '{field}'")
                quality_issues += 1
            else:
                print(f"✅ All transactions have '{field}'")
        
        # Check date formats
        date_fields = ['booking_date', 'measure_date']
        for field in date_fields:
            sample_dates = [t.get(field) for t in valid_transactions[:10] if t.get(field)]
            if sample_dates:
                print(f"✅ {field} samples: {sample_dates[:3]}")
        
        if quality_issues == 0:
            print("\n🎉 Data quality looks good!")
        else:
            print(f"\n⚠️  Found {quality_issues} data quality issues")
        
        print()
        print("✅ Transaction types testing completed successfully!")
        print(f"⏰ Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Make sure your API is running on localhost:5001")
    except requests.exceptions.RequestException as e:
        print(f"❌ Request Error: {e}")
    except json.JSONDecodeError as e:
        print(f"❌ JSON Decode Error: {e}")
        print("Response content:", response.text[:200])
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_transaction_types()