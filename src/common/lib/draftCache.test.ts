/**
 * draftCache — unit tests covering save/load/expire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from './draftCache';

describe('draftCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('saveDraft writes and loadDraft returns the same text', () => {
    saveDraft('sess-1', 'hello world');
    expect(loadDraft('sess-1')).toBe('hello world');

    // Empty-string write clears the entry (round-trip → '').
    saveDraft('sess-1', '');
    expect(loadDraft('sess-1')).toBe('');
    expect(localStorage.getItem('sf.draft.sess-1')).toBeNull();
  });

  it('loadDraft returns "" and evicts the entry when the draft is older than ttl', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T10:00:00Z'));
    saveDraft('sess-2', 'stale draft');

    // Jump ~25h ahead — past the default 24h TTL.
    vi.setSystemTime(new Date('2026-05-17T11:00:00Z'));
    expect(loadDraft('sess-2')).toBe('');
    expect(localStorage.getItem('sf.draft.sess-2')).toBeNull();
  });

  it('clearDraft removes the entry and loadDraft tolerates a missing/corrupt value', () => {
    saveDraft('sess-3', 'to be cleared');
    clearDraft('sess-3');
    expect(loadDraft('sess-3')).toBe('');

    // Corrupt payload — load should swallow + return ''.
    localStorage.setItem('sf.draft.sess-3', '{not json');
    expect(loadDraft('sess-3')).toBe('');
  });
});
