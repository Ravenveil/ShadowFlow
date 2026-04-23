import { describe, it, expect, beforeEach, vi } from 'vitest';

const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

// Web Crypto API is available in jsdom with Node 20+; if not, these tests
// will naturally fail at the crypto.subtle calls, which is acceptable.

const { useZerogSecretsStore } = await import('../useZerogSecretsStore');

describe('useZerogSecretsStore', () => {
  beforeEach(() => {
    useZerogSecretsStore.getState().clear();
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  it('starts with no decrypted key and no blob', () => {
    const state = useZerogSecretsStore.getState();
    expect(state.decryptedKey).toBeNull();
    expect(state.hasEncryptedBlob).toBe(false);
  });

  it('putPrivateKey encrypts and stores, keeps decrypted in memory', async () => {
    const pk = '0x' + 'ab'.repeat(32);
    await useZerogSecretsStore.getState().putPrivateKey(pk, 'mypass');
    const state = useZerogSecretsStore.getState();
    expect(state.decryptedKey).toBe(pk);
    expect(state.hasEncryptedBlob).toBe(true);

    // localStorage should have cipher/iv/salt, NOT plaintext
    const raw = storage['shadowflow.secrets.0g'];
    expect(raw).toBeDefined();
    const blob = JSON.parse(raw);
    expect(blob.cipher).toBeDefined();
    expect(blob.iv).toBeDefined();
    expect(blob.salt).toBeDefined();
    expect(raw).not.toContain(pk);
  });

  it('getPrivateKey decrypts with correct passphrase', async () => {
    const pk = '0x' + 'cd'.repeat(32);
    await useZerogSecretsStore.getState().putPrivateKey(pk, 'secret123');

    // Clear in-memory key to force decryption from localStorage
    useZerogSecretsStore.setState({ decryptedKey: null });

    const result = await useZerogSecretsStore.getState().getPrivateKey('secret123');
    expect(result).toBe(pk);
  });

  it('getPrivateKey rejects wrong passphrase', async () => {
    const pk = '0x' + 'ef'.repeat(32);
    await useZerogSecretsStore.getState().putPrivateKey(pk, 'correct');

    useZerogSecretsStore.setState({ decryptedKey: null });

    await expect(
      useZerogSecretsStore.getState().getPrivateKey('wrong')
    ).rejects.toThrow('Incorrect passphrase');

    expect(useZerogSecretsStore.getState().unlockError).toBe('Incorrect passphrase');
  });

  it('getPrivateKey returns cached key without re-decrypting', async () => {
    const pk = '0x' + '11'.repeat(32);
    await useZerogSecretsStore.getState().putPrivateKey(pk, 'pass');

    // Key is cached — should return immediately without passphrase validation
    const result = await useZerogSecretsStore.getState().getPrivateKey('anypass');
    expect(result).toBe(pk);
  });

  it('clear removes in-memory key and localStorage blob', async () => {
    const pk = '0x' + '22'.repeat(32);
    await useZerogSecretsStore.getState().putPrivateKey(pk, 'pass');
    expect(storage['shadowflow.secrets.0g']).toBeDefined();

    useZerogSecretsStore.getState().clear();
    const state = useZerogSecretsStore.getState();
    expect(state.decryptedKey).toBeNull();
    expect(state.hasEncryptedBlob).toBe(false);
    expect(storage['shadowflow.secrets.0g']).toBeUndefined();
  });

  it('after page refresh (clear memory), needs passphrase to re-decrypt', async () => {
    const pk = '0x' + '33'.repeat(32);
    await useZerogSecretsStore.getState().putPrivateKey(pk, 'refresh-test');

    // Simulate page refresh: clear memory but keep localStorage
    useZerogSecretsStore.setState({ decryptedKey: null });
    expect(useZerogSecretsStore.getState().decryptedKey).toBeNull();

    // Must provide passphrase again
    const recovered = await useZerogSecretsStore.getState().getPrivateKey('refresh-test');
    expect(recovered).toBe(pk);
  });

  it('getPrivateKey throws when no blob exists', async () => {
    await expect(
      useZerogSecretsStore.getState().getPrivateKey('whatever')
    ).rejects.toThrow('No encrypted key found');
  });
});
