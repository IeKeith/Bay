import React from 'react';

interface AvatarStageProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
  isReady: boolean;
  isSpeaking: boolean;
  isAudioUnlocked: boolean;
  onUnlockAudio: () => void;
  personaName: string;
  subtitle: string;
}

export const AvatarStage: React.FC<AvatarStageProps> = ({
  stageRef,
  isReady,
  isSpeaking,
  isAudioUnlocked,
  onUnlockAudio,
  personaName,
  subtitle,
}) => {
  return (
    <section className="col-center">
      <div className="stage-container">
        {/* 3D Web Component Container */}
        <div
          ref={stageRef}
          className="stage-element-holder"
          style={{ width: '100%', height: '100%', position: 'relative', zIndex: 10 }}
        />

        {/* Autoplay Audio Unlock Overlay */}
        {!isAudioUnlocked && (
          <div className="audio-overlay">
            <div className="overlay-card">
              <div
                className="overlay-icon-svg"
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '14px',
                  color: 'var(--botanical-light)',
                }}
              >
                <svg
                  width="42"
                  height="42"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </div>
              <h2>Welcome to Satay by the Bay!</h2>
              <p>Click below to unlock live 3D avatar voice and audio synthesis.</p>
              <button onClick={onUnlockAudio} className="btn-glow">
                Enter Concierge & Enable Audio
              </button>
            </div>
          </div>
        )}

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

        {/* Spoken Subtitle Overlay */}
        {subtitle && (
          <div className="spoken-subtitle">
            <span className="subtitle-speaker">{personaName}:</span>
            <p>{subtitle}</p>
          </div>
        )}
      </div>
    </section>
  );
};
