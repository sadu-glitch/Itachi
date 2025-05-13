import React, { useState, useContext } from 'react';
import AppContext from '../context/AppContext';
import * as measureService from '../api/measureService';
import './AdminPage.css';

const AdminPage = () => {
  const { apiConfig } = useContext(AppContext);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileType, setFileType] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [processError, setProcessError] = useState(null);
  const [processSuccess, setProcessSuccess] = useState(null);
  
  // Handle file selection
  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setUploadError(null);
    setUploadSuccess(null);
  };
  
  // Handle file type selection
  const handleFileTypeChange = (e) => {
    setFileType(e.target.value);
    setUploadError(null);
    setUploadSuccess(null);
  };
  
  // Handle file upload
  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setUploadError('Please select a file to upload');
      return;
    }
    
    if (!fileType) {
      setUploadError('Please select a file type');
      return;
    }
    
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    
    try {
      // Create FormData object
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('type', fileType);
      
      // Upload file - use the API URL from context
      const response = await fetch(`${apiConfig.baseUrl}/api/upload-file`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'File upload failed');
      }
      
      const data = await response.json();
      
      // Show success message
      setUploadSuccess(`File uploaded successfully as ${data.filename}`);
      
      // Clear form
      setSelectedFile(null);
      setFileType('');
      // Reset file input
      document.getElementById('file-input').value = '';
      
    } catch (err) {
      console.error('Error uploading file:', err);
      setUploadError(`Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle data processing
  const handleProcessData = async () => {
    setIsProcessing(true);
    setProcessError(null);
    setProcessSuccess(null);
    
    try {
      // Trigger data processing
      await measureService.triggerProcessing();
      
      // Show success message
      setProcessSuccess('Data processing completed successfully');
    } catch (err) {
      console.error('Error processing data:', err);
      setProcessError(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Admin</h1>
        <p>Upload files and process data</p>
      </div>
      
      <div className="admin-sections">
        <div className="admin-section">
          <h2>Upload Files</h2>
          <p>
            Upload SAP data, MSP data, or mapping files for processing.
          </p>
          
          {uploadError && (
            <div className="error-message">
              {uploadError}
            </div>
          )}
          
          {uploadSuccess && (
            <div className="success-message">
              {uploadSuccess}
            </div>
          )}
          
          <form onSubmit={handleUpload} className="upload-form">
            <div className="form-group">
              <label htmlFor="fileType">File Type</label>
              <select
                id="fileType"
                value={fileType}
                onChange={handleFileTypeChange}
                required
              >
                <option value="">-- Select File Type --</option>
                <option value="sap">SAP Data</option>
                <option value="msp">MSP Data</option>
                <option value="mapping">Mapping Data</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="file-input">Select File</label>
              <input
                id="file-input"
                type="file"
                onChange={handleFileChange}
                accept=".xlsx,.csv"
                required
              />
              <p className="form-help">Accepted formats: .xlsx, .csv</p>
            </div>
            
            <div className="form-actions">
              <button 
                type="submit" 
                className="btn-upload" 
                disabled={isUploading}
              >
                {isUploading ? 'Uploading...' : 'Upload File'}
              </button>
            </div>
          </form>
        </div>
        
        <div className="admin-section">
          <h2>Process Data</h2>
          <p>
            Process the data to match MSP and SAP transactions, generate reports, 
            and update the frontend views.
          </p>
          
          {processError && (
            <div className="error-message">
              {processError}
            </div>
          )}
          
          {processSuccess && (
            <div className="success-message">
              {processSuccess}
            </div>
          )}
          
          <div className="process-actions">
            <button 
              className="btn-process" 
              onClick={handleProcessData}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Process Data'}
            </button>
          </div>
          
          <div className="process-warning">
            <p>
              <strong>Note:</strong> Data processing may take several minutes depending on the 
              size of the data files.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;