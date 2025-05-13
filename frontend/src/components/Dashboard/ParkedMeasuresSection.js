import React from 'react';
import { useAssignment } from '../../hooks/useAssignment';

/**
 * Component to display parked measures and assignment form
 * @param {Object} props - Component props
 * @param {Array} props.parkedMeasures - Array of parked measures awaiting assignment
 * @param {Array} props.regions - Array of regions to choose from
 * @param {Function} props.onAssignmentSuccess - Handler for successful assignment
 * @param {string} props.baseApiUrl - Base API URL
 */
const ParkedMeasuresSection = ({
  parkedMeasures,
  regions,
  onAssignmentSuccess,
  baseApiUrl
}) => {
  // Use the assignment hook
  const {
    assignmentForm,
    handleAssignmentChange,
    handleAssignSubmit,
    loading
  } = useAssignment(baseApiUrl, onAssignmentSuccess);
  
  return (
    <div className="transaction-list" style={{ marginTop: '20px' }}>
      <h3 style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
        Parked Measures Awaiting Assignment
      </h3>
      <div className="transaction-header">
        <div>Bestellnummer</div>
        <div>Title</div>
        <div>Date</div>
        <div>Amount</div>
      </div>
      
      {parkedMeasures.map(measure => (
        <div key={measure.bestellnummer} className="transaction-row">
          <div>{measure.bestellnummer}</div>
          <div>{measure.measure_title}</div>
          <div>{measure.measure_date}</div>
          <div>{formatCurrency(measure.estimated_amount)}</div>
        </div>
      ))}
      
      {/* Assignment Form */}
      <div style={{ padding: '15px', borderTop: '1px solid var(--border-color)' }}>
        <h4>Assign Parked Measure</h4>
        <form onSubmit={(e) => handleAssignSubmit(e, null)}>
          <div className="form-group">
            <label>Bestellnummer</label>
            <select
              name="bestellnummer"
              value={assignmentForm.bestellnummer}
              onChange={handleAssignmentChange}
              required
              disabled={loading}
            >
              <option value="">Select Bestellnummer</option>
              {parkedMeasures.map(measure => (
                <option key={measure.bestellnummer} value={measure.bestellnummer}>
                  {measure.bestellnummer} - {measure.measure_title}
                </option>
              ))}
            </select>
          </div>
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
              placeholder="Enter district name"
              required
              disabled={loading}
            />
          </div>
          <button type="submit" className="assign-button" disabled={loading}>
            {loading ? 'Assigning...' : 'Assign to Region/District'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Helper function for formatting currency
// Import this from a utils file in a real application
const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default ParkedMeasuresSection;