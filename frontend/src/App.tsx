import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { FoodSpotlightCard, FoodSpotlight } from './components/FoodSpotlightCard';
import { PersonaSelector } from './components/PersonaSelector';
import { QuickPrompts } from './components/QuickPrompts';
import { AvatarStage } from './components/AvatarStage';
import { ChatPanel } from './components/ChatPanel';

import { usePresenter } from './hooks/usePresenter';
import { useSpeech } from './hooks/useSpeech';
import { useRoutePlan } from './hooks/useRoutePlan';
import { fetchJson } from './lib/api';

import type { ChatMessage, AvatarOption, VoiceOption } from './types/chat';
import type { PresenterConfig } from './types/presenter';
import './App.css';

const DISH_CATALOG: Record<string, FoodSpotlight> = {
  satay: {
    stallId: 1,
    stallName: 'City Satay (Stall 1)',
    dishName: 'Charcoal-Grilled Chicken & Beef Satay',
    price: 'SGD $9.00',
    prepTime: '~15 mins (Grill Queue: 20 mins)',
    dietary: '100% Halal Certified',
    description:
      'Tender marinated skewers grilled over hot mangrove charcoal, served with warm spiced peanut sauce, cucumbers, and steamed ketupat.',
    imageUrl: '/satay_dish.jpg',
  },
  prata: {
    stallId: 4,
    stallName: 'Garden Greens & Prata House (Stall 4)',
    dishName: 'Crispy Plain & Egg Prata with Dhal Curry',
    price: 'SGD $3.50',
    prepTime: '~6 mins (Fast Pickup)',
    dietary: 'Vegetarian & Nut-Free',
    description:
      'Hand-stretched golden layered flatbread, pan-fried to crisp perfection and served with house-made aromatic vegetable dhal curry.',
    imageUrl: '/prata_dish.jpg',
  },
};

