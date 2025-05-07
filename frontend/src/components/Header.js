import React from 'react';

function Header() {
  return (
    <header className="header">
      <div className="logo">
        <h1>MSP-SAP Integration Dashboard</h1>
      </div>
      <nav className="nav">
        <ul>
          <li><a href="/">Dashboard</a></li>
          <li><a href="/transactions">Transactions</a></li>
          <li><a href="/budget">Budget Allocation</a></li>
        </ul>
      </nav>
    </header>
  );
}

export default Header;