/**
 * remote-shell.test.ts — `remote_shell` 执行器（SSH 远端执行工具）。
 *
 * ssh 一律 mock：单测不依赖本机装了 OpenSSH，也绝不真去连远端。
 * 覆盖：未配置 / 白名单二次闸 / 远端黑名单 / cwd 逃逸 / 正常返回 /
 *       超时与取消码 / 输出截断 / ssh 启动失败。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../adapters/ssh-exec.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../adapters/ssh-exec.ts')>();
  return {
    ...actual,
    readSshConfig: vi.fn(() => ({ host: 'gpu01', port: 22, user: 'ubuntu', remoteDir: '/work/proj' })),
    sshExec: vi.fn(async () => ({ code: 0, stdout: 'ok', stderr: '', durationMs: 7 })),
  };
});

import { remoteShellExecutor, REMOTE_SHELL_MAX_TIMEOUT_MS } from '../remote-shell';
import { readSshConfig, sshExec } from '../../../../adapters/ssh-exec';

function ctx(allowed: string[] | undefined = ['remote_shell']) {
  return {
    workspace: process.cwd(),
    signal: new AbortController().signal,
    ...(allowed ? { allowedTools: new Set(allowed) } : {}),
  };
}

beforeEach(() => {
  vi.mocked(readSshConfig).mockReturnValue({
    host: 'gpu01',
    port: 22,
    user: 'ubuntu',
    remoteDir: '/work/proj',
  });
  vi.mocked(sshExec).mockClear();
  vi.mocked(sshExec).mockResolvedValue({ code: 0, stdout: 'ok', stderr: '', durationMs: 7 });
});

describe('remote_shell · 前置闸', () => {
  it('未配置远端主机 → isError 且给出可操作提示（不调用 ssh）', async () => {
    vi.mocked(readSshConfig).mockReturnValue(null);
    const r = await remoteShellExecutor({ command: 'ls' }, ctx());
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.output)).toContain('尚未配置远程主机');
    expect(sshExec).not.toHaveBeenCalled();
  });

  it('agent 白名单不含 remote_shell → 拒（即使权限策略配错）', async () => {
    const r = await remoteShellExecutor({ command: 'ls' }, ctx(['read_file']));
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.output)).toContain('allowed-tools');
    expect(sshExec).not.toHaveBeenCalled();
  });

  it('input 不合法 → 拒', async () => {
    for (const bad of [null, {}, { command: 123 }, { command: '   ' }, { command: 'a\0b' }]) {
      const r = await remoteShellExecutor(bad, ctx());
      expect(r.isError).toBe(true);
    }
    expect(sshExec).not.toHaveBeenCalled();
  });

  it('超长命令（>8KiB）→ 拒', async () => {
    const r = await remoteShellExecutor({ command: 'x'.repeat(8193) }, ctx());
    expect(r.isError).toBe(true);
    expect(sshExec).not.toHaveBeenCalled();
  });
});

describe('remote_shell · 远端黑名单', () => {
  it.each([
    ['pip install numpy', 'pip install'],
    ['git push origin main', 'git push'],
    ['ssh other-node nvidia-smi', '跳机器'],
    ['printenv', 'printenv'],
    ['sudo ls', 'sudo'],
  ])('%j 被拒且不连远端', async (command, needle) => {
    const r = await remoteShellExecutor({ command }, ctx());
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.output)).toContain(needle);
    expect(sshExec).not.toHaveBeenCalled();
  });

  it('集群调度命令放行（sbatch）', async () => {
    const r = await remoteShellExecutor({ command: 'sbatch --gpus=1 run.sh' }, ctx());
    expect(r.isError).toBe(false);
    expect(sshExec).toHaveBeenCalledTimes(1);
  });
});

describe('remote_shell · cwd 沙箱', () => {
  it.each(['..', '../etc', '/etc', '~/secrets', 'a/../../b'])(
    'cwd=%j 逃出 remoteDir → 拒',
    async (cwd) => {
      const r = await remoteShellExecutor({ command: 'ls', cwd }, ctx());
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r.output)).toContain('remote_shell blocked');
      expect(sshExec).not.toHaveBeenCalled();
    },
  );

  it('合法 cwd 拼成 `cd -- <cwd> && cmd`（再用 sshExec 的 remoteDir 兜底）', async () => {
    const r = await remoteShellExecutor({ command: 'ls -la', cwd: 'logs' }, ctx());
    expect(r.isError).toBe(false);
    const [, cmd] = vi.mocked(sshExec).mock.calls[0];
    expect(cmd).toBe("cd -- 'logs' && ls -la");
  });

  it('cwd 带空格时单引号包裹（远端 shell 安全）', async () => {
    await remoteShellExecutor({ command: 'ls', cwd: 'my logs' }, ctx());
    const [, cmd] = vi.mocked(sshExec).mock.calls[0];
    expect(cmd).toBe("cd -- 'my logs' && ls");
  });
});

describe('remote_shell · 结果映射', () => {
  it('正常返回带 exit_code / duration / remote_dir', async () => {
    vi.mocked(sshExec).mockResolvedValue({ code: 0, stdout: 'GPU 0: A100', stderr: '', durationMs: 42 });
    const r = await remoteShellExecutor({ command: 'nvidia-smi -L' }, ctx());
    expect(r.isError).toBe(false);
    expect(r.output).toMatchObject({
      command: 'nvidia-smi -L',
      exit_code: 0,
      stdout: 'GPU 0: A100',
      duration_ms: 42,
      timed_out: false,
      cancelled: false,
      truncated: false,
      remote_dir: '/work/proj',
    });
  });

  it('非零退出码 → isError（业务失败不是崩溃）', async () => {
    vi.mocked(sshExec).mockResolvedValue({
      code: 127,
      stdout: '',
      stderr: 'bash: x: command not found',
      durationMs: 5,
    });
    const r = await remoteShellExecutor({ command: 'x' }, ctx());
    expect(r.isError).toBe(true);
    expect(r.output).toMatchObject({ exit_code: 127, stderr: 'bash: x: command not found' });
  });

  it('超时 124 / 取消 130 各有标记', async () => {
    vi.mocked(sshExec).mockResolvedValue({ code: 124, stdout: '', stderr: 'timeout', durationMs: 120_000 });
    const t = await remoteShellExecutor({ command: 'sleep 999' }, ctx());
    expect(t.output).toMatchObject({ timed_out: true, cancelled: false });

    vi.mocked(sshExec).mockResolvedValue({ code: 130, stdout: '', stderr: 'cancel', durationMs: 10 });
    const c = await remoteShellExecutor({ command: 'sleep 999' }, ctx());
    expect(c.output).toMatchObject({ timed_out: false, cancelled: true });
  });

  it('timeout_ms 被夹到 1s..120s', async () => {
    await remoteShellExecutor({ command: 'ls', timeout_ms: 999_999 }, ctx());
    const [, , opts] = vi.mocked(sshExec).mock.calls[0];
    expect(opts?.timeoutMs).toBe(REMOTE_SHELL_MAX_TIMEOUT_MS);

    await remoteShellExecutor({ command: 'ls', timeout_ms: 1 }, ctx());
    const [, , opts2] = vi.mocked(sshExec).mock.calls[1];
    expect(opts2?.timeoutMs).toBe(1_000);
  });

  it('超 256 KiB 输出被截断并置 truncated', async () => {
    vi.mocked(sshExec).mockResolvedValue({
      code: 0,
      stdout: 'x'.repeat(300 * 1024),
      stderr: '',
      durationMs: 3,
    });
    const r = await remoteShellExecutor({ command: 'cat big.log' }, ctx());
    expect(r.output).toMatchObject({ truncated: true });
    expect((r.output as { stdout: string }).stdout.length).toBeLessThanOrEqual(256 * 1024);
  });

  it('ssh 二进制缺失（ENOENT）→ 结构化错误而不是抛异常', async () => {
    const missing = Object.assign(new Error('spawn ssh ENOENT'), { code: 'SSH_BINARY_MISSING' });
    vi.mocked(sshExec).mockRejectedValueOnce(missing);
    const r = await remoteShellExecutor({ command: 'ls' }, ctx());
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.output)).toContain('SSH_BINARY_MISSING');
  });
});
