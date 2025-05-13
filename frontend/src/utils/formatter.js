// Format currency values (Euro)
export const formatCurrency = (value) => {
  if (value === null || value === undefined) return '€0,00';
  
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

// Format date values
export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

// Format percentage values
export const formatPercentage = (value, total) => {
  if (!total || total === 0) return '0%';
  
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(1)}%`;
};

// Get status color based on transaction status
export const getStatusColor = (status) => {
  switch (status) {
    case 'Direct Booked':
      return '#4caf50'; // Green
    case 'SAP-MSP Booked':
      return '#2196f3'; // Blue
    case 'Manually assigned, awaiting SAP':
      return '#ff9800'; // Orange
    case 'Awaiting Assignment':
      return '#f44336'; // Red
    case 'Unknown Location':
      return '#9e9e9e'; // Gray
    default:
      return '#9e9e9e'; // Gray
  }
};

// Get budget status color based on utilization
export const getBudgetStatusColor = (allocated, used) => {
  if (!allocated || allocated === 0) return '#9e9e9e'; // Gray if no budget allocated
  
  const utilizationPercentage = (used / allocated) * 100;
  
  if (utilizationPercentage > 100) {
    return '#f44336'; // Red - over budget
  } else if (utilizationPercentage > 90) {
    return '#ff9800'; // Orange - close to budget limit
  } else if (utilizationPercentage > 75) {
    return '#ffc107'; // Yellow - approaching budget limit
  } else {
    return '#4caf50'; // Green - within budget
  }
};

// Truncate long text with ellipsis
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

export default {
  formatCurrency,
  formatDate,
  formatPercentage,
  getStatusColor,
  getBudgetStatusColor,
  truncateText
};