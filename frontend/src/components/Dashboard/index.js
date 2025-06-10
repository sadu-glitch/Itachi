import React, { useState, useEffect } from 'react';
import BudgetAllocationForm from './BudgetAllocationForm';
import DepartmentOverview from './DepartmentOverview';
import DepartmentDetail from './DepartmentDetail';
import RegionDetail from './RegionDetail';
import TransactionDetail from './TransactionDetail';
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
  const [selectedRegionData, setSelectedRegionData] = useState(null); // Add this to store full region data
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [error, setError] = useState(null);
  
  // Get the base API URL - use provided apiUrl or fall back to localhost for developmentt
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
  // eslint-disable-next-line no-unused-vars
  const {
    transactions,
    error: transactionsError,
    fetchTransactions
  } = useTransactionData(baseApiUrl, selectedDepartment, selectedRegion);
  
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

  return (
    <div className="dashboard">
      {/* Loading indicator for transactions */}
      {loadingAllTransactions && <div className="loading">Loading all transactions...</div>}
      
      <div className="dashboard-header">
        <h2 className="dashboard-title">Dashboard Overview mit Excel</h2>
        
        {/* Excel Export Button - only show in main view */}
        {!selectedDepartment && departmentsData.departments && regionsData.regions && allTransactions.length > 0 && (
          <EnhancedExcelExportButton  // ✅ Correct component name
  departments={departmentsData.departments || []} 
  regions={regionsData.regions || []}
  transactions={allTransactions}
  baseApiUrl={baseApiUrl}
  useBudgetProgress={useBudgetProgress}  // ✅ Add this line
/>
        )}
      </div>
      
      {/* Conditional rendering based on selection state */}
      {!selectedDepartment && (
        <>
          {/* Budget Setting Form - only shown in main view */}
          <BudgetAllocationForm 
            departments={departmentsData.departments || []} 
            baseApiUrl={baseApiUrl} 
            onSuccess={refreshDepartmentData}
          />
          
          {/* Department Overview */}
          <DepartmentOverview 
  departments={departmentsData.departments || []} 
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