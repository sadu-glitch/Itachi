import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Use relative URL - Azure Static Web Apps automatically routes /api/* to your API
        const response = await fetch('/api/data');
        
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
            awaitingAssignment={apiData.awaiting_assignment}
            apiUrl=""  // Pass empty string or remove this prop
          />
        </>
      )}
    </div>
  );
}

export default App;