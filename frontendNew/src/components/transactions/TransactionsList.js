import React, { useState } from 'react';
import { formatCurrency, formatDate, getStatusColor, truncateText } from '../../utils/formatters';
import './TransactionsList.css';

const TransactionsList = ({ 
  transactions, 
  showFilters = false,
  initialFilters = {}
}) => {
  // State for filters
  const [filters, setFilters] = useState({
    category: initialFilters.category || '',
    status: initialFilters.status || '',
    searchTerm: initialFilters.searchTerm || '',
    ...initialFilters
  });
  
  // Apply filters to transactions
  const filteredTransactions = transactions.filter(transaction => {
    // Category filter
    if (filters.category && transaction.category !== filters.category) {
      return false;
    }
    
    // Status filter
    if (filters.status && transaction.status !== filters.status) {
      return false;
    }
    
    // Search term (across multiple fields)
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const searchableFields = [
        transaction.transaction_id,
        transaction.measure_id,
        transaction.text,
        transaction.measure_title,
        transaction.department,
        transaction.region,
        transaction.district
      ];
      
      // Check if any field contains the search term
      return searchableFields.some(field => 
        field && field.toString().toLowerCase().includes(searchLower)
      );
    }
    
    return true;
  });
  
  // Handler for filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };
  
  // Categories and statuses for filter dropdowns
  const categories = ['DIRECT_COST', 'BOOKED_MEASURE', 'PARKED_MEASURE', 'OUTLIER'];
  const statuses = [
    'Direct Booked', 
    'SAP-MSP Booked', 
    'Manually assigned, awaiting SAP', 
    'Awaiting Assignment', 
    'Unknown Location'
  ];
  
  // Reset all filters
  const resetFilters = () => {
    setFilters({
      category: '',
      status: '',
      searchTerm: ''
    });
  };
  
  return (
    <div className="transactions-list-container">
      {showFilters && (
        <div className="transactions-filters">
          <div className="filter-group">
            <label htmlFor="category">Category</label>
            <select 
              id="category" 
              name="category" 
              value={filters.category} 
              onChange={handleFilterChange}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label htmlFor="status">Status</label>
            <select 
              id="status" 
              name="status" 
              value={filters.status} 
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label htmlFor="searchTerm">Search</label>
            <input 
              type="text" 
              id="searchTerm" 
              name="searchTerm" 
              placeholder="Search..."
              value={filters.searchTerm}
              onChange={handleFilterChange}
            />
          </div>
          
          <button className="btn-reset-filters" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      )}
      
      <div className="transactions-count">
        {filteredTransactions.length} transactions found
      </div>
      
      <div className="transactions-table-container">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Description</th>
              <th>Date</th>
              <th>Department</th>
              <th>Region</th>
              <th>District</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="9" className="no-transactions">
                  No transactions found
                </td>
              </tr>
            ) : (
              filteredTransactions.map(transaction => (
                <tr key={transaction.transaction_id || transaction.measure_id}>
                  <td>{transaction.transaction_id || transaction.measure_id}</td>
                  <td>{transaction.category?.replace('_', ' ')}</td>
                  <td>
                    <span 
                      className="status-indicator" 
                      style={{ backgroundColor: getStatusColor(transaction.status) }}
                    ></span>
                    {transaction.status}
                  </td>
                  <td className="amount-cell">
                    {transaction.category === 'PARKED_MEASURE' 
                      ? formatCurrency(transaction.estimated_amount)
                      : formatCurrency(transaction.amount || transaction.actual_amount)
                    }
                  </td>
                  <td className="description-cell">
                    {truncateText(transaction.text || transaction.measure_title, 50)}
                  </td>
                  <td>
                    {formatDate(transaction.booking_date || transaction.measure_date)}
                  </td>
                  <td>{transaction.department || '-'}</td>
                  <td>{transaction.region || '-'}</td>
                  <td>{transaction.district || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsList;