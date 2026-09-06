import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import type { AvatarOption, VoiceOption } from '../types/chat';
import type { PresenterConfig, PresentationTarget } from '../types/presenter';

interface UseAvatarCatalogOptions {
  stageRef: React.RefObject<HTMLDivElement | null>;
  presenterInitialize: (token: string, target: PresentationTarget) => Promise<void>;
  resumeAudio: () => Promise<void>;
}

export function useAvatarCatalog({
  stageRef,
  presenterInitialize,
  resumeAudio,
}: UseAvatarCatalogOptions) {
  const [config, setConfig] = useState<PresenterConfig | null>(null);
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<string>('01KVQ595FX6K4SJ182HRNFERTK');
  const [selectedVoice, setSelectedVoice] = useState<string>('01KY40Z9NTKTC5DMH8TD5S77RT');
  const [activeSceneId, setActiveSceneId] = useState<string>('01K4NY76QJKD6RY4H1ETT4QJ6W');
  const [statusText, setStatusText] = useState('Connecting...');
  const [isAvatarLocked, setIsAvatarLocked] = useState(false);

  const requestedTargetRef = useRef<{ avatarId: string; sceneId: string; voiceId: string } | null>(null);
  const isInitializingRef = useRef(false);

  const selectedAvatarRef = useRef(selectedAvatar);
  selectedAvatarRef.current = selectedAvatar;
  const activeSceneIdRef = useRef(activeSceneId);
  activeSceneIdRef.current = activeSceneId;
  const selectedVoiceRef = useRef(selectedVoice);
  selectedVoiceRef.current = selectedVoice;

  const presenterInitRef = useRef(presenterInitialize);
  presenterInitRef.current = presenterInitialize;

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
      console.warn('[AvatarCatalog] Presenter init warning:', err);
      setStatusText('Online (Speech Ready)');
    } finally {
      isInitializingRef.current = false;
      if (requestedTargetRef.current) {
        void processTargetQueue();
      }
    }
  }, [stageRef]);

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
            defaults: {
              avatarId: '01KVQ595FX6K4SJ182HRNFERTK',
              sceneId: '01K4NY76QJKD6RY4H1ETT4QJ6W',
              voiceId: '01KY40Z9NTKTC5DMH8TD5S77RN',
            },
          })),
          fetchJson<{ items: AvatarOption[] }>('/api/avatars').catch(() => ({ items: [] })),
          fetchJson<{ items: Array<{ id: string; name: string }> }>('/api/scenes').catch(() => ({ items: [] })),
          fetchJson<{ items: VoiceOption[] }>('/api/voices').catch(() => ({ items: [] })),
        ]);

        if (!mounted) return;

        setConfig(cfg);
        setAvatars(avData.items || []);
        setVoices(vcData.items || []);

        // Target scene: sova_Abstract_1
        const initialScene = '01K4NY76QJKD6RY4H1ETT4QJ6W';
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
        console.error('[AvatarCatalog] Catalog load error:', err);
        setStatusText('Standby');
      }
    }

    void loadCatalog();
    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLockInAvatar = useCallback((id: string) => {
    setSelectedAvatar(id);
    const targetAvatar = avatars.find((a) => a.id === id);
    const matchedVoice = targetAvatar?.voice_id || selectedVoice;
    setSelectedVoice(matchedVoice);
    setIsAvatarLocked(true);
    void initAvatarPresenter(id, activeSceneId, matchedVoice);
    void resumeAudio();
  }, [avatars, selectedVoice, activeSceneId, initAvatarPresenter, resumeAudio]);

  const handleChangeAvatar = useCallback(() => {
    setIsAvatarLocked(false);
  }, []);

  // --- Carousel preview index -------------------------------------------------
  // Lifted here (previously duplicated as local state in AvatarStage /
  // PersonaSelector) so the arrow buttons and the gesture controller step the
  // same pointer.
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    if (avatars.length === 0) return;
    const idx = avatars.findIndex((a) => a.id === selectedAvatar);
    setPreviewIndex(idx >= 0 ? idx : 0);
  }, [selectedAvatar, avatars]);

  const stepPreview = useCallback(
    (dir: -1 | 1) => {
      setPreviewIndex((i) => {
        if (avatars.length === 0) return i;
        return (i + dir + avatars.length) % avatars.length;
      });
    },
    [avatars.length]
  );

  const lockInPreviewedAvatar = useCallback(() => {
    const target = avatars[previewIndex];
    if (target) handleLockInAvatar(target.id);
  }, [avatars, previewIndex, handleLockInAvatar]);

  return {
    config,
    avatars,
    voices,
    selectedAvatar,
    selectedVoice,
    activeSceneId,
    statusText,
    isAvatarLocked,
    previewIndex,
    stepPreview,
    lockInPreviewedAvatar,
    handleLockInAvatar,
    handleChangeAvatar,
    initAvatarPresenter,
  };
}
