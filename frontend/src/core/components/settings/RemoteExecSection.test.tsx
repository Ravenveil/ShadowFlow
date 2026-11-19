/**
 * RemoteExecSection — SSH 远程执行设置面板行为（2026-11-19）。
 *
 * 覆盖用户实际会踩的四个点：
 *   1. 空配置时表单可用、「清除」不出现
 *   2. 已有配置回填（私钥只回显掩码，不回显真实路径）
 *   3. 保存 → PUT，且空白私钥输入不上送（后端保留原值）
 *   4. 测试连接 / 试跑命令 → 展示退出码与 stdout；后端报错 → 落成红色 alert
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RemoteExecSection } from './RemoteExecSection';

type Json = unknown;

function jsonRes(body: Json, ok = true, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const SAVED = {
  configured: true,
  config: {
    host: 'gpu01',
    port: 2222,
    user: 'ubuntu',
    keyPathMasked: '…/id_ed25519',
    remoteDir: '/work/paper',
  },
};

const EMPTY = { configured: false, config: null };

/** 记录每次 fetch 的 url + body，便于断言请求形状。 */
function mockFetch(routes: Record<string, () => Response>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    for (const [suffix, make] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return Promise.resolve(make());
    }
    return Promise.resolve(jsonRes({ error: { code: 'NOT_MOCKED', message: url } }, false, 404));
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('RemoteExecSection', () => {
  it('未配置时表单为空、不显示清除按钮', async () => {
    mockFetch({ '/api/remote-exec/config': () => jsonRes({ data: EMPTY }) });
    render(<RemoteExecSection />);

    await waitFor(() => expect(screen.getByTestId('remote-exec-host')).toHaveValue(''));
    expect(screen.getByTestId('remote-exec-port')).toHaveValue('22');
    expect(screen.queryByTestId('remote-exec-clear')).toBeNull();
    // 未配置 → 试跑按钮禁用，避免发出一条注定失败的请求
    expect(screen.getByTestId('remote-exec-run')).toBeDisabled();
  });

  it('已有配置回填主机/端口/用户名/目录，私钥只给掩码提示', async () => {
    mockFetch({ '/api/remote-exec/config': () => jsonRes({ data: SAVED }) });
    render(<RemoteExecSection />);

    await waitFor(() => expect(screen.getByTestId('remote-exec-host')).toHaveValue('gpu01'));
    expect(screen.getByTestId('remote-exec-port')).toHaveValue('2222');
    expect(screen.getByTestId('remote-exec-user')).toHaveValue('ubuntu');
    expect(screen.getByTestId('remote-exec-remotedir')).toHaveValue('/work/paper');
    // 私钥输入框本身留空，只在 label 提示当前值
    expect(screen.getByTestId('remote-exec-keypath')).toHaveValue('');
    expect(screen.getByText(/…\/id_ed25519/)).toBeTruthy();
    expect(screen.getByTestId('remote-exec-clear')).toBeTruthy();
  });

  it('保存时上送表单值，私钥为空则不带 keyPath 字段', async () => {
    const calls = mockFetch({
      '/api/remote-exec/config': () => jsonRes({ data: SAVED }),
    });
    render(<RemoteExecSection />);
    await waitFor(() => expect(screen.getByTestId('remote-exec-host')).toHaveValue('gpu01'));

    fireEvent.change(screen.getByTestId('remote-exec-host'), { target: { value: 'gpu02' } });
    fireEvent.click(screen.getByTestId('remote-exec-save'));

    await waitFor(() => expect(screen.getByTestId('remote-exec-notice')).toBeTruthy());
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/api/remote-exec/config'));
    expect(put?.body).toMatchObject({ host: 'gpu02', port: 2222, user: 'ubuntu', remoteDir: '/work/paper' });
    expect(put?.body).not.toHaveProperty('keyPath');
  });

  it('测试连接成功 → 展示退出码与自检输出', async () => {
    mockFetch({
      '/api/remote-exec/config': () => jsonRes({ data: SAVED }),
      '/api/remote-exec/test': () => jsonRes({
        data: { ok: true, code: 0, stdout: 'SF_OK\nLinux gpu01', stderr: '', durationMs: 42 },
      }),
    });
    render(<RemoteExecSection />);
    await waitFor(() => expect(screen.getByTestId('remote-exec-host')).toHaveValue('gpu01'));

    fireEvent.click(screen.getByTestId('remote-exec-test'));

    await waitFor(() => expect(screen.getByTestId('remote-exec-stdout').textContent).toContain('SF_OK'));
    expect(screen.getByText(/退出码 0 · 42ms/)).toBeTruthy();
    expect(screen.getByTestId('remote-exec-notice').textContent).toContain('连接成功');
  });

  it('试跑命令失败 → 显示 stderr 与提示', async () => {
    mockFetch({
      '/api/remote-exec/config': () => jsonRes({ data: SAVED }),
      '/api/remote-exec/run': () => jsonRes({
        data: { ok: false, code: 127, stdout: '', stderr: 'nvidia-smi: not found', durationMs: 8 },
      }),
    });
    render(<RemoteExecSection />);
    await waitFor(() => expect(screen.getByTestId('remote-exec-host')).toHaveValue('gpu01'));

    fireEvent.click(screen.getByTestId('remote-exec-run'));

    await waitFor(() =>
      expect(screen.getByTestId('remote-exec-stderr').textContent).toContain('not found'));
    expect(screen.getByTestId('remote-exec-notice').textContent).toContain('127');
  });

  it('后端 400 → 把 error.message 落成 alert（而不是空白）', async () => {
    mockFetch({
      // 用已配置态做底，保证点按钮时首次 load 已结束（否则按钮还 disabled）
      '/api/remote-exec/config': () => jsonRes({ data: SAVED }),
      '/api/remote-exec/test': () => jsonRes(
        { error: { code: 'INVALID_SSH_CONFIG', message: 'host 含非法字符' } }, false, 400,
      ),
    });
    render(<RemoteExecSection />);
    await waitFor(() => expect(screen.getByTestId('remote-exec-host')).toHaveValue('gpu01'));

    fireEvent.click(screen.getByTestId('remote-exec-test'));

    await waitFor(() =>
      expect(screen.getByTestId('remote-exec-error').textContent).toContain('host 含非法字符'));
  });
});
