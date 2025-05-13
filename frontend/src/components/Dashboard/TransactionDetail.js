import React, { useState } from 'react';
import { useAssignment } from '../../hooks/useAssignment';

/**
 * Component to display transaction details in a modal
 * @param {Object} props - Component props
 * @param {Object} props.transaction - Transaction data
 * @param {Array} props.regions - Array of regions for assignment
 * @param {Function} props.onClose - Handler for modal close
 * @param {Function} props.onAssignmentSuccess - Handler for successful assignment
 * @param {string} props.baseApiUrl - Base API URL
 */
const TransactionDetail = ({
  transaction,
  regions,
  onClose,
  onAssignmentSuccess,
  baseApiUrl
}) => {
  // Use the assignment hook for parked measures
  const {
    assignmentForm,
    handleAssignmentChange,
    handleAssignSubmit,
    loading
  } = useAssignment(baseApiUrl, onAssignmentSuccess);
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>Transaction Details</h3>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>
        
        <div className="transaction-info">
          <div className="info-group">
            <strong>Transaction Type:</strong> 
            <span className={`tag ${getTagClass(transaction.category)}`}>
              {getTransactionTypeLabel(transaction.category)}
            </span>
          </div>
          
          <div className="info-group">
            <strong>Transaction ID:</strong> {transaction.transaction_id || transaction.measure_id}
          </div>
          
          {transaction.bestellnummer && (
            <div className="info-group">
              <strong>Bestellnummer:</strong> {transaction.bestellnummer}
            </div>
          )}
          
          {transaction.measure_title && (
            <div className="info-group">
              <strong>Measure Title:</strong> {transaction.measure_title}
            </div>
          )}
          
          <div className="info-group">
            <strong>Department:</strong> {transaction.department}
          </div>
          
          {transaction.region && (
            <div className="info-group">
              <strong>Region:</strong> {transaction.region}
            </div>
          )}
          
          {transaction.district && (
            <div className="info-group">
              <strong>District:</strong> {transaction.district}
            </div>
          )}
        </div>
        
        {/* Financial information */}
        <div className="info-section">
          <h4>Financial Information</h4>
          
          <div className="info-grid">
            {(transaction.amount !== undefined || transaction.actual_amount !== undefined) && (
              <div className="info-cell">
                <strong>{transaction.category === 'BOOKED_MEASURE' ? 'Actual Amount:' : 'Amount:'}</strong>
                <div>{formatCurrency(transaction.amount || transaction.actual_amount)}</div>
              </div>
            )}
            
            {transaction.estimated_amount !== undefined && (
              <div className="info-cell">
                <strong>Estimated Amount:</strong>
                <div>{formatCurrency(transaction.estimated_amount)}</div>
              </div>
            )}
            
            {transaction.variance !== undefined && (
              <div className="info-cell">
                <strong>Variance:</strong>
                <div className={transaction.variance > 0 ? 'negative' : 
                              transaction.variance < 0 ? 'positive' : ''}>
                  {formatCurrency(transaction.variance)}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Timeline */}
        <div className="info-section">
          <h4>Timeline</h4>
          
          <div className="info-grid">
            {transaction.booking_date && (
              <div className="info-cell">
                <strong>Booking Date:</strong>
                <div>{transaction.booking_date}</div>
              </div>
            )}
            
            {transaction.measure_date && (
              <div className="info-cell">
                <strong>Measure Date:</strong>
                <div>{transaction.measure_date}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Status Information */}
        <div className="info-section">
          <h4>Status Information</h4>
          
          <div className="info-grid">
            <div className="info-cell">
              <strong>Status:</strong>
              <div>{transaction.status}</div>
            </div>
            
            <div className="info-cell">
              <strong>Budget Impact:</strong>
              <div>{transaction.budget_impact || 'Unknown'}</div>
            </div>
            
            {transaction.previously_parked !== undefined && (
              <div className="info-cell">
                <strong>Previously Parked:</strong>
                <div>{transaction.previously_parked ? 'Yes' : 'No'}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Additional information for booked measures */}
        {transaction.category === 'BOOKED_MEASURE' && (
          <div className="info-section">
            <h4>Related Information</h4>
            
            <div>
              {transaction.text && (
                <div className="info-group">
                  <strong>Transaction Text:</strong>
                  <div>{transaction.text}</div>
                </div>
              )}
              
              {transaction.msp_data?.Name && (
                <div className="info-group">
                  <strong>Requester:</strong>
                  <div>{transaction.msp_data.Name}</div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Manual assignment section for parked measures */}
        {transaction.category === 'PARKED_MEASURE' && 
          transaction.status === 'Awaiting Assignment' && (
          <div className="info-section">
            <h4>Manual Assignment</h4>
            
            <form onSubmit={(e) => handleAssignSubmit(e, transaction.bestellnummer)}>
              <div className="form-group">
                <label>Region</label>
                <select
                  name="region"
                  value={assignmentForm.region}
                  onChange={handleAssignmentChange}
                  required
                  disabled={loading}
                >
                  <option value="">Select Region</option>
                  {regions.map(region => (
                    <option key={region.name} value={region.name}>{region.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>District</label>
                <input
                  type="text"
                  name="district"
                  value={assignmentForm.district}
                  onChange={handleAssignmentChange}
                  required
                  placeholder="Enter district name"
                  disabled={loading}
                />
              </div>
              
              <button type="submit" className="assign-button" disabled={loading}>
                {loading ? 'Assigning...' : 'Assign to Region/District'}
              </button>
            </form>
          </div>
        )}
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper function to get transaction type label
const getTransactionTypeLabel = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return 'Direct Cost';
    case 'BOOKED_MEASURE':
      return 'SAP-MSP Booked Measure';
    case 'PARKED_MEASURE':
      return 'Parked Measure';
    default:
      return category || 'Unknown';
  }
};

// Helper function to get tag CSS class
const getTagClass = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return 'tag-direct';
    case 'BOOKED_MEASURE':
      return 'tag-booked';
    case 'PARKED_MEASURE':
      return 'tag-parked';
    default:
      return 'tag-default';
  }
};

// Import this from a utils file in a real application
const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default TransactionDetail;