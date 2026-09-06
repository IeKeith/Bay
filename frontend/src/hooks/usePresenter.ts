import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

  // Queue initialize if called while engine or element is still mounting
  const pendingTargetRef = useRef<{
    token: string;
    target: PresentationTarget;
    resolve?: () => void;
    reject?: (err: any) => void;
  } | null>(null);

  // Sequential speech queue to prevent audio collisions and drops
  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const isReadyRef = useRef(false);

  const processNextSpeech = useCallback(async () => {
    if (!presenterRef.current || !isReadyRef.current || isSpeakingRef.current) {
      return;
    }
    if (speechQueueRef.current.length === 0) {
      return;
    }

    const nextPhrase = speechQueueRef.current.shift()!;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    setSubtitle(nextPhrase);

    try {
      await presenterRef.current.resumeAudioPlayback?.().catch(() => {});
      await presenterRef.current.present(nextPhrase);
    } catch (err) {
      console.warn('[Presenter] present error:', err);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      if (speechQueueRef.current.length > 0) {
        void processNextSpeechRef.current();
      }
    }
  }, []);

  const processNextSpeechRef = useRef(processNextSpeech);
  processNextSpeechRef.current = processNextSpeech;

  // Mount <sv-presenter> once engine is loaded
  useEffect(() => {
    let active = true;

    async function mount() {
      try {
        await loadPresenterEngine(presenterUrl);
        if (!active || !stageRef.current) return;

        // Check if an <sv-presenter> is already attached to this container
        let el = stageRef.current.querySelector('sv-presenter') as PresenterElement;
        if (!el) {
          el = document.createElement('sv-presenter') as PresenterElement;
          el.hidden = true;
          el.style.width = '100%';
          el.style.height = '100%';

          el.addEventListener('PRESENTER_STATUS', (e: Event) => {
            const detail = (e as CustomEvent<{ status: string }>).detail;
            if (detail?.status === 'Ready') {
              el.hidden = false;
              isReadyRef.current = true;
              setIsReady(true);
              if (speechQueueRef.current.length > 0 && !isSpeakingRef.current) {
                void processNextSpeechRef.current();
              }
            } else {
              isReadyRef.current = false;
              setIsReady(false);
            }
          });

          el.addEventListener('PERFORMANCE_START', () => {
            isSpeakingRef.current = true;
            setIsSpeaking(true);
          });

          el.addEventListener('PLAYING_SPEECH_TEXT', (e: Event) => {
            const text = (e as CustomEvent<{ text: string }>).detail?.text;
            if (text) setSubtitle(text);
          });

          el.addEventListener('ALL_PERFORMANCE_FINISHED', () => {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            if (speechQueueRef.current.length === 0) {
              setTimeout(() => setSubtitle(''), 1500);
              finishedCbRef.current?.();
            } else {
              void processNextSpeechRef.current();
            }
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
        }

        presenterRef.current = el;

        // If initialize() was called while script was loading, execute it now!
        if (pendingTargetRef.current) {
          const { token, target, resolve, reject } = pendingTargetRef.current;
          pendingTargetRef.current = null;
          try {
            await el.initialize(token, target);
            resolve?.();
          } catch (err) {
            console.warn('[Presenter] Queued initialize warning:', err);
            reject?.(err);
          }
        }
      } catch (err) {
        console.error('[Presenter] Mount error:', err);
      }
    }

    mount();

    return () => {
      active = false;
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

  // Initialize presenter with token & target (queues safely if mounting)
  const initialize = useCallback(async (token: string, target: PresentationTarget) => {
    isReadyRef.current = false;
    setIsReady(false);

    if (!presenterRef.current) {
      return new Promise<void>((resolve, reject) => {
        pendingTargetRef.current = { token, target, resolve, reject };
      });
    }

    try {
      await presenterRef.current.initialize(token, target);
    } catch (err) {
      console.warn('[Presenter] initialize warning:', err);
      throw err;
    }
  }, []);

  // Present speech queue (enqueues and processes sequentially without collision)
  const present = useCallback(async (text: string) => {
    if (!text || !text.trim()) return;
    const clean = text.trim();
    speechQueueRef.current.push(clean);
    if (isReadyRef.current && !isSpeakingRef.current) {
      void processNextSpeechRef.current();
    }
  }, []);

  return useMemo(
    () => ({
      presenter: presenterRef.current,
      isReady,
      isSpeaking,
      subtitle,
      isAudioUnlocked,
      resumeAudio,
      initialize,
      present,
    }),
    [isReady, isSpeaking, subtitle, isAudioUnlocked, resumeAudio, initialize, present]
  );
}
