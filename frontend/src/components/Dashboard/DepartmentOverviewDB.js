import React, { useState, useEffect, useCallback } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import DatabaseAPITester from './DatabaseAPITester';

// Custom XAxis tick component for wrapped text
const CustomXAxisTick = ({ x, y, payload }) => {
  if (!payload?.value) return null;
  
  // Split long department names into multiple lines
  const maxLineLength = 12; // Characters per line
  const words = payload.value.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    if ((currentLine + ' ' + word).length <= maxLineLength) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  
  // Limit to 3 lines max
  if (lines.length > 3) {
    lines[2] = lines[2] + '...';
    lines.splice(3);
  }
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} textAnchor="middle" fill="#666" fontSize="11">
        {lines.map((line, index) => (
          <tspan 
            key={index}
            x={0} 
            dy={index === 0 ? 16 : 14}
            textAnchor="middle"
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

/**
 * Enhanced Department Overview with budget allocation data and integrated API testing
 * Database-integrated version (replaces blob storage hooks with direct API calls)
 * @param {Object} props
 * @param {Array} props.departments - Array of department data
 * @param {Function} props.onDepartmentClick - Handler for department selection
 * @param {string} props.baseApiUrl - Base API URL for budget data fetching
 */
const DepartmentOverview = ({ departments, onDepartmentClick, baseApiUrl }) => {
  // ✅ DATABASE INTEGRATION: Replace hook with state management
  const [budgetData, setBudgetData] = useState({ departments: {}, regions: {} });
  const [budgetDataLoading, setBudgetDataLoading] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // ✅ DATABASE INTEGRATION: Direct API call to fetch budget data with enhanced cache busting
  const fetchBudgetData = useCallback(async (showLoading = true) => {
    if (!baseApiUrl) return;
    
    try {
      if (showLoading) setBudgetDataLoading(true);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
        
      const response = await fetch(`${normalizedApiUrl}/api/budget-allocation`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // ✅ FIX: Enhanced cache-busting headers to ensure fresh data
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
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
      
      // Track when we fetched the data
      setLastFetchTime(new Date());
      
      console.log('✅ DepartmentOverview: Fresh budget data fetched from database:', {
        departments: Object.keys(data.departments || {}).length,
        regions: Object.keys(data.regions || {}).length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ DepartmentOverview: Error fetching budget data:', error);
      setBudgetData({ departments: {}, regions: {} });
    } finally {
      if (showLoading) setBudgetDataLoading(false);
    }
  }, [baseApiUrl]);

  // ✅ Manual refresh function
  const refreshBudgetData = useCallback(() => {
    console.log('🔄 Manual refresh triggered for budget data');
    fetchBudgetData(true);
  }, [fetchBudgetData]);

  // ✅ FIX: Enhanced department budget lookup with better debugging (same as BudgetAllocationForm)
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

  // ✅ FIX: Enhanced regional budgets lookup (same as BudgetAllocationForm)
  const getDepartmentRegionalBudgets = useCallback((departmentName, locationType) => {
    if (!departmentName || !budgetData.regions) return {};
    
    console.log('🔍 DEBUG getDepartmentRegionalBudgets:', {
      departmentName,
      locationType,
      availableRegionKeys: Object.keys(budgetData.regions)
    });
    
    const regionalBudgets = {};
    let totalRegionalBudget = 0;
    
    Object.entries(budgetData.regions).forEach(([regionKey, regionData]) => {
      // Try exact match first
      if (regionKey.startsWith(`${departmentName}|`)) {
        const parts = regionKey.split('|');
        if (parts.length >= 2) {
          const regionName = parts[1];
          const regionBudget = regionData.allocated_budget || 0;
          regionalBudgets[regionName] = regionData;
          totalRegionalBudget += regionBudget;
          console.log('✅ Found regional budget:', regionName, regionBudget);
        }
      }
    });
    
    console.log('📊 Final regional budgets total:', totalRegionalBudget);
    return { regionalBudgets, totalRegionalBudget };
  }, [budgetData.regions]);

  // ✅ FIX: Load budget data on component mount and when departments change
  useEffect(() => {
    console.log('🔄 DepartmentOverview: Initial fetch or baseApiUrl changed');
    fetchBudgetData();
  }, [fetchBudgetData]);

  // ✅ FIX: Force refresh when departments prop changes (indicates new data)
  useEffect(() => {
    if (departments && departments.length > 0) {
      console.log('🔄 DepartmentOverview: Departments data changed, refreshing budget data...');
      // Force refresh with a small delay to ensure any backend updates are processed
      setTimeout(() => {
        fetchBudgetData(false);
      }, 100);
    }
  }, [departments, fetchBudgetData]);

  // ✅ FIX: Add interval-based refresh for the overview (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 DepartmentOverview: Auto-refresh (30s interval)');
      fetchBudgetData(false); // Don't show loading for auto-refresh
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchBudgetData]);

  // Handle case where departments prop might be undefined
  const safeDepartments = departments || [];

  // ✅ FIX: Enhanced department grouping with fresh budget data
  const groupedDepartments = safeDepartments.reduce((acc, dept) => {
    const group = dept.location_type || 'Other';
    if (!acc[group]) acc[group] = [];
    
    // ✅ FIX: Get fresh budget allocation using enhanced lookup
    const deptBudget = getDepartmentBudget(dept.name, dept.location_type);
    const { regionalBudgets, totalRegionalBudget } = getDepartmentRegionalBudgets(dept.name, dept.location_type);
    
    // ✅ FIX: Calculate allocated budget with fallback logic
    let allocatedBudget = 0;
    
    // Try department budget first
    if (deptBudget?.allocated_budget) {
      allocatedBudget = deptBudget.allocated_budget;
      console.log(`💰 Using department budget for ${dept.name}:`, allocatedBudget);
    } 
    // Fall back to sum of regional budgets
    else if (totalRegionalBudget > 0) {
      allocatedBudget = totalRegionalBudget;
      console.log(`💡 Using regional budget total for ${dept.name}:`, allocatedBudget);
    }
    // Last resort: use 0
    else {
      allocatedBudget = 0;
      console.log(`❌ No budget found for ${dept.name}`);
    }
    
    acc[group].push({
      ...dept,
      allocated_budget: allocatedBudget,
      // Calculate usage percentage
      usage_percentage: allocatedBudget > 0 ? ((dept.total_amount || 0) / allocatedBudget) * 100 : 0,
      // Add debug info
      _budgetDebug: {
        departmentBudget: deptBudget?.allocated_budget || 0,
        regionalTotal: totalRegionalBudget,
        finalAllocated: allocatedBudget,
        usedAmount: dept.total_amount || 0
      }
    });
    return acc;
  }, {});

  // Custom tooltip with comprehensive information
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const remaining = (data.allocated_budget || 0) - (data.total || 0);
      
      return (
        <div style={{
          backgroundColor: 'white',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
          minWidth: '250px'
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '14px' }}>{data.fullName}</p>
          
          {data.allocated_budget > 0 && (
            <p style={{ margin: '4px 0', color: '#107c10', fontSize: '13px' }}>
              🎯 Allocated: {formatCurrency(data.allocated_budget)}
            </p>
          )}
          
          <p style={{ margin: '4px 0', color: '#dc3545', fontSize: '13px' }}>
            🔴 Booked: {formatCurrency(data.booked)}
          </p>
          <p style={{ margin: '4px 0', color: '#ffc107', fontSize: '13px' }}>
            🟡 Reserved: {formatCurrency(data.reserved)}
          </p>
          <p style={{ margin: '4px 0', fontWeight: 'bold', fontSize: '13px' }}>
            📊 Total Used: {formatCurrency(data.total)}
          </p>
          
          {data.allocated_budget > 0 && (
            <>
              <p style={{ margin: '4px 0', color: remaining >= 0 ? '#107c10' : '#a4262c', fontSize: '13px' }}>
                💰 Remaining: {formatCurrency(remaining)}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
                📈 Usage: {data.usage_percentage.toFixed(1)}%
              </p>
            </>
          )}
          
          {/* ✅ FIX: Add debug info to tooltip */}
          {data._budgetDebug && (
            <div style={{ marginTop: '8px', padding: '4px', backgroundColor: '#f8f9fa', fontSize: '10px', borderRadius: '2px' }}>
              <div><strong>Debug:</strong></div>
              <div>Dept Budget: €{data._budgetDebug.departmentBudget.toLocaleString()}</div>
              <div>Regional Total: €{data._budgetDebug.regionalTotal.toLocaleString()}</div>
              <div>Final Used: €{data._budgetDebug.finalAllocated.toLocaleString()}</div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="budget-summary" style={{ maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0 }}>Department Budget Overview</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* ✅ DATABASE INTEGRATION: Loading indicator */}
          {budgetDataLoading && (
            <div style={{ 
              fontSize: '12px', 
              color: '#0078d4',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              🔄 Loading budget data...
            </div>
          )}
          
          {/* ✅ Manual refresh button */}
          <button 
            onClick={refreshBudgetData}
            disabled={budgetDataLoading}
            style={{ 
              padding: '8px 12px', 
              fontSize: '12px', 
              backgroundColor: budgetDataLoading ? '#ccc' : '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: budgetDataLoading ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            🔄 Refresh Budget Data
          </button>
          
          {/* Database API Test Button */}
          <button 
            onClick={() => setShowTest(!showTest)}
            style={{ 
              padding: '8px 12px', 
              fontSize: '12px', 
              backgroundColor: showTest ? '#dc3545' : '#0078d4', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {showTest ? '❌ Hide Database Test' : '🗄️ Test Database API'}
          </button>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Click on any department to view details
          </div>
        </div>
      </div>

      {/* ✅ FIX: Enhanced budget data source info with fresh data timestamp */}
      {!budgetDataLoading && (
        <div style={{
          marginBottom: '16px',
          padding: '8px 12px',
          backgroundColor: '#f0f8ff',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#0066cc',
          border: '1px solid #b3d9ff'
        }}>
          📊 Fresh budget data loaded from database • {Object.keys(budgetData.departments).length} department budgets, {Object.keys(budgetData.regions).length} regional budgets • 
          {lastFetchTime && (
            <span> Last updated: {lastFetchTime.toLocaleTimeString()} • </span>
          )}
          API: {baseApiUrl || 'Not configured'} • Auto-refresh: ON (30s)
        </div>
      )}

      {/* Integrated DatabaseAPITester Component */}
      {showTest && (
        <div style={{ 
          marginBottom: '24px',
          padding: '20px', 
          backgroundColor: '#f8f9fa', 
          border: '2px solid #0078d4', 
          borderRadius: '8px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid #dee2e6'
          }}>
            <span style={{ fontSize: '24px' }}>🗄️</span>
            <div>
              <h4 style={{ margin: 0, color: '#0078d4', fontSize: '18px' }}>
                Database API Testing Panel
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                Compare database API responses with current dashboard data • API URL: {baseApiUrl || 'Not configured'}
              </p>
            </div>
          </div>
          
          {/* Pass the same baseApiUrl for consistency */}
          <DatabaseAPITester defaultApiUrl={baseApiUrl} />
        </div>
      )}

      {Object.entries(groupedDepartments).map(([locationType, depts]) => {
        const chartData = depts.map(dept => ({
          name: dept.name, // Use full name, let CustomXAxisTick handle wrapping
          fullName: dept.name, // Keep full name for tooltip
          booked: dept.booked_amount || 0,
          reserved: dept.reserved_amount || 0,
          total: dept.total_amount || 0,
          allocated_budget: dept.allocated_budget || 0, // ✅ FIX: Now uses fresh budget data
          usage_percentage: dept.usage_percentage || 0,
          originalDept: dept, // Reference to original department data
          _budgetDebug: dept._budgetDebug // ✅ FIX: Pass debug info to chart
        }));

        // ✅ FIX: Calculate totals using fresh budget data
        const locationTotals = chartData.reduce((acc, dept) => ({
          booked: acc.booked + dept.booked,
          reserved: acc.reserved + dept.reserved,
          total: acc.total + dept.total,
          allocated: acc.allocated + dept.allocated_budget // ✅ FIX: Now includes fresh allocated budgets
        }), { booked: 0, reserved: 0, total: 0, allocated: 0 });

        const locationUsage = locationTotals.allocated > 0 ? 
          (locationTotals.total / locationTotals.allocated) * 100 : 0;

        return (
          <div key={locationType} style={{ marginBottom: '50px' }}>
            {/* ✅ FIX: Enhanced Location Header with fresh budget totals */}
            <div style={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #edebe9',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <h4 style={{ margin: 0, color: '#0078d4', fontSize: '18px' }}>
                  📍 {locationType}
                </h4>
                
                {/* ✅ FIX: Enhanced Location Summary with fresh data */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                  gap: '15px',
                  minWidth: '500px'
                }}>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>ALLOCATED</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#107c10' }}>
                      {formatCurrency(locationTotals.allocated)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>BOOKED</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc3545' }}>
                      {formatCurrency(locationTotals.booked)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>RESERVED</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffc107' }}>
                      {formatCurrency(locationTotals.reserved)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>USAGE</div>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 'bold', 
                      color: locationUsage > 100 ? '#a4262c' : locationUsage > 85 ? '#ff8c00' : '#107c10'
                    }}>
                      {locationUsage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ FIX: Chart with fresh budget data */}
            <div style={{ 
              background: '#ffffff',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #edebe9',
              marginBottom: '20px',
              overflowX: 'auto'
            }}>
              <div style={{
                minWidth: `${Math.max(chartData.length * 150, 800)}px`, // Wider spacing per department
                width: '100%',
                height: '450px' // Taller for multi-line labels
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 40, bottom: 120 }} // More bottom space for wrapped labels
                    onClick={(data) => {
                      if (data && data.activePayload && onDepartmentClick) {
                        onDepartmentClick(data.activePayload[0].payload.originalDept);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#edebe9" />
                    <XAxis
                      dataKey="name"
                      interval={0} // Show all labels
                      height={100} // More height for multi-line labels
                      tick={<CustomXAxisTick />} // Use custom tick component
                    />
                    <YAxis 
                      tickFormatter={(value) => {
                        // Compact formatting for Y-axis
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}k€`;
                        return `${value.toFixed(0)}€`;
                      }}
                      fontSize={11}
                      tick={{ fill: '#323130' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="rect"
                    />
                    
                    {/* ✅ FIX: Budget allocation bar with fresh data */}
                    <Bar 
                      dataKey="allocated_budget" 
                      name="Allocated Budget" 
                      fill="rgba(16, 124, 16, 0.2)"
                      stroke="#107c10"
                      strokeWidth={2}
                    />
                    
                    {/* Main data bars */}
                    <Bar dataKey="booked" name="Booked Amount" fill="#dc3545" />
                    <Bar dataKey="reserved" name="Reserved Amount" fill="#ffc107" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ✅ FIX: Enhanced Table with fresh budget data */}
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #edebe9',
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #f3f2f1 100%)',
                padding: '15px',
                fontWeight: 'bold'
              }}>
                <div>Department</div>
                <div>Allocated Budget</div>
                <div>Booked Amount</div>
                <div>Reserved Amount</div>
                <div>Total Used</div>
                <div>Usage %</div>
              </div>

              {depts.map(dept => {
                return (
                  <div
                    key={dept.name}
                    onClick={() => onDepartmentClick && onDepartmentClick(dept)}
                    style={{ 
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                      padding: '15px',
                      transition: 'all 0.2s ease',
                      borderBottom: '1px solid #edebe9'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.05)';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ fontWeight: '500' }} title={dept.name}>
                      {dept.name}
                    </div>
                    {/* ✅ FIX: Show fresh allocated budget */}
                    {/* ✅ FIX: Show fresh allocated budget */}
                    <div style={{ 
                      color: dept.allocated_budget > 0 ? '#107c10' : '#999',
                      fontWeight: dept.allocated_budget > 0 ? 'bold' : 'normal'
                    }}>
                      {dept.allocated_budget > 0 ? formatCurrency(dept.allocated_budget) : 'Not Set'}
                    </div>
                    <div style={{ color: '#dc3545', fontWeight: 'bold' }}>
                      {formatCurrency(dept.booked_amount || 0)}
                    </div>
                    <div style={{ color: '#ffc107', fontWeight: 'bold' }}>
                      {formatCurrency(dept.reserved_amount || 0)}
                    </div>
                    <div style={{ fontWeight: 'bold' }}>
                      {formatCurrency(dept.total_amount || 0)}
                    </div>
                    <div style={{ 
                      fontWeight: 'bold',
                      color: dept.usage_percentage > 100 ? '#a4262c' : 
                             dept.usage_percentage > 85 ? '#ff8c00' : '#107c10'
                    }}>
                      {dept.allocated_budget > 0 ? `${dept.usage_percentage.toFixed(1)}%` : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DepartmentOverview;