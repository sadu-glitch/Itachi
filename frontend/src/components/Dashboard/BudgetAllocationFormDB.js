import React, { useState, useEffect, useCallback } from 'react';

/**
 * Enhanced component for budget allocation with regional distribution and audit trail
 * Database-integrated version (replaces blob storage hooks with direct API calls)
 */
const BudgetAllocationForm = ({ departments, baseApiUrl, onSuccess }) => {
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [departmentBudget, setDepartmentBudget] = useState(0);
  const [regionalBudgets, setRegionalBudgets] = useState({});
  const [allowPartialAllocation, setAllowPartialAllocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loadingExistingBudgets, setLoadingExistingBudgets] = useState(false);
  
  // User tracking states
  const [userName, setUserName] = useState(
    localStorage.getItem('budgetUserName') || ''
  );
  const [changeReason, setChangeReason] = useState('');

  // Database-integrated budget state
  const [budgetData, setBudgetData] = useState({ departments: {}, regions: {} });
  const [budgetDataLoading, setBudgetDataLoading] = useState(false);

  // ✅ DATABASE INTEGRATION: Direct API calls instead of hooks
  
  // Fetch budget data from database
  const fetchBudgetData = useCallback(async () => {
    if (!baseApiUrl) return;
    
    try {
      setBudgetDataLoading(true);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
        
      const response = await fetch(`${normalizedApiUrl}/api/budget-allocation`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // ✅ FIX: Add cache-busting headers to ensure fresh data
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch budget data: ${response.status}`);
      }

      const data = await response.json();
      setBudgetData({
        departments: data.departments || {},
        regions: data.regions || {}
      });
      
      console.log('✅ Budget data fetched from database:', {
        departments: Object.keys(data.departments || {}).length,
        regions: Object.keys(data.regions || {}).length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error fetching budget data:', error);
      setBudgetData({ departments: {}, regions: {} });
    } finally {
      setBudgetDataLoading(false);
    }
  }, [baseApiUrl]);

  // ✅ FIX: Enhanced department budget lookup with better debugging
  const getDepartmentBudget = useCallback((departmentName, locationType) => {
    if (!departmentName || !budgetData.departments) return null;
    
    console.log('🔍 DEBUG getDepartmentBudget:', {
      departmentName,
      locationType,
      availableKeys: Object.keys(budgetData.departments),
      budgetDataDepartments: budgetData.departments
    });
    
    // ✅ FIX: Try the exact key first (with location type)
    const exactKey = `${departmentName}|${locationType}`;
    if (budgetData.departments[exactKey]) {
      console.log('✅ Found exact match:', exactKey, budgetData.departments[exactKey]);
      return budgetData.departments[exactKey];
    }
    
    // Try exact match without location type
    if (budgetData.departments[departmentName]) {
      console.log('✅ Found direct match:', departmentName, budgetData.departments[departmentName]);
      return budgetData.departments[departmentName];
    }
    
    // Try with different location types as fallback
    const possibleKeys = [
      `${departmentName}|Floor`,
      `${departmentName}|HQ`,
      departmentName
    ];
    
    for (const key of possibleKeys) {
      if (budgetData.departments[key]) {
        console.log('✅ Found fallback match:', key, budgetData.departments[key]);
        return budgetData.departments[key];
      }
    }
    
    console.log('❌ No budget found for department:', departmentName);
    return null;
  }, [budgetData.departments]);

  // ✅ FIX: Enhanced regional budgets lookup with better debugging
  const getDepartmentRegionalBudgets = useCallback((departmentName, locationType) => {
    if (!departmentName || !budgetData.regions) return {};
    
    console.log('🔍 DEBUG getDepartmentRegionalBudgets:', {
      departmentName,
      locationType,
      availableRegionKeys: Object.keys(budgetData.regions),
      budgetDataRegions: budgetData.regions
    });
    
    const regionalBudgets = {};
    
    Object.entries(budgetData.regions).forEach(([regionKey, regionData]) => {
      // Try exact match first
      if (regionKey.startsWith(`${departmentName}|`)) {
        const parts = regionKey.split('|');
        if (parts.length >= 2) {
          const regionName = parts[1];
          regionalBudgets[regionName] = regionData;
          console.log('✅ Found regional budget:', regionName, regionData);
        }
      }
    });
    
    console.log('📊 Final regional budgets:', regionalBudgets);
    return regionalBudgets;
  }, [budgetData.regions]);

  // Refresh budget data
  const refreshBudgetData = useCallback(async () => {
    console.log('🔄 Refreshing budget data...');
    await fetchBudgetData();
  }, [fetchBudgetData]);

  // Initial data load
  useEffect(() => {
    fetchBudgetData();
  }, [fetchBudgetData]);

  // Save user name to localStorage for future use
  const handleUserNameChange = (e) => {
    const name = e.target.value;
    setUserName(name);
    localStorage.setItem('budgetUserName', name);
  };

  // ✅ FIX: Enhanced loadExistingBudgets with better error handling and debugging
  const loadExistingBudgets = async (department) => {
    if (!department) return;
    
    console.log('🔄 Loading existing budgets for:', department.name, 'Type:', department.location_type);
    setLoadingExistingBudgets(true);
    
    try {
      // ✅ FIX: Always refresh data first to ensure we have the latest
      console.log('🔄 Refreshing data before loading existing budgets...');
      await refreshBudgetData();
      
      // ✅ FIX: Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // ✅ FIX: Pass location type to lookup functions
      const departmentBudgetData = getDepartmentBudget(department.name, department.location_type);
      const regionalBudgetData = getDepartmentRegionalBudgets(department.name, department.location_type);
      
      console.log('📊 Department budget data found:', departmentBudgetData);
      console.log('🗺️ Regional budget data found:', regionalBudgetData);
      
      let hasExistingData = false;
      
      // ✅ FIX: Better department budget handling
      if (departmentBudgetData?.allocated_budget) {
        const budgetAmount = departmentBudgetData.allocated_budget;
        setDepartmentBudget(budgetAmount);
        hasExistingData = true;
        console.log('💰 Set department budget to:', budgetAmount);
      } else {
        // ✅ FIX: Calculate department budget from regional budgets if no direct budget found
        const regionalBudgetValues = Object.values(regionalBudgetData);
        if (regionalBudgetValues.length > 0) {
          const calculatedTotal = regionalBudgetValues.reduce((sum, regionData) => {
            return sum + (regionData.allocated_budget || 0);
          }, 0);
          
          if (calculatedTotal > 0) {
            console.log('💡 Calculating department budget from regions:', calculatedTotal);
            setDepartmentBudget(calculatedTotal);
            hasExistingData = true;
          } else {
            setDepartmentBudget(0);
          }
        } else {
          setDepartmentBudget(0);
        }
      }
      
      // ✅ FIX: Better regional budget handling
      if (Object.keys(regionalBudgetData).length > 0) {
        const formattedRegionalBudgets = {};
        Object.entries(regionalBudgetData).forEach(([regionName, regionData]) => {
          const amount = regionData.allocated_budget || 0;
          formattedRegionalBudgets[regionName] = amount;
          if (amount > 0) hasExistingData = true;
        });
        setRegionalBudgets(formattedRegionalBudgets);
        console.log('🗺️ Set regional budgets:', formattedRegionalBudgets);
      } else {
        setRegionalBudgets({});
      }
      
      if (hasExistingData) {
        console.log('✅ Successfully loaded existing budget data for:', department.name);
      } else {
        console.log('📋 No previous budget allocations found for:', department.name);
      }
      
    } catch (err) {
      console.error('❌ Error loading existing budgets:', err);
      setError(`Error loading existing budgets: ${err.message}`);
    } finally {
      setLoadingExistingBudgets(false);
    }
  };

  // Handle department selection
  const handleDepartmentChange = async (e) => {
    const deptName = e.target.value;
    const dept = departments.find(d => d.name === deptName);
    
    console.log('🏢 Department changed to:', deptName, 'Department object:', dept);
    
    setSelectedDepartment(dept);
    setDepartmentBudget(0);
    setRegionalBudgets({});
    setError(null);
    setSuccess(null);
    
    if (dept) {
      await loadExistingBudgets(dept);
    }
  };

  // Get regions for selected department
  const departmentRegions = selectedDepartment?.regions || [];
  
  // Calculate total allocated regional budget
  const totalRegionalBudget = Object.values(regionalBudgets).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0);
  
  // Calculate remaining budget to allocate
  const remainingBudget = departmentBudget - totalRegionalBudget;

  // Handle department budget change
  const handleDepartmentBudgetChange = (e) => {
    const amount = parseFloat(e.target.value) || 0;
    console.log('💰 Department budget changed to:', amount);
    setDepartmentBudget(amount);
    
    if (amount < totalRegionalBudget) {
      console.log('⚠️ Department budget is less than regional total, clearing regional budgets');
      setRegionalBudgets({});
    }
  };

  // Handle regional budget change
  const handleRegionalBudgetChange = (regionName, value) => {
    console.log(`🗺️ Changing budget for region: "${regionName}", value: ${value}`);
    
    setRegionalBudgets(prev => {
      const newBudgets = {
        ...prev,
        [regionName]: value === '' ? 0 : parseFloat(value) || 0
      };
      console.log('🗺️ New regional budgets:', newBudgets);
      return newBudgets;
    });
  };

  // Auto-distribute remaining budget equally among regions
  const autoDistribute = () => {
    if (departmentRegions.length === 0 || remainingBudget <= 0) return;
    
    const equalAmount = Math.floor((remainingBudget / departmentRegions.length) * 100) / 100;
    const newRegionalBudgets = {};
    
    departmentRegions.forEach((region, index) => {
      const amount = index === 0 ? remainingBudget - (equalAmount * (departmentRegions.length - 1)) : equalAmount;
      const regionKey = typeof region === 'string' ? region : (region.name || `Region ${index + 1}`);
      newRegionalBudgets[regionKey] = (regionalBudgets[regionKey] || 0) + amount;
    });
    
    setRegionalBudgets(prev => ({
      ...prev,
      ...newRegionalBudgets
    }));
  };

  // Clear all regional allocations
  const clearAllocations = () => {
    setRegionalBudgets({});
  };

  // ✅ DATABASE INTEGRATION: Handle budget submission with direct API call
  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    
    // Validate user name is provided
    if (!userName.trim()) {
      setError('Please enter your name for audit tracking');
      return;
    }
    
    if (!selectedDepartment || departmentBudget <= 0) {
      setError('Please select a department and enter a valid budget amount');
      return;
    }

    // For departments with regions, validate regional allocations (unless partial allocation is allowed)
    if (departmentRegions.length > 0 && !allowPartialAllocation) {
      if (Math.abs(totalRegionalBudget - departmentBudget) > 0.01) {
        setError(`Regional budgets must total exactly €${departmentBudget.toLocaleString('de-DE')}. Currently allocated: €${totalRegionalBudget.toLocaleString('de-DE')}. Enable "Allow Partial Allocation" to save with unallocated budget.`);
        return;
      }
    }
    
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      console.log('💾 Setting budget for:', selectedDepartment.name, 'Type:', selectedDepartment.location_type);
      
      // ✅ FIX: Refresh to get latest data before saving
      console.log('🔄 Refreshing budget data before saving...');
      await refreshBudgetData();
      
      // Build complete payload
      console.log('📦 Building complete payload...');
      
      const allDepartments = {
        ...budgetData.departments,
        [`${selectedDepartment.name}|${selectedDepartment.location_type}`]: {
          allocated_budget: departmentBudget,
          location_type: selectedDepartment.location_type
        }
      };
      
      let allRegions = { ...budgetData.regions };
      
      if (departmentRegions.length > 0) {
        // Remove old regional entries for this department
        Object.keys(allRegions).forEach(regionKey => {
          if (regionKey.startsWith(`${selectedDepartment.name}|`)) {
            delete allRegions[regionKey];
            console.log('🗑️ Removed old region entry:', regionKey);
          }
        });
        
        // Add new regional entries
        departmentRegions.forEach((region, index) => {
          const regionName = typeof region === 'string' ? region : (region.name || `Region ${index + 1}`);
          const regionKey = `${selectedDepartment.name}|${regionName}|${selectedDepartment.location_type}`;
          allRegions[regionKey] = {
            allocated_budget: regionalBudgets[regionName] || 0,
            location_type: selectedDepartment.location_type
          };
          console.log('➕ Added region entry:', regionKey, allRegions[regionKey]);
        });
      }
      
      const requestPayload = {
        departments: allDepartments,
        regions: allRegions
      };
      
      console.log('📤 Complete payload:', {
        departmentCount: Object.keys(requestPayload.departments).length,
        regionCount: Object.keys(requestPayload.regions).length,
        departments: Object.keys(requestPayload.departments),
        currentDept: selectedDepartment.name,
        currentDeptBudget: departmentBudget
      });
      
      // Enhanced request with audit headers
      const auditHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-User-Name': userName.trim(),
        'X-Change-Reason': changeReason.trim() || `Budget allocation for ${selectedDepartment.name}`
      };
      
      const response = await fetch(`${normalizedApiUrl}/api/budget-allocation`, {
        method: 'POST',
        headers: auditHeaders,
        mode: 'cors',
        credentials: 'same-origin',
        body: JSON.stringify(requestPayload)
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Error response:', errorData);
        throw new Error(`Failed to set budget: ${response.status} ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log('✅ Budget setting successful:', responseData);
      
      // Enhanced success message with audit information
      let successMessage = '';
      if (departmentRegions.length === 0) {
        successMessage = `Budget of €${departmentBudget.toLocaleString('de-DE')} set for ${selectedDepartment.name} (${selectedDepartment.location_type})`;
      } else {
        successMessage = `Department Budget of €${departmentBudget.toLocaleString('de-DE')} allocated across ${departmentRegions.length} regions for ${selectedDepartment.name} (${selectedDepartment.location_type})`;
      }
      
      // Add audit information to success message
      if (responseData.change_id) {
        successMessage += `\n📋 Change ID: ${responseData.change_id}`;
      }
      if (responseData.audit_entries > 0) {
        successMessage += `\n📝 ${responseData.audit_entries} audit entries recorded`;
      }
      if (responseData.updated_by) {
        successMessage += `\n👤 Updated by: ${responseData.updated_by}`;
      }
      
      setSuccess(successMessage);
      
      // Reset form
      setSelectedDepartment(null);
      setDepartmentBudget(0);
      setRegionalBudgets({});
      setAllowPartialAllocation(false);
      setChangeReason(''); // Clear change reason
      
      if (onSuccess) {
        await onSuccess();
      }

      // ✅ FIX: Force refresh budget data for all components
      try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        await refreshBudgetData();
        console.log('🔄 Budget data refreshed for all components');
      } catch (refreshError) {
        console.log('Could not refresh budget data:', refreshError.message);
      }
      
    } catch (err) {
      console.error('❌ Budget setting error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="budget-summary">
      <h3>Budget Allocation</h3>
      
      {/* User Information Section */}
      <div style={{ 
        marginBottom: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '6px',
        border: '1px solid #dee2e6'
      }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>👤 User Information</h4>
        
        <div className="form-group" style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Your Name (for audit trail) *
          </label>
          <input
            type="text"
            value={userName}
            onChange={handleUserNameChange}
            placeholder="Enter your full name"
            required
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '14px'
            }}
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            This will be recorded in the audit trail for accountability
          </div>
        </div>
        
        <div className="form-group" style={{ marginBottom: '0' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Reason for Change (optional)
          </label>
          <input
            type="text"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder="e.g., Q2 budget increase, project approval, etc."
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '14px'
            }}
          />
        </div>
      </div>
      
      {/* ✅ FIX: Enhanced Debug Information */}
      {selectedDepartment && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#f0f0f0', 
          marginBottom: '15px',
          fontSize: '12px',
          borderRadius: '4px'
        }}>
          <div><strong>🔍 Enhanced Debug Info:</strong></div>
          <div>Department: {selectedDepartment.name}</div>
          <div>Type: {selectedDepartment.location_type}</div>
          <div>Regions Count: {departmentRegions.length}</div>
          <div>Regions: {JSON.stringify(departmentRegions)}</div>
          <div>Loading existing budgets: {loadingExistingBudgets ? 'Yes' : 'No'}</div>
          <div>Budget data loading: {budgetDataLoading ? 'Yes' : 'No'}</div>
          <div>Budget data loaded: {budgetData.departments ? Object.keys(budgetData.departments).length : 0} departments</div>
          <div style={{color: 'red', fontWeight: 'bold'}}>
            ⚠️ Current department budget: {departmentBudget} (This should match total regional if previously set)
          </div>
          <div>Regional budgets: {JSON.stringify(regionalBudgets)}</div>
          <div>Total regional budget: {totalRegionalBudget}</div>
          <div>Remaining budget: {remainingBudget}</div>
          <div>Expected key: {selectedDepartment.name}|{selectedDepartment.location_type}</div>
          <div>Available dept keys: {Object.keys(budgetData.departments).join(', ')}</div>
          <div>User name: {userName}</div>
          <div>Change reason: {changeReason}</div>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div style={{
          padding: '10px',
          marginBottom: '15px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          border: '1px solid #e57373',
          borderRadius: '4px'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      {/* Success Message */}
      {success && (
        <div style={{
          padding: '10px',
          marginBottom: '15px',
          backgroundColor: '#e8f5e8',
          color: '#2e7d32',
          border: '1px solid #81c784',
          borderRadius: '4px',
          whiteSpace: 'pre-line'
        }}>
          ✅ {success}
        </div>
      )}
      
      <form onSubmit={handleBudgetSubmit}>
        {/* Department Selection */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Department
          </label>
          <select
            value={selectedDepartment?.name || ''}
            onChange={handleDepartmentChange}
            required
            disabled={loading || budgetDataLoading}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '14px'
            }}
          >
            <option value="">Select Department</option>
            
            {/* HQ Departments Section */}
            {departments.filter(dept => dept.location_type === 'HQ').length > 0 && (
              <>
                <optgroup label="🏢 HQ Departments">
                  {departments
                    .filter(dept => dept.location_type === 'HQ')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(dept => (
                      <option key={dept.name} value={dept.name}>
                        {dept.name} {dept.regions?.length > 0 ? `(${dept.regions.length} regions)` : '(no regions)'}
                      </option>
                    ))
                  }
                </optgroup>
              </>
            )}
            
            {/* Floor Departments Section */}
            {departments.filter(dept => dept.location_type === 'Floor').length > 0 && (
              <>
                <optgroup label="🏭 Floor Departments">
                  {departments
                    .filter(dept => dept.location_type === 'Floor')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(dept => (
                      <option key={dept.name} value={dept.name}>
                        {dept.name} {dept.regions?.length > 0 ? `(${dept.regions.length} regions)` : '(no regions)'}
                      </option>
                    ))
                  }
                </optgroup>
              </>
            )}
            
            {/* Other/Unknown Departments Section */}
            {departments.filter(dept => dept.location_type !== 'HQ' && dept.location_type !== 'Floor').length > 0 && (
              <>
                <optgroup label="❓ Other Departments">
                  {departments
                    .filter(dept => dept.location_type !== 'HQ' && dept.location_type !== 'Floor')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(dept => (
                      <option key={dept.name} value={dept.name}>
                        {dept.name} ({dept.location_type}) {dept.regions?.length > 0 ? `- ${dept.regions.length} regions` : '- no regions'}
                      </option>
                    ))
                  }
                </optgroup>
              </>
            )}
          </select>
          
          {/* Helper text */}
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            🏢 HQ departments are centralized, 🏭 Floor departments are distributed across regions
          </div>
        </div>
        
        {/* Department Budget */}
        {selectedDepartment && (
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              {departmentRegions.length > 0 ? 'Total Department Budget' : 'Department Budget'} (€)
            </label>
            <input
              type="number"
              value={departmentBudget}
              onChange={handleDepartmentBudgetChange}
              step="0.01"
              min="0"
              required
              disabled={loading || loadingExistingBudgets || budgetDataLoading}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px'
              }}
              placeholder={
                budgetDataLoading ? "Loading budget data..." :
                loadingExistingBudgets ? "Loading existing budget..." : 
                "Enter total budget amount"
              }
            />
            {departmentRegions.length > 0 && (
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                This amount will be allocated across {departmentRegions.length} regions
              </div>
            )}
          </div>
        )}

        {/* Partial Allocation Option for departments with regions */}
        {selectedDepartment && departmentRegions.length > 0 && departmentBudget > 0 && (
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              fontSize: '14px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={allowPartialAllocation}
                onChange={(e) => setAllowPartialAllocation(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Allow Partial Allocation (keep unallocated budget as buffer)
            </label>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', marginLeft: '24px' }}>
              Check this to save budget without allocating the full amount to regions
            </div>
          </div>
        )}

        {/* Regional Budget Allocation (for departments with regions) */}
        {selectedDepartment && departmentRegions.length > 0 && departmentBudget > 0 && (
          <div style={{ 
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #dee2e6'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h4 style={{ margin: 0 }}>Regional Budget Allocation</h4>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={autoDistribute}
                  disabled={loading || remainingBudget <= 0}
                  style={{
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Auto-Distribute
                </button>
                <button
                  type="button"
                  onClick={clearAllocations}
                  disabled={loading}
                  style={{
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Budget Summary */}
            <div style={{ 
              marginBottom: '15px',
              padding: '10px',
              backgroundColor: remainingBudget === 0 ? '#d4edda' : remainingBudget < 0 ? '#f8d7da' : '#fff3cd',
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              <div><strong>Total Budget:</strong> €{departmentBudget.toLocaleString('de-DE')}</div>
              <div><strong>Allocated:</strong> €{totalRegionalBudget.toLocaleString('de-DE')}</div>
              <div><strong>Remaining:</strong> €{remainingBudget.toLocaleString('de-DE')}</div>
            </div>

            {/* Regional Budget Inputs */}
            {departmentRegions.map((region, index) => {
              const regionName = typeof region === 'string' ? region : (region.name || `Region ${index + 1}`);
              const regionDisplayName = regionName;
              
              return (
                <div key={`region-${index}-${regionName}`} style={{ 
                  marginBottom: '15px',
                  padding: '10px',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #dee2e6'
                }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#495057'
                  }}>
                    {regionDisplayName}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      value={regionalBudgets[regionName] || ''}
                      onChange={(e) => handleRegionalBudgetChange(regionName, e.target.value)}
                      step="0.01"
                      min="0"
                      max={departmentBudget}
                      disabled={loading || loadingExistingBudgets || budgetDataLoading}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ddd',
                        fontSize: '14px'
                      }}
                    />
                    <span style={{ fontSize: '14px', color: '#666', minWidth: '20px' }}>€</span>
                  </div>
                  {regionalBudgets[regionName] > 0 && (
                    <div style={{ fontSize: '12px', color: '#28a745', marginTop: '4px' }}>
                      ✓ €{parseFloat(regionalBudgets[regionName]).toLocaleString('de-DE')} allocated
                    </div>
                  )}
                  {/* Debug info for this region */}
                  <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                    Debug: Key="{regionName}", Value={regionalBudgets[regionName] || 'undefined'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Submit Button */}
        <button 
          type="submit" 
          className="assign-button" 
          disabled={
            loading || 
            loadingExistingBudgets ||
            budgetDataLoading ||
            !selectedDepartment || 
            departmentBudget <= 0 ||
            !userName.trim() ||
            (departmentRegions.length > 0 && !allowPartialAllocation && Math.abs(totalRegionalBudget - departmentBudget) > 0.01)
          }
          style={{
            opacity: (
              loading || 
              loadingExistingBudgets ||
              budgetDataLoading ||
              !selectedDepartment || 
              departmentBudget <= 0 ||
              !userName.trim() ||
              (departmentRegions.length > 0 && !allowPartialAllocation && Math.abs(totalRegionalBudget - departmentBudget) > 0.01)
            ) ? 0.6 : 1,
            width: '100%'
          }}
        >
          {loading ? 'Setting Budget...' : 
           budgetDataLoading ? 'Loading Budget Data...' :
           loadingExistingBudgets ? 'Loading Existing Budgets...' :
           !userName.trim() ? 'Enter Your Name First' :
           departmentRegions.length === 0 ? 'Set Department Budget' : 
           allowPartialAllocation ? 'Set Budget (Partial Allocation)' :
           `Set Budget (${Math.abs(totalRegionalBudget - departmentBudget) < 0.01 ? '✅ Ready' : '⚠️ Check Allocation'})`}
        </button>
      </form>
    </div>
  );
};

export default BudgetAllocationForm;