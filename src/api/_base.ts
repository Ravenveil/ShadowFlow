/**
 * Shared API base URL resolver.
 *
 * Priority order:
 *   1. `localStorage['sf_secrets'].backend_url`  — user-configured via SecretsModal
 *   2. `VITE_API_BASE` env var                   — set at build time / .env file
 *   3. `http://localhost:8000`                   — development default
 */
export function getApiBase(): string {
  try {
    const raw = localStorage.getItem('sf_secrets');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const url = parsed['backend_url'];
      if (typeof url === 'string' && url.trim()) {
        return url.trim().replace(/\/$/, '');
      }
    }
  } catch {
    // ignore parse errors
  }
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return envBase.trim().replace(/\/$/, '') || 'http://localhost:8000';
}
