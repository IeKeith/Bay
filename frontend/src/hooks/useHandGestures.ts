import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GestureRecognizerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';

/**
 * Webcam hand-gesture control for the avatar carousel.
 *
 * Mirrors the shape of `useSpeech`: it wraps a browser media capability, wires
 * up/tears down on a single `enabled` flag, keeps the consumer callbacks in
 * refs so the capture loop never has to restart, and returns a small status
 * surface for the on-screen HUD.
 *
 * Detection runs entirely on-device via MediaPipe Tasks Vision (WASM). Nothing
 * from the camera leaves the browser.
 *
 * Outputs, per the design brief:
 *   - open-palm swipe left/right  -> onSwipeLeft / onSwipeRight (step carousel)
 *   - thumb-up, held ~0.6s        -> onConfirm (lock in the previewed avatar)
 */

// ---------------------------------------------------------------------------
// Asset locations.
//
// Defaults stream from jsDelivr (WASM, pinned to the installed version) and
// Google's model host. The browser caches both after the first load. For a
// fully offline kiosk, vendor them into `frontend/public/mediapipe/` (see the
// README there) and point these at `/mediapipe/wasm` and
// `/mediapipe/gesture_recognizer.task`.
// ---------------------------------------------------------------------------
const WASM_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

// ---------------------------------------------------------------------------
// Tuning. These are deliberately conservative for a noisy kiosk environment;
// adjust against the real camera + lighting.
// ---------------------------------------------------------------------------
const INFERENCE_INTERVAL_MS = 55; // ~18 fps — enough for gestures, easy on the GPU
const SWIPE_WINDOW_MS = 450; // trailing window used to measure hand travel
const SWIPE_MIN_TRAVEL = 0.22; // fraction of frame width a swipe must cover
const SWIPE_MIN_SPAN_MS = 120; // ignore windows shorter than this
const SWIPE_COOLDOWN_MS = 900; // one deliberate motion = one step
const CONFIRM_MIN_SCORE = 0.55; // MediaPipe confidence for a "Thumb_Up"
const CONFIRM_HOLD_FRAMES = 10; // consecutive thumb-up frames before firing (~0.6s)
const CONFIRM_COOLDOWN_MS = 2000;
const GESTURE_FLASH_MS = 800; // how long the HUD shows the last-fired gesture

// Flip if left/right feels reversed on the physical kiosk. The webcam feed is
// un-mirrored in pixel space, so a hand moving toward image-left (dx < 0) is the
// user moving their hand to *their* right — which the mirrored preview shows
// travelling right, i.e. "next".
const INVERT_SWIPE_X = false;

const WRIST_LANDMARK = 0;

export type HandGestureStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'denied'
  | 'error'
  | 'unsupported';

export type FiredGesture = 'left' | 'right' | 'ok';

export interface UseHandGesturesOptions {
  /** Run detection only while this is true (e.g. during avatar selection). */
  enabled: boolean;
  /** Visible <video> element that shows the camera preview. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onConfirm: () => void;
}

export interface UseHandGesturesResult {
  isSupported: boolean;
  isRunning: boolean;
  status: HandGestureStatus;
  /** Last gesture that fired, cleared after a short flash. For the HUD. */
  lastGesture: FiredGesture | null;
  /** True while inside a post-gesture debounce. For the HUD. */
  inCooldown: boolean;
  errorText: string | null;
}

interface SwipeSample {
  x: number;
  t: number;
}

