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
// Tuning. Adjust against the real camera + lighting.
// ---------------------------------------------------------------------------
const INFERENCE_INTERVAL_MS = 55; // ~18 fps — enough for gestures, easy on the GPU
const SWIPE_WINDOW_MS = 550; // trailing window used to measure hand travel
const SWIPE_MIN_TRAVEL = 0.14; // fraction of frame width the palm must cover
const SWIPE_MIN_SPAN_MS = 100; // ignore windows shorter than this
const SWIPE_MONOTONIC_RATIO = 0.55; // share of steps that must go the same way
const SWIPE_COOLDOWN_MS = 850; // one deliberate motion = one step
const CONFIRM_MIN_SCORE = 0.45; // MediaPipe confidence for a "Thumb_Up"
const CONFIRM_HOLD_FRAMES = 7; // consecutive thumb-up frames before firing (~0.4s)
const CONFIRM_COOLDOWN_MS = 2000;
const GESTURE_FLASH_MS = 800; // how long the HUD shows the last-fired gesture

// Flip if left/right feels reversed on the physical kiosk. The webcam feed is
// un-mirrored in pixel space, so a hand moving toward image-left (dx < 0) is the
// user moving their hand to *their* right — which the mirrored preview shows
// travelling right, i.e. "next".
const INVERT_SWIPE_X = false;

// Palm-center landmarks: wrist + index-MCP + pinky-MCP. Averaging these tracks a
// lateral wave better than the wrist alone (which barely moves when you pivot).
const PALM_LANDMARKS = [0, 5, 17];

// Verbose console tracing. Toggle at runtime from DevTools with:
//   localStorage.setItem('gestureDebug', '1'); location.reload();
//   localStorage.removeItem('gestureDebug'); location.reload();
const DEBUG = (() => {
  try {
    return localStorage.getItem('gestureDebug') === '1';
  } catch {
    return false;
  }
})();
const dlog = (...args: unknown[]) => {
  if (DEBUG) console.log('[gesture]', ...args);
};

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
  const lastDebugLogRef = useRef(0);
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

      if (DEBUG && now - lastDebugLogRef.current > 400) {
        lastDebugLogRef.current = now;
        dlog(
          hand ? `hand ok (${hand.length} pts)` : 'no hand',
          '| gesture:',
          topGesture
            ? `${topGesture.categoryName} ${topGesture.score.toFixed(2)}`
            : 'none',
          '| buf:',
          swipeBufRef.current.length,
          '| cooldown:',
          Math.max(0, Math.round(cooldownUntilRef.current - now))
        );
      }

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
          dlog('FIRE confirm (thumb up held)');
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

      // Palm-center x (average of a few stable landmarks), normalised 0..1.
      let sum = 0;
      let count = 0;
      for (const idx of PALM_LANDMARKS) {
        const p = hand[idx];
        if (p && typeof p.x === 'number') {
          sum += p.x;
          count += 1;
        }
      }
      if (count === 0) return;
      const palmX = sum / count;

      const buf = swipeBufRef.current;
      buf.push({ x: palmX, t: now });
      while (buf.length && now - buf[0].t > SWIPE_WINDOW_MS) buf.shift();

      if (buf.length < 3) return;
      const span = buf[buf.length - 1].t - buf[0].t;
      if (span < SWIPE_MIN_SPAN_MS) return;

      const dx = buf[buf.length - 1].x - buf[0].x;
      if (Math.abs(dx) < SWIPE_MIN_TRAVEL) {
        if (DEBUG && Math.abs(dx) > 0.05 && now - lastDebugLogRef.current > 350) {
          lastDebugLogRef.current = now;
          dlog(`swipe building… dx=${dx.toFixed(3)} (need ${SWIPE_MIN_TRAVEL})`);
        }
        return;
      }

      // Require a reasonably monotonic sweep, not a jitter that nets out.
      let forward = 0;
      for (let i = 1; i < buf.length; i += 1) {
        if (Math.sign(buf[i].x - buf[i - 1].x) === Math.sign(dx)) forward += 1;
      }
      const monoRatio = forward / (buf.length - 1);
      if (monoRatio < SWIPE_MONOTONIC_RATIO) {
        dlog(`swipe rejected: not monotonic (${monoRatio.toFixed(2)})`);
        return;
      }

      let goRight = dx < 0; // see INVERT_SWIPE_X note above
      if (INVERT_SWIPE_X) goRight = !goRight;
      dlog(`FIRE swipe ${goRight ? 'right' : 'left'} (dx=${dx.toFixed(3)})`);

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
    let framesSeen = 0;
    let lastErrLog = 0;

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
      } catch (err) {
        if (now - lastErrLog > 1000) {
          lastErrLog = now;
          console.warn('[gesture] recognizeForVideo threw:', err);
        }
        return;
      }
      framesSeen += 1;
      if (DEBUG && framesSeen === 1) {
        dlog(
          `first inference ok — video ${video.videoWidth}x${video.videoHeight}`
        );
      }
      processResult(result, now);
    };

    const start = async () => {
      setStatus('loading');
      setErrorText(null);
      try {
        dlog('loading MediaPipe bundle…');
        const { FilesetResolver, GestureRecognizer } = await import(
          '@mediapipe/tasks-vision'
        );
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        if (cancelled) return;
        dlog('wasm ready, loading model…');
        recognizer = (await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        })) as unknown as typeof recognizer;
        dlog('model ready');
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
        await video.play().catch((e) => dlog('video.play() rejected:', e));
        dlog('camera streaming, starting inference loop');

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
