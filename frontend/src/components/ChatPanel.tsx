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
            <h3 className="card-title">💬 Live Voice Chat</h3>
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
                {msg.role === 'user' ? 'You' : `🌿 ${personaName} • Concierge`}
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
              <span className="mic-icon">{isListening ? '🔴' : '🎤'}</span>
              <span className="mic-label">
                {isListening ? 'Listening... Speak now' : 'Tap to Speak'}
              </span>
            </button>
          </div>

          {repairNoticeText && (
            <div className="repair-notice">
              <span>✨ Auto-corrected: </span>
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
            <button type="submit" className="send-btn" title="Send message">
              ➤
            </button>
          </form>
        </div>
      </section>
    </aside>
  );
};
