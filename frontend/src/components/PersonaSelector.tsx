import React from 'react';
import type { AvatarOption } from '../types/chat';

interface PersonaSelectorProps {
  avatars: AvatarOption[];
  selectedAvatar: string;
  onAvatarSelect: (id: string) => void;
  isPreloaded?: boolean;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({
  avatars,
  selectedAvatar,
  onAvatarSelect,
  isPreloaded = true,
}) => {
  const [previewIndex, setPreviewIndex] = React.useState(() => {
    const idx = avatars.findIndex((a) => a.id === selectedAvatar);
    return idx >= 0 ? idx : 0;
  });

  React.useEffect(() => {
    const idx = avatars.findIndex((a) => a.id === selectedAvatar);
    if (idx >= 0) setPreviewIndex(idx);
  }, [selectedAvatar, avatars]);

  const activeIndex = previewIndex >= 0 && previewIndex < avatars.length ? previewIndex : 0;
  const currentAvatar = avatars[activeIndex] || null;

  const handlePrev = () => {
    if (avatars.length === 0) return;
    const prevIdx = (activeIndex - 1 + avatars.length) % avatars.length;
    setPreviewIndex(prevIdx);
  };

  const handleNext = () => {
    if (avatars.length === 0) return;
    const nextIdx = (activeIndex + 1) % avatars.length;
    setPreviewIndex(nextIdx);
  };

  const isCurrentActive = currentAvatar?.id === selectedAvatar;

  const handleLockIn = () => {
    if (currentAvatar) {
      onAvatarSelect(currentAvatar.id);
    }
  };

  return (
    <section className="card setup-card">
      <div className="card-header-row">
        <h3 className="card-title" style={{ marginBottom: 0 }}>Concierge Avatar</h3>
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


      {/* Lock In and Use Avatar Button */}
      <button
        onClick={handleLockIn}
        className={isCurrentActive ? 'btn-locked' : 'btn-lock-in'}
        title={isCurrentActive ? 'Currently active avatar (click to refresh)' : 'Lock in and switch to this avatar'}
      >
        {isCurrentActive ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Active Avatar (In Use)</span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Lock In &amp; Use Avatar</span>
          </>
        )}
      </button>
    </section>
  );
};
