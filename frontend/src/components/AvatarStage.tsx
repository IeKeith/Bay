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
        {/* Background Backdrop */}
        <div className="stage-backdrop"></div>

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
              <span className="overlay-icon">🔊</span>
              <h2>Welcome to Satay by the Bay!</h2>
              <p>Click below to unlock live 3D avatar voice & audio synthesis.</p>
              <button onClick={onUnlockAudio} className="btn-glow">
                ✨ Enter Concierge & Enable Audio
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
            <span className="subtitle-speaker">🎙️ {personaName}:</span>
            <p>{subtitle}</p>
          </div>
        )}
      </div>
    </section>
  );
};
