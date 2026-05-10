/**
 * useSettings.test.ts — vitest coverage for Story 15.17 hook (useSetting).
 *
 * Run with:  npx vitest run src/core/hooks/useSettings.test.ts
 *
 * Covers the three lifecycle states documented in the hook source:
 *   - hydrating: localStorage read is synchronous; server hydrate overwrites
 *   - synced: setter pushes to localStorage + server (mocked)
 *   - offline: server hydrate returning null leaves local value intact;
 *     setter writes local even when server fails
 *
 * Plus:
 *   - storage event multi-tab sync
 *   - BYOK guard: `sf_anthropic_key` short-circuits server hydration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// In-memory localStorage shim shared across all tests.
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in storage ? storage[k] : null),
  setItem: (k: string, v: string) => {
    storage[k] = v;
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock the api module so we control hydration / setter outcomes per test.
vi.mock('../../api/settings', async () => {
  const actual = await vi.importActual<
    typeof import('../../api/settings')
  >('../../api/settings');
  return {
    ...actual,
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    deleteSetting: vi.fn(),
    // isClientOnlyKey re-exported from actual so the hook's BYOK guard works
    isClientOnlyKey: actual.isClientOnlyKey,
  };
});

const apiSettings = await import('../../api/settings');
const { useSetting } = await import('./useSettings');

describe('useSetting (Story 15.17)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates synchronously from localStorage when present', () => {
    storage['sf.maxTokens'] = JSON.stringify(4096);
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));
    // Synchronous read — no awaiting needed.
    expect(result.current[0]).toBe(4096);
  });

  it('uses defaultValue when localStorage is empty', () => {
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));
    expect(result.current[0]).toBe(8192);
  });

  it('overwrites local with server value when they disagree (synced state)', async () => {
    storage['sf.maxTokens'] = JSON.stringify(4096);
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(2048);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));

    // Initial render reads local 4096…
    expect(result.current[0]).toBe(4096);
    // …then server hydrate writes 2048 over it.
    await waitFor(() => expect(result.current[0]).toBe(2048));
    expect(JSON.parse(storage['sf.maxTokens'])).toBe(2048);
  });

  it('keeps local value when server returns null (offline / 5xx)', async () => {
    storage['sf.maxTokens'] = JSON.stringify(4096);
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));
    expect(result.current[0]).toBe(4096);

    // Wait long enough for hydrate effect to settle, then assert no overwrite.
    await waitFor(() => {
      expect(apiSettings.getSetting).toHaveBeenCalledWith('sf.maxTokens');
    });
    expect(result.current[0]).toBe(4096);
    expect(JSON.parse(storage['sf.maxTokens'])).toBe(4096);
  });

  it('setter updates state + localStorage + calls server PUT', async () => {
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (apiSettings.setSetting as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));

    act(() => {
      result.current[1](2048);
    });

    expect(result.current[0]).toBe(2048);
    expect(JSON.parse(storage['sf.maxTokens'])).toBe(2048);
    expect(apiSettings.setSetting).toHaveBeenCalledWith('sf.maxTokens', 2048);
  });

  it('setter still writes localStorage when server PUT fails', async () => {
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (apiSettings.setSetting as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));

    act(() => {
      result.current[1](2048);
    });

    // State + localStorage update synchronously regardless of server failure.
    expect(result.current[0]).toBe(2048);
    expect(JSON.parse(storage['sf.maxTokens'])).toBe(2048);
  });

  it('reacts to storage events from sibling tabs', () => {
    storage['sf.maxTokens'] = JSON.stringify(4096);
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));
    expect(result.current[0]).toBe(4096);

    // Simulate another tab writing 1024 to the same key.
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sf.maxTokens',
          oldValue: JSON.stringify(4096),
          newValue: JSON.stringify(1024),
        }),
      );
    });

    expect(result.current[0]).toBe(1024);
  });

  it('storage event with cleared key restores defaultValue', () => {
    storage['sf.maxTokens'] = JSON.stringify(4096);
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sf.maxTokens',
          oldValue: JSON.stringify(4096),
          newValue: null,
        }),
      );
    });

    expect(result.current[0]).toBe(8192);
  });

  it('ignores storage events for unrelated keys', () => {
    storage['sf.maxTokens'] = JSON.stringify(4096);
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<number>('sf.maxTokens', 8192));

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'sf.theme', // different key
          oldValue: null,
          newValue: JSON.stringify('dark'),
        }),
      );
    });

    expect(result.current[0]).toBe(4096);
  });

  it('BYOK keys short-circuit server hydration', async () => {
    storage['sf_anthropic_key'] = 'sk-ant-test-only-local';
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue('should-not-arrive');

    const { result } = renderHook(() =>
      useSetting<string>('sf_anthropic_key', ''),
    );

    // Hook should NOT have called server getSetting for BYOK key.
    await waitFor(() => {
      expect(apiSettings.getSetting).not.toHaveBeenCalled();
    });
    // Local value still served (string fallback when JSON.parse fails).
    expect(result.current[0]).toBe('sk-ant-test-only-local');
  });

  it('handles malformed localStorage JSON by falling back to raw string', () => {
    storage['sf.theme'] = 'dark'; // legacy non-JSON write
    (apiSettings.getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { result } = renderHook(() => useSetting<string>('sf.theme', 'light'));
    expect(result.current[0]).toBe('dark');
  });
});
