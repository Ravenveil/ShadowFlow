/**
 * settings.ts — Settings router (Stories 15.9 + 15.17)
 *
 * Original (15.9):
 *   GET /api/settings/generation-overrides
 *     → { model_locked: boolean, model_value?: string }
 *
 * Added (15.17 — KV settings server-side persistence):
 *   GET    /api/settings              → { settings: { key: value, ... } }
 *   GET    /api/settings/:key         → { key, value }   |   404
 *   PUT    /api/settings/:key         → { key, value }   body: { value }
 *   DELETE /api/settings/:key         → 204 (idempotent)
 *
 * The 15.9 endpoint is kept verbatim and registered FIRST so the literal
 * `/generation-overrides` path is not shadowed by the `/:key` matcher.
 *
 * Persistence is delegated to `storage/settings.ts` (JSON file in MVP, SQLite
 * once Story 15.16 lands — API surface is stable across the migration).
 *
 * BYOK boundary (defensive bottom half): server hard-rejects any PUT whose
 * key looks like a BYOK key (`sf_anthropic_key*`) with 400 KEY_FORBIDDEN.
 * The client-side helpers in `src/api/settings.ts` carry the matching
 * top half — they refuse to send the request in the first place.
 */

import { Router, Request, Response } from 'express';
import {
  listSettings,
  getSetting,
  setSetting,
  deleteSetting,
} from '../storage/settings';

const router = Router();

// ── Story 15.9 — Generation overrides discovery (env-locked model) ───────────
router.get('/generation-overrides', (_req: Request, res: Response) => {
  const envModel = process.env.SHADOWFLOW_DEFAULT_MODEL;
  res.json({
    model_locked: Boolean(envModel),
    ...(envModel ? { model_value: envModel } : {}),
  });
});

// ── Story 15.17 — KV settings store ──────────────────────────────────────────

// GET /api/settings → { settings: { key: value, ... } }
// Always returns an object envelope (even when empty) so the client can
// distinguish a successful empty response from a malformed payload.
router.get('/', (_req: Request, res: Response) => {
  res.json({ settings: listSettings() });
});

// GET /api/settings/:key → { key, value } | 404
router.get('/:key', (req: Request, res: Response) => {
  const key = req.params.key;
  const value = getSetting(key);
  if (value === undefined) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'setting not found' },
    });
  }
  res.json({ key, value });
});

// PUT /api/settings/:key { value } → 200 { key, value }
//
// Body schema: { value: <any JSON-serialisable> }. The client is expected to
// JSON.stringify complex values into a string (per the 15.17 spec note: PUT
// body's `value` is treated as opaque), but we accept any JSON type and
// re-encode on disk so server-side typing matches what 15.16 will store in
// the SQLite TEXT column.
router.put('/:key', (req: Request, res: Response) => {
  const key = req.params.key;
  const body = (req.body ?? {}) as { value?: unknown };
  if (!('value' in body)) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: 'body must include `value`' },
    });
  }
  try {
    setSetting(key, body.value);
    res.json({ key, value: body.value });
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    if (code === 'KEY_FORBIDDEN') {
      return res.status(400).json({
        error: {
          code: 'KEY_FORBIDDEN',
          message: 'BYOK keys must stay client-only',
        },
      });
    }
    if (code === 'INVALID_KEY') {
      return res.status(400).json({
        error: { code: 'INVALID_KEY', message: 'key empty or > 128 chars' },
      });
    }
    if (code === 'VALUE_TOO_LARGE') {
      return res.status(413).json({
        error: { code: 'VALUE_TOO_LARGE', message: 'value exceeds 64KB cap' },
      });
    }
    return res.status(500).json({
      error: { code: 'INTERNAL', message: code },
    });
  }
});

// DELETE /api/settings/:key → 204
router.delete('/:key', (req: Request, res: Response) => {
  deleteSetting(req.params.key); // idempotent — ignore the boolean return
  res.status(204).send();
});

export default router;
