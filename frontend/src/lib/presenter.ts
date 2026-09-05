/**
 * Loads the Perxona `<sv-presenter>` web component engine on demand.
 *
 * Importing the script registers the `sv-presenter` custom element as a side
 * effect. Concurrent callers share a single in-flight load so multiple hooks
 * can safely await the engine.
 */
const DEFAULT_PRESENTER_URL =
  'https://cdn.perxona.ai/asia/prod/latest/widget/entry/presenter.js';

let enginePromise: Promise<void> | null = null;

export function loadPresenterEngine(
  url: string = DEFAULT_PRESENTER_URL
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }

  if (window.customElements?.get('sv-presenter')) {
    return Promise.resolve();
  }

  if (enginePromise) {
    return enginePromise;
  }

  enginePromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-presenter-engine]'
    );

    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Perxona presenter engine'))
      );
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.async = true;
    script.dataset.presenterEngine = 'true';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      enginePromise = null;
      script.remove();
      reject(new Error('Failed to load Perxona presenter engine'));
    });
    document.head.appendChild(script);
  });

  return enginePromise;
}

export { DEFAULT_PRESENTER_URL };
