import React from 'react';

/**
 * Component to display statistics cards
 * @param {Object} props - Component props
 * @param {Object} props.stats - Statistics data
 */
const StatisticsCards = ({ stats }) => {
  // Calculate statistics from props
  const totalTransactions = stats?.total_sap_transactions || 0;
  const bookedMeasures = stats?.booked_measures_count || 0;
  const directCosts = stats?.direct_costs_count || 0;
  const parkedCount = stats?.parked_measures_count || 0;
  
  return (
    <div className="stats-cards">
      <div className="card">
        <h3>Total Transactions</h3>
        <div className="card-value">{totalTransactions}</div>
      </div>
      
      <div className="card">
        <h3>Booked Measures</h3>
        <div className="card-value">{bookedMeasures}</div>
      </div>
      
      <div className="card">
        <h3>Direct Costs</h3>
        <div className="card-value">{directCosts}</div>
      </div>
      
      <div className="card">
        <h3>Parked Measures</h3>
        <div className="card-value">{parkedCount}</div>
      </div>
    </div>
  );
};

export default StatisticsCards;