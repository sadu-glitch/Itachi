import React from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import { useBudgetProgress } from '../../hooks/useBudget';
// At the top of any component file (like DepartmentOverview.js)
import DatabaseAPITester from './TEST';

// Then temporarily add this anywhere in your render:
const [showTest, setShowTest] = useState(false);

// In your JSX:
<div>
  <button onClick={() => setShowTest(!showTest)}>
    Toggle API Test
  </button>
  {showTest && <DatabaseAPITester />}
  
  {/* Your existing component content */}
</div>

// ✅ NEW: Custom XAxis tick component for wrapped text
const CustomXAxisTick = ({ x, y, payload }) => {
  if (!payload?.value) return null;
  
  // Split long department names into multiple lines
  const maxLineLength = 12; // Characters per line
  const words = payload.value.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    if ((currentLine + ' ' + word).length <= maxLineLength) {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });
  
  if (currentLine) lines.push(currentLine);
  
  // Limit to 3 lines max
  if (lines.length > 3) {
    lines[2] = lines[2] + '...';
    lines.splice(3);
  }
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} textAnchor="middle" fill="#666" fontSize="11">
        {lines.map((line, index) => (
          <tspan 
            key={index}
            x={0} 
            dy={index === 0 ? 16 : 14}
            textAnchor="middle"
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

/**
 * Enhanced Department Overview with budget allocation data
 * @param {Object} props
 * @param {Array} props.departments - Array of department data
 * @param {Function} props.onDepartmentClick - Handler for department selection
 * @param {string} props.baseApiUrl - Base API URL for budget data fetching
 */
const DepartmentOverview = ({ departments, onDepartmentClick, baseApiUrl }) => {
  // ✅ FIXED: Fetch budget data directly instead of relying on props
  const { getDepartmentBudget } = useBudgetProgress(baseApiUrl);

  // Group departments by location_type and enhance with budget data
  const groupedDepartments = departments.reduce((acc, dept) => {
    const group = dept.location_type || 'Other';
    if (!acc[group]) acc[group] = [];
    
    // ✅ FIXED: Get fresh budget allocation for this department
    const deptBudget = getDepartmentBudget(dept.name);
    const allocatedBudget = deptBudget?.allocated_budget || 0;
    
    acc[group].push({
      ...dept,
      allocated_budget: allocatedBudget,
      // Calculate usage percentage
      usage_percentage: allocatedBudget > 0 ? ((dept.total_amount || 0) / allocatedBudget) * 100 : 0
    });
    return acc;
  }, {});

  // Custom tooltip with comprehensive information
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const remaining = (data.allocated_budget || 0) - (data.total || 0);
      
      return (
        <div style={{
          backgroundColor: 'white',
          padding: '15px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
          minWidth: '200px'
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: '14px' }}>{data.fullName}</p>
          
          {data.allocated_budget > 0 && (
            <p style={{ margin: '4px 0', color: '#107c10', fontSize: '13px' }}>
              🎯 Allocated: {formatCurrency(data.allocated_budget)}
            </p>
          )}
          
          <p style={{ margin: '4px 0', color: '#dc3545', fontSize: '13px' }}>
            🔴 Booked: {formatCurrency(data.booked)}
          </p>
          <p style={{ margin: '4px 0', color: '#ffc107', fontSize: '13px' }}>
            🟡 Reserved: {formatCurrency(data.reserved)}
          </p>
          <p style={{ margin: '4px 0', fontWeight: 'bold', fontSize: '13px' }}>
            📊 Total Used: {formatCurrency(data.total)}
          </p>
          
          {data.allocated_budget > 0 && (
            <>
              <p style={{ margin: '4px 0', color: remaining >= 0 ? '#107c10' : '#a4262c', fontSize: '13px' }}>
                💰 Remaining: {formatCurrency(remaining)}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
                📈 Usage: {data.usage_percentage.toFixed(1)}%
              </p>
            </>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="budget-summary" style={{ maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0 }}>Department Budget Overview</h3>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Click on any department to view details
        </div>
      </div>

      {Object.entries(groupedDepartments).map(([locationType, depts]) => {
        const chartData = depts.map(dept => ({
          name: dept.name, // ✅ FIXED: Use full name, let CustomXAxisTick handle wrapping
          fullName: dept.name, // Keep full name for tooltip
          booked: dept.booked_amount || 0,
          reserved: dept.reserved_amount || 0,
          total: dept.total_amount || 0,
          allocated_budget: dept.allocated_budget || 0,
          usage_percentage: dept.usage_percentage || 0,
          originalDept: dept // Reference to original department data
        }));

        // Calculate totals for this location type
        const locationTotals = chartData.reduce((acc, dept) => ({
          booked: acc.booked + dept.booked,
          reserved: acc.reserved + dept.reserved,
          total: acc.total + dept.total,
          allocated: acc.allocated + dept.allocated_budget
        }), { booked: 0, reserved: 0, total: 0, allocated: 0 });

        const locationUsage = locationTotals.allocated > 0 ? 
          (locationTotals.total / locationTotals.allocated) * 100 : 0;

        return (
          <div key={locationType} style={{ marginBottom: '50px' }}>
            {/* Enhanced Location Header */}
            <div style={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #edebe9',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <h4 style={{ margin: 0, color: '#0078d4', fontSize: '18px' }}>
                  📍 {locationType}
                </h4>
                
                {/* Enhanced Location Summary */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                  gap: '15px',
                  minWidth: '500px'
                }}>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>ALLOCATED</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#107c10' }}>
                      {formatCurrency(locationTotals.allocated)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>BOOKED</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc3545' }}>
                      {formatCurrency(locationTotals.booked)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>RESERVED</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffc107' }}>
                      {formatCurrency(locationTotals.reserved)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>USAGE</div>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 'bold', 
                      color: locationUsage > 100 ? '#a4262c' : locationUsage > 85 ? '#ff8c00' : '#107c10'
                    }}>
                      {locationUsage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ ENHANCED: Chart with better spacing and custom XAxis */}
            <div style={{ 
              background: '#ffffff',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #edebe9',
              marginBottom: '20px',
              overflowX: 'auto'
            }}>
              <div style={{
                minWidth: `${Math.max(chartData.length * 150, 800)}px`, // ✅ WIDER spacing per department
                width: '100%',
                height: '450px' // ✅ TALLER for multi-line labels
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 40, bottom: 120 }} // ✅ MORE bottom space for wrapped labels
                    onClick={(data) => {
                      if (data && data.activePayload) {
                        onDepartmentClick(data.activePayload[0].payload.originalDept);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#edebe9" />
                    <XAxis
                      dataKey="name"
                      interval={0} // ✅ Show all labels
                      height={100} // ✅ MORE height for multi-line labels
                      tick={<CustomXAxisTick />} // ✅ USE custom tick component
                    />
                    <YAxis 
                      tickFormatter={(value) => {
                        // Compact formatting for Y-axis
                        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}k€`;
                        return `${value.toFixed(0)}€`;
                      }}
                      fontSize={11}
                      tick={{ fill: '#323130' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="rect"
                    />
                    
                    {/* Budget allocation line/bar (if allocated budget exists) */}
                    <Bar 
                      dataKey="allocated_budget" 
                      name="Allocated Budget" 
                      fill="rgba(16, 124, 16, 0.2)"
                      stroke="#107c10"
                      strokeWidth={2}
                    />
                    
                    {/* Main data bars */}
                    <Bar dataKey="booked" name="Booked Amount" fill="#dc3545" />
                    <Bar dataKey="reserved" name="Reserved Amount" fill="#ffc107" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Enhanced Table */}
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #edebe9',
              overflow: 'hidden'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #f3f2f1 100%)',
                padding: '15px',
                fontWeight: 'bold'
              }}>
                <div>Department</div>
                <div>Allocated Budget</div>
                <div>Booked Amount</div>
                <div>Reserved Amount</div>
                <div>Total Used</div>
                <div>Usage %</div>
              </div>

              {depts.map(dept => {
                //const remaining = (dept.allocated_budget || 0) - (dept.total_amount || 0);
                
                return (
                  <div
                    key={dept.name}
                    onClick={() => onDepartmentClick(dept)}
                    style={{ 
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                      padding: '15px',
                      transition: 'all 0.2s ease',
                      borderBottom: '1px solid #edebe9'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.05)';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ fontWeight: '500' }} title={dept.name}>
                      {dept.name} {/* ✅ FIXED: Show full name in table */}
                    </div>
                    <div style={{ 
                      color: dept.allocated_budget > 0 ? '#107c10' : '#999',
                      fontWeight: dept.allocated_budget > 0 ? 'bold' : 'normal'
                    }}>
                      {dept.allocated_budget > 0 ? formatCurrency(dept.allocated_budget) : 'Not Set'}
                    </div>
                    <div style={{ color: '#dc3545', fontWeight: 'bold' }}>
                      {formatCurrency(dept.booked_amount)}
                    </div>
                    <div style={{ color: '#ffc107', fontWeight: 'bold' }}>
                      {formatCurrency(dept.reserved_amount)}
                    </div>
                    <div style={{ fontWeight: 'bold' }}>
                      {formatCurrency(dept.total_amount)}
                    </div>
                    <div style={{ 
                      fontWeight: 'bold',
                      color: dept.usage_percentage > 100 ? '#a4262c' : 
                             dept.usage_percentage > 85 ? '#ff8c00' : '#107c10'
                    }}>
                      {dept.allocated_budget > 0 ? `${dept.usage_percentage.toFixed(1)}%` : '-'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DepartmentOverview;