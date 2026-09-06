import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, FoodSuggestionAction } from '../types/chat';
import type { FoodSpotlight } from './FoodSpotlightCard';

interface ChatPanelProps {
  messages: ChatMessage[];
  isListening: boolean;
  autoListen: boolean;
  onToggleAutoListen: (val: boolean) => void;
  onToggleMic: () => void;
  onSendMessage: (text: string) => void;
  onAddToCart?: (messageId: string, item: FoodSuggestionAction) => void;
  onCheckout?: (messageId: string, item: FoodSuggestionAction) => void;
  onSpeakMessage?: (text: string) => void;
  personaName: string;
  repairNoticeText: string | null;
  spotlight?: FoodSpotlight;
  interimTranscript?: string;
  liveTranscript?: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isListening,
  autoListen,
  onToggleAutoListen,
  onToggleMic,
  onSendMessage,
  onAddToCart,
  onCheckout,
  onSpeakMessage,
  personaName,
  repairNoticeText,
  spotlight,
  interimTranscript,
  liveTranscript,
}) => {
  const [inputText, setInputText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, liveTranscript]);

  // Sync text input with live speech while listening
  useEffect(() => {
    if (isListening && liveTranscript) {
      setInputText(liveTranscript);
    } else if (!isListening) {
      setInputText('');
    }
  }, [isListening, liveTranscript]);

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
            <h3 className="card-title">Chat</h3>
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

        {/* Integrated Food Spotlight Banner in Chat */}
        {spotlight && (
          <div className="chat-spotlight-banner">
            <div className="chat-spotlight-img-wrap">
              <img
                src={spotlight.imageUrl}
                alt={spotlight.dishName}
                className="chat-spotlight-img"
                onError={(e) => {
                  (e.target as HTMLImageElement).onerror = null;
                  (e.target as HTMLImageElement).src = '/food-placeholder.svg';
                }}
              />
              <span className="chat-spotlight-price">{spotlight.price}</span>
            </div>

            <div className="chat-spotlight-info">
              <div className="chat-spotlight-header">
                <span className="chat-spotlight-stall">Stall {spotlight.stallId} • {spotlight.stallName}</span>
              </div>
              <h4 className="chat-spotlight-title">{spotlight.dishName}</h4>
              <div className="chat-spotlight-meta">
                <span className="meta-tag meta-prep">{spotlight.prepTime}</span>
                <span className="meta-tag meta-dietary">{spotlight.dietary}</span>
              </div>
              {spotlight.description && (
                <p className="chat-spotlight-desc">{spotlight.description}</p>
              )}
            </div>
          </div>
        )}

        {/* Messages Log */}
        <div className="chat-log" ref={logRef}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'}`}
            >
              <div className="bubble-sender">
                <span>{msg.role === 'user' ? 'You' : `${personaName} • Concierge`}</span>
                {msg.role === 'assistant' && onSpeakMessage && (
                  <button
                    type="button"
                    onClick={() => onSpeakMessage(msg.content)}
                    className="bubble-listen-btn"
                    title="Play voice speech"
                    aria-label="Play voice speech"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span>Listen</span>
                  </button>
                )}
              </div>
              <div
                className="bubble-text"
                dangerouslySetInnerHTML={renderFormattedText(msg.content)}
              />

              {msg.suggestedFood && (
                <div className="chat-food-suggestion-box">
                  <div className="chat-food-suggestion-top">
                    <div className="chat-food-thumb-wrap">
                      <img
                        src={msg.suggestedFood.imageUrl || '/food-placeholder.svg'}
                        alt={msg.suggestedFood.dishName}
                        className="chat-food-thumb"
                        onError={(e) => {
                          (e.target as HTMLImageElement).onerror = null;
                          (e.target as HTMLImageElement).src = '/food-placeholder.svg';
                        }}
                      />
                    </div>
                    <div className="chat-food-suggestion-info">
                      <span className="chat-food-stall-badge">
                        Stall {msg.suggestedFood.stallId} • {msg.suggestedFood.stallName}
                      </span>
                      <strong className="chat-food-dish-title">
                        {msg.suggestedFood.dishName}
                      </strong>
                      <div className="chat-food-meta-row">
                        <span className="chat-food-price-tag">{msg.suggestedFood.price}</span>
                        {msg.suggestedFood.prepTime && (
                          <span className="chat-food-prep-tag">⏱ Est. wait: {msg.suggestedFood.prepTime}</span>
                        )}
                      </div>
                      {msg.suggestedFood.reason && (
                        <div className="chat-food-reason-badge">
                          <span className="reason-icon">💡</span>
                          <span className="reason-text">{msg.suggestedFood.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="chat-food-action-area">
                    <p className="plan-estimate-note">Estimated prep & queue wait</p>
                    {msg.checkoutError && <p role="alert">{msg.checkoutError}</p>}
                    {msg.orderState === 'checked_out' ? (
                      <div className="chat-order-status-badge success">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>
                          Order Confirmed! Queue <strong className="queue-num-highlight">#{msg.queueNumber || '108'}</strong>
                        </span>
                      </div>
                    ) : (msg.orderState === 'added' || msg.orderState === 'submitting') ? (
                      <div className="chat-cart-btn-group">
                        <span className="chat-in-cart-label">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Added ({msg.suggestedFood.price})
                        </span>
                        <button
                          type="button"
                          className="btn-chat-checkout"
                          disabled={msg.orderState === 'submitting'}
                          onClick={() => onCheckout?.(msg.id, msg.suggestedFood!)}
                        >
                          {msg.orderState === 'submitting' ? 'Submitting…' : 'Checkout Now →'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-chat-order"
                        onClick={() => onAddToCart?.(msg.id, msg.suggestedFood!)}
                        title={`Order ${msg.suggestedFood.dishName} at ${msg.suggestedFood.stallName}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="21" r="1" />
                          <circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        <span>Order at {msg.suggestedFood.stallName}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Live speech preview bubble in chatbox */}
          {isListening && liveTranscript && (
            <div className="chat-bubble user-bubble live-transcribing">
              <div className="bubble-sender">
                <span>You • Speaking...</span>
              </div>
              <div className="bubble-text">
                {liveTranscript}
                <span className="live-typing-indicator" aria-hidden="true"> ···</span>
              </div>
            </div>
          )}
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
                {isListening
                  ? interimTranscript
                    ? `Listening: "${interimTranscript}"`
                    : 'Listening... Speak now'
                  : 'Tap to Speak'}
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
              placeholder={isListening ? "Listening... speak now" : "Or type a question or dietary request..."}
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
