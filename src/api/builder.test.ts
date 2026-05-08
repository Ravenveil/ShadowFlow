/**
 * Tests for src/api/builder.ts — Story 8.2 (AC7)
 *
 * Verifies envelope unwrap, validation error handling, and general error passthrough.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBlueprint, BuilderApiError } from './builder';
import type { BuilderGenerateRequest } from '../common/types/agent-builder';

const BASE_REQ: BuilderGenerateRequest = {
  goal: 'Research coding agents and produce a weekly digest',
  mode: 'team',
};

function makeMockBlueprint() {
  return {
    blueprint_id: 'bp-1',
    version: '1',
    name: 'Coding Research Digest',
    goal: BASE_REQ.goal,
    audience: '',
    mode: 'team' as const,
    role_profiles: [],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session' as const, writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none' as const, visibility: 'private' as const, publish_ref: '', metadata: {} },
    metadata: {},
  };
}

describe('generateBlueprint — envelope unwrap (AC7)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined);
  });

  it('returns data and meta on 200 success', async () => {
    const blueprint = makeMockBlueprint();
    const envelope = {
      data: blueprint,
      meta: { confidence: 0.72, missing_inputs: ['No documents'], suggested_next_step: 'scene', source: 'heuristic' },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(envelope),
      }),
    );

    const result = await generateBlueprint(BASE_REQ);
    expect(result.data.blueprint_id).toBe('bp-1');
    expect(result.meta.confidence).toBe(0.72);
    expect(result.meta.missing_inputs).toHaveLength(1);
    expect(result.meta.suggested_next_step).toBe('scene');
    // P7: AC3 requires meta.source to be present
    expect((result.meta as Record<string, unknown>)['source']).toBe('heuristic');
  });

  it('throws BuilderApiError(422) on validation failure', async () => {
    expect.assertions(3);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('{"detail":"goal too short"}'),
      }),
    );

    await expect(generateBlueprint(BASE_REQ)).rejects.toThrow(BuilderApiError);
    try {
      await generateBlueprint(BASE_REQ);
    } catch (err) {
      expect(err).toBeInstanceOf(BuilderApiError);
      expect((err as BuilderApiError).status).toBe(422);
    }
  });

  it('throws BuilderApiError(500) on server error', async () => {
    expect.assertions(2);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }),
    );

    await expect(generateBlueprint(BASE_REQ)).rejects.toThrow(BuilderApiError);
    try {
      await generateBlueprint(BASE_REQ);
    } catch (err) {
      expect((err as BuilderApiError).status).toBe(500);
    }
  });

  it('passes general error message through detail field', async () => {
    expect.assertions(1);
    const errBody = { error: { code: 'blueprint_error', message: '生成失败' } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify(errBody)),
      }),
    );

    try {
      await generateBlueprint(BASE_REQ);
    } catch (err) {
      expect((err as BuilderApiError).detail).toMatchObject(errBody);
    }
  });
});
