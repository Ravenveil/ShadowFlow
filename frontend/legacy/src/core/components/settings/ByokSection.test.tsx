/**
 * ByokSection — API-key field behaviour (2026-05-29).
 *
 * Cherry-Studio model: when a provider with a saved key is selected the full
 * plaintext is eager-loaded via GET /byok/:id/reveal and rendered in the input
 * (masked as dots via type=password → real key length). The eye toggle flips
 * type=password↔text to reveal it. If the reveal endpoint is unavailable the
 * field gracefully falls back to the server's masked tail (`••••XXXX`).
 *
 * Regression history: the field used to render a hardcoded `'•'.repeat(40)`
 * for any saved key, so the eye revealed nothing useful.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render as rawRender, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../../common/i18n';
import { ByokSection } from './ByokSection';

const render: typeof rawRender = (ui, options) =>
  rawRender(<I18nProvider defaultLanguage="zh">{ui}</I18nProvider>, options);

const MASKED = '••••sk12';                  // settings.ts maskApiKey('...sk12')
const FULL = 'sk-ant-api03-REALKEY-sk12';   // plaintext from /reveal

/**
 * Mock ByokSection's GETs. `savedKey` empty → no provider configured.
 * `revealOk=false` makes /reveal 404 (simulates an un-restarted backend).
 */
function mockFetch(savedKey: string, revealOk = true) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/settings/byok/anthropic/reveal')) {
      return revealOk
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ apiKey: FULL }) } as Response)
        : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ detail: 'Not Found' }) } as Response);
    }
    if (url.endsWith('/api/settings/byok')) {
      const providers = savedKey
        ? { anthropic: { apiKey: savedKey, baseUrl: '', models: [], enabled: true } }
        : {};
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ providers }) } as Response);
    }
    if (url.endsWith('/api/settings/byok/models')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  });
}

describe('ByokSection — API key field', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('eager-loads the full plaintext key and renders it masked (type=password)', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED));
    render(<ByokSection />);
    // findByDisplayValue waits for the async /reveal to land the full key.
    const input = await screen.findByDisplayValue(FULL) as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('password');  // masked by default
  });

  it('eye toggle flips the input type to reveal the full key', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED));
    render(<ByokSection />);
    const input = await screen.findByDisplayValue(FULL) as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('password');

    // Native .click() — fireEvent.click's synthetic event is flaky on this
    // nested button in jsdom (focus events work, proving wiring is live).
    (screen.getByTitle('显示') as HTMLButtonElement).click();

    await screen.findByTitle('隐藏'); // title flips → state toggled
    expect(input.getAttribute('type')).toBe('text');
    expect(input.value).toBe(FULL);
  });

  it('falls back to the masked tail when /reveal is unavailable (404)', async () => {
    vi.stubGlobal('fetch', mockFetch(MASKED, /* revealOk */ false));
    render(<ByokSection />);
    const input = await screen.findByDisplayValue(MASKED) as HTMLInputElement;
    expect(input.value).toBe(MASKED);
  });

  it('leaves the field empty (placeholder visible) when no key is saved', async () => {
    vi.stubGlobal('fetch', mockFetch(''));
    render(<ByokSection />);
    const input = await screen.findByPlaceholderText('sk-ant-…') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 自定义 provider / 自定义模型（2026-11-06 用户反馈：「设置自定义模型 api 会
// 失败，自定义的模型不会在列表显示」）。
//
// 回归背景（三个连锁 bug）：
//   1. 侧栏只遍历内置 PROVIDER_ORDER —— 自定义 provider 创建后在列表里根本
//      不出现，切走即「消失」；
//   2. 模型区 `providerModels.length > 0` 才渲染 —— 自定义 provider 没有内置
//      目录条目，「拉取列表 / 添加模型」入口全部不可达；
//   3. 已保存的 manualModels/syncedModels 不在加载时合并回模型目录 —— 刷新后
//      自定义模型全部消失。
// ---------------------------------------------------------------------------

/** GET store 由入参决定；PUT/DELETE 一律 200，且保留调用记录供断言。 */
function mockFetchWithProviders(providers: Record<string, unknown>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/reveal')) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    }
    if (url.endsWith('/api/settings/byok')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ providers }) } as Response);
    }
    if (url.endsWith('/api/settings/byok/models')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) } as Response);
    }
    void init;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response);
  });
}

describe('ByokSection — 自定义 provider / 自定义模型', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('新建的自定义 provider 出现在侧栏并立即持久化到服务端', async () => {
    const fetchMock = mockFetchWithProviders({});
    vi.stubGlobal('fetch', fetchMock);
    render(<ByokSection />);

    // 打开「自定义提供商…」弹窗
    const openBtn = await screen.findByText('自定义提供商…');
    openBtn.click();
    // 异步渲染后再取弹窗字段（同步 get 会抢在 re-render 前）
    fireEvent.change(await screen.findByTestId('byok-custom-name'), { target: { value: '我的网关' } });
    (screen.getByTestId('byok-custom-confirm') as HTMLButtonElement).click();

    // 侧栏（+ 详情头）出现该 provider
    const rows = await screen.findAllByText('我的网关');
    expect(rows.length).toBeGreaterThan(0);

    // 服务端立即建了占位配置（PUT /api/settings/byok/custom-*）
    const putCalls = fetchMock.mock.calls.filter(
      c => String(c[0]).includes('/api/settings/byok/custom-') && (c[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCalls.length).toBeGreaterThan(0);
  });

  it('刷新后已保存的自定义模型重新显示在列表里（加载时合并回目录）', async () => {
    vi.stubGlobal('fetch', mockFetchWithProviders({
      mimo: {
        apiKey: '••••abcd', baseUrl: 'https://api.xiaomimimo.com/v1',
        models: ['zzz-private'], manualModels: ['zzz-private'], enabled: true,
      },
    }));
    render(<ByokSection />);

    // 切到 Xiaomi MiMo（内置目录里没有 zzz-private，只能来自加载合并）
    (await screen.findAllByText('Xiaomi MiMo'))[0].click();
    // ModelToken 的 name 与 id 两行都会渲染该文本 → findAllByText
    const hits = await screen.findAllByText('zzz-private');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('0 模型的 provider 也有添加入口，手动添加的模型立即显示', async () => {
    vi.stubGlobal('fetch', mockFetchWithProviders({}));
    render(<ByokSection />);

    // groq 在内置 FALLBACK 目录里没有条目 → 走「0 模型」空目录路径
    (await screen.findAllByText('Groq'))[0].click();
    const input = await screen.findByTestId('byok-add-model-input');
    fireEvent.change(input, { target: { value: 'my-custom-model' } });
    await new Promise(r => setTimeout(r, 50)); // 等按钮脱离 disabled 再点
    (screen.getByTestId('byok-add-model-btn') as HTMLButtonElement).click();

    const hits = await screen.findAllByText('my-custom-model');
    expect(hits.length).toBeGreaterThan(0);
  });
});
