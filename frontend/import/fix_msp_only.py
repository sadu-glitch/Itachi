import pandas as pd
import pyodbc
from datetime import datetime

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

def convert_german_date_with_time(date_str):
    """Convert German date formats including time"""
    if pd.isna(date_str) or str(date_str).strip() == '':
        return None
    
    date_str = str(date_str).strip()
    
    try:
        # Handle formats like "15.1.25 11:14" or "01-01-2025"
        if '.' in date_str:
            # Split date and time if present
            date_part = date_str.split(' ')[0]  # Take only date part, ignore time
            parts = date_part.split('.')
            
            if len(parts) == 3:
                day, month, year = parts
                
                # Handle 2-digit year (25 = 2025)
                if len(year) == 2:
                    year = f"20{year}"
                
                # Ensure proper formatting
                day = day.zfill(2)
                month = month.zfill(2)
                
                return f"{year}-{month}-{day}"
        
        elif '-' in date_str:
            # Handle formats like "01-01-2025"
            date_part = date_str.split(' ')[0]  # Take only date part
            parts = date_part.split('-')
            
            if len(parts) == 3:
                # Assume DD-MM-YYYY format
                day, month, year = parts
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        
        # If we can't parse it, return None
        print(f"  ⚠️ Could not parse date: '{date_str}'")
        return None
        
    except Exception as e:
        print(f"  ⚠️ Date conversion error for '{date_str}': {str(e)}")
        return None

def import_msp_with_fixed_dates():
    """Import MSP data with fixed date handling"""
    print("📋 IMPORTING MSP DATA (WITH FIXED DATES)")
    
    df = pd.read_csv('msp_data.csv', delimiter=';', encoding='cp1252')
    print(f"Found {len(df)} MSP measures")
    
    # Debug: Show some date values
    print(f"Sample dates from CSV:")
    print(f"  Datum: '{df.iloc[0]['Datum']}'")
    print(f"  Anfangsdatum: '{df.iloc[0]['Anfangsdatum']}'")
    print(f"  Enddatum: '{df.iloc[0]['Enddatum']}'")
    
    batch_id = f"MSP_DATES_FIXED_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    
    success_count = 0
    error_count = 0
    
    for index, row in df.iterrows():
        try:
            cursor.execute("""
                INSERT INTO msp_measures (
                    bestellnummer, titel_der_massnahme, benoetiges_budget_original, benoetiges_budget,
                    datum, name_field, gruppen, benutzername, rolle, artikel_id, artikelname, artikelnummer,
                    art_der_massnahme, sportkooperation, ja_sportkooperation, nein_themenfeld,
                    massnahme_abgestimmt_mit, kurzbeschreibung, anfangsdatum, enddatum,
                    budgetposition_1, beschreibung_budgetposition_1, betrag_budgetposition_1_original, betrag_budgetposition_1,
                    budgetposition_2, beschreibung_budgetposition_2, betrag_budgetposition_2_original, betrag_budgetposition_2,
                    budgetposition_3, beschreibung_budgetposition_3, betrag_budgetposition_3_original, betrag_budgetposition_3,
                    budgetposition_4, beschreibung_budgetposition_4, betrag_budgetposition_4_original, betrag_budgetposition_4,
                    budgetposition_5, beschreibung_budgetposition_5, betrag_budgetposition_5_original, betrag_budgetposition_5,
                    verantwortliche_person, vertrag, text_individueller_vertrag, anhaenge, versandnummer,
                    batch_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, 
            int(row['Bestellnummer']) if pd.notna(row['Bestellnummer']) else None,
            safe_str(row['Titel der Maßnahme']),
            safe_str(row['Benötigtes Budget (Geschätzt)']),
            convert_german_decimal(row['Benötigtes Budget (Geschätzt)']),
            convert_german_date_with_time(row['Datum']),  # FIXED DATE CONVERSION
            safe_str(row['Name']),
            safe_str(row['Gruppen']),
            safe_str(row['Benutzername']),
            safe_str(row['Rolle']),
            safe_str_or_none(row['Artikel ID']),
            safe_str(row['Artikelname']),
            safe_str_or_none(row['Artikelnummer']),
            safe_str(row['Art der Maßnahme (Bitte in der Kurzbeschreibung näher ausführen)']),
            1 if str(row['Sportkooperation?']).strip().lower() == 'ja' else 0,
            safe_str_or_none(row['Ja - Sportkooperation']),
            safe_str_or_none(row['Nein - Themenfeld']),
            safe_str_or_none(row['Die Maßnahme ist abgestimmt mit:']),
            safe_str(row['Kurzbeschreibung']),
            convert_german_date_with_time(row['Anfangsdatum']),  # FIXED DATE CONVERSION
            convert_german_date_with_time(row['Enddatum']),      # FIXED DATE CONVERSION
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
            if error_count <= 5:
                print(f"  ❌ Error on MSP row {index}: {str(e)}")
            continue
    
    conn.commit()
    conn.close()
    
    print(f"✅ MSP IMPORT COMPLETED: {success_count} success, {error_count} errors")
    print(f"Batch ID: {batch_id}")

if __name__ == "__main__":
    import_msp_with_fixed_dates()