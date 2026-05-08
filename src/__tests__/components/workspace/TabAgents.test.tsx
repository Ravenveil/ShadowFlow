/**
 * TabAgents 测试 — Milestone 1 后版本
 *
 * 列表来自 listAgents()，不再有硬编码 7 个 agent。
 * mock fetch 模拟后端响应。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { TabAgents } from '../../../components/workspace/TabAgents';

const mockAgents = [
  {
    agent_id: 'agent-test-001',
    name: '读读',
    soul: '你是 ShadowFlow 团队里的 读读，一名 PDF 长文阅读员。一句话总结一节，永远附 §节号 + 行号',
    workspace_id: 'default',
    blueprint: { identity: { role: 'Reader' }, capabilities: { model: 'claude-sonnet-4', skills: ['long-pdf'], tools: ['fetch.url'] } },
    status: 'idle' as const,
    source: 'quick_hire' as const,
    created_at: '2026-04-12T00:00:00Z',
  },
  {
    agent_id: 'agent-test-002',
    name: '阿批',
    soul: '你是 阿批，一名学术 Critic。只输出结构化 Issue',
    workspace_id: 'default',
    blueprint: { identity: { role: 'Critic' }, capabilities: { model: 'gpt-4o', skills: [], tools: [] } },
    status: 'idle' as const,
    source: 'quick_hire' as const,
    created_at: '2026-04-12T00:00:00Z',
  },
];

const envelope = (data: unknown) => ({ data, meta: {} });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(envelope(mockAgents)),
  } as Response)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TabAgents', () => {
  it('shows loading then renders agents from listAgents()', async () => {
    const { container } = render(<TabAgents />);
    expect(container.textContent).toContain('加载 Agents 中');
    await waitFor(() => {
      expect(container.textContent).toContain('读读');
    });
    expect(container.textContent).toContain('阿批');
    expect(container.textContent).toContain('Reader');
    expect(container.textContent).toContain('Critic');
  });

  it('defaults to first agent (读读) in center panel', async () => {
    const { container } = render(<TabAgents />);
    await waitFor(() => expect(container.textContent).toContain('PDF 长文阅读员'));
    expect(container.textContent).toContain('agent-test-001');
  });

  it('clicking another agent updates center panel', async () => {
    const { container, getAllByText } = render(<TabAgents />);
    await waitFor(() => expect(container.textContent).toContain('PDF 长文阅读员'));

    const apiRows = getAllByText('阿批');
    fireEvent.click(apiRows[0]);

    expect(container.textContent).toContain('学术 Critic');
    expect(container.textContent).toContain('agent-test-002');
  });

  it('search filters list', async () => {
    const { container, getByPlaceholderText, getAllByText, queryAllByText } = render(<TabAgents />);
    await waitFor(() => expect(container.textContent).toContain('读读'));

    expect(getAllByText('阿批').length).toBeGreaterThan(0);

    const search = getByPlaceholderText('按角色 / 模型筛选') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '读读' } });

    expect(getAllByText('读读').length).toBeGreaterThan(0);
    expect(queryAllByText('阿批').length).toBe(0);
  });

  it('shows empty state when backend returns no agents', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(envelope([])),
    } as Response)));

    const { getByTestId } = render(<TabAgents />);
    await waitFor(() => expect(getByTestId('agents-empty')).toBeInTheDocument());
    expect(getByTestId('agents-empty').textContent).toContain('还没有 Agent');
  });

  it('shows error state when backend fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Connection refused'))));

    const { getByTestId } = render(<TabAgents />);
    await waitFor(() => expect(getByTestId('agents-error')).toBeInTheDocument());
    expect(getByTestId('agents-error').textContent).toContain('Connection refused');
  });

  it('opens Quick Hire modal on + button click', async () => {
    const { getByTestId, container } = render(<TabAgents />);
    await waitFor(() => expect(container.textContent).toContain('读读'));

    fireEvent.click(getByTestId('open-hire'));
    expect(getByTestId('quick-hire-modal')).toBeInTheDocument();
    expect(getByTestId('qh-name')).toBeInTheDocument();
    expect(getByTestId('qh-soul')).toBeInTheDocument();
  });

  it('Quick Hire submit calls quickCreateAgent and refreshes list', async () => {
    const newAgent = {
      agent_id: 'agent-new-999',
      name: '新人',
      soul: '测试创建',
      workspace_id: 'default',
      blueprint: {},
      status: 'idle' as const,
      source: 'quick_hire' as const,
      created_at: '2026-05-02T00:00:00Z',
    };

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      callCount++;
      if (init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope(newAgent)) } as Response);
      }
      // 第一次 GET 返回 mockAgents，POST 后的 GET 返回 mockAgents + newAgent
      const list = callCount > 2 ? [...mockAgents, newAgent] : mockAgents;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(envelope(list)) } as Response);
    }));

    const { getByTestId, container } = render(<TabAgents />);
    await waitFor(() => expect(container.textContent).toContain('读读'));

    fireEvent.click(getByTestId('open-hire'));
    const nameInput = getByTestId('qh-name') as HTMLInputElement;
    const soulInput = getByTestId('qh-soul') as HTMLTextAreaElement;
    fireEvent.change(nameInput, { target: { value: '新人' } });
    fireEvent.change(soulInput, { target: { value: '测试创建' } });
    fireEvent.click(getByTestId('qh-submit'));

    await waitFor(() => expect(container.textContent).toContain('新人'));
  });
});
