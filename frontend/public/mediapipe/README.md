# MediaPipe assets (offline kiosk)

`useHandGestures` loads the MediaPipe Tasks Vision WASM runtime and the
`gesture_recognizer` model from public CDNs by default. The browser caches both
after the first load, but a kiosk that boots without internet needs them
vendored locally.

## Vendor the files

From the repo root:

```bash
# WASM runtime — copy from the installed package (version must match
# @mediapipe/tasks-vision in frontend/package.json)
mkdir -p frontend/public/mediapipe/wasm
cp frontend/node_modules/@mediapipe/tasks-vision/wasm/* frontend/public/mediapipe/wasm/

# Gesture recognizer model (~8 MB)
curl -L -o frontend/public/mediapipe/gesture_recognizer.task \
  https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task
```

## Point the hook at them

In `frontend/src/hooks/useHandGestures.ts`:

```ts
const WASM_BASE_URL = '/mediapipe/wasm';
const MODEL_URL = '/mediapipe/gesture_recognizer.task';
```

Vite copies `frontend/public/**` into the deployed `public/` bundle on build, so
the files ship with the SPA and are served same-origin.

> The `wasm/` binaries and `*.task` model are intentionally **not committed** —
> add them locally (or in CI) as part of the kiosk build.
