import React, { useState, useEffect } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Main Dashboard component that accepts props from App.js
const Dashboard = ({ stats, budgetData, awaitingAssignment, apiUrl }) => {
  // State management for UI interactions
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactions, setTransactions] = useState({ transactions: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    bestellnummer: '',
    region: '',
    district: ''
  });
  const [budgetForm, setBudgetForm] = useState({
    department: '',
    amount: 0
  });
  
  // State to store full data (will be fetched once a department is selected)
  const [departmentsData, setDepartmentsData] = useState({ departments: [] });
  const [regionsData, setRegionsData] = useState({ regions: [] });

  // Get the base API URL - use provided apiUrl or fall back to localhost for development
  const baseApiUrl = apiUrl || 'http://localhost:5000';

  // Fetch departments and regions data when component mounts
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${baseApiUrl}/api/data`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        // Store the full data structure
        setDepartmentsData(data.departments || { departments: [] });
        setRegionsData(data.regions || { regions: [] });
        
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [baseApiUrl]);

  // Fetch transactions when department changes
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!selectedDepartment) return;
      
      try {
        setLoading(true);
        let url = `${baseApiUrl}/api/transactions?department=${encodeURIComponent(selectedDepartment)}`;
        if (selectedRegion) {
          url += `&region=${encodeURIComponent(selectedRegion)}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const jsonData = await response.json();
        setTransactions(jsonData);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [selectedDepartment, selectedRegion, baseApiUrl]);

  // Handle department selection
  const handleDepartmentClick = (department) => {
    setSelectedDepartment(department.name);
    setSelectedRegion(null);
    setSelectedTransaction(null);
  };

  // Handle region selection
  const handleRegionClick = (region) => {
    setSelectedRegion(region.name);
    setSelectedTransaction(null);
  };

  // Handle transaction selection
  const handleTransactionClick = (transaction) => {
    setSelectedTransaction(transaction);
  };

  // Handle closing transaction details
  const handleCloseDetails = () => {
    setSelectedTransaction(null);
  };

  // Handle assignment form change
  const handleAssignmentChange = (e) => {
    setAssignmentForm({
      ...assignmentForm,
      [e.target.name]: e.target.value
    });
  };

  // Handle assignment submission
  const handleAssignSubmit = async (e, bestellnummer) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      const response = await fetch(`${baseApiUrl}/api/assign-measure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bestellnummer: bestellnummer || assignmentForm.bestellnummer,
          region: assignmentForm.region,
          district: assignmentForm.district
        })
      });
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      // Refresh data after assignment
      const dataResponse = await fetch(`${baseApiUrl}/api/data`);
      const jsonData = await dataResponse.json();
      
      // Update data states
      setDepartmentsData(jsonData.departments || { departments: [] });
      setRegionsData(jsonData.regions || { regions: [] });
      
      // Refresh transactions if department is selected
      if (selectedDepartment) {
        const txResponse = await fetch(`${baseApiUrl}/api/transactions?department=${encodeURIComponent(selectedDepartment)}`);
        const txData = await txResponse.json();
        setTransactions(txData);
      }
      
      // Reset form
      setAssignmentForm({
        bestellnummer: '',
        region: '',
        district: ''
      });
      
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

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
      
      // Get current budget allocation
      const currentBudget = { ...budgetData };
      
      // Update department budget
      if (currentBudget.departments && budgetForm.department) {
        if (!currentBudget.departments[budgetForm.department]) {
          currentBudget.departments[budgetForm.department] = {};
        }
        currentBudget.departments[budgetForm.department].allocated_budget = parseFloat(budgetForm.amount);
      }
      
      // Save updated budget
      const response = await fetch(`${baseApiUrl}/api/budget-allocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentBudget)
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
      
      // Reload the page to refresh all data
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Format currency values
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(parseFloat(value) || 0);
  };

  // If loading, show loading message
  if (loading && !departmentsData.departments.length) {
    return <div className="loading">Loading data...</div>;
  }

  // If error, show error message
  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Extract departments
  const departments = departmentsData.departments || [];
  
  // Prepare chart data
  const departmentChartData = departments.map(dept => ({
    name: dept.name.split(' ')[0], // Use first word only for chart labels
    booked: dept.booked_amount || 0,
    reserved: dept.reserved_amount || 0,
    total: dept.total_amount || 0
  }));

  // Filter regions for selected department
  const departmentRegions = selectedDepartment 
    ? (regionsData.regions || []).filter(region => region.department === selectedDepartment)
    : [];

  // Get parked measures for selected department
  const parkedMeasures = selectedDepartment && awaitingAssignment 
    ? (awaitingAssignment[selectedDepartment] || [])
    : [];

  // Calculate statistics
  const totalTransactions = stats?.total_sap_transactions || 0;
  const bookedMeasures = stats?.booked_measures_count || 0;
  const directCosts = stats?.direct_costs_count || 0;
  const parkedCount = stats?.parked_measures_count || 0;

  return (
    <div className="dashboard">
      <h2>Dashboard Overview</h2>
      
      {/* Statistics Cards */}
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
      
      {/* Budget Setting Form */}
      {!selectedDepartment && (
        <div className="budget-summary">
          <h3>Budget Allocation</h3>
          <form onSubmit={handleBudgetSubmit}>
            <div className="form-group">
              <label>Department</label>
              <select
                name="department"
                value={budgetForm.department}
                onChange={handleBudgetChange}
                required
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
              />
            </div>
            <button type="submit" className="assign-button">
              Set Budget
            </button>
          </form>
        </div>
      )}

      {/* Department Overview (shown when no department is selected) */}
      {!selectedDepartment && (
        <div className="budget-summary">
          <h3>Department Budget Overview</h3>
          
          {/* Chart for Department Budget */}
          <div style={{ height: '300px', marginBottom: '20px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentChartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="booked" name="Booked Amount" fill="#0078d4" />
                <Bar dataKey="reserved" name="Reserved Amount" fill="#107c10" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Department Table */}
          <div className="budget-table">
            <div className="budget-header">
              <div>Department</div>
              <div>Booked Amount</div>
              <div>Reserved Amount</div>
              <div>Total Amount</div>
            </div>
            
            {departments.map(dept => (
              <div 
                className="budget-row" 
                key={dept.name}
                onClick={() => handleDepartmentClick(dept)}
                style={{ cursor: 'pointer' }}
              >
                <div>{dept.name}</div>
                <div>{formatCurrency(dept.booked_amount)}</div>
                <div>{formatCurrency(dept.reserved_amount)}</div>
                <div>{formatCurrency(dept.total_amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department Detail View */}
      {selectedDepartment && !selectedRegion && (
        <div className="budget-summary">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3>{selectedDepartment} - Regions</h3>
            <button 
              className="assign-button"
              onClick={() => setSelectedDepartment(null)}
              style={{ padding: '5px 10px', fontSize: '12px' }}
            >
              Back to Departments
            </button>
          </div>

          {/* Regions Table */}
          <div className="budget-table">
            <div className="budget-header">
              <div>Region</div>
              <div>Booked Amount</div>
              <div>Reserved Amount</div>
              <div>Total Amount</div>
            </div>
            
            {departmentRegions.map(region => (
              <div 
                className="budget-row" 
                key={region.name}
                onClick={() => handleRegionClick(region)}
                style={{ cursor: 'pointer' }}
              >
                <div>{region.name}</div>
                <div>{formatCurrency(region.booked_amount)}</div>
                <div>{formatCurrency(region.reserved_amount)}</div>
                <div>{formatCurrency(region.total_amount)}</div>
              </div>
            ))}
          </div>

          {/* Parked Measures */}
          {parkedMeasures.length > 0 && (
            <div className="transaction-list" style={{ marginTop: '20px' }}>
              <h3 style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
                Parked Measures Awaiting Assignment
              </h3>
              <div className="transaction-header">
                <div>Bestellnummer</div>
                <div>Title</div>
                <div>Date</div>
                <div>Amount</div>
              </div>
              
              {parkedMeasures.map(measure => (
                <div key={measure.bestellnummer} className="transaction-row">
                  <div>{measure.bestellnummer}</div>
                  <div>{measure.measure_title}</div>
                  <div>{measure.measure_date}</div>
                  <div>{formatCurrency(measure.estimated_amount)}</div>
                </div>
              ))}
              
              {/* Assignment Form */}
              <div style={{ padding: '15px', borderTop: '1px solid var(--border-color)' }}>
                <h4>Assign Parked Measure</h4>
                <form onSubmit={(e) => handleAssignSubmit(e, null)}>
                  <div className="form-group">
                    <label>Bestellnummer</label>
                    <select
                      name="bestellnummer"
                      value={assignmentForm.bestellnummer}
                      onChange={handleAssignmentChange}
                      required
                    >
                      <option value="">Select Bestellnummer</option>
                      {parkedMeasures.map(measure => (
                        <option key={measure.bestellnummer} value={measure.bestellnummer}>
                          {measure.bestellnummer} - {measure.measure_title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Region</label>
                    <select
                      name="region"
                      value={assignmentForm.region}
                      onChange={handleAssignmentChange}
                      required
                    >
                      <option value="">Select Region</option>
                      {departmentRegions.map(region => (
                        <option key={region.name} value={region.name}>{region.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>District</label>
                    <input
                      type="text"
                      name="district"
                      value={assignmentForm.district}
                      onChange={handleAssignmentChange}
                      placeholder="Enter district name"
                      required
                    />
                  </div>
                  <button type="submit" className="assign-button">
                    Assign to Region/District
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="transaction-list" style={{ marginTop: '20px' }}>
            <h3 style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
              All Department Transactions
            </h3>
            <div className="transaction-header">
              <div>ID</div>
              <div>Type</div>
              <div>Date</div>
              <div>Amount</div>
            </div>
            
            {transactions.transactions.map(tx => (
              <div 
                key={tx.transaction_id || tx.measure_id} 
                className="transaction-row"
                onClick={() => handleTransactionClick(tx)}
              >
                <div>{tx.transaction_id || tx.measure_id}</div>
                <div>{tx.category === 'DIRECT_COST' ? 'Direct' :
                     tx.category === 'BOOKED_MEASURE' ? 'SAP-MSP' :
                     tx.category === 'PARKED_MEASURE' ? 'Parked' :
                     tx.category || 'Unknown'}</div>
                <div>{tx.booking_date || tx.measure_date}</div>
                <div>{formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}</div>
              </div>
            ))}
            
            {transactions.transactions.length === 0 && (
              <div className="empty-state">No transactions found</div>
            )}
          </div>
        </div>
      )}

      {/* Region Detail View */}
      {selectedDepartment && selectedRegion && (
        <div className="budget-summary">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3>{selectedRegion} - Transactions</h3>
            <button 
              className="assign-button"
              onClick={() => setSelectedRegion(null)}
              style={{ padding: '5px 10px', fontSize: '12px' }}
            >
              Back to {selectedDepartment}
            </button>
          </div>

          {/* Transactions Table for Region */}
          <div className="transaction-list">
            <div className="transaction-header">
              <div>ID</div>
              <div>Type</div>
              <div>Date</div>
              <div>Amount</div>
            </div>
            
            {transactions.transactions.map(tx => (
              <div 
                key={tx.transaction_id || tx.measure_id} 
                className="transaction-row"
                onClick={() => handleTransactionClick(tx)}
              >
                <div>{tx.transaction_id || tx.measure_id}</div>
                <div>{tx.category === 'DIRECT_COST' ? 'Direct' :
                     tx.category === 'BOOKED_MEASURE' ? 'SAP-MSP' :
                     tx.category === 'PARKED_MEASURE' ? 'Parked' :
                     tx.category || 'Unknown'}</div>
                <div>{tx.booking_date || tx.measure_date}</div>
                <div>{formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}</div>
              </div>
            ))}
            
            {transactions.transactions.length === 0 && (
              <div className="empty-state">No transactions found</div>
            )}
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '4px',
            padding: '20px',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: 0 }}>Transaction Details</h3>
              <button 
                onClick={handleCloseDetails}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px'
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>Transaction Type:</strong> 
                <span style={{
                  display: 'inline-block',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  marginLeft: '8px',
                  backgroundColor: selectedTransaction.category === 'DIRECT_COST' ? '#e6f7ff' :
                                  selectedTransaction.category === 'BOOKED_MEASURE' ? '#f6ffed' :
                                  selectedTransaction.category === 'PARKED_MEASURE' ? '#fffbe6' : '#f5f5f5',
                  color: selectedTransaction.category === 'DIRECT_COST' ? '#0078d4' :
                        selectedTransaction.category === 'BOOKED_MEASURE' ? '#107c10' :
                        selectedTransaction.category === 'PARKED_MEASURE' ? '#a4262c' : '#666'
                }}>
                  {selectedTransaction.category === 'DIRECT_COST' ? 'Direct Cost' :
                   selectedTransaction.category === 'BOOKED_MEASURE' ? 'SAP-MSP Booked Measure' :
                   selectedTransaction.category === 'PARKED_MEASURE' ? 'Parked Measure' :
                   selectedTransaction.category || 'Unknown'}
                </span>
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <strong>Transaction ID:</strong> {selectedTransaction.transaction_id || selectedTransaction.measure_id}
              </div>
              
              {selectedTransaction.bestellnummer && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>Bestellnummer:</strong> {selectedTransaction.bestellnummer}
                </div>
              )}
              
              {selectedTransaction.measure_title && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>Measure Title:</strong> {selectedTransaction.measure_title}
                </div>
              )}
              
              <div style={{ marginBottom: '10px' }}>
                <strong>Department:</strong> {selectedTransaction.department}
              </div>
              
              {selectedTransaction.region && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>Region:</strong> {selectedTransaction.region}
                </div>
              )}
              
              {selectedTransaction.district && (
                <div style={{ marginBottom: '10px' }}>
                  <strong>District:</strong> {selectedTransaction.district}
                </div>
              )}
            </div>
            
            {/* Financial information */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Financial Information</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {(selectedTransaction.amount !== undefined || selectedTransaction.actual_amount !== undefined) && (
                  <div>
                    <strong>{selectedTransaction.category === 'BOOKED_MEASURE' ? 'Actual Amount:' : 'Amount:'}</strong>
                    <div>{formatCurrency(selectedTransaction.amount || selectedTransaction.actual_amount)}</div>
                  </div>
                )}
                
                {selectedTransaction.estimated_amount !== undefined && (
                  <div>
                    <strong>Estimated Amount:</strong>
                    <div>{formatCurrency(selectedTransaction.estimated_amount)}</div>
                  </div>
                )}
                
                {selectedTransaction.variance !== undefined && (
                  <div>
                    <strong>Variance:</strong>
                    <div style={{
                      color: selectedTransaction.variance > 0 ? '#a4262c' : 
                             selectedTransaction.variance < 0 ? '#107c10' : 'inherit'
                    }}>
                      {formatCurrency(selectedTransaction.variance)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Timeline */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Timeline</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {selectedTransaction.booking_date && (
                  <div>
                    <strong>Booking Date:</strong>
                    <div>{selectedTransaction.booking_date}</div>
                  </div>
                )}
                
                {selectedTransaction.measure_date && (
                  <div>
                    <strong>Measure Date:</strong>
                    <div>{selectedTransaction.measure_date}</div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Status Information */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Status Information</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div>
                  <strong>Status:</strong>
                  <div>{selectedTransaction.status}</div>
                </div>
                
                <div>
                  <strong>Budget Impact:</strong>
                  <div>{selectedTransaction.budget_impact || 'Unknown'}</div>
                </div>
                
                {selectedTransaction.previously_parked !== undefined && (
                  <div>
                    <strong>Previously Parked:</strong>
                    <div>{selectedTransaction.previously_parked ? 'Yes' : 'No'}</div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Additional information for booked measures */}
            {selectedTransaction.category === 'BOOKED_MEASURE' && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Related Information</h4>
                
                <div>
                  {selectedTransaction.text && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong>Transaction Text:</strong>
                      <div>{selectedTransaction.text}</div>
                    </div>
                  )}
                  
                  {selectedTransaction.msp_data?.Name && (
                    <div>
                      <strong>Requester:</strong>
                      <div>{selectedTransaction.msp_data.Name}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Manual assignment section for parked measures */}
            {selectedTransaction.category === 'PARKED_MEASURE' && 
             selectedTransaction.status === 'Awaiting Assignment' && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>Manual Assignment</h4>
                
                <form onSubmit={(e) => handleAssignSubmit(e, selectedTransaction.bestellnummer)}>
                  <div className="form-group">
                    <label>Region</label>
                    <select
                      name="region"
                      value={assignmentForm.region}
                      onChange={handleAssignmentChange}
                      required
                    >
                      <option value="">Select Region</option>
                      {departmentRegions.map(region => (
                        <option key={region.name} value={region.name}>{region.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>District</label>
                    <input
                      type="text"
                      name="district"
                      value={assignmentForm.district}
                      onChange={handleAssignmentChange}
                      required
                      placeholder="Enter district name"
                    />
                  </div>
                  
                  <button type="submit" className="assign-button">
                    Assign to Region/District
                  </button>
                </form>
              </div>
            )}
            
            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <button 
                onClick={handleCloseDetails}
                className="assign-button"
                style={{ backgroundColor: '#f3f2f1', color: '#323130' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;