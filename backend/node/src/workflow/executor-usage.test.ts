/**
 * workflow/executor-usage.test.ts — BE-07 executor 落库挂钩单测。
 *
 * 契约：executor 的 chunk 循环把「非 cumulative 的 usage chunk」逐条落
 * token_usage 流水——每条 = 一次模型调用，带 session_id / run_id（run-<sid
 * 前 8 位>）/ agent_id（node.id）/ project_id（run_index→conversations 反查，
 * fail-soft 空串）/ model / duration_ms。cumulative:true 的汇总快照只上
 * 展示线、跳过落库防双计。
 *
 * Transport 用 FakeCallable 直接产 usage TurnChunk（跳过传输折叠层——折叠
 * 语义在 transport/usage-folding.test.ts 独立锁定）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runDag } from './scheduler';
import type { TeamDefV1, TeamEdgeV1, TurnChunk, UsagePayload } from './types';
import type { LlmCallable } from '../transport/LlmCallable';
import * as sqlite from '../storage/sqlite';

// ─── Fixtures ────────────────────────────────────────────────────────────────

let origCwd: string;
let tmpDir: string;

beforeAll(() => {
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-exec-usage-'));
  process.chdir(tmpDir);
  sqlite._resetForTests();
  sqlite.getDb(); // boot schema in fresh cwd
});

afterAll(() => {
  sqlite._resetForTests();
  process.chdir(origCwd);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  sqlite.getDb().exec('DELETE FROM token_usage;');
});

/** 产出指定 usage chunk 序列的 FakeCallable（每个节点一轮）。 */
function usageCallable(usagePerNode: Record<string, Array<Partial<UsagePayload>>>): LlmCallable {
  return {
    id: 'fake-usage',
    capabilities: {
      supportsToolUse: false,
      supportsMultiTurn: false,
      supportsStreamingDelta: true,
    },
    async *turn(input: { prompt: string }): AsyncGenerator<TurnChunk> {
      const nodeId = input.prompt;
      yield { type: 'text-delta', value: `${nodeId}-output` };
      for (const usage of usagePerNode[nodeId] ?? []) {
        yield { type: 'usage', usage: usage as UsagePayload };
      }
      yield { type: 'done' };
    },
  };
}

function mkTeam(): TeamDefV1 {
  const agents = [
    {
      id: 'n1',
      title: 'n1',
      persona: 'You are n1.',
      model: { provider: 'anthropic', name: 'claude-sonnet-4-5' } as never,
      tools: { allowed: [] } as never,
      anchors: {} as never,
      source_file: 'n1.agent.md',
    },
    {
      id: 'n2',
      title: 'n2',
      persona: 'You are n2.',
      model: { provider: 'anthropic', name: 'claude-sonnet-4-5' } as never,
      tools: { allowed: [] } as never,
      anchors: {} as never,
      source_file: 'n2.agent.md',
    },
  ];
  const edges: TeamEdgeV1[] = [{ from: 'n1', to: 'n2' }];
  return {
    name: 'usage-team',
    mode: 'dag',
    policy: 'permissive',
    retry: 1,
    agents: agents as never,
    edges: edges.map((e) => ({ from: e.from, to: e.to })),
    loaded_at: 0,
    source_dir: '/fake',
    team_id: 'usage-team',
    version: 1,
    policy_obj: { retry: 1 },
    members_ids: ['n1', 'n2'],
    edges_v1: edges,
  };
}

async function drain(stream: AsyncGenerator<TurnChunk>): Promise<void> {
  for await (const _chunk of stream) {
    /* consume */
  }
}

