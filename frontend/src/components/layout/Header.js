import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

const Header = () => {
  const location = useLocation();
  
  // Check if path is active
  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };
  
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-logo">
          <h1>Budget Management</h1>
        </div>
        
        <nav className="header-nav">
          <ul>
            <li className={isActive('/') ? 'active' : ''}>
              <Link to="/">Dashboard</Link>
            </li>
            <li className={isActive('/departments') ? 'active' : ''}>
              <Link to="/departments">Departments</Link>
            </li>
            <li className={isActive('/measures') ? 'active' : ''}>
              <Link to="/measures/parked">Parked Measures</Link>
            </li>
            <li className={isActive('/budget') ? 'active' : ''}>
              <Link to="/budget">Budget Allocation</Link>
            </li>
            <li className={isActive('/admin') ? 'active' : ''}>
              <Link to="/admin">Admin</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;