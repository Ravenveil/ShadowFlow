/**
 * teams 纯规则/D1-D3 单测：零 IO、不启 server、不碰磁盘。
 */

import { describe, it, expect } from 'vitest';
import {
  isValidTeamId,
  normalizeWorkspaceId,
  UNASSIGNED_WORKSPACE,
  nodeIdentity,
  edgeIdentity,
  workflowStoredAgentIds,
  defaultWorkflow,
  roleFromSoul,
} from '../teams-model';
import { validateWorkflowStoredShape, storedAgentIds } from './teams';

describe('team_id / workspace 规则', () => {
  it('合法 team_id', () => {
    expect(isValidTeamId('team-abc_01')).toBe(true);
    expect(isValidTeamId('../etc')).toBe(false);
    expect(isValidTeamId('a b')).toBe(false);
  });

  it('workspace 归一（D3）', () => {
    expect(normalizeWorkspaceId(null)).toBe(UNASSIGNED_WORKSPACE);
    expect(normalizeWorkspaceId('  ')).toBe(UNASSIGNED_WORKSPACE);
    expect(normalizeWorkspaceId('ws-1')).toBe('ws-1');
    expect(normalizeWorkspaceId('default')).toBe('default');
  });
});

describe('workflow 存储形展平', () => {
  it('包装形节点 {id,data:{agentId}}', () => {
    expect(nodeIdentity({ id: 'n1', data: { agentId: 'a1' } })).toEqual({ id: 'n1', agentId: 'a1' });
  });

  it('裸形节点 {id,agentId}', () => {
    expect(nodeIdentity({ id: 'n1', agentId: 'a1' })).toEqual({ id: 'n1', agentId: 'a1' });
  });

  it('空 agentId 不抽', () => {
    expect(nodeIdentity({ id: 'n1', data: { agentId: '  ' } })).toEqual({ id: 'n1' });
  });

  it('畸形节点跳过', () => {
    expect(nodeIdentity(null)).toBeNull();
    expect(nodeIdentity({})).toBeNull();
  });

  it('边身份：包装形 mode', () => {
    expect(edgeIdentity({ source: 'a', target: 'b', data: { mode: 'approve' } })).toEqual({
      source: 'a', target: 'b', mode: 'approve',
    });
  });

  it('agentId 抽取忽略空', () => {
    const wf = {
      nodes: [
        { id: 'n1', data: { agentId: 'a1' } },
        { id: 'n2', data: { agentId: '' } },
      ],
      edges: [],
    };
    expect(workflowStoredAgentIds(wf)).toEqual(['a1']);
    expect(storedAgentIds(wf)).toEqual(['a1']);
  });

  it('roleFromSoul 取首个非空行', () => {
    expect(roleFromSoul('\n  你是主控  \n第二行')).toBe('你是主控');
    expect(roleFromSoul(undefined)).toBeUndefined();
  });
});

describe('D1 workflow DAG 校验', () => {
  it('空 workflow 合法', () => {
    expect(validateWorkflowStoredShape(defaultWorkflow())).toEqual([]);
  });

  it('线性链合法', () => {
    const wf = {
      nodes: [
        { id: 'a', data: { agentId: 'a1' } },
        { id: 'b', data: { agentId: 'a2' } },
      ],
      edges: [{ source: 'a', target: 'b', data: { mode: 'direct' } }],
    };
    expect(validateWorkflowStoredShape(wf)).toEqual([]);
  });

  it('自环被拒', () => {
    const wf = {
      nodes: [{ id: 'a', data: { agentId: 'a1' } }],
      edges: [{ source: 'a', target: 'a', data: { mode: 'direct' } }],
    };
    const errs = validateWorkflowStoredShape(wf);
    expect(errs.length).toBeGreaterThan(0);
  });

  it('conditional 回边合法（不参与环检测）', () => {
    const wf = {
      nodes: [
        { id: 'a', data: { agentId: 'a1' } },
        { id: 'b', data: { agentId: 'a2' } },
      ],
      edges: [
        { source: 'a', target: 'b', data: { mode: 'direct' } },
        { source: 'b', target: 'a', data: { mode: 'conditional' } },
      ],
    };
    expect(validateWorkflowStoredShape(wf)).toEqual([]);
  });

  it('未知端点被拒', () => {
    const wf = {
      nodes: [{ id: 'a', data: { agentId: 'a1' } }],
      edges: [{ source: 'a', target: 'ghost', data: { mode: 'direct' } }],
    };
    expect(validateWorkflowStoredShape(wf).length).toBeGreaterThan(0);
  });
});
