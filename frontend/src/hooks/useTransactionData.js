import { useState, useEffect, useCallback } from 'react';

/**
 * ✅ FIXED: Custom hook to fetch and manage transaction data
 * This version properly handles the API response structure and provides better debugging
 */
export const useTransactionData = (baseApiUrl, department, region) => {
  const [transactions, setTransactions] = useState({ 
    transactions: [], 
    parked_measures: [],
    direct_costs: [],
    booked_measures: [],
    statistics: {},
    total: 0 
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const fetchTransactions = useCallback(async () => {
    // ✅ FIX 1: Always fetch data, don't return early
    // The component can decide what to do with empty filters
    
    try {
      setLoading(true);
      setError(null);
      
      // ✅ FIX 2: Normalize API URL
      const normalizedApiUrl = baseApiUrl?.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      // ✅ FIX 3: Build URL with proper query parameters
      let url = `${normalizedApiUrl}/api/transactions`;
      const queryParams = [];
      
      if (department) {
        queryParams.push(`department=${encodeURIComponent(department)}`);
      }
      if (region) {
        queryParams.push(`region=${encodeURIComponent(region)}`);
      }
      
      if (queryParams.length > 0) {
        url += `?${queryParams.join('&')}`;
      }
      
      console.log('🔍 useTransactionData: Fetching from URL:', url);
      console.log('🔍 useTransactionData: Filters - Department:', department, 'Region:', region);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const jsonData = await response.json();
      
      // ✅ FIX 4: Enhanced response logging
      console.log('🔍 useTransactionData: API Response received:', {
        responseType: typeof jsonData,
        hasTransactions: 'transactions' in jsonData,
        transactionsCount: jsonData.transactions?.length || 0,
        hasParkedMeasures: 'parked_measures' in jsonData,
        parkedMeasuresCount: jsonData.parked_measures?.length || 0,
        hasDirectCosts: 'direct_costs' in jsonData,
        directCostsCount: jsonData.direct_costs?.length || 0,
        hasBookedMeasures: 'booked_measures' in jsonData,
        bookedMeasuresCount: jsonData.booked_measures?.length || 0,
        allKeys: Object.keys(jsonData),
        summary: jsonData.summary
      });
      
      // ✅ FIX 5: Ensure all expected properties exist with fallbacks
      const processedData = {
        transactions: jsonData.transactions || [],
        parked_measures: jsonData.parked_measures || [],
        direct_costs: jsonData.direct_costs || [],
        booked_measures: jsonData.booked_measures || [],
        outliers: jsonData.outliers || [],
        placeholders: jsonData.placeholders || [],
        statistics: jsonData.statistics || {},
        summary: jsonData.summary || {},
        total: jsonData.transactions?.length || 0,
        filters_applied: jsonData.filters_applied || { department, region },
        processing_date: jsonData.processing_date,
        data_source: jsonData.data_source || 'API'
      };
      
      // ✅ FIX 6: Log the processed data structure
      console.log('🔍 useTransactionData: Processed data:', {
        transactions: processedData.transactions.length,
        parkedMeasures: processedData.parked_measures.length,
        directCosts: processedData.direct_costs.length,
        bookedMeasures: processedData.booked_measures.length,
        totalRecords: processedData.total,
        filtersApplied: processedData.filters_applied
      });
      
      // ✅ FIX 7: Sample some transactions for debugging
      if (processedData.transactions.length > 0) {
        console.log('🔍 useTransactionData: Sample transaction:', {
          firstTransaction: processedData.transactions[0],
          hasAmount: 'amount' in processedData.transactions[0],
          hasDepartment: 'department' in processedData.transactions[0],
          hasRegion: 'region' in processedData.transactions[0],
          hasCategory: 'category' in processedData.transactions[0]
        });
      }
      
      if (processedData.parked_measures.length > 0) {
        console.log('🔍 useTransactionData: Sample parked measure:', {
          firstParkedMeasure: processedData.parked_measures[0],
          hasBestellnummer: 'bestellnummer' in processedData.parked_measures[0],
          hasEstimatedAmount: 'estimated_amount' in processedData.parked_measures[0],
          hasStatus: 'status' in processedData.parked_measures[0]
        });
      }
      
      setTransactions(processedData);
      setLoading(false);
      return processedData;
      
    } catch (err) {
      console.error('❌ useTransactionData: Fetch error:', {
        message: err.message,
        stack: err.stack,
        url: url,
        department,
        region
      });
      
      setError(err.message);
      setLoading(false);
      
      // ✅ FIX 8: Set empty but valid structure on error
      const emptyData = {
        transactions: [],
        parked_measures: [],
        direct_costs: [],
        booked_measures: [],
        statistics: {},
        total: 0,
        error: err.message
      };
      
      setTransactions(emptyData);
      throw err;
    }
  }, [baseApiUrl, department, region]);
  
  // ✅ FIX 9: Add manual refresh function
  const refreshTransactions = useCallback(async () => {
    console.log('🔄 useTransactionData: Manual refresh triggered');
    return await fetchTransactions();
  }, [fetchTransactions]);
  
  // Fetch transactions when dependencies change
  useEffect(() => {
    if (baseApiUrl) {
      console.log('🔄 useTransactionData: useEffect triggered - fetching data...');
      fetchTransactions();
    } else {
      console.log('❌ useTransactionData: No baseApiUrl provided');
    }
  }, [fetchTransactions, baseApiUrl]);
  
  // ✅ FIX 10: Enhanced return object with better debugging info
  return {
    transactions, // This contains the full API response structure
    loading,
    error,
    fetchTransactions,
    refreshTransactions, // New manual refresh function
    
    // ✅ Convenience getters for easier access
    getAllTransactions: () => transactions.transactions || [],
    getParkedMeasures: () => transactions.parked_measures || [],
    getDirectCosts: () => transactions.direct_costs || [],
    getBookedMeasures: () => transactions.booked_measures || [],
    getStatistics: () => transactions.statistics || {},
    
    // ✅ Debugging helpers
    debugInfo: {
      lastFetchTime: new Date().toISOString(),
      apiUrl: baseApiUrl,
      currentFilters: { department, region },
      dataStructure: {
        hasTransactions: Array.isArray(transactions.transactions),
        transactionCount: transactions.transactions?.length || 0,
        hasParkedMeasures: Array.isArray(transactions.parked_measures),
        parkedMeasureCount: transactions.parked_measures?.length || 0
      }
    }
  };
};