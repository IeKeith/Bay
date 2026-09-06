import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GestureRecognizerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';

/**
 * Headless MediaPipe hand-gesture control for the avatar carousel.
 *
 * Implements the exact calibrated formulas, thresholds, state machine, and
 * synthesizer audio feedback specified in MEDIAPIPE_SETTINGS.md:
 *   - Scale-normalized hand tracking (S = dist(wrist, middle_mcp))
 *   - Wrist-biased weighted palm center
 *   - Kinematic horizontal swing detection (dt: 90-600ms, speed >= 280px/s, ratio |dY| < 0.65|dX|)
 *   - Dual static pose confirmations (Thumbs-Up + OK Sign) with speed gating (< 380px/s)
 *   - 3-State anti-spam hysteresis machine (ARMED -> LOCKOUT -> WAITING_NEUTRAL)
 *   - Pure Web Audio API synthesized chimes
 */

// ---------------------------------------------------------------------------
// Asset locations (Local offline with CDN fallbacks)
// ---------------------------------------------------------------------------
const LOCAL_WASM_URL = '/mediapipe/wasm';
const CDN_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const LOCAL_MODEL_URL = '/mediapipe/gesture_recognizer.task';
const CDN_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task';
const CDN_MODEL_URL_FALLBACK =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

// ---------------------------------------------------------------------------
// Tuning parameters from MEDIAPIPE_SETTINGS.md
// ---------------------------------------------------------------------------
const INFERENCE_INTERVAL_MS = 33; // ~30 fps inference loop
const MAX_HISTORY_MS = 400; // 400ms sliding history buffer
const MIN_SWING_SPAN_MS = 90; // valid swing arc duration floor
const MAX_SWING_SPAN_MS = 600; // valid swing arc duration ceiling
const SWING_VELOCITY_THRESH_PX = 280; // minimum required speed (px/s)
const SWING_MAX_VERTICAL_RATIO = 0.65; // |dY| < 0.65 * |dX|
const POSE_MAX_SPEED_PX = 380; // static poses only evaluated when speed < 380 px/s
const THUMB_UP_MIN_SCORE = 0.50; // native confidence floor for Thumb_Up
const OK_DWELL_MS = 100; // continuous dwell hold duration for OK sign
const GESTURE_FLASH_MS = 800; // duration for HUD to show last-fired gesture

// ---------------------------------------------------------------------------
// 3-State Anti-Spam Hysteresis Machine
// ---------------------------------------------------------------------------
const STATE_ARMED = 0;
const STATE_LOCKOUT = 1;
const STATE_WAITING_NEUTRAL = 2;

const LOCKOUT_MS = 450; // hard freeze duration after firing
const NEUTRAL_SPEED_CEILING_PX = 280; // max speed to be considered at rest
const REQUIRED_NEUTRAL_HOLD_MS = 140; // hold duration below ceiling to re-arm

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

// ---------------------------------------------------------------------------
// Web Audio Synthesizer Chimes (Zero external assets)
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtxClass) {
      try {
        audioCtx = new AudioCtxClass();
      } catch {
        audioCtx = null;
      }
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playGestureChime(type: FiredGesture) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = type === 'left' ? 520 : type === 'right' ? 620 : 840;
    const durationSec = type === 'ok' ? 0.12 : 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // Audio feedback is best-effort
  }
}

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
  /** Camera preview or hidden video element. Created headless if null. */
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
  /** True while inside a post-gesture lockout or waiting for neutral. For the HUD. */
  inCooldown: boolean;
  errorText: string | null;
}

interface MotionPoint {
  screenX: number;
  screenY: number;
  time: number;
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

  // Keep consumer callbacks fresh without restarting the capture loop
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const onConfirmRef = useRef(onConfirm);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;
  onConfirmRef.current = onConfirm;

  // State machine & kinematic tracking state (updated per video frame)
  const machineStateRef = useRef<number>(STATE_ARMED);
  const lastEventTimestampRef = useRef<number>(0);
  const neutralHoldStartTimeRef = useRef<number | null>(null);
  const okCandidateStartTimeRef = useRef<number | null>(null);
  const motionHistoryRef = useRef<MotionPoint[]>([]);
  const smoothedVxRef = useRef<number>(0);

