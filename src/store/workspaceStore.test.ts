/**
 * workspaceStore — ShadowFlow root (no default workspace) behavior (2026-06-01, "A").
 *
 * 取消默认工作区设计:fetchWorkspaces 不再自动选第一个工作区,而是回退到 null =
 * ShadowFlow 根(未选工作区 → 不显示 agent)。switchTo(null) 可显式回根。
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { listWorkspaces } from '../api/workspaces';
import { useWorkspaceStore } from './workspaceStore';

vi.mock('../api/workspaces', () => ({ listWorkspaces: vi.fn() }));

const WS = (id: string, name: string) =>
  ({
    workspace_id: id,
    name,
    color: '#6366f1',
    owner_id: 'local',
    created_at: '',
    updated_at: '',
    agent_count: 0,
    team_count: 0,
  }) as unknown as Awaited<ReturnType<typeof listWorkspaces>>[number];

beforeEach(() => {
  (listWorkspaces as Mock).mockResolvedValue([WS('ws-A', 'Alpha'), WS('ws-B', 'Beta')]);
  useWorkspaceStore.setState({ workspaces: [], currentId: null, currentTeam: null });
});

describe('workspaceStore — no default workspace (root = null)', () => {
  it('fetchWorkspaces does NOT auto-select the first workspace (stays at root)', async () => {
    useWorkspaceStore.setState({ currentId: null });
    await useWorkspaceStore.getState().fetchWorkspaces();
    const s = useWorkspaceStore.getState();
    expect(s.workspaces).toHaveLength(2);
    expect(s.currentId).toBeNull(); // root, NOT 'ws-A'
  });

  it('keeps a still-valid persisted currentId', async () => {
    useWorkspaceStore.setState({ currentId: 'ws-B' });
    await useWorkspaceStore.getState().fetchWorkspaces();
    expect(useWorkspaceStore.getState().currentId).toBe('ws-B');
  });

  it('drops a stale currentId back to root (null), not to ws[0]', async () => {
    useWorkspaceStore.setState({ currentId: 'ws-GONE' });
    await useWorkspaceStore.getState().fetchWorkspaces();
    expect(useWorkspaceStore.getState().currentId).toBeNull();
  });

  it('switchTo(null) returns to root and clears the current team', () => {
    useWorkspaceStore.setState({
      currentId: 'ws-A',
      currentTeam: { team_id: 't1', name: 'T', agent_ids: [] },
    });
    useWorkspaceStore.getState().switchTo(null);
    const s = useWorkspaceStore.getState();
    expect(s.currentId).toBeNull();
    expect(s.currentTeam).toBeNull();
  });
});
