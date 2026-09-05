import React, { useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { AvatarStage } from './components/AvatarStage';
import { ChatPanel } from './components/ChatPanel';

import { usePresenter } from './hooks/usePresenter';
import { useSpeech } from './hooks/useSpeech';
import { PlanSummary } from './components/PlanSummary';
import { useAvatarCatalog } from './hooks/useAvatarCatalog';
import { useConciergeChat } from './hooks/useConciergeChat';
import { resolvePersonaName } from './utils/persona';
import './App.css';

export const App: React.FC = () => {
  const stageRef = useRef<HTMLDivElement>(null);

  // STT Auto-listen continuation
  const handlePerformanceFinished = useCallback(() => {
    if (speech.autoListen && !speech.isListening) {
      speech.startListening();
    }
  }, []);

  // 1. Presenter Hook
  const presenter = usePresenter({
    stageRef,
    onPerformanceFinished: handlePerformanceFinished,
  });

  // 2. Avatar Catalog & Switcher Hook
  const catalog = useAvatarCatalog({
    stageRef,
    presenterInitialize: presenter.initialize,
    resumeAudio: presenter.resumeAudio,
  });

  // 3. Speech Recognition Hook
  const handleUserSpeech = useCallback(
    (text: string) => {
      void chat.handleSendMessage(text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog.selectedAvatar]
  );

  const speech = useSpeech({
    onTranscript: handleUserSpeech,
    lang: 'en-SG',
  });

  // 4. Concierge Chat & Recommendation Hook
  const chat = useConciergeChat({
    selectedAvatar: catalog.selectedAvatar,
    isAudioUnlocked: presenter.isAudioUnlocked,
    resumeAudio: presenter.resumeAudio,
    presentSentence: presenter.present,
    stopListening: speech.stopListening,
  });

  const personaName = resolvePersonaName(catalog.avatars, catalog.selectedAvatar);

  return (
    <div className="kiosk-container">
      <Header statusText={catalog.statusText} />

      <main className="kiosk-grid">
        {/* Left / Center Column: 3D Avatar Stage / Persona Selector */}
        <AvatarStage
          stageRef={stageRef}
          isReady={presenter.isReady}
          isSpeaking={presenter.isSpeaking}
          isAudioUnlocked={presenter.isAudioUnlocked}
          onUnlockAudio={presenter.resumeAudio}
          personaName={personaName}
          subtitle={presenter.subtitle}
          avatars={catalog.avatars}
          selectedAvatar={catalog.selectedAvatar}
          isLockedIn={catalog.isAvatarLocked}
          onLockInAvatar={catalog.handleLockInAvatar}
          onChangeAvatar={catalog.handleChangeAvatar}
        />

        {/* Right Column: Voice Chat with Integrated Food Spotlight */}
        <ChatPanel
          messages={chat.messages}
          isListening={speech.isListening}
          autoListen={speech.autoListen}
          onToggleAutoListen={speech.setAutoListen}
          onToggleMic={speech.toggleListening}
          onSendMessage={chat.handleSendMessage}
          onAddToCart={chat.handleAddToCart}
          onCheckout={chat.handleCheckout}
          personaName={personaName}
          repairNoticeText={chat.repairNoticeText}
          spotlight={chat.foodSpotlight}
        />
        <PlanSummary messages={chat.messages} />
      </main>
    </div>
  );
};

export default App;
