import React from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';
import BudgetProgressBar from '../common/BudgetProgressBar';
import './RegionCard.css';

const RegionCard = ({ region, departmentId, budgetData }) => {
  if (!region) return null;
  
  const { name, booked_amount, reserved_amount, districts } = region;
  const { allocated, booked, reserved, remaining } = budgetData;
  
  // Calculate district count
  const districtsCount = Array.isArray(districts) ? districts.length : 0;
  
  return (
    <div className="region-card">
      <div className="region-card-header">
        <h3>{name}</h3>
        <div className="region-card-status">
          <span className={remaining < 0 ? 'status-negative' : 'status-positive'}>
            {formatCurrency(remaining)}
          </span>
          <span className="status-label">Remaining</span>
        </div>
      </div>
      
      <div className="region-card-content">
        <div className="region-meta">
          <div className="meta-item">
            <span className="meta-label">Department:</span>
            <span className="meta-value">{departmentId}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Districts:</span>
            <span className="meta-value">{districtsCount}</span>
          </div>
        </div>
        
        <BudgetProgressBar 
          allocated={allocated} 
          booked={booked} 
          reserved={reserved} 
        />
        
        <div className="region-card-actions">
          <Link 
            to={`/regions/${encodeURIComponent(departmentId)}|${encodeURIComponent(name)}`} 
            className="btn-view-details"
          >
            View Transactions
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegionCard;