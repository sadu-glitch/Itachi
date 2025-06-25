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
        const response = await fetch('/api/data');
        
        // Add this debug line to see what we're actually getting
        const textResponse = await response.text();
        console.log('Raw response:', textResponse);
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        // Try to parse as JSON
        const data = JSON.parse(textResponse);
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
            apiUrl=""
          />
        </>
      )}
    </div>
  );
}

export default App;