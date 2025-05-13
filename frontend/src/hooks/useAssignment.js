import { useState } from 'react';

/**
 * Custom hook to handle measure assignments
 * @param {string} baseApiUrl - The base API URL
 * @param {Function} onSuccess - Callback function to be called after successful assignment
 * @returns {Object} - Assignment form state and handlers
 */
export const useAssignment = (baseApiUrl, onSuccess) => {
  const [assignmentForm, setAssignmentForm] = useState({
    bestellnummer: '',
    region: '',
    district: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleAssignmentChange = (e) => {
    setAssignmentForm({
      ...assignmentForm,
      [e.target.name]: e.target.value
    });
  };
  
  const handleAssignSubmit = async (e, bestellnummer = null) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      
      // Remove trailing slash from baseApiUrl if it exists to prevent double slashes
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      const response = await fetch(`${normalizedApiUrl}/api/assign-measure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bestellnummer: bestellnummer || assignmentForm.bestellnummer,
          region: assignmentForm.region,
          district: assignmentForm.district
        })
      });
      
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
      }
      
      // Reset form
      setAssignmentForm({
        bestellnummer: '',
        region: '',
        district: ''
      });
      
      setLoading(false);
      
      // Call the success callback
      if (onSuccess) {
        await onSuccess();
      }
      
      return true;
    } catch (err) {
      console.error('Assignment error:', err);
      setError(err.message);
      setLoading(false);
      return false;
    }
  };
  
  return {
    assignmentForm,
    setAssignmentForm,
    handleAssignmentChange,
    handleAssignSubmit,
    loading,
    error
  };
};