import React from 'react';

interface HeaderProps {
  statusText: string;
}

export const Header: React.FC<HeaderProps> = ({ statusText }) => {
  return (
    <header className="kiosk-header">
      <div className="brand-group">
        <div
          className="brand-icon-wrap"
          style={{
            color: 'var(--botanical-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            background: 'rgba(76, 154, 42, 0.2)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        </div>
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
          <span>
            Target: <strong>Supertree Show 7:45 PM</strong>
          </span>
        </div>
      </div>
    </header>
  );
};
