/**
 * servers 用例单测 —— 证明依赖倒置成立：
 * 注入内存 repo + fake probe，不启 server、不碰磁盘、不 import infra。
 */
import { describe, it, expect } from 'vitest';
import type { McpServer, ProbeResult } from '../mcp-model';
import type { McpRepository } from '../mcp-repository';
import {
  createServer,
  deleteServer,
  listServers,
  probeAdHoc,
  probeByName,
  updateServer,
  type McpDeps,
  type Result,
} from './servers';

const NOW = '2026-11-26T00:00:00.000Z';

class InMemoryMcpRepo implements McpRepository {
  servers: McpServer[] = [];
  raw: Record<string, unknown> = { version: 1 };
  writes = 0;

  async readAll(): Promise<{ servers: McpServer[]; raw: Record<string, unknown> }> {
    return {
      servers: this.servers.map((s) => ({ ...s, args: [...s.args], env: { ...s.env } })),
      raw: { ...this.raw },
    };
  }

  async writeAll(servers: McpServer[], raw: Record<string, unknown>): Promise<void> {
    this.servers = servers.map((s) => ({ ...s, args: [...s.args], env: { ...s.env } }));
    this.raw = { ...raw };
    this.writes += 1;
  }
}

type ProbeInput = { command: string; args: string[]; env: Record<string, string> };

const okProbe = async (): Promise<ProbeResult> => ({
  ok: true,
  tools: [{ name: 'read_file', description: 'Read a file' }],
  duration_ms: 12,
});

function makeDeps(
  repo: InMemoryMcpRepo,
  probe: (input: ProbeInput) => Promise<ProbeResult> = okProbe,
  now: () => string = () => NOW,
): McpDeps {
  return { repo, probe, now };
}

function unwrap<T>(result: Result<T>): T {
  if (result.kind === 'error') throw new Error(`unexpected error ${result.error.code}`);
  return result.value;
}

function errorOf<T>(result: Result<T>): { code: string; status: number } {
  if (result.kind !== 'error') throw new Error('expected error result');
  return result.error;
}

const baseServer = { name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] };

