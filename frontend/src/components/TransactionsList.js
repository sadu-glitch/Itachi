import React, { useState } from 'react';

function TransactionsList({ awaitingAssignment, apiUrl }) {
  const [selectedMeasure, setSelectedMeasure] = useState(null);
  const [regionAssignment, setRegionAssignment] = useState('');
  const [districtAssignment, setDistrictAssignment] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSelectMeasure = (measure) => {
    setSelectedMeasure(measure);
    setRegionAssignment('');
    setDistrictAssignment('');
    setMessage(null);
  };

  const handleAssign = async () => {
    if (!selectedMeasure || !regionAssignment || !districtAssignment) {
      setMessage({
        type: 'error',
        text: 'Please select a region and district'
      });
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch(`${apiUrl}/api/assign-measure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bestellnummer: selectedMeasure.bestellnummer,
          region: regionAssignment,
          district: districtAssignment
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage({
          type: 'success',
          text: `Successfully assigned measure ${selectedMeasure.bestellnummer} to ${regionAssignment}/${districtAssignment}`
        });
        
        // Remove the assigned measure from the list
        setSelectedMeasure(null);
      } else {
        setMessage({
          type: 'error',
          text: data.message || 'Failed to assign measure'
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Format currency values
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value || 0);
  };

  return (
    <div className="transactions-list">
      <h2>Awaiting Assignment</h2>
      
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      <div className="transaction-grid">
        <div className="transaction-list">
          <div className="transaction-header">
            <div>Bestellnummer</div>
            <div>Description</div>
            <div>Amount</div>
            <div>Status</div>
          </div>
          
          {awaitingAssignment && awaitingAssignment.length > 0 ? (
            awaitingAssignment.map(measure => (
              <div 
                className={`transaction-row ${selectedMeasure && selectedMeasure.bestellnummer === measure.bestellnummer ? 'selected' : ''}`}
                key={measure.bestellnummer}
                onClick={() => handleSelectMeasure(measure)}
              >
                <div>{measure.bestellnummer}</div>
                <div>{measure.description}</div>
                <div>{formatCurrency(measure.amount)}</div>
                <div>{measure.status}</div>
              </div>
            ))
          ) : (
            <div className="empty-state">No measures awaiting assignment</div>
          )}
        </div>
        
        {selectedMeasure && (
          <div className="assignment-panel">
            <h3>Assign Measure</h3>
            <div className="measure-details">
              <p><strong>Bestellnummer:</strong> {selectedMeasure.bestellnummer}</p>
              <p><strong>Description:</strong> {selectedMeasure.description}</p>
              <p><strong>Amount:</strong> {formatCurrency(selectedMeasure.amount)}</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="region">Region:</label>
              <input
                type="text"
                id="region"
                value={regionAssignment}
                onChange={(e) => setRegionAssignment(e.target.value)}
                placeholder="Enter region"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="district">District:</label>
              <input
                type="text"
                id="district"
                value={districtAssignment}
                onChange={(e) => setDistrictAssignment(e.target.value)}
                placeholder="Enter district"
              />
            </div>
            
            <button 
              className="assign-button"
              onClick={handleAssign}
              disabled={loading}
            >
              {loading ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TransactionsList;