import React, { useState } from 'react';

const APIDiagnostic = ({ baseApiUrl }) => {
  const [diagnosticData, setDiagnosticData] = useState({});
  const [loading, setLoading] = useState(false);

  const testEndpoint = async (endpoint, label) => {
    try {
      setLoading(true);
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;

      console.log(`🔍 Testing ${label}: ${normalizedApiUrl}${endpoint}`);
      
      const response = await fetch(`${normalizedApiUrl}${endpoint}`);
      const data = await response.json();
      
      console.log(`✅ ${label} Response:`, data);
      
      return {
        success: true,
        data: data,
        responseSize: JSON.stringify(data).length,
        keys: Object.keys(data),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ ${label} Error:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  };

  const runDiagnostics = async () => {
    setLoading(true);
    
    const results = {};
    
    // Test multiple endpoints
    results.data = await testEndpoint('/api/data', 'API Data');
    results.transactions = await testEndpoint('/api/transactions', 'API Transactions');
    results.transactionsFixed = await testEndpoint('/api/transactions-fixed', 'API Transactions Fixed');
    results.debugData = await testEndpoint('/api/debug-data', 'API Debug Data');
    
    setDiagnosticData(results);
    setLoading(false);
  };

  const formatValue = (value) => {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return `Array[${value.length}]`;
      }
      return `Object{${Object.keys(value).length} keys}`;
    }
    return String(value);
  };

  return (
    <div style={{ 
      padding: '20px', 
      border: '3px solid #ff6b35', 
      borderRadius: '8px', 
      margin: '20px 0',
      backgroundColor: '#fff5f5',
      fontFamily: 'monospace'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3>🚨 API Diagnostic Tool</h3>
        <button 
          onClick={runDiagnostics}
          disabled={loading}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#ff6b35', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '🔄 Running...' : '🔍 Run Diagnostics'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div>⏳ Testing API endpoints...</div>
        </div>
      )}

      {Object.keys(diagnosticData).length > 0 && (
        <div>
          {Object.entries(diagnosticData).map(([endpointName, result]) => (
            <div key={endpointName} style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              backgroundColor: result.success ? '#f0fff0' : '#fff0f0',
              border: `1px solid ${result.success ? '#28a745' : '#dc3545'}`,
              borderRadius: '4px'
            }}>
              <h4 style={{ 
                margin: '0 0 10px 0', 
                color: result.success ? '#28a745' : '#dc3545' 
              }}>
                {result.success ? '✅' : '❌'} {endpointName.toUpperCase()}
              </h4>
              
              {result.success ? (
                <div>
                  <div><strong>Response Size:</strong> {result.responseSize} bytes</div>
                  <div><strong>Keys:</strong> {result.keys.join(', ')}</div>
                  <div><strong>Timestamp:</strong> {result.timestamp}</div>
                  
                  {/* Special handling for different endpoints */}
                  {endpointName === 'data' && result.data.transaction_stats && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                      <strong>📊 Transaction Stats from /api/data:</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        {Object.entries(result.data.transaction_stats).map(([key, value]) => (
                          <li key={key}>{key}: {value}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {(endpointName === 'transactions' || endpointName === 'transactionsFixed') && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                      <strong>📋 Transaction Arrays:</strong>
                      <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                        <li>transactions: {formatValue(result.data.transactions)}</li>
                        <li>booked_measures: {formatValue(result.data.booked_measures)}</li>
                        <li>parked_measures: {formatValue(result.data.parked_measures)}</li>
                        <li>direct_costs: {formatValue(result.data.direct_costs)}</li>
                        <li>outliers: {formatValue(result.data.outliers)}</li>
                      </ul>
                      
                      {result.data.summary && (
                        <div style={{ marginTop: '10px' }}>
                          <strong>📈 Summary:</strong>
                          <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                            <li>Total transactions: {result.data.summary.total_transactions}</li>
                            <li>Filtered transactions: {result.data.summary.filtered_transactions}</li>
                            {result.data.summary.by_category && Object.entries(result.data.summary.by_category).map(([cat, count]) => (
                              <li key={cat}>{cat}: {count}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {endpointName === 'debugData' && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                      <strong>🔧 Debug Info:</strong>
                      <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '200px' }}>
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: '#dc3545' }}>
                  <strong>Error:</strong> {result.error}
                </div>
              )}
            </div>
          ))}
          
          {/* Analysis Section */}
          <div style={{ 
            marginTop: '20px', 
            padding: '15px', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffc107', 
            borderRadius: '4px' 
          }}>
            <h4>🕵️ Analysis</h4>
            {diagnosticData.data?.success && diagnosticData.transactions?.success && (
              <div>
                {/* Compare stats between endpoints */}
                {diagnosticData.data.data.transaction_stats && (
                  <div>
                    <strong>🔍 Data Mismatch Analysis:</strong>
                    <ul style={{ marginLeft: '20px' }}>
                      <li>
                        /api/data shows {diagnosticData.data.data.transaction_stats.booked_measures_count} booked measures, 
                        but /api/transactions shows {diagnosticData.transactions.data.booked_measures?.length || 0}
                      </li>
                      <li>
                        /api/data shows {diagnosticData.data.data.transaction_stats.parked_measures_count} parked measures, 
                        but /api/transactions shows {diagnosticData.transactions.data.parked_measures?.length || 0}
                      </li>
                      <li>
                        /api/data shows {diagnosticData.data.data.transaction_stats.direct_costs_count} direct costs, 
                        but /api/transactions shows {diagnosticData.transactions.data.direct_costs?.length || 0}
                      </li>
                    </ul>
                    
                    {diagnosticData.data.data.transaction_stats.booked_measures_count > 0 && 
                     (!diagnosticData.transactions.data.booked_measures || diagnosticData.transactions.data.booked_measures.length === 0) && (
                      <div style={{ 
                        marginTop: '10px', 
                        padding: '10px', 
                        backgroundColor: '#f8d7da', 
                        border: '1px solid #dc3545', 
                        borderRadius: '4px',
                        color: '#721c24'
                      }}>
                        <strong>🚨 ISSUE DETECTED:</strong> Booked measures exist in database but are not being parsed correctly in /api/transactions
                      </div>
                    )}
                    
                    {diagnosticData.data.data.transaction_stats.parked_measures_count > 0 && 
                     (!diagnosticData.transactions.data.parked_measures || diagnosticData.transactions.data.parked_measures.length === 0) && (
                      <div style={{ 
                        marginTop: '10px', 
                        padding: '10px', 
                        backgroundColor: '#f8d7da', 
                        border: '1px solid #dc3545', 
                        borderRadius: '4px',
                        color: '#721c24'
                      }}>
                        <strong>🚨 ISSUE DETECTED:</strong> Parked measures exist in database but are not being parsed correctly in /api/transactions
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default APIDiagnostic;