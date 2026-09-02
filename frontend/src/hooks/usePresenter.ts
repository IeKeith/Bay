import { useEffect, useRef, useState, useCallback } from 'react';
import type { PresenterElement, PresentationTarget } from '../types/presenter';
import { loadPresenterEngine } from '../lib/presenter';
import { fetchJson } from '../lib/api';

export interface UsePresenterOptions {
  stageRef: React.RefObject<HTMLDivElement | null>;
  presenterUrl?: string;
  onPerformanceFinished?: () => void;
}

export function usePresenter({
  stageRef,
  presenterUrl = 'https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js',
  onPerformanceFinished,
}: UsePresenterOptions) {
  const presenterRef = useRef<PresenterElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  const finishedCbRef = useRef(onPerformanceFinished);
  finishedCbRef.current = onPerformanceFinished;

  // Mount <sv-presenter> once engine is loaded
  useEffect(() => {
    let active = true;

    async function mount() {
      try {
        await loadPresenterEngine(presenterUrl);
        if (!active || !stageRef.current) return;

        // Clean up previous instance if any
        if (presenterRef.current) {
          presenterRef.current.remove();
        }

        const el = document.createElement('sv-presenter') as PresenterElement;
        el.hidden = true;
        el.style.width = '100%';
        el.style.height = '100%';

        el.addEventListener('PRESENTER_STATUS', (e: Event) => {
          const detail = (e as CustomEvent<{ status: string }>).detail;
          if (detail?.status === 'Ready') {
            el.hidden = false;
            setIsReady(true);
          } else {
            setIsReady(false);
          }
        });

        el.addEventListener('PERFORMANCE_START', () => {
          setIsSpeaking(true);
        });

        el.addEventListener('PLAYING_SPEECH_TEXT', (e: Event) => {
          const text = (e as CustomEvent<{ text: string }>).detail?.text;
          if (text) setSubtitle(text);
        });

        el.addEventListener('ALL_PERFORMANCE_FINISHED', () => {
          setIsSpeaking(false);
          setTimeout(() => setSubtitle(''), 1500);
          finishedCbRef.current?.();
        });

        el.addEventListener('CONNECT_TOKEN_EXPIRED', async () => {
          try {
            const { connect_token } = await fetchJson<{ connect_token: string }>('/api/connect-token');
            el.refreshConnectToken?.(connect_token);
          } catch (err) {
            console.error('[Presenter] Token refresh error:', err);
          }
        });

        stageRef.current.appendChild(el);
        presenterRef.current = el;
      } catch (err) {
        console.error('[Presenter] Mount error:', err);
      }
    }

    mount();

    return () => {
      active = false;
      presenterRef.current?.remove();
      presenterRef.current = null;
    };
  }, [stageRef, presenterUrl]);

  // Audio unlock for browser autoplay policy
  const resumeAudio = useCallback(async () => {
    try {
      await presenterRef.current?.resumeAudioPlayback?.();
      setIsAudioUnlocked(true);
    } catch (err) {
      console.warn('[Presenter] resumeAudio note:', err);
      setIsAudioUnlocked(true);
    }
  }, []);

  // Initialize presenter with token & target
  const initialize = useCallback(async (token: string, target: PresentationTarget) => {
    if (!presenterRef.current) return;
    setIsReady(false);
    await presenterRef.current.initialize(token, target);
  }, []);

  // Present speech queue
  const present = useCallback(async (text: string) => {
    if (!presenterRef.current || !text.trim()) return;
    setSubtitle(text.trim());
    try {
      return await presenterRef.current.present(text.trim());
    } catch (err) {
      console.warn('[Presenter] present error:', err);
    }
  }, []);

  return {
    presenter: presenterRef.current,
    isReady,
    isSpeaking,
    subtitle,
    isAudioUnlocked,
    resumeAudio,
    initialize,
    present,
  };
}