describe('mcp 服务器用例（注入内存 repo + fake probe，零 IO）', () => {
  it('新建 → 列表按 name 排序，保持顶层未知字段', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    expect(unwrap(await createServer(deps, { ...baseServer, name: 'zeta' })).name).toBe('zeta');
    expect(unwrap(await createServer(deps, baseServer)).name).toBe('fs');

    const servers = unwrap(await listServers(deps));
    expect(servers.map((s) => s.name)).toEqual(['fs', 'zeta']);
    expect(repo.raw).toEqual({ version: 1 });
  });

  it('新建归一化：trim command、env 缺省为空对象、updated_at 由注入时钟生成', async () => {
    const repo = new InMemoryMcpRepo();
    const server = unwrap(
      await createServer(makeDeps(repo), { ...baseServer, command: '  npx  ' }),
    );
    expect(server).toEqual({
      name: 'fs',
      command: 'npx',
      args: baseServer.args,
      env: {},
      updated_at: NOW,
    });
    expect(repo.servers).toHaveLength(1);
  });

  it('重名 → 409 冲突，且不落盘', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    unwrap(await createServer(deps, baseServer));
    const conflict = errorOf(await createServer(deps, baseServer));
    expect(conflict).toMatchObject({ code: 'MCP_DUPLICATE_NAME', status: 409 });
    expect(repo.writes).toBe(1);
  });

  it('非法 name → 400', async () => {
    const repo = new InMemoryMcpRepo();
    expect(errorOf(await createServer(makeDeps(repo), { ...baseServer, name: 'bad name' }))).toMatchObject({
      code: 'MCP_INVALID_NAME',
      status: 400,
    });
  });

  it('command 为空 / 超长 → 400', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    expect(errorOf(await createServer(deps, { ...baseServer, command: '   ' })).code).toBe('MCP_INVALID_COMMAND');
    expect(
      errorOf(await createServer(deps, { ...baseServer, command: 'x'.repeat(513) })).code,
    ).toBe('MCP_INVALID_COMMAND');
  });

  it('args 超 64 项 / 单项超 512 → 400', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    const manyArgs = Array.from({ length: 65 }, (_, i) => `a${i}`);
    expect(errorOf(await createServer(deps, { ...baseServer, args: manyArgs })).code).toBe('MCP_INVALID_ARGS');
    expect(
      errorOf(await createServer(deps, { ...baseServer, args: ['x'.repeat(513)] })).code,
    ).toBe('MCP_INVALID_ARGS');
  });

  it('env 超 64 键 / 值超 2048 / 非字符串 → 400', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    const manyEnv = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`K${i}`, 'v']));
    expect(errorOf(await createServer(deps, { ...baseServer, env: manyEnv })).code).toBe('MCP_INVALID_ENV');
    expect(
      errorOf(await createServer(deps, { ...baseServer, env: { TOKEN: 'x'.repeat(2049) } })).code,
    ).toBe('MCP_INVALID_ENV');
    expect(
      errorOf(await createServer(deps, { ...baseServer, env: { TOKEN: 42 } })).code,
    ).toBe('MCP_INVALID_ENV');
  });

  it('description 超 280 → 400', async () => {
    const repo = new InMemoryMcpRepo();
    expect(
      errorOf(await createServer(makeDeps(repo), { ...baseServer, description: 'x'.repeat(281) })).code,
    ).toBe('MCP_DESCRIPTION_TOO_LONG');
  });

  it('局部更新：只改给出的字段，其余保留，updated_at 刷新', async () => {
    const repo = new InMemoryMcpRepo();
    let clock = NOW;
    const deps = makeDeps(repo, okProbe, () => clock);
    unwrap(await createServer(deps, { ...baseServer, description: 'filesystem' }));

    clock = '2026-11-27T00:00:00.000Z';
    const updated = unwrap(await updateServer(deps, 'fs', { command: 'node', args: ['server.js'] }));
    expect(updated).toEqual({
      name: 'fs',
      command: 'node',
      args: ['server.js'],
      env: {},
      description: 'filesystem',
      updated_at: clock,
    });
    expect(unwrap(await listServers(deps))[0]).toEqual(updated);
  });

  it('更新可改名；改成已存在的名字 → 409', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    unwrap(await createServer(deps, baseServer));
    unwrap(await createServer(deps, { ...baseServer, name: 'other' }));

    expect(errorOf(await updateServer(deps, 'fs', { name: 'other' })).code).toBe('MCP_DUPLICATE_NAME');
    expect(unwrap(await updateServer(deps, 'fs', { name: 'renamed' })).name).toBe('renamed');
  });

  it('更新 / 删除不存在的服务器 → 404', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    expect(errorOf(await updateServer(deps, 'nope', { command: 'node' }))).toMatchObject({
      code: 'MCP_NOT_FOUND',
      status: 404,
    });
    expect(errorOf(await deleteServer(deps, 'nope'))).toMatchObject({ code: 'MCP_NOT_FOUND', status: 404 });
  });

  it('删除成功 → 列表移除，顶层字段保留', async () => {
    const repo = new InMemoryMcpRepo();
    const deps = makeDeps(repo);
    unwrap(await createServer(deps, baseServer));
    expect(unwrap(await deleteServer(deps, 'fs'))).toBe(true);
    expect(unwrap(await listServers(deps))).toEqual([]);
    expect(repo.raw).toEqual({ version: 1 });
  });

  it('按名探测：命中走注入 probe 并透传结果', async () => {
    const repo = new InMemoryMcpRepo();
    const calls: ProbeInput[] = [];
    const probe = async (input: ProbeInput): Promise<ProbeResult> => {
      calls.push(input);
      return { ok: true, tools: [{ name: 'list' }], duration_ms: 3 };
    };
    const deps = makeDeps(repo, probe);
    unwrap(await createServer(deps, { ...baseServer, env: { DEBUG: '1' } }));

    const result = unwrap(await probeByName(deps, 'fs'));
    expect(result.ok).toBe(true);
    expect(result.tools).toEqual([{ name: 'list' }]);
    expect(calls).toEqual([{ command: 'npx', args: baseServer.args, env: { DEBUG: '1' } }]);
  });

  it('按名探测失败透传 error；名字不存在 → 404 且不调 probe', async () => {
    const repo = new InMemoryMcpRepo();
    let called = 0;
    const probe = async (): Promise<ProbeResult> => {
      called += 1;
      return {
        ok: false,
        tools: [],
        duration_ms: 5000,
        error: { code: 'MCP_TIMEOUT', message: 'probe exceeded 12000ms' },
      };
    };
    const deps = makeDeps(repo, probe);
    unwrap(await createServer(deps, baseServer));

    const failed = unwrap(await probeByName(deps, 'fs'));
    expect(failed).toMatchObject({ ok: false, error: { code: 'MCP_TIMEOUT' } });
    expect(called).toBe(1);

    expect(errorOf(await probeByName(deps, 'missing')).status).toBe(404);
    expect(called).toBe(1);
  });

  it('保存前试连：校验入参后原样传入 probe，不落库', async () => {
    const repo = new InMemoryMcpRepo();
    const calls: ProbeInput[] = [];
    const probe = async (input: ProbeInput): Promise<ProbeResult> => {
      calls.push(input);
      return { ok: true, tools: [], duration_ms: 1 };
    };
    const deps = makeDeps(repo, probe);

    expect(unwrap(await probeAdHoc(deps, { command: 'npx', args: ['-y', 'pkg'] }))).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([{ command: 'npx', args: ['-y', 'pkg'], env: {} }]);
    expect(repo.writes).toBe(0);

    expect(errorOf(await probeAdHoc(deps, { command: '' })).code).toBe('MCP_INVALID_COMMAND');
    expect(calls).toHaveLength(1);
  });
});
