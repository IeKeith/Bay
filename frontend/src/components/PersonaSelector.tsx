import React from 'react';
import type { AvatarOption } from '../types/chat';

interface PersonaSelectorProps {
  avatars: AvatarOption[];
  selectedAvatar: string;
  onAvatarChange: (id: string) => void;
  onReconnect: () => void;
  isPreloaded?: boolean;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({
  avatars,
  selectedAvatar,
  onAvatarChange,
  onReconnect,
  isPreloaded = true,
}) => {
  const [localIndex, setLocalIndex] = React.useState(() => {
    const idx = avatars.findIndex((a) => a.id === selectedAvatar);
    return idx >= 0 ? idx : 0;
  });

  React.useEffect(() => {
    const idx = avatars.findIndex((a) => a.id === selectedAvatar);
    if (idx >= 0) setLocalIndex(idx);
  }, [selectedAvatar, avatars]);

  const activeIndex = localIndex >= 0 && localIndex < avatars.length ? localIndex : 0;
  const currentAvatar = avatars[activeIndex] || null;

  const handlePrev = () => {
    if (avatars.length === 0) return;
    const prevIdx = (activeIndex - 1 + avatars.length) % avatars.length;
    setLocalIndex(prevIdx);
    onAvatarChange(avatars[prevIdx].id);
  };

  const handleNext = () => {
    if (avatars.length === 0) return;
    const nextIdx = (activeIndex + 1) % avatars.length;
    setLocalIndex(nextIdx);
    onAvatarChange(avatars[nextIdx].id);
  };

  return (
    <section className="card setup-card">
      <div className="card-header-row">
        <h3 className="card-title" style={{ marginBottom: 0 }}>Concierge Avatar</h3>
        {isPreloaded && (
          <span className="badge badge-preloaded" title="Avatars pre-rendered at startup">
            Preloaded (0s Wait)
          </span>
        )}
      </div>

      {/* Avatar Carousel Switcher with Left / Right Buttons */}
      <div className="avatar-carousel-container">
        <button
          onClick={handlePrev}
          className="carousel-nav-btn prev-btn"
          title="Previous Avatar"
          aria-label="Previous Avatar"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="avatar-preview-card">
          {currentAvatar?.thumbnail ? (
            <img
              src={currentAvatar.thumbnail}
              alt={currentAvatar.name}
              className="avatar-thumb-circle"
            />
          ) : (
            <div className="avatar-thumb-placeholder">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
          <div className="avatar-info-group">
            <strong className="avatar-model-name">
              {currentAvatar?.name || 'Selected Avatar'}
            </strong>
            <span className="avatar-role-label">
              {currentAvatar?.role || 'Concierge Host'}
            </span>
            <span className="avatar-index-pill">
              {avatars.length > 0 ? `${activeIndex + 1} of ${avatars.length}` : ''}
            </span>
          </div>
        </div>

        <button
          onClick={handleNext}
          className="carousel-nav-btn next-btn"
          title="Next Avatar"
          aria-label="Next Avatar"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Pagination Dots */}
      <div className="avatar-dots-row">
        {avatars.map((av, idx) => (
          <button
            key={av.id}
            onClick={() => onAvatarChange(av.id)}
            className={`avatar-dot ${idx === activeIndex ? 'active' : ''}`}
            title={av.name}
          />
        ))}
      </div>

      {/* Matched Voice Indicator (Replaces manual dropdown) */}
      <div
        className="matched-voice-indicator"
        style={{
          margin: '6px 0 4px 0',
          padding: '5px 10px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
        }}
      >
        <span style={{ color: 'var(--text-muted)' }}>Matched Voice:</span>
        <strong style={{ color: 'var(--botanical-light)' }}>
          {currentAvatar?.voice_name || 'Assigned Voice'}
        </strong>
      </div>

      <button onClick={onReconnect} className="btn-primary-ghost">
        Reconnect Avatar
      </button>
    </section>
  );
};
