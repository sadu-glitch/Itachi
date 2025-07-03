"""
Simple Database Connection Tester
==================================
Tests different connection methods to diagnose Azure SQL issues
"""

import pyodbc
import sqlalchemy
from urllib.parse import quote_plus

# Your connection details
SERVER = "msp-sap-database-sadu.database.windows.net"
USERNAME = "msp_admin" 
PASSWORD = "Leberwurst12345+"
DATABASE = "Marketing"  # You mentioned <Default> but your code uses "Marketing"

print("🔍 Azure SQL Database Connection Tester")
print("=" * 50)
print(f"Server: {SERVER}")
print(f"Username: {USERNAME}")
print(f"Password: {'*' * len(PASSWORD)}")
print(f"Database: {DATABASE}")
print()

# Test 1: Basic pyodbc connection
print("📝 Test 1: Basic pyodbc connection")
try:
    connection_string = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={SERVER};"
        f"DATABASE={DATABASE};"
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
    )
    
    print("Connection string:", connection_string.replace(PASSWORD, "*" * len(PASSWORD)))
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test")
    result = cursor.fetchone()
    print("✅ pyodbc connection: SUCCESS")
    print(f"   Result: {result[0]}")
    conn.close()
    
except Exception as e:
    print(f"❌ pyodbc connection: FAILED")
    print(f"   Error: {str(e)}")

print()

# Test 2: Try without specific database (connect to master)
print("📝 Test 2: Connect to master database")
try:
    connection_string = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={SERVER};"
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
    )
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT DB_NAME() as current_db")
    result = cursor.fetchone()
    print("✅ Master connection: SUCCESS")
    print(f"   Connected to database: {result[0]}")
    
    # Try to list available databases
    cursor.execute("SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')")
    databases = cursor.fetchall()
    print("   Available databases:")
    for db in databases:
        print(f"     - {db[0]}")
    
    conn.close()
    
except Exception as e:
    print(f"❌ Master connection: FAILED")
    print(f"   Error: {str(e)}")

print()

# Test 3: SQLAlchemy connection
print("📝 Test 3: SQLAlchemy connection")
try:
    quoted_password = quote_plus(PASSWORD)
    sqlalchemy_url = (
        f"mssql+pyodbc://{USERNAME}:{quoted_password}@{SERVER}/{DATABASE}"
        f"?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"
    )
    
    print("SQLAlchemy URL:", sqlalchemy_url.replace(quoted_password, "*" * len(PASSWORD)))
    
    engine = sqlalchemy.create_engine(sqlalchemy_url, fast_executemany=True)
    
    with engine.connect() as conn:
        result = conn.execute(sqlalchemy.text("SELECT 1 as test")).fetchone()
        print("✅ SQLAlchemy connection: SUCCESS")
        print(f"   Result: {result[0]}")
    
except Exception as e:
    print(f"❌ SQLAlchemy connection: FAILED")
    print(f"   Error: {str(e)}")

print()

# Test 4: Check ODBC drivers
print("📝 Test 4: Available ODBC drivers")
try:
    drivers = pyodbc.drivers()
    print("Available ODBC drivers:")
    for driver in drivers:
        if "SQL Server" in driver:
            print(f"   ✅ {driver}")
        else:
            print(f"   - {driver}")
            
except Exception as e:
    print(f"❌ Error listing drivers: {str(e)}")

print()

# Test 5: Try with TrustServerCertificate=yes
print("📝 Test 5: Try with TrustServerCertificate=yes")
try:
    connection_string = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={SERVER};"
        f"DATABASE={DATABASE};"
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
    )
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test")
    result = cursor.fetchone()
    print("✅ TrustServerCertificate=yes: SUCCESS")
    print(f"   Result: {result[0]}")
    conn.close()
    
except Exception as e:
    print(f"❌ TrustServerCertificate=yes: FAILED")
    print(f"   Error: {str(e)}")

print()

# Test 6: Try with older ODBC driver
print("📝 Test 6: Try with ODBC Driver 17")
try:
    connection_string = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SERVER};"
        f"DATABASE={DATABASE};"
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=no;"
    )
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test")
    result = cursor.fetchone()
    print("✅ ODBC Driver 17: SUCCESS")
    print(f"   Result: {result[0]}")
    conn.close()
    
except Exception as e:
    print(f"❌ ODBC Driver 17: FAILED")
    print(f"   Error: {str(e)}")

print()
print("🔍 Connection testing completed!")
print()
print("💡 Troubleshooting tips:")
print("   - If all tests fail with login errors, check username/password")
print("   - If 'Marketing' database fails but master works, the database might not exist")
print("   - If TrustServerCertificate=yes works, there might be SSL certificate issues")
print("   - Check Azure SQL firewall rules allow your IP address")
print("   - 'Ungültiges Attribut' means invalid connection string attribute")
print()

# Test 7: Try with minimal connection string
print("📝 Test 7: Minimal connection string")
try:
    connection_string = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={SERVER};UID={USERNAME};PWD={PASSWORD}"
    
    print("Minimal connection string:", connection_string.replace(PASSWORD, "*" * len(PASSWORD)))
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test")
    result = cursor.fetchone()
    print("✅ Minimal connection: SUCCESS")
    print(f"   Result: {result[0]}")
    conn.close()
    
except Exception as e:
    print(f"❌ Minimal connection: FAILED")
    print(f"   Error: {str(e)}")

print()

# Test 8: Try Azure authentication format
print("📝 Test 8: Azure SQL specific format")
try:
    connection_string = f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER=tcp:{SERVER},1433;DATABASE={DATABASE};UID={USERNAME};PWD={PASSWORD};Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30"
    
    print("Azure format:", connection_string.replace(PASSWORD, "*" * len(PASSWORD)))
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 as test")
    result = cursor.fetchone()
    print("✅ Azure format: SUCCESS")
    print(f"   Result: {result[0]}")
    conn.close()
    
except Exception as e:
    print(f"❌ Azure format: FAILED")
    print(f"   Error: {str(e)}")

print()

# Test 9: Check if user has access to Azure SQL
print("📝 Test 9: Check Azure SQL requirements")
print("   1. Is your IP address whitelisted in Azure SQL firewall?")
print("   2. Is the user 'msp_admin' created in the Azure SQL database?")
print("   3. Try connecting with Azure Data Studio or SSMS first")
print("   4. Check if you need to connect to 'master' database first")