import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BriefBoardView } from './BriefBoardView';

const mockEntries = [
  {
    agent_name: 'SectionWriter',
    agent_kind: 'acp',
    summary: '完成引言章节 1200 字',
    timestamp: '2026-04-24T10:30:00Z',
  },
];

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/briefboard')) {
      return new Response(
        JSON.stringify({ data: { date: '2026-04-24', entries: mockEntries } }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 404 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BriefBoardView', () => {
  it('renders per-agent feed after data loads', async () => {
    render(<BriefBoardView groupId="g1" date="2026-04-24" />);
    await waitFor(() => expect(screen.getByText('SectionWriter')).toBeInTheDocument());
    expect(screen.getByText('完成引言章节 1200 字')).toBeInTheDocument();
    expect(screen.getByText('acp')).toBeInTheDocument();
  });

  it('renders date header', async () => {
    render(<BriefBoardView groupId="g1" date="2026-04-24" />);
    await waitFor(() => screen.getByText('SectionWriter'));
    expect(screen.getByText('今日 · 2026-04-24')).toBeInTheDocument();
  });

  it('renders empty state when entries is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () =>
      new Response(JSON.stringify({ data: { date: '2026-04-24', entries: [] } }), {
        status: 200,
      })
    );
    render(<BriefBoardView groupId="g1" date="2026-04-24" />);
    await waitFor(() =>
      expect(
        screen.getByText('今天暂无 Agent 产出 · 运行一个工作流开始协作')
      ).toBeInTheDocument()
    );
  });

  it('renders empty state when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () =>
      new Response('{}', { status: 500 })
    );
    render(<BriefBoardView groupId="g1" date="2026-04-24" />);
    await waitFor(() =>
      expect(
        screen.getByText('今天暂无 Agent 产出 · 运行一个工作流开始协作')
      ).toBeInTheDocument()
    );
  });
});
