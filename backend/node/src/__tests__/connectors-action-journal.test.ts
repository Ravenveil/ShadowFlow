/**
 * OpenBot 对齐批（2026-11-07）— 连接器注册表 + 行动留痕整合测试。
 *
 * 覆盖三块（对应本轮后端升级的「执行前裁定 + 执行后留痕」闭环）：
 *   1. GET /api/connectors + POST /:id/policy + /refresh — 注册表与策略持久化
 *   2. action-journal — decided/recorded 成对留痕、过滤、limit、坏行 fail-soft
 *   3. ToolRunner.dispatch — 权限裁定落定后写 decided 帧、派发收尾写 recorded 帧
 *   4. GET /api/actions — 留痕查询过滤（session_id / tool_name / phase）
 *
 * 隔离：acp-detector 全 mock（不扫 PATH/TCP）；settings.json 落 tmp cwd；
 * 留痕走 SF_ACTION_JOURNAL_PATH 指到 tmp。
 */
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../detectors/acp-detector', () => ({
  getCachedAcpSnapshot: () => null,
  detectAcpAgents: vi.fn().mockResolvedValue({
    scanned_at: '2026-11-07T00:00:00Z',
    items: [
      {
        id: 'hermes',
        type: 'acp',
        binary: 'hermes',
        args: ['acp'],
        installed: true,
        transport: 'stdio',
        path: '/usr/bin/hermes',
        last_checked: '2026-11-07T00:00:00Z',
        capabilities: ['tools', 'prompts'],
      },
      {
        id: 'figma-mcp',
        type: 'mcp',
        binary: 'figma-mcp',
        args: [],
        installed: false,
        transport: 'unreachable',
        path: null,
        last_checked: '2026-11-07T00:00:00Z',
      },
    ],
  }),
}));

import connectorsRouter from '../routes/system/connectors';
import actionsRouter from '../routes/system/actions';
import { recordAction, listActions, type ActionJournalEntry } from '../lib/action-journal';
import { getConnectorPolicy, coerceConnectorIds } from '../lib/connector-registry';
import {
  ToolRunner,
  registerToolExecutor,
  _resetToolExecutorsForTests,
} from '../lib/tool-runner';
import { ToolRegistry } from '../lib/tool-spec';
import { PermissionPolicyV2 } from '../lib/permission-policy-v2';

interface HttpResp {
  status: number;
  body: unknown;
}

function reqJson(
  port: number,
  method: 'GET' | 'POST',
  urlPath: string,
  body?: Record<string, unknown>,
): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers:
          data !== undefined
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
              }
            : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

