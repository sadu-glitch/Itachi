import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppContext from '../context/AppContext';
import BudgetContext from '../context/BudgetContext';
import { formatCurrency } from '../utils/formatters';
import './DashboardPage.css';

const DashboardPage = () => {
  const { departments, regions, statisticsData, refreshData } = useContext(AppContext);
  const { departmentBudgets, regionBudgets } = useContext(BudgetContext);
  const [summary, setSummary] = useState({
    totalBudget: 0,
    totalBooked: 0,
    totalReserved: 0,
    totalRemaining: 0,
    departmentsCount: 0,
    regionsCount: 0,
    directCostsCount: 0,
    bookedMeasuresCount: 0,
    parkedMeasuresCount: 0
  });
  
  // Calculate summary data
  useEffect(() => {
    const totalBudget = Object.values(departmentBudgets).reduce(
      (sum, dept) => sum + (dept.allocated_budget || 0), 
      0
    );
    
    const totalBooked = departments.reduce(
      (sum, dept) => sum + (dept.booked_amount || 0), 
      0
    );
    
    const totalReserved = departments.reduce(
      (sum, dept) => sum + (dept.reserved_amount || 0), 
      0
    );
    
    setSummary({
      totalBudget,
      totalBooked,
      totalReserved,
      totalRemaining: totalBudget - totalBooked - totalReserved,
      departmentsCount: departments.length,
      regionsCount: regions.length,
      directCostsCount: statisticsData.direct_costs_count || 0,
      bookedMeasuresCount: statisticsData.booked_measures_count || 0,
      parkedMeasuresCount: statisticsData.parked_measures_count || 0
    });
  }, [departments, regions, departmentBudgets, regionBudgets, statisticsData]);
  
  // Handle refresh button click
  const handleRefresh = () => {
    refreshData();
  };
  
  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button className="btn-refresh" onClick={handleRefresh}>
          Refresh Data
        </button>
      </div>
      
      <div className="budget-overview">
        <div className="overview-card">
          <h3>Total Budget</h3>
          <div className="amount">{formatCurrency(summary.totalBudget)}</div>
        </div>
        
        <div className="overview-card">
          <h3>Total Booked</h3>
          <div className="amount">{formatCurrency(summary.totalBooked)}</div>
        </div>
        
        <div className="overview-card">
          <h3>Total Reserved</h3>
          <div className="amount">{formatCurrency(summary.totalReserved)}</div>
        </div>
        
        <div className="overview-card">
          <h3>Total Remaining</h3>
          <div className={`amount ${summary.totalRemaining < 0 ? 'negative' : 'positive'}`}>
            {formatCurrency(summary.totalRemaining)}
          </div>
        </div>
      </div>
      
      <div className="dashboard-statistics">
        <div className="statistics-card">
          <h3>Departments</h3>
          <div className="stat-value">{summary.departmentsCount}</div>
          <Link to="/departments" className="stat-link">View All</Link>
        </div>
        
        <div className="statistics-card">
          <h3>Regions</h3>
          <div className="stat-value">{summary.regionsCount}</div>
        </div>
        
        <div className="statistics-card">
          <h3>Direct Costs</h3>
          <div className="stat-value">{summary.directCostsCount}</div>
        </div>
        
        <div className="statistics-card">
          <h3>Booked Measures</h3>
          <div className="stat-value">{summary.bookedMeasuresCount}</div>
        </div>
        
        <div className="statistics-card">
          <h3>Parked Measures</h3>
          <div className="stat-value">{summary.parkedMeasuresCount}</div>
          <Link to="/measures/parked" className="stat-link">View All</Link>
        </div>
      </div>
      
      <div className="dashboard-actions">
        <div className="action-card">
          <h3>Manage Departments</h3>
          <p>View and manage departments and their regions</p>
          <Link to="/departments" className="btn-action">Go to Departments</Link>
        </div>
        
        <div className="action-card">
          <h3>Assign Parked Measures</h3>
          <p>Assign parked measures to regions and districts</p>
          <Link to="/measures/parked" className="btn-action">Go to Parked Measures</Link>
        </div>
        
        <div className="action-card">
          <h3>Allocate Budget</h3>
          <p>Allocate budget to departments and regions</p>
          <Link to="/budget" className="btn-action">Go to Budget Allocation</Link>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;