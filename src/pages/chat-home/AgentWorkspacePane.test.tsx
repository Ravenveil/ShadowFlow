// src/pages/chat-home/AgentWorkspacePane.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentWorkspacePane } from './AgentWorkspacePane';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../core/hooks/useWorkspaceRun', () => ({
  useWorkspaceRun: () => ({
    session: { nodes: [], edges: [], steps: [], isComplete: false, blueprintYaml: null, blueprintFile: null, artifactType: 'yaml', tokenCount: 0 },
    latest: { session_id: 'r1', goal: 'g', status: 'running', group_id: 'g', created_at: 1, updated_at: 1, conversation_id: null },
    history: [
      { session_id: 'r0', goal: 'old goal', status: 'succeeded', group_id: 'g', created_at: 0, updated_at: 0, conversation_id: null },
    ],
    runCwd: null, loading: false, reload: () => {},
  }),
}));

// PreviewPanel 在 jsdom 下会因为 tokenCount 的 .toLocaleString 以外的复杂 DOM 操作
// 而产生副作用，直接 mock 为简单展示
vi.mock('../../components/run-session/PreviewPanel', () => ({
  default: () => <div data-testid="preview-panel-mock">Preview</div>,
}));

describe('AgentWorkspacePane', () => {
  it('shows 概览/产物/画布 inner tabs and switches', () => {
    render(<MemoryRouter><AgentWorkspacePane groupId="g" /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '产物' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '画布' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '画布' }));
    // 画布 tab 选中
    expect(screen.getByRole('tab', { name: '画布' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking run card switches to 产物 tab in-place (no route change)', () => {
    mockNavigate.mockClear();
    render(<MemoryRouter><AgentWorkspacePane groupId="g" /></MemoryRouter>);
    // 初始在 概览 tab
    expect(screen.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true');
    // 点 run 卡（workpane-latest-run）— session_id === latest.session_id → 就地切 preview
    const runCard = screen.getByTestId('workpane-latest-run');
    act(() => { runCard.click(); });
    // 应就地切到 产物 tab
    expect(screen.getByRole('tab', { name: '产物' })).toHaveAttribute('aria-selected', 'true');
    // 概览 tab 不再选中
    expect(screen.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'false');
    // 不应调用 navigate（就地切，不跳页）
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clicking history run row navigates to full page (not in-place)', () => {
    mockNavigate.mockClear();
    render(<MemoryRouter><AgentWorkspacePane groupId="g" /></MemoryRouter>);
    // 历史行 session_id='r0' !== latest.session_id='r1' → 应 navigate 到整页
    const historyRow = screen.getByRole('button', { name: /old goal/ });
    act(() => { historyRow.click(); });
    // tab 仍在 概览（不就地切）
    expect(screen.getByRole('tab', { name: '概览' })).toHaveAttribute('aria-selected', 'true');
    // 应调用 navigate 跳整页
    expect(mockNavigate).toHaveBeenCalledWith('/run-session/r0');
  });
});
