/**
 * orchestrator-parse.test.ts — INTENT_PARSE 拆解器纯函数 + LLM 调用路径。
 * compose/parse 全纯函数直测；decomposeWithLlm 用注入 callImpl mock
 * （无需真实 key / 网络）。
 */
import { describe, expect, it } from 'vitest';
import type { ProviderChunk } from '../../transport/api-clients';
import {
  composeParsePrompt,
  decomposeWithLlm,
  parseOrchestratorJson,
  type OrchestratorAgent,
} from '../orchestrator-parse';

const AGENTS: OrchestratorAgent[] = [
  { id: 'writer', name: 'Writer', soul: '前端文案' },
  { id: 'reviewer', name: 'Reviewer', soul: '审校' },
  { id: 'ops', name: 'Ops', soul: '发布' },
];

describe('composeParsePrompt', () => {
  it('embeds the roster with ids/names/souls and the user text', () => {
    const p = composeParsePrompt('做个落地页', AGENTS);
    expect(p).toContain('id: writer');
    expect(p).toContain('name: Writer');
    expect(p).toContain('做个落地页');
    expect(p).toContain('JSON');
  });
});

describe('parseOrchestratorJson', () => {
  it('parses a clean JSON array', () => {
    const raw = JSON.stringify([
      { agentId: 'writer', title: '写文案', prompt: '写落地页主文案' },
      { agentId: 'reviewer', title: '审校', prompt: '审以上文案', depends_on: ['writer'] },
    ]);
    const tasks = parseOrchestratorJson(raw, AGENTS)!;
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ agentId: 'writer', title: '写文案' });
    expect(tasks[1]!.depends_on).toEqual(['writer']);
  });

  it('tolerates ```json fences and surrounding prose', () => {
    const raw = '好的，拆解如下：\n```json\n[{"agentId":"ops","title":"发布","prompt":"发布到生产"}]\n```\n以上。';
    const tasks = parseOrchestratorJson(raw, AGENTS)!;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.agentId).toBe('ops');
  });

  it('drops unknown agents and duplicate assignments (first wins)', () => {
    const raw = JSON.stringify([
      { agentId: 'ghost', title: 'x', prompt: 'y' },
      { agentId: 'writer', title: '第一', prompt: 'p1' },
      { agentId: 'writer', title: '第二', prompt: 'p2' },
    ]);
    const tasks = parseOrchestratorJson(raw, AGENTS)!;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe('第一');
  });

  it('falls back to prompt head when title missing; clamps long titles', () => {
    const raw = JSON.stringify([{ agentId: 'writer', prompt: '这是一段非常长的指令内容'.repeat(3) }]);
    const tasks = parseOrchestratorJson(raw, AGENTS)!;
    expect(tasks[0]!.title.length).toBeLessThanOrEqual(40);
  });

  it('returns null for garbage / empty / non-array', () => {
    expect(parseOrchestratorJson('', AGENTS)).toBeNull();
    expect(parseOrchestratorJson('not json at all', AGENTS)).toBeNull();
    expect(parseOrchestratorJson('{"a":1}', AGENTS)).toBeNull();
    expect(parseOrchestratorJson('[]', AGENTS)).toBeNull();
  });
});

describe('decomposeWithLlm', () => {
  function mockCall(chunks: ProviderChunk[]) {
    return async function* (): AsyncGenerator<ProviderChunk> {
      for (const c of chunks) yield c;
    } as unknown as typeof import('../../transport/api-clients').callProvider;
  }

  it('returns parsed tasks from streamed text-deltas', async () => {
    const json = JSON.stringify([{ agentId: 'writer', title: '写', prompt: '写主文案' }]);
    const tasks = await decomposeWithLlm({
      userText: '做个落地页',
      agents: AGENTS,
      provider: 'anthropic',
      apiKey: 'sk-test',
      callImpl: mockCall([
        { type: 'text-delta', text: '```json\n' },
        { type: 'text-delta', text: json },
        { type: 'text-delta', text: '\n```' },
        { type: 'end' },
      ]),
    });
    expect(tasks).toHaveLength(1);
    expect(tasks![0]!.agentId).toBe('writer');
  });

  it('returns null without an api key (graceful degradation)', async () => {
    expect(
      await decomposeWithLlm({ userText: 'x', agents: AGENTS, provider: 'anthropic' }),
    ).toBeNull();
  });

  it('returns null on provider error chunk', async () => {
    expect(
      await decomposeWithLlm({
        userText: 'x',
        agents: AGENTS,
        provider: 'anthropic',
        apiKey: 'sk-bad',
        callImpl: mockCall([{ type: 'error', message: '401' }]),
      }),
    ).toBeNull();
  });

  it('returns null when the LLM output is unparseable', async () => {
    expect(
      await decomposeWithLlm({
        userText: 'x',
        agents: AGENTS,
        provider: 'anthropic',
        apiKey: 'sk-test',
        callImpl: mockCall([
          { type: 'text-delta', text: '抱歉我无法' },
          { type: 'end' },
        ]),
      }),
    ).toBeNull();
  });
});
