import React from 'react';
import { useAssignment } from '../../hooks/useAssignment'

/**
 * Component to display transaction details in a modal popup
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
    <div 
      style={{
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
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          borderBottom: '2px solid #f0f0f0',
          paddingBottom: '15px'
        }}>
          <h2 style={{ margin: 0, color: '#333' }}>Transaction Details</h2>
          <button 
            onClick={onClose}
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
        
        {/* Main Transaction Information */}
        <div style={{ marginBottom: '25px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <strong style={{ color: '#555' }}>Transaction Type:</strong>
              <div style={{ 
                display: 'inline-block', 
                marginLeft: '10px',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: getTagColor(transaction.category),
                color: 'white'
              }}>
                {getTransactionTypeLabel(transaction.category)}
              </div>
            </div>
            
            <div>
              <strong style={{ color: '#555' }}>Transaction ID:</strong>
              <div style={{ marginTop: '5px' }}>{transaction.transaction_id || transaction.measure_id}</div>
            </div>
            
            <div>
              <strong style={{ color: '#555' }}>Department:</strong>
              <div style={{ marginTop: '5px' }}>{transaction.department}</div>
            </div>
            
            {transaction.region && (
              <div>
                <strong style={{ color: '#555' }}>Region:</strong>
                <div style={{ marginTop: '5px' }}>{transaction.region}</div>
              </div>
            )}
            
            {transaction.district && (
              <div>
                <strong style={{ color: '#555' }}>District:</strong>
                <div style={{ marginTop: '5px' }}>{transaction.district}</div>
              </div>
            )}
            
            {transaction.bestellnummer && (
              <div>
                <strong style={{ color: '#555' }}>Bestellnummer:</strong>
                <div style={{ marginTop: '5px' }}>{transaction.bestellnummer}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Transaction Text - Prominently Displayed */}
        {(transaction.text || transaction.measure_title) && (
          <div style={{ 
            marginBottom: '25px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            borderLeft: '4px solid #007bff'
          }}>
            <strong style={{ color: '#333', fontSize: '16px' }}>Transaction Text:</strong>
            <div style={{ 
              marginTop: '8px', 
              lineHeight: '1.5',
              color: '#555'
            }}>
              {transaction.text || transaction.measure_title}
            </div>
          </div>
        )}
        
        {/* Financial Information */}
        <div style={{ 
          marginBottom: '25px',
          padding: '15px',
          backgroundColor: '#f0f8ff',
          borderRadius: '6px'
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Financial Information</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            {(transaction.amount !== undefined || transaction.actual_amount !== undefined) && (
              <div>
                <strong style={{ color: '#555' }}>
                  {transaction.category === 'BOOKED_MEASURE' ? 'Actual Amount:' : 'Amount:'}
                </strong>
                <div style={{ 
                  marginTop: '5px', 
                  fontSize: '18px', 
                  fontWeight: 'bold', 
                  color: '#28a745' 
                }}>
                  {formatCurrency(transaction.amount || transaction.actual_amount)}
                </div>
              </div>
            )}
            
            {transaction.estimated_amount !== undefined && (
              <div>
                <strong style={{ color: '#555' }}>Estimated Amount:</strong>
                <div style={{ marginTop: '5px', fontSize: '16px' }}>
                  {formatCurrency(transaction.estimated_amount)}
                </div>
              </div>
            )}
            
            {transaction.variance !== undefined && (
              <div>
                <strong style={{ color: '#555' }}>Variance:</strong>
                <div style={{ 
                  marginTop: '5px', 
                  fontSize: '16px',
                  color: transaction.variance > 0 ? '#dc3545' : 
                        transaction.variance < 0 ? '#28a745' : '#6c757d'
                }}>
                  {formatCurrency(transaction.variance)}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Timeline and Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
          {/* Timeline */}
          <div style={{ 
            padding: '15px',
            backgroundColor: '#fff8f0',
            borderRadius: '6px'
          }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#333' }}>Timeline</h4>
            
            {transaction.booking_date && (
              <div style={{ marginBottom: '10px' }}>
                <strong style={{ color: '#555' }}>Booking Date:</strong>
                <div style={{ marginTop: '5px' }}>{formatDate(transaction.booking_date)}</div>
              </div>
            )}
            
            {transaction.measure_date && (
              <div>
                <strong style={{ color: '#555' }}>Measure Date:</strong>
                <div style={{ marginTop: '5px' }}>{formatDate(transaction.measure_date)}</div>
              </div>
            )}
          </div>
          
          {/* Status Information */}
          <div style={{ 
            padding: '15px',
            backgroundColor: '#f0f8f0',
            borderRadius: '6px'
          }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#333' }}>Status Information</h4>
            
            <div style={{ marginBottom: '10px' }}>
              <strong style={{ color: '#555' }}>Status:</strong>
              <div style={{ marginTop: '5px' }}>{transaction.status}</div>
            </div>
            
            <div style={{ marginBottom: '10px' }}>
              <strong style={{ color: '#555' }}>Budget Impact:</strong>
              <div style={{ marginTop: '5px' }}>{transaction.budget_impact || 'Unknown'}</div>
            </div>
            
            {transaction.previously_parked !== undefined && (
              <div>
                <strong style={{ color: '#555' }}>Previously Parked:</strong>
                <div style={{ marginTop: '5px' }}>{transaction.previously_parked ? 'Yes' : 'No'}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Person Information - For BOOKED_MEASURE transactions */}
        {transaction.category === 'BOOKED_MEASURE' && transaction.msp_data && (
          <div style={{ 
            marginBottom: '25px',
            padding: '15px',
            backgroundColor: '#f0f8ff',
            borderRadius: '6px',
            borderLeft: '4px solid #007bff'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Person Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              {transaction.msp_data.Name && (
                <div>
                  <strong style={{ color: '#555' }}>Requester:</strong>
                  <div style={{ marginTop: '5px' }}>{transaction.msp_data.Name}</div>
                </div>
              )}
              
              {transaction.msp_data["Verantwortliche Person"] && (
                <div>
                  <strong style={{ color: '#555' }}>Responsible Person:</strong>
                  <div style={{ marginTop: '5px' }}>{transaction.msp_data["Verantwortliche Person"]}</div>
                </div>
              )}
              
              {transaction.msp_data.Benutzername && (
                <div>
                  <strong style={{ color: '#555' }}>Username:</strong>
                  <div style={{ marginTop: '5px' }}>{transaction.msp_data.Benutzername}</div>
                </div>
              )}
              
              {transaction.msp_data["Die Maßnahme ist abgestimmt mit:"] && (
                <div>
                  <strong style={{ color: '#555' }}>Coordinated with:</strong>
                  <div style={{ marginTop: '5px' }}>{transaction.msp_data["Die Maßnahme ist abgestimmt mit:"]}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Measure Details - For BOOKED_MEASURE transactions */}
        {transaction.category === 'BOOKED_MEASURE' && transaction.msp_data && (
          <div style={{ 
            marginBottom: '25px',
            padding: '15px',
            backgroundColor: '#fff8f0',
            borderRadius: '6px',
            borderLeft: '4px solid #ff8c00'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Measure Details</h3>
            
            {transaction.msp_data["Art der Maßnahme (Bitte in der Kurzbeschreibung näher ausführen)"] && (
              <div style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#555' }}>Type of Measure:</strong>
                <div style={{ marginTop: '5px', lineHeight: '1.4' }}>
                  {transaction.msp_data["Art der Maßnahme (Bitte in der Kurzbeschreibung näher ausführen)"]}
                </div>
              </div>
            )}
            
            {transaction.msp_data.Kurzbeschreibung && (
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
                  {transaction.msp_data.Kurzbeschreibung}
                </div>
              </div>
            )}

            {/* Budget Positions */}
            {(transaction.msp_data["Beschreibung Budgetposition 1"] || 
              transaction.msp_data["Betrag Budgetposition 1"]) && (
              <div>
                <strong style={{ color: '#555' }}>Budget Positions:</strong>
                <div style={{ marginTop: '10px' }}>
                  {[1, 2, 3, 4, 5].map(num => {
                    const desc = transaction.msp_data[`Beschreibung Budgetposition ${num}`];
                    const amount = transaction.msp_data[`Betrag Budgetposition ${num}`];
                    const position = transaction.msp_data[`Budgetposition ${num}`];
                    
                    if (!desc && !amount && !position) return null;
                    
                    return (
                      <div key={num} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        marginBottom: '5px',
                        border: '1px solid #e9ecef'
                      }}>
                        <div>
                          <strong>Position {num}:</strong> {position || 'N/A'}
                          {desc && <div style={{ fontSize: '14px', color: '#666' }}>{desc}</div>}
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#28a745' }}>
                          {amount ? `${amount} €` : '-'}
                        </div>
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Manual assignment section for unassigned measures */}
        {(transaction.category === 'PARKED_MEASURE' || transaction.category === 'UNASSIGNED_MEASURE') && 
          transaction.status === 'Awaiting Assignment' && (
          <div style={{ 
            padding: '20px',
            backgroundColor: '#fff3cd',
            borderRadius: '6px',
            border: '1px solid #ffeaa7',
            marginBottom: '20px'
          }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#856404' }}>Manual Assignment</h4>
            
            <form onSubmit={(e) => handleAssignSubmit(e, transaction.bestellnummer)}>
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
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  District
                </label>
                <input
                  type="text"
                  name="district"
                  value={assignmentForm.district}
                  onChange={handleAssignmentChange}
                  required
                  placeholder="Enter district name"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #ddd'
                  }}
                />
              </div>
              
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
                {loading ? 'Assigning...' : 'Assign to Region/District'}
              </button>
            </form>
          </div>
        )}
        
        {/* Footer */}
        <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: '15px' }}>
          <button 
            onClick={onClose}
            style={{
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
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
    case 'UNASSIGNED_MEASURE':
      return 'Unassigned Measure';
    default:
      return category || 'Unknown';
  }
};

// Helper function to get tag background color
const getTagColor = (category) => {
  switch (category) {
    case 'DIRECT_COST':
      return '#28a745';
    case 'BOOKED_MEASURE':
      return '#007bff';
    case 'PARKED_MEASURE':
      return '#ffc107';
    case 'UNASSIGNED_MEASURE':
      return '#fd7e14'; // Orange for unassigned
    default:
      return '#6c757d';
  }
};

// Helper function to format date
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' ' + date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
};

// Helper function to format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(parseFloat(value) || 0);
};

export default TransactionDetail;