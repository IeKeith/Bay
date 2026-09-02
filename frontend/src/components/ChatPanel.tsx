import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types/chat';

interface ChatPanelProps {
  messages: ChatMessage[];
  isListening: boolean;
  autoListen: boolean;
  onToggleAutoListen: (val: boolean) => void;
  onToggleMic: () => void;
  onSendMessage: (text: string) => void;
  personaName: string;
  repairNoticeText: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isListening,
  autoListen,
  onToggleAutoListen,
  onToggleMic,
  onSendMessage,
  personaName,
  repairNoticeText,
}) => {
  const [inputText, setInputText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const renderFormattedText = (content: string) => {
    return {
      __html: content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br />'),
    };
  };

  return (
    <aside className="col-right">
      <section className="card chat-card">
        <div className="chat-header">
          <div className="chat-title-group">
            <h3 className="card-title">Live Voice Chat</h3>
            <span className="chat-subtitle">Continuous Voice-to-Voice AI</span>
          </div>
          <label className="toggle-wrap" title="Automatically listen after avatar speaks">
            <input
              type="checkbox"
              checked={autoListen}
              onChange={(e) => onToggleAutoListen(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Auto-Listen</span>
          </label>
        </div>

        {/* Messages Log */}
        <div className="chat-log" ref={logRef}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'}`}
            >
              <div className="bubble-sender">
                {msg.role === 'user' ? 'You' : `${personaName} • Concierge`}
              </div>
              <div
                className="bubble-text"
                dangerouslySetInnerHTML={renderFormattedText(msg.content)}
              />
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="chat-controls">
          <div className="voice-btn-container">
            <button
              onClick={onToggleMic}
              className={`mic-button ${isListening ? 'listening' : ''}`}
              title="Click to speak"
            >
              <span className="mic-icon" style={{ display: 'flex', alignItems: 'center' }}>
                {isListening ? (
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      display: 'inline-block',
                      animation: 'pulse-dot 0.8s infinite',
                    }}
                  />
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </span>
              <span className="mic-label">
                {isListening ? 'Listening... Speak now' : 'Tap to Speak'}
              </span>
            </button>
          </div>

          {repairNoticeText && (
            <div className="repair-notice">
              <span>Auto-corrected: </span>
              <strong>{repairNoticeText}</strong>
            </div>
          )}

          <form onSubmit={handleSubmit} className="text-input-form">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Or type a question or dietary request..."
              autoComplete="off"
            />
            <button
              type="submit"
              className="send-btn"
              title="Send message"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </aside>
  );
};
