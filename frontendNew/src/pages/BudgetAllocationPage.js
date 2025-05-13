import React, { useState, useEffect, useContext } from 'react';
import BudgetContext from '../context/BudgetContext';
import AppContext from '../context/AppContext';
import { formatCurrency } from '../utils/formatters';
import * as budgetService from '../api/budgetService';
import './BudgetAllocationPage.css';

const BudgetAllocationPage = () => {
  const { departments, regions } = useContext(AppContext);
  const { departmentBudgets, regionBudgets } = useContext(BudgetContext);
  
  const [budgetData, setBudgetData] = useState({
    departments: {},
    regions: {}
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Initialize form data from context
  useEffect(() => {
    setBudgetData({
      departments: { ...departmentBudgets },
      regions: { ...regionBudgets }
    });
  }, [departmentBudgets, regionBudgets]);
  
  // Handle budget input change
  const handleBudgetChange = (type, id, value) => {
    // Convert value to number
    const numValue = value === '' ? 0 : parseFloat(value);
    
    setBudgetData(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [id]: {
          allocated_budget: numValue
        }
      }
    }));
    
    // Clear any messages
    setError(null);
    setSuccess(null);
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Save budget allocation
      await budgetService.updateBudgetAllocations(budgetData);
      
      // Show success message
      setSuccess('Budget allocation saved successfully');
    } catch (err) {
      console.error('Error saving budget allocation:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="budget-allocation-page">
      <div className="page-header">
        <h1>Budget Allocation</h1>
        <p>Allocate budget to departments and regions</p>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {success && (
        <div className="success-message">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="budget-sections">
          <div className="budget-section">
            <h2>Department Budgets</h2>
            <div className="budget-items">
              {departments.map(dept => (
                <div key={dept.name} className="budget-item">
                  <label htmlFor={`dept-${dept.name}`}>{dept.name}</label>
                  <div className="budget-input-group">
                    <span className="currency-symbol">€</span>
                    <input
                      id={`dept-${dept.name}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={budgetData.departments[dept.name]?.allocated_budget || 0}
                      onChange={(e) => handleBudgetChange('departments', dept.name, e.target.value)}
                    />
                  </div>
                </div>
              ))}
              
              {departments.length === 0 && (
                <div className="no-items">No departments found</div>
              )}
            </div>
          </div>
          
          <div className="budget-section">
            <h2>Region Budgets</h2>
            <p className="section-note">
              Regions cannot be allocated more budget than their parent department has available.
            </p>
            
            <div className="budget-items">
              {regions.map(region => {
                const regionKey = `${region.department}|${region.name}`;
                return (
                  <div key={regionKey} className="budget-item">
                    <label htmlFor={`region-${regionKey}`}>
                      {region.name}
                      <span className="item-department">{region.department}</span>
                    </label>
                    <div className="budget-input-group">
                      <span className="currency-symbol">€</span>
                      <input
                        id={`region-${regionKey}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={budgetData.regions[regionKey]?.allocated_budget || 0}
                        onChange={(e) => handleBudgetChange('regions', regionKey, e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
              
              {regions.length === 0 && (
                <div className="no-items">No regions found</div>
              )}
            </div>
          </div>
        </div>
        
        <div className="form-actions">
          <button 
            type="submit" 
            className="btn-save" 
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Budget Allocation'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BudgetAllocationPage;