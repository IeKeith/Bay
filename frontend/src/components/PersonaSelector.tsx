import React from 'react';
import type { AvatarOption, VoiceOption } from '../types/chat';

interface PersonaSelectorProps {
  avatars: AvatarOption[];
  voices: VoiceOption[];
  selectedAvatar: string;
  selectedVoice: string;
  onAvatarChange: (id: string) => void;
  onVoiceChange: (id: string) => void;
  onReconnect: () => void;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({
  avatars,
  voices,
  selectedAvatar,
  selectedVoice,
  onAvatarChange,
  onVoiceChange,
  onReconnect,
}) => {
  return (
    <section className="card setup-card">
      <h3 className="card-title">🎭 Concierge Avatar</h3>
      <div className="field-row">
        <label htmlFor="avatar-select">Persona</label>
        <select
          id="avatar-select"
          className="form-select"
          value={selectedAvatar}
          onChange={(e) => onAvatarChange(e.target.value)}
        >
          {avatars.map((av) => (
            <option key={av.id} value={av.id}>
              {av.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label htmlFor="voice-select">Voice</label>
        <select
          id="voice-select"
          className="form-select"
          value={selectedVoice}
          onChange={(e) => onVoiceChange(e.target.value)}
        >
          {voices.map((vc) => (
            <option key={vc.id} value={vc.id}>
              {vc.name}
            </option>
          ))}
        </select>
      </div>

      <button onClick={onReconnect} className="btn-primary-ghost">
        🔄 Reconnect Avatar
      </button>
    </section>
  );
};
