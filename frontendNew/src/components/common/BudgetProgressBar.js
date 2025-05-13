import React from 'react';
import { formatCurrency } from '../../utils/formatters';
import './BudgetProgressBar.css';

const BudgetProgressBar = ({ allocated, booked, reserved }) => {
  // Calculate percentages for width
  const totalAllocated = allocated || 0;
  
  // Prevent division by zero
  const bookedPercentage = totalAllocated > 0 ? (booked / totalAllocated) * 100 : 0;
  const reservedPercentage = totalAllocated > 0 ? (reserved / totalAllocated) * 100 : 0;
  
  // Cap at 100% for visual display
  const cappedBookedPercentage = Math.min(bookedPercentage, 100);
  const cappedReservedPercentage = Math.min(reservedPercentage, 100 - cappedBookedPercentage);
  
  // Determine status color
  const getStatusColor = () => {
    const utilization = bookedPercentage + reservedPercentage;
    
    if (utilization > 100) {
      return 'budget-over';
    } else if (utilization > 90) {
      return 'budget-critical';
    } else if (utilization > 75) {
      return 'budget-warning';
    } else {
      return 'budget-good';
    }
  };

  return (
    <div className="budget-progress-container">
      <div className="budget-labels">
        <div className="budget-allocated">
          <span>Allocated:</span> {formatCurrency(totalAllocated)}
        </div>
        <div className="budget-summary">
          <div className="budget-booked">
            <span className="booked-indicator"></span>
            <span>Booked:</span> {formatCurrency(booked)}
          </div>
          <div className="budget-reserved">
            <span className="reserved-indicator"></span>
            <span>Reserved:</span> {formatCurrency(reserved)}
          </div>
          <div className="budget-remaining">
            <span className="remaining-indicator"></span>
            <span>Remaining:</span> {formatCurrency(totalAllocated - booked - reserved)}
          </div>
        </div>
      </div>
      
      <div className={`budget-progress-bar ${getStatusColor()}`}>
        <div 
          className="progress-booked" 
          style={{ width: `${cappedBookedPercentage}%` }}
          title={`Booked: ${formatCurrency(booked)}`}
        ></div>
        <div 
          className="progress-reserved" 
          style={{ width: `${cappedReservedPercentage}%`, left: `${cappedBookedPercentage}%` }}
          title={`Reserved: ${formatCurrency(reserved)}`}
        ></div>
      </div>
      
      {(bookedPercentage + reservedPercentage) > 100 && (
        <div className="budget-warning-message">
          Budget exceeded by {formatCurrency((booked + reserved) - totalAllocated)}
        </div>
      )}
    </div>
  );
};

export default BudgetProgressBar;