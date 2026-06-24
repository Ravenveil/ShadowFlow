// src/pages/chat-home/AgentWorkspacePane.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentWorkspacePane } from './AgentWorkspacePane';

vi.mock('../../core/hooks/useWorkspaceRun', () => ({
  useWorkspaceRun: () => ({
    session: { nodes: [], edges: [], steps: [], isComplete: false, blueprintYaml: null, blueprintFile: null, artifactType: 'yaml' },
    latest: { session_id: 'r1', goal: 'g', status: 'running', group_id: 'g', created_at: 1, updated_at: 1, conversation_id: null },
    history: [], runCwd: null, loading: false, reload: () => {},
  }),
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
});
