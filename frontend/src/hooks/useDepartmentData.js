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
      
      // ✅ FIXED: Handle string-encoded JSON from your API
      const extractDepartments = (deptData) => {
        // If it's already an array, return it
        if (Array.isArray(deptData)) {
          return deptData;
        }
        
        // If it's a string, try to parse it as JSON
        if (typeof deptData === 'string') {
          try {
            // Replace single quotes with double quotes for valid JSON
            const jsonString = deptData.replace(/'/g, '"');
            const parsed = JSON.parse(jsonString);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          } catch (parseError) {
            console.error('❌ Failed to parse departments string:', parseError);
          }
        }
        
        // If it's an object, try various extraction methods
        if (deptData && typeof deptData === 'object') {
          if (deptData.departments && Array.isArray(deptData.departments)) {
            return deptData.departments;
          }
          const values = Object.values(deptData);
          if (values.length > 0 && typeof values[0] === 'object' && values[0].name) {
            return values;
          }
        }
        
        return [];
      };

      const extractRegions = (regData) => {
        // If it's already an array, return it
        if (Array.isArray(regData)) {
          return regData;
        }
        
        // If it's a string, try to parse it as JSON
        if (typeof regData === 'string') {
          try {
            // Replace single quotes with double quotes for valid JSON
            const jsonString = regData.replace(/'/g, '"');
            const parsed = JSON.parse(jsonString);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          } catch (parseError) {
            console.error('❌ Failed to parse regions string:', parseError);
          }
        }
        
        // If it's an object, try various extraction methods
        if (regData && typeof regData === 'object') {
          if (regData.regions && Array.isArray(regData.regions)) {
            return regData.regions;
          }
          const values = Object.values(regData);
          if (values.length > 0 && typeof values[0] === 'object' && values[0].name) {
            return values;
          }
        }
        
        return [];
      };

      const departmentsArray = extractDepartments(data.departments);
      const regionsArray = extractRegions(data.regions);

      console.log('✅ Successfully extracted:', {
        departmentsCount: departmentsArray.length,
        regionsCount: regionsArray.length,
        sampleDepartment: departmentsArray[0]
      });

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