import React, { useState, useEffect, useContext } from 'react';
import AppContext from '../context/AppContext';
import MeasureAssignmentForm from '../components/measures/MeasureAssignmentForm';
import * as measureService from '../api/measureService';
import './ParkedMeasuresPage.css';

const ParkedMeasuresPage = () => {
  const { regions, refreshData } = useContext(AppContext);
  const [parkedMeasures, setParkedMeasures] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Fetch parked measures
  useEffect(() => {
    const fetchParkedMeasures = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const measures = await measureService.getParkedMeasures();
        setParkedMeasures(measures);
      } catch (err) {
        console.error('Error fetching parked measures:', err);
        setError(`Error: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchParkedMeasures();
  }, []);
  
  // Handle successful measure assignment
  const handleAssignSuccess = () => {
    // Refresh data
    refreshData();
    
    // Fetch updated parked measures
    const fetchUpdatedMeasures = async () => {
      setIsLoading(true);
      
      try {
        const measures = await measureService.getParkedMeasures();
        setParkedMeasures(measures);
      } catch (err) {
        console.error('Error fetching updated parked measures:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUpdatedMeasures();
  };
  
  // Get available regions for a department
  const getAvailableRegionsForDepartment = (departmentId) => {
    return regions.filter(region => region.department === departmentId);
  };
  
  // Count total parked measures
  const getTotalParkedMeasures = () => {
    return Object.values(parkedMeasures).reduce(
      (total, measures) => total + measures.length, 
      0
    );
  };
  
  return (
    <div className="parked-measures-page">
      <div className="page-header">
        <h1>Parked Measures</h1>
        <p>
          Assign measures to regions and districts. These measures will be reserved 
          until they match with SAP transactions.
        </p>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {isLoading && (
        <div className="loading-message">
          Loading parked measures...
        </div>
      )}
      
      {!isLoading && !error && (
        <>
          <div className="measures-count">
            {getTotalParkedMeasures()} parked measures awaiting assignment
          </div>
          
          <div className="departments-measures">
            {Object.entries(parkedMeasures).length === 0 ? (
              <div className="no-measures">
                <p>No parked measures found</p>
              </div>
            ) : (
              Object.entries(parkedMeasures).map(([departmentId, measures]) => (
                <div key={departmentId} className="department-section">
                  <div className="department-header">
                    <h2>{departmentId}</h2>
                    <span className="measures-badge">{measures.length} measures</span>
                  </div>
                  
                  <div className="measures-list">
                    {measures.map(measure => (
                      <div key={measure.bestellnummer} className="measure-item">
                        <MeasureAssignmentForm 
                          measure={measure}
                          availableRegions={getAvailableRegionsForDepartment(departmentId)}
                          onAssignSuccess={handleAssignSuccess}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ParkedMeasuresPage;