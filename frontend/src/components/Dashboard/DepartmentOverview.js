import React from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

/**
 * Component to display department budget overview with chart and table
 * @param {Object} props - Component props
 * @param {Array} props.departments - Array of department data
 * @param {Function} props.onDepartmentClick - Handler for department selection
 */
const DepartmentOverview = ({ departments, onDepartmentClick }) => {
  // Prepare chart data
  const departmentChartData = departments.map(dept => ({
    name: dept.name.split(' ')[0], // Use first word only for chart labels
    booked: dept.booked_amount || 0,
    reserved: dept.reserved_amount || 0,
    total: dept.total_amount || 0
  }));
  
  return (
    <div className="budget-summary">
      <h3>Department Budget Overview</h3>
      
      {/* Chart for Department Budget */}
      <div style={{ height: '300px', marginBottom: '20px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={departmentChartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="booked" name="Booked Amount" fill="#0078d4" />
            <Bar dataKey="reserved" name="Reserved Amount" fill="#107c10" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Department Table */}
      <div className="budget-table">
        <div className="budget-header">
          <div>Department</div>
          <div>Booked Amount</div>
          <div>Reserved Amount</div>
          <div>Total Amount</div>
        </div>
        
        {departments.map(dept => (
          <div 
            className="budget-row" 
            key={dept.name}
            onClick={() => onDepartmentClick(dept)}
            style={{ cursor: 'pointer' }}
          >
            <div>{dept.name}</div>
            <div>{formatCurrency(dept.booked_amount)}</div>
            <div>{formatCurrency(dept.reserved_amount)}</div>
            <div>{formatCurrency(dept.total_amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DepartmentOverview;