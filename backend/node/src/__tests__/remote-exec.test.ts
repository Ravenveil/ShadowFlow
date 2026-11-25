/**
 * remote-exec.test.ts — 远程执行（SSH）配置/执行端点 + 规则层。
 *
 * 覆盖：
 *   - validateSshConfig：host/user 字符白名单、端口范围、可选字段省略
 *   - mergeSshConfig：私钥路径「未提供则保留原值」，clearKeyPath 显式清除
 *   - 路由：GET/PUT/DELETE config、POST /test（含"先测再存"）、POST /run
 *
 * ssh 子进程一律 mock —— 单测不依赖本机装了 OpenSSH，也不会真去连远端。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// settings 走内存 Map，避免测试污染真实 $CWD/.shadowflow/settings.json
vi.mock('../application/settings/infra-store', () => {
  const store = new Map<string, unknown>();
  return {
    getSetting: (k: string) => store.get(k) ?? null,
    setSetting: (k: string, v: unknown) => { store.set(k, v); },
    deleteSetting: (k: string) => { store.delete(k); },
    listSettings: () => ({}),
    __store: store,
  };
});

vi.mock('../application/adapters/ssh-exec.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../application/adapters/ssh-exec.ts')>();
  return {
    ...actual,
    sshProbe: vi.fn(async () => ({
      code: 0, ok: true, stdout: 'SF_OK\nLinux gpu01 6.1.0', stderr: '', durationMs: 12,
    })),
    sshExec: vi.fn(async () => ({
      code: 0, stdout: 'GPU 0: NVIDIA A100', stderr: '', durationMs: 34,
    })),
  };
});

import remoteExecRouter from '../application/adapters/remote-exec';
import {
  validateSshConfig,
  mergeSshConfig,
  readSshConfig,
  saveSshConfig,
  SSH_CONFIG_KEY,
  type SshConfig,
} from '../application/adapters/ssh-exec';
import { sshProbe, sshExec } from '../application/adapters/ssh-exec';
import { setSetting } from '../application/settings/infra-store';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/remote-exec', remoteExecRouter);
  return a;
}

const VALID = { host: '10.0.0.12', port: 2222, user: 'ubuntu' };

beforeEach(() => {
  setSetting(SSH_CONFIG_KEY, null);
  vi.mocked(sshProbe).mockClear();
  vi.mocked(sshExec).mockClear();
});

// ---------------------------------------------------------------------------
// 规则层
// ---------------------------------------------------------------------------

describe('validateSshConfig', () => {
  it('接受合法配置并归一端口为数字', () => {
    const { config, errors } = validateSshConfig({ host: ' gpu.example.com ', port: '22', user: ' me ' });
    expect(errors).toEqual([]);
    expect(config).toEqual({ host: 'gpu.example.com', port: 22, user: 'me' });
  });

  it('端口省略默认 22', () => {
    expect(validateSshConfig({ host: 'h', user: 'u' }).config?.port).toBe(22);
  });

  it('缺 host / user 报错', () => {
    const { config, errors } = validateSshConfig({ host: '  ', user: '' });
    expect(config).toBeNull();
    expect(errors).toEqual(['host 必填', 'user 必填']);
  });

  it('拒绝带 shell 元字符的 host（防注入到 ssh argv）', () => {
    expect(validateSshConfig({ host: 'a;rm -rf /', user: 'u' }).errors).toEqual(['host 含非法字符']);
  });

  it('拒绝带空格的 user', () => {
    expect(validateSshConfig({ host: 'h', user: 'a b' }).errors).toEqual(['user 含非法字符']);
  });

  it('端口越界与小数被拒', () => {
    expect(validateSshConfig({ host: 'h', user: 'u', port: 0 }).errors).toEqual(['port 必须是 1-65535 的整数']);
    expect(validateSshConfig({ host: 'h', user: 'u', port: 70000 }).errors).toEqual(['port 必须是 1-65535 的整数']);
    expect(validateSshConfig({ host: 'h', user: 'u', port: 22.5 }).errors).toEqual(['port 必须是 1-65535 的整数']);
  });

  it('keyPath / remoteDir 留空则不落字段（不是空串）', () => {
    const cfg = validateSshConfig({ host: 'h', user: 'u', keyPath: '  ', remoteDir: ' ' }).config;
    expect(cfg).not.toHaveProperty('keyPath');
    expect(cfg).not.toHaveProperty('remoteDir');
  });

  it('非对象直接拒绝', () => {
    expect(validateSshConfig(null).config).toBeNull();
    expect(validateSshConfig([]).config).toBeNull();
  });
});

describe('mergeSshConfig', () => {
  const prev: SshConfig = { host: 'old', port: 22, user: 'old', keyPath: '~/.ssh/id_ed25519', remoteDir: '/srv/p' };

  it('私钥留空 → 沿用旧值（前端掩码不回显）', () => {
    const merged = mergeSshConfig({ host: 'new', user: 'ubuntu', keyPath: '' }, prev);
    expect(merged.keyPath).toBe('~/.ssh/id_ed25519');
  });

  it('远端目录留空 → 沿用旧值', () => {
    expect(mergeSshConfig({ host: 'new', user: 'u' }, prev).remoteDir).toBe('/srv/p');
  });

  it('clearKeyPath: true → 显式清除私钥', () => {
    expect(mergeSshConfig({ host: 'new', user: 'u', clearKeyPath: true }, prev).keyPath).toBe('');
  });

  it('无旧配置时不凭空补字段', () => {
    expect(mergeSshConfig({ host: 'new', user: 'u' }, null)).toEqual({ host: 'new', user: 'u' });
  });
});

describe('saveSshConfig / readSshConfig', () => {
  it('保存后可读回；私钥未重填不清除', () => {
    saveSshConfig({ host: 'h1', user: 'u1', keyPath: '/k/id_rsa', remoteDir: '/proj' });
    expect(readSshConfig()).toEqual({ host: 'h1', port: 22, user: 'u1', keyPath: '/k/id_rsa', remoteDir: '/proj' });

    saveSshConfig({ host: 'h2', user: 'u2' });
    expect(readSshConfig()).toMatchObject({ host: 'h2', keyPath: '/k/id_rsa', remoteDir: '/proj' });
  });

  it('非法配置抛 INVALID_SSH_CONFIG 且不覆盖已有值', () => {
    saveSshConfig({ host: 'good', user: 'u' });
    expect(() => saveSshConfig({ host: 'bad host', user: 'u' }))
      .toThrowError(/host 含非法字符/);
    expect(readSshConfig()?.host).toBe('good');
  });
});

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------

describe('GET /api/remote-exec/config', () => {
  it('未配置返回 configured=false', async () => {
    const res = await request(app()).get('/api/remote-exec/config').expect(200);
    expect(res.body.data).toEqual({ configured: false, config: null });
  });

  it('已配置时私钥路径做掩码，不回显完整用户目录', async () => {
    saveSshConfig({ host: 'h', user: 'u', keyPath: '/home/me/.ssh/id_ed25519' });
    const res = await request(app()).get('/api/remote-exec/config').expect(200);
    expect(res.body.data.configured).toBe(true);
    expect(res.body.data.config.keyPathMasked).toBe('…/id_ed25519');
    expect(JSON.stringify(res.body)).not.toContain('/home/me');
  });

  it('没有私钥时 keyPathMasked 为 null', async () => {
    saveSshConfig(VALID);
    const res = await request(app()).get('/api/remote-exec/config').expect(200);
    expect(res.body.data.config.keyPathMasked).toBeNull();
  });
});

describe('PUT /api/remote-exec/config', () => {
  it('保存合法配置', async () => {
    const res = await request(app())
      .put('/api/remote-exec/config')
      .send({ host: 'gpu01', port: 22, user: 'ubuntu', remoteDir: '/work' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      configured: true,
      config: { host: 'gpu01', port: 22, user: 'ubuntu', remoteDir: '/work' },
    });
  });

  it('非法配置 400 INVALID_SSH_CONFIG', async () => {
    const res = await request(app())
      .put('/api/remote-exec/config')
      .send({ host: 'a b', user: 'u' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_SSH_CONFIG');
  });
});

describe('DELETE /api/remote-exec/config', () => {
  it('清除后回到未配置', async () => {
    saveSshConfig(VALID);
    const res = await request(app()).delete('/api/remote-exec/config').expect(200);
    expect(res.body.data.configured).toBe(false);
    expect(readSshConfig()).toBeNull();
  });
});

describe('POST /api/remote-exec/test', () => {
  it('从未保存过也能用表单值先测再存（不 400）', async () => {
    const res = await request(app())
      .post('/api/remote-exec/test')
      .send({ host: 'gpu01', port: 22, user: 'ubuntu' })
      .expect(200);
    expect(res.body.data.ok).toBe(true);
    expect(sshProbe).toHaveBeenCalledTimes(1);
    // 只测不落库
    expect(readSshConfig()).toBeNull();
  });

  it('表单没填私钥时沿用已存私钥再测', async () => {
    saveSshConfig({ host: 'gpu01', user: 'ubuntu', keyPath: '~/.ssh/k1' });
    await request(app())
      .post('/api/remote-exec/test')
      .send({ host: 'gpu01', user: 'ubuntu', keyPath: '' })
      .expect(200);
    const argv = vi.mocked(sshProbe).mock.calls[0][0];
    expect(argv.keyPath).toBe('~/.ssh/k1');
    expect(argv.host).toBe('gpu01');
  });

  it('既没保存也没传 host → 400 SSH_NOT_CONFIGURED', async () => {
    const res = await request(app()).post('/api/remote-exec/test').send({}).expect(400);
    expect(res.body.error.code).toBe('SSH_NOT_CONFIGURED');
  });

  it('表单值非法 → 400 并带具体原因', async () => {
    const res = await request(app())
      .post('/api/remote-exec/test')
      .send({ host: 'bad host', user: 'u' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_SSH_CONFIG');
    expect(res.body.error.message).toContain('host 含非法字符');
    expect(sshProbe).not.toHaveBeenCalled();
  });
});

describe('POST /api/remote-exec/run', () => {
  it('未配置 → 400', async () => {
    const res = await request(app())
      .post('/api/remote-exec/run')
      .send({ command: 'nvidia-smi' })
      .expect(400);
    expect(res.body.error.code).toBe('SSH_NOT_CONFIGURED');
  });

  it('command 为空 → 400', async () => {
    saveSshConfig(VALID);
    const res = await request(app())
      .post('/api/remote-exec/run')
      .send({ command: '   ' })
      .expect(400);
    expect(res.body.error.code).toBe('COMMAND_REQUIRED');
  });

  it('正常执行返回 stdout 与退出码', async () => {
    saveSshConfig(VALID);
    const res = await request(app())
      .post('/api/remote-exec/run')
      .send({ command: 'nvidia-smi -L', timeoutMs: 5000 })
      .expect(200);
    expect(res.body.data).toMatchObject({ ok: true, code: 0, stdout: 'GPU 0: NVIDIA A100' });
    const [, cmd, opts] = vi.mocked(sshExec).mock.calls[0];
    expect(cmd).toBe('nvidia-smi -L');
    expect(opts?.timeoutMs).toBe(5000);
  });

  it('非零退出码 ok=false 但仍 200（业务失败不是请求错误）', async () => {
    saveSshConfig(VALID);
    vi.mocked(sshExec).mockResolvedValueOnce({ code: 127, stdout: '', stderr: 'command not found', durationMs: 3 });
    const res = await request(app())
      .post('/api/remote-exec/run')
      .send({ command: 'nope' })
      .expect(200);
    expect(res.body.data).toMatchObject({ ok: false, code: 127, stderr: 'command not found' });
  });
});