interface UsageRow {
  session_id: string;
  run_id: string;
  agent_id: string;
  project_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

function rows(): UsageRow[] {
  return sqlite
    .getDb()
    .prepare(`SELECT session_id, run_id, agent_id, project_id, model, input_tokens, output_tokens, duration_ms FROM token_usage ORDER BY rowid`)
    .all() as UsageRow[];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('executor — usage 落库挂钩（BE-07）', () => {
  it('usage chunk 逐条落库，带 run_id / agent_id / 归因字段', async () => {
    const sessionId = 'sess-usage-0001';
    await drain(
      runDag(
        mkTeam(),
        usageCallable({
          n1: [{ input_tokens: 100, output_tokens: 20, model: 'm-x', duration_ms: 1200 }],
          n2: [{ input_tokens: 300, output_tokens: 30, model: 'm-y', duration_ms: 800 }],
        }),
        tmpDir,
        new AbortController().signal,
        undefined,
        sessionId,
      ),
    );

    const rs = rows();
    expect(rs).toHaveLength(2);
    expect(rs[0]).toMatchObject({
      session_id: sessionId,
      run_id: `run-${sessionId.slice(0, 8)}`,
      agent_id: 'n1',
      model: 'm-x',
      input_tokens: 100,
      output_tokens: 20,
      duration_ms: 1200,
    });
    expect(rs[1]).toMatchObject({
      session_id: sessionId,
      run_id: `run-${sessionId.slice(0, 8)}`,
      agent_id: 'n2',
      model: 'm-y',
      input_tokens: 300,
      output_tokens: 30,
      duration_ms: 800,
    });
  });

  it('一次调用多条 usage chunk 逐条落库（每次模型调用记录）', async () => {
    await drain(
      runDag(
        mkTeam(),
        usageCallable({
          n1: [
            { input_tokens: 10, output_tokens: 1, model: 'm1' },
            { input_tokens: 20, output_tokens: 2, model: 'm1' },
          ],
        }),
        tmpDir,
        new AbortController().signal,
        undefined,
        'sess-multi',
      ),
    );
    const rs = rows().filter((r) => r.agent_id === 'n1');
    expect(rs).toHaveLength(2);
    expect(rs.map((r) => r.input_tokens)).toEqual([10, 20]);
  });

  it('cumulative:true 汇总快照跳过落库（防双计）', async () => {
    await drain(
      runDag(
        mkTeam(),
        usageCallable({
          n1: [
            { input_tokens: 10, output_tokens: 1, model: 'm1' },
            // 多轮工具循环末尾的累计汇总——只上展示线
            { input_tokens: 10, output_tokens: 1, model: 'm1', cumulative: true },
          ],
        }),
        tmpDir,
        new AbortController().signal,
        undefined,
        'sess-cumul',
      ),
    );
    const rs = rows().filter((r) => r.agent_id === 'n1');
    expect(rs).toHaveLength(1);
    expect(rs[0].input_tokens).toBe(10);
  });

  it('project_id 经 run_index→conversations 反查归因；无映射 fail-soft 空串', async () => {
    const db = sqlite.getDb();
    db.prepare(
      `INSERT INTO projects (project_id, name, workspace_path, created_at, updated_at)
       VALUES ('proj-u', 'u', '/tmp/u', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO conversations (conversation_id, project_id, title, created_at, updated_at)
       VALUES ('conv-u', 'proj-u', 'main', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO run_index (session_id, conversation_id, goal, status, created_at, updated_at)
       VALUES ('sess-mapped', 'conv-u', 'g', 'done', 1, 1)`,
    ).run();

    await drain(
      runDag(
        mkTeam(),
        usageCallable({ n1: [{ input_tokens: 5, output_tokens: 5, model: 'm1' }] }),
        tmpDir,
        new AbortController().signal,
        undefined,
        'sess-mapped',
      ),
    );
    await drain(
      runDag(
        mkTeam(),
        usageCallable({ n1: [{ input_tokens: 5, output_tokens: 5, model: 'm1' }] }),
        tmpDir,
        new AbortController().signal,
        undefined,
        'sess-orphan',
      ),
    );

    const rs = rows();
    const mapped = rs.find((r) => r.session_id === 'sess-mapped');
    const orphan = rs.find((r) => r.session_id === 'sess-orphan');
    expect(mapped?.project_id).toBe('proj-u');
    expect(orphan?.project_id).toBe('');
  });
});
