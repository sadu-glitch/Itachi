import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import TransactionsList from './components/TransactionsList';
import './styles.css';

function App() {
  const [apiData, setApiData] = useState({
    departments: [],
    regions: [],
    awaiting_assignment: [],
    budget_allocation: {},
    transaction_stats: {}
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Replace with your actual API endpoint
  const API_URL = 'https://msp-sap-api2-h5dmf6e6d4fngcbf.germanywestcentral-01.azurewebsites.net/';

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_URL}/api/data`);
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        setApiData(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="app">
      <Header />
      
      {loading ? (
        <div className="loading">Loading data...</div>
      ) : error ? (
        <div className="error">Error: {error}</div>
      ) : (
        <>
          <Dashboard 
            stats={apiData.transaction_stats} 
            budgetData={apiData.budget_allocation} 
          />
          
          <TransactionsList 
            awaitingAssignment={apiData.awaiting_assignment}
            apiUrl={API_URL} 
          />
        </>
      )}
    </div>
  );
}

export default App;