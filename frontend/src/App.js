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
        console.log('🚀 Starting API call...');
        setLoading(true);
        
        const response = await fetch('/api/data');
        console.log('📡 Response received:', response);
        console.log('📊 Response status:', response.status);
        console.log('📋 Response ok:', response.ok);
        
        // Get the raw text response
        const textResponse = await response.text();
        console.log('📝 Raw response (first 500 chars):', textResponse.substring(0, 500));
        console.log('📝 Raw response type:', typeof textResponse);
        
        if (!response.ok) {
          console.log('❌ Response not OK, status:', response.status);
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        // Try to parse as JSON
        console.log('🔄 Attempting to parse JSON...');
        const data = JSON.parse(textResponse);
        console.log('✅ Parsed JSON successfully:', data);
        setApiData(data);
        setLoading(false);
      } catch (err) {
        console.error('❌ Error details:', err);
        console.error('❌ Error type:', typeof err);
        console.error('❌ Error message:', err.message);
        console.error('❌ Full error:', err);
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