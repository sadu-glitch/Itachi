import React, { useState, useEffect } from 'react';

const DatabaseAPITester = () => {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [apiUrl, setApiUrl] = useState('https://msp-sap-api2-h5dmf6e6d4fngcbf.germanywestcentral-01.azurewebsites.net'); // Database API
  const [testData, setTestData] = useState({
    bestellnummer: 3597,
    region: 'Stuttgart',
    district: 'Stuttgart'
  });

  // Helper function to make API calls
  const apiCall = async (endpoint, method = 'GET', body = null, headers = {}) => {
    const url = `${apiUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json', 
        'X-User-Name': 'Frontend Test User',
        'X-Change-Reason': 'Testing database integration',
        ...headers
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
      console.log('Sending body:', options.body);  // ✅ Add debug log
    }

    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  };

  // 🔍 FIXED: Debug function (removed JSX from inside function)
  const testDebugRequest = async () => {
    setLoading(prev => ({ ...prev, debug: true }));
    try {
      const result = await apiCall('/api/debug-request', 'POST', testData);
      console.log('Debug result:', result.data);
      setResults(prev => ({ 
        ...prev, 
        debug: { 
          success: result.status === 200, 
          data: result.data,
          message: 'Debug request completed'
        }
      }));
    } catch (error) {
      console.error('Debug failed:', error);
      setResults(prev => ({ 
        ...prev, 
        debug: { 
          success: false, 
          error: error.message,
          message: 'Debug request failed'
        }
      }));
    }
    setLoading(prev => ({ ...prev, debug: false }));
  };

  // Test functions
  const testHealthCheck = async () => {
    setLoading(prev => ({ ...prev, health: true }));
    try {
      const result = await apiCall('/api/health');
      setResults(prev => ({ 
        ...prev, 
        health: { 
          success: result.status === 200, 
          data: result.data,
          message: result.data.status === 'healthy' ? 'Database API is healthy!' : 'API has issues'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        health: { 
          success: false, 
          error: error.message,
          message: 'Failed to connect to API'
        }
      }));
    }
    setLoading(prev => ({ ...prev, health: false }));
  };

  const testDatabaseStatus = async () => {
    setLoading(prev => ({ ...prev, dbStatus: true }));
    try {
      const result = await apiCall('/api/database-status');
      setResults(prev => ({ 
        ...prev, 
        dbStatus: { 
          success: result.status === 200 && result.data.database_connected, 
          data: result.data,
          message: result.data.database_connected ? 'Database connected!' : 'Database connection failed'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        dbStatus: { 
          success: false, 
          error: error.message,
          message: 'Database status check failed'
        }
      }));
    }
    setLoading(prev => ({ ...prev, dbStatus: false }));
  };

  const testGetData = async () => {
    setLoading(prev => ({ ...prev, getData: true }));
    try {
      const result = await apiCall('/api/data');
      const hasData = result.data.departments && result.data.regions && result.data.awaiting_assignment;
      setResults(prev => ({ 
        ...prev, 
        getData: { 
          success: result.status === 200 && hasData, 
          data: {
            departments_count: Object.keys(result.data.departments?.departments || {}).length,
            regions_count: Object.keys(result.data.regions?.regions || {}).length,
            awaiting_count: Object.keys(result.data.awaiting_assignment || {}).length,
            transaction_stats: result.data.transaction_stats
          },
          message: hasData ? 'Successfully fetched all data!' : 'Missing some data'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        getData: { 
          success: false, 
          error: error.message,
          message: 'Failed to fetch data'
        }
      }));
    }
    setLoading(prev => ({ ...prev, getData: false }));
  };

  const testGetTransactions = async () => {
    setLoading(prev => ({ ...prev, getTransactions: true }));
    try {
      const result = await apiCall('/api/transactions?category=UNASSIGNED_MEASURE&limit=5');
      setResults(prev => ({ 
        ...prev, 
        getTransactions: { 
          success: result.status === 200, 
          data: {
            total: result.data.total,
            returned: result.data.transactions?.length || 0,
            sample_transaction: result.data.transactions?.[0] || null
          },
          message: `Found ${result.data.total || 0} unassigned measures`
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        getTransactions: { 
          success: false, 
          error: error.message,
          message: 'Failed to fetch transactions'
        }
      }));
    }
    setLoading(prev => ({ ...prev, getTransactions: false }));
  };

  const testGetBudgetAllocation = async () => {
    setLoading(prev => ({ ...prev, getBudget: true }));
    try {
      const result = await apiCall('/api/budget-allocation');
      setResults(prev => ({ 
        ...prev, 
        getBudget: { 
          success: result.status === 200, 
          data: {
            departments_count: Object.keys(result.data.departments || {}).length,
            regions_count: Object.keys(result.data.regions || {}).length,
            last_updated: result.data.last_updated
          },
          message: 'Budget allocation retrieved successfully!'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        getBudget: { 
          success: false, 
          error: error.message,
          message: 'Failed to get budget allocation'
        }
      }));
    }
    setLoading(prev => ({ ...prev, getBudget: false }));
  };

  const testAssignMeasure = async () => {
    setLoading(prev => ({ ...prev, assignMeasure: true }));
    try {
      const result = await apiCall('/api/assign-measure', 'POST', testData);
      setResults(prev => ({ 
        ...prev, 
        assignMeasure: { 
          success: result.status === 200, 
          data: result.data,
          message: result.data.message || 'Assignment operation completed'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        assignMeasure: { 
          success: false, 
          error: error.message,
          message: 'Failed to assign measure'
        }
      }));
    }
    setLoading(prev => ({ ...prev, assignMeasure: false }));
  };

  const testUnassignMeasure = async () => {
    setLoading(prev => ({ ...prev, unassignMeasure: true }));
    try {
      const result = await apiCall('/api/assign-measure', 'POST', {
        bestellnummer: testData.bestellnummer,
        region: '',
        district: '',
        unassign: true
      });
      setResults(prev => ({ 
        ...prev, 
        unassignMeasure: { 
          success: result.status === 200, 
          data: result.data,
          message: result.data.message || 'Unassignment operation completed'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        unassignMeasure: { 
          success: false, 
          error: error.message,
          message: 'Failed to unassign measure'
        }
      }));
    }
    setLoading(prev => ({ ...prev, unassignMeasure: false }));
  };

  const testUpdateBudget = async () => {
    setLoading(prev => ({ ...prev, updateBudget: true }));
    try {
      const testBudgetData = {
        departments: {
          "Abteilung Baden-Württemberg (BW)|Floor": {
            allocated_budget: 50000,
            location_type: "Floor"
          }
        },
        regions: {
          "Abteilung Baden-Württemberg (BW)|Stuttgart|Floor": {
            allocated_budget: 25000,
            location_type: "Floor"
          },
          "Abteilung Baden-Württemberg (BW)|Ulm|Floor": {
            allocated_budget: 25000,
            location_type: "Floor"
          }
        }
      };

      const result = await apiCall('/api/budget-allocation', 'POST', testBudgetData);
      setResults(prev => ({ 
        ...prev, 
        updateBudget: { 
          success: result.status === 200, 
          data: result.data,
          message: result.data.message || 'Budget update completed'
        }
      }));
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        updateBudget: { 
          success: false, 
          error: error.message,
          message: 'Failed to update budget'
        }
      }));
    }
    setLoading(prev => ({ ...prev, updateBudget: false }));
  };

  const runAllTests = async () => {
    await testHealthCheck();
    await testDatabaseStatus();
    await testGetData();
    await testGetTransactions();
    await testGetBudgetAllocation();
  };

  // Auto-run health check on component mount
  useEffect(() => {
    testHealthCheck();
  }, [apiUrl]);

  const ResultCard = ({ title, result, isLoading }) => (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      backgroundColor: 'white'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{title}</h3>
        {result && (
          <span style={{
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            backgroundColor: result.success ? '#d4edda' : '#f8d7da',
            color: result.success ? '#155724' : '#721c24'
          }}>
            {result.success ? '✅ PASS' : '❌ FAIL'}
          </span>
        )}
      </div>
      
      {isLoading && (
        <div style={{ color: '#0066cc', fontStyle: 'italic' }}>
          🔄 Testing...
        </div>
      )}
      
      {result && !isLoading && (
        <div>
          <p style={{
            margin: '0 0 8px 0',
            fontWeight: 'bold',
            color: result.success ? '#155724' : '#721c24'
          }}>
            {result.message}
          </p>
          
          {result.data && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', color: '#0066cc' }}>
                View Response Data
              </summary>
              <pre style={{
                marginTop: '8px',
                padding: '8px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </details>
          )}
          
          {result.error && (
            <div style={{
              marginTop: '8px',
              padding: '8px',
              backgroundColor: '#f8d7da',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#721c24'
            }}>
              <strong>Error:</strong> {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
          🗄️ Database API Tester
        </h1>
        <p style={{ color: '#666', margin: 0 }}>
          Test database integration vs blob storage compatibility
        </p>
      </div>

      {/* API URL Configuration */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#e3f2fd',
        borderRadius: '8px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
          API Configuration
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
            placeholder="API URL (e.g., http://localhost:5001)"
          />
          <button
            onClick={runAllTests}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            🔄 Run All GET Tests
          </button>
        </div>
      </div>

      {/* Test Assignment Data */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#fff3cd',
        borderRadius: '8px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
          Test Assignment Data
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <input
            type="number"
            value={testData.bestellnummer}
            onChange={(e) => setTestData(prev => ({ ...prev, bestellnummer: parseInt(e.target.value) }))}
            style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px' }}
            placeholder="Bestellnummer"
          />
          <input
            type="text"
            value={testData.region}
            onChange={(e) => setTestData(prev => ({ ...prev, region: e.target.value }))}
            style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px' }}
            placeholder="Region"
          />
          <input
            type="text"
            value={testData.district}
            onChange={(e) => setTestData(prev => ({ ...prev, district: e.target.value }))}
            style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px' }}
            placeholder="District"
          />
        </div>
      </div>

      {/* 🔍 DEBUG SECTION - Add this before the main tests */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#fff8e1',
        borderRadius: '8px',
        border: '2px solid #ff9800'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#e65100' }}>
          🔍 Debug Section
        </h2>
        <p style={{ fontSize: '14px', color: '#ef6c00', marginBottom: '12px' }}>
          Use this to debug the assign/unassign issue
        </p>
        
        <ResultCard
          title="Debug Request"
          result={results.debug}
          isLoading={loading.debug}
        />
        
        <button
          onClick={testDebugRequest}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#ff9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '16px'
          }}
          disabled={loading.debug}
        >
          🔍 Debug Request Data
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* GET Tests */}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#28a745' }}>
            📥 GET Tests (Read Operations)
          </h2>
          
          <ResultCard
            title="Health Check"
            result={results.health}
            isLoading={loading.health}
          />
          
          <ResultCard
            title="Database Status"
            result={results.dbStatus}
            isLoading={loading.dbStatus}
          />
          
          <ResultCard
            title="Get All Data"
            result={results.getData}
            isLoading={loading.getData}
          />
          
          <ResultCard
            title="Get Transactions"
            result={results.getTransactions}
            isLoading={loading.getTransactions}
          />
          
          <ResultCard
            title="Get Budget Allocation"
            result={results.getBudget}
            isLoading={loading.getBudget}
          />

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={testGetData}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              disabled={loading.getData}
            >
              Test Get Data
            </button>
            <button
              onClick={testGetTransactions}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              disabled={loading.getTransactions}
            >
              Test Transactions
            </button>
          </div>
        </div>

        {/* POST Tests */}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#fd7e14' }}>
            📤 POST Tests (Write Operations)
          </h2>
          
          <ResultCard
            title="Assign Measure"
            result={results.assignMeasure}
            isLoading={loading.assignMeasure}
          />
          
          <ResultCard
            title="Unassign Measure"
            result={results.unassignMeasure}
            isLoading={loading.unassignMeasure}
          />
          
          <ResultCard
            title="Update Budget"
            result={results.updateBudget}
            isLoading={loading.updateBudget}
          />

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={testAssignMeasure}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#fd7e14',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              disabled={loading.assignMeasure}
            >
              Test Assign
            </button>
            <button
              onClick={testUnassignMeasure}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: '#fd7e14',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              disabled={loading.unassignMeasure}
            >
              Test Unassign
            </button>
          </div>
          
          <button
            onClick={testUpdateBudget}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginBottom: '16px'
            }}
            disabled={loading.updateBudget}
          >
            Test Budget Update
          </button>

          <div style={{
            padding: '12px',
            backgroundColor: '#fff3cd',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#856404'
          }}>
            <strong>⚠️ Note:</strong> POST tests will modify data in your database. 
            Use with caution in production environments.
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
          Test Summary
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
              {Object.values(results).filter(r => r?.success).length}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Passed</div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
              {Object.values(results).filter(r => r?.success === false).length}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Failed</div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0066cc' }}>
              {Object.values(loading).filter(Boolean).length}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Running</div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#666' }}>
              {Object.keys(results).length}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total Tests</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseAPITester;