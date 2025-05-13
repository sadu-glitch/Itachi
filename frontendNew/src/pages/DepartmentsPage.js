import React, { useContext } from 'react';
import AppContext from '../context/AppContext';
import BudgetContext from '../context/BudgetContext';
import DepartmentCard from '../components/departments/DepartmentCard';
import './DepartmentsPage.css';

const DepartmentsPage = () => {
  const { departments } = useContext(AppContext);
  const { getDepartmentBudgetUtilization } = useContext(BudgetContext);
  
  return (
    <div className="departments-page">
      <div className="page-header">
        <h1>Departments Overview</h1>
        <p>View all departments and their budget allocations</p>
      </div>
      
      <div className="departments-count">
        {departments.length} departments found
      </div>
      
      <div className="departments-grid">
        {departments.map(department => (
          <DepartmentCard 
            key={department.name}
            department={department}
            budgetData={getDepartmentBudgetUtilization(department.name, department)}
          />
        ))}
        
        {departments.length === 0 && (
          <div className="no-departments">
            <p>No departments found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentsPage;