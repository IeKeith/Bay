# MediaPipe Hand Gesture Configuration & Tuning Guide

This document records the exact configuration, mathematical formulas, thresholds, state machine logic, and tuning parameters used for the **MediaPipe Tasks Vision** touchless gesture integration in the **Garden-to-Table Host (Bay)** project.

---

## 1. Package & Model Specification

| Component | Setting / Value | Description / Rationale |
| :--- | :--- | :--- |
| **Package** | `@mediapipe/tasks-vision` (`v0.10.14`+) | Modern MediaPipe Tasks API. *Do not use legacy `mp.solutions`.* |
| **WASM Binary CDN** | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm` | Loaded via `FilesetResolver.forVisionTasks()`. |
| **Model Bundle** | `gesture_recognizer.task` (float16) | `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task` |
| **Running Mode** | `VIDEO` | Uses temporal tracking between frames for low jitter. |
| **Delegate** | `GPU` with fallback to `CPU` | Uses WebGL/OpenGL ES hardware acceleration; falls back to WASM SIMD/XNNPACK if GPU is unsupported. |
| **Tracked Hands** | `1` (`numHands: 1`) | Tracks a single primary user to eliminate multi-user association ambiguity. |

---

## 2. Video Capture & Headless Privacy Configuration

To guarantee user privacy and avoid cluttering the UI, the camera feed is completely headless (never rendered to the screen).

| Property | Value | Rationale |
| :--- | :--- | :--- |
| **Resolution** | `640 × 480` (`width: 640, height: 480`) | Optimal trade-off between inference speed (30–60 FPS) and landmark precision. |
| **Facing Mode** | `user` (Front-facing selfie) | Standard for kiosks, laptops, and tablets. |
| **DOM Visibility** | **Hidden** (`display: none` / off-screen element) | The `<video>` element is created in memory via `document.createElement('video')` and never appended to visible DOM. |
| **Camera Lifecycle** | **Active only during selection** | Automatically calls `track.stop()` when avatar is locked in to release hardware and save CPU/battery. Re-opens when "Switch Avatar" is clicked. |

---

## 3. Coordinate Normalization & Landmark Mapping

MediaPipe provides 21 normalized landmarks per hand ($[0.0, 1.0]$ space).

### Key Landmarks Used:
* **Landmark 0**: Wrist
* **Landmark 4**: Thumb tip
* **Landmark 5, 9, 13, 17**: MCP knuckles (Index, Middle, Ring, Pinky)
* **Landmark 8**: Index finger tip
* **Landmark 12**: Middle finger tip

### Geometric Formulas:

#### 1. Hand Scale ($S$)
Distance from Wrist (0) to Middle MCP (9). Normalizes thresholds against hand size and distance from the camera:
$$S = \sqrt{(x_0 - x_9)^2 + (y_0 - y_9)^2}$$

#### 2. Weighted Palm Center ($P$)
Biased towards the wrist to accurately reflect gross arm/wrist swings:
$$P_x = \frac{2 \cdot x_0 + x_5 + x_9 + x_{13} + x_{17}}{6}$$
$$P_y = \frac{2 \cdot y_0 + y_5 + y_9 + y_{13} + y_{17}}{6}$$

#### 3. Mirrored Screen Coordinates (Pixels)
Since front-facing cameras act as mirrors, coordinates are flipped horizontally so moving physically to the right maps to increasing screen $X$:
$$X_{\text{screen}} = (1.0 - P_x) \times \text{width}$$
$$Y_{\text{screen}} = P_y \times \text{height}$$

---

## 4. Hand / Arm Swing Motion Parameters (Left & Right)

The motion engine tracks the horizontal trajectory of $P$ across a sliding history buffer of the last $400\text{ ms}$.

| Parameter | Calibrated Value | Function / Purpose |
| :--- | :--- | :--- |
| **History Buffer** | $400\text{ ms}$ (`MAX_HISTORY_MS`) | Stores timestamped positions $\{X, Y, t\}$; prunes older points. |
| **Temporal Window ($\Delta t$)** | $90\text{ ms} \le \Delta t \le 600\text{ ms}$ | Valid duration for a natural human swing motion. |
| **Minimum Displacement ($\Delta X$)** | $\max(50\text{ px}, 0.40 \cdot S \cdot \text{width})$ | Minimum horizontal distance the hand must travel. At 640px, typically $50–90\text{ px}$. |
| **Velocity Threshold ($v_{\text{thresh}}$)** | **$280\text{ px/s}$** | Hand speed must exceed $280\text{ px/s}$ either on average over the arc ($v_{\text{avg}} = \frac{\Delta X}{\Delta t}$) or instantaneously. |
| **Horizontal Ratio Filter** | $|\Delta Y| < 0.65 \cdot |\Delta X|$ | Filters out diagonal waves, vertical head scratches, or raising/lowering hand. |
| **Right Swing Trigger** | $\Delta X > 0$ meeting criteria | Fires `SWING_RIGHT` $\rightarrow$ Next Avatar (`handleNext`). |
| **Left Swing Trigger** | $\Delta X < 0$ meeting criteria | Fires `SWING_LEFT` $\rightarrow$ Previous Avatar (`handlePrev`). |

---

## 5. Static Pose Parameters (Thumbs-Up & OK Sign)

To prevent accidental triggers during motion, static poses are only evaluated when hand speed is steady:
$$|v_x| < 380\text{ px/s}$$

### Thumbs-Up (👍)
* **Classifier Category**: Native MediaPipe `Thumb_Up` label.
* **Confidence Score Floor**: $\ge 0.50$ (50%).
* **Anatomical Direction Check**: Thumb tip (4) is vertically above thumb IP joint (3):
  $$y_4 < y_3$$
* **Action**: Triggers `OK` / Lock In.

### OK Sign (👌)
* **Pinch Distance**: Euclidean distance between Thumb tip (4) and Index tip (8) relative to hand scale:
  $$\text{dist}(L_4, L_8) < 0.35 \cdot S$$
* **Finger Extension Check**: Middle finger tip (12) must extend further from the wrist than the pinched index tip (8):
  $$\text{dist}(L_{12}, L_0) > \text{dist}(L_8, L_0)$$
* **Dwell Hold Duration**: Must hold continuously for $\ge 100\text{ ms}$ (`OK_DWELL_MS`).
* **Action**: Triggers `OK` / Lock In.

---

## 6. Anti-Spam 3-State Hysteresis Machine

The core architectural innovation preventing duplicate spamming (`Right Right Left Left`) and eliminating opposite return-stroke rebounds.

```
                  ┌───────────────────────────────┐
                  │        1. STATE_ARMED         │
                  │  Ready to evaluate single     │
                  │  deliberate hand swing / pose │
                  └───────────────┬───────────────┘
                                  │
                       [Action criteria met]
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │       ⚡ FIRES EXACTLY ONCE    │
                  │   - Emits event callback      │
                  │   - Clears trajectory buffer  │
                  │   - Plays subtle audio chime  │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │       2. STATE_LOCKOUT        │
                  │  Hard lockout: 450 ms         │
                  │  Ignores all follow-through   │
                  └───────────────┬───────────────┘
                                  │
                       [After 450 ms elapsed]
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │   3. STATE_WAITING_NEUTRAL    │
                  │  Suppresses return stroke:    │
                  │  Refuses to re-arm until      │
                  │  speed < 280 px/s for 140 ms  │
                  └───────────────┬───────────────┘
                                  │
                       [Hand comes to rest]
                                  │
                                  ▼
                        Re-arms to STATE_ARMED
