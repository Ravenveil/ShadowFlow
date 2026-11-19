/**
 * remote-sync.test.ts — POST /api/remote-exec/sync（远端产出一键拉回）。
 *
 * ssh 与 tar 一律 mock：
 *   - preflight 的 `sshExec` 用 vi.mock('../lib/ssh-exec') 换成固定输出；
 *   - 「远端 tar 流 → 本地解包」用 `__setStreamTarImplForTests` 注入假实现
 *     （真实现要 spawn ssh 与 tar，单测不碰）。
 *
 * 覆盖：未配置 / 参数校验 / 群不存在 / 正常落盘 / 文件数与体积上限 / 远端目录
 *       缺失 / 拉取失败 / remote_subdir 逃逸 / 群查询失败时的降级。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../storage/settings', () => {
  const store = new Map<string, unknown>();
  return {
    getSetting: (k: string) => store.get(k) ?? null,
    setSetting: (k: string, v: unknown) => { store.set(k, v); },
    deleteSetting: (k: string) => { store.delete(k); },
    listSettings: () => ({}),
    __store: store,
  };
});

vi.mock('../lib/ssh-exec', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ssh-exec')>();
  return {
    ...actual,
    sshExec: vi.fn(async () => ({
      code: 0,
      stdout: 'FILES 3\nBYTES 128\n',
      stderr: '',
      durationMs: 20,
    })),
  };
});

/** 群后端 mock：默认返回一个群；用例可换成「不存在」或「抛错」。 */
const groupState: { group: { group_id: string; workspace_dir: string | null } | null; throw: boolean } = {
  group: { group_id: 'g1', workspace_dir: null },
  throw: false,
};
vi.mock('../storage/groups-backend', () => ({
  getGroupsBackend: () => ({
    getGroup: async (id: string) => {
      if (groupState.throw) throw new Error('group store offline');
      return groupState.group && groupState.group.group_id === id ? groupState.group : null;
    },
  }),
}));

import remoteExecRouter from '../routes/system/remote-exec';
import { sshExec, SSH_CONFIG_KEY } from '../lib/ssh-exec';
import { setSetting } from '../storage/settings';
import { __setStreamTarImplForTests } from '../lib/remote-sync';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/remote-exec', remoteExecRouter);
  return a;
}

let chatDir = '';
const CONFIGURED = { host: 'gpu01', port: 22, user: 'ubuntu', remoteDir: '/work/proj' };

beforeEach(() => {
  chatDir = mkdtempSync(join(tmpdir(), 'sf-sync-'));
  process.env.SHADOWFLOW_CHAT_DIR = chatDir;
  setSetting(SSH_CONFIG_KEY, CONFIGURED);
  groupState.group = { group_id: 'g1', workspace_dir: null };
  groupState.throw = false;
  vi.mocked(sshExec).mockClear();
  vi.mocked(sshExec).mockResolvedValue({
    code: 0,
    stdout: 'FILES 3\nBYTES 128\n',
    stderr: '',
    durationMs: 20,
  });
  // 默认假实现：模拟 tar 落盘（写一个文件证明解包目录被用上了）。
  __setStreamTarImplForTests(async (_cfg, _cmd, destDir) => {
    writeFileSync(join(destDir, 'train.log'), 'epoch 1 loss 0.5\n');
    return { code: 0, stderr: '' };
  });
});

