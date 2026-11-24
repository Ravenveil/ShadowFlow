import { describe, it, expect, vi, afterEach } from 'vitest';
import { putTeamWorkflow, putTeamPolicy, TeamApiError } from '../teams';

afterEach(() => vi.restoreAllMocks());

describe('putTeamWorkflow error handling', () => {
  it('throws TeamApiError when backend returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { code: 'SAVE_FAILED', message: 'disk full' } }),
    }));
    await expect(
      putTeamWorkflow('team-1', { nodes: [], edges: [] }),
    ).rejects.toBeInstanceOf(TeamApiError);
  });

  it('resolves when backend returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '{}',
    }));
    await expect(
      putTeamWorkflow('team-1', { nodes: [], edges: [] }),
    ).resolves.toBeUndefined();
  });
});

describe('putTeamPolicy error handling', () => {
  it('throws TeamApiError when backend returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      text: async () => JSON.stringify({ error: { code: 'BAD_MATRIX' } }),
    }));
    await expect(
      putTeamPolicy('team-1', { a: { b: 'permit' } }),
    ).rejects.toBeInstanceOf(TeamApiError);
  });

  it('resolves when backend returns ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '{}',
    }));
    await expect(
      putTeamPolicy('team-1', { a: { b: 'permit' } }),
    ).resolves.toBeUndefined();
  });
});
