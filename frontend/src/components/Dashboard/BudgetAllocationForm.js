import React, { useState } from 'react';
import { useBudget } from '../../hooks/useBudget';

/**
 * Enhanced component for budget allocation with regional distribution for all department types
 * @param {Object} props - Component props
 * @param {Array} props.departments - Array of department data
 * @param {string} props.baseApiUrl - Base API URL
 * @param {Function} props.onSuccess - Success callback function
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

  // Get budget data and functions from the hook - NOW WITH REFRESH!
  const { 
    budgetData, 
    loadBudgetData, 
    refreshBudgetData, // ✅ NEW: Get the refresh function
    getDepartmentBudget, 
    getDepartmentRegionalBudgets,
    loading: budgetHookLoading 
  } = useBudget(baseApiUrl);

  // Load existing budget data using the hook's functions
  const loadExistingBudgets = async (department) => { // ✅ MADE ASYNC
    if (!department) return;
    
    console.log('🔄 Loading existing budgets for:', department.name);
    setLoadingExistingBudgets(true);
    
    try {
      // ✅ NEW: Refresh budget data first to get latest
      await refreshBudgetData();
      
      // Use hook functions to get budget data
      const departmentBudgetData = getDepartmentBudget(department.name);
      const regionalBudgetData = getDepartmentRegionalBudgets(department.name);
      
      console.log('📊 Department budget data:', departmentBudgetData);
      console.log('🗺️ Regional budget data:', regionalBudgetData);
      
      let hasExistingData = false;
      
      // Set department budget if it exists
      if (departmentBudgetData?.allocated_budget) {
        setDepartmentBudget(departmentBudgetData.allocated_budget);
        hasExistingData = true;
        console.log('💰 Set department budget:', departmentBudgetData.allocated_budget);
      } else {
        setDepartmentBudget(0); // ✅ RESET if no budget found
      }
      
      // Set regional budgets if they exist
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
        setRegionalBudgets({}); // ✅ RESET if no regional budgets found
      }
      
      if (hasExistingData) {
        console.log('✅ Successfully loaded existing budget data for:', department.name);
      } else {
        console.log('📋 No previous budget allocations found for:', department.name);
      }
      
    } catch (err) {
      console.error('❌ Error loading existing budgets:', err);
    } finally {
      setLoadingExistingBudgets(false);
    }
  };

  // Handle department selection
  const handleDepartmentChange = async (e) => {
    const deptName = e.target.value;
    const dept = departments.find(d => d.name === deptName);
    
    console.log('🏢 Department changed to:', deptName);
    
    setSelectedDepartment(dept);
    setDepartmentBudget(0);
    setRegionalBudgets({});
    setError(null);
    setSuccess(null);
    
    if (dept) {
      // ✅ SIMPLIFIED: Always load existing budgets (refresh is now inside loadExistingBudgets)
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
    setDepartmentBudget(amount);
    
    // Reset regional budgets if new amount is less than currently allocated
    if (amount < totalRegionalBudget) {
      setRegionalBudgets({});
    }
  };

  // Handle regional budget change
  const handleRegionalBudgetChange = (regionName, value) => {
    console.log(`Changing budget for region: "${regionName}", value: ${value}`);
    
    setRegionalBudgets(prev => {
      const newBudgets = {
        ...prev,
        [regionName]: value === '' ? 0 : parseFloat(value) || 0
      };
      console.log('New regional budgets:', newBudgets);
      return newBudgets;
    });
  };

  // Auto-distribute remaining budget equally among regions
  const autoDistribute = () => {
    if (departmentRegions.length === 0 || remainingBudget <= 0) return;
    
    const equalAmount = Math.floor((remainingBudget / departmentRegions.length) * 100) / 100;
    const newRegionalBudgets = {};
    
    departmentRegions.forEach((region, index) => {
      // Give any remainder to the first region
      const amount = index === 0 ? remainingBudget - (equalAmount * (departmentRegions.length - 1)) : equalAmount;
      // Handle string array format (your actual data structure)
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

  // Handle budget submission
  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    
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
      
      console.log('Setting budget for:', selectedDepartment.name, 'Type:', selectedDepartment.location_type);
      
      // *** STEP 1: REFRESH TO GET LATEST DATA ***
      console.log('🔄 Refreshing budget data before saving...');
      await refreshBudgetData(); // ✅ NEW: Use refresh instead of manual fetch
      
      // *** STEP 2: CREATE COMPLETE PAYLOAD WITH ALL DATA ***
      console.log('📦 Building complete payload...');
      
      // Start with existing departments and add/update current department
      const allDepartments = {
        ...budgetData.departments, // Use refreshed data
        [selectedDepartment.name]: {
          allocated_budget: departmentBudget,
          location_type: selectedDepartment.location_type
        }
      };
      
      // Start with existing regions
      let allRegions = { ...budgetData.regions }; // Use refreshed data
      
      // For departments with regions, update regional budgets
      if (departmentRegions.length > 0) {
        // First, remove old regional entries for this department
        Object.keys(allRegions).forEach(regionKey => {
          if (regionKey.startsWith(selectedDepartment.name + '|')) {
            delete allRegions[regionKey];
            console.log('🗑️ Removed old region entry:', regionKey);
          }
        });
        
        // Then add new regional entries
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
      
      // Create the complete request payload
      const requestPayload = {
        departments: allDepartments,
        regions: allRegions
      };
      
      console.log('📤 Complete payload:', {
        departmentCount: Object.keys(requestPayload.departments).length,
        regionCount: Object.keys(requestPayload.regions).length,
        departments: Object.keys(requestPayload.departments),
        currentDept: selectedDepartment.name
      });
      
      // *** STEP 3: SEND THE COMPLETE DATA TO BACKEND ***
      const response = await fetch(`${normalizedApiUrl}/api/budget-allocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
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
      
      // Show success message based on whether department has regions
      if (departmentRegions.length === 0) {
        setSuccess(`Budget of €${departmentBudget.toLocaleString('de-DE')} set for ${selectedDepartment.name} (${selectedDepartment.location_type})`);
      } else {
        setSuccess(`Department Budget of €${departmentBudget.toLocaleString('de-DE')} allocated across ${departmentRegions.length} regions for ${selectedDepartment.name} (${selectedDepartment.location_type})`);
      }
      
      // Reset form
      setSelectedDepartment(null);
      setDepartmentBudget(0);
      setRegionalBudgets({});
      setAllowPartialAllocation(false);
      
      if (onSuccess) {
        await onSuccess();
      }

      // ✅ ENHANCED: Refresh budget data for all components
      try {
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
      
      {/* Debug Information - Remove in production */}
      {selectedDepartment && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#f0f0f0', 
          marginBottom: '15px',
          fontSize: '12px',
          borderRadius: '4px'
        }}>
          <div><strong>Debug Info:</strong></div>
          <div>Department: {selectedDepartment.name}</div>
          <div>Type: {selectedDepartment.location_type}</div>
          <div>Regions Count: {departmentRegions.length}</div>
          <div>Regions: {JSON.stringify(departmentRegions)}</div>
          <div>Loading existing budgets: {loadingExistingBudgets ? 'Yes' : 'No'}</div>
          <div>Budget hook loading: {budgetHookLoading ? 'Yes' : 'No'}</div>
          <div>Budget data loaded: {budgetData.departments ? Object.keys(budgetData.departments).length : 0} departments</div>
          <div>Current department budget: {departmentBudget}</div> {/* ✅ NEW DEBUG INFO */}
          <div>Regional budgets: {JSON.stringify(regionalBudgets)}</div> {/* ✅ NEW DEBUG INFO */}
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
          borderRadius: '4px'
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
            disabled={loading || budgetHookLoading}
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
              disabled={loading || loadingExistingBudgets || budgetHookLoading}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '14px'
              }}
              placeholder={
                budgetHookLoading ? "Loading budget data..." :
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
              // Handle string array format (your actual data structure)
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
                      disabled={loading || loadingExistingBudgets || budgetHookLoading}
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
            budgetHookLoading ||
            !selectedDepartment || 
            departmentBudget <= 0 ||
            (departmentRegions.length > 0 && !allowPartialAllocation && Math.abs(totalRegionalBudget - departmentBudget) > 0.01)
          }
          style={{
            opacity: (
              loading || 
              loadingExistingBudgets ||
              budgetHookLoading ||
              !selectedDepartment || 
              departmentBudget <= 0 ||
              (departmentRegions.length > 0 && !allowPartialAllocation && Math.abs(totalRegionalBudget - departmentBudget) > 0.01)
            ) ? 0.6 : 1,
            width: '100%'
          }}
        >
          {loading ? 'Setting Budget...' : 
           budgetHookLoading ? 'Loading Budget Data...' :
           loadingExistingBudgets ? 'Loading Existing Budgets...' :
           departmentRegions.length === 0 ? 'Set Department Budget' : 
           allowPartialAllocation ? 'Set Budget (Partial Allocation)' :
           `Set Budget (${Math.abs(totalRegionalBudget - departmentBudget) < 0.01 ? '✓ Ready' : '⚠️ Check Allocation'})`}
        </button>
      </form>
    </div>
  );
};

export default BudgetAllocationForm;