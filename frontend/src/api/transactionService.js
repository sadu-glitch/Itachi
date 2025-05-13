import { apiGet, apiPost } from './index';

// Get all transactions
export const getAllTransactions = () => {
  return apiGet('transactions');
};

// Get transactions filtered by category
export const getTransactionsByCategory = (category) => {
  return apiGet(`transactions?category=${category}`);
};

// Get transactions filtered by department
export const getTransactionsByDepartment = (department) => {
  return apiGet(`transactions?department=${encodeURIComponent(department)}`);
};

// Get transactions filtered by region
export const getTransactionsByRegion = (region) => {
  return apiGet(`transactions?region=${encodeURIComponent(region)}`);
};

// Get transactions filtered by district
export const getTransactionsByDistrict = (district) => {
  return apiGet(`transactions?district=${encodeURIComponent(district)}`);
};

// Get transactions with multiple filters
export const getTransactionsFiltered = ({ category, department, region, district }) => {
  let url = 'transactions?';
  const params = [];
  
  if (category) params.push(`category=${category}`);
  if (department) params.push(`department=${encodeURIComponent(department)}`);
  if (region) params.push(`region=${encodeURIComponent(region)}`);
  if (district) params.push(`district=${encodeURIComponent(district)}`);
  
  url += params.join('&');
  return apiGet(url);
};

export default {
  getAllTransactions,
  getTransactionsByCategory,
  getTransactionsByDepartment,
  getTransactionsByRegion,
  getTransactionsByDistrict,
  getTransactionsFiltered
};