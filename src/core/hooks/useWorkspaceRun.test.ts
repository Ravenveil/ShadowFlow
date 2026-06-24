import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWorkspaceRun } from './useWorkspaceRun';

vi.mock('../../api/runSessions', () => ({
  listRunSessions: vi.fn(async () => [
    { session_id: 'r2', goal: 'newer', group_id: 'g1', status: 'running', created_at: 2, updated_at: 2, conversation_id: null },
    { session_id: 'r1', goal: 'older', group_id: 'g1', status: 'succeeded', created_at: 1, updated_at: 1, conversation_id: null },
  ]),
}));
vi.mock('./useRunSession', () => ({
  useRunSession: (sid: string) => ({ sessionId: sid, nodes: [], edges: [], steps: [], isComplete: false } as any),
}));

describe('useWorkspaceRun', () => {
  beforeEach(() => vi.clearAllMocks());
  it('picks newest run as latest and exposes history tail', async () => {
    const { result } = renderHook(() => useWorkspaceRun('g1'));
    await waitFor(() => expect(result.current.latest?.session_id).toBe('r2'));
    expect(result.current.history.map((r) => r.session_id)).toEqual(['r1']);
    expect(result.current.session.sessionId).toBe('r2');
  });

  it('no group → empty, no latest', async () => {
    const { result } = renderHook(() => useWorkspaceRun(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.latest).toBeNull();
  });
});
