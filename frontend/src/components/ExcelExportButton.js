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

  const floorDepartments = departments.filter(isFloorDepartment);

  // Generate Excel file when button is clicked
  const generateExcel = () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Create overview sheet for all departments
      const overviewData = floorDepartments.map(dept => ({
        'Abteilung': dept.name,
        'Gebuchter Betrag (€)': parseFloat(dept.booked_amount || 0).toFixed(2),
        'Reservierter Betrag (€)': parseFloat(dept.reserved_amount || 0).toFixed(2),
        'Gesamtbetrag (€)': parseFloat(dept.total_amount || 0).toFixed(2)
      }));
      
      const overviewSheet = XLSX.utils.json_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Übersicht Abteilungen');
      
      // Generate a sheet for each floor department
      floorDepartments.forEach(department => {
        // Get regions for this department
        const departmentRegions = regions.filter(region => 
          region.department === department.name && region.location_type === 'Floor'
        );
        
        // Get all transactions for this department
        const departmentTransactions = transactions.filter(tx => 
          tx.department === department.name && tx.location_type === 'Floor'
        );
        
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
        departmentRegions.forEach(region => {
          // Add region header
          departmentData.push([
            `Region: ${region.name}`,
            '',
            '',
            '',
            '',
            ''
          ]);
          
          // Add region totals
          departmentData.push([
            'Gesamtbetrag Region:',
            parseFloat(region.total_amount || 0).toFixed(2) + ' €',
            '',
            'Gebuchter Betrag:',
            parseFloat(region.booked_amount || 0).toFixed(2) + ' €',
            '',
            'Reservierter Betrag:',
            parseFloat(region.reserved_amount || 0).toFixed(2) + ' €'
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
          
          // Get transactions for this region
          const regionTransactions = departmentTransactions.filter(tx => 
            tx.region === region.name
          );
          
          // Sort transactions by type (Direct, Booked, Parked)
          const sortedTransactions = [...regionTransactions].sort((a, b) => {
            const typeOrder = {
              'DIRECT_COST': 1,
              'BOOKED_MEASURE': 2,
              'PARKED_MEASURE': 3
            };
            return typeOrder[a.category] - typeOrder[b.category];
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
        
        // Add worksheet to workbook (name limited to 31 chars)
        const sheetName = department.name.length > 28 
          ? department.name.substring(0, 28) + '...'
          : department.name;
          
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });
      
      // Generate Excel file and trigger download
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Set filename with current date
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      const fileName = `Abteilungen_Finanzübersicht_${dateStr}.xlsx`;
      
      saveAs(blob, fileName);
    } catch (error) {
      console.error('Error generating Excel file:', error);
      alert('Fehler beim Erstellen der Excel-Datei. Bitte versuchen Sie es erneut.');
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