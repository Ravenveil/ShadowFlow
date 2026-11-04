/**
 * ClawHubPage.test.tsx — 目录页组件测试（ClawHub T05/T09）。
 *
 * 覆盖 P0 验收点：
 *  - 目录渲染全部注册条目（含 autoresearchclaw / openclaw / hermes）
 *  - is_claw 条目置顶 + Claw chip
 *  - 状态徽章来自 detect 数据（已安装/未安装）
 *  - 搜索/状态筛选生效
 *  - copy-only 条目显示「复制命令」而非「安装」
 *  - 安装按钮 → POST + SSE 订阅（fetch/EventSource mock）
 *  - 重新扫描按钮 → POST /api/cli/detect/refresh
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '../../../test/utils';
import { ClawHubPage } from '../ClawHubPage';
import type { DetectedCli } from '../../../api/cli';

/** 页面用了 useNavigate → 必须裹 MemoryRouter。 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/clawhub']}>
      <ClawHubPage />
    </MemoryRouter>,
  );
}

// ── mocks ─────────────────────────────────────────────────────────────────────

const detectItems: DetectedCli[] = [
  {
    id: 'autoresearchclaw',
    installed: false,
    path: null,
    version: null,
    env_set: true,
    install_cmd: 'pip install autoresearchclaw',
    install_spec: { pm: 'pip', args: ['install', 'autoresearchclaw'] },
    stream_format: 'plain-line',
    is_claw: true,
    description: '自动研究助手：研究计划 → 多源检索 → 引用综合，全程流式',
    category: 'research',
    installable: true,
  },
  {
    id: 'openclaw',
    installed: true,
    path: '/usr/bin/openclaw',
    version: 'openclaw 1.2.3',
    env_set: true,
    install_cmd: 'npm i -g openclaw',
    stream_format: 'plain-line',
    is_claw: true,
    description: 'OpenClaw — 开源 AI 助手 CLI',
    category: 'assistant',
    installable: true,
  },
  {
    id: 'hermes',
    installed: false,
    path: null,
    version: null,
    env_set: true,
    install_cmd: '参见 hermes 官方文档',
    stream_format: 'plain-line',
    is_claw: true,
    description: 'Hermes — 消息驱动的 AI 助手 CLI',
    category: 'assistant',
    installable: false, // copy-only
  },
  {
    id: 'claude',
    installed: true,
    path: '/usr/bin/claude',
    version: '1.0.34',
    env_set: true,
    install_cmd: 'npm i -g @anthropic-ai/claude-cli',
    stream_format: 'claude-stream-json',
    installable: true,
  },
];

const detectSnapshot = { scanned_at: '2026-06-01T00:00:00Z', items: detectItems };

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (url.includes('/api/cli/detect/refresh')) {
        return { ok: true, json: async () => detectSnapshot } as Response;
      }
      if (url.includes('/api/cli/detect')) {
        return { ok: true, json: async () => detectSnapshot } as Response;
      }
      if (/\/api\/clawhub\/install\/[^/]+$/.test(url) && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            install_id: 'inst-test1',
            cli_id: 'autoresearchclaw',
            command: 'pip install autoresearchclaw',
            stream_url: '/api/clawhub/install/inst-test1/stream',
          }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ClawHubPage — 目录渲染（FR-01）', () => {
  it('列出全部 detect 条目卡片', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-card-autoresearchclaw')).toBeInTheDocument();
    });
    expect(screen.getByTestId('claw-card-openclaw')).toBeInTheDocument();
    expect(screen.getByTestId('claw-card-hermes')).toBeInTheDocument();
    expect(screen.getByTestId('claw-card-claude')).toBeInTheDocument();
    expect(screen.getByTestId('clawhub-count').textContent).toContain('4');
  });

  it('is_claw 条目带 Claw chip；已安装徽章带版本', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-card-autoresearchclaw')).toBeInTheDocument();
    });
    // openclaw 已安装 → 徽章含版本
    expect(screen.getByTestId('claw-status-openclaw').textContent).toContain('已安装');
    expect(screen.getByTestId('claw-status-openclaw').textContent).toContain('1.2.3');
    // autoresearchclaw 未安装
    expect(screen.getByTestId('claw-status-autoresearchclaw').textContent).toContain('未安装');
  });

  it('已安装卡片显示「对话」按钮；copy-only 显示「复制命令」', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-chat-openclaw')).toBeInTheDocument();
    });
    // hermes copy-only → 复制命令按钮（无安装按钮）
    expect(screen.getByTestId('claw-copy-hermes')).toBeInTheDocument();
    expect(screen.queryByTestId('claw-install-hermes')).toBeNull();
    // autoresearchclaw 可安装 → 安装按钮
    expect(screen.getByTestId('claw-install-autoresearchclaw')).toBeInTheDocument();
  });
});

describe('ClawHubPage — 筛选（FR-01）', () => {
  it('搜索框过滤 id/简介', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-card-claude')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('clawhub-search'), { target: { value: 'openclaw' } });
    await waitFor(() => {
      expect(screen.queryByTestId('claw-card-claude')).toBeNull();
    });
    expect(screen.getByTestId('claw-card-openclaw')).toBeInTheDocument();
  });

  it('状态筛选：已安装只留 installed 条目', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-card-claude')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('clawhub-filter-status'), {
      target: { value: 'installed' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('claw-card-autoresearchclaw')).toBeNull();
    });
    expect(screen.getByTestId('claw-card-openclaw')).toBeInTheDocument();
    expect(screen.getByTestId('claw-card-claude')).toBeInTheDocument();
  });
});

describe('ClawHubPage — 重新扫描（FR-09）', () => {
  it('点击重扫 → POST /api/cli/detect/refresh', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('clawhub-rescan')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('clawhub-rescan'));
    await waitFor(() => {
      expect(
        fetchCalls.some((c) => c.url.includes('/api/cli/detect/refresh') && c.init?.method === 'POST'),
      ).toBe(true);
    });
  });
});

describe('ClawHubPage — 安装流（FR-02）', () => {
  it('点安装 → POST /api/clawhub/install/:cliId + 挂 SSE 日志面板', async () => {
    // EventSource mock（jsdom 无原生）
    const esInstances: Array<{
      listeners: Record<string, (ev: MessageEvent) => void>;
      closed: boolean;
      close: () => void;
    }> = [];
    class MockEventSource {
      static instances = esInstances;
      url: string;
      listeners: Record<string, (ev: MessageEvent) => void> = {};
      closed = false;
      constructor(url: string) {
        this.url = url;
        esInstances.push(this);
      }
      addEventListener(type: string, cb: (ev: MessageEvent) => void) {
        this.listeners[type] = cb;
      }
      close() {
        this.closed = true;
      }
    }
    vi.stubGlobal('EventSource', MockEventSource);

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-install-autoresearchclaw')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('claw-install-autoresearchclaw'));

    // POST 建会话
    await waitFor(() => {
      expect(
        fetchCalls.some(
          (c) =>
            c.url.includes('/api/clawhub/install/autoresearchclaw') && c.init?.method === 'POST',
        ),
      ).toBe(true);
    });
    // SSE 订阅打开
    await waitFor(() => {
      expect(esInstances.length).toBeGreaterThan(0);
    });
    expect(esInstances[0].url).toContain('/api/clawhub/install/inst-test1/stream');

    // 推一帧日志 → 面板渲染
    esInstances[0].listeners['install-log'](
      new MessageEvent('install-log', {
        data: JSON.stringify({ stream: 'stdout', line: 'Collecting autoresearchclaw' }),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('install-log-panel')).toBeInTheDocument();
      expect(screen.getByTestId('install-log-body').textContent).toContain('Collecting');
    });

    // done 帧 → 面板状态成功 + 触发 detect 刷新
    esInstances[0].listeners['install-done'](
      new MessageEvent('install-done', {
        data: JSON.stringify({ exit_code: 0, finished_at: '2026-06-01T00:00:01Z', duration_ms: 500 }),
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('install-status-msg').textContent).toContain('安装成功');
    });
  });

  it('422 copy-only → 应用内 toast 降级提示（不装弹日志面板）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });
        if (url.includes('/api/cli/detect')) {
          return { ok: true, json: async () => detectSnapshot } as Response;
        }
        if (/\/api\/clawhub\/install\//.test(url)) {
          return {
            ok: false,
            status: 422,
            json: async () => ({ error: 'INSTALL_NOT_EXECUTABLE', message: 'copy-only' }),
          } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('claw-install-autoresearchclaw')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('claw-install-autoresearchclaw'));
    // 2026-11-04 用户反馈批：window.alert 原生框 → 应用内 toast。
    await waitFor(() => {
      expect(screen.getByTestId('clawhub-toast')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('install-log-panel')).toBeNull();
  });
});
