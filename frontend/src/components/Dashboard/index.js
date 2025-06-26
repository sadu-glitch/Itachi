import React, { useState, useEffect } from 'react';
import BudgetAllocationForm from './BudgetAllocationFormDB';
import DepartmentOverview from './DepartmentOverviewDB';
import DepartmentDetail from './DepartmentDetailDB';
import RegionDetail from './RegionDetailDB';
import TransactionDetail from './TransactionDetailDB';
import { useDepartmentData } from '../../hooks/useDepartmentData';
import { useTransactionData } from '../../hooks/useTransactionData';
import { useBudgetProgress } from '../../hooks/useBudget';
import EnhancedExcelExportButton from './EnhancedExcelExportButton';
import '../../styles/excel-export.css';

const Dashboard = ({ stats, budgetData, awaitingAssignment, apiUrl }) => {
  // State for navigation and selection
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedRegionData, setSelectedRegionData] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [error, setError] = useState(null);
  
  const baseApiUrl = apiUrl || 'https://msp-sap-api2-h5dmf6e6d4fngcbf.germanywestcentral-01.azurewebsites.net';
  
  // Use custom hooks for data fetching
  const { 
    departmentsData, 
    regionsData, 
    loading: departmentsLoading, 
    error: departmentsError,
    refreshDepartmentData
  } = useDepartmentData(baseApiUrl);
  
  // ✅ FIX 1: Fetch ALL transactions first, then filter locally
  const [allTransactionsData, setAllTransactionsData] = useState(null);
  const [loadingAllTransactions, setLoadingAllTransactions] = useState(false);

  // ✅ FIX 2: Fetch all transactions when component mounts
  useEffect(() => {
    const fetchAllTransactions = async () => {
      try {
        setLoadingAllTransactions(true);
        const normalizedApiUrl = baseApiUrl.endsWith('/') 
          ? baseApiUrl.slice(0, -1) 
          : baseApiUrl;
          
        const response = await fetch(`${normalizedApiUrl}/api/transactions`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch all transactions');
        }
        
        const data = await response.json();
        console.log('🔍 Dashboard: All transactions fetched:', {
          transactions: data.transactions?.length || 0,
          parked_measures: data.parked_measures?.length || 0,
          structure: Object.keys(data)
        });
        
        setAllTransactionsData(data);
        setLoadingAllTransactions(false);
      } catch (err) {
        console.error('❌ Dashboard: Error fetching all transactions:', err);
        setLoadingAllTransactions(false);
        setError(err.message);
      }
    };
    
    fetchAllTransactions();
  }, [baseApiUrl]);

  // ✅ FIX 3: Filter transactions locally based on selection
  const getFilteredTransactions = () => {
    if (!allTransactionsData?.transactions) {
      console.log('🔍 Dashboard: No transaction data available');
      return { transactions: [], parked_measures: [] };
    }

    let filteredTransactions = [...allTransactionsData.transactions];
    let filteredParkedMeasures = [...(allTransactionsData.parked_measures || [])];

    // Filter by department if selected
    if (selectedDepartment) {
      filteredTransactions = filteredTransactions.filter(tx => 
        tx.department === selectedDepartment
      );
      filteredParkedMeasures = filteredParkedMeasures.filter(measure => 
        measure.department === selectedDepartment
      );
      
      console.log('🔍 Dashboard: Filtered by department:', {
        department: selectedDepartment,
        transactions: filteredTransactions.length,
        parkedMeasures: filteredParkedMeasures.length
      });
    }

    // Filter by region if selected
    if (selectedRegion) {
      filteredTransactions = filteredTransactions.filter(tx => 
        tx.region === selectedRegion
      );
      // Note: parked measures might not have regions assigned yet
      
      console.log('🔍 Dashboard: Filtered by region:', {
        region: selectedRegion,
        transactions: filteredTransactions.length
      });
    }

    return {
      transactions: filteredTransactions,
      parked_measures: filteredParkedMeasures,
      // Include other arrays for compatibility
      direct_costs: allTransactionsData.direct_costs || [],
      booked_measures: allTransactionsData.booked_measures || [],
      statistics: allTransactionsData.statistics || {}
    };
  };

  // Set error from any source
  useEffect(() => {
    if (departmentsError) setError(departmentsError);
  }, [departmentsError]);
  
  // Handle department selection
  const handleDepartmentClick = (department) => {
    console.log('🔍 Dashboard: Department clicked:', department.name);
    setSelectedDepartment(department.name);
    setSelectedRegion(null);
    setSelectedRegionData(null);
    setSelectedTransaction(null);
  };

  // Handle region selection
  const handleRegionClick = (region) => {
    console.log('🔍 Dashboard: Region clicked:', region.name);
    setSelectedRegion(region.name);
    setSelectedRegionData(region);
    setSelectedTransaction(null);
  };

  // Handle transaction selection
  const handleTransactionClick = (transaction) => {
    setSelectedTransaction(transaction);
  };

  // Handle assignment success (refresh data)
  const handleAssignmentSuccess = async () => {
    await refreshDepartmentData();
    // ✅ FIX 4: Also refresh transaction data
    const fetchAllTransactions = async () => {
      try {
        const normalizedApiUrl = baseApiUrl.endsWith('/') 
          ? baseApiUrl.slice(0, -1) 
          : baseApiUrl;
          
        const response = await fetch(`${normalizedApiUrl}/api/transactions`);
        if (response.ok) {
          const data = await response.json();
          setAllTransactionsData(data);
        }
      } catch (err) {
        console.error('Error refreshing transactions:', err);
      }
    };
    await fetchAllTransactions();
  };

  // Handle back from region to department
  const handleBackToDepartment = () => {
    setSelectedRegion(null);
    setSelectedRegionData(null);
  };
  
  // If loading, show loading message
  if (departmentsLoading && !departmentsData.departments?.length) {
    return <div className="loading">Loading data...</div>;
  }

  // If error, show error message
  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Ensure departments is always an array
  const safeDepartments = (() => {
    const deps = departmentsData?.departments;
    if (Array.isArray(deps)) {
      return deps;
    }
    if (deps && typeof deps === 'object') {
      const values = Object.values(deps);
      if (Array.isArray(values)) {
        console.log('⚠️ Converting departments object to array:', values);
        return values;
      }
    }
    console.log('⚠️ Departments is not valid, using empty array');
    return [];
  })();

  // ✅ FIX 5: Get properly filtered transaction data
  const currentTransactionData = getFilteredTransactions();

  return (
    <div className="dashboard">
      {/* Loading indicator */}
      {(loadingAllTransactions || departmentsLoading) && (
        <div className="loading">Loading data...</div>
      )}
      
      <div className="dashboard-header">
        <h2 className="dashboard-title">Dashboard Overview</h2>
        
        {/* Excel Export Button */}
        {!selectedDepartment && safeDepartments.length > 0 && regionsData.regions && allTransactionsData?.transactions?.length > 0 && (
          <EnhancedExcelExportButton
            departments={safeDepartments} 
            regions={regionsData.regions || []}
            transactions={allTransactionsData.transactions}
            baseApiUrl={baseApiUrl}
            useBudgetProgress={useBudgetProgress}
          />
        )}
      </div>
      
      {/* Debug Info */}
      <div style={{ 
        padding: '10px', 
        backgroundColor: '#f0f0f0', 
        marginBottom: '15px',
        fontSize: '12px',
        borderRadius: '4px'
      }}>
        <div><strong>🔍 Dashboard Debug Info:</strong></div>
        <div>Departments: {safeDepartments.length}</div>
        <div>All Transactions: {allTransactionsData?.transactions?.length || 0}</div>
        <div>Current Filtered Transactions: {currentTransactionData.transactions.length}</div>
        <div>Current Parked Measures: {currentTransactionData.parked_measures.length}</div>
        <div>Selected Department: {selectedDepartment || 'None'}</div>
        <div>Selected Region: {selectedRegion || 'None'}</div>
      </div>
      
      {/* Conditional rendering based on selection state */}
      {!selectedDepartment && (
        <>
          <BudgetAllocationForm 
            departments={safeDepartments} 
            baseApiUrl={baseApiUrl} 
            onSuccess={refreshDepartmentData}
          />
          
          <DepartmentOverview 
            departments={safeDepartments} 
            onDepartmentClick={handleDepartmentClick} 
            baseApiUrl={baseApiUrl}
          />
        </>
      )}
      
      {/* Department Detail View */}
      {selectedDepartment && !selectedRegion && (
        <DepartmentDetail 
          selectedDepartment={selectedDepartment}
          regions={regionsData.regions?.filter(region => region.department === selectedDepartment) || []}
          transactions={currentTransactionData.transactions} // ✅ FIX 6: Pass filtered transactions
          parkedMeasures={currentTransactionData.parked_measures.filter(measure => 
            measure.department === selectedDepartment &&
            (measure.category === 'UNASSIGNED_MEASURE' || 
             (measure.category === 'PARKED_MEASURE' && measure.status === 'Awaiting Assignment'))
          )}
          onRegionClick={handleRegionClick}
          onTransactionClick={handleTransactionClick}
          onBackClick={() => setSelectedDepartment(null)}
          onAssignmentSuccess={handleAssignmentSuccess}
          baseApiUrl={baseApiUrl}
        />
      )}
      
      {/* Region Detail View */}
      {selectedDepartment && selectedRegion && selectedRegionData && (
        <RegionDetail 
          selectedDepartment={selectedDepartment}
          selectedRegion={selectedRegion}
          transactions={currentTransactionData.transactions} // ✅ FIX 7: Pass filtered transactions
          regionBudgetData={selectedRegionData.budgetData || selectedRegionData.calculatedAmounts}
          onTransactionClick={handleTransactionClick}
          onBackClick={handleBackToDepartment}
          onAssignmentSuccess={handleAssignmentSuccess}
          baseApiUrl={baseApiUrl}
        />
      )}
      
      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <TransactionDetail 
          transaction={selectedTransaction}
          regions={regionsData.regions?.filter(region => region.department === selectedDepartment) || []}
          onClose={() => setSelectedTransaction(null)}
          onAssignmentSuccess={handleAssignmentSuccess}
          baseApiUrl={baseApiUrl}
        />
      )}
    </div>
  );
};

export default Dashboard;