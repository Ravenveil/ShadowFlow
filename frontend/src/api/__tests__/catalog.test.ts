/**
 * catalog API client — 走 /api/catalog（Node 网关 proxyFallback → Python）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { listCatalogApps, forkCatalogApp, CatalogApiError } from '../catalog';

afterEach(() => vi.unstubAllGlobals());

describe('listCatalogApps', () => {
  it('returns apps from the {data, meta} envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { apps: [{ app_id: 'app-t04', name: 'T04', mode: 'team' }] },
        meta: { total: 1 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const apps = await listCatalogApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].mode).toBe('team');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/catalog/apps');
  });
});

describe('forkCatalogApp', () => {
  it('posts empty body when no workspace given and unwraps envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { blueprint_id: 'bp-1', forked_from: 'app-t04', team: { team_id: 'team-1' } },
        meta: {},
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await forkCatalogApp('app-t04');
    expect(result.team?.team_id).toBe('team-1');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({});
  });

  it('throws CatalogApiError with stable code on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'CATALOG_APP_NOT_FOUND' } }),
    }));
    await expect(forkCatalogApp('app-nope')).rejects.toBeInstanceOf(CatalogApiError);
  });
});
