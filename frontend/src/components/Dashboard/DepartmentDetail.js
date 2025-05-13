import React from 'react';
import TransactionList from './TransactionList';
import ParkedMeasuresSection from './ParkedMeasuresSection';
import { formatCurrency } from '../../utils/formatters';

/**
 * Component to display department detail view with regions and transactions
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
  // Safety check - only proceed if we have a selected department
  if (!selectedDepartment) return null;

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

      {/* Parked Measures - ONLY show when they exist for this department */}
      {parkedMeasures && parkedMeasures.length > 0 && (
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

export default DepartmentDetail;