import React, { useState, useEffect } from 'react';

const TransactionDebugger = ({ baseApiUrl, selectedDepartment, selectedRegion }) => {
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRawData, setShowRawData] = useState(false);

  // Fetch transaction data
  const fetchDebugData = async () => {
    if (!baseApiUrl) {
      setError('No API URL provided');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;

      // Build URL with filters if department is selected
      let url = `${normalizedApiUrl}/api/transactions`;
      if (selectedDepartment) {
        url += `?department=${encodeURIComponent(selectedDepartment)}`;
      }

      console.log('🔍 TransactionDebugger: Fetching from:', url);

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔍 TransactionDebugger: Raw API Response:', data);

      setDebugData(data);
    } catch (err) {
      console.error('❌ TransactionDebugger: Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on component mount and when filters change
  useEffect(() => {
    fetchDebugData();
  }, [baseApiUrl, selectedDepartment, selectedRegion]);

  if (loading) {
    return (
      <div style={{ 
        padding: '20px', 
        border: '2px solid #007acc', 
        borderRadius: '8px', 
        margin: '20px 0',
        backgroundColor: '#f0f8ff'
      }}>
        <h3>🔍 Transaction Debugger</h3>
        <p>Loading transaction data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '20px', 
        border: '2px solid #dc3545', 
        borderRadius: '8px', 
        margin: '20px 0',
        backgroundColor: '#fff5f5'
      }}>
        <h3>🔍 Transaction Debugger</h3>
        <p style={{ color: '#dc3545' }}>❌ Error: {error}</p>
        <button onClick={fetchDebugData} style={{ marginTop: '10px' }}>
          🔄 Retry
        </button>
      </div>
    );
  }

  if (!debugData) {
    return (
      <div style={{ 
        padding: '20px', 
        border: '2px solid #ffc107', 
        borderRadius: '8px', 
        margin: '20px 0',
        backgroundColor: '#fffbf0'
      }}>
        <h3>🔍 Transaction Debugger</h3>
        <p>No data available</p>
        <button onClick={fetchDebugData}>
          🔄 Fetch Data
        </button>
      </div>
    );
  }

  // Extract data arrays
  const allTransactions = debugData.transactions || [];
  const parkedMeasures = debugData.parked_measures || [];
  const bookedMeasures = debugData.booked_measures || [];
  const directCosts = debugData.direct_costs || [];
  const outliers = debugData.outliers || [];

  // Categorize transactions by type
  const transactionsByCategory = {
    'BOOKED_MEASURE': allTransactions.filter(tx => tx.category === 'BOOKED_MEASURE'),
    'PARKED_MEASURE': allTransactions.filter(tx => tx.category === 'PARKED_MEASURE'),
    'UNASSIGNED_MEASURE': allTransactions.filter(tx => tx.category === 'UNASSIGNED_MEASURE'),
    'DIRECT_COST': allTransactions.filter(tx => tx.category === 'DIRECT_COST'),
    'OUTLIER': allTransactions.filter(tx => tx.category === 'OUTLIER')
  };

  return (
    <div style={{ 
      padding: '20px', 
      border: '2px solid #28a745', 
      borderRadius: '8px', 
      margin: '20px 0',
      backgroundColor: '#f8fff9',
      fontFamily: 'monospace, Arial'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3>🔍 Transaction Debugger</h3>
        <div>
          <button 
            onClick={fetchDebugData}
            style={{ marginRight: '10px', padding: '5px 10px' }}
          >
            🔄 Refresh
          </button>
          <button 
            onClick={() => setShowRawData(!showRawData)}
            style={{ padding: '5px 10px' }}
          >
            {showRawData ? '📊 Show Summary' : '🗂️ Show Raw Data'}
          </button>
        </div>
      </div>

      {/* Filters Applied */}
      <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
        <strong>🔧 Current Filters:</strong>
        <br />
        Department: {selectedDepartment || 'None'}
        <br />
        Region: {selectedRegion || 'None'}
        <br />
        API URL: {baseApiUrl}
      </div>

      {showRawData ? (
        /* Raw Data View */
        <div>
          <h4>📋 Raw API Response</h4>
          <pre style={{ 
            backgroundColor: '#f1f1f1', 
            padding: '10px', 
            borderRadius: '4px', 
            overflow: 'auto',
            maxHeight: '400px',
            fontSize: '12px'
          }}>
            {JSON.stringify(debugData, null, 2)}
          </pre>
        </div>
      ) : (
        /* Summary View */
        <div>
          {/* Overview Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
            <div style={{ padding: '10px', backgroundColor: '#007acc', color: 'white', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{allTransactions.length}</div>
              <div>All Transactions</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{bookedMeasures.length}</div>
              <div>Booked Measures</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#ffc107', color: 'black', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{parkedMeasures.length}</div>
              <div>Parked Measures</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#dc3545', color: 'white', borderRadius: '4px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{directCosts.length}</div>
              <div>Direct Costs</div>
            </div>
          </div>

          {/* Breakdown by Category */}
          <h4>📊 Transactions by Category</h4>
          <div style={{ marginBottom: '20px' }}>
            {Object.entries(transactionsByCategory).map(([category, transactions]) => (
              <div key={category} style={{ marginBottom: '10px' }}>
                <strong>{category}:</strong> {transactions.length} transactions
                {transactions.length > 0 && (
                  <ul style={{ marginLeft: '20px', fontSize: '12px' }}>
                    {transactions.slice(0, 3).map((tx, idx) => (
                      <li key={idx}>
                        ID: {tx.transaction_id || tx.measure_id || 'No ID'} | 
                        Amount: €{tx.amount || tx.actual_amount || tx.estimated_amount || 0} | 
                        Status: {tx.status} | 
                        Dept: {tx.department || 'N/A'}
                      </li>
                    ))}
                    {transactions.length > 3 && <li>... and {transactions.length - 3} more</li>}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Separate Arrays */}
          <h4>📋 Separate Arrays from API</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {/* Booked Measures */}
            <div style={{ border: '1px solid #28a745', borderRadius: '4px', padding: '10px' }}>
              <h5 style={{ color: '#28a745', margin: '0 0 10px 0' }}>✅ Booked Measures ({bookedMeasures.length})</h5>
              {bookedMeasures.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No booked measures found</p>
              ) : (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {bookedMeasures.slice(0, 5).map((measure, idx) => (
                    <div key={idx} style={{ marginBottom: '8px', padding: '5px', backgroundColor: '#f8fff9', borderRadius: '3px', fontSize: '12px' }}>
                      <div><strong>Bestellnummer:</strong> {measure.bestellnummer}</div>
                      <div><strong>Title:</strong> {measure.measure_title || 'N/A'}</div>
                      <div><strong>Amount:</strong> €{measure.actual_amount || 0}</div>
                      <div><strong>Department:</strong> {measure.department}</div>
                      <div><strong>Status:</strong> {measure.status}</div>
                    </div>
                  ))}
                  {bookedMeasures.length > 5 && <p>... and {bookedMeasures.length - 5} more</p>}
                </div>
              )}
            </div>

            {/* Parked Measures */}
            <div style={{ border: '1px solid #ffc107', borderRadius: '4px', padding: '10px' }}>
              <h5 style={{ color: '#b8860b', margin: '0 0 10px 0' }}>⏳ Parked Measures ({parkedMeasures.length})</h5>
              {parkedMeasures.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>No parked measures found</p>
              ) : (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {parkedMeasures.slice(0, 5).map((measure, idx) => (
                    <div key={idx} style={{ marginBottom: '8px', padding: '5px', backgroundColor: '#fffbf0', borderRadius: '3px', fontSize: '12px' }}>
                      <div><strong>Bestellnummer:</strong> {measure.bestellnummer}</div>
                      <div><strong>Title:</strong> {measure.measure_title || 'N/A'}</div>
                      <div><strong>Estimated:</strong> €{measure.estimated_amount || 0}</div>
                      <div><strong>Department:</strong> {measure.department}</div>
                      <div><strong>Status:</strong> {measure.status}</div>
                      <div><strong>Category:</strong> {measure.category}</div>
                    </div>
                  ))}
                  {parkedMeasures.length > 5 && <p>... and {parkedMeasures.length - 5} more</p>}
                </div>
              )}
            </div>
          </div>

          {/* API Response Structure */}
          <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <h5>🗂️ API Response Structure</h5>
            <div style={{ fontSize: '12px' }}>
              <div><strong>Available Keys:</strong> {Object.keys(debugData).join(', ')}</div>
              <div><strong>Summary:</strong> {debugData.summary ? 'Present' : 'Missing'}</div>
              <div><strong>Statistics:</strong> {debugData.statistics ? 'Present' : 'Missing'}</div>
              <div><strong>Processing Date:</strong> {debugData.processing_date || 'Not available'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionDebugger;