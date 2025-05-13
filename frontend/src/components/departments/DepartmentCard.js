import React from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';
import BudgetProgressBar from '../common/BudgetProgressBar';
import './DepartmentCard.css';

const DepartmentCard = ({ department, budgetData }) => {
  if (!department) return null;
  
  const { name, booked_amount, reserved_amount } = department;
  const { allocated, booked, reserved, remaining } = budgetData;
  
  // Calculate counts for regions
  const regionsCount = Array.isArray(department.regions) ? department.regions.length : 0;
  
  return (
    <div className="department-card">
      <div className="department-card-header">
        <h3>{name}</h3>
        <div className="department-card-status">
          <span className={remaining < 0 ? 'status-negative' : 'status-positive'}>
            {formatCurrency(remaining)}
          </span>
          <span className="status-label">Remaining</span>
        </div>
      </div>
      
      <div className="department-card-content">
        <div className="department-meta">
          <div className="meta-item">
            <span className="meta-label">Regions:</span>
            <span className="meta-value">{regionsCount}</span>
          </div>
        </div>
        
        <BudgetProgressBar 
          allocated={allocated} 
          booked={booked} 
          reserved={reserved} 
        />
        
        <div className="department-card-actions">
          <Link to={`/departments/${encodeURIComponent(name)}`} className="btn-view-details">
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DepartmentCard;