```

| State Machine Variable | Value | Purpose |
| :--- | :--- | :--- |
| `LOCKOUT_MS` | $450\text{ ms}$ | Hard freeze duration where all sensor input is discarded. |
| `NEUTRAL_SPEED_CEILING_PX` | $280\text{ px/s}$ | The maximum speed hand can move to be considered "at rest". |
| `REQUIRED_NEUTRAL_HOLD_MS` | $140\text{ ms}$ | Hand must remain below the speed ceiling continuously for 140ms to re-arm. |

---

## 7. Web Audio Synthesizer Chimes

Integrated purely through browser Web Audio API (zero external `.mp3` assets):

| Event | Waveform | Frequency | Duration | Gain |
| :--- | :--- | :--- | :--- | :--- |
| **Swipe Left** | Sine | $520\text{ Hz}$ | $80\text{ ms}$ | $0.06$ (exponential decay) |
| **Swipe Right** | Sine | $620\text{ Hz}$ | $80\text{ ms}$ | $0.06$ (exponential decay) |
| **OK / Lock In** | Sine | $840\text{ Hz}$ | $120\text{ ms}$ | $0.06$ (exponential decay) |

---

## 8. Summary of Files in Codebase

* **React Hook**: [`frontend/src/hooks/useHandGestures.ts`](file:///c:/Users/Rald999/Documents/GitHub/Bay/frontend/src/hooks/useHandGestures.ts) — Encapsulated headless gesture detection engine.
* **Component Integration**: [`frontend/src/components/AvatarStage.tsx`](file:///c:/Users/Rald999/Documents/GitHub/Bay/frontend/src/components/AvatarStage.tsx) — Touchless avatar carousel navigation.
* **Standalone Visual Test App**: [`gestures/index.html`](file:///c:/Users/Rald999/Documents/GitHub/Bay/gestures/index.html) — Visual test arena with skeleton overlay, velocity gauges, and interactive sliders.
* **Standalone Test Server**: [`gestures/test_server.py`](file:///c:/Users/Rald999/Documents/GitHub/Bay/gestures/test_server.py) — Multi-threaded local Python server on `http://localhost:8089`.
