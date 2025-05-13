import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppContext from '../context/AppContext';
import BudgetContext from '../context/BudgetContext';
import TransactionsList from '../components/transactions/TransactionsList';
import BudgetProgressBar from '../components/common/BudgetProgressBar';
import { formatCurrency } from '../utils/formatters';
import * as transactionService from '../api/transactionService';
import * as budgetService from '../api/budgetService';
import './RegionDetailPage.css';

const RegionDetailPage = () => {
  // Get region ID from URL (format: departmentId|regionId)
  const { regionId } = useParams();
  const [departmentId, regionName] = regionId.split('|');
  
  const { regions } = useContext(AppContext);
  const { 
    regionBudgets, 
    getRegionBudgetUtilization,
    allocateBudgetToRegion 
  } = useContext(BudgetContext);
  
  const [region, setRegion] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState(0);
  
  // Fetch region data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Find the region in the context
        const regionData = regions.find(r => 
          r.department === departmentId && r.name === regionName
        );
        
        if (!regionData) {
          throw new Error(`Region ${regionName} not found in department ${departmentId}`);
        }
        
        setRegion(regionData);
        
        // Fetch transactions for this region
        const transactionsData = await transactionService.getTransactionsFiltered({
          department: departmentId,
          region: regionName
        });
        
        setTransactions(transactionsData.transactions || []);
        
        // Set initial budget amount
        const regionKey = `${departmentId}|${regionName}`;
        setBudgetAmount(regionBudgets[regionKey]?.allocated_budget || 0);
        
      } catch (err) {
        console.error('Error fetching region data:', err);
        setError(`Error: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [departmentId, regionName, regions, regionBudgets]);
  
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
      await allocateBudgetToRegion(departmentId, regionName, parseFloat(budgetAmount));
      
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
  const budgetData = region 
    ? getRegionBudgetUtilization(departmentId, regionName, region)
    : { allocated: 0, booked: 0, reserved: 0, remaining: 0 };
  
  return (
    <div className="region-detail-page">
      <div className="page-navigation">
        <Link to={`/departments/${encodeURIComponent(departmentId)}`} className="nav-link">
          &larr; Back to {departmentId}
        </Link>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {isLoading && (
        <div className="loading-message">
          Loading region data...
        </div>
      )}
      
      {!isLoading && !error && region && (
        <>
          <div className="region-header">
            <div className="region-title">
              <h1>{region.name}</h1>
              <p>Department: {departmentId}</p>
            </div>
            
            <div className="region-actions">
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
              <h3>Allocate Budget to Region</h3>
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
          
          <div className="region-summary">
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
          
          <div className="districts-section">
            <div className="section-header">
              <h2>Districts</h2>
            </div>
            
            <div className="districts-list">
              {region.districts && region.districts.length > 0 ? (
                <ul>
                  {region.districts.map(district => (
                    <li key={district}>{district}</li>
                  ))}
                </ul>
              ) : (
                <div className="no-districts">
                  <p>No districts found for this region</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="transactions-section">
            <div className="section-header">
              <h2>Region Transactions</h2>
            </div>
            
            <TransactionsList 
              transactions={transactions}
              showFilters={true}
              initialFilters={{ department: departmentId, region: regionName }}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default RegionDetailPage;