import React from 'react';
import type { AvatarOption } from '../types/chat';
import type { UseHandGesturesResult } from '../hooks/useHandGestures';

interface AvatarStageProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
  isReady: boolean;
  isSpeaking: boolean;
  isAudioUnlocked: boolean;
  onUnlockAudio: () => void;
  personaName: string;
  subtitle: string;
  avatars: AvatarOption[];
  selectedAvatar: string;
  isLockedIn: boolean;
  previewIndex: number;
  onStepPreview: (dir: -1 | 1) => void;
  onLockInAvatar: (id: string) => void;
  onChangeAvatar: () => void;
  /** Camera preview element driven by the gesture controller. */
  gestureVideoRef: React.RefObject<HTMLVideoElement | null>;
  gesture: UseHandGesturesResult;
}

function gestureHint(g: UseHandGesturesResult): string {
  switch (g.status) {
    case 'loading':
      return 'Starting camera…';
    case 'ready':
      return 'Wave ✋ left / right to browse · hold 👍 to lock in';
    case 'denied':
      return 'Camera access blocked — use the arrows below.';
    case 'unsupported':
      return 'Gesture control needs a camera on a secure (https) page.';
    case 'error':
      return 'Camera unavailable — use the arrows below.';
    default:
      return '';
  }
}

export const AvatarStage: React.FC<AvatarStageProps> = ({
  stageRef,
  isReady,
  isSpeaking,
  personaName,
  subtitle,
  avatars,
  selectedAvatar,
  isLockedIn,
  previewIndex,
  onStepPreview,
  onLockInAvatar,
  onChangeAvatar,
  gestureVideoRef,
  gesture,
}) => {
  const activeIndex =
    previewIndex >= 0 && previewIndex < avatars.length ? previewIndex : 0;
  const currentAvatar = avatars[activeIndex] || null;
  const isCurrentActive = currentAvatar?.id === selectedAvatar;

  const handleLockIn = () => {
    if (currentAvatar) {
      onLockInAvatar(currentAvatar.id);
    }
  };

  const flashLabel =
    gesture.lastGesture === 'left'
      ? '◀ Previous'
      : gesture.lastGesture === 'right'
      ? 'Next ▶'
      : gesture.lastGesture === 'ok'
      ? '✓ Locking in'
      : null;

  return (
    <section className="col-center">
      <div className="stage-container">
        {/* 3D Web Component Container */}
        <div
          ref={stageRef}
          className="stage-element-holder"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: 10,
            opacity: isLockedIn ? 1 : 0,
            pointerEvents: isLockedIn ? 'auto' : 'none',
            transition: 'opacity 0.35s ease',
          }}
        />

        {/* When NOT locked in: Show Avatar Selection in the middle! */}
        {!isLockedIn ? (
          <div className="center-persona-overlay">
            <div className="center-persona-card">
              <div className="center-persona-header">
                <span className="badge badge-accent">Step 1: Choose Concierge</span>
                <span className="badge badge-preloaded">Preloaded (0s Wait)</span>
              </div>

              <h2 className="center-persona-title">Select Your Concierge Avatar</h2>
              <p className="center-persona-desc">
                Use the arrows, or wave your hand at the camera — swipe left / right
                to browse and hold a thumbs-up to lock in.
              </p>

              {/* Gesture control HUD */}
              <div
                className={`gesture-hud${gesture.inCooldown ? ' is-cooldown' : ''}${
                  gesture.status === 'denied' ||
                  gesture.status === 'unsupported' ||
                  gesture.status === 'error'
                    ? ' is-unavailable'
                    : ''
                }`}
              >
                <div className="gesture-cam-wrap">
                  <video
                    ref={gestureVideoRef}
                    className="gesture-cam"
                    playsInline
                    muted
                    autoPlay
                  />
                  {flashLabel && <span className="gesture-flash">{flashLabel}</span>}
                  {gesture.status === 'ready' && !flashLabel && (
                    <span
                      className={`gesture-live-dot${
                        gesture.inCooldown ? ' dim' : ''
                      }`}
                    />
                  )}
                </div>
                <span className="gesture-hint-text">{gestureHint(gesture)}</span>
              </div>

              {/* Avatar Carousel */}
              <div className="center-carousel-wrap">
                <button
                  type="button"
                  onClick={() => onStepPreview(-1)}
                  className="carousel-nav-btn prev-btn center-nav-btn"
                  title="Previous Avatar"
                  aria-label="Previous Avatar"
                >
                  <svg
                    width="20"
                    height="20"
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

                <div className="center-avatar-preview">
                  {currentAvatar?.thumbnail ? (
                    <img
                      src={currentAvatar.thumbnail}
                      alt={currentAvatar.name}
                      className="center-avatar-thumb"
                    />
                  ) : (
                    <div className="center-avatar-placeholder">
                      <svg
                        width="40"
                        height="40"
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

                  <div className="center-avatar-meta">
                    <strong className="center-avatar-name">
                      {currentAvatar?.name || 'Selected Avatar'}
                    </strong>
                    <span className="center-avatar-role">
                      {currentAvatar?.role || 'Concierge Host'}
                    </span>
                    <span className="center-avatar-index">
                      {avatars.length > 0 ? `${activeIndex + 1} of ${avatars.length}` : ''}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStepPreview(1)}
                  className="carousel-nav-btn next-btn center-nav-btn"
                  title="Next Avatar"
                  aria-label="Next Avatar"
                >
                  <svg
                    width="20"
                    height="20"
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


              {/* Lock-In Button */}
              <button
                type="button"
                onClick={handleLockIn}
                className="btn-lock-in center-lock-btn"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Lock In &amp; Use Avatar</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Live Speaking Indicator */}
            <div className={`avatar-live-indicator ${isSpeaking ? 'speaking' : ''}`}>
              <span className="indicator-pulse"></span>
              <span>
                {isSpeaking
                  ? `${personaName} is Speaking...`
                  : isReady
                  ? `${personaName} is Ready`
                  : `${personaName} (Connecting...)`}
              </span>
            </div>

            {/* Switch Avatar Button */}
            <button
              type="button"
              onClick={onChangeAvatar}
              className="btn-switch-avatar"
              title="Switch to another avatar"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>Switch Avatar</span>
            </button>

            {/* Spoken Subtitle Overlay */}
            {subtitle && (
              <div className="spoken-subtitle">
                <span className="subtitle-speaker">{personaName}:</span>
                <p>{subtitle}</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
