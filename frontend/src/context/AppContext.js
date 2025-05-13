import React, { createContext, useState, useEffect } from 'react';
import * as departmentService from '../api/departmentService';
import * as transactionService from '../api/transactionService';
import { initializeApi } from '../api/index';

// Create context
export const AppContext = createContext();

export const AppContextProvider = ({ children, apiConfig }) => {
  const [departments, setDepartments] = useState([]);
  const [regions, setRegions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statisticsData, setStatisticsData] = useState({});

  // Initialize API with configuration
  useEffect(() => {
    if (apiConfig) {
      initializeApi(apiConfig);
    }
  }, [apiConfig]);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch all data from the API
        const dataResponse = await fetch(`${apiConfig.baseUrl}/api/data`);
        const data = await dataResponse.json();
        
        // Set departments
        if (data.departments && data.departments.departments) {
          setDepartments(data.departments.departments);
        }
        
        // Set regions
        if (data.regions && data.regions.regions) {
          setRegions(data.regions.regions);
        }
        
        // Set statistics
        if (data.transaction_stats) {
          setStatisticsData(data.transaction_stats);
        }
        
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Failed to load application data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (apiConfig) {
      fetchInitialData();
    }
  }, [apiConfig]);

  // Refresh data function
  const refreshData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch all data again
      const dataResponse = await fetch(`${apiConfig.baseUrl}/api/data`);
      const data = await dataResponse.json();
      
      // Update state with fresh data
      if (data.departments && data.departments.departments) {
        setDepartments(data.departments.departments);
      }
      
      if (data.regions && data.regions.regions) {
        setRegions(data.regions.regions);
      }
      
      if (data.transaction_stats) {
        setStatisticsData(data.transaction_stats);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to get a department by ID
  const getDepartmentById = (departmentId) => {
    return departments.find(dept => dept.name === departmentId);
  };

  // Function to get regions for a department
  const getRegionsForDepartment = (departmentId) => {
    return regions.filter(region => region.department === departmentId);
  };

  // Context value
  const contextValue = {
    departments,
    regions,
    isLoading,
    error,
    statisticsData,
    refreshData,
    getDepartmentById,
    getRegionsForDepartment,
    apiConfig
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;