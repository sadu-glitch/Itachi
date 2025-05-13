import React, { useState, useEffect } from 'react';
import StatisticsCards from './StatisticsCards';
import BudgetAllocationForm from './BudgetAllocationForm';
import DepartmentOverview from './DepartmentOverview';
import DepartmentDetail from './DepartmentDetail';
import RegionDetail from './RegionDetail';
import TransactionDetail from './TransactionDetail';
import { useDepartmentData } from '../../hooks/useDepartmentData';
import { useTransactionData } from '../../hooks/useTransactionData';

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
  
  // Fetch transactions when department or region changes
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

  // Extract departments
  const departments = departmentsData.departments || [];
  
  // Get parked measures for selected department ONLY when a department is selected
  // This should NEVER be shown on the main dashboard view
  const parkedMeasures = selectedDepartment && awaitingAssignment 
    ? (awaitingAssignment[selectedDepartment] || [])
    : [];

  // Filter regions for selected department
  const departmentRegions = selectedDepartment 
    ? (regionsData.regions || []).filter(region => region.department === selectedDepartment)
    : [];

  return (
    <div className="dashboard">
      <h2>Dashboard Overview</h2>
      
      {/* Statistics Cards */}
      <StatisticsCards stats={stats} />
      
      {/* Conditional rendering based on selection state */}
      {!selectedDepartment && (
        <>
          {/* Budget Setting Form - only shown in main view */}
          <BudgetAllocationForm 
            departments={departments} 
            baseApiUrl={baseApiUrl} 
            onSuccess={refreshDepartmentData}
          />
          
          {/* Department Overview */}
          <DepartmentOverview 
            departments={departments} 
            onDepartmentClick={handleDepartmentClick} 
          />
        </>
      )}
      
      {/* Department Detail View - only show this when a department is selected */}
      {selectedDepartment && !selectedRegion && (
        <DepartmentDetail 
          selectedDepartment={selectedDepartment}
          regions={departmentRegions}
          transactions={transactions.transactions || []}
          parkedMeasures={parkedMeasures} // Only pass parked measures for this specific department
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
          regions={departmentRegions}
          onClose={() => setSelectedTransaction(null)}
          onAssignmentSuccess={handleAssignmentSuccess}
          baseApiUrl={baseApiUrl}
        />
      )}
    </div>
  );
};

export default Dashboard;