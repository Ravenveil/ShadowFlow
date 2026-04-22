import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the store
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true });

// Dynamic import so mock is applied first
const { useSecretsStore } = await import('../../core/hooks/useSecretsStore');

describe('useSecretsStore', () => {
  beforeEach(() => {
    useSecretsStore.getState().clearAll();
  });

  it('starts with empty secrets', () => {
    expect(useSecretsStore.getState().secrets).toEqual({});
  });

  it('setSecret stores a key', () => {
    useSecretsStore.getState().setSecret('anthropic', 'sk-test-123');
    expect(useSecretsStore.getState().secrets.anthropic).toBe('sk-test-123');
  });

  it('hasAnySecret returns true when a key is set', () => {
    useSecretsStore.getState().setSecret('openai', 'sk-oai');
    expect(useSecretsStore.getState().hasAnySecret()).toBe(true);
  });

  it('hasAnySecret returns false when no key set', () => {
    expect(useSecretsStore.getState().hasAnySecret()).toBe(false);
  });

  it('clearSecret removes only the target provider', () => {
    useSecretsStore.getState().setSecret('anthropic', 'sk-a');
    useSecretsStore.getState().setSecret('gemini', 'sk-g');
    useSecretsStore.getState().clearSecret('anthropic');
    expect(useSecretsStore.getState().secrets.anthropic).toBeUndefined();
    expect(useSecretsStore.getState().secrets.gemini).toBe('sk-g');
  });

  it('clearAll removes all secrets', () => {
    useSecretsStore.getState().setSecret('anthropic', 'sk-a');
    useSecretsStore.getState().setSecret('openai', 'sk-o');
    useSecretsStore.getState().clearAll();
    expect(useSecretsStore.getState().hasAnySecret()).toBe(false);
  });
});
