import React from 'react';
import TransactionList from './TransactionList';

/**
 * Component to display region detail view with transactions
 * @param {Object} props - Component props
 * @param {string} props.selectedDepartment - Selected department name
 * @param {string} props.selectedRegion - Selected region name
 * @param {Array} props.transactions - Array of transaction data
 * @param {Function} props.onTransactionClick - Handler for transaction selection
 * @param {Function} props.onBackClick - Handler for back button click
 */
const RegionDetail = ({
  selectedDepartment,
  selectedRegion,
  transactions,
  onTransactionClick,
  onBackClick
}) => {
  return (
    <div className="budget-summary">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>{selectedRegion} - Transactions</h3>
        <button 
          className="assign-button"
          onClick={onBackClick}
          style={{ padding: '5px 10px', fontSize: '12px' }}
        >
          Back to {selectedDepartment}
        </button>
      </div>

      {/* Transactions Table for Region */}
      <TransactionList 
        title="Region Transactions"
        transactions={transactions}
        onTransactionClick={onTransactionClick}
      />
    </div>
  );
};

export default RegionDetail;