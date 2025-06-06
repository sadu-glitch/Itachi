import React, { useMemo } from 'react';
import { useBudgetProgress } from '../../hooks/useBudget';
import '../../styles/DepartmentDetail.css';
import ParkedMeasuresSection from './ParkedMeasuresSection';
import { formatCurrency } from '../../utils/formatters';

// Separate component for department budget overview
const DepartmentBudgetOverview = ({ 
  departmentBudget, 
  departmentProgress, 
  budgetLoading, 
  enhancedRegions 
}) => {
  // Calculate department totals from all regions
  const departmentTotals = useMemo(() => {
    if (!enhancedRegions || !enhancedRegions.length) {
      return null;
    }

    const totals = enhancedRegions.reduce((acc, region) => {
      acc.allocated += region.calculatedAmounts.allocated || 0;
      acc.booked += region.calculatedAmounts.booked || 0;
      acc.reserved += region.calculatedAmounts.reserved || 0;
      return acc;
    }, { allocated: 0, booked: 0, reserved: 0 });

    totals.total = totals.booked + totals.reserved;
    totals.remaining = totals.allocated - totals.total;
    
    // Calculate percentages for progress bar
    if (totals.allocated > 0) {
      totals.bookedPercentage = (totals.booked / totals.allocated) * 100;
      totals.reservedPercentage = (totals.reserved / totals.allocated) * 100;
      totals.remainingPercentage = Math.max(0, (totals.remaining / totals.allocated) * 100);
      totals.usagePercentage = (totals.total / totals.allocated) * 100;
    } else {
      totals.bookedPercentage = 0;
      totals.reservedPercentage = 0;
      totals.remainingPercentage = 0;
      totals.usagePercentage = 0;
    }

    return totals;
  }, [enhancedRegions]);

  // Only show "no budget" if BOTH departmentBudget AND departmentProgress are missing
  if (!departmentBudget && !departmentProgress && !departmentTotals && !budgetLoading) {
    return (
      <div className="budget-alert">
        ⚠️ No budget has been allocated for this department yet.
      </div>
    );
  }

  if (budgetLoading) {
    return (
      <div className="budget-overview">
        <h4>Loading budget data...</h4>
      </div>
    );
  }

  // Use department totals if available, otherwise fall back to departmentProgress
  const displayData = departmentTotals || departmentProgress;

  return (
    <div className="budget-overview">
      <h4>
        {departmentBudget?.location_type === 'HQ' ? 'HQ Budget' : 'Department Budget'} Overview
      </h4>
      
      {displayData ? (
        <>
          <div className="budget-stats-grid">
            <div className="budget-stat">
              <span className="budget-stat-label">Allocated</span>
              <span className="budget-stat-value allocated">
                {formatCurrency(displayData.allocated)}
              </span>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Booked</span>
              <span className="budget-stat-value spent">
                {formatCurrency(displayData.booked || displayData.spent || 0)}
              </span>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Reserved</span>
              <span className="budget-stat-value" style={{ color: '#ffc107', fontWeight: 'bold' }}>
                {formatCurrency(displayData.reserved || 0)}
              </span>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Remaining</span>
              <span className={`budget-stat-value ${displayData.remaining >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(displayData.remaining)}
              </span>
            </div>
            <div className="budget-stat">
              <span className="budget-stat-label">Usage</span>
              <span className={`budget-stat-value ${
                displayData.usagePercentage > 100 ? 'over' : 
                displayData.usagePercentage > 85 ? 'warning' : 'good'
              }`}>
                {(displayData.usagePercentage || displayData.percentage || 0).toFixed(1)}%
              </span>
            </div>
          </div>
          
          {/* Enhanced Progress Barrr */}
          <div className="budget-progress-container">
            <div className={`budget-progress-bar ${displayData.usagePercentage > 100 ? 'over-allocated' : ''}`}>
              <div className="budget-progress-segments">
                {/* Booked segment */}
                <div 
                  className="budget-segment booked"
                  style={{ width: `${Math.min(displayData.bookedPercentage || 0, 100)}%` }}
                  data-label={`Booked: ${formatCurrency(displayData.booked || displayData.spent || 0)}`}
                />
                
                {/* Reserved segment */}
                <div 
                  className="budget-segment reserved"
                  style={{ width: `${Math.min(displayData.reservedPercentage || 0, 100 - (displayData.bookedPercentage || 0))}%` }}
                  data-label={`Reserved: ${formatCurrency(displayData.reserved || 0)}`}
                />
                
                {/* Remaining segment */}
                {displayData.remainingPercentage > 0 && (
                  <div 
                    className="budget-segment remaining"
                    style={{ width: `${displayData.remainingPercentage}%` }}
                    data-label={`Remaining: ${formatCurrency(displayData.remaining)}`}
                  />
                )}
              </div>
            </div>
            
            {/* Legend */}
            <div className="budget-progress-legend">
              <div className="budget-legend-item">
                <div className="budget-legend-color booked"></div>
                <span>Booked ({formatCurrency(displayData.booked || displayData.spent || 0)})</span>
              </div>
              <div className="budget-legend-item">
                <div className="budget-legend-color reserved"></div>
                <span>Reserved ({formatCurrency(displayData.reserved || 0)})</span>
              </div>
              <div className="budget-legend-item">
                <div className="budget-legend-color remaining"></div>
                <span>Remaining ({formatCurrency(displayData.remaining)})</span>
              </div>
            </div>
          </div>
        </>
      ) : departmentBudget ? (
        <div className="budget-simple">
          Budget: {formatCurrency(departmentBudget.allocated_budget)}
        </div>
      ) : (
        <div className="budget-simple">
          Budget data available at regional level
        </div>
      )}
    </div>
  );
};

// Separate component for regional budget summary
const RegionalBudgetSummary = ({ regionalProgress }) => {
  if (!regionalProgress.length) return null;

  return (
    <div className="regional-budget-summary">
      <h4>Regional Budget Summary</h4>
      <div className="regional-cards-grid">
        {regionalProgress.map(regionProg => (
          <div key={regionProg.region} className="regional-budget-card">
            <div className="regional-budget-name">{regionProg.region}</div>
            <div className="regional-budget-amounts">
              {formatCurrency(regionProg.spent)} / {formatCurrency(regionProg.allocated)}
            </div>
            <div className={`regional-budget-usage ${regionProg.status}`}>
              {regionProg.percentage.toFixed(1)}% used
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main component - FIXED: Hooks called before conditional return
const DepartmentDetail = ({
  selectedDepartment,
  regions = [], // Added default value
  transactions,
  parkedMeasures,
  onRegionClick,
  onTransactionClick,
  onBackClick,
  onAssignmentSuccess,
  baseApiUrl
}) => {

  // 🔍 DEBUG: Add these lines here
  console.log('🔍 DEBUG DepartmentDetail - Selected Department:', selectedDepartment);
  console.log('🔍 DEBUG DepartmentDetail - Regions received:', regions);
  console.log('🔍 DEBUG DepartmentDetail - Regions count:', regions.length);

  // ✅ FIXED: Call hooks BEFORE any conditional returns
  const { 
    getDepartmentProgress, 
    getRegionalProgress, 
    loading: budgetLoading,
    getDepartmentBudget,
    budgetData: rawBudgetData // ✅ ADD: Get access to raw budget data
  } = useBudgetProgress(baseApiUrl, selectedDepartment);

  // ✅ FIXED: Memoize with conditional logic inside useMemo
  const budgetData = useMemo(() => {
    // Return empty data if no department selected
    if (!selectedDepartment) {
      return {
        departmentBudget: null,
        departmentProgress: null,
        regionalProgress: [],
        regionalBudgetLookup: {},
        rawBudgetData: null
      };
    }

    const departmentBudget = getDepartmentBudget(selectedDepartment);
    const departmentProgress = getDepartmentProgress(selectedDepartment);
    const regionalProgress = getRegionalProgress(selectedDepartment);
    
    // Create lookup for regional budget data
    const regionalBudgetLookup = {};
    regionalProgress.forEach(regionProg => {
      regionalBudgetLookup[regionProg.region] = regionProg;
    });

    return {
      departmentBudget,
      departmentProgress,
      regionalProgress,
      regionalBudgetLookup,
      rawBudgetData // ✅ ADD: Include raw budget data for fallback lookup
    };
  }, [selectedDepartment, getDepartmentBudget, getDepartmentProgress, getRegionalProgress, rawBudgetData]);

  // ✅ ENHANCED: Fixed enhanced regions with better budget matching
  const enhancedRegions = useMemo(() => {
    if (!selectedDepartment || !regions.length) {
      return [];
    }

    console.log('🔍 DEBUG: Enhancing regions for department:', selectedDepartment);
    console.log('🔍 DEBUG: Budget lookup data:', budgetData.regionalBudgetLookup);

    return regions.map(region => {
      console.log('🔍 DEBUG: Processing region:', region.name);
      
      // ✅ FIXED: Try multiple ways to find budget data for this region
      let regionBudgetData = null;
      let allocatedBudget = 0;
      
      // Method 1: Direct match using regional progress (region.name = "Marke & Marketing")
      regionBudgetData = budgetData.regionalBudgetLookup[region.name];
      if (regionBudgetData) {
        allocatedBudget = regionBudgetData.allocated || 0;
        console.log('🔍 DEBUG: Found direct match for', region.name, ':', allocatedBudget);
      }
      
      // Method 2: If no direct match, try partial matching
      if (!regionBudgetData || allocatedBudget === 0) {
        Object.keys(budgetData.regionalBudgetLookup).forEach(budgetRegionName => {
          // Try if budget region is contained in actual region name or vice versa
          if (region.name.toLowerCase().includes(budgetRegionName.toLowerCase()) || 
              budgetRegionName.toLowerCase().includes(region.name.toLowerCase())) {
            regionBudgetData = budgetData.regionalBudgetLookup[budgetRegionName];
            allocatedBudget = regionBudgetData?.allocated || 0;
            console.log('🔍 DEBUG: Found partial match for', region.name, 'with', budgetRegionName, ':', allocatedBudget);
          }
        });
      }
      
      // Method 3: If still no match, try to look directly in raw budget data
      if ((!regionBudgetData || allocatedBudget === 0) && budgetData.rawBudgetData?.regions) {
        Object.keys(budgetData.rawBudgetData.regions).forEach(fullBudgetKey => {
          if (fullBudgetKey.startsWith(selectedDepartment + '|')) {
            const parts = fullBudgetKey.split('|');
            if (parts.length >= 2) {
              const budgetRegionName = parts[1];
              
              // Check if this budget region matches our actual region
              if (region.name.toLowerCase().includes(budgetRegionName.toLowerCase()) || 
                  budgetRegionName.toLowerCase().includes(region.name.toLowerCase())) {
                const budgetEntry = budgetData.rawBudgetData.regions[fullBudgetKey];
                allocatedBudget = budgetEntry?.allocated_budget || 0;
                regionBudgetData = {
                  allocated: allocatedBudget,
                  region: budgetRegionName,
                  fullKey: fullBudgetKey
                };
                console.log('🔍 DEBUG: Found raw budget match for', region.name, 'with key', fullBudgetKey, ':', allocatedBudget);
              }
            }
          }
        });
      }
      
      console.log('🔍 DEBUG: Final budget data for', region.name, ':', { regionBudgetData, allocatedBudget });
      
      // Calculate amounts based on region data
      const bookedAmount = region.booked_amount || 0;
      const reservedAmount = region.reserved_amount || 0;
      const totalAmount = bookedAmount + reservedAmount;
      const remainingBudget = allocatedBudget - totalAmount;

      return {
        ...region,
        budgetData: regionBudgetData,
        // Add calculated fields for easy access
        calculatedAmounts: {
          booked: bookedAmount,
          reserved: reservedAmount,
          total: totalAmount,
          allocated: allocatedBudget,
          remaining: remainingBudget
        }
      };
    });
  }, [selectedDepartment, regions, budgetData.regionalBudgetLookup, budgetData.rawBudgetData]);

  // ✅ NOW it's safe to do conditional return AFTER all hooks
  if (!selectedDepartment) {
    return null;
  }

  return (
    <div className="department-detail">
      {/* Header */}
      <div className="department-header">
        <h3>{selectedDepartment} - Regions</h3>
        <button 
          className="assign-button back-button"
          onClick={onBackClick}
        >
          Back to Departments
        </button>
      </div>

      {/* Department Budget Overview */}
      <DepartmentBudgetOverview 
        departmentBudget={budgetData.departmentBudget}
        departmentProgress={budgetData.departmentProgress}
        budgetLoading={budgetLoading}
        enhancedRegions={enhancedRegions}
      />

      {/* Regions Table */}
      <div className="regions-section">
        <div className="budget-table">
          <div className="budget-header">
            <div>Region</div>
            <div>Allocated Budget</div>
            <div>Booked Amount</div>
            <div>Reserved Amount</div>
            <div>Total Amount</div>
            <div>Remaining</div>
          </div>
          
          {enhancedRegions.map(region => (
            <div 
              className="budget-row clickable" 
              key={region.name}
              onClick={() => onRegionClick(region)}
            >
              {/* Region Name */}
              <div>{region.name}</div>
              
              {/* Allocated Budget */}
              <div className={region.calculatedAmounts.allocated > 0 ? 'has-budget' : 'no-budget'}>
                {region.calculatedAmounts.allocated > 0 ? 
                  formatCurrency(region.calculatedAmounts.allocated) : 
                  'No Budget'
                }
              </div>
              
              {/* Booked Amount (red) */}
              <div className="booked-amount" style={{ color: '#dc3545', fontWeight: 'bold' }}>
                {formatCurrency(region.calculatedAmounts.booked)}
              </div>
              
              {/* Reserved Amount (yellow) */}
              <div className="reserved-amount" style={{ color: '#ffc107', fontWeight: 'bold' }}>
                {formatCurrency(region.calculatedAmounts.reserved)}
              </div>
              
              {/* Total Amount (Booked + Reserved) */}
              <div className="total-amount" style={{ fontWeight: 'bold' }}>
                {formatCurrency(region.calculatedAmounts.total)}
              </div>
              
              {/* Remaining (Allocated Budget - Total Amount) */}
              <div className={
                region.calculatedAmounts.allocated > 0 ? 
                  (region.calculatedAmounts.remaining >= 0 ? 'positive' : 'negative') : 
                  'no-budget'
              } style={{ fontWeight: 'bold' }}>
                {region.calculatedAmounts.allocated > 0 ? 
                  formatCurrency(region.calculatedAmounts.remaining) : 
                  '-'
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Regional Budget Summary */}
      {budgetData.departmentBudget?.location_type === 'Floor' && (
        <RegionalBudgetSummary regionalProgress={budgetData.regionalProgress} />
      )}

      {/* Measures Awaiting Assignment */}
      <ParkedMeasuresSection 
        parkedMeasures={parkedMeasures || []}
        regions={regions}
        onAssignmentSuccess={onAssignmentSuccess}
        onTransactionClick={onTransactionClick}
        baseApiUrl={baseApiUrl}
      />
    </div>
  );
};

export default DepartmentDetail;