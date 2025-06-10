import React, { useState, useEffect } from 'react';

/**
 * Component for viewing budget history and audit trail
 */
const BudgetHistoryViewer = ({ entityKey, entityType, baseApiUrl }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [allHistory, setAllHistory] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const loadHistory = async () => {
    if (!entityKey || !baseApiUrl) return;
    
    try {
      setLoading(true);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      // Get summary with recent changes
      const summaryResponse = await fetch(
        `${normalizedApiUrl}/api/budget-summary/${encodeURIComponent(entityKey)}`
      );
      
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        setSummary(summaryData);
        setHistory(summaryData.recent_changes || []);
      }
      
    } catch (error) {
      console.error('Error loading budget history:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllHistory = async () => {
    if (!baseApiUrl) return;
    
    try {
      setLoading(true);
      
      const normalizedApiUrl = baseApiUrl.endsWith('/') 
        ? baseApiUrl.slice(0, -1) 
        : baseApiUrl;
      
      // Get all history for this entity
      const historyResponse = await fetch(
        `${normalizedApiUrl}/api/budget-history?entity_key=${encodeURIComponent(entityKey)}&limit=100`
      );
      
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        setAllHistory(historyData.entries || []);
        setShowAllHistory(true);
      }
      
    } catch (error) {
      console.error('Error loading all budget history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    setShowAllHistory(false);
  }, [entityKey, baseApiUrl]);

  if (!entityKey) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        Select a department or region to view budget history
      </div>
    );
  }

  const displayHistory = showAllHistory ? allHistory : history;

  return (
    <div className="budget-history-viewer" style={{ padding: '20px' }}>
      <h3 style={{ margin: '0 0 20px 0' }}>
        📊 Budget History: {entityKey.split('|')[0]}
      </h3>
      
      {summary && (
        <div className="current-budget" style={{ 
          padding: '15px', 
          backgroundColor: '#f0f8ff', 
          marginBottom: '20px',
          borderRadius: '6px',
          border: '1px solid #b3d9ff'
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Current Budget</h4>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0066cc' }}>
            €{summary.current_budget.allocated_budget.toLocaleString('de-DE')}
          </div>
          {summary.current_budget.last_updated && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Last updated: {new Date(summary.current_budget.last_updated).toLocaleString()}
            </div>
          )}
          {summary.total_changes > 0 && (
            <div style={{ fontSize: '12px', color: '#666' }}>
              Total changes in history: {summary.total_changes}
            </div>
          )}
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h4 style={{ margin: 0 }}>
          {showAllHistory ? 'Complete History' : 'Recent Changes'}
        </h4>
        <div>
          {!showAllHistory && summary && summary.total_changes > history.length && (
            <button 
              onClick={loadAllHistory}
              disabled={loading}
              style={{ 
                padding: '6px 12px', 
                backgroundColor: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              {loading ? 'Loading...' : 'View Full History'}
            </button>
          )}
          {showAllHistory && (
            <button 
              onClick={() => setShowAllHistory(false)}
              style={{ 
                padding: '6px 12px', 
                backgroundColor: '#6c757d', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Show Recent Only
            </button>
          )}
        </div>
      </div>
      
      {loading && !displayHistory.length ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          Loading history...
        </div>
      ) : displayHistory.length > 0 ? (
        <div className="history-list">
          {displayHistory.map((entry, index) => (
            <div key={`${entry.change_id}-${index}`} className="history-entry" style={{
              padding: '15px',
              borderLeft: entry.change_amount > 0 ? '4px solid #28a745' : '4px solid #dc3545',
              marginBottom: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '0 6px 6px 0',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                    €{entry.old_value.toLocaleString('de-DE')} → €{entry.new_value.toLocaleString('de-DE')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {entry.entity_type === 'department' ? '🏢' : '📍'} {entry.entity_name}
                  </div>
                </div>
                <div style={{ 
                  color: entry.change_amount > 0 ? '#28a745' : '#dc3545',
                  fontWeight: 'bold',
                  fontSize: '16px',
                  textAlign: 'right'
                }}>
                  {entry.change_amount > 0 ? '+' : ''}€{entry.change_amount.toLocaleString('de-DE')}
                  <div style={{ fontSize: '10px', color: '#666', fontWeight: 'normal' }}>
                    {entry.change_amount > 0 ? 'INCREASE' : 'DECREASE'}
                  </div>
                </div>
              </div>
              
              <div style={{ fontSize: '13px', color: '#495057', marginBottom: '8px' }}>
                <div style={{ marginBottom: '3px' }}>
                  <strong>👤 Changed by:</strong> {entry.user_name} {entry.user_id && `(${entry.user_id})`}
                </div>
                <div style={{ marginBottom: '3px' }}>
                  <strong>🕒 When:</strong> {new Date(entry.timestamp).toLocaleString()}
                </div>
                {entry.change_reason && (
                  <div style={{ marginBottom: '3px' }}>
                    <strong>💬 Reason:</strong> {entry.change_reason}
                  </div>
                )}
              </div>
              
              <div style={{ fontSize: '11px', color: '#6c757d', paddingTop: '8px', borderTop: '1px solid #dee2e6' }}>
                <div>🔗 Change ID: {entry.change_id}</div>
                {entry.user_ip && <div>🌐 IP: {entry.user_ip}</div>}
                {entry.backup_file && <div>📋 Backup: {entry.backup_file}</div>}
              </div>
            </div>
          ))}
          
          {!showAllHistory && summary && summary.total_changes > history.length && (
            <div style={{ textAlign: 'center', padding: '15px', color: '#666', fontStyle: 'italic' }}>
              ... and {summary.total_changes - history.length} more changes
            </div>
          )}
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px', 
          color: '#666',
          backgroundColor: '#f8f9fa',
          borderRadius: '6px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>📊</div>
          <div>No budget changes recorded for this entity.</div>
          <div style={{ fontSize: '12px', marginTop: '5px' }}>
            Budget changes will appear here once you start making allocations.
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetHistoryViewer;