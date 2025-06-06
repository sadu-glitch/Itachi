import React, { useState, useMemo } from 'react';

/**
 * Reusable component to display a list of transactions with sorting and filtering
 * @param {Object} props - Component props
 * @param {string} props.title - Title for the transaction list
 * @param {Array} props.transactions - Array of transaction data
 * @param {Function} props.onTransactionClick - Handler for transaction selection
 */
const TransactionList = ({ title, transactions, onTransactionClick }) => {
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [searchText, setSearchText] = useState('');

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      // Same field clicked - toggle direction
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
    } else {
      // New field clicked
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort transactions
  const processedTransactions = useMemo(() => {
    let filtered = [...transactions]; // Create a new array to avoid mutation

    // Apply text search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase().trim();
      filtered = filtered.filter(tx => {
        const text = (tx.text || tx.measure_title || '').toLowerCase();
        return text.includes(search);
      });
    }

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue, bValue;

        switch (sortField) {
          case 'date':
            aValue = new Date(a.booking_date || a.measure_date || '1970-01-01');
            bValue = new Date(b.booking_date || b.measure_date || '1970-01-01');
            break;
          case 'amount':
            aValue = parseFloat(a.amount || a.actual_amount || a.estimated_amount || 0);
            bValue = parseFloat(b.amount || b.actual_amount || b.estimated_amount || 0);
            break;
          case 'type':
            aValue = getTransactionTypeLabel(a.category);
            bValue = getTransactionTypeLabel(b.category);
            break;
          case 'text':
            aValue = (a.text || a.measure_title || '').toLowerCase();
            bValue = (b.text || b.measure_title || '').toLowerCase();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [transactions, searchText, sortField, sortDirection]);

  // Get sort indicator
  const getSortIndicator = (field) => {
    if (sortField !== field) return ' ↕️';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="transaction-list">
      <div style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
        <h3 style={{ margin: '0 0 15px 0' }}>{title}</h3>
        
        {/* Search filter */}
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        </div>

        {/* Results count */}
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
          {searchText.trim() && (
            <>Showing {processedTransactions.length} of {transactions.length} transactions</>
          )}
          {!searchText.trim() && (
            <>{transactions.length} transactions</>
          )}
        </div>
      </div>

      <div className="transaction-header">
        <div 
          style={{ flex: '0 0 12%', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('date')}
        >
          Date{getSortIndicator('date')}
        </div>
        <div style={{ flex: '0 0 12%' }}>
          Type
        </div>
        <div style={{ flex: '0 0 56%' }}>
          Text
        </div>
        <div 
          style={{ flex: '0 0 20%', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => handleSort('amount')}
        >
          Amount{getSortIndicator('amount')}
        </div>
      </div>
      
      {processedTransactions.map((tx, index) => (
        <div 
          key={`${tx.transaction_id || tx.measure_id || 'unknown'}-${index}`}
          className="transaction-row"
          onClick={() => onTransactionClick(tx)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ flex: '0 0 12%' }}>{formatDate(tx.booking_date || tx.measure_date)}</div>
          <div style={{ flex: '0 0 12%' }}>{getTransactionTypeLabel(tx.category)}</div>
          <div style={{ flex: '0 0 56%' }} title={tx.text || tx.measure_title || 'No description'}>
            {highlightSearchText(
              truncateText(tx.text || tx.measure_title || 'No description', 80),
              searchText
            )}
          </div>
          <div style={{ flex: '0 0 20%' }}>{formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}</div>
        </div>
      ))}
      
      {processedTransactions.length === 0 && transactions.length > 0 && (
        <div className="empty-state">No transactions match your search</div>
      )}

      {transactions.length === 0 && (
        <div className="empty-state">No transactions found</div>
      )}
    </div>
  );
};

// Helper function to highlight search text
const highlightSearchText = (text, searchText) => {
  if (!searchText.trim()) return text;
  
  const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, index) => 
    regex.test(part) ? 
      <span key={index} style={{ backgroundColor: '#ffff00', fontWeight: 'bold' }}>{part}</span> : 
      part
  );
};

// Helper function to format date in European format (DD.MM.YYYY)
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return dateString; // Return original if parsing fails
  }
};

// Helper function to truncate text to specified length
const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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
    case 'UNASSIGNED_MEASURE':
      return 'Unassigned';
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