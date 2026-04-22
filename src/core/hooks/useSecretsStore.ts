import { create } from 'zustand';

/** BYOK 密钥仅客户端持有，绝不上传或记录日志（NFR S1）。 */
export interface ProviderSecrets {
  anthropic?: string;
  openai?: string;
  gemini?: string;
  zerog?: string;
}

const LS_KEY = 'SHADOWFLOW_SECRETS_V1';

function loadSecrets(): ProviderSecrets {
  // P3: Guard against SSR / Node.js environments (test isolation)
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // P4: Validate result is a plain object (not array / null / primitive)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as ProviderSecrets;
  } catch {
    return {};
  }
}

function persistSecrets(secrets: ProviderSecrets): string | null {
  // P5: Surface QuotaExceededError instead of swallowing silently
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(secrets));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'localStorage write failed';
  }
}

interface SecretsState {
  secrets: ProviderSecrets;
  /** P5: Non-null when localStorage.setItem throws (e.g. QuotaExceededError). */
  storageError: string | null;
  setSecret: (provider: keyof ProviderSecrets, value: string) => void;
  clearSecret: (provider: keyof ProviderSecrets) => void;
  clearAll: () => void;
  hasAnySecret: () => boolean;
  /** P6: Internal — re-sync state from localStorage on cross-tab 'storage' event. */
  _syncFromStorage: () => void;
}

export const useSecretsStore = create<SecretsState>((set, get) => {
  // P6: Cross-tab sync via storage event
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY) get()._syncFromStorage();
    });
  }

  return {
    secrets: loadSecrets(),
    storageError: null,

    setSecret: (provider, value) => {
      // P7: Treat empty string as clearSecret — prevents phantom empty-string entries
      if (!value) {
        get().clearSecret(provider);
        return;
      }
      set((s) => {
        const next = { ...s.secrets, [provider]: value };
        const err = persistSecrets(next);
        return { secrets: next, storageError: err };
      });
    },

    clearSecret: (provider) => {
      set((s) => {
        const next = { ...s.secrets };
        delete next[provider];
        const err = persistSecrets(next);
        return { secrets: next, storageError: err };
      });
    },

    clearAll: () => {
      try { window.localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      set({ secrets: {}, storageError: null });
    },

    // P7: Only count non-empty string values as "present"
    hasAnySecret: () =>
      Object.values(get().secrets).some((v) => typeof v === 'string' && v.length > 0),

    _syncFromStorage: () => set({ secrets: loadSecrets() }),
  };
});
