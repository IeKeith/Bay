import React from 'react';

interface HeaderProps {
  statusText: string;
}

export const Header: React.FC<HeaderProps> = ({ statusText }) => {
  return (
    <header className="kiosk-header">
      <div className="brand-group">
        <span className="brand-icon">🌿</span>
        <div>
          <h1 className="brand-title">Garden-to-Table Host</h1>
          <p className="brand-sub">Satay by the Bay • Gardens by the Bay AI Concierge</p>
        </div>
      </div>
      <div className="header-status">
        <div className="status-indicator">
          <span className="status-dot online"></span>
          <span>{statusText}</span>
        </div>
        <div className="attraction-pill">
          <span className="pill-icon">🎆</span>
          <span>Target: <strong>Supertree Show 7:45 PM</strong></span>
        </div>
      </div>
    </header>
  );
};
