import React, { useState } from 'react';
// Remove the useAssignment hook import since we'll handle it directly
// import { useAssignment } from '../../hooks/useAssignment';

/**
 * Enhanced component to display measures awaiting assignment with clickable rows
 * @param {Object} props - Component props
 * @param {Array} props.parkedMeasures - Array of measures awaiting assignment
 * @param {Array} props.regions - Array of regions to choose from
 * @param {Function} props.onAssignmentSuccess - Handler for successful assignment
 * @param {Function} props.onTransactionClick - Handler for transaction click (optional)
 * @param {string} props.baseApiUrl - Base API URL
 */
const ParkedMeasuresSection = ({
  parkedMeasures,
  regions,
  onAssignmentSuccess,
  onTransactionClick,
  baseApiUrl
}) => {
  const [selectedMeasure, setSelectedMeasure] = useState(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    bestellnummer: '',
    region: '',
    district: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ FIXED: Direct API call function for database
  const assignMeasure = async (assignmentData) => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Sending assignment data:', assignmentData); // Debug log
      
      const response = await fetch(`${baseApiUrl}/api/assign-measure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Name': 'Frontend User',
          'X-Change-Reason': 'Manual measure assignment'
        },
        body: JSON.stringify(assignmentData)
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || `HTTP error! status: ${response.status}`);
      }

      console.log('Assignment successful:', result);
      return result;
    } catch (error) {
      console.error('Assignment error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Handle form field changes
  const handleAssignmentChange = (e) => {
    const { name, value } = e.target;
    setAssignmentForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // ✅ FIXED: Handle assignment submission
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Validate required fields
      if (!assignmentForm.bestellnummer || !assignmentForm.region || !assignmentForm.district) {
        setError('All fields are required');
        return;
      }

      // ✅ FIXED: Send the correct data structure
      const assignmentData = {
        bestellnummer: parseInt(assignmentForm.bestellnummer), // Ensure it's a number
        region: assignmentForm.region.trim(),
        district: assignmentForm.district.trim()
      };

      console.log('Submitting assignment:', assignmentData); // Debug log

      await assignMeasure(assignmentData);
      
      // Success: close modal and refresh data
      setShowAssignmentModal(false);
      setSelectedMeasure(null);
      setAssignmentForm({ bestellnummer: '', region: '', district: '' });
      setError('');
      
      // Call the success callback
      if (onAssignmentSuccess) {
        onAssignmentSuccess();
      }
      
    } catch (error) {
      console.error('Assignment submission error:', error);
      setError(error.message || 'Failed to assign measure');
    }
  };

  // Get districts for selected region
  const availableDistricts = selectedMeasure && assignmentForm.region ? 
    regions.find(r => r.name === assignmentForm.region)?.districts || [] : [];

  // Handle measure row click for assignment
  const handleMeasureClick = (measure) => {
    setSelectedMeasure(measure);
    setAssignmentForm({
      bestellnummer: measure.bestellnummer,
      region: '',
      district: ''
    });
    setShowAssignmentModal(true);
    setError(''); // Clear any previous errors
  };

  return (
    <div className="transaction-list" style={{ marginTop: '20px' }}>
      <h3 style={{ padding: '15px', borderBottom: '1px solid var(--border-color)' }}>
        Measures Awaiting Assignment ({parkedMeasures.length})
      </h3>
      
      <div className="transaction-header">
        <div style={{ flex: '0 0 20%' }}>Bestellnummer</div>
        <div style={{ flex: '0 0 50%' }}>Title</div>
        <div style={{ flex: '0 0 15%' }}>Date</div>
        <div style={{ flex: '0 0 15%' }}>Amount</div>
      </div>
      
      {parkedMeasures.map(measure => (
        <div 
          key={measure.bestellnummer} 
          className="transaction-row"
          onClick={() => handleMeasureClick(measure)}
          style={{ 
            cursor: 'pointer',
            backgroundColor: 'white',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
        >
          <div style={{ flex: '0 0 20%' }}>{measure.bestellnummer}</div>
          <div style={{ flex: '0 0 50%' }} title={measure.measure_title}>
            {truncateText(measure.measure_title, 60)}
          </div>
          <div style={{ flex: '0 0 15%' }}>{formatDate(measure.measure_date)}</div>
          <div style={{ flex: '0 0 15%' }}>{formatCurrency(measure.estimated_amount)}</div>
        </div>
      ))}
      
      {/* Show message if no measures */}
      {parkedMeasures.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          No measures awaiting assignment
        </div>
      )}

      {/* Hint for users */}
      {parkedMeasures.length > 0 && (
        <div style={{ 
          padding: '10px 15px', 
          backgroundColor: '#e3f2fd', 
          borderTop: '1px solid var(--border-color)',
          fontSize: '14px',
          color: '#1565c0'
        }}>
          💡 Click on any measure above to assign it to a region and district
        </div>
      )}

      {/* Enhanced Assignment Modal */}
      {showAssignmentModal && selectedMeasure && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '20px',
              borderBottom: '2px solid #f0f0f0',
              paddingBottom: '15px'
            }}>
              <h3 style={{ margin: 0, color: '#333' }}>Assign Measure</h3>
              <button 
                onClick={() => setShowAssignmentModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '5px'
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Error Display */}
            {error && (
              <div style={{
                marginBottom: '20px',
                padding: '10px',
                backgroundColor: '#f8d7da',
                color: '#721c24',
                borderRadius: '4px',
                border: '1px solid #f5c6cb'
              }}>
                ❌ {error}
              </div>
            )}
            
            {/* Basic Measure Info */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '6px',
              borderLeft: '4px solid #007bff'
            }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Basic Information</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <strong>Bestellnummer:</strong> {selectedMeasure.bestellnummer}
                </div>
                <div>
                  <strong>Amount:</strong> {formatCurrency(selectedMeasure.estimated_amount)}
                </div>
              </div>
              <div style={{ marginTop: '10px' }}>
                <strong>Title:</strong> {selectedMeasure.measure_title}
              </div>
            </div>

            {/* Enhanced Details Section - Show MSP data */}
            {selectedMeasure.msp_data && (
              <>
                {/* Person Information */}
                <div style={{ 
                  marginBottom: '20px',
                  padding: '15px',
                  backgroundColor: '#f0f8ff',
                  borderRadius: '6px',
                  borderLeft: '4px solid #007bff'
                }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#333' }}>Person Information</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    {selectedMeasure.msp_data.Benutzername && (
                      <div>
                        <strong style={{ color: '#555' }}>Requester (Username):</strong>
                        <div style={{ marginTop: '5px' }}>{selectedMeasure.msp_data.Benutzername}</div>
                      </div>
                    )}
                    
                    {selectedMeasure.name && (
                      <div>
                        <strong style={{ color: '#555' }}>Requester (Name):</strong>
                        <div style={{ marginTop: '5px' }}>{selectedMeasure.name}</div>
                      </div>
                    )}
                    
                    {selectedMeasure.department && (
                      <div>
                        <strong style={{ color: '#555' }}>Department:</strong>
                        <div style={{ marginTop: '5px' }}>{selectedMeasure.department}</div>
                      </div>
                    )}
                    
                    {selectedMeasure.msp_data.Anfangsdatum && (
                      <div>
                        <strong style={{ color: '#555' }}>Start Date:</strong>
                        <div style={{ marginTop: '5px' }}>{selectedMeasure.msp_data.Anfangsdatum}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Measure Details */}
                <div style={{ 
                  marginBottom: '20px',
                  padding: '15px',
                  backgroundColor: '#fff8f0',
                  borderRadius: '6px',
                  borderLeft: '4px solid #ff8c00'
                }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#333' }}>Measure Details</h4>
                  
                  {selectedMeasure.msp_data["Art der Maßnahme (Bitte in der Kurzbeschreibung näher ausführen)"] && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#555' }}>Type of Measure:</strong>
                      <div style={{ marginTop: '5px', lineHeight: '1.4' }}>
                        {selectedMeasure.msp_data["Art der Maßnahme (Bitte in der Kurzbeschreibung näher ausführen)"]}
                      </div>
                    </div>
                  )}
                  
                  {selectedMeasure.msp_data.Kurzbeschreibung && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#555' }}>Description:</strong>
                      <div style={{ 
                        marginTop: '5px', 
                        lineHeight: '1.4',
                        padding: '10px',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        border: '1px solid #e9ecef'
                      }}>
                        {selectedMeasure.msp_data.Kurzbeschreibung}
                      </div>
                    </div>
                  )}

                  {/* Article Information */}
                  {(selectedMeasure.msp_data.Artikelname || selectedMeasure.msp_data.Artikelnummer) && (
                    <div style={{ marginBottom: '15px' }}>
                      <strong style={{ color: '#555' }}>Article Information:</strong>
                      <div style={{ marginTop: '5px' }}>
                        {selectedMeasure.msp_data.Artikelname && (
                          <div><strong>Name:</strong> {selectedMeasure.msp_data.Artikelname}</div>
                        )}
                        {selectedMeasure.msp_data.Artikelnummer && (
                          <div><strong>Number:</strong> {selectedMeasure.msp_data.Artikelnummer}</div>
                        )}
                        {selectedMeasure.msp_data["Artikel ID"] && (
                          <div><strong>ID:</strong> {selectedMeasure.msp_data["Artikel ID"]}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* No MSP Data Available */}
            {!selectedMeasure.msp_data && (
              <div style={{ 
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: '#fff3cd',
                borderRadius: '6px',
                borderLeft: '4px solid #ffc107',
                fontSize: '14px',
                color: '#856404'
              }}>
                ℹ️ MSP data is not available for this measure. This might indicate a data loading issue.
              </div>
            )}
            
            {/* Assignment Form */}
            <div style={{ 
              padding: '20px',
              backgroundColor: '#e8f5e8',
              borderRadius: '6px',
              border: '1px solid #c3e6c3'
            }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#155724' }}>Assignment</h4>
              
              {/* ✅ FIXED: Form submission */}
              <form onSubmit={handleAssignSubmit}>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Region
                  </label>
                  <select
                    name="region"
                    value={assignmentForm.region}
                    onChange={handleAssignmentChange}
                    required
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ddd'
                    }}
                  >
                    <option value="">Select Region</option>
                    {regions.map(region => (
                      <option key={region.name} value={region.name}>{region.name}</option>
                    ))}
                  </select>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    District
                  </label>
                  
                  {/* Always show dropdown if districts are available */}
                  {availableDistricts.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <select
                        name="district"
                        value={assignmentForm.district && availableDistricts.includes(assignmentForm.district) ? assignmentForm.district : ''}
                        onChange={handleAssignmentChange}
                        disabled={loading || !assignmentForm.region}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid #ddd'
                        }}
                      >
                        <option value="">Select from existing districts</option>
                        {availableDistricts.map(district => (
                          <option key={district} value={district}>{district}</option>
                        ))}
                      </select>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        {availableDistricts.length} existing district(s) for {assignmentForm.region}
                      </div>
                    </div>
                  )}
                  
                  {/* Always show manual input */}
                  <div>
                    <input
                      type="text"
                      name="district"
                      value={assignmentForm.district}
                      onChange={handleAssignmentChange}
                      required
                      placeholder={assignmentForm.region ? 
                        (availableDistricts.length > 0 ? 
                          "Or enter a new district manually" : 
                          "Enter district name") : 
                        "Select region first"}
                      disabled={loading || !assignmentForm.region}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    />
                    {availableDistricts.length > 0 && (
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        💡 You can select from above or type a new district name here
                      </div>
                    )}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button 
                    type="button"
                    onClick={() => setShowAssignmentModal(false)}
                    disabled={loading}
                    style={{
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    style={{
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '4px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    {loading ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to format date in European format (DD.MM.YYYY)
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
};

// Helper function to truncate text to specified length
const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Helper function for formatting currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default ParkedMeasuresSection;