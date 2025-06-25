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
      
      // Remove trailing slash if present
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
        
      const response = await fetch(`${normalizedApiUrl}/api/data`);
      
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      
      const data = await response.json();
      
      // ✅ FIX: Store the data correctly without double-wrapping
      console.log('🔍 API Response Structure:', {
        fullData: data,
        departments: data.departments,
        departmentsIsArray: Array.isArray(data.departments),
        regions: data.regions,
        regionsIsArray: Array.isArray(data.regions)
      });
      
      // ✅ FIXED: Directly store the data structure as received from API
      setDepartmentsData({
        departments: Array.isArray(data.departments) ? data.departments : []
      });
      
      setRegionsData({
        regions: Array.isArray(data.regions) ? data.regions : []
      });
      
      setLoading(false);
      return data;
    } catch (err) {
      console.error('❌ useDepartmentData fetch error:', err);
      setError(err.message);
      setLoading(false);
      
      // ✅ FIX: Ensure we always have valid array structure even on error
      setDepartmentsData({ departments: [] });
      setRegionsData({ regions: [] });
      
      throw err;
    }
  }, [baseApiUrl]); // Add baseApiUrl as a dependency of fetchDepartmentData
  
  // Fetch data when the component mounts or when fetchDepartmentData changes
  useEffect(() => {
    if (baseApiUrl) {
      fetchDepartmentData();
    }
  }, [fetchDepartmentData, baseApiUrl]);
  
  return {
    departmentsData,
    regionsData,
    loading,
    error,
    refreshDepartmentData: fetchDepartmentData
  };
};