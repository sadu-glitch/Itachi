import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to fetch and manage department and region data
 * @param {string} baseApiUrl - The base API URL
 * @returns {Object} - The department data, loading state, error, and refresh function
 */
export const useDepartmentData = (baseApiUrl) => {
  const [departmentsData, setDepartmentsData] = useState({ departments: [] });
  const [regionsData, setRegionsData] = useState({ regions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Use useCallback to memoize the function
  const fetchDepartmentData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${baseApiUrl}/api/data`);
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      // Store the full data structure
      setDepartmentsData(data.departments || { departments: [] });
      setRegionsData(data.regions || { regions: [] });
      
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [baseApiUrl]); // Add baseApiUrl as a dependency of fetchDepartmentData
  
  // Fetch data when the component mounts or when fetchDepartmentData changes
  useEffect(() => {
    fetchDepartmentData();
  }, [fetchDepartmentData]);
  
  return {
    departmentsData,
    regionsData,
    loading,
    error,
    refreshDepartmentData: fetchDepartmentData
  };
};