afterEach(() => {
  __setStreamTarImplForTests(null);
  delete process.env.SHADOWFLOW_CHAT_DIR;
  try { rmSync(chatDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('POST /api/remote-exec/sync · 前置校验', () => {
  it('未配置远端 → 400 SSH_NOT_CONFIGURED', async () => {
    setSetting(SSH_CONFIG_KEY, null);
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't1' })
      .expect(400);
    expect(res.body.error.code).toBe('SSH_NOT_CONFIGURED');
  });

  it('group_id / turn_id 缺失或带路径字符 → 400', async () => {
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ turn_id: 't1' }, 'INVALID_GROUP_ID'],
      [{ group_id: 'g1' }, 'INVALID_TURN_ID'],
      [{ group_id: '../etc', turn_id: 't1' }, 'INVALID_GROUP_ID'],
      [{ group_id: 'g1', turn_id: 'a/../../b' }, 'INVALID_TURN_ID'],
    ];
    for (const [body, code] of bad) {
      const res = await request(app()).post('/api/remote-exec/sync').send(body).expect(400);
      expect(res.body.error.code).toBe(code);
    }
    expect(sshExec).not.toHaveBeenCalled();
  });

  it('remote_subdir 逃出 remoteDir → 400 REMOTE_PATH_ESCAPE', async () => {
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't1', remote_subdir: '../../etc' })
      .expect(400);
    expect(res.body.error.code).toBe('REMOTE_PATH_ESCAPE');
    expect(sshExec).not.toHaveBeenCalled();
  });

  it('群不存在 → 404 GROUP_NOT_FOUND', async () => {
    groupState.group = null;
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't1' })
      .expect(404);
    expect(res.body.error.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('POST /api/remote-exec/sync · 正常落盘', () => {
  it('落到 <chatWorkspace>/remote/<turn_id>，文件真实可见', async () => {
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 'turn-abc' })
      .expect(200);

    const expectedDest = join(chatDir, 'chat-workspaces', 'g1', 'remote', 'turn-abc');
    expect(res.body.data).toMatchObject({ files: 3, bytes: 128 * 1024, dest: expectedDest });
    expect(existsSync(join(expectedDest, 'train.log'))).toBe(true);
  });

  it('群设了 workspace_dir 时落点跟随它（右栏文件树同源）', async () => {
    const userDir = mkdtempSync(join(tmpdir(), 'sf-ws-'));
    groupState.group = { group_id: 'g1', workspace_dir: userDir };
    try {
      const res = await request(app())
        .post('/api/remote-exec/sync')
        .send({ group_id: 'g1', turn_id: 't2' })
        .expect(200);
      expect(res.body.data.dest).toBe(join(userDir, 'remote', 't2'));
      expect(readdirSync(join(userDir, 'remote', 't2'))).toContain('train.log');
    } finally {
      rmSync(userDir, { recursive: true, force: true });
    }
  });

  it('remote_subdir 合法时透传给 tar 命令', async () => {
    let seenCmd = '';
    __setStreamTarImplForTests(async (_cfg, cmd, destDir) => {
      seenCmd = cmd;
      writeFileSync(join(destDir, 'fig.png'), 'x');
      return { code: 0, stderr: '' };
    });
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't3', remote_subdir: 'sf-runs/t3' })
      .expect(200);
    expect(seenCmd).toContain("cd -- 'sf-runs/t3' && tar -czf -");
    expect(res.body.data.remote_subdir).toBe('sf-runs/t3');
  });

  it('群查询失败时降级到 scratch 目录（不没收产出）', async () => {
    groupState.throw = true;
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't4' })
      .expect(200);
    expect(res.body.data.dest).toBe(join(chatDir, 'chat-workspaces', 'g1', 'remote', 't4'));
  });
});

describe('POST /api/remote-exec/sync · 上限与失败', () => {
  it('文件数超限 → 413 REMOTE_SYNC_TOO_LARGE 且不启动传输', async () => {
    vi.mocked(sshExec).mockResolvedValueOnce({
      code: 0,
      stdout: 'FILES 5000\nBYTES 10\n',
      stderr: '',
      durationMs: 5,
    });
    const streamCalls: string[] = [];
    __setStreamTarImplForTests(async (_cfg, _cmd, destDir) => {
      streamCalls.push(destDir);
      return { code: 0, stderr: '' };
    });
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't5' })
      .expect(413);
    expect(res.body.error.code).toBe('REMOTE_SYNC_TOO_LARGE');
    expect(res.body.error.message).toContain('5000');
    expect(streamCalls).toHaveLength(0);
  });

  it('体积超限 → 413 且提示先清理大文件', async () => {
    // 300 MiB > 200 MiB 上限
    vi.mocked(sshExec).mockResolvedValueOnce({
      code: 0,
      stdout: 'FILES 2\nBYTES 307200\n',
      stderr: '',
      durationMs: 5,
    });
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't6' })
      .expect(413);
    expect(res.body.error.code).toBe('REMOTE_SYNC_TOO_LARGE');
    expect(res.body.error.message).toContain('MiB');
  });

  it('远端目录不存在（SF_NO_DIR）→ 502 且提示目录', async () => {
    vi.mocked(sshExec).mockResolvedValueOnce({
      code: 0,
      stdout: 'SF_NO_DIR\n',
      stderr: '',
      durationMs: 5,
    });
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't7', remote_subdir: 'sf-runs/t7' })
      .expect(502);
    expect(res.body.error.code).toBe('REMOTE_SYNC_FAILED');
    expect(res.body.error.message).toContain('sf-runs/t7');
  });

  it('preflight 非零退出 / 输出无法解析 → 502', async () => {
    vi.mocked(sshExec).mockResolvedValueOnce({ code: 255, stdout: '', stderr: 'denied', durationMs: 4 });
    const a = await request(app()).post('/api/remote-exec/sync').send({ group_id: 'g1', turn_id: 't8' }).expect(502);
    expect(a.body.error.message).toContain('denied');

    vi.mocked(sshExec).mockResolvedValueOnce({ code: 0, stdout: 'garbage\n', stderr: '', durationMs: 4 });
    const b = await request(app()).post('/api/remote-exec/sync').send({ group_id: 'g1', turn_id: 't9' }).expect(502);
    expect(b.body.error.code).toBe('REMOTE_SYNC_FAILED');
  });

  it('tar 流失败 → 502 并带 stderr 摘要', async () => {
    __setStreamTarImplForTests(async () => ({ code: 2, stderr: 'tar: bad gzip magic' }));
    const res = await request(app())
      .post('/api/remote-exec/sync')
      .send({ group_id: 'g1', turn_id: 't10' })
      .expect(502);
    expect(res.body.error.code).toBe('REMOTE_SYNC_FAILED');
    expect(res.body.error.message).toContain('bad gzip magic');
  });
});
