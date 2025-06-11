import pandas as pd
import pyodbc
from datetime import datetime

# Your connection string
connection_string = """
Driver={ODBC Driver 18 for SQL Server};
Server=tcp:msp-sap-database-sadu.database.windows.net,1433;
Database=Marketing;
Uid=msp_admin;
Pwd=Blutwurst12345+;
Encrypt=yes;
TrustServerCertificate=no;
Connection Timeout=30;
"""

def safe_str(value):
    if pd.isna(value) or value == '':
        return ''
    return str(value).replace("'", "''")

def safe_str_or_none(value):
    if pd.isna(value) or str(value).strip() == '':
        return None
    return safe_str(value)

def convert_german_decimal(value):
    if pd.isna(value) or value == '':
        return 0.0
    try:
        value_str = str(value).replace('.', '').replace(',', '.')
        return float(value_str)
    except:
        return 0.0

def convert_german_date(date_str):
    if pd.isna(date_str):
        return None
    
    date_str = str(date_str)
    if '.' in date_str:
        parts = date_str.split('.')
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
    return date_str

def import_msp_fixed():
    """Import MSP data with correct column handling"""
    print("📋 IMPORTING MSP DATA (FIXED)")
    
    # Read with cp1252 encoding
    df = pd.read_csv('msp_data.csv', delimiter=';', encoding='cp1252')
    print(f"Found {len(df)} MSP measures")
    print(f"Columns: {list(df.columns)}")
    
    batch_id = f"MSP_FIX_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    
    success_count = 0
    error_count = 0
    
    for index, row in df.iterrows():
        try:
            cursor.execute("""
                INSERT INTO msp_measures (
                    benutzername, name_field, rolle, gruppen, bestellnummer, datum,
                    artikel_id, artikelname, artikelnummer, titel_der_massnahme,
                    art_der_massnahme, sportkooperation, ja_sportkooperation, nein_themenfeld,
                    massnahme_abgestimmt_mit, kurzbeschreibung, anfangsdatum, enddatum,
                    benoetiges_budget_original, benoetiges_budget,
                    budgetposition_1, beschreibung_budgetposition_1, betrag_budgetposition_1_original, betrag_budgetposition_1,
                    budgetposition_2, beschreibung_budgetposition_2, betrag_budgetposition_2_original, betrag_budgetposition_2,
                    budgetposition_3, beschreibung_budgetposition_3, betrag_budgetposition_3_original, betrag_budgetposition_3,
                    budgetposition_4, beschreibung_budgetposition_4, betrag_budgetposition_4_original, betrag_budgetposition_4,
                    budgetposition_5, beschreibung_budgetposition_5, betrag_budgetposition_5_original, betrag_budgetposition_5,
                    verantwortliche_person, vertrag, text_individueller_vertrag, anhaenge, versandnummer, batch_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, 
            safe_str(row['Benutzername']),
            safe_str(row['Name']),
            safe_str(row['Rolle']),
            safe_str(row['Gruppen']),
            int(row['Bestellnummer']) if pd.notna(row['Bestellnummer']) else None,
            convert_german_date(row['Datum']),
            safe_str_or_none(row['Artikel ID']),
            safe_str(row['Artikelname']),
            safe_str_or_none(row['Artikelnummer']),
            safe_str(row['Titel der Maßnahme']),
            safe_str(row['Art der Maßnahme (Bitte in der Kurzbeschreibung näher ausführen)']),
            1 if row['Sportkooperation?'] == 'Ja' else 0 if pd.notna(row['Sportkooperation?']) else None,
            safe_str_or_none(row['Ja - Sportkooperation']),
            safe_str_or_none(row['Nein - Themenfeld']),
            safe_str_or_none(row['Die Maßnahme ist abgestimmt mit:']),
            safe_str(row['Kurzbeschreibung']),
            convert_german_date(row['Anfangsdatum']),
            convert_german_date(row['Enddatum']),
            safe_str(row['Benötigtes Budget (Geschätzt)']),
            convert_german_decimal(row['Benötigtes Budget (Geschätzt)']),
            safe_str_or_none(row['Budgetposition 1']),
            safe_str_or_none(row['Beschreibung Budgetposition 1']),
            safe_str_or_none(row['Betrag Budgetposition 1']),
            convert_german_decimal(row['Betrag Budgetposition 1']) if pd.notna(row['Betrag Budgetposition 1']) else None,
            safe_str_or_none(row['Budgetposition 2']),
            safe_str_or_none(row['Beschreibung Budgetposition 2']),
            safe_str_or_none(row['Betrag Budgetposition 2']),
            convert_german_decimal(row['Betrag Budgetposition 2']) if pd.notna(row['Betrag Budgetposition 2']) else None,
            safe_str_or_none(row['Budgetposition 3']),
            safe_str_or_none(row['Beschreibung Budgetposition 3']),
            safe_str_or_none(row['Betrag Budgetposition 3']),
            convert_german_decimal(row['Betrag Budgetposition 3']) if pd.notna(row['Betrag Budgetposition 3']) else None,
            safe_str_or_none(row['Budgetposition 4']),
            safe_str_or_none(row['Beschreibung Budgetposition 4']),
            safe_str_or_none(row['Betrag Budgetposition 4']),
            convert_german_decimal(row['Betrag Budgetposition 4']) if pd.notna(row['Betrag Budgetposition 4']) else None,
            safe_str_or_none(row['Budgetposition 5']),
            safe_str_or_none(row['Beschreibung Budgetposition 5']),
            safe_str_or_none(row['Betrag Budgetposition 5']),
            convert_german_decimal(row['Betrag Budgetposition 5']) if pd.notna(row['Betrag Budgetposition 5']) else None,
            safe_str_or_none(row['Verantwortliche Person']),
            safe_str_or_none(row['Vertrag']),
            safe_str_or_none(row['Text Individueller Vertrag zur Prüfung']),
            safe_str_or_none(row['Anhänge']),
            safe_str_or_none(row['Versandnummer']),
            batch_id)
            
            success_count += 1
            
            if success_count % 100 == 0:
                conn.commit()
                print(f"  ✅ Imported {success_count} MSP rows...")
                
        except Exception as e:
            error_count += 1
            if error_count <= 3:
                print(f"  ❌ Error on MSP row {index}: {str(e)[:200]}")
            continue
    
    conn.commit()
    conn.close()
    
    print(f"✅ MSP IMPORT COMPLETED: {success_count} success, {error_count} errors")
    return batch_id

def import_hq_fixed():
    """Import HQ mapping with correct column name"""
    print("🏢 IMPORTING HQ MAPPING (FIXED)")
    
    df = pd.read_csv('mapping_hq.csv', delimiter=';', encoding='utf-8')
    print(f"Found {len(df)} HQ mappings")
    print(f"Columns: {list(df.columns)}")
    
    batch_id = f"HQ_FIX_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    
    success_count = 0
    error_count = 0
    
    for index, row in df.iterrows():
        try:
            # Handle the trailing space in column name
            kostenstelle_col = 'Kostenstelle ' if 'Kostenstelle ' in row.index else 'Kostenstelle'
            
            cursor.execute("""
                INSERT INTO kostenstelle_mapping_hq (bezeichnung, abteilung, kostenstelle, batch_id)
                VALUES (?, ?, ?, ?)
            """, 
            safe_str(row['Bezeichnung']),
            safe_str(row['Abteilung']),
            safe_str(row[kostenstelle_col]),  # Use the correct column name
            batch_id)
            
            success_count += 1
                
        except Exception as e:
            error_count += 1
            print(f"  ❌ Error on HQ mapping row {index}: {str(e)}")
            continue
    
    conn.commit()
    conn.close()
    
    print(f"✅ HQ MAPPING COMPLETED: {success_count} success, {error_count} errors")
    return batch_id

if __name__ == "__main__":
    print("🔧 FIXING FAILED IMPORTS")
    print("=" * 40)
    
    # Fix MSP data
    msp_batch = import_msp_fixed()
    
    # Fix HQ mapping
    hq_batch = import_hq_fixed()
    
    print("\n🎉 FIXES COMPLETED!")
    print(f"MSP Batch ID: {msp_batch}")
    print(f"HQ Batch ID: {hq_batch}")