describe('OpenBot 对齐批 — 连接器注册表 + 行动留痕', () => {
  let tmp: string;
  let origCwd: string;
  let origJournalEnv: string | undefined;
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    origCwd = process.cwd();
    origJournalEnv = process.env.SF_ACTION_JOURNAL_PATH;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-openbot-'));
    process.chdir(tmp);
    process.env.SF_ACTION_JOURNAL_PATH = path.join(tmp, 'action-journal.jsonl');

    const app = express();
    app.use(express.json());
    app.use('/api/connectors', connectorsRouter);
    app.use('/api/actions', actionsRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const addr = server.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  });

  afterAll(() => {
    server.close();
    process.chdir(origCwd);
    if (origJournalEnv === undefined) delete process.env.SF_ACTION_JOURNAL_PATH;
    else process.env.SF_ACTION_JOURNAL_PATH = origJournalEnv;
  });

  // ── 1. 连接器注册表 ─────────────────────────────────────────────────────────

  it('GET /api/connectors — 归一列表 + 默认策略 + 状态映射', async () => {
    const r = await reqJson(port, 'GET', '/api/connectors');
    expect(r.status).toBe(200);
    const body = r.body as {
      scanned_at: string;
      items: Array<{
        id: string;
        kind: string;
        status: string;
        policy: { enabled: boolean; approval_mode: string };
      }>;
    };
    expect(body.items).toHaveLength(2);
    const hermes = body.items.find((i) => i.id === 'hermes')!;
    const figma = body.items.find((i) => i.id === 'figma-mcp')!;
    expect(hermes.kind).toBe('acp');
    expect(hermes.status).toBe('connected');
    expect(hermes.policy).toEqual({ enabled: true, approval_mode: 'auto' });
    expect(figma.kind).toBe('mcp');
    expect(figma.status).toBe('disconnected');
  });

  it('POST /api/connectors/:id/policy — 策略持久化 + connector.policy 留痕', async () => {
    const r = await reqJson(port, 'POST', '/api/connectors/hermes/policy', {
      approval_mode: 'prompt',
      enabled: false,
    });
    expect(r.status).toBe(200);
    expect((r.body as { policy: unknown }).policy).toEqual({
      enabled: false,
      approval_mode: 'prompt',
    });
    // registry 侧读回一致（写穿 settings.json）
    expect(getConnectorPolicy('hermes')).toEqual({ enabled: false, approval_mode: 'prompt' });
    // 策略变更 = 执行前裁定事件，入 action-journal
    const entries = listActions({ toolName: 'connector.policy' });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].phase).toBe('decided');
    expect(entries[0].detail).toMatchObject({ connector_id: 'hermes' });
  });

  it('POST /api/connectors/:id/policy — 空 patch / 非法 approval_mode → 400', async () => {
    const empty = await reqJson(port, 'POST', '/api/connectors/hermes/policy', {});
    expect(empty.status).toBe(400);
    const bad = await reqJson(port, 'POST', '/api/connectors/hermes/policy', {
      approval_mode: 'yolo',
    });
    expect(bad.status).toBe(400);
  });

  it('POST /api/connectors/refresh — 强制重扫返回新快照', async () => {
    const r = await reqJson(port, 'POST', '/api/connectors/refresh');
    expect(r.status).toBe(200);
    expect((r.body as { items: unknown[] }).items).toHaveLength(2);
  });

  // ── 2. action-journal 留痕 ─────────────────────────────────────────────────

  it('decided + recorded 成对留痕，过滤与 limit 生效', () => {
    const sessionId = 'sess-journal-1';
    recordAction({
      session_id: sessionId,
      tool_name: 'fs.write',
      phase: 'decided',
      decision: 'approve',
      detail: { input: '/tmp/a.txt' },
    });
    recordAction({
      session_id: sessionId,
      tool_name: 'fs.write',
      phase: 'recorded',
      ok: true,
      duration_ms: 12,
    });
    recordAction({
      session_id: 'sess-other',
      tool_name: 'fs.read',
      phase: 'decided',
      decision: 'auto',
    });

    const bySession = listActions({ sessionId });
    expect(bySession).toHaveLength(2);
    // 新→旧排序
    expect(bySession[0].phase).toBe('recorded');
    expect(bySession[1].phase).toBe('decided');
    expect(bySession[1].decision).toBe('approve');

    const decidedOnly = listActions({ sessionId, phase: 'decided' });
    expect(decidedOnly).toHaveLength(1);

    const limited = listActions({ limit: 1 });
    expect(limited).toHaveLength(1);

    const byTool = listActions({ toolName: 'fs.read' });
    expect(byTool).toHaveLength(1);
    expect(byTool[0].session_id).toBe('sess-other');
  });

  it('坏行 fail-soft：损坏的 JSONL 行被跳过', () => {
    const file = process.env.SF_ACTION_JOURNAL_PATH!;
    fs.appendFileSync(file, 'not-json-at-all\n', 'utf8');
    const entries = listActions({ limit: 1000 });
    expect(entries.every((e: ActionJournalEntry) => typeof e.tool_name === 'string')).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it('coerceConnectorIds — 去重 / 去空 / 截断 / 类型过滤', () => {
    expect(coerceConnectorIds(['a', 'a', ' b ', '', 42, null])).toEqual(['a', 'b']);
    expect(coerceConnectorIds('nope')).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`);
    expect(coerceConnectorIds(many)).toHaveLength(32);
  });

  // ── 3. ToolRunner 挂钩：decided 先行 / recorded 收尾 ─────────────────────────

  it('ToolRunner.dispatch — 每次派发写 decided + recorded 成对留痕', async () => {
    _resetToolExecutorsForTests();
    const registry = new ToolRegistry([
      { name: 'test_tool', description: 'test', input_schema: {}, source: 'base' },
    ]);
    const policy = new PermissionPolicyV2({ allowedTools: ['test_tool'] });
    registerToolExecutor('test_tool', {
      execute: async () => ({ output: { ok: true }, isError: false }),
    });
    const runner = new ToolRunner(registry, policy);
    const before = listActions({ toolName: 'test_tool' }).length;

    const result = await runner.dispatch(
      { name: 'test_tool', input: { q: 'hi' } },
      new AbortController().signal,
      { sessionId: 'sess-dispatch' },
    );
    expect(result.isError).toBe(false);

    const entries = listActions({ toolName: 'test_tool', sessionId: 'sess-dispatch' });
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.phase === 'decided')).toMatchObject({
      decision: 'auto',
      tool_name: 'test_tool',
    });
    expect(entries.find((e) => e.phase === 'recorded')).toMatchObject({
      ok: true,
      tool_name: 'test_tool',
    });
    // 决策帧必须不晚于结果帧（decided before, recorded after）
    const decided = entries.find((e) => e.phase === 'decided')!;
    const recorded = entries.find((e) => e.phase === 'recorded')!;
    expect(recorded.ts).toBeGreaterThanOrEqual(decided.ts);
    expect(listActions({ toolName: 'test_tool' }).length).toBe(before + 2);
    _resetToolExecutorsForTests();
  });

  // ── 4. GET /api/actions 查询 ───────────────────────────────────────────────

  it('GET /api/actions — session_id / tool_name / phase 过滤', async () => {
    const r = await reqJson(
      port,
      'GET',
      '/api/actions?session_id=sess-journal-1&phase=decided',
    );
    expect(r.status).toBe(200);
    const entries = (r.body as { entries: ActionJournalEntry[] }).entries;
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.every((e) => e.session_id === 'sess-journal-1' && e.phase === 'decided')).toBe(
      true,
    );

    const r2 = await reqJson(port, 'GET', '/api/actions?tool_name=connector.policy');
    const entries2 = (r2.body as { entries: ActionJournalEntry[] }).entries;
    expect(entries2.every((e) => e.tool_name === 'connector.policy')).toBe(true);
  });
});
