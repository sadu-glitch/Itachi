import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Database, Loader, RefreshCw, Download, Upload } from 'lucide-react';

const DatabaseAPITester = () => {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});
  const [apiUrl, setApiUrl] = useState('http://localhost:5001'); // Database API
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
        'X-User-Name': 'Frontend Test User',
        'X-Change-Reason': 'Testing database integration',
        ...headers
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
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
    // Note: Skipping POST tests in "run all" to avoid data changes
  };

  // Auto-run health check on component mount
  useEffect(() => {
    testHealthCheck();
  }, [apiUrl]);

  const ResultCard = ({ title, result, isLoading, icon: Icon }) => (
    <div className="border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={20} className="text-blue-600" />
          <h3 className="font-semibold">{title}</h3>
        </div>
        {result && (
          result.success ? 
            <CheckCircle size={20} className="text-green-600" /> : 
            <AlertCircle size={20} className="text-red-600" />
        )}
      </div>
      
      {isLoading && (
        <div className="flex items-center gap-2 text-blue-600">
          <Loader size={16} className="animate-spin" />
          <span>Testing...</span>
        </div>
      )}
      
      {result && !isLoading && (
        <div>
          <p className={`font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.message}
          </p>
          
          {result.data && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
          
          {result.error && (
            <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
              <strong>Error:</strong> {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Database className="text-blue-600" />
          Database API Tester
        </h1>
        <p className="text-gray-600">Test database integration vs blob storage compatibility</p>
      </div>

      {/* API URL Configuration */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="font-semibold mb-2">API Configuration</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="flex-1 px-3 py-2 border rounded"
            placeholder="API URL (e.g., http://localhost:5001)"
          />
          <button
            onClick={runAllTests}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Run All GET Tests
          </button>
        </div>
      </div>

      {/* Test Assignment Data */}
      <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
        <h2 className="font-semibold mb-2">Test Assignment Data</h2>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            value={testData.bestellnummer}
            onChange={(e) => setTestData(prev => ({ ...prev, bestellnummer: parseInt(e.target.value) }))}
            className="px-3 py-2 border rounded"
            placeholder="Bestellnummer"
          />
          <input
            type="text"
            value={testData.region}
            onChange={(e) => setTestData(prev => ({ ...prev, region: e.target.value }))}
            className="px-3 py-2 border rounded"
            placeholder="Region"
          />
          <input
            type="text"
            value={testData.district}
            onChange={(e) => setTestData(prev => ({ ...prev, district: e.target.value }))}
            className="px-3 py-2 border rounded"
            placeholder="District"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GET Tests */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-green-700">📥 GET Tests (Read Operations)</h2>
          
          <ResultCard
            title="Health Check"
            result={results.health}
            isLoading={loading.health}
            icon={CheckCircle}
          />
          
          <ResultCard
            title="Database Status"
            result={results.dbStatus}
            isLoading={loading.dbStatus}
            icon={Database}
          />
          
          <ResultCard
            title="Get All Data"
            result={results.getData}
            isLoading={loading.getData}
            icon={Download}
          />
          
          <ResultCard
            title="Get Transactions"
            result={results.getTransactions}
            isLoading={loading.getTransactions}
            icon={Download}
          />
          
          <ResultCard
            title="Get Budget Allocation"
            result={results.getBudget}
            isLoading={loading.getBudget}
            icon={Download}
          />

          <div className="flex gap-2 mb-4">
            <button
              onClick={testGetData}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              disabled={loading.getData}
            >
              Test Get Data
            </button>
            <button
              onClick={testGetTransactions}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              disabled={loading.getTransactions}
            >
              Test Transactions
            </button>
          </div>
        </div>

        {/* POST Tests */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-orange-700">📤 POST Tests (Write Operations)</h2>
          
          <ResultCard
            title="Assign Measure"
            result={results.assignMeasure}
            isLoading={loading.assignMeasure}
            icon={Upload}
          />
          
          <ResultCard
            title="Unassign Measure"
            result={results.unassignMeasure}
            isLoading={loading.unassignMeasure}
            icon={Upload}
          />
          
          <ResultCard
            title="Update Budget"
            result={results.updateBudget}
            isLoading={loading.updateBudget}
            icon={Upload}
          />

          <div className="flex gap-2 mb-4">
            <button
              onClick={testAssignMeasure}
              className="flex-1 px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              disabled={loading.assignMeasure}
            >
              Test Assign
            </button>
            <button
              onClick={testUnassignMeasure}
              className="flex-1 px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              disabled={loading.unassignMeasure}
            >
              Test Unassign
            </button>
          </div>
          
          <button
            onClick={testUpdateBudget}
            className="w-full px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 mb-4"
            disabled={loading.updateBudget}
          >
            Test Budget Update
          </button>

          <div className="p-3 bg-orange-50 rounded text-sm text-orange-700">
            <strong>⚠️ Note:</strong> POST tests will modify data in your database. 
            Use with caution in production environments.
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold mb-2">Test Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600">
              {Object.values(results).filter(r => r?.success).length}
            </div>
            <div className="text-sm text-gray-600">Passed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {Object.values(results).filter(r => r?.success === false).length}
            </div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-600">
              {Object.values(loading).filter(Boolean).length}
            </div>
            <div className="text-sm text-gray-600">Running</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-600">
              {Object.keys(results).length}
            </div>
            <div className="text-sm text-gray-600">Total Tests</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseAPITester;