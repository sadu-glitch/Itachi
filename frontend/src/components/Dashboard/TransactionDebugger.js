import React, { useState, useEffect } from 'react';

/**
 * Debug component to inspect transaction data structure
 * Add this temporarily to your Dashboard to see what's actually in the data
 */
const TransactionDebugger = ({ baseApiUrl, selectedDepartment, selectedRegion }) => {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRawData = async () => {
      try {
        setLoading(true);
        const normalizedApiUrl = baseApiUrl.endsWith('/') 
          ? baseApiUrl.slice(0, -1) 
          : baseApiUrl;
          
        const response = await fetch(`${normalizedApiUrl}/api/transactions`);
        if (response.ok) {
          const data = await response.json();
          setRawData(data);
          
          // ✅ DETAILED LOGGING
          console.log('🔍 RAW API DATA ANALYSIS:');
          console.log('1. Full API Response Keys:', Object.keys(data));
          console.log('2. Transactions Array Length:', data.transactions?.length || 0);
          console.log('3. First 3 Transactions:', data.transactions?.slice(0, 3));
          
          // Check department names in transactions
          if (data.transactions?.length > 0) {
            const departments = [...new Set(data.transactions.map(tx => tx.department))];
            console.log('4. Unique Departments in Data:', departments);
            
            const regions = [...new Set(data.transactions.map(tx => tx.region).filter(Boolean))];
            console.log('5. Unique Regions in Data:', regions);
            
            // Check for the specific department
            if (selectedDepartment) {
              const deptTransactions = data.transactions.filter(tx => tx.department === selectedDepartment);
              console.log(`6. Transactions for "${selectedDepartment}":`, deptTransactions.length);
              
              if (deptTransactions.length > 0) {
                const deptRegions = [...new Set(deptTransactions.map(tx => tx.region).filter(Boolean))];
                console.log(`7. Regions in "${selectedDepartment}":`, deptRegions);
                
                // Sample transaction for this department
                console.log('8. Sample transaction for this department:', deptTransactions[0]);
              }
            }
            
            // Check for the specific region
            if (selectedRegion) {
              const regionTransactions = data.transactions.filter(tx => tx.region === selectedRegion);
              console.log(`9. Transactions for region "${selectedRegion}":`, regionTransactions.length);
              
              if (regionTransactions.length > 0) {
                console.log('10. Sample region transaction:', regionTransactions[0]);
              } else {
                // Check if region name exists with different formatting
                const allRegions = data.transactions.map(tx => tx.region).filter(Boolean);
                const similarRegions = allRegions.filter(region => 
                  region && (
                    region.toLowerCase().includes(selectedRegion.toLowerCase()) ||
                    selectedRegion.toLowerCase().includes(region.toLowerCase())
                  )
                );
                console.log(`11. Similar region names found:`, similarRegions);
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Debug fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    if (baseApiUrl) {
      fetchRawData();
    }
  }, [baseApiUrl, selectedDepartment, selectedRegion]);

  if (loading) return <div>🔄 Loading debug data...</div>;
  if (!rawData) return <div>❌ No debug data available</div>;

  const { transactions = [] } = rawData;

  // Department analysis
  const departmentStats = {};
  transactions.forEach(tx => {
    const dept = tx.department || 'NO_DEPARTMENT';
    if (!departmentStats[dept]) {
      departmentStats[dept] = { count: 0, regions: new Set() };
    }
    departmentStats[dept].count++;
    if (tx.region) {
      departmentStats[dept].regions.add(tx.region);
    }
  });

  // Convert Sets to Arrays for display
  Object.keys(departmentStats).forEach(dept => {
    departmentStats[dept].regions = Array.from(departmentStats[dept].regions);
  });

  return (
    <div style={{
      backgroundColor: '#f0f8ff',
      border: '2px solid #0066cc',
      borderRadius: '8px',
      padding: '16px',
      margin: '16px 0',
      fontSize: '12px',
      fontFamily: 'monospace'
    }}>
      <h3 style={{ color: '#0066cc', margin: '0 0 12px 0' }}>🔍 Transaction Data Debug Panel</h3>
      
      <div style={{ marginBottom: '12px' }}>
        <strong>API Response Summary:</strong><br/>
        • Total Transactions: {transactions.length}<br/>
        • Parked Measures: {rawData.parked_measures?.length || 0}<br/>
        • Direct Costs: {rawData.direct_costs?.length || 0}<br/>
        • Booked Measures: {rawData.booked_measures?.length || 0}<br/>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Current Selection:</strong><br/>
        • Department: {selectedDepartment || 'None'}<br/>
        • Region: {selectedRegion || 'None'}<br/>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Department Statistics:</strong><br/>
        {Object.entries(departmentStats).slice(0, 5).map(([dept, stats]) => (
          <div key={dept} style={{ marginLeft: '8px', marginBottom: '4px' }}>
            • "{dept}": {stats.count} transactions, {stats.regions.length} regions
          </div>
        ))}
        {Object.keys(departmentStats).length > 5 && (
          <div style={{ marginLeft: '8px', color: '#666' }}>
            ... and {Object.keys(departmentStats).length - 5} more departments
          </div>
        )}
      </div>

      {selectedDepartment && (
        <div style={{ marginBottom: '12px' }}>
          <strong>Selected Department "{selectedDepartment}":</strong><br/>
          {departmentStats[selectedDepartment] ? (
            <>
              • Transactions: {departmentStats[selectedDepartment].count}<br/>
              • Regions: {departmentStats[selectedDepartment].regions.join(', ') || 'None'}<br/>
            </>
          ) : (
            <span style={{ color: 'red' }}>❌ Department not found in data!</span>
          )}
        </div>
      )}

      {selectedRegion && (
        <div style={{ marginBottom: '12px' }}>
          <strong>Selected Region "{selectedRegion}":</strong><br/>
          {(() => {
            const regionTransactions = transactions.filter(tx => tx.region === selectedRegion);
            const regionCount = regionTransactions.length;
            
            if (regionCount > 0) {
              const categories = [...new Set(regionTransactions.map(tx => tx.category))];
              return (
                <>
                  • Transactions: {regionCount}<br/>
                  • Categories: {categories.join(', ')}<br/>
                </>
              );
            } else {
              // Check for similar region names
              const allRegions = [...new Set(transactions.map(tx => tx.region).filter(Boolean))];
              const similar = allRegions.filter(region => 
                region && (
                  region.toLowerCase().includes(selectedRegion.toLowerCase()) ||
                  selectedRegion.toLowerCase().includes(region.toLowerCase())
                )
              );
              
              return (
                <>
                  <span style={{ color: 'red' }}>❌ Region not found in data!</span><br/>
                  {similar.length > 0 && (
                    <>• Similar regions: {similar.join(', ')}<br/></>
                  )}
                  • All regions: {allRegions.slice(0, 10).join(', ')}
                  {allRegions.length > 10 && '...'}
                </>
              );
            }
          })()}
        </div>
      )}

      <div>
        <strong>Sample Transaction Structure:</strong><br/>
        {transactions.length > 0 && (
          <pre style={{ 
            backgroundColor: '#fff', 
            padding: '8px', 
            borderRadius: '4px',
            fontSize: '10px',
            overflow: 'auto',
            maxHeight: '200px'
          }}>
            {JSON.stringify(transactions[0], null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

export default TransactionDebugger;