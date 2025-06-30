#!/usr/bin/env python3
"""
test_endpoints.py - Quick test script for the new normalized endpoints
Run this from terminal to test the new endpoints without frontend setup
"""

import requests
import json
import time

API_BASE = "http://localhost:5001/api"

def test_endpoint(endpoint_name, url, description):
    """Test a single endpoint and show results"""
    print(f"\n{'='*60}")
    print(f"🧪 TESTING: {endpoint_name}")
    print(f"📝 {description}")
    print(f"🌐 URL: {url}")
    print(f"{'='*60}")
    
    try:
        start_time = time.time()
        response = requests.get(url, timeout=30)
        elapsed_time = time.time() - start_time
        
        print(f"⏱️  Response time: {elapsed_time:.4f} seconds")
        print(f"📊 Status code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Show different info based on endpoint
            if 'transactions' in data:
                tx_count = len(data['transactions'])
                total_count = data.get('summary', {}).get('total_transactions', 'Unknown')
                query_time = data.get('summary', {}).get('query_time_seconds', 'Unknown')
                
                print(f"✅ SUCCESS!")
                print(f"   📈 Transactions returned: {tx_count:,}")
                print(f"   📊 Total available: {total_count:,}")
                print(f"   ⚡ SQL query time: {query_time}s")
                
                if data['transactions']:
                    sample = data['transactions'][0]
                    print(f"   📋 Sample transaction:")
                    print(f"      ID: {sample.get('transaction_id')}")
                    print(f"      Category: {sample.get('category')}")
                    print(f"      Department: {sample.get('department')}")
                    print(f"      Amount: €{sample.get('amount', 0):,.2f}")
                
            elif 'departments' in data:
                dept_count = len(data['departments'])
                query_time = data.get('summary', {}).get('query_time_seconds', 'Unknown')
                
                print(f"✅ SUCCESS!")
                print(f"   🏢 Departments: {dept_count}")
                print(f"   ⚡ SQL query time: {query_time}s")
                
                if data['departments']:
                    sample = data['departments'][0]
                    print(f"   📋 Sample department:")
                    print(f"      Name: {sample.get('name')}")
                    print(f"      Location: {sample.get('location_type')}")
                    print(f"      Total Amount: €{sample.get('total_amount', 0):,.2f}")
                    print(f"      Transactions: {sample.get('transaction_count', 0)}")
            
            elif 'fast_method' in data:  # Performance comparison
                fast_time = data['fast_method']['query_time']
                slow_time = data['slow_method']['query_time']
                improvement = data['improvement']['speed_multiplier']
                
                print(f"✅ SUCCESS!")
                print(f"   🐌 Old method: {slow_time}s")
                print(f"   🚀 New method: {fast_time}s")
                print(f"   📈 Improvement: {improvement}")
                print(f"   💾 Transactions (old): {data['slow_method']['total_transactions']:,}")
                print(f"   💾 Transactions (new): {data['fast_method']['total_transactions']:,}")
            
            else:
                print(f"✅ SUCCESS! (Raw data)")
                print(f"   Keys: {list(data.keys())}")
        
        else:
            print(f"❌ ERROR: HTTP {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error: {error_data.get('error', 'Unknown error')}")
                print(f"   Message: {error_data.get('message', 'No message')}")
            except:
                print(f"   Raw response: {response.text[:200]}...")
    
    except requests.exceptions.Timeout:
        print(f"⏰ TIMEOUT: Request took longer than 30 seconds")
    except requests.exceptions.ConnectionError:
        print(f"🔌 CONNECTION ERROR: Could not connect to API")
        print(f"   Make sure your Flask app is running on {API_BASE}")
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {str(e)}")

def main():
    """Run all endpoint tests"""
    print("🚀 TESTING NEW NORMALIZED ENDPOINTS")
    print("=" * 60)
    print("Make sure your Flask API is running with the new endpoints!")
    print(f"Expected API base: {API_BASE}")
    
    # Test 1: Performance comparison
    test_endpoint(
        "Performance Comparison",
        f"{API_BASE}/performance-comparison",
        "Compare speed of old JSON vs new normalized table approach"
    )
    
    # Test 2: Basic transactions
    test_endpoint(
        "Basic Transactions",
        f"{API_BASE}/transactions-normalized?limit=10",
        "Get first 10 transactions from normalized table"
    )
    
    # Test 3: Filtered transactions
    test_endpoint(
        "Filtered Transactions",
        f"{API_BASE}/transactions-normalized?category=DIRECT_COST&limit=5",
        "Filter for direct costs only"
    )
    
    # Test 4: Department summary
    test_endpoint(
        "Department Summary",
        f"{API_BASE}/departments-normalized",
        "Get department aggregations from normalized table"
    )
    
    # Test 5: Complex filtering
    test_endpoint(
        "Complex Filtering",
        f"{API_BASE}/transactions-normalized?department=Abteilung 0700&limit=20",
        "Filter by specific department"
    )
    
    print(f"\n{'='*60}")
    print("🎯 TEST COMPLETE!")
    print("=" * 60)
    print("If all tests show ✅ SUCCESS, your normalized endpoints are working!")
    print("You can now integrate these into your frontend components.")
    print("\nNext steps:")
    print("1. Add the MockTransactionComponent.vue to your frontend")
    print("2. Test the visual interface")
    print("3. Gradually replace old endpoints with new ones")

if __name__ == "__main__":
    main()