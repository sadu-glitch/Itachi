import { useState, useEffect, useCallback } from 'react';

/**
 * Fixed version of useDepartmentData hook with better error handling and debugging
 */
export const useDepartmentData = (baseApiUrl) => {
  const [departmentsData, setDepartmentsData] = useState({ departments: [] });
  const [regionsData, setRegionsData] = useState({ regions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const fetchDepartmentData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Hook: Starting fetch from:', baseApiUrl);
      
      // Remove trailing slash if present
      const normalizedApiUrl = baseApiUrl?.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
        
      const response = await fetch(`${normalizedApiUrl}/api/data`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }
      });
      
      console.log('🔍 Hook: Response status:', response.status);
      console.log('🔍 Hook: Response ok:', response.ok);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      console.log('🔍 Hook: Raw API response:', {
        dataType: typeof data,
        hasData: !!data,
        departments: {
          exists: 'departments' in data,
          type: typeof data.departments,
          isArray: Array.isArray(data.departments),
          value: data.departments
        },
        regions: {
          exists: 'regions' in data,
          type: typeof data.regions,
          isArray: Array.isArray(data.regions),
          value: data.regions
        },
        awaitingAssignment: {
          exists: 'awaiting_assignment' in data,
          type: typeof data.awaiting_assignment
        },
        budgetAllocation: {
          exists: 'budget_allocation' in data,
          type: typeof data.budget_allocation
        }
      });
      
      // ✅ SIMPLIFIED: Just use the departments and regions directly from API
      // If they're arrays, great. If not, we'll handle it simply.
      
      let departmentsArray = [];
      let regionsArray = [];
      
      // Handle departments
      if (Array.isArray(data.departments)) {
        departmentsArray = data.departments;
        console.log('✅ Hook: Departments is already an array:', departmentsArray.length);
      } else if (data.departments) {
        console.log('⚠️ Hook: Departments is not an array, trying to extract...');
        console.log('⚠️ Hook: Departments value:', data.departments);
        
        // Try to convert non-array to array
        if (typeof data.departments === 'object') {
          const values = Object.values(data.departments);
          if (values.length > 0) {
            departmentsArray = values;
            console.log('✅ Hook: Converted departments object to array:', departmentsArray.length);
          }
        }
      } else {
        console.log('❌ Hook: No departments found in response');
      }
      
      // Handle regions
      if (Array.isArray(data.regions)) {
        regionsArray = data.regions;
        console.log('✅ Hook: Regions is already an array:', regionsArray.length);
      } else if (data.regions) {
        console.log('⚠️ Hook: Regions is not an array, trying to extract...');
        console.log('⚠️ Hook: Regions value:', data.regions);
        
        // Try to convert non-array to array
        if (typeof data.regions === 'object') {
          const values = Object.values(data.regions);
          if (values.length > 0) {
            regionsArray = values;
            console.log('✅ Hook: Converted regions object to array:', regionsArray.length);
          }
        }
      } else {
        console.log('❌ Hook: No regions found in response');
      }

      console.log('🎯 Hook: Final extracted data:', {
        departmentsCount: departmentsArray.length,
        regionsCount: regionsArray.length,
        sampleDepartment: departmentsArray[0],
        sampleRegion: regionsArray[0]
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
      console.error('❌ Hook: Fetch error:', err);
      console.error('❌ Hook: Error details:', {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack
      });
      
      setError(err.message);
      setLoading(false);
      
      // Ensure we always have valid array structure even on error
      setDepartmentsData({ departments: [] });
      setRegionsData({ regions: [] });
      
      throw err;
    }
  }, [baseApiUrl]);
  
  // Fetch data when the component mounts or when baseApiUrl changes
  useEffect(() => {
    if (baseApiUrl) {
      console.log('🔍 Hook: useEffect triggered, fetching data...');
      fetchDepartmentData();
    } else {
      console.log('❌ Hook: No baseApiUrl provided');
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