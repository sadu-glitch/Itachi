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
      
      // ✅ FIXED: Handle object structure from your API
      // Your API returns departments as an object, not array
      const extractDepartments = (deptData) => {
        if (Array.isArray(deptData)) {
          return deptData;
        }
        if (deptData && typeof deptData === 'object') {
          // If it's an object with a departments key
          if (deptData.departments && Array.isArray(deptData.departments)) {
            return deptData.departments;
          }
          // If it's an object where values are the departments
          const values = Object.values(deptData);
          if (values.length > 0 && typeof values[0] === 'object' && values[0].name) {
            return values;
          }
        }
        return [];
      };

      const extractRegions = (regData) => {
        if (Array.isArray(regData)) {
          return regData;
        }
        if (regData && typeof regData === 'object') {
          // If it's an object with a regions key
          if (regData.regions && Array.isArray(regData.regions)) {
            return regData.regions;
          }
          // If it's an object where values are the regions
          const values = Object.values(regData);
          if (values.length > 0 && typeof values[0] === 'object' && values[0].name) {
            return values;
          }
        }
        return [];
      };

      const departmentsArray = extractDepartments(data.departments);
      const regionsArray = extractRegions(data.regions);

      setDepartmentsData({
        departments: departmentsArray
      });
      
      setRegionsData({
        regions: regionsArray
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