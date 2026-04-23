import { create } from 'zustand';

const LS_KEY = 'shadowflow.secrets.0g';
const AUTO_CLEAR_MS = 30 * 60 * 1000;

interface EncryptedBlob {
  cipher: string;
  iv: string;
  salt: string;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function encryptPrivateKey(pk: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(pk),
  );
  return {
    cipher: toBase64(cipherBuf),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

async function decryptPrivateKey(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const salt = fromBase64(blob.salt);
  const iv = fromBase64(blob.iv);
  const cipherData = fromBase64(blob.cipher);
  const key = await deriveKey(passphrase, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherData,
  );
  return new TextDecoder().decode(plainBuf);
}

function loadBlob(): EncryptedBlob | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.cipher && parsed.iv && parsed.salt) return parsed as EncryptedBlob;
    return null;
  } catch {
    return null;
  }
}

function persistBlob(blob: EncryptedBlob): string | null {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(blob));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'localStorage write failed';
  }
}

export interface ZerogSecretsState {
  decryptedKey: string | null;
  hasEncryptedBlob: boolean;
  storageError: string | null;
  unlockError: string | null;
  putPrivateKey: (pk: string, passphrase: string) => Promise<void>;
  getPrivateKey: (passphrase: string) => Promise<string>;
  clear: () => void;
}

let _autoClearTimer: ReturnType<typeof setTimeout> | null = null;

function resetAutoClear(clearFn: () => void) {
  if (_autoClearTimer) clearTimeout(_autoClearTimer);
  _autoClearTimer = setTimeout(() => {
    clearFn();
    _autoClearTimer = null;
  }, AUTO_CLEAR_MS);
}

export const useZerogSecretsStore = create<ZerogSecretsState>((set, get) => {
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LS_KEY) {
        set({ hasEncryptedBlob: loadBlob() !== null, decryptedKey: null, unlockError: null });
      }
    });
  }

  const clearMemory = () => {
    set({ decryptedKey: null, unlockError: null });
    if (_autoClearTimer) {
      clearTimeout(_autoClearTimer);
      _autoClearTimer = null;
    }
  };

  return {
    decryptedKey: null,
    hasEncryptedBlob: loadBlob() !== null,
    storageError: null,
    unlockError: null,

    putPrivateKey: async (pk: string, passphrase: string) => {
      if (!passphrase) throw new Error('Passphrase must not be empty');
      const blob = await encryptPrivateKey(pk, passphrase);
      const err = persistBlob(blob);
      if (err) {
        set({ storageError: err, unlockError: null });
        throw new Error(`Failed to persist encrypted key: ${err}`);
      }
      set({ decryptedKey: pk, hasEncryptedBlob: true, storageError: null, unlockError: null });
      resetAutoClear(clearMemory);
    },

    getPrivateKey: async (passphrase: string) => {
      const current = get().decryptedKey;
      if (current) {
        resetAutoClear(clearMemory);
        return current;
      }

      const blob = loadBlob();
      if (!blob) throw new Error('No encrypted key found in localStorage');

      try {
        const pk = await decryptPrivateKey(blob, passphrase);
        set({ decryptedKey: pk, unlockError: null });
        resetAutoClear(clearMemory);
        return pk;
      } catch {
        set({ unlockError: 'Incorrect passphrase' });
        throw new Error('Incorrect passphrase');
      }
    },

    clear: () => {
      clearMemory();
      set({ hasEncryptedBlob: false, storageError: null });
      try { window.localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    },
  };
});
