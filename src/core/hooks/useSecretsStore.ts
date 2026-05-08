import { create } from 'zustand';

/**
 * BYOK 密钥仅客户端持有，绝不上传或记录日志（NFR S1）。
 * 存储时使用 AES-GCM + PBKDF2 加密（与 useZerogSecretsStore 对齐，H2 修复）。
 * 设备随机 passphrase 存于 shadowflow.device-key，仅防止静态扫描 / 被动 XSS。
 */
export interface ProviderSecrets {
  anthropic?: string;
  openai?: string;
  gemini?: string;
  zerog?: string;
}

const LS_KEY = 'SHADOWFLOW_SECRETS_V2';
const DEVICE_KEY_LS = 'shadowflow.device-key';

// ── Crypto helpers (mirrors useZerogSecretsStore) ────────────────────────────

interface EncryptedBlob {
  cipher: string;
  iv: string;
  salt: string;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(buf: ArrayBuffer): string {
  // Use a loop instead of spread to avoid call-stack overflow on Safari for large buffers
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function encrypt(plain: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { cipher: toBase64(buf), iv: toBase64(iv), salt: toBase64(salt) };
}

async function decrypt(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, fromBase64(blob.salt));
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(blob.iv) }, key, fromBase64(blob.cipher));
  return new TextDecoder().decode(buf);
}

// ── Device-key management ────────────────────────────────────────────────────

function getOrCreateDeviceKey(): string {
  if (typeof window === 'undefined') return 'ssr-placeholder';
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY_LS);
    if (existing) return existing;
    const fresh = toBase64(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
    window.localStorage.setItem(DEVICE_KEY_LS, fresh);
    return fresh;
  } catch {
    return 'fallback-key';
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function loadSecrets(): Promise<ProviderSecrets> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) {
      // Migrate legacy plaintext V1 if present: re-encrypt and promote to V2
      const v1 = window.localStorage.getItem('SHADOWFLOW_SECRETS_V1');
      if (v1) {
        const parsed = JSON.parse(v1);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Immediately write V2 so subsequent loads use encrypted form
          persistSecrets(parsed as ProviderSecrets).catch(() => {/* best-effort */});
          return parsed as ProviderSecrets;
        }
      }
      return {};
    }
    const blob: EncryptedBlob = JSON.parse(raw);
    if (!blob.cipher || !blob.iv || !blob.salt) return {};
    const passphrase = getOrCreateDeviceKey();
    const plain = await decrypt(blob, passphrase);
    const parsed = JSON.parse(plain);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as ProviderSecrets;
  } catch {
    return {};
  }
}

async function persistSecrets(secrets: ProviderSecrets): Promise<string | null> {
  try {
    const passphrase = getOrCreateDeviceKey();
    const blob = await encrypt(JSON.stringify(secrets), passphrase);
    window.localStorage.setItem(LS_KEY, JSON.stringify(blob));
    // Remove legacy plaintext if present
    window.localStorage.removeItem('SHADOWFLOW_SECRETS_V1');
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'localStorage write failed';
  }
}

// ── Store ────────────────────────────────────────────────────────────────────

interface SecretsState {
  secrets: ProviderSecrets;
  storageError: string | null;
  setSecret: (provider: keyof ProviderSecrets, value: string) => void;
  clearSecret: (provider: keyof ProviderSecrets) => void;
  clearAll: () => void;
  hasAnySecret: () => boolean;
  _syncFromStorage: () => void;
}

export const useSecretsStore = create<SecretsState>((set, get) => {
  // Async init: load encrypted secrets on first use
  loadSecrets().then((secrets) => set({ secrets })).catch(() => {/* keep empty */});

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY || e.key === 'SHADOWFLOW_SECRETS_V1') get()._syncFromStorage();
    });
  }

  return {
    secrets: {},
    storageError: null,

    setSecret: (provider, value) => {
      if (!value) {
        get().clearSecret(provider);
        return;
      }
      set((s) => {
        const next = { ...s.secrets, [provider]: value };
        persistSecrets(next)
          .then((err) => { if (err) set({ storageError: err }); })
          .catch((e: unknown) => set({ storageError: e instanceof Error ? e.message : 'Encryption failed' }));
        return { secrets: next };
      });
    },

    clearSecret: (provider) => {
      set((s) => {
        const next = { ...s.secrets };
        delete next[provider];
        persistSecrets(next)
          .then((err) => { if (err) set({ storageError: err }); })
          .catch((e: unknown) => set({ storageError: e instanceof Error ? e.message : 'Encryption failed' }));
        return { secrets: next };
      });
    },

    clearAll: () => {
      try {
        window.localStorage.removeItem(LS_KEY);
        window.localStorage.removeItem('SHADOWFLOW_SECRETS_V1');
      } catch { /* ignore */ }
      set({ secrets: {}, storageError: null });
    },

    hasAnySecret: () =>
      Object.values(get().secrets).some((v) => typeof v === 'string' && v.length > 0),

    _syncFromStorage: () => {
      loadSecrets().then((secrets) => set({ secrets })).catch(() => {/* ignore */});
    },
  };
});
