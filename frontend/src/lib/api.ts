/**
 * Lightweight fetch helpers for the concierge backend.
 *
 * In development the Vite dev server proxies `/api/*` to the FastAPI backend
 * (see vite.config.ts). In production the same FastAPI process serves this SPA
 * as static files, so a relative base URL works in both environments.
 */
export const API_BASE_URL =
  ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://garden-to-table-backend-xvqq6faqyq-as.a.run.app';

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Request to ${path} failed: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`
    );
  }

  return (await res.json()) as T;
}