  const lastInferenceRef = useRef(0);
  const lastDebugLogRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashGesture = useCallback((g: FiredGesture) => {
    setLastGesture(g);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setLastGesture(null), GESTURE_FLASH_MS);
  }, []);

  const triggerAction = useCallback(
    (gesture: FiredGesture, now: number) => {
      lastEventTimestampRef.current = now;
      machineStateRef.current = STATE_LOCKOUT;
      neutralHoldStartTimeRef.current = null;
      okCandidateStartTimeRef.current = null;
      motionHistoryRef.current = [];
      smoothedVxRef.current = 0;
      setInCooldown(true);

      dlog(`⚡ FIRED ${gesture.toUpperCase()} at ${Math.round(now)}ms -> STATE_LOCKOUT`);
      flashGesture(gesture);
      playGestureChime(gesture);

      if (gesture === 'left') {
        onSwipeLeftRef.current();
      } else if (gesture === 'right') {
        onSwipeRightRef.current();
      } else if (gesture === 'ok') {
        onConfirmRef.current();
      }
    },
    [flashGesture]
  );

  const processResult = useCallback(
    (result: GestureRecognizerResult, now: number, screenWidth: number, screenHeight: number) => {
      // 1. Advance Lockout -> Waiting Neutral after LOCKOUT_MS
      if (machineStateRef.current === STATE_LOCKOUT) {
        if (now - lastEventTimestampRef.current >= LOCKOUT_MS) {
          machineStateRef.current = STATE_WAITING_NEUTRAL;
          neutralHoldStartTimeRef.current = null;
          dlog('STATE_LOCKOUT expired -> STATE_WAITING_NEUTRAL');
        }
      }

      const landmarks: NormalizedLandmark[] | undefined = result.landmarks?.[0];
      const topGesture = result.gestures?.[0]?.[0];

      // If no hand in view, reset buffer and re-arm if waiting
      if (!landmarks || landmarks.length < 21) {
        motionHistoryRef.current = [];
        okCandidateStartTimeRef.current = null;
        if (machineStateRef.current === STATE_WAITING_NEUTRAL) {
          machineStateRef.current = STATE_ARMED;
          setInCooldown(false);
          dlog('Hand left view -> Re-armed to STATE_ARMED');
        }
        return;
      }

      const wrist = landmarks[0];
      const middleMcp = landmarks[9];

      // Hand scale S: Distance from Wrist (0) to Middle MCP (9)
      const scaleS = Math.hypot(wrist.x - middleMcp.x, wrist.y - middleMcp.y);

      // Weighted Palm Center P: Biased towards wrist (wrist weight 2, knuckles weight 1 each)
      const rawX =
        (wrist.x * 2 +
          landmarks[5].x +
          landmarks[9].x +
          landmarks[13].x +
          landmarks[17].x) /
        6;
      const rawY =
        (wrist.y * 2 +
          landmarks[5].y +
          landmarks[9].y +
          landmarks[13].y +
          landmarks[17].y) /
        6;

      // Mirrored Screen Coordinates (front camera mirror effect)
      const screenX = (1.0 - rawX) * screenWidth;
      const screenY = rawY * screenHeight;

      // Speed calculation (instantaneous + smoothed vx)
      const history = motionHistoryRef.current;
      let instantVx = 0;
      if (history.length > 0) {
        const last = history[history.length - 1];
        const dt = (now - last.time) / 1000;
        if (dt > 0.005) {
          instantVx = (screenX - last.screenX) / dt;
        }
      }

      smoothedVxRef.current = smoothedVxRef.current * 0.45 + instantVx * 0.55;
      const absSpeed = Math.abs(smoothedVxRef.current);

      history.push({ screenX, screenY, time: now });
      while (history.length > 0 && now - history[0].time > MAX_HISTORY_MS) {
        history.shift();
      }

      if (DEBUG && now - lastDebugLogRef.current > 350) {
        lastDebugLogRef.current = now;
        const stateName =
          machineStateRef.current === STATE_ARMED
            ? 'ARMED'
            : machineStateRef.current === STATE_LOCKOUT
            ? 'LOCKOUT'
            : 'WAITING_NEUTRAL';
        dlog(
          `state: ${stateName} | speed: ${Math.round(absSpeed)}px/s | scaleS: ${scaleS.toFixed(
            2
          )} | gesture: ${topGesture ? `${topGesture.categoryName} (${topGesture.score.toFixed(2)})` : 'None'}`
        );
      }

      // 2. Waiting Neutral State: Re-arm once hand comes to rest
      if (machineStateRef.current === STATE_WAITING_NEUTRAL) {
        if (absSpeed < NEUTRAL_SPEED_CEILING_PX) {
          if (!neutralHoldStartTimeRef.current) {
            neutralHoldStartTimeRef.current = now;
          } else if (now - neutralHoldStartTimeRef.current >= REQUIRED_NEUTRAL_HOLD_MS) {
            machineStateRef.current = STATE_ARMED;
            neutralHoldStartTimeRef.current = null;
            setInCooldown(false);
            dlog('Hand at rest -> Re-armed to STATE_ARMED');
          }
        } else {
          neutralHoldStartTimeRef.current = null;
        }
      }

      // 3. Armed State: Evaluate single deliberate swing or static pose
      if (machineStateRef.current === STATE_ARMED) {
        let actionFired = false;

        // A. Dynamic Hand Swing
        if (history.length >= 4) {
          const currentPoint = history[history.length - 1];
          for (let i = 0; i < history.length - 2; i++) {
            const pastPoint = history[i];
            const dtMs = currentPoint.time - pastPoint.time;

            if (dtMs >= MIN_SWING_SPAN_MS && dtMs <= MAX_SWING_SPAN_MS) {
              const dx = currentPoint.screenX - pastPoint.screenX;
              const dy = currentPoint.screenY - pastPoint.screenY;
              const avgSpeed = Math.abs(dx) / (dtMs / 1000);

              const minDisplacement = Math.max(50, scaleS * screenWidth * 0.40);
              const isSpeedSufficient =
                avgSpeed >= SWING_VELOCITY_THRESH_PX || absSpeed >= SWING_VELOCITY_THRESH_PX;
              const isHorizontalArc = Math.abs(dy) < SWING_MAX_VERTICAL_RATIO * Math.abs(dx);

              if (Math.abs(dx) >= minDisplacement && isSpeedSufficient && isHorizontalArc) {
                if (dx > 0) {
                  triggerAction('right', now);
                  actionFired = true;
                  break;
                } else if (dx < 0) {
                  triggerAction('left', now);
                  actionFired = true;
                  break;
                }
              }
            }
          }
        }

        // B. Static Poses (Thumbs-Up or OK Sign) - Only evaluated when hand is steady
        if (!actionFired && absSpeed < POSE_MAX_SPEED_PX) {
          // 1. Thumbs-Up (👍)
          const isThumbUpCategory =
            topGesture?.categoryName === 'Thumb_Up' && topGesture.score >= THUMB_UP_MIN_SCORE;
          const isThumbUpDirection = landmarks[4].y < landmarks[3].y;

          if (isThumbUpCategory && isThumbUpDirection) {
            triggerAction('ok', now);
            actionFired = true;
          } else {
            // 2. OK Sign (👌)
            // Euclidean pinch distance between thumb tip (4) and index tip (8)
            const thumbIndexDist = Math.hypot(
              landmarks[4].x - landmarks[8].x,
              landmarks[4].y - landmarks[8].y
            );
            const isPinchClose = thumbIndexDist < 0.35 * scaleS;

            // Middle finger tip (12) must extend further from wrist than pinched index tip (8)
            const distMiddleToWrist = Math.hypot(
              landmarks[12].x - wrist.x,
              landmarks[12].y - wrist.y
            );
            const distIndexToWrist = Math.hypot(
              landmarks[8].x - wrist.x,
              landmarks[8].y - wrist.y
            );
            const isMiddleOut = distMiddleToWrist > distIndexToWrist;

            if (isPinchClose && isMiddleOut) {
              if (!okCandidateStartTimeRef.current) {
                okCandidateStartTimeRef.current = now;
              } else if (now - okCandidateStartTimeRef.current >= OK_DWELL_MS) {
                okCandidateStartTimeRef.current = null;
                triggerAction('ok', now);
                actionFired = true;
              }
            } else {
              okCandidateStartTimeRef.current = null;
            }
          }
        }
      }
    },
    [triggerAction]
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
    let internalVideo: HTMLVideoElement | null = null;
    let recognizer: { recognizeForVideo: Function; close: () => void } | null = null;
    let framesSeen = 0;
    let lastErrLog = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const video = videoRef.current || internalVideo;
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
        dlog(`first inference ok — video ${video.videoWidth}x${video.videoHeight}`);
      }

      const screenWidth = video.videoWidth || 640;
      const screenHeight = video.videoHeight || 480;
      processResult(result, now, screenWidth, screenHeight);
    };

    const start = async () => {
      setStatus('loading');
      setErrorText(null);
      try {
        dlog('loading MediaPipe bundle…');
        const { FilesetResolver, GestureRecognizer } = await import(
          '@mediapipe/tasks-vision'
        );
        let vision;
        try {
          vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_URL);
          dlog('Loaded local WASM from', LOCAL_WASM_URL);
        } catch (wasmErr) {
          dlog('Local WASM failed, falling back to CDN:', wasmErr);
          vision = await FilesetResolver.forVisionTasks(CDN_WASM_URL);
        }
        if (cancelled) return;
        dlog('wasm ready, loading model…');

        let recognizerInstance = null;
        const modelPaths = [LOCAL_MODEL_URL, CDN_MODEL_URL, CDN_MODEL_URL_FALLBACK];
        for (const modelPath of modelPaths) {
          try {
            recognizerInstance = await GestureRecognizer.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
              runningMode: 'VIDEO',
              numHands: 1,
            });
            dlog('model ready via GPU with', modelPath);
            break;
          } catch (gpuErr) {
            dlog('GPU delegate failed for', modelPath, gpuErr);
            try {
              recognizerInstance = await GestureRecognizer.createFromOptions(vision, {
                baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
                runningMode: 'VIDEO',
                numHands: 1,
              });
              dlog('model ready via CPU with', modelPath);
              break;
            } catch (cpuErr) {
              dlog('CPU delegate failed for', modelPath, cpuErr);
            }
          }
        }

        if (!recognizerInstance) {
          throw new Error('Failed to load GestureRecognizer model from local and CDN paths');
        }
        recognizer = recognizerInstance as unknown as typeof recognizer;
        dlog('Gesture recognizer ready');
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

        let activeVideo = videoRef.current;
        if (!activeVideo) {
          // Fallback to in-memory headless video element
          internalVideo = document.createElement('video');
          internalVideo.playsInline = true;
          internalVideo.muted = true;
          internalVideo.autoplay = true;
          activeVideo = internalVideo;
        }

        activeVideo.srcObject = stream;
        activeVideo.muted = true;
        await activeVideo.play().catch((e) => dlog('video.play() rejected:', e));
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

      const activeVideo = videoRef.current || internalVideo;
      if (activeVideo) activeVideo.srcObject = null;
      internalVideo = null;

      try {
        recognizer?.close();
      } catch {
        /* noop */
      }
      recognizer = null;

      machineStateRef.current = STATE_ARMED;
      neutralHoldStartTimeRef.current = null;
      okCandidateStartTimeRef.current = null;
      motionHistoryRef.current = [];
      smoothedVxRef.current = 0;
      lastInferenceRef.current = 0;

      setIsRunning(false);
      setInCooldown(false);
      setLastGesture(null);
      setStatus('idle');
    };
  }, [enabled, videoRef, processResult]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __gestureDebug?: unknown }).__gestureDebug = {
        isSupported,
        isRunning,
        status,
        lastGesture,
        inCooldown,
        errorText,
      };
    }
  }, [isSupported, isRunning, status, lastGesture, inCooldown, errorText]);

  return { isSupported, isRunning, status, lastGesture, inCooldown, errorText };
}
