import React from 'react';

function Dashboard({ stats, budgetData, awaitingAssignment }) {
  // Format currency values
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value || 0);
  };

  // Format percentage values
  const formatPercentage = (value) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value || 0);
  };

  return (
    <div className="dashboard">
      <h2>Dashboard Overview</h2>
      
      <div className="stats-cards">
        <div className="card">
          <h3>Total Transactions</h3>
          <div className="card-value">{stats.total_transactions || 0}</div>
        </div>
        
        <div className="card">
          <h3>Total Amount</h3>
          <div className="card-value">{formatCurrency(stats.total_amount)}</div>
        </div>
        
        <div className="card">
          <h3>Parked Measures</h3>
          <div className="card-value">{stats.parked_measures_count || 0}</div>
        </div>
        
        <div className="card">
          <h3>Budget Utilization</h3>
          <div className="card-value">{formatPercentage(stats.budget_utilization)}</div>
        </div>
      </div>
      
      <div className="budget-summary">
        <h3>Budget Allocation Summary</h3>
        {budgetData.departments ? (
          <div className="budget-table">
            <div className="budget-header">
              <div>Department</div>
              <div>Allocated</div>
              <div>Used</div>
              <div>Remaining</div>
            </div>

      <div className="test-debug">
  <h3>🧪 Debug: Awaiting Assignment Count</h3>
  <p>
    Total departments with awaiting measures:{' '}
    {Object.keys(awaitingAssignment || {}).length}
  </p>
  <ul>
    {Object.entries(awaitingAssignment || {}).map(([dept, measures]) => (
      <li key={dept}>
        {dept}: {measures.length} measures
      </li>
    ))}
  </ul>
</div>

            
            {Object.entries(budgetData.departments || {}).map(([dept, data]) => (
              <div className="budget-row" key={dept}>
                <div>{dept}</div>
                <div>{formatCurrency(data.allocated)}</div>
                <div>{formatCurrency(data.used)}</div>
                <div>{formatCurrency(data.allocated - data.used)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p>No budget data available</p>
        )}
      </div>
    </div>
  );
}

export default Dashboard;