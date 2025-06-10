import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

/**
 * Enhanced Component for Excel export button with department selection and budget integration
 * @param {Object} props - Component props
 * @param {Array} props.departments - Array of department data
 * @param {Array} props.regions - Array of region data
 * @param {Array} props.transactions - All transactions data
 * @param {string} props.baseApiUrl - Base API URL for budget data fetching
 * @param {Function} props.useBudgetProgress - Budget hook function (if available)
 */
const EnhancedExcelExportButton = ({ 
  departments = [], 
  regions = [], 
  transactions = [], 
  baseApiUrl = '',
  useBudgetProgress 
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState(new Set());
  const [budgetData, setBudgetData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [budgetLoading, setBudgetLoading] = useState(false);

  // Try to use the budget hook if available, otherwise fallback to direct API
  const budgetHook = useBudgetProgress ? useBudgetProgress(baseApiUrl) : null;

  // Group departments by location_type with safety check
  const groupedDepartments = departments.reduce((groups, dept) => {
    const type = dept.location_type || 'Unknown';
    if (!groups[type]) groups[type] = [];
    groups[type].push(dept);
    return groups;
  }, {});

  // Initialize selected departments when departments change
  useEffect(() => {
    if (departments && departments.length > 0) {
      const allDeptNames = departments.map(dept => dept.name);
      setSelectedDepartments(new Set(allDeptNames));
    }
  }, [departments]);

  // Fetch budget data using the same pattern as DepartmentOverview
  const fetchBudgetData = async () => {
    setBudgetLoading(true);
    try {
      // If we have the budget hook, use it; otherwise try direct API call
      if (budgetHook && budgetHook.getDepartmentBudget) {
        console.log("Using budget hook to fetch data");
        // The hook should already have the data loaded
        setBudgetData({ 
          departments: {}, // Hook handles individual lookups
          regions: {},
          isHookBased: true 
        });
      } else if (baseApiUrl) {
        // Direct API call
        const response = await fetch(`${baseApiUrl}/api/budget-allocation`);
        if (response.ok) {
          const data = await response.json();
          setBudgetData(data);
          console.log("Budget data loaded via API:", data);
        } else {
          console.warn("Could not fetch budget data from API");
          setBudgetData({ departments: {}, regions: {} });
        }
      } else {
        // Mock budget data for demonstration
        const mockBudgetData = {
          departments: {
            'IT Department|Floor': { allocated_budget: 50000 },
            'Marketing|HQ': { allocated_budget: 30000 },
            'Sales|Floor': { allocated_budget: 75000 }
          },
          regions: {}
        };
        
        setBudgetData(mockBudgetData);
        console.log("Using mock budget data:", mockBudgetData);
      }
      
    } catch (error) {
      console.error("Error fetching budget data:", error);
      setBudgetData({ departments: {}, regions: {} });
    } finally {
      setBudgetLoading(false);
    }
  };

  // Handle department selection toggle
  const toggleDepartment = (deptName) => {
    const newSelected = new Set(selectedDepartments);
    if (newSelected.has(deptName)) {
      newSelected.delete(deptName);
    } else {
      newSelected.add(deptName);
    }
    setSelectedDepartments(newSelected);
  };

  // Handle group selection (select/deselect all in a location type)
  const toggleGroup = (locationType, select) => {
    const newSelected = new Set(selectedDepartments);
    const depsInGroup = groupedDepartments[locationType] || [];
    
    depsInGroup.forEach(dept => {
      if (select) {
        newSelected.add(dept.name);
      } else {
        newSelected.delete(dept.name);
      }
    });
    
    setSelectedDepartments(newSelected);
  };

  // Get budget info for a department using the same pattern as DepartmentOverview
  const getDepartmentBudget = (deptName) => {
    // If we have the budget hook, use it (preferred method)
    if (budgetHook && budgetHook.getDepartmentBudget) {
      return budgetHook.getDepartmentBudget(deptName);
    }
    
    // Fallback to direct budget data lookup
    if (!budgetData?.departments) return null;
    
    // Try exact match first
    if (budgetData.departments[deptName]) {
      return budgetData.departments[deptName];
    }
    
    // Try with location type appended
    const withFloor = `${deptName}|Floor`;
    const withHQ = `${deptName}|HQ`;
    
    return budgetData.departments[withFloor] || budgetData.departments[withHQ] || null;
  };

  // Calculate budget status
  const getBudgetStatus = (allocated, used) => {
    if (!allocated || allocated === 0) return { status: 'not_set', indicator: '⚪', color: '#888' };
    
    const utilization = (used / allocated) * 100;
    
    if (utilization <= 80) {
      return { status: 'on_track', indicator: '🟢', color: '#22c55e', utilization };
    } else if (utilization <= 100) {
      return { status: 'near_limit', indicator: '🟡', color: '#eab308', utilization };
    } else {
      return { status: 'over_budget', indicator: '🔴', color: '#ef4444', utilization };
    }
  };

  // Open modal and fetch budget data
  const openModal = async () => {
    setShowModal(true);
    // Always try to fetch/refresh budget data when opening modal
    if (!budgetData || !budgetHook) {
      await fetchBudgetData();
    }
  };

  // Generate Excel file when button is clicked
  const generateExcel = async () => {
    if (selectedDepartments.size === 0) {
      alert('Bitte wählen Sie mindestens eine Abteilung aus.');
      return;
    }

    setLoading(true);
    try {
      console.log("Starting enhanced Excel generation...");
      
      // Ensure we have budget data (but don't block if unavailable)
      if (!budgetData && !budgetHook) {
        console.log("Fetching budget data for Excel generation...");
        await fetchBudgetData();
      }
      
      // Filter selected departments
      const selectedDepartmentsList = departments.filter(dept => 
        selectedDepartments.has(dept.name)
      );
      
      // Remove duplicates
      const uniqueDepartments = Array.from(
        new Map(selectedDepartmentsList.map(dept => [dept.name, dept])).values()
      );
      
      console.log("Selected departments:", uniqueDepartments.map(d => d.name));
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Create enhanced overview sheet with budget data
      const overviewData = uniqueDepartments.map(dept => {
        const budget = getDepartmentBudget(dept.name);
        const allocatedBudget = budget?.allocated_budget || 0;
        const usedAmount = parseFloat(dept.total_amount || 0);
        const remainingBudget = allocatedBudget - usedAmount;
        const budgetVariance = usedAmount - allocatedBudget;
        const budgetStatus = getBudgetStatus(allocatedBudget, usedAmount);
        
        return {
          'Abteilung': dept.name,
          'Standort': dept.location_type || 'Unknown',
          'Gebuchter Betrag (€)': parseFloat(dept.booked_amount || 0).toFixed(2),
          'Reservierter Betrag (€)': parseFloat(dept.reserved_amount || 0).toFixed(2),
          'Gesamtbetrag (€)': usedAmount.toFixed(2),
          'Zugewiesenes Budget (€)': allocatedBudget.toFixed(2),
          'Verbleibendes Budget (€)': remainingBudget.toFixed(2),
          'Budget-Abweichung (€)': budgetVariance.toFixed(2),
          'Budget-Status': budgetStatus.status === 'not_set' ? 'Nicht gesetzt' : 
                          budgetStatus.status === 'on_track' ? 'Im Rahmen' :
                          budgetStatus.status === 'near_limit' ? 'Nahe Limit' : 'Überschritten',
          'Nutzung (%)': budgetStatus.utilization ? budgetStatus.utilization.toFixed(1) : 'N/A'
        };
      });
      
      const overviewSheet = XLSX.utils.json_to_sheet(overviewData);
      
      // Set column widths for overview
      const overviewCols = [
        { wch: 25 }, // Abteilung
        { wch: 10 }, // Standort
        { wch: 15 }, // Gebuchter Betrag
        { wch: 15 }, // Reservierter Betrag
        { wch: 15 }, // Gesamtbetrag
        { wch: 18 }, // Zugewiesenes Budget
        { wch: 18 }, // Verbleibendes Budget
        { wch: 18 }, // Budget-Abweichung
        { wch: 15 }, // Budget-Status
        { wch: 12 }  // Nutzung %
      ];
      overviewSheet['!cols'] = overviewCols;
      
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Übersicht mit Budget');
      
      // Create budget summary sheet
      const budgetSummaryData = [];
      
      // Add summary header
      budgetSummaryData.push(['BUDGET-ZUSAMMENFASSUNG', '', '', '', '', '']);
      budgetSummaryData.push(['Erstellt am:', new Date().toLocaleDateString('de-DE'), '', '', '', '']);
      budgetSummaryData.push(['', '', '', '', '', '']);
      
      // Calculate totals
      const totals = uniqueDepartments.reduce((acc, dept) => {
        const budget = getDepartmentBudget(dept.name);
        const allocatedBudget = budget?.allocated_budget || 0;
        const usedAmount = parseFloat(dept.total_amount || 0);
        
        acc.totalAllocated += allocatedBudget;
        acc.totalUsed += usedAmount;
        acc.departmentsWithBudget += allocatedBudget > 0 ? 1 : 0;
        
        const status = getBudgetStatus(allocatedBudget, usedAmount);
        if (status.status === 'on_track') acc.onTrack++;
        else if (status.status === 'near_limit') acc.nearLimit++;
        else if (status.status === 'over_budget') acc.overBudget++;
        else acc.notSet++;
        
        return acc;
      }, {
        totalAllocated: 0,
        totalUsed: 0,
        departmentsWithBudget: 0,
        onTrack: 0,
        nearLimit: 0,
        overBudget: 0,
        notSet: 0
      });
      
      // Add summary statistics
      budgetSummaryData.push(['GESAMTSTATISTIK', '', '', '', '', '']);
      budgetSummaryData.push(['Gesamtbudget zugewiesen:', totals.totalAllocated.toFixed(2) + ' €', '', '', '', '']);
      budgetSummaryData.push(['Gesamtbetrag verwendet:', totals.totalUsed.toFixed(2) + ' €', '', '', '', '']);
      budgetSummaryData.push(['Verbleibendes Budget:', (totals.totalAllocated - totals.totalUsed).toFixed(2) + ' €', '', '', '', '']);
      budgetSummaryData.push(['Gesamtnutzung:', totals.totalAllocated > 0 ? ((totals.totalUsed / totals.totalAllocated) * 100).toFixed(1) + '%' : 'N/A', '', '', '', '']);
      budgetSummaryData.push(['', '', '', '', '', '']);
      
      budgetSummaryData.push(['BUDGET-STATUS VERTEILUNG', '', '', '', '', '']);
      budgetSummaryData.push(['🟢 Im Rahmen:', totals.onTrack + ' Abteilungen', '', '', '', '']);
      budgetSummaryData.push(['🟡 Nahe Limit:', totals.nearLimit + ' Abteilungen', '', '', '', '']);
      budgetSummaryData.push(['🔴 Überschritten:', totals.overBudget + ' Abteilungen', '', '', '', '']);
      budgetSummaryData.push(['⚪ Nicht gesetzt:', totals.notSet + ' Abteilungen', '', '', '', '']);
      budgetSummaryData.push(['', '', '', '', '', '']);
      
      // Add department details
      budgetSummaryData.push(['ABTEILUNGSDETAILS', '', '', '', '', '']);
      budgetSummaryData.push(['Abteilung', 'Status', 'Budget (€)', 'Verwendet (€)', 'Verbleibend (€)', 'Nutzung (%)']);
      
      uniqueDepartments.forEach(dept => {
        const budget = getDepartmentBudget(dept.name);
        const allocatedBudget = budget?.allocated_budget || 0;
        const usedAmount = parseFloat(dept.total_amount || 0);
        const remaining = allocatedBudget - usedAmount;
        const status = getBudgetStatus(allocatedBudget, usedAmount);
        
        budgetSummaryData.push([
          dept.name,
          status.indicator + ' ' + (status.status === 'not_set' ? 'Nicht gesetzt' : 
                                   status.status === 'on_track' ? 'Im Rahmen' :
                                   status.status === 'near_limit' ? 'Nahe Limit' : 'Überschritten'),
          allocatedBudget.toFixed(2),
          usedAmount.toFixed(2),
          remaining.toFixed(2),
          status.utilization ? status.utilization.toFixed(1) + '%' : 'N/A'
        ]);
      });
      
      const budgetSummarySheet = XLSX.utils.aoa_to_sheet(budgetSummaryData);
      budgetSummarySheet['!cols'] = [
        { wch: 25 }, // Abteilung
        { wch: 20 }, // Status
        { wch: 15 }, // Budget
        { wch: 15 }, // Verwendet
        { wch: 15 }, // Verbleibend
        { wch: 12 }  // Nutzung %
      ];
      
      XLSX.utils.book_append_sheet(workbook, budgetSummarySheet, 'Budget-Zusammenfassung');
      
      // Generate sheets for each selected department (existing logic with budget enhancements)
      uniqueDepartments.forEach((department, index) => {
        console.log(`Processing department: ${department.name}`);
        
        // Get budget info for this department
        const deptBudget = getDepartmentBudget(department.name);
        const allocatedBudget = deptBudget?.allocated_budget || 0;
        const usedAmount = parseFloat(department.total_amount || 0);
        const budgetStatus = getBudgetStatus(allocatedBudget, usedAmount);
        
        // Get all transactions for this department
        const departmentTransactions = transactions.filter(tx => 
          tx.department === department.name && 
          (department.location_type ? tx.location_type === department.location_type : true)
        );
        
        console.log(`Found ${departmentTransactions.length} transactions for department`);
        
        // Get unique regions for this department
        const departmentRegionNames = [...new Set(departmentTransactions.map(tx => tx.region))].filter(Boolean);
        const departmentRegions = regions.filter(r => 
          r.department === department.name && 
          departmentRegionNames.includes(r.name)
        );
        
        console.log(`Found ${departmentRegions.length} regions for department`);
        
        // Prepare data for this department's sheet
        const departmentData = [];
        
        // Add enhanced header with budget info
        departmentData.push([
          `Abteilung: ${department.name}`,
          '',
          '',
          '',
          '',
          '',
          '',
          ''
        ]);
        
        departmentData.push([
          'Standort:',
          department.location_type || 'Unknown',
          '',
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
        
        // Add budget analysis section
        departmentData.push(['', '', '', '', '', '', '', '']);
        departmentData.push(['BUDGET-ANALYSE', '', '', '', '', '', '', '']);
        departmentData.push([
          'Zugewiesenes Budget:',
          allocatedBudget.toFixed(2) + ' €',
          '',
          'Verbleibendes Budget:',
          (allocatedBudget - usedAmount).toFixed(2) + ' €',
          '',
          'Budget-Status:',
          budgetStatus.indicator + ' ' + (budgetStatus.status === 'not_set' ? 'Nicht gesetzt' : 
                                         budgetStatus.status === 'on_track' ? 'Im Rahmen' :
                                         budgetStatus.status === 'near_limit' ? 'Nahe Limit' : 'Überschritten')
        ]);
        
        if (budgetStatus.utilization) {
          departmentData.push([
            'Budget-Nutzung:',
            budgetStatus.utilization.toFixed(1) + '%',
            '',
            'Budget-Abweichung:',
            (usedAmount - allocatedBudget).toFixed(2) + ' €',
            '',
            '',
            ''
          ]);
        }
        
        departmentData.push(['', '', '', '', '', '', '', '']);
        
        // Group by regions (existing logic)
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
              'Bezirk',
              'Beschreibung',
              'Budget-Relevanz'
            ]);
            
            // Sort transactions by type
            const sortedTransactions = [...regionTransactions].sort((a, b) => {
              const typeOrder = {
                'DIRECT_COST': 1,
                'BOOKED_MEASURE': 2,
                'PARKED_MEASURE': 3
              };
                // Early return if no departments available
    if (!departments || departments.length === 0) {
      return (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: '#666'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h3 style={{ margin: '0 0 8px 0' }}>Keine Daten verfügbar</h3>
          <p style={{ margin: 0, fontSize: '14px' }}>
            Bitte laden Sie zunächst Abteilungsdaten, um den Excel-Export zu verwenden.
          </p>
        </div>
      );
    }

    return (typeOrder[a.category] || 99) - (typeOrder[b.category] || 99);
            });
            
            // Add transactions with budget relevance indicator
            sortedTransactions.forEach(tx => {
              const txType = tx.category === 'DIRECT_COST' 
                ? 'Direkte Kosten' 
                : tx.category === 'BOOKED_MEASURE' 
                  ? 'SAP-MSP Gebucht' 
                  : 'Parkend (Warte auf SAP)';
              
              const amount = parseFloat(tx.amount || tx.actual_amount || tx.estimated_amount || 0);
              const budgetRelevance = tx.category === 'DIRECT_COST' || tx.category === 'BOOKED_MEASURE' ? 'Budgetrelevant' : 'Geplant';
                  
              departmentData.push([
                tx.bestellnummer || tx.transaction_id || tx.measure_id || '',
                txType,
                tx.booking_date || tx.measure_date || '',
                amount.toFixed(2),
                tx.status || '',
                tx.district || '',
                tx.text || '',
                budgetRelevance
              ]);
            });
            
            // Add empty row after region
            departmentData.push(['', '', '', '', '', '', '', '']);
          }
        });
        
        // Create worksheet from array data
        const worksheet = XLSX.utils.aoa_to_sheet(departmentData);
        
        // Set column widths (updated for new column)
        const wscols = [
          { wch: 15 },  // Bestellnummer
          { wch: 20 },  // Typ
          { wch: 12 },  // Datum
          { wch: 12 },  // Betrag
          { wch: 25 },  // Status
          { wch: 15 },  // Bezirk
          { wch: 40 },  // Beschreibung
          { wch: 15 }   // Budget-Relevanz
        ];
        worksheet['!cols'] = wscols;
        
        // Create safe sheet name
        const maxLength = 31;
        let sheetName = department.name;
        sheetName = sheetName.replace(/[/\\*[\]?]/g, '');
        
        if (sheetName.length > maxLength) {
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
          XLSX.utils.book_append_sheet(workbook, worksheet, `Abteilung ${index + 1}`);
        }
      });
      
      // Generate Excel file and trigger download using native browser API
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Set filename with current date
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      const fileName = `Erweiterte_Finanzübersicht_${dateStr}.xlsx`;
      
      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      console.log("Enhanced Excel file generated successfully");
      setShowModal(false);
    } catch (error) {
      console.error('Error generating Excel file:', error);
      alert('Fehler beim Erstellen der Excel-Datei: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={openModal} 
        className="export-button"
        title="Excel Export mit Abteilungsauswahl und Budget-Analyse"
        style={{
          padding: '10px 16px',
          backgroundColor: '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span role="img" aria-label="Excel">📊</span>
        Erweiterte Excel-Analyse
      </button>

      {/* Selection Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '600px',
            maxHeight: '80vh',
            width: '90%',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 'bold' }}>
              Excel Export - Abteilungen auswählen
            </h2>
            
            {budgetLoading && (
              <div style={{
                padding: '12px',
                backgroundColor: '#f3f4f6',
                borderRadius: '6px',
                marginBottom: '16px',
                textAlign: 'center'
              }}>
                📊 Budget-Daten werden geladen...
              </div>
            )}
            
            <div style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
              Wählen Sie die Abteilungen aus, die in den Excel-Export einbezogen werden sollen. 
              Budget-Analysen werden automatisch integriert.
            </div>
            
            {Object.entries(groupedDepartments).map(([locationType, depts]) => {
              const selectedInGroup = depts.filter(dept => selectedDepartments.has(dept.name)).length;
              const allSelected = selectedInGroup === depts.length;
              const someSelected = selectedInGroup > 0 && selectedInGroup < depts.length;
              
              return (
                <div key={locationType} style={{ marginBottom: '24px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '12px',
                    padding: '8px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      flex: 1
                    }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={(e) => toggleGroup(locationType, e.target.checked)}
                        style={{ marginRight: '8px' }}
                      />
                      {locationType} ({selectedInGroup}/{depts.length})
                    </label>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      <button
                        onClick={() => toggleGroup(locationType, true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#22c55e',
                          cursor: 'pointer',
                          marginRight: '8px'
                        }}
                      >
                        Alle
                      </button>
                      <button
                        onClick={() => toggleGroup(locationType, false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer'
                        }}
                      >
                        Keine
                      </button>
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                    gap: '8px',
                    marginLeft: '16px'
                  }}>
                    {depts.map(dept => {
                      const budget = getDepartmentBudget(dept.name);
                      const budgetStatus = getBudgetStatus(
                        budget?.allocated_budget || 0, 
                        parseFloat(dept.total_amount || 0)
                      );
                      
                      return (
                        <label
                          key={dept.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '4px',
                            fontSize: '14px',
                            backgroundColor: selectedDepartments.has(dept.name) ? '#f0f9ff' : 'transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDepartments.has(dept.name)}
                            onChange={() => toggleDepartment(dept.name)}
                            style={{ marginRight: '8px' }}
                          />
                          <span style={{ flex: 1 }}>{dept.name}</span>
                          <span style={{ marginLeft: '8px', fontSize: '12px' }}>
                            {budgetStatus.indicator}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            
            <div style={{ 
              borderTop: '1px solid #e5e7eb', 
              paddingTop: '16px', 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#666' }}>
                {selectedDepartments.size} Abteilung(en) ausgewählt
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f3f4f6',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={generateExcel}
                  disabled={selectedDepartments.size === 0 || loading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: selectedDepartments.size === 0 || loading ? '#d1d5db' : '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: selectedDepartments.size === 0 || loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {loading ? (
                    <>
                      <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                      Erstelle Excel...
                    </>
                  ) : (
                    <>
                      <span role="img" aria-label="Excel">📊</span>
                      Excel erstellen
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {/* Budget Legend */}
            {(budgetData || budgetHook) && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px' }}>Budget-Status Legende:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <span>🟢 Im Rahmen (≤80%)</span>
                  <span>🟡 Nahe Limit (80-100%)</span>
                  <span>🔴 Überschritten (100%)</span>
                  <span>⚪ Nicht gesetzt</span>
                </div>
                {budgetHook && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
                    Budget-Daten werden live abgerufen
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default EnhancedExcelExportButton;