export function useHandGestures({
  enabled,
  videoRef,
  onSwipeLeft,
  onSwipeRight,
  onConfirm,
}: UseHandGesturesOptions): UseHandGesturesResult {
  const [isSupported, setIsSupported] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<HandGestureStatus>('idle');
  const [lastGesture, setLastGesture] = useState<FiredGesture | null>(null);
  const [inCooldown, setInCooldown] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Keep consumer callbacks fresh without restarting the capture loop.
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const onConfirmRef = useRef(onConfirm);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;
  onConfirmRef.current = onConfirm;

  // Transient detection state (not React state — updated every frame).
  const swipeBufRef = useRef<SwipeSample[]>([]);
  const thumbFramesRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const lastInferenceRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashGesture = useCallback((g: FiredGesture) => {
    setLastGesture(g);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setLastGesture(null), GESTURE_FLASH_MS);
  }, []);

  const startCooldown = useCallback((ms: number) => {
    cooldownUntilRef.current = performance.now() + ms;
    swipeBufRef.current = [];
    thumbFramesRef.current = 0;
    setInCooldown(true);
    setTimeout(() => {
      if (performance.now() >= cooldownUntilRef.current) setInCooldown(false);
    }, ms + 20);
  }, []);

  const processResult = useCallback(
    (result: GestureRecognizerResult, now: number) => {
      const hand: NormalizedLandmark[] | undefined = result.landmarks?.[0];
      const topGesture = result.gestures?.[0]?.[0];

      if (!hand || hand.length === 0) {
        swipeBufRef.current = [];
        thumbFramesRef.current = 0;
        return;
      }

      if (now < cooldownUntilRef.current) return;

      // --- Thumb-up = confirm / lock in --------------------------------------
      if (
        topGesture &&
        topGesture.categoryName === 'Thumb_Up' &&
        topGesture.score >= CONFIRM_MIN_SCORE
      ) {
        swipeBufRef.current = [];
        thumbFramesRef.current += 1;
        if (thumbFramesRef.current >= CONFIRM_HOLD_FRAMES) {
          flashGesture('ok');
          startCooldown(CONFIRM_COOLDOWN_MS);
          onConfirmRef.current();
        }
        return;
      }
      thumbFramesRef.current = 0;

      // --- Open-palm horizontal swipe = step carousel ----------------------
      const isOpenish =
        !topGesture ||
        topGesture.categoryName === 'Open_Palm' ||
        topGesture.categoryName === 'None' ||
        topGesture.categoryName === 'Victory' ||
        topGesture.categoryName === 'Pointing_Up';
      if (!isOpenish) {
        swipeBufRef.current = [];
        return;
      }

      const wristX = hand[WRIST_LANDMARK]?.x;
      if (typeof wristX !== 'number') return;

      const buf = swipeBufRef.current;
      buf.push({ x: wristX, t: now });
      while (buf.length && now - buf[0].t > SWIPE_WINDOW_MS) buf.shift();

      if (buf.length < 3) return;
      const span = buf[buf.length - 1].t - buf[0].t;
      if (span < SWIPE_MIN_SPAN_MS) return;

      const dx = buf[buf.length - 1].x - buf[0].x;
      if (Math.abs(dx) < SWIPE_MIN_TRAVEL) return;

      // Require a reasonably monotonic sweep, not a jitter that nets out.
      let forward = 0;
      for (let i = 1; i < buf.length; i += 1) {
        if (Math.sign(buf[i].x - buf[i - 1].x) === Math.sign(dx)) forward += 1;
      }
      if (forward / (buf.length - 1) < 0.6) return;

      let goRight = dx < 0; // see INVERT_SWIPE_X note above
      if (INVERT_SWIPE_X) goRight = !goRight;

      if (goRight) {
        flashGesture('right');
        startCooldown(SWIPE_COOLDOWN_MS);
        onSwipeRightRef.current();
      } else {
        flashGesture('left');
        startCooldown(SWIPE_COOLDOWN_MS);
        onSwipeLeftRef.current();
      }
    },
    [flashGesture, startCooldown]
  );

  useEffect(() => {
    if (!enabled) return;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === 'undefined' ||
      !window.isSecureContext
    ) {
      setIsSupported(false);
      setStatus('unsupported');
      return;
    }

    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let recognizer: { recognizeForVideo: Function; close: () => void } | null = null;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (cancelled || !recognizer || !video || video.readyState < 2) return;
      const now = performance.now();
      if (now - lastInferenceRef.current < INFERENCE_INTERVAL_MS) return;
      lastInferenceRef.current = now;
      let result: GestureRecognizerResult;
      try {
        result = recognizer.recognizeForVideo(video, now) as GestureRecognizerResult;
      } catch {
        return;
      }
      processResult(result, now);
    };

    const start = async () => {
      setStatus('loading');
      setErrorText(null);
      try {
        const { FilesetResolver, GestureRecognizer } = await import(
          '@mediapipe/tasks-vision'
        );
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (cancelled) return;
        recognizer = (await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        })) as unknown as typeof recognizer;
        if (cancelled) {
          recognizer?.close();
          recognizer = null;
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          recognizer?.close();
          recognizer = null;
          return;
        }

        const video = videoRef.current;
        if (!video) {
          setStatus('error');
          setErrorText('Camera preview element not mounted');
          return;
        }
        video.srcObject = stream;
        video.muted = true;
        await video.play().catch(() => undefined);

        setStatus('ready');
        setIsRunning(true);
        loop();
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied');
        } else {
          setStatus('error');
        }
        setErrorText((err as { message?: string })?.message ?? String(err));
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      stream?.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
      try {
        recognizer?.close();
      } catch {
        /* noop */
      }
      recognizer = null;
      swipeBufRef.current = [];
      thumbFramesRef.current = 0;
      cooldownUntilRef.current = 0;
      lastInferenceRef.current = 0;
      setIsRunning(false);
      setInCooldown(false);
      setLastGesture(null);
      setStatus('idle');
    };
  }, [enabled, videoRef, processResult]);

  return { isSupported, isRunning, status, lastGesture, inCooldown, errorText };
}
