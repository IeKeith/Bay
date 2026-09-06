import React from 'react';

interface HeaderProps {
  statusText: string;
  cartCount?: number;
  onToggleCart?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ statusText, cartCount = 0, onToggleCart }) => {
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
        {onToggleCart && (
          <button
            type="button"
            className={`btn-header-cart ${cartCount > 0 ? 'has-items' : ''}`}
            onClick={onToggleCart}
            title="Open Cart & Checkout"
            aria-label={`Open Cart (${cartCount} items)`}
          >
            <span className="header-cart-icon-wrap">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
              {cartCount > 0 && <span className="cart-badge-count">{cartCount}</span>}
            </span>
            <span className="header-cart-text">Cart</span>
          </button>
        )}
      </div>
    </header>
  );
};

