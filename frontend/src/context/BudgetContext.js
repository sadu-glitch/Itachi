import React, { createContext, useState, useEffect, useContext } from 'react';
import * as budgetService from '../api/budgetService';
import { AppContext } from './AppContext';

// Create context
export const BudgetContext = createContext();

export const BudgetContextProvider = ({ children }) => {
  const { refreshData } = useContext(AppContext);
  const [departmentBudgets, setDepartmentBudgets] = useState({});
  const [regionBudgets, setRegionBudgets] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch budget data
  useEffect(() => {
    const fetchBudgetData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const budgetData = await budgetService.getBudgetAllocations();
        
        if (budgetData.departments) {
          setDepartmentBudgets(budgetData.departments);
        }
        
        if (budgetData.regions) {
          setRegionBudgets(budgetData.regions);
        }
      } catch (err) {
        console.error('Error fetching budget data:', err);
        setError('Failed to load budget data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBudgetData();
  }, []);

  // Function to allocate budget to a department
  const allocateBudgetToDepartment = async (departmentId, amount) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await budgetService.updateDepartmentBudget(departmentId, amount);
      
      // Update local state
      setDepartmentBudgets(prevBudgets => ({
        ...prevBudgets,
        [departmentId]: {
          allocated_budget: amount
        }
      }));
      
      // Refresh data to get updated calculations
      await refreshData();
      
      return true;
    } catch (err) {
      console.error('Error allocating budget to department:', err);
      setError('Failed to allocate budget. Please try again later.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to allocate budget to a region
  const allocateBudgetToRegion = async (departmentId, regionId, amount) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const regionKey = `${departmentId}|${regionId}`;
      await budgetService.updateRegionBudget(departmentId, regionId, amount);
      
      // Update local state
      setRegionBudgets(prevBudgets => ({
        ...prevBudgets,
        [regionKey]: {
          allocated_budget: amount
        }
      }));
      
      // Refresh data to get updated calculations
      await refreshData();
      
      return true;
    } catch (err) {
      console.error('Error allocating budget to region:', err);
      setError('Failed to allocate budget. Please try again later.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to get remaining budget for a department
  const getDepartmentRemainingBudget = (departmentId) => {
    const department = departmentBudgets[departmentId];
    if (!department) return 0;
    
    // Department's allocated budget
    const allocatedBudget = department.allocated_budget || 0;
    
    // Calculate total allocated to regions
    const regionsForDepartment = Object.entries(regionBudgets)
      .filter(([key]) => key.startsWith(`${departmentId}|`))
      .reduce((total, [_, budget]) => total + (budget.allocated_budget || 0), 0);
    
    return allocatedBudget - regionsForDepartment;
  };

  // Function to get total budget utilization for a department
  const getDepartmentBudgetUtilization = (departmentId, departmentData) => {
    if (!departmentData) return { allocated: 0, booked: 0, reserved: 0, remaining: 0 };
    
    const allocated = departmentBudgets[departmentId]?.allocated_budget || 0;
    const booked = departmentData.booked_amount || 0;
    const reserved = departmentData.reserved_amount || 0;
    const remaining = allocated - booked - reserved;
    
    return { allocated, booked, reserved, remaining };
  };

  // Function to get total budget utilization for a region
  const getRegionBudgetUtilization = (departmentId, regionId, regionData) => {
    if (!regionData) return { allocated: 0, booked: 0, reserved: 0, remaining: 0 };
    
    const regionKey = `${departmentId}|${regionId}`;
    const allocated = regionBudgets[regionKey]?.allocated_budget || 0;
    const booked = regionData.booked_amount || 0;
    const reserved = regionData.reserved_amount || 0;
    const remaining = allocated - booked - reserved;
    
    return { allocated, booked, reserved, remaining };
  };

  // Context value
  const contextValue = {
    departmentBudgets,
    regionBudgets,
    isLoading,
    error,
    allocateBudgetToDepartment,
    allocateBudgetToRegion,
    getDepartmentRemainingBudget,
    getDepartmentBudgetUtilization,
    getRegionBudgetUtilization
  };

  return (
    <BudgetContext.Provider value={contextValue}>
      {children}
    </BudgetContext.Provider>
  );
};

export default BudgetContext;