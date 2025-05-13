import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';
import * as measureService from '../../api/measureService';
import './MeasureAssignmentForm.css';

const MeasureAssignmentForm = ({ 
  measure,
  availableRegions, 
  onAssignSuccess,
  disableForm = false
}) => {
  const [formData, setFormData] = useState({
    bestellnummer: measure.bestellnummer,
    region: '',
    district: ''
  });
  
  const [availableDistricts, setAvailableDistricts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  // Update available districts when region changes
  useEffect(() => {
    if (formData.region) {
      const selectedRegion = availableRegions.find(r => r.name === formData.region);
      if (selectedRegion && Array.isArray(selectedRegion.districts)) {
        setAvailableDistricts(selectedRegion.districts);
      } else {
        setAvailableDistricts([]);
      }
      
      // Reset district selection
      setFormData(prev => ({
        ...prev,
        district: ''
      }));
    } else {
      setAvailableDistricts([]);
    }
  }, [formData.region, availableRegions]);
  
  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear any previous errors or success messages
    setError(null);
    setSuccess(false);
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.region || !formData.district) {
      setError('Please select both a region and district.');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Submit assignment
      await measureService.assignMeasure(formData);
      
      // Show success message
      setSuccess(true);
      
      // Notify parent component
      if (onAssignSuccess) {
        onAssignSuccess();
      }
    } catch (err) {
      console.error('Error assigning measure:', err);
      setError(err.message || 'Failed to assign measure. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="measure-assignment-form">
      <h4>Assign Parked Measure</h4>
      
      <div className="measure-details">
        <div className="measure-detail-item">
          <span className="detail-label">Bestellnummer:</span>
          <span className="detail-value">{measure.bestellnummer}</span>
        </div>
        <div className="measure-detail-item">
          <span className="detail-label">Title:</span>
          <span className="detail-value">{measure.measure_title}</span>
        </div>
        <div className="measure-detail-item">
          <span className="detail-label">Est. Amount:</span>
          <span className="detail-value">{formatCurrency(measure.estimated_amount)}</span>
        </div>
        <div className="measure-detail-item">
          <span className="detail-label">Department:</span>
          <span className="detail-value">{measure.department || 'Not assigned'}</span>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="region">Select Region</label>
          <select
            id="region"
            name="region"
            value={formData.region}
            onChange={handleChange}
            disabled={disableForm || isSubmitting}
          >
            <option value="">-- Select Region --</option>
            {availableRegions.map(region => (
              <option key={region.name} value={region.name}>
                {region.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="district">Select District</label>
          <select
            id="district"
            name="district"
            value={formData.district}
            onChange={handleChange}
            disabled={disableForm || isSubmitting || !formData.region}
          >
            <option value="">-- Select District --</option>
            {availableDistricts.map(district => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>
        
        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">Measure assigned successfully!</div>}
        
        <div className="form-actions">
          <button 
            type="submit" 
            className="btn-assign" 
            disabled={disableForm || isSubmitting}
          >
            {isSubmitting ? 'Assigning...' : 'Assign Measure'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default MeasureAssignmentForm;