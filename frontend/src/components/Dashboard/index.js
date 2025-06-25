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

// Main Dashboard component that orchestrates the overall structure
const Dashboard = ({ stats, budgetData, awaitingAssignment, apiUrl }) => {
  // State for navigation and selection
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedRegionData, setSelectedRegionData] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [error, setError] = useState(null);
  
  // Get the base API URL - use provided apiUrl or fall back to localhost for development
  const baseApiUrl = apiUrl || 'http://localhost:5000';
  
  // Use custom hooks for data fetching
  const { 
    departmentsData, 
    regionsData, 
    loading: departmentsLoading, 
    error: departmentsError,
    refreshDepartmentData
  } = useDepartmentData(baseApiUrl);
  
  // Fetch all transactions for Excel export
  const [allTransactions, setAllTransactions] = useState([]);
  const [loadingAllTransactions, setLoadingAllTransactions] = useState(false);
  
  // Fetch transactions when department or region changes
  const {
    transactions,
    error: transactionsError,
    fetchTransactions
  } = useTransactionData(baseApiUrl, selectedDepartment, selectedRegion);
  
  // ✅ DEBUG: Add comprehensive debugging for departments data
  useEffect(() => {
    console.log('🔍 FULL API RESPONSE DEBUG:', {
      departmentsData: departmentsData,
      departmentsDataType: typeof departmentsData,
      departments: departmentsData?.departments,
      departmentsIsArray: Array.isArray(departmentsData?.departments),
      departmentsLength: departmentsData?.departments?.length,
      sample: departmentsData?.departments?.[0],
      fullStructure: JSON.stringify(departmentsData, null, 2)
    });
  }, [departmentsData]);
  
  // Set error from any source
  useEffect(() => {
    if (departmentsError) setError(departmentsError);
    if (transactionsError) setError(transactionsError);
  }, [departmentsError, transactionsError]);
  
  // Fetch all transactions for Excel export when component mounts
  useEffect(() => {
    const fetchAllTransactions = async () => {
      try {
        setLoadingAllTransactions(true);
        // Remove trailing slash from baseApiUrl if it exists
        const normalizedApiUrl = baseApiUrl.endsWith('/') 
          ? baseApiUrl.slice(0, -1) 
          : baseApiUrl;
          
        const response = await fetch(`${normalizedApiUrl}/api/transactions`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch all transactions');
        }
        
        const data = await response.json();
        setAllTransactions(data.transactions || []);
        setLoadingAllTransactions(false);
      } catch (err) {
        console.error('Error fetching all transactions:', err);
        setLoadingAllTransactions(false);
      }
    };
    
    fetchAllTransactions();
  }, [baseApiUrl]);
  
  // Handle department selection
  const handleDepartmentClick = (department) => {
    console.log('🔍 DEBUG: Department clicked:', department);
    console.log('🔍 DEBUG: Department name:', department.name);
    setSelectedDepartment(department.name);
    setSelectedRegion(null);
    setSelectedRegionData(null);
    setSelectedTransaction(null);
  };

  // Handle region selection - UPDATED to accept full region object
  const handleRegionClick = (region) => {
    setSelectedRegion(region.name);
    setSelectedRegionData(region); // Store the full region data including budget info
    setSelectedTransaction(null);
  };

  // Handle transaction selection
  const handleTransactionClick = (transaction) => {
    setSelectedTransaction(transaction);
  };

  // Handle assignment success (refresh data)
  const handleAssignmentSuccess = async () => {
    await refreshDepartmentData();
    if (selectedDepartment) {
      await fetchTransactions();
    }
  };

  // Handle back from region to department
  const handleBackToDepartment = () => {
    setSelectedRegion(null);
    setSelectedRegionData(null); // Clear region data
  };
  
  // If loading, show loading message
  if (departmentsLoading && !departmentsData.departments?.length) {
    return <div className="loading">Loading data...</div>;
  }

  // If error, show error message
  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // ✅ ENHANCED SAFETY: Ensure departments is always an array
  const safeDepartments = (() => {
    const deps = departmentsData?.departments;
    if (Array.isArray(deps)) {
      return deps;
    }
    if (deps && typeof deps === 'object') {
      // If it's an object, try to extract values
      const values = Object.values(deps);
      if (Array.isArray(values)) {
        console.log('⚠️ Converting departments object to array:', values);
        return values;
      }
    }
    console.log('⚠️ Departments is not valid, using empty array');
    return [];
  })();

  return (
    <div className="dashboard">
      {/* Loading indicator for transactions */}
      {loadingAllTransactions && <div className="loading">Loading all transactions...</div>}
      
      <div className="dashboard-header">
        <h2 className="dashboard-title">Dashboard Overview mit Excel</h2>
        
        {/* Excel Export Button - only show in main view */}
        {!selectedDepartment && safeDepartments.length > 0 && regionsData.regions && allTransactions.length > 0 && (
          <EnhancedExcelExportButton
            departments={safeDepartments} 
            regions={regionsData.regions || []}
            transactions={allTransactions}
            baseApiUrl={baseApiUrl}
            useBudgetProgress={useBudgetProgress}
          />
        )}
      </div>
      
      {/* ✅ DEBUG: Show current data state */}
      <div style={{ 
        padding: '10px', 
        backgroundColor: '#f0f0f0', 
        marginBottom: '15px',
        fontSize: '12px',
        borderRadius: '4px'
      }}>
        <div><strong>🔍 Dashboard Debug Info:</strong></div>
        <div>Safe Departments Count: {safeDepartments.length}</div>
        <div>Raw Departments Type: {typeof departmentsData?.departments}</div>
        <div>Raw Departments IsArray: {Array.isArray(departmentsData?.departments) ? 'Yes' : 'No'}</div>
        <div>Loading: {departmentsLoading ? 'Yes' : 'No'}</div>
        <div>Error: {error || 'None'}</div>
        {safeDepartments.length > 0 && (
          <div>Sample Department: {JSON.stringify(safeDepartments[0])}</div>
        )}
      </div>
      
      {/* Conditional rendering based on selection state */}
      {!selectedDepartment && (
        <>
          {/* Budget Setting Form - only shown in main view */}
          <BudgetAllocationForm 
            departments={safeDepartments} 
            baseApiUrl={baseApiUrl} 
            onSuccess={refreshDepartmentData}
          />
          
          {/* Department Overview */}
          <DepartmentOverview 
            departments={safeDepartments} 
            onDepartmentClick={handleDepartmentClick} 
            baseApiUrl={baseApiUrl}
          />
        </>
      )}
      
      {/* Department Detail View */}
      {selectedDepartment && !selectedRegion && (() => {
        // 🔍 DEBUG: Console logs go here, outside JSX
        console.log('🔍 DEBUG: Selected Department:', selectedDepartment);
        console.log('🔍 DEBUG: All Regions:', regionsData.regions);
        console.log('🔍 DEBUG: Filtered Regions:', regionsData.regions?.filter(region => region.department === selectedDepartment));
        
        return (
          <DepartmentDetail 
            selectedDepartment={selectedDepartment}
            regions={regionsData.regions?.filter(region => region.department === selectedDepartment) || []}
            transactions={transactions.transactions || []}
            parkedMeasures={(() => {
              // Use transactions array instead of awaitingAssignment for complete data including msp_data
              const allTransactions = transactions.transactions || [];
              
              // Filter parked measures that are awaiting assignment
              const parkedMeasures = allTransactions.filter(tx => 
                tx.department === selectedDepartment &&
                tx.category === 'PARKED_MEASURE' &&
                tx.status === 'Awaiting Assignment'
              );
              
              console.log('🔍 DEBUG: Parked measures with msp_data:', parkedMeasures.length);
              console.log('🔍 DEBUG: Sample parked measure msp_data:', parkedMeasures[0]?.msp_data);
              
              return parkedMeasures;
            })()}
            onRegionClick={handleRegionClick}
            onTransactionClick={handleTransactionClick}
            onBackClick={() => setSelectedDepartment(null)}
            onAssignmentSuccess={handleAssignmentSuccess}
            baseApiUrl={baseApiUrl}
          />
        );
      })()}
      
      {/* Region Detail View - UPDATED with regionBudgetData */}
      {selectedDepartment && selectedRegion && selectedRegionData && (
        <RegionDetail 
          selectedDepartment={selectedDepartment}
          selectedRegion={selectedRegion}
          transactions={transactions.transactions?.filter(tx => tx.region === selectedRegion) || []}
          regionBudgetData={selectedRegionData.budgetData || selectedRegionData.calculatedAmounts} // Pass budget data
          onTransactionClick={handleTransactionClick}
          onBackClick={handleBackToDepartment} // Use updated handler
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