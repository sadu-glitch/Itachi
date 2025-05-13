import React, { useContext, useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppContext from '../context/AppContext';
import BudgetContext from '../context/BudgetContext';
import RegionCard from '../components/regions/RegionCard';
import BudgetProgressBar from '../components/common/BudgetProgressBar';
import TransactionsList from '../components/transactions/TransactionsList';
import { formatCurrency } from '../utils/formatters';
import * as transactionService from '../api/transactionService';
import * as budgetService from '../api/budgetService';
import './DepartmentDetailPage.css';

const DepartmentDetailPage = () => {
  const { departmentId } = useParams();
  const { getDepartmentById, getRegionsForDepartment } = useContext(AppContext);
  const { 
    departmentBudgets, 
    getDepartmentBudgetUtilization, 
    getRegionBudgetUtilization,
    allocateBudgetToDepartment 
  } = useContext(BudgetContext);
  
  const [department, setDepartment] = useState(null);
  const [regions, setRegions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState(0);
  
  // Fetch department data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Get department
        const dept = getDepartmentById(departmentId);
        if (!dept) {
          throw new Error(`Department with ID ${departmentId} not found`);
        }
        setDepartment(dept);
        
        // Get regions for department
        const regionsData = getRegionsForDepartment(departmentId);
        setRegions(regionsData);
        
        // Fetch transactions for department
        const transactionsData = await transactionService.getTransactionsByDepartment(departmentId);
        setTransactions(transactionsData.transactions || []);
        
        // Set initial budget amount
        setBudgetAmount(departmentBudgets[departmentId]?.allocated_budget || 0);
      } catch (err) {
        console.error('Error fetching department data:', err);
        setError(`Error: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [departmentId, getDepartmentById, getRegionsForDepartment, departmentBudgets]);
  
  // Handle budget allocation form submit
  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Validate budget amount
      if (budgetAmount < 0) {
        throw new Error('Budget amount cannot be negative');
      }
      
      // Update budget allocation
      await allocateBudgetToDepartment(departmentId, parseFloat(budgetAmount));
      
      // Hide form
      setShowBudgetForm(false);
    } catch (err) {
      console.error('Error allocating budget:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Get budget utilization data
  const budgetData = department 
    ? getDepartmentBudgetUtilization(departmentId, department)
    : { allocated: 0, booked: 0, reserved: 0, remaining: 0 };
  
  return (
    <div className="department-detail-page">
      <div className="page-navigation">
        <Link to="/departments" className="nav-link">
          &larr; Back to Departments
        </Link>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {isLoading && (
        <div className="loading-message">
          Loading department data...
        </div>
      )}
      
      {!isLoading && !error && department && (
        <>
          <div className="department-header">
            <div className="department-title">
              <h1>{department.name}</h1>
              <p>Budget utilization overview</p>
            </div>
            
            <div className="department-actions">
              <button 
                className="btn-allocate-budget"
                onClick={() => setShowBudgetForm(!showBudgetForm)}
              >
                {showBudgetForm ? 'Cancel' : 'Allocate Budget'}
              </button>
            </div>
          </div>
          
          {showBudgetForm && (
            <div className="budget-allocation-form">
              <h3>Allocate Budget to Department</h3>
              <form onSubmit={handleBudgetSubmit}>
                <div className="form-group">
                  <label htmlFor="budgetAmount">Budget Amount (€)</label>
                  <input
                    type="number"
                    id="budgetAmount"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                
                <div className="form-actions">
                  <button 
                    type="submit" 
                    className="btn-submit" 
                    disabled={isLoading}
                  >
                    {isLoading ? 'Saving...' : 'Save Budget'}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          <div className="department-summary">
            <div className="summary-card">
              <h3>Allocated Budget</h3>
              <div className="summary-value">{formatCurrency(budgetData.allocated)}</div>
            </div>
            
            <div className="summary-card">
              <h3>Booked Amount</h3>
              <div className="summary-value">{formatCurrency(budgetData.booked)}</div>
            </div>
            
            <div className="summary-card">
              <h3>Reserved Amount</h3>
              <div className="summary-value">{formatCurrency(budgetData.reserved)}</div>
            </div>
            
            <div className="summary-card">
              <h3>Remaining Budget</h3>
              <div className={`summary-value ${budgetData.remaining < 0 ? 'negative' : 'positive'}`}>
                {formatCurrency(budgetData.remaining)}
              </div>
            </div>
          </div>
          
          <div className="budget-progress-section">
            <h2>Budget Utilization</h2>
            <BudgetProgressBar 
              allocated={budgetData.allocated}
              booked={budgetData.booked}
              reserved={budgetData.reserved}
            />
          </div>
          
          <div className="regions-section">
            <div className="section-header">
              <h2>Regions ({regions.length})</h2>
            </div>
            
            <div className="regions-grid">
              {regions.map(region => (
                <RegionCard 
                  key={region.name}
                  region={region}
                  departmentId={departmentId}
                  budgetData={getRegionBudgetUtilization(departmentId, region.name, region)}
                />
              ))}
              
              {regions.length === 0 && (
                <div className="no-regions">
                  <p>No regions found for this department</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="transactions-section">
            <div className="section-header">
              <h2>Department Transactions</h2>
            </div>
            
            <TransactionsList 
              transactions={transactions}
              showFilters={true}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default DepartmentDetailPage;