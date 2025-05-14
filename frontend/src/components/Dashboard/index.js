import React, { useState, useEffect } from 'react';
import StatisticsCards from './StatisticsCards';
import BudgetAllocationForm from './BudgetAllocationForm';
import DepartmentOverview from './DepartmentOverview';
import DepartmentDetail from './DepartmentDetail';
import RegionDetail from './RegionDetail';
import TransactionDetail from './TransactionDetail';
import { useDepartmentData } from '../../hooks/useDepartmentData';
import { useTransactionData } from '../../hooks/useTransactionData';
import ExcelExportButton from '../ExcelExportButton'; // Import the ExcelExportButton component
import '../../styles/excel-export.css'; // Import the export button styles

// Main Dashboard component that orchestrates the overall structure
const Dashboard = ({ stats, budgetData, awaitingAssignment, apiUrl }) => {
  // State for navigation and selection
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
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
  // eslint-disable-next-line no-unused-vars
  const {
    transactions,
    loading: transactionsLoading,
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
    setSelectedDepartment(department.name);
    setSelectedRegion(null);
    setSelectedTransaction(null);
  };

  // Handle region selection
  const handleRegionClick = (region) => {
    setSelectedRegion(region.name);
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
          <ExcelExportButton 
            departments={departmentsData.departments || []} 
            regions={regionsData.regions || []}
            transactions={allTransactions}
          />
        )}
      </div>
      
      {/* Statistics Cards */}
      <StatisticsCards stats={stats} />
      
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
          />
        </>
      )}
      
      {/* Department Detail View */}
      {selectedDepartment && !selectedRegion && (
        <DepartmentDetail 
          selectedDepartment={selectedDepartment}
          regions={regionsData.regions?.filter(region => region.department === selectedDepartment) || []}
          transactions={transactions.transactions || []}
          parkedMeasures={awaitingAssignment?.[selectedDepartment] || []}
          onRegionClick={handleRegionClick}
          onTransactionClick={handleTransactionClick}
          onBackClick={() => setSelectedDepartment(null)}
          onAssignmentSuccess={handleAssignmentSuccess}
          baseApiUrl={baseApiUrl}
        />
      )}
      
      {/* Region Detail View */}
      {selectedDepartment && selectedRegion && (
        <RegionDetail 
          selectedDepartment={selectedDepartment}
          selectedRegion={selectedRegion}
          transactions={transactions.transactions || []}
          onTransactionClick={handleTransactionClick}
          onBackClick={() => setSelectedRegion(null)}
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