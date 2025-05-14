import React from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Component for Excel export button
 * @param {Object} props - Component props
 * @param {Array} props.departments - Array of department data
 * @param {Array} props.regions - Array of region data
 * @param {Array} props.transactions - All transactions data
 */
const ExcelExportButton = ({ departments, regions, transactions }) => {
  // Filter for floor departments only using the location_type field
  const isFloorDepartment = (dept) => {
    // Use the location_type field to identify Floor departments
    return dept.location_type === 'Floor';
  };

  // Generate Excel file when button is clicked
  const generateExcel = () => {
    try {
      console.log("Starting Excel generation...");
      console.log("Departments:", departments);
      console.log("Regions:", regions);
      console.log("Transactions count:", transactions.length);
      
      // Filter floor departments to ensure we only have unique department names
      const floorDepartments = departments.filter(isFloorDepartment);
      const uniqueDepartments = Array.from(
        new Map(floorDepartments.map(dept => [dept.name, dept])).values()
      );
      
      console.log("Unique floor departments:", uniqueDepartments.map(d => d.name));
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Create overview sheet for all departments
      const overviewData = uniqueDepartments.map(dept => ({
        'Abteilung': dept.name,
        'Gebuchter Betrag (€)': parseFloat(dept.booked_amount || 0).toFixed(2),
        'Reservierter Betrag (€)': parseFloat(dept.reserved_amount || 0).toFixed(2),
        'Gesamtbetrag (€)': parseFloat(dept.total_amount || 0).toFixed(2)
      }));
      
      const overviewSheet = XLSX.utils.json_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Übersicht Abteilungen');
      
      // Generate a sheet for each floor department
      uniqueDepartments.forEach((department, index) => {
        console.log(`Processing department: ${department.name}`);
        
        // Get all transactions for this department (floor only)
        const departmentTransactions = transactions.filter(tx => 
          tx.department === department.name && tx.location_type === 'Floor'
        );
        
        console.log(`Found ${departmentTransactions.length} transactions for department`);
        
        // Get unique regions for this department
        const departmentRegionNames = [...new Set(departmentTransactions.map(tx => tx.region))].filter(Boolean);
        const departmentRegions = regions.filter(r => 
          r.department === department.name && 
          r.location_type === 'Floor' && 
          departmentRegionNames.includes(r.name)
        );
        
        console.log(`Found ${departmentRegions.length} regions for department`);
        
        // Prepare data for this department's sheet
        const departmentData = [];
        
        // Add header row
        departmentData.push([
          `Abteilung: ${department.name}`,
          '',
          '',
          '',
          '',
          ''
        ]);
        
        departmentData.push([
          'Gesamtbetrag:',
          parseFloat(department.total_amount || 0).toFixed(2) + ' €',
          '',
          'Gebuchter Betrag:',
          parseFloat(department.booked_amount || 0).toFixed(2) + ' €',
          '',
          'Reservierter Betrag:',
          parseFloat(department.reserved_amount || 0).toFixed(2) + ' €'
        ]);
        
        departmentData.push(['', '', '', '', '', '']);
        
        // Group by regions
        departmentRegionNames.forEach(regionName => {
          console.log(`Processing region: ${regionName}`);
          
          // Find region data
          const regionData = departmentRegions.find(r => r.name === regionName) || {
            name: regionName,
            booked_amount: 0,
            reserved_amount: 0,
            total_amount: 0
          };
          
          // Get transactions for this region
          const regionTransactions = departmentTransactions.filter(tx => tx.region === regionName);
          
          console.log(`Found ${regionTransactions.length} transactions for region`);
          
          // Only include regions with transactions
          if (regionTransactions.length > 0) {
            // Add region header
            departmentData.push([
              `Region: ${regionName}`,
              '',
              '',
              '',
              '',
              ''
            ]);
            
            // Add region totals
            departmentData.push([
              'Gesamtbetrag Region:',
              parseFloat(regionData.total_amount || 0).toFixed(2) + ' €',
              '',
              'Gebuchter Betrag:',
              parseFloat(regionData.booked_amount || 0).toFixed(2) + ' €',
              '',
              'Reservierter Betrag:',
              parseFloat(regionData.reserved_amount || 0).toFixed(2) + ' €'
            ]);
            
            // Add table headers for transactions
            departmentData.push([
              'Bestellnummer',
              'Typ',
              'Datum',
              'Betrag (€)',
              'Status',
              'Bezirk'
            ]);
            
            // Sort transactions by type (Direct, Booked, Parked)
            const sortedTransactions = [...regionTransactions].sort((a, b) => {
              const typeOrder = {
                'DIRECT_COST': 1,
                'BOOKED_MEASURE': 2,
                'PARKED_MEASURE': 3
              };
              return (typeOrder[a.category] || 99) - (typeOrder[b.category] || 99);
            });
            
            // Add transactions
            sortedTransactions.forEach(tx => {
              const txType = tx.category === 'DIRECT_COST' 
                ? 'Direkte Kosten' 
                : tx.category === 'BOOKED_MEASURE' 
                  ? 'SAP-MSP Gebucht' 
                  : 'Parkend (Warte auf SAP)';
                  
              departmentData.push([
                tx.bestellnummer || tx.transaction_id || tx.measure_id || '',
                txType,
                tx.booking_date || tx.measure_date || '',
                parseFloat(tx.amount || tx.actual_amount || tx.estimated_amount || 0).toFixed(2),
                tx.status || '',
                tx.district || ''
              ]);
            });
            
            // Add empty row after region
            departmentData.push(['', '', '', '', '', '']);
          }
        });
        
        // Create worksheet from array data
        const worksheet = XLSX.utils.aoa_to_sheet(departmentData);
        
        // Set column widths
        const wscols = [
          { wch: 15 },  // Bestellnummer
          { wch: 20 },  // Typ
          { wch: 12 },  // Datum
          { wch: 12 },  // Betrag
          { wch: 25 },  // Status
          { wch: 15 }   // Bezirk
        ];
        worksheet['!cols'] = wscols;
        
        // Create a safe sheet name - Excel limits sheet names to 31 characters
        // and doesn't allow certain characters
        const maxLength = 31;
        let sheetName = department.name;
        
        // Remove any special characters that Excel doesn't like in sheet names
        sheetName = sheetName.replace(/[\\\/\*\[\]\?]/g, '');
        
        // Truncate if necessary
        if (sheetName.length > maxLength) {
          // Try to truncate at a word boundary if possible
          const parts = sheetName.split(' ');
          let result = '';
          
          for (const part of parts) {
            if ((result + part).length <= maxLength - 3) {
              result += (result ? ' ' : '') + part;
            } else {
              break;
            }
          }
          
          sheetName = result + '...';
          
          // If still too long, just truncate
          if (sheetName.length > maxLength) {
            sheetName = sheetName.substring(0, maxLength - 3) + '...';
          }
        }
        
        console.log(`Adding worksheet with name: ${sheetName}`);
        
        // Add worksheet to workbook
        try {
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        } catch (err) {
          console.error(`Error adding sheet "${sheetName}":`, err);
          // If this fails, try with a generic name
          XLSX.utils.book_append_sheet(workbook, worksheet, `Abteilung ${index + 1}`);
        }
      });
      
      // Generate Excel file and trigger download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Set filename with current date
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      const fileName = `Abteilungen_Finanzübersicht_${dateStr}.xlsx`;
      
      saveAs(blob, fileName);
      console.log("Excel file generated successfully");
    } catch (error) {
      console.error('Error generating Excel file:', error);
      alert('Fehler beim Erstellen der Excel-Datei: ' + error.message);
    }
  };

  return (
    <button 
      onClick={generateExcel} 
      className="export-button"
      title="Export als Excel-Datei (nur Flächenabteilungen)"
    >
      <span role="img" aria-label="Excel" style={{ marginRight: '8px' }}>📊</span>
      Excel Export (Flächenabteilungen)
    </button>
  );
};

export default ExcelExportButton;