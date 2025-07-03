"""
Azure SQL Admin Connection Diagnosis
====================================
If msp_admin is the server admin, let's figure out what's wrong
"""

import pyodbc
import os

# Set password
os.environ['DB_PASSWORD'] = "Leberwurst12345+"

SERVER = "msp-sap-database-sadu.database.windows.net"
USERNAME = "msp_admin" 
PASSWORD = os.getenv("DB_PASSWORD")

print("🔍 Azure SQL Admin Connection Diagnosis")
print("=" * 50)
print(f"Server: {SERVER}")
print(f"Username: {USERNAME} (Server Admin)")
print(f"Password: {'*' * len(PASSWORD)}")
print()

# Test 1: Try connecting to master database first (admin should have access)
print("📝 Test 1: Connect to master database (admin test)")
try:
    connection_string = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER=tcp:{SERVER},1433;"
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=30;"
    )
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test, DB_NAME() as database_name, USER_NAME() as user_name")
    result = cursor.fetchone()
    print("✅ Master database connection: SUCCESS!")
    print(f"   Database: {result[1]}")
    print(f"   User: {result[2]}")
    
    # Check if Marketing database exists
    cursor.execute("SELECT name FROM sys.databases WHERE name = 'Marketing'")
    marketing_db = cursor.fetchone()
    if marketing_db:
        print(f"✅ Marketing database exists: {marketing_db[0]}")
    else:
        print("❌ Marketing database does NOT exist!")
        print("   Available databases:")
        cursor.execute("SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')")
        databases = cursor.fetchall()
        for db in databases:
            print(f"     - {db[0]}")
    
    conn.close()
    
except Exception as e:
    print(f"❌ Master connection failed: {str(e)}")
    
    if "Login failed" in str(e):
        print("\n🚨 CRITICAL: Even master database login fails!")
        print("This means either:")
        print("  1. Password is wrong for msp_admin")
        print("  2. msp_admin is not actually the server admin")
        print("  3. The admin account is disabled/locked")
        print("\n🔧 SOLUTIONS:")
        print("  - Check the password in Azure Portal")
        print("  - Reset the admin password in Azure Portal")
        print("  - Verify msp_admin is the correct admin username")

print()

# Test 2: If master worked, try Marketing database specifically
print("📝 Test 2: Connect directly to Marketing database")
try:
    connection_string = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER=tcp:{SERVER},1433;"
        f"DATABASE=Marketing;"  # Specify Marketing database
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
        f"Connection Timeout=30;"
    )
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test, DB_NAME() as database_name, USER_NAME() as user_name")
    result = cursor.fetchone()
    print("✅ Marketing database connection: SUCCESS!")
    print(f"   Database: {result[1]}")
    print(f"   User: {result[2]}")
    
    # Check tables in Marketing database
    cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
    table_count = cursor.fetchone()[0]
    print(f"   Tables in Marketing: {table_count}")
    
    if table_count > 0:
        cursor.execute("SELECT TOP 5 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
        tables = cursor.fetchall()
        print("   Sample tables:")
        for table in tables:
            print(f"     - {table[0]}")
    
    conn.close()
    
    print("\n🎉 SUCCESS! Connection to Marketing database works!")
    print("The issue might be with your code, not the credentials.")
    
except Exception as e:
    print(f"❌ Marketing database connection failed: {str(e)}")
    
    if "Login failed" in str(e):
        print("\n🤔 STRANGE: Master works but Marketing fails")
        print("This could mean:")
        print("  - Marketing database doesn't exist")
        print("  - User has no permissions on Marketing database")
        print("  - Marketing database is in a different state")

print()

# Test 3: Test with minimal connection string (no extra parameters)
print("📝 Test 3: Minimal connection string test")
try:
    minimal_string = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={SERVER};UID={USERNAME};PWD={PASSWORD};Encrypt=yes;TrustServerCertificate=yes"
    
    conn = pyodbc.connect(minimal_string)
    cursor = conn.cursor()
    cursor.execute("SELECT DB_NAME() as current_db")
    result = cursor.fetchone()
    print(f"✅ Minimal connection: SUCCESS! Connected to: {result[0]}")
    conn.close()
    
except Exception as e:
    print(f"❌ Minimal connection failed: {str(e)}")

print()
print("🔧 DIAGNOSIS SUMMARY:")
print("- If Test 1 (master) fails: Password/admin issue")
print("- If Test 1 works but Test 2 fails: Marketing database issue") 
print("- If both work: Your Python code has a bug, not credentials")
print("- If Test 3 works: Connection string has extra problematic parameters")