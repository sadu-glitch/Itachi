import React, { useContext } from 'react';
import Header from './Header';
import AppContext from '../../context/AppContext';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  const { isLoading, error } = useContext(AppContext);
  
  return (
    <div className="app-container">
      <Header />
      
      <main className="main-content">
        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>Loading data...</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        
        {!isLoading && !error && children}
      </main>
      
      <footer className="app-footer">
        <div className="footer-content">
          <p>&copy; 2025 Budget Management System</p>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;