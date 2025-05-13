import React, { useState } from 'react';

/**
 * Component for budget allocation form
 * @param {Object} props - Component props
 * @param {Array} props.departments - Array of department data
 * @param {string} props.baseApiUrl - Base API URL
 * @param {Function} props.onSuccess - Success callback function
 */
const BudgetAllocationForm = ({ departments, baseApiUrl, onSuccess }) => {
  const [budgetForm, setBudgetForm] = useState({
    department: '',
    amount: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Handle budget form change
  const handleBudgetChange = (e) => {
    setBudgetForm({
      ...budgetForm,
      [e.target.name]: e.target.value
    });
  };

  // Handle budget submission
  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      
      // Make API request to update budget
      const response = await fetch(`${baseApiUrl}/api/budget-allocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          departments: {
            [budgetForm.department]: {
              allocated_budget: parseFloat(budgetForm.amount)
            }
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      // Reset form
      setBudgetForm({
        department: '',
        amount: 0
      });
      
      setLoading(false);
      
      // Call success callback
      if (onSuccess) {
        await onSuccess();
      }
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };
  
  return (
    <div className="budget-summary">
      <h3>Budget Allocation</h3>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleBudgetSubmit}>
        <div className="form-group">
          <label>Department</label>
          <select
            name="department"
            value={budgetForm.department}
            onChange={handleBudgetChange}
            required
            disabled={loading}
          >
            <option value="">Select Department</option>
            {departments.map(dept => (
              <option key={dept.name} value={dept.name}>{dept.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Budget Amount (€)</label>
          <input
            type="number"
            name="amount"
            value={budgetForm.amount}
            onChange={handleBudgetChange}
            step="0.01"
            min="0"
            required
            disabled={loading}
          />
        </div>
        <button type="submit" className="assign-button" disabled={loading}>
          {loading ? 'Setting Budget...' : 'Set Budget'}
        </button>
      </form>
    </div>
  );
};

export default BudgetAllocationForm;