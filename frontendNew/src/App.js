import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppContextProvider } from './context/AppContext';
import { BudgetContextProvider } from './context/BudgetContext';
import MainLayout from './components/layout/MainLayout';
import DashboardPage from './pages/DashboardPage';
import DepartmentsPage from './pages/DepartmentsPage';
import DepartmentDetailPage from './pages/DepartmentDetailPage';
import RegionDetailPage from './pages/RegionDetailPage';
import ParkedMeasuresPage from './pages/ParkedMeasuresPage';
import BudgetAllocationPage from './pages/BudgetAllocationPage';
import AdminPage from './pages/AdminPage';
import './App.css';

// Store API URL in a constant or environment variable
// This should match your Azure environment
const API_URL = 'https://msp-sap-api2-h5dmf6e6d4fngcbf.germanywestcentral-01.azurewebsites.net';

// Create an API config to pass to context providers
const apiConfig = {
  baseUrl: API_URL
};

function App() {
  return (
    <AppContextProvider apiConfig={apiConfig}>
      <BudgetContextProvider>
        <Router>
          <MainLayout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/departments/:departmentId" element={<DepartmentDetailPage />} />
              <Route path="/regions/:regionId" element={<RegionDetailPage />} />
              <Route path="/measures/parked" element={<ParkedMeasuresPage />} />
              <Route path="/budget" element={<BudgetAllocationPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </MainLayout>
        </Router>
      </BudgetContextProvider>
    </AppContextProvider>
  );
}

export default App;