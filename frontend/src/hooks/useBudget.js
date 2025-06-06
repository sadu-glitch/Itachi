// hooks/useBudget.js
import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to handle budget data operations
 * @param {string} baseApiUrl - The base API URL
 * @returns {Object} - Budget data and utility functions
 */
export const useBudget = (baseApiUrl) => {
  const [budgetData, setBudgetData] = useState({ departments: {}, regions: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load budget data from API - using useCallback to prevent dependency issues
  const loadBudgetData = useCallback(async () => {
    if (!baseApiUrl) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Remove trailing slash from baseApiUrl if it exists
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      console.log('🔄 Loading budget data from:', `${normalizedApiUrl}/api/budget-allocation`);
      
      const response = await fetch(`${normalizedApiUrl}/api/budget-allocation`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load budget data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setBudgetData(data);
      setLastUpdated(data.last_updated || new Date().toISOString());
      
      console.log('✅ Budget data loaded:', {
        departments: Object.keys(data.departments || {}).length,
        regions: Object.keys(data.regions || {}).length
      });
      
    } catch (err) {
      console.error('❌ Error loading budget data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [baseApiUrl]); // ✅ FIXED: Added baseApiUrl as dependency

  // ✅ NEW: Refresh function that can be called anytime
  const refreshBudgetData = useCallback(async () => {
    console.log('🔄 Manually refreshing budget data...');
    await loadBudgetData();
  }, [loadBudgetData]);

  // Get budget for specific department
  const getDepartmentBudget = (departmentName) => {
    if (!departmentName || !budgetData.departments) return null;
    return budgetData.departments[departmentName] || null;
  };

  // Get regional budgets for specific department
  const getDepartmentRegionalBudgets = (departmentName) => {
    if (!departmentName || !budgetData.regions) return {};
    
    const regionalBudgets = {};
    
    Object.keys(budgetData.regions).forEach(regionKey => {
      if (regionKey.startsWith(departmentName + '|')) {
        const parts = regionKey.split('|');
        if (parts.length >= 2) {
          const regionName = parts[1];
          regionalBudgets[regionName] = budgetData.regions[regionKey];
        }
      }
    });
    
    return regionalBudgets;
  };

  // Get total allocated budget across all departments
  const getTotalAllocatedBudget = () => {
    if (!budgetData.departments) return 0;
    
    return Object.values(budgetData.departments)
      .reduce((sum, dept) => sum + (dept.allocated_budget || 0), 0);
  };

  // Get department names that have budgets allocated
  const getDepartmentsWithBudgets = () => {
    if (!budgetData.departments) return [];
    return Object.keys(budgetData.departments);
  };

  // Check if department has budget allocated
  const hasBudget = (departmentName) => {
    const budget = getDepartmentBudget(departmentName);
    return budget && budget.allocated_budget > 0;
  };

  // Get budget summary for all departments
  const getBudgetSummary = () => {
    if (!budgetData.departments) return [];
    
    return Object.entries(budgetData.departments).map(([name, budget]) => ({
      name,
      allocated: budget.allocated_budget || 0,
      locationType: budget.location_type || 'Unknown'
    }));
  };

  // Load budget data when baseApiUrl changes
  useEffect(() => {
    if (baseApiUrl) {
      loadBudgetData();
    }
  }, [baseApiUrl, loadBudgetData]); // ✅ FIXED: Added loadBudgetData as dependency

  return {
    // Data
    budgetData,
    loading,
    error,
    lastUpdated,
    
    // Functions
    loadBudgetData,
    refreshBudgetData, // ✅ NEW: Manual refresh function
    getDepartmentBudget,
    getDepartmentRegionalBudgets,
    getTotalAllocatedBudget,
    getDepartmentsWithBudgets,
    hasBudget,
    getBudgetSummary
  };
};

/**
 * Custom hook to combine budget data with spending data for progress tracking
 * @param {string} baseApiUrl - The base API URL
 * @param {string} departmentName - Optional department name to filter data
 * @returns {Object} - Combined budget and spending data
 */
export const useBudgetProgress = (baseApiUrl, departmentName = null) => {
  const { 
    budgetData, 
    loading: budgetLoading, 
    getDepartmentBudget, 
    getDepartmentRegionalBudgets,
    refreshBudgetData // ✅ NEW: Get the refresh function
  } = useBudget(baseApiUrl);
  
  const [spendingData, setSpendingData] = useState({});
  const [spendingLoading, setSpendingLoading] = useState(false);
  const [spendingError, setSpendingError] = useState(null);

  // Load spending data from transactions - using useCallback to prevent dependency issues
  const loadSpendingData = useCallback(async () => {
    if (!baseApiUrl) return;
    
    try {
      setSpendingLoading(true);
      setSpendingError(null);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      // Build query string for department filter
      const queryString = departmentName ? `?department=${encodeURIComponent(departmentName)}` : '';
      
      const response = await fetch(`${normalizedApiUrl}/api/transactions${queryString}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to load spending data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Group spending by department and region
      const spending = {};
      
      data.transactions.forEach(transaction => {
        const dept = transaction.department;
        const region = transaction.region;
        const amount = parseFloat(transaction.amount) || 0;
        
        if (!spending[dept]) {
          spending[dept] = { total: 0, regions: {} };
        }
        
        spending[dept].total += amount;
        
        if (region) {
          spending[dept].regions[region] = 
            (spending[dept].regions[region] || 0) + amount;
        }
      });
      
      setSpendingData(spending);
      
    } catch (err) {
      console.error('Error loading spending data:', err);
      setSpendingError(err.message);
    } finally {
      setSpendingLoading(false);
    }
  }, [baseApiUrl, departmentName]); // ✅ FIXED: Added both dependencies

  // Calculate progress for a specific department
  const getDepartmentProgress = (deptName) => {
    const budget = getDepartmentBudget(deptName);
    const spending = spendingData[deptName];
    
    if (!budget) return null;
    
    const allocated = budget.allocated_budget || 0;
    const spent = spending?.total || 0;
    const remaining = allocated - spent;
    const percentage = allocated > 0 ? (spent / allocated) * 100 : 0;
    
    return {
      department: deptName,
      allocated,
      spent,
      remaining,
      percentage,
      status: percentage > 100 ? 'over' : percentage > 80 ? 'warning' : 'good'
    };
  };

  // Calculate progress for regions of a department
  const getRegionalProgress = (deptName) => {
    const regionalBudgets = getDepartmentRegionalBudgets(deptName);
    const departmentSpending = spendingData[deptName];
    
    return Object.entries(regionalBudgets).map(([regionName, regionBudget]) => {
      const allocated = regionBudget.allocated_budget || 0;
      const spent = departmentSpending?.regions?.[regionName] || 0;
      const remaining = allocated - spent;
      const percentage = allocated > 0 ? (spent / allocated) * 100 : 0;
      
      return {
        region: regionName,
        department: deptName,
        allocated,
        spent,
        remaining,
        percentage,
        status: percentage > 100 ? 'over' : percentage > 80 ? 'warning' : 'good'
      };
    });
  };

  // Load spending data when baseApiUrl or departmentName changes
  useEffect(() => {
    if (baseApiUrl) {
      loadSpendingData();
    }
  }, [baseApiUrl, departmentName, loadSpendingData]); // ✅ FIXED: Added loadSpendingData as dependency

  return {
    // Data
    budgetData,
    spendingData,
    loading: budgetLoading || spendingLoading,
    error: spendingError, // Budget errors are handled by useBudget hook
    
    // Functions
    loadSpendingData,
    refreshBudgetData, // ✅ NEW: Pass through the refresh function
    getDepartmentProgress,
    getRegionalProgress,
    
    // Utility functions from useBudget
    getDepartmentBudget,
    getDepartmentRegionalBudgets
  };
};