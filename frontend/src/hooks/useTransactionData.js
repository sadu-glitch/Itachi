import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch and manage transaction data
 * @param {string} baseApiUrl - The base API URL
 * @param {string|null} department - The selected department
 * @param {string|null} region - The selected region
 * @returns {Object} - The transaction data, loading state, error, and fetch function
 */
export const useTransactionData = (baseApiUrl, department, region) => {
  const [transactions, setTransactions] = useState({ transactions: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const fetchTransactions = async () => {
    if (!department) {
      setTransactions({ transactions: [], total: 0 });
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      let url = `${baseApiUrl}/api/transactions?department=${encodeURIComponent(department)}`;
      if (region) {
        url += `&region=${encodeURIComponent(region)}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const jsonData = await response.json();
      setTransactions(jsonData);
      setLoading(false);
      return jsonData;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };
  
  // Fetch transactions when department or region changes
  useEffect(() => {
    fetchTransactions();
  }, [department, region, baseApiUrl]);
  
  return {
    transactions,
    loading,
    error,
    fetchTransactions
  };
};