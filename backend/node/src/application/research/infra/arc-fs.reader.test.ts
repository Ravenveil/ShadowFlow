/**
 * arc-fs.reader 测试 — 真实临时目录上的根解析（零外部依赖，跑完即删）。
 *
 * 两种产物根都要认：
 *   独立跑的 ARC  —— 根下直接是 rc-*（~/AutoResearchClaw/artifacts）
 *   经会话跑的 ARC —— run 落在会话工作目录的 artifacts/ 下一层（researchclaw/cli.py
 *                     的 `artifacts/<run_id>` 相对 cwd，而 cwd = 会话工作目录）
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createArcFsReader, defaultArcRoots } from './arc-fs.reader';

let tmp: string;

function put(root: string, rel: string, body = 'x'): string {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body, 'utf-8');
  return file;
}

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'arc-reader-'));
});

afterEach(() => {
  delete process.env.SHADOWFLOW_CHAT_DIR;
  delete process.env.ARC_ARTIFACTS_ROOTS;
});

describe('createArcFsReader 的根解析', () => {
  it('根下直接是 run 目录（独立跑）', async () => {
    const standalone = path.join(tmp, 'standalone');
    put(standalone, 'rc-20261125-151936-e339da/stage-01/goal.md', '# 目标');
    const reader = createArcFsReader([standalone]);
    expect(await reader.listRunIds()).toEqual(['rc-20261125-151936-e339da']);
    expect((await reader.readText('rc-20261125-151936-e339da', 'stage-01/goal.md', 4096))?.content).toBe('# 目标');
  });

  it('会话工作目录当根：run 在 artifacts/ 下一层也找得到（经会话跑）', async () => {
    const workspace = path.join(tmp, 'chat-workspaces', 'g1');
    put(workspace, 'artifacts/rc-20261126-000000-abc123/stage-01/goal.md', '# 会话内 run');
    put(workspace, '.shadowflow/notes.json', '{}');
    const reader = createArcFsReader([workspace]);
    expect(await reader.listRunIds()).toEqual(['rc-20261126-000000-abc123']);
    expect((await reader.readText('rc-20261126-000000-abc123', 'stage-01/goal.md', 4096))?.content).toBe('# 会话内 run');
  });

  it('会话还没跑过 ARC（没有 artifacts/）：空列表，不抛', async () => {
    const workspace = path.join(tmp, 'chat-workspaces', 'g-empty');
    mkdirSync(workspace, { recursive: true });
    expect(await createArcFsReader([workspace]).listRunIds()).toEqual([]);
    expect(await createArcFsReader([path.join(tmp, 'nope')]).listRunIds()).toEqual([]);
  });

  it('heartbeat 的 pid 探测：本进程 → 活着；不存在的 pid / 过期心跳 → 已终止；没有 pid → 未知', async () => {
    const root = path.join(tmp, 'liveness');
    const now = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const withHeartbeat = (runId: string, body: object) => {
      put(root, `${runId}/stage-01/goal.md`, '# x');
      put(root, `${runId}/heartbeat.json`, JSON.stringify(body));
    };
    withHeartbeat('rc-20261126-000010-alive', { pid: process.pid, last_stage: 1, timestamp: now });
    withHeartbeat('rc-20261126-000011-dead', { pid: 2147483644, last_stage: 1, timestamp: now });
    withHeartbeat('rc-20261126-000012-stale', { pid: process.pid, last_stage: 1, timestamp: twoDaysAgo });
    put(root, 'rc-20261126-000013-none/stage-01/goal.md', '# x');

    const reader = createArcFsReader([root]);
    expect((await reader.readStateFiles('rc-20261126-000010-alive')).heartbeatLive).toBe(true);
    expect((await reader.readStateFiles('rc-20261126-000011-dead')).heartbeatLive).toBe(false);
    expect((await reader.readStateFiles('rc-20261126-000012-stale')).heartbeatLive).toBe(false);
    expect((await reader.readStateFiles('rc-20261126-000013-none')).heartbeatLive).toBeNull();
  });
});

describe('defaultArcRoots 每次现算', () => {
  it('包含会话工作目录下的 artifacts，且服务启动后才出现的会话也能被下一次调用看到', () => {
    const chatRoot = path.join(tmp, 'chat-root');
    process.env.SHADOWFLOW_CHAT_DIR = chatRoot;
    const cwd = path.join(tmp, 'server-cwd');
    mkdirSync(cwd, { recursive: true });

    const early = path.join(chatRoot, 'chat-workspaces', 'early', 'artifacts');
    put(early, 'rc-20261126-000001-early/stage-01/goal.md');
    const before = defaultArcRoots(cwd);
    expect(before.map((p) => path.normalize(p))).toContain(path.normalize(early));

    // 启动之后才建出来的会话目录：冻结在模块加载时的清单会漏掉它
    const late = path.join(chatRoot, 'chat-workspaces', 'late', 'artifacts');
    put(late, 'rc-20261126-000002-late/stage-01/goal.md');
    expect(before.map((p) => path.normalize(p))).not.toContain(path.normalize(late));
    expect(defaultArcRoots(cwd).map((p) => path.normalize(p))).toContain(path.normalize(late));
  });

  it('env ARC_ARTIFACTS_ROOTS 里的额外根排在最前；不存在的目录被跳过', () => {
    const extra = path.join(tmp, 'mounted');
    put(extra, 'rc-20261126-000003-mount/stage-01/goal.md');
    process.env.ARC_ARTIFACTS_ROOTS = [path.join(tmp, 'gone'), extra].join(path.delimiter);
    const roots = defaultArcRoots(path.join(tmp, 'server-cwd')).map((p) => path.normalize(p));
    expect(roots[0]).toBe(path.normalize(extra));
    expect(roots.some((p) => p.includes(`${path.sep}gone`))).toBe(false);
    rmSync(tmp, { recursive: true, force: true });
  });
});
