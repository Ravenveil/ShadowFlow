// src/pages/chat-home/AgentWorkspacePane.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentWorkspacePane } from './AgentWorkspacePane';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../core/hooks/useWorkspaceRun', () => ({
  useWorkspaceRun: () => ({
    session: { nodes: [], edges: [], steps: [], isComplete: false, blueprintYaml: null, blueprintFile: null, artifactType: 'yaml', tokenCount: 0 },
    latest: { session_id: 'r1', goal: '调研任务', status: 'running', group_id: 'g', created_at: 1, updated_at: 1, conversation_id: null },
    history: [],
    runCwd: null, loading: false, reload: () => {},
  }),
}));

vi.mock('../../components/run-session/PreviewPanel', () => ({
  default: () => <div data-testid="preview-panel-mock">Preview</div>,
}));

describe('AgentWorkspacePane', () => {
  it('单排工作台 tab：产物/文件/任务/Brief，默认产物，可切换', () => {
    render(<MemoryRouter><AgentWorkspacePane groupId="g" /></MemoryRouter>);
    for (const name of ['产物', '文件', '任务', 'Brief']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    // 2026-06-27 精简：「画布」tab 已移除（DAG 已在中栏头部可达，右栏冗余）。
    expect(screen.queryByRole('tab', { name: '画布' })).not.toBeInTheDocument();
    // 不应再有「概览」/「设定」tab（拍平后概览→状态条、设定→中栏头部）
    expect(screen.queryByRole('tab', { name: '概览' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '设定' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '产物' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '任务' }));
    expect(screen.getByRole('tab', { name: '任务' })).toHaveAttribute('aria-selected', 'true');
  });

  it('run 状态条显示最近 run，点「打开 Run」跳整页', () => {
    mockNavigate.mockClear();
    render(<MemoryRouter><AgentWorkspacePane groupId="g" /></MemoryRouter>);
    expect(screen.getByText('运行中')).toBeInTheDocument();
    expect(screen.getByText('调研任务')).toBeInTheDocument();
    act(() => { screen.getByRole('button', { name: '打开 Run' }).click(); });
    expect(mockNavigate).toHaveBeenCalledWith('/run-session/r1');
  });
});
