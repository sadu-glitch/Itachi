/**
 * Utility functions for formatting data
 */

/**
 * Format a currency value using the German locale and Euro symbol
 * @param {number|string} value - The value to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

/**
 * Get display label for transaction type
 * @param {string} category - Transaction category
 * @returns {string} Human-readable transaction type
 */
export const getTransactionTypeLabel = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return 'Direct Cost';
    case 'BOOKED_MEASURE':
      return 'SAP-MSP Booked Measure';
    case 'PARKED_MEASURE':
      return 'Parked Measure';
    default:
      return category || 'Unknown';
  }
};

/**
 * Get CSS class name for transaction type tag
 * @param {string} category - Transaction category
 * @returns {string} CSS class name
 */
export const getTransactionTagClass = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return 'tag-direct';
    case 'BOOKED_MEASURE':
      return 'tag-booked';
    case 'PARKED_MEASURE':
      return 'tag-parked';
    default:
      return 'tag-default';
  }
};

/**
 * Format a date string
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    return dateString;
  }
};

/**
 * Get a specific value from a transaction object
 * @param {Object} transaction - Transaction object
 * @param {string} field - Field to retrieve (e.g., 'amount', 'date')
 * @returns {*} The field value
 */
export const getTransactionValue = (transaction, field) => {
  switch (field) {
    case 'id':
      return transaction.transaction_id || transaction.measure_id || '';
    case 'amount':
      return transaction.amount || transaction.actual_amount || transaction.estimated_amount || 0;
    case 'date':
      return transaction.booking_date || transaction.measure_date || '';
    default:
      return transaction[field] || '';
  }
};

/**
 * Determine if a value represents a positive or negative trend
 * @param {number} value - The value to check
 * @returns {string} CSS class name based on value
 */
export const getTrendClass = (value) => {
  if (value > 0) return 'trend-positive';
  if (value < 0) return 'trend-negative';
  return '';
};