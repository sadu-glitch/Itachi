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
      
      console.log('Submitting assignment request to:', `${normalizedApiUrl}/api/assign-measure`);
      console.log('Request body:', JSON.stringify({
        bestellnummer: bestellnummer || assignmentForm.bestellnummer,
        region: assignmentForm.region,
        district: assignmentForm.district
      }));
      
      // Use fetch with explicit OPTIONS handling for CORS
      const response = await fetch(`${normalizedApiUrl}/api/assign-measure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        // Add mode for cross-origin requests
        mode: 'cors',
        // Add credentials if your API requires them
        credentials: 'same-origin',
        body: JSON.stringify({
          bestellnummer: bestellnummer || assignmentForm.bestellnummer,
          region: assignmentForm.region,
          district: assignmentForm.district
        })
      });
      
      if (!response.ok) {
        console.error('Error response:', response.status, response.statusText);
        throw new Error(`Network error: ${response.status} ${response.statusText}`);
      }
      
      // Optionally log the response
      const responseData = await response.json();
      console.log('Assignment successful:', responseData);
      
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