export const App: React.FC = () => {
  const stageRef = useRef<HTMLDivElement>(null);

  // App Catalog State
  const [config, setConfig] = useState<PresenterConfig | null>(null);
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string>('01KVQ595FX6K4SJ182HRNFERTK');
  const [foodSpotlight, setFoodSpotlight] = useState<FoodSpotlight>(DISH_CATALOG.satay);
  const [selectedVoice, setSelectedVoice] = useState<string>('01KY40Z9NTKTC5DMH8TD5S77RT');
  const [activeSceneId, setActiveSceneId] = useState<string>('01KQEJD0NJFVM20M588K7D1E9Z');
  const [statusText, setStatusText] = useState('Connecting...');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        "Welcome to Satay by the Bay! I'm Mei, your culinary route guide. Tell me your party size, dietary needs, or budget, and I'll route your orders so you arrive at the **7:45 PM Supertree Light Show** with time to spare!",
    },
  ]);
  const [repairNoticeText, setRepairNoticeText] = useState<string | null>(null);

  // Persona name resolution
  const selectedObj = avatars.find((a) => a.id === selectedAvatar);
  let personaName = 'Mei';
  if (selectedObj) {
    if (selectedObj.name.includes('Raj') || selectedObj.name.includes('cc069a02')) personaName = 'Raj';
    else if (selectedObj.name.includes('Host') || selectedObj.name.includes('cc069a03')) personaName = 'Host';
    else if (selectedObj.name.includes('Meeks') || selectedObj.name.includes('cc051')) personaName = 'Meeks';
    else if (selectedObj.name.includes('Emojiboy') || selectedObj.name.includes('cc075')) personaName = 'Emojiboy';
    else if (selectedObj.name.includes('Concierge') || selectedObj.name.includes('cc046')) personaName = 'Concierge';
    else personaName = 'Mei';
  }

  // Route Plan Hook
  const { routePlan, updateFromText } = useRoutePlan();

  // STT Auto-listen continuation
  const handlePerformanceFinished = useCallback(() => {
    if (speech.autoListen && !speech.isListening) {
      speech.startListening();
    }
  }, []);

  // Presenter Hook
  const presenter = usePresenter({
    stageRef,
    presenterUrl: config?.presenterUrl,
    onPerformanceFinished: handlePerformanceFinished,
  });

  // Speech Recognition Hook
  const handleUserSpeechTranscript = useCallback(
    (text: string) => {
      handleSendMessage(text);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedAvatar, messages]
  );

  const speech = useSpeech({
    onTranscript: handleUserSpeechTranscript,
    lang: 'en-SG',
  });

  const requestedTargetRef = useRef<{ avatarId: string; sceneId: string; voiceId: string } | null>(null);
  const isInitializingRef = useRef(false);

  const selectedAvatarRef = useRef(selectedAvatar);
  selectedAvatarRef.current = selectedAvatar;
  const activeSceneIdRef = useRef(activeSceneId);
  activeSceneIdRef.current = activeSceneId;
  const selectedVoiceRef = useRef(selectedVoice);
  selectedVoiceRef.current = selectedVoice;

  const presenterInitRef = useRef(presenter.initialize);
  presenterInitRef.current = presenter.initialize;

  const processTargetQueue = useCallback(async () => {
    if (isInitializingRef.current || !stageRef.current) return;
    isInitializingRef.current = true;
    try {
      while (requestedTargetRef.current) {
        const currentTarget = requestedTargetRef.current;
        requestedTargetRef.current = null;
        setStatusText('Loading Avatar...');
        const { connect_token } = await fetchJson<{ connect_token: string }>('/api/connect-token');
        await presenterInitRef.current(connect_token, currentTarget);
        setStatusText('Online');
      }
    } catch (err) {
      console.warn('[App] Presenter init warning:', err);
      setStatusText('Online (Speech Ready)');
    } finally {
      isInitializingRef.current = false;
      if (requestedTargetRef.current) {
        void processTargetQueue();
      }
    }
  }, []);

  // Initialize Presenter with queue so rapid swaps never drop or stop halfway
  const initAvatarPresenter = useCallback((targetAv?: string, targetSc?: string, targetVc?: string) => {
    const target = {
      avatarId: targetAv || selectedAvatarRef.current,
      sceneId: targetSc || activeSceneIdRef.current,
      voiceId: targetVc || selectedVoiceRef.current,
    };
    requestedTargetRef.current = target;
    void processTargetQueue();
  }, [processTargetQueue]);

  // Initial Data Fetch
  useEffect(() => {
    let mounted = true;
    async function loadCatalog() {
      try {
        const [cfg, avData, scData, vcData] = await Promise.all([
          fetchJson<PresenterConfig>('/api/config').catch(() => ({
            mock: false,
            chat: true,
            presenterUrl: 'https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js',
          })),
          fetchJson<{ items: AvatarOption[] }>('/api/avatars').catch(() => ({ items: [] })),
          fetchJson<{ items: Array<{ id: string; name: string }> }>('/api/scenes').catch(() => ({ items: [] })),
          fetchJson<{ items: VoiceOption[] }>('/api/voices').catch(() => ({ items: [] })),
        ]);

        if (!mounted) return;

        setConfig(cfg);
        setAvatars(avData.items || []);
        setVoices(vcData.items || []);

        const initialScene = scData.items?.[0]?.id || '01KQEJD0NJFVM20M588K7D1E9Z';
        const initialAvatarObj = avData.items?.[0];
        const initialAvatar = initialAvatarObj?.id || '01KVQ595FX6K4SJ182HRNFERTK';
        const initialVoice = initialAvatarObj?.voice_id || '01KY40Z9NTKTC5DMH8TD5S77RN';

        setActiveSceneId(initialScene);
        setSelectedAvatar(initialAvatar);
        setSelectedVoice(initialVoice);
        setStatusText('Ready');

        // Preload all avatar thumbnails and dish images at startup
        new Image().src = '/satay_dish.jpg';
        new Image().src = '/prata_dish.jpg';
        if (avData.items) {
          avData.items.forEach((av) => {
            if (av.thumbnail) {
              const img = new Image();
              img.src = av.thumbnail;
            }
          });
        }

        // Initialize Presenter directly with verified targets
        void initAvatarPresenter(initialAvatar, initialScene, initialVoice);
      } catch (err) {
        console.error('[App] Catalog load error:', err);
        setStatusText('Standby');
      }
    }

    loadCatalog();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phonetic Auto-Repair Preview Check
  const checkPhoneticPreview = (raw: string) => {
    const replacements: Array<[RegExp, string]> = [
      [/\b(sate|sata|satey)\b/gi, 'Satay'],
      [/\b(sting\s*ray|sambal\s*ray)\b/gi, 'Sambal Stingray'],
      [/\b(hokkien\s*mee|hoki\s*mee)\b/gi, 'Hokkien Mee'],
      [/\b(prata|paratha)\b/gi, 'Roti Prata'],
      [/\b(sugarcane|sugar can)\b/gi, 'Sugar Cane Juice'],
      [/\b(chendol|cendol)\b/gi, 'Chendol'],
    ];
    const matched: string[] = [];
    for (const [re, rep] of replacements) {
      if (re.test(raw)) matched.push(rep);
    }
    return matched.length ? matched.join(', ') : null;
  };

  // Send Message & Stream LLM
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    speech.stopListening();
    if (!presenter.isAudioUnlocked) {
      await presenter.resumeAudio();
    }

    // Phonetic preview notice
    const repair = checkPhoneticPreview(text);
    if (repair) {
      setRepairNoticeText(repair);
      setTimeout(() => setRepairNoticeText(null), 4000);
    }

    // Append User Message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    updateFromText(text);

    // Sync Food Spotlight with User Input
    const lowerText = text.toLowerCase();
    if (
      lowerText.includes('prata') ||
      lowerText.includes('vegetarian') ||
      lowerText.includes('replan') ||
      lowerText.includes('delay') ||
      lowerText.includes('green') ||
      lowerText.includes('nut')
    ) {
      setFoodSpotlight(DISH_CATALOG.prata);
    } else if (
      lowerText.includes('satay') ||
      lowerText.includes('halal') ||
      lowerText.includes('chicken') ||
      lowerText.includes('rush') ||
      lowerText.includes('beef')
    ) {
      setFoodSpotlight(DISH_CATALOG.satay);
    }

    // Prepare Assistant Message
    const botMsgId = `bot-${Date.now()}`;
    const initialBotMsg: ChatMessage = {
      id: botMsgId,
      role: 'assistant',
      content: '...',
    };
    setMessages((prev) => [...prev, initialBotMsg]);

    let fullReply = '';
    let sentenceBuffer = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          avatarId: selectedAvatar,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.delta) {
              fullReply += parsed.delta;
              sentenceBuffer += parsed.delta;

              setMessages((prev) =>
                prev.map((m) => (m.id === botMsgId ? { ...m, content: fullReply } : m))
              );

              // Sentence-by-sentence streaming into presenter
              const match = sentenceBuffer.match(/^(.*?[.!?])(\s+.*|$)/s);
              if (match) {
                const complete = match[1].trim();
                sentenceBuffer = match[2] || '';
                if (complete) {
                  presenter.present(complete);
                }
              }
            }
          } catch (e) {}
        }
      }

      // Flush remaining sentence buffer
      if (sentenceBuffer.trim()) {
        presenter.present(sentenceBuffer.trim());
      }

      // Sync Food Spotlight with Assistant's Recommendation
      const lowerReply = fullReply.toLowerCase();
      if (lowerReply.includes('prata') || lowerReply.includes('stall 4')) {
        setFoodSpotlight(DISH_CATALOG.prata);
      } else if (lowerReply.includes('satay') || lowerReply.includes('stall 1')) {
        setFoodSpotlight(DISH_CATALOG.satay);
      }

      updateFromText(fullReply);
    } catch (err: any) {
      console.error('[App] Chat error:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId ? { ...m, content: `_Apologies, connection issue: ${err.message}_` } : m
        )
      );
    }
  };

  return (
    <div className="kiosk-container">
      <Header statusText={statusText} />

      <main className="kiosk-grid">
        {/* Left Column: Food Spotlight Card, Persona Switcher, Quick Chips */}
        <aside className="col-left">
          <FoodSpotlightCard
            spotlight={foodSpotlight}
            onOrderClick={() =>
              handleSendMessage(
                `Tell me how to order ${foodSpotlight.dishName} from ${foodSpotlight.stallName}!`
              )
            }
          />

          <PersonaSelector
            avatars={avatars}
            selectedAvatar={selectedAvatar}
            onAvatarChange={(id) => {
              setSelectedAvatar(id);
              const targetAvatar = avatars.find((a) => a.id === id);
              const matchedVoice = targetAvatar?.voice_id || selectedVoice;
              setSelectedVoice(matchedVoice);
              void initAvatarPresenter(id, activeSceneId, matchedVoice);
            }}
            onReconnect={() => void initAvatarPresenter(selectedAvatar, activeSceneId, selectedVoice)}
          />

          <QuickPrompts onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
        </aside>

        {/* Center Column: 3D Avatar Stage */}
        <AvatarStage
          stageRef={stageRef}
          isReady={presenter.isReady}
          isSpeaking={presenter.isSpeaking}
          isAudioUnlocked={presenter.isAudioUnlocked}
          onUnlockAudio={presenter.resumeAudio}
          personaName={personaName}
          subtitle={presenter.subtitle}
        />

        {/* Right Column: Voice Chat */}
        <ChatPanel
          messages={messages}
          isListening={speech.isListening}
          autoListen={speech.autoListen}
          onToggleAutoListen={speech.setAutoListen}
          onToggleMic={speech.toggleListening}
          onSendMessage={handleSendMessage}
          personaName={personaName}
          repairNoticeText={repairNoticeText}
        />
      </main>
    </div>
  );
};
