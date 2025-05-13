import React from 'react';

/**
 * Reusable component to display a list of transactions
 * @param {Object} props - Component props
 * @param {string} props.title - Title for the transaction list
 * @param {Array} props.transactions - Array of transaction data
 * @param {Function} props.onTransactionClick - Handler for transaction selection
 */
const TransactionList = ({ title, transactions, onTransactionClick }) => {
  return (
    <div className="transaction-list">
      <h3 style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
        {title}
      </h3>
      <div className="transaction-header">
        <div>ID</div>
        <div>Type</div>
        <div>Date</div>
        <div>Amount</div>
      </div>
      
      {transactions.map(tx => (
        <div 
          key={tx.transaction_id || tx.measure_id} 
          className="transaction-row"
          onClick={() => onTransactionClick(tx)}
          style={{ cursor: 'pointer' }}
        >
          <div>{tx.transaction_id || tx.measure_id}</div>
          <div>{getTransactionTypeLabel(tx.category)}</div>
          <div>{tx.booking_date || tx.measure_date}</div>
          <div>{formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}</div>
        </div>
      ))}
      
      {transactions.length === 0 && (
        <div className="empty-state">No transactions found</div>
      )}
    </div>
  );
};

// Helper function to get transaction type label
const getTransactionTypeLabel = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return 'Direct';
    case 'BOOKED_MEASURE':
      return 'SAP-MSP';
    case 'PARKED_MEASURE':
      return 'Parked';
    default:
      return category || 'Unknown';
  }
};

// Import this from a utils file in a real application
const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default TransactionList;