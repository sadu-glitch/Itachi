import React, { useState, useMemo } from 'react';

/**
 * Component to display region detail view with transactions and reversible assignments. THIS COMPONENT WAS AGNOSTIC AND THEREFORE DID NOT NEED DATABASE CONVERSION (SO NO TXT. file)
 */
const RegionDetail = ({
  selectedDepartment,
  selectedRegion,
  transactions,
  onTransactionClick,
  onBackClick,
  onAssignmentSuccess,
  baseApiUrl,
  regionBudgetData // Add this prop to get budget info from parent
}) => {
  const [loading, setLoading] = useState(false);

  // Calculate regional summary data
  const regionalSummary = useMemo(() => {
    // Filter transactions to find manually assigned measures for this region
    const manuallyAssignedMeasures = transactions.filter(tx => 
      tx.category === 'PARKED_MEASURE' && 
      tx.status === 'Manually assigned, awaiting SAP' &&
      tx.region === selectedRegion &&
      tx.manual_assignment
    );

    // All other booked transactions (actual spending)
    const bookedTransactions = transactions.filter(tx => 
      tx.category === 'DIRECT_COST' || tx.category === 'BOOKED_MEASURE'
    );

    // Calculate amounts
    const reservedAmount = manuallyAssignedMeasures.reduce((sum, tx) => 
      sum + (parseFloat(tx.estimated_amount) || 0), 0
    );
    
    const bookedAmount = bookedTransactions.reduce((sum, tx) => 
      sum + (parseFloat(tx.amount || tx.actual_amount) || 0), 0
    );

    // Get allocated budget from regionBudgetData or calculate from transactions
    const allocatedBudget = regionBudgetData?.allocated || 0;
    
    const totalUsed = bookedAmount + reservedAmount;
    const remaining = allocatedBudget - totalUsed;
    
    // Calculate percentages
    const usagePercentage = allocatedBudget > 0 ? (totalUsed / allocatedBudget) * 100 : 0;
    const bookedPercentage = allocatedBudget > 0 ? (bookedAmount / allocatedBudget) * 100 : 0;
    const reservedPercentage = allocatedBudget > 0 ? (reservedAmount / allocatedBudget) * 100 : 0;
    const remainingPercentage = Math.max(0, allocatedBudget > 0 ? (remaining / allocatedBudget) * 100 : 0);

    // Get unique districts for breakdown
    const districtBreakdown = {};
    transactions.forEach(tx => {
      if (tx.district) {
        if (!districtBreakdown[tx.district]) {
          districtBreakdown[tx.district] = {
            district: tx.district,
            booked: 0,
            reserved: 0,
            total: 0,
            transactionCount: 0
          };
        }
        
        if (tx.category === 'PARKED_MEASURE' && tx.status === 'Manually assigned, awaiting SAP') {
          districtBreakdown[tx.district].reserved += parseFloat(tx.estimated_amount) || 0;
        } else if (tx.category === 'DIRECT_COST' || tx.category === 'BOOKED_MEASURE') {
          districtBreakdown[tx.district].booked += parseFloat(tx.amount || tx.actual_amount) || 0;
        }
        
        districtBreakdown[tx.district].total = districtBreakdown[tx.district].booked + districtBreakdown[tx.district].reserved;
        districtBreakdown[tx.district].transactionCount++;
      }
    });

    console.log('🔍 DEBUG: RegionDetail rendering for region:', selectedRegion);
console.log('🔍 DEBUG: Total transactions received:', transactions.length);

console.log('🔍 RegionDetail Debug:', {
  selectedRegion,
  transactionsCount: transactions?.length || 0,
  sampleTransaction: transactions?.[0],
  baseApiUrl
});

// Debug: Check all transactions for this region
const allRegionTransactions = transactions.filter(tx => tx.region === selectedRegion);
console.log('🔍 DEBUG: All transactions in region:', allRegionTransactions.length);

// Debug: Check different categories in this region
const categoriesInRegion = {};
allRegionTransactions.forEach(tx => {
  const cat = tx.category || 'NO_CATEGORY';
  if (!categoriesInRegion[cat]) categoriesInRegion[cat] = 0;
  categoriesInRegion[cat]++;
});
console.log('🔍 DEBUG: Categories in region:', categoriesInRegion);

// Debug: Check different statuses in this region
const statusesInRegion = {};
allRegionTransactions.forEach(tx => {
  const status = tx.status || 'NO_STATUS';
  if (!statusesInRegion[status]) statusesInRegion[status] = 0;
  statusesInRegion[status]++;
});
console.log('🔍 DEBUG: Statuses in region:', statusesInRegion);

// Debug: Check manually assigned measures specifically
const debugManuallyAssigned = transactions.filter(tx => 
  tx.region === selectedRegion && tx.manual_assignment
);
console.log('🔍 DEBUG: Transactions with manual_assignment in region:', debugManuallyAssigned.length);

// Debug: Show sample data
if (debugManuallyAssigned.length > 0) {
  console.log('🔍 DEBUG: Sample manually assigned measure:', {
    bestellnummer: debugManuallyAssigned[0].bestellnummer,
    category: debugManuallyAssigned[0].category,
    status: debugManuallyAssigned[0].status,
    region: debugManuallyAssigned[0].region,
    manual_assignment: debugManuallyAssigned[0].manual_assignment
  });
}

    return {
      allocated: allocatedBudget,
      booked: bookedAmount,
      reserved: reservedAmount,
      totalUsed,
      remaining,
      usagePercentage,
      bookedPercentage,
      reservedPercentage,
      remainingPercentage,
      manuallyAssignedCount: manuallyAssignedMeasures.length,
      bookedTransactionCount: bookedTransactions.length,
      districtBreakdown: Object.values(districtBreakdown).sort((a, b) => b.total - a.total)
    };
  }, [transactions, selectedRegion, regionBudgetData]);

  // Filter transactions to find manually assigned measures for this region
  
    const manuallyAssignedMeasures = transactions.filter(tx => 
  tx.region === selectedRegion &&
  tx.manual_assignment && 
  (tx.category === 'PARKED_MEASURE' || tx.status === 'Manually assigned, awaiting SAP')
);

  // All other transactions (booked, direct costs, etc.)
  const regularTransactions = transactions.filter(tx => 
    !(tx.category === 'PARKED_MEASURE' && tx.status === 'Manually assigned, awaiting SAP')
  );

  // Handle reverse assignment
  const handleReverseAssignment = async (measure) => {
    if (!baseApiUrl) {
      alert('Reverse functionality not available');
      return;
    }

    const confirmReverse = window.confirm(
      `Reverse assignment for measure ${measure.bestellnummer}?\n\n` +
      `This will move it back to the department's awaiting assignment section.`
    );

    if (!confirmReverse) return;

    try {
      setLoading(true);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
        
      const response = await fetch(`${normalizedApiUrl}/api/assign-measure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'same-origin',
        body: JSON.stringify({
          bestellnummer: measure.bestellnummer,
          region: '',
          district: '',
          unassign: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to reverse assignment: ${response.status}`);
      }

      const result = await response.json();
      console.log('Reverse assignment successful:', result);

      if (onAssignmentSuccess) {
        await onAssignmentSuccess();
      }

      alert(`Measure ${measure.bestellnummer} has been moved back to awaiting assignment.`);

    } catch (error) {
      console.error('Error reversing assignment:', error);
      alert(`Failed to reverse assignment: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="budget-summary">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>{selectedRegion} - Regional Detail</h3>
        <button 
          className="assign-button"
          onClick={onBackClick}
          style={{ padding: '5px 10px', fontSize: '12px' }}
        >
          Back to {selectedDepartment}
        </button>
      </div>

      {/* Regional Budget Summary */}
      <div className="budget-overview" style={{ marginBottom: '20px' }}>
        <h4>{selectedRegion} Budget Overview</h4>
        
        <div className="budget-stats-grid">
          <div className="budget-stat">
            <span className="budget-stat-label">Allocated</span>
            <span className="budget-stat-value allocated">
              {formatCurrency(regionalSummary.allocated)}
            </span>
          </div>
          <div className="budget-stat">
            <span className="budget-stat-label">Booked</span>
            <span className="budget-stat-value spent">
              {formatCurrency(regionalSummary.booked)}
            </span>
          </div>
          <div className="budget-stat">
            <span className="budget-stat-label">Reserved</span>
            <span className="budget-stat-value" style={{ color: '#ffc107', fontWeight: 'bold' }}>
              {formatCurrency(regionalSummary.reserved)}
            </span>
          </div>
          <div className="budget-stat">
            <span className="budget-stat-label">Remaining</span>
            <span className={`budget-stat-value ${regionalSummary.remaining >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(regionalSummary.remaining)}
            </span>
          </div>
          <div className="budget-stat">
            <span className="budget-stat-label">Usage</span>
            <span className={`budget-stat-value ${
              regionalSummary.usagePercentage > 100 ? 'over' : 
              regionalSummary.usagePercentage > 85 ? 'warning' : 'good'
            }`}>
              {regionalSummary.usagePercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Regional Progress Bar */}
        {regionalSummary.allocated > 0 && (
          <div className="budget-progress-container">
            <div className={`budget-progress-bar ${regionalSummary.usagePercentage > 100 ? 'over-allocated' : ''}`}>
              <div className="budget-progress-segments">
                {/* Booked segment */}
                <div 
                  className="budget-segment booked"
                  style={{ width: `${Math.min(regionalSummary.bookedPercentage, 100)}%` }}
                  data-label={`Booked: ${formatCurrency(regionalSummary.booked)}`}
                />
                
                {/* Reserved segment */}
                <div 
                  className="budget-segment reserved"
                  style={{ width: `${Math.min(regionalSummary.reservedPercentage, 100 - regionalSummary.bookedPercentage)}%` }}
                  data-label={`Reserved: ${formatCurrency(regionalSummary.reserved)}`}
                />
                
                {/* Remaining segment */}
                {regionalSummary.remainingPercentage > 0 && (
                  <div 
                    className="budget-segment remaining"
                    style={{ width: `${regionalSummary.remainingPercentage}%` }}
                    data-label={`Remaining: ${formatCurrency(regionalSummary.remaining)}`}
                  />
                )}
              </div>
            </div>
            
            {/* Legend */}
            <div className="budget-progress-legend">
              <div className="budget-legend-item">
                <div className="budget-legend-color booked"></div>
                <span>Booked ({formatCurrency(regionalSummary.booked)})</span>
              </div>
              <div className="budget-legend-item">
                <div className="budget-legend-color reserved"></div>
                <span>Reserved ({formatCurrency(regionalSummary.reserved)})</span>
              </div>
              <div className="budget-legend-item">
                <div className="budget-legend-color remaining"></div>
                <span>Remaining ({formatCurrency(regionalSummary.remaining)})</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* District Breakdown */}
      {regionalSummary.districtBreakdown.length > 0 && (
        <div className="regional-budget-summary" style={{ marginBottom: '20px' }}>
          <h4>District Breakdown</h4>
          <div className="regional-cards-grid">
            {regionalSummary.districtBreakdown.map(district => (
              <div key={district.district} className="regional-budget-card">
                <div className="regional-budget-name">{district.district}</div>
                <div className="regional-budget-amounts">
                  <div style={{ fontSize: '11px', color: '#dc3545' }}>
                    Booked: {formatCurrency(district.booked)}
                  </div>
                  <div style={{ fontSize: '11px', color: '#ffc107' }}>
                    Reserved: {formatCurrency(district.reserved)}
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>
                  Total: {formatCurrency(district.total)}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {district.transactionCount} transactions
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manually Assigned Measures Section */}
      {manuallyAssignedMeasures.length > 0 && (
        <div className="transaction-list" style={{ marginBottom: '20px' }}>
          <h3 style={{ 
            padding: '15px', 
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: '#fff3cd',
            margin: 0,
            color: '#856404'
          }}>
            Manually Assigned Measures ({manuallyAssignedMeasures.length})
          </h3>
          
          <div className="transaction-header">
            <div style={{ flex: '0 0 15%' }}>Bestellnummer</div>
            <div style={{ flex: '0 0 35%' }}>Title</div>
            <div style={{ flex: '0 0 15%' }}>District</div>
            <div style={{ flex: '0 0 15%' }}>Amount</div>
            <div style={{ flex: '0 0 10%' }}>Status</div>
            <div style={{ flex: '0 0 10%' }}>Actions</div>
          </div>

          {manuallyAssignedMeasures.map(measure => (
            <div key={measure.bestellnummer} className="transaction-row" style={{ alignItems: 'center' }}>
              <div style={{ flex: '0 0 15%' }}>{measure.bestellnummer}</div>
              <div style={{ flex: '0 0 35%' }} title={measure.measure_title}>
                {truncateText(measure.measure_title, 40)}
              </div>
              <div style={{ flex: '0 0 15%' }}>{measure.district}</div>
              <div style={{ flex: '0 0 15%' }}>{formatCurrency(measure.estimated_amount)}</div>
              <div style={{ flex: '0 0 10%' }}>
                <span style={{
                  backgroundColor: '#ffc107',
                  color: '#000',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}>
                  Assigned
                </span>
              </div>
              <div style={{ flex: '0 0 10%' }}>
                <button
                  onClick={() => handleReverseAssignment(measure)}
                  disabled={loading}
                  style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1
                  }}
                  title="Move back to awaiting assignment"
                >
                  {loading ? '...' : 'Reverse'}
                </button>
              </div>
            </div>
          ))}

          <div style={{ 
            padding: '10px 15px', 
            backgroundColor: '#f8f9fa', 
            borderTop: '1px solid var(--border-color)',
            fontSize: '14px',
            color: '#666'
          }}>
            💡 These measures were manually assigned to this region and are awaiting SAP transactions
          </div>
        </div>
      )}

      {/* Enhanced Region Transactions Table with District Column */}
      <div className="transaction-list">
        <div style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>{selectedRegion} - All Transactions</h3>
          
          {/* Results count */}
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            {regularTransactions.length} transactions
          </div>
        </div>

        <div className="transaction-header" style={{ gridTemplateColumns: '12% 10% 40% 18% 20%' }}>
          <div>Date</div>
          <div>Type</div>
          <div>Text</div>
          <div>District</div>
          <div>Amount</div>
        </div>
        
        {regularTransactions.map((tx, index) => (
          <div 
            key={`${tx.transaction_id || tx.measure_id || 'unknown'}-${index}`}
            className="transaction-row"
            onClick={() => onTransactionClick(tx)}
            style={{ 
              cursor: 'pointer',
              gridTemplateColumns: '12% 10% 40% 18% 20%'
            }}
          >
            <div>{formatDate(tx.booking_date || tx.measure_date)}</div>
            <div>{getTransactionTypeLabel(tx.category)}</div>
            <div title={tx.text || tx.measure_title || 'No description'}>
              {truncateText(tx.text || tx.measure_title || 'No description', 50)}
            </div>
            <div title={tx.district || 'No district'}>
              {truncateText(tx.district || 'N/A', 25)}
            </div>
            <div>
              {formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}
            </div>
          </div>
        ))}
        
        {regularTransactions.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            No transactions found for this region
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to get transaction type label
const getTransactionTypeLabel = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return 'Direct';
    case 'BOOKED_MEASURE':
      return 'SAP-MSP';
    case 'PARKED_MEASURE':
      return 'Parked';
    case 'UNASSIGNED_MEASURE':
      return 'Unassigned';
    default:
      return category || 'Unknown';
  }
};

// Helper function to format date in European format (DD.MM.YYYY)
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};

// Helper functions
const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default RegionDetail;