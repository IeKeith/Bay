import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Suppress harmless Cocos Creator camera resize sync & dynamic bones exceptions before 3D scene finishes loading
const isHarmlessCocosError = (msg?: string, stack?: string) => {
  return (
    msg?.includes("Cannot read properties of null (reading 'x')") ||
    msg?.includes("Cannot read properties of null (reading 'filter')") ||
    stack?.includes('refreshCameraPosition') ||
    stack?.includes('enableAllDynamicBones') ||
    stack?.includes('cc.js')
  );
};

window.addEventListener(
  'error',
  (event) => {
    if (isHarmlessCocosError(event.message, event.error?.stack)) {
      event.preventDefault();
      return true;
    }
  },
  true
);

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (isHarmlessCocosError(reason?.message, reason?.stack)) {
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
