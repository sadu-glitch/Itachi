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
    return <div className="flex justify-center items-center h-screen">Loading data...</div>;
  }

  // If error, show error message
  if (error) {
    return <div className="bg-red-100 p-4 rounded text-red-700">Error: {error}</div>;
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
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="bg-blue-800 text-white p-4 mb-6 rounded-md shadow-md">
        <h1 className="text-2xl font-bold">MSP-SAP Integration Dashboard</h1>
        <p className="text-sm">Financial data integration and budget management</p>
      </div>

      {/* Navigation breadcrumbs */}
      <div className="mb-4 p-2 bg-gray-100 rounded-md">
        <span 
          className="cursor-pointer text-blue-600 hover:underline" 
          onClick={() => { setSelectedDepartment(null); setSelectedRegion(null); }}
        >
          Departments
        </span>
        
        {selectedDepartment && (
          <>
            <span className="mx-2 text-gray-500">/</span>
            <span 
              className="cursor-pointer text-blue-600 hover:underline"
              onClick={() => setSelectedRegion(null)}
            >
              {selectedDepartment}
            </span>
          </>
        )}
        
        {selectedRegion && (
          <>
            <span className="mx-2 text-gray-500">/</span>
            <span className="text-blue-600">{selectedRegion}</span>
          </>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-md shadow-md">
          <h3 className="text-gray-500 mb-1">Total Transactions</h3>
          <p className="text-2xl font-bold">{totalTransactions}</p>
        </div>
        <div className="bg-white p-4 rounded-md shadow-md">
          <h3 className="text-gray-500 mb-1">Booked Measures</h3>
          <p className="text-2xl font-bold">{bookedMeasures}</p>
        </div>
        <div className="bg-white p-4 rounded-md shadow-md">
          <h3 className="text-gray-500 mb-1">Direct Costs</h3>
          <p className="text-2xl font-bold">{directCosts}</p>
        </div>
        <div className="bg-white p-4 rounded-md shadow-md">
          <h3 className="text-gray-500 mb-1">Parked Measures</h3>
          <p className="text-2xl font-bold">{parkedCount}</p>
        </div>
      </div>

      {/* Budget Setting Form */}
      {!selectedDepartment && (
        <div className="bg-white p-4 rounded-md shadow-md mb-6">
          <h2 className="text-xl font-bold mb-4">Set Department Budget</h2>
          <form onSubmit={handleBudgetSubmit} className="flex flex-wrap gap-4">
            <div className="w-full md:w-1/3">
              <label className="block text-gray-700 mb-1">Department</label>
              <select
                name="department"
                value={budgetForm.department}
                onChange={handleBudgetChange}
                className="w-full p-2 border rounded-md"
                required
              >
                <option value="">Select Department</option>
                {departments.map(dept => (
                  <option key={dept.name} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-1/3">
              <label className="block text-gray-700 mb-1">Budget Amount (€)</label>
              <input
                type="number"
                name="amount"
                value={budgetForm.amount}
                onChange={handleBudgetChange}
                className="w-full p-2 border rounded-md"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div className="w-full md:w-1/4 flex items-end">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Set Budget
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content */}
      <div className="mb-6">
        {/* Department Overview (shown when no department is selected) */}
        {!selectedDepartment && (
          <>
            <h2 className="text-xl font-bold mb-4">Department Overview</h2>
            
            {/* Department chart */}
            <div className="bg-white p-4 rounded-md shadow-md mb-6">
              <h3 className="text-lg font-semibold mb-2">Budget Allocation by Department</h3>
              <div className="h-64">
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
                    <Bar dataKey="booked" name="Booked Amount" fill="#4299e1" />
                    <Bar dataKey="reserved" name="Reserved Amount" fill="#48bb78" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Department cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map(dept => (
                <div 
                  key={dept.name}
                  className="bg-white p-4 rounded-md shadow-md cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleDepartmentClick(dept)}
                >
                  <h3 className="text-lg font-semibold mb-2">{dept.name}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Booked:</p>
                      <p className="font-bold">{formatCurrency(dept.booked_amount)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Reserved:</p>
                      <p className="font-bold">{formatCurrency(dept.reserved_amount)}</p>
                    </div>
                    <div className="col-span-2 mt-2">
                      <p className="text-gray-500">Total Amount:</p>
                      <p className="font-bold text-lg">{formatCurrency(dept.total_amount)}</p>
                    </div>
                    <div className="col-span-2 mt-2">
                      <p className="text-gray-500">Regions: {dept.regions?.length || 0}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Department Detail View */}
        {selectedDepartment && !selectedRegion && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{selectedDepartment} - Regions</h2>
              <button 
                className="bg-gray-200 px-3 py-1 rounded-md text-sm hover:bg-gray-300"
                onClick={() => setSelectedDepartment(null)}
              >
                Back to Departments
              </button>
            </div>

            {/* Regions grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {departmentRegions.map(region => (
                <div 
                  key={region.name}
                  className="bg-white p-4 rounded-md shadow-md cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleRegionClick(region)}
                >
                  <h3 className="text-lg font-semibold mb-2">{region.name}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500">Booked:</p>
                      <p className="font-bold">{formatCurrency(region.booked_amount)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Reserved:</p>
                      <p className="font-bold">{formatCurrency(region.reserved_amount)}</p>
                    </div>
                    <div className="col-span-2 mt-2">
                      <p className="text-gray-500">Total Amount:</p>
                      <p className="font-bold text-lg">{formatCurrency(region.total_amount)}</p>
                    </div>
                    <div className="col-span-2 mt-2">
                      <p className="text-gray-500">Districts: {region.districts?.length || 0}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Parked Measures */}
            {parkedMeasures.length > 0 && (
              <div className="bg-white p-4 rounded-md shadow-md mb-6">
                <h3 className="text-lg font-semibold mb-4">Parked Measures Awaiting Assignment</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="py-2 px-4 border-b text-left">Bestellnummer</th>
                        <th className="py-2 px-4 border-b text-left">Title</th>
                        <th className="py-2 px-4 border-b text-left">Date</th>
                        <th className="py-2 px-4 border-b text-right">Estimated Amount</th>
                        <th className="py-2 px-4 border-b text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkedMeasures.map(measure => (
                        <tr key={measure.bestellnummer} className="hover:bg-gray-50">
                          <td className="py-2 px-4 border-b">{measure.bestellnummer}</td>
                          <td className="py-2 px-4 border-b">{measure.measure_title}</td>
                          <td className="py-2 px-4 border-b">{measure.measure_date}</td>
                          <td className="py-2 px-4 border-b text-right">
                            {formatCurrency(measure.estimated_amount)}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            <div className="flex gap-2 items-center justify-center">
                              <select
                                className="p-1 border rounded-md text-sm"
                                value={assignmentForm.region}
                                onChange={handleAssignmentChange}
                                name="region"
                              >
                                <option value="">Select Region</option>
                                {departmentRegions.map(region => (
                                  <option key={region.name} value={region.name}>
                                    {region.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="District"
                                className="p-1 border rounded-md text-sm w-24"
                                value={assignmentForm.district}
                                onChange={handleAssignmentChange}
                                name="district"
                              />
                              <button
                                className="bg-green-500 text-white px-2 py-1 rounded-md text-sm hover:bg-green-600"
                                onClick={(e) => handleAssignSubmit(e, measure.bestellnummer)}
                              >
                                Assign
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions Table */}
            <div className="bg-white p-4 rounded-md shadow-md">
              <h3 className="text-lg font-semibold mb-4">All Department Transactions</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border-b text-left">Transaction ID</th>
                      <th className="py-2 px-4 border-b text-left">Type</th>
                      <th className="py-2 px-4 border-b text-left">Date</th>
                      <th className="py-2 px-4 border-b text-left">Region</th>
                      <th className="py-2 px-4 border-b text-right">Amount</th>
                      <th className="py-2 px-4 border-b text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.transactions.map(tx => (
                      <tr 
                        key={tx.transaction_id || tx.measure_id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleTransactionClick(tx)}
                      >
                        <td className="py-2 px-4 border-b">{tx.transaction_id || tx.measure_id}</td>
                        <td className="py-2 px-4 border-b">
                          <span className={`px-2 py-1 rounded-md text-xs ${
                            tx.category === 'DIRECT_COST' ? 'bg-blue-100 text-blue-800' :
                            tx.category === 'BOOKED_MEASURE' ? 'bg-green-100 text-green-800' :
                            tx.category === 'PARKED_MEASURE' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {tx.category === 'DIRECT_COST' ? 'Direct' :
                             tx.category === 'BOOKED_MEASURE' ? 'SAP-MSP' :
                             tx.category === 'PARKED_MEASURE' ? 'Parked' :
                             tx.category || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-2 px-4 border-b">{tx.booking_date || tx.measure_date}</td>
                        <td className="py-2 px-4 border-b">{tx.region || '-'}</td>
                        <td className="py-2 px-4 border-b text-right">
                          {formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}
                        </td>
                        <td className="py-2 px-4 border-b">{tx.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Region Detail View */}
        {selectedDepartment && selectedRegion && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{selectedRegion} - Transactions</h2>
              <button 
                className="bg-gray-200 px-3 py-1 rounded-md text-sm hover:bg-gray-300"
                onClick={() => setSelectedRegion(null)}
              >
                Back to {selectedDepartment}
              </button>
            </div>

            {/* Transactions Table for Region */}
            <div className="bg-white p-4 rounded-md shadow-md">
              <h3 className="text-lg font-semibold mb-4">Region Transactions</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border-b text-left">Transaction ID</th>
                      <th className="py-2 px-4 border-b text-left">Type</th>
                      <th className="py-2 px-4 border-b text-left">Date</th>
                      <th className="py-2 px-4 border-b text-left">District</th>
                      <th className="py-2 px-4 border-b text-right">Amount</th>
                      <th className="py-2 px-4 border-b text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.transactions.map(tx => (
                      <tr 
                        key={tx.transaction_id || tx.measure_id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleTransactionClick(tx)}
                      >
                        <td className="py-2 px-4 border-b">{tx.transaction_id || tx.measure_id}</td>
                        <td className="py-2 px-4 border-b">
                          <span className={`px-2 py-1 rounded-md text-xs ${
                            tx.category === 'DIRECT_COST' ? 'bg-blue-100 text-blue-800' :
                            tx.category === 'BOOKED_MEASURE' ? 'bg-green-100 text-green-800' :
                            tx.category === 'PARKED_MEASURE' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {tx.category === 'DIRECT_COST' ? 'Direct' :
                             tx.category === 'BOOKED_MEASURE' ? 'SAP-MSP' :
                             tx.category === 'PARKED_MEASURE' ? 'Parked' :
                             tx.category || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-2 px-4 border-b">{tx.booking_date || tx.measure_date}</td>
                        <td className="py-2 px-4 border-b">{tx.district || '-'}</td>
                        <td className="py-2 px-4 border-b text-right">
                          {formatCurrency(tx.amount || tx.actual_amount || tx.estimated_amount)}
                        </td>
                        <td className="py-2 px-4 border-b">{tx.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                Transaction Details
              </h3>
              <button 
                onClick={handleCloseDetails}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-500 text-sm">Transaction Type</p>
                <p className="font-semibold">
                  <span className={`px-2 py-1 rounded-md text-xs ${
                    selectedTransaction.category === 'DIRECT_COST' ? 'bg-blue-100 text-blue-800' :
                    selectedTransaction.category === 'BOOKED_MEASURE' ? 'bg-green-100 text-green-800' :
                    selectedTransaction.category === 'PARKED_MEASURE' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedTransaction.category === 'DIRECT_COST' ? 'Direct Cost' :
                     selectedTransaction.category === 'BOOKED_MEASURE' ? 'SAP-MSP Booked Measure' :
                     selectedTransaction.category === 'PARKED_MEASURE' ? 'Parked Measure' :
                     selectedTransaction.category || 'Unknown'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">Transaction ID</p>
                <p className="font-semibold">{selectedTransaction.transaction_id || selectedTransaction.measure_id}</p>
              </div>
              {selectedTransaction.bestellnummer && (
                <div>
                  <p className="text-gray-500 text-sm">Bestellnummer</p>
                  <p className="font-semibold">{selectedTransaction.bestellnummer}</p>
                </div>
              )}
              {selectedTransaction.measure_title && (
                <div>
                  <p className="text-gray-500 text-sm">Measure Title</p>
                  <p className="font-semibold">{selectedTransaction.measure_title}</p>
                </div>
              )}
              <div>
                <p className="text-gray-500 text-sm">Department</p>
                <p className="font-semibold">{selectedTransaction.department}</p>
              </div>
              {selectedTransaction.region && (
                <div>
                  <p className="text-gray-500 text-sm">Region</p>
                  <p className="font-semibold">{selectedTransaction.region}</p>
                </div>
              )}
              {selectedTransaction.district && (
                <div>
                  <p className="text-gray-500 text-sm">District</p>
                  <p className="font-semibold">{selectedTransaction.district}</p>
                </div>
              )}
              
              {/* Financial information */}
              <div className="col-span-1 md:col-span-2 mt-2">
                <hr className="mb-4" />
                <h4 className="font-semibold mb-2">Financial Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(selectedTransaction.amount !== undefined || selectedTransaction.actual_amount !== undefined) && (
                    <div>
                      <p className="text-gray-500 text-sm">
                        {selectedTransaction.category === 'BOOKED_MEASURE' ? 'Actual Amount' : 'Amount'}
                      </p>
                      <p className="font-semibold">
                        {formatCurrency(selectedTransaction.amount || selectedTransaction.actual_amount)}
                      </p>
                    </div>
                  )}
                  
                  {selectedTransaction.estimated_amount !== undefined && (
                    <div>
                      <p className="text-gray-500 text-sm">Estimated Amount</p>
                      <p className="font-semibold">{formatCurrency(selectedTransaction.estimated_amount)}</p>
                    </div>
                  )}
                  
                  {selectedTransaction.variance !== undefined && (
                    <div>
                      <p className="text-gray-500 text-sm">Variance</p>
                      <p className={`font-semibold ${
                        selectedTransaction.variance > 0 ? 'text-red-600' : 
                        selectedTransaction.variance < 0 ? 'text-green-600' : ''
                      }`}>
                        {formatCurrency(selectedTransaction.variance)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Dates */}
              <div className="col-span-1 md:col-span-2 mt-2">
                <hr className="mb-4" />
                <h4 className="font-semibold mb-2">Timeline</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedTransaction.booking_date && (
                    <div>
                      <p className="text-gray-500 text-sm">Booking Date</p>
                      <p className="font-semibold">{selectedTransaction.booking_date}</p>
                    </div>
                  )}
                  
                  {selectedTransaction.measure_date && (
                    <div>
                      <p className="text-gray-500 text-sm">Measure Date</p>
                      <p className="font-semibold">{selectedTransaction.measure_date}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Status */}
              <div className="col-span-1 md:col-span-2 mt-2">
                <hr className="mb-4" />
                <h4 className="font-semibold mb-2">Status Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 text-sm">Status</p>
                    <p className="font-semibold">{selectedTransaction.status}</p>
                  </div>
                  
                  <div>
                    <p className="text-gray-500 text-sm">Budget Impact</p>
                    <p className="font-semibold">{selectedTransaction.budget_impact || 'Unknown'}</p>
                  </div>
                  
                  {selectedTransaction.previously_parked !== undefined && (
                    <div>
                      <p className="text-gray-500 text-sm">Previously Parked</p>
                      <p className="font-semibold">{selectedTransaction.previously_parked ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Additional information for booked measures */}
              {selectedTransaction.category === 'BOOKED_MEASURE' && (
                <div className="col-span-1 md:col-span-2 mt-2">
                  <hr className="mb-4" />
                  <h4 className="font-semibold mb-2">Related Information</h4>
                  <div className="grid grid-cols-1 gap-4">
                    {selectedTransaction.text && (
                      <div>
                        <p className="text-gray-500 text-sm">Transaction Text</p>
                        <p className="font-semibold">{selectedTransaction.text}</p>
                      </div>
                    )}
                    
                    {selectedTransaction.msp_data?.Name && (
                      <div>
                        <p className="text-gray-500 text-sm">Requester</p>
                        <p className="font-semibold">{selectedTransaction.msp_data.Name}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Manual assignment section for parked measures */}
              {selectedTransaction.category === 'PARKED_MEASURE' && 
               selectedTransaction.status === 'Awaiting Assignment' && (
                <div className="col-span-1 md:col-span-2 mt-2">
                  <hr className="mb-4" />
                  <h4 className="font-semibold mb-2">Manual Assignment</h4>
                  <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={(e) => handleAssignSubmit(e, selectedTransaction.bestellnummer)}>
                    <div>
                      <label className="block text-gray-500 text-sm mb-1">Region</label>
                      <select
                        name="region"
                        value={assignmentForm.region}
                        onChange={handleAssignmentChange}
                        className="w-full p-2 border rounded-md"
                        required
                      >
                        <option value="">Select Region</option>
                        {departmentRegions.map(region => (
                          <option key={region.name} value={region.name}>{region.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-gray-500 text-sm mb-1">District</label>
                      <input
                        type="text"
                        name="district"
                        value={assignmentForm.district}
                        onChange={handleAssignmentChange}
                        className="w-full p-2 border rounded-md"
                        required
                        placeholder="Enter district name"
                      />
                    </div>
                    
                    <div className="col-span-1 md:col-span-2">
                      <button
                        type="submit"
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 w-full"
                      >
                        Assign to Region/District
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-6">
              <button 
                onClick={handleCloseDetails}
                className="bg-gray-200 px-4 py-2 rounded-md hover:bg-gray-300"
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