import React, { useRef, useCallback, useState } from 'react';
import { Header } from './components/Header';
import { AvatarStage } from './components/AvatarStage';
import { ChatPanel } from './components/ChatPanel';

import { usePresenter } from './hooks/usePresenter';
import { useSpeech } from './hooks/useSpeech';
import { PlanSummary } from './components/PlanSummary';
import { useAvatarCatalog } from './hooks/useAvatarCatalog';
import { useConciergeChat } from './hooks/useConciergeChat';
import { useHandGestures } from './hooks/useHandGestures';
import { resolvePersonaName } from './utils/persona';
import { selectedPlanItems } from './utils/planSummary';
import './App.css';

export const App: React.FC = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const speechRef = useRef<any>(null);

  // STT Auto-listen continuation
  const handlePerformanceFinished = useCallback(() => {
    if (speechRef.current?.autoListen && !speechRef.current?.isListening) {
      speechRef.current?.startListening();
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

  // Global user-gesture audio unlock for browser autoplay policy
  React.useEffect(() => {
    const unlock = () => {
      void presenter.resumeAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [presenter]);

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
  speechRef.current = speech;

  const handleToggleMic = useCallback(async () => {
    if (!presenter.isAudioUnlocked) {
      await presenter.resumeAudio();
    }
    speech.toggleListening();
  }, [presenter, speech]);

  const personaName = resolvePersonaName(catalog.avatars, catalog.selectedAvatar);

  // 4. Concierge Chat & Recommendation Hook
  const chat = useConciergeChat({
    selectedAvatar: catalog.selectedAvatar,
    personaName,
    isAudioUnlocked: presenter.isAudioUnlocked,
    resumeAudio: presenter.resumeAudio,
    presentSentence: presenter.present,
    stopListening: speech.stopListening,
  });

  const handleLockInAvatar = useCallback(
    (id: string) => {
      catalog.handleLockInAvatar(id);
      const chosenName = resolvePersonaName(catalog.avatars, id);
      chat.speakWelcome(chosenName);
    },
    [catalog, chat]
  );

  // 5. Hand-Gesture Avatar Control (webcam, on-device MediaPipe)
  //    Runs in the background without camera UI preview; swipe to browse, thumbs-up to lock in.
  const gestureVideoRef = useRef<HTMLVideoElement>(null);
  const { stepPreview } = catalog;
  const handleGestureLeft = useCallback(() => stepPreview(-1), [stepPreview]);
  const handleGestureRight = useCallback(() => stepPreview(1), [stepPreview]);
  const handleGestureConfirm = useCallback(
    () => {
      const target = catalog.avatars[catalog.previewIndex];
      if (target) {
        handleLockInAvatar(target.id);
      } else {
        catalog.lockInPreviewedAvatar();
      }
    },
    [catalog, handleLockInAvatar]
  );

  const gestures = useHandGestures({
    enabled: !catalog.isAvatarLocked,
    videoRef: gestureVideoRef,
    onSwipeLeft: handleGestureLeft,
    onSwipeRight: handleGestureRight,
    onConfirm: handleGestureConfirm,
  });

  const cartItems = selectedPlanItems(chat.messages);

  return (
    <div className="kiosk-container">
      <Header
        statusText={catalog.statusText}
        cartCount={cartItems.length}
        onToggleCart={() => setIsCartOpen((prev) => !prev)}
      />

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
          previewIndex={catalog.previewIndex}
          onStepPreview={catalog.stepPreview}
          onLockInAvatar={handleLockInAvatar}
          onChangeAvatar={catalog.handleChangeAvatar}
          gesture={gestures}
        />

        {/* Right Column: Voice Chat with Integrated Food Spotlight */}
        <ChatPanel
          messages={chat.messages}
          isListening={speech.isListening}
          autoListen={speech.autoListen}
          onToggleAutoListen={speech.setAutoListen}
          onToggleMic={handleToggleMic}
          onSendMessage={chat.handleSendMessage}
          onAddToCart={chat.handleAddToCart}
          onCheckout={chat.handleCheckout}
          onSpeakMessage={chat.speakMessage}
          personaName={personaName}
          repairNoticeText={chat.repairNoticeText}
          spotlight={chat.foodSpotlight}
          interimTranscript={speech.interimTranscript}
          liveTranscript={speech.liveTranscript}
        />
      </main>

      {/* Hidden offscreen video for MediaPipe vision processing (no camera interface displayed) */}
      <video
        ref={gestureVideoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: 640,
          height: 480,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -100,
        }}
      />

      {/* Shopee/Lazada style slide-over Cart & Checkout Drawer */}
      <PlanSummary
        messages={chat.messages}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={chat.handleCheckout}
      />
    </div>
  );
};


export default App;
