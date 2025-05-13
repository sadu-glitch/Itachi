import React from 'react';
import TransactionList from './TransactionList';
import ParkedMeasuresSection from './ParkedMeasuresSection';

/**
 * Component to display department detail view with regions and transactions
 * @param {Object} props - Component props
 * @param {string} props.selectedDepartment - Selected department name
 * @param {Array} props.regions - Array of region data for the department
 * @param {Array} props.transactions - Array of transaction data
 * @param {Array} props.parkedMeasures - Array of parked measures awaiting assignment
 * @param {Function} props.onRegionClick - Handler for region selection
 * @param {Function} props.onTransactionClick - Handler for transaction selection
 * @param {Function} props.onBackClick - Handler for back button click
 * @param {Function} props.onAssignmentSuccess - Handler for successful assignment
 * @param {string} props.baseApiUrl - Base API URL
 */
const DepartmentDetail = ({
  selectedDepartment,
  regions,
  transactions,
  parkedMeasures,
  onRegionClick,
  onTransactionClick,
  onBackClick,
  onAssignmentSuccess,
  baseApiUrl
}) => {
  return (
    <div className="budget-summary">
      {/* Header with back button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>{selectedDepartment} - Regions</h3>
        <button 
          className="assign-button"
          onClick={onBackClick}
          style={{ padding: '5px 10px', fontSize: '12px' }}
        >
          Back to Departments
        </button>
      </div>

      {/* Regions Table */}
      <div className="budget-table">
        <div className="budget-header">
          <div>Region</div>
          <div>Booked Amount</div>
          <div>Reserved Amount</div>
          <div>Total Amount</div>
        </div>
        
        {regions.map(region => (
          <div 
            className="budget-row" 
            key={region.name}
            onClick={() => onRegionClick(region)}
            style={{ cursor: 'pointer' }}
          >
            <div>{region.name}</div>
            <div>{formatCurrency(region.booked_amount)}</div>
            <div>{formatCurrency(region.reserved_amount)}</div>
            <div>{formatCurrency(region.total_amount)}</div>
          </div>
        ))}
      </div>

      {/* Parked Measures */}
      {parkedMeasures.length > 0 && (
        <ParkedMeasuresSection 
          parkedMeasures={parkedMeasures}
          regions={regions}
          onAssignmentSuccess={onAssignmentSuccess}
          baseApiUrl={baseApiUrl}
        />
      )}

      {/* Transactions Table */}
      <div style={{ marginTop: '20px' }}>
        <TransactionList 
          title="All Department Transactions"
          transactions={transactions}
          onTransactionClick={onTransactionClick}
        />
      </div>
    </div>
  );
};

// Import at the top of your file
const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default DepartmentDetail;