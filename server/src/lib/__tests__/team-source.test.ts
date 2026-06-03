import { describe, it, expect } from 'vitest';
import { mapPythonTeamToRunShape } from '../team-source';

// Python JSON 真源样例(teams.py 存的形态:agent_ids + workflow{nodes,edges} + policy_matrix)
const pyTeam = {
  team_id: 't1',
  name: 'BMAD 团队',
  agent_ids: ['a1', 'a2', 'a3'],
  workflow: {
    nodes: [
      { id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: 'a1', name: 'PM' } },
      { id: 'n2', type: 'agentTask', position: { x: 200, y: 0 }, data: { agentId: 'a2', name: 'Arch' } },
      { id: 'n3', type: 'agentTask', position: { x: 400, y: 0 }, data: { agentId: 'a3', name: 'Dev' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', data: { mode: 'direct' } },
      { id: 'e2', source: 'n2', target: 'n3', data: { mode: 'conditional' } },
    ],
  },
  policy_matrix: { a1: { a2: 'permit' }, a2: { a3: 'warn' } },
};

describe('mapPythonTeamToRunShape', () => {
  it('members = agent_ids', () => {
    expect(mapPythonTeamToRunShape(pyTeam).members).toEqual(['a1', 'a2', 'a3']);
  });
  it('workflow.edges(source/target)→ edges_v1(from/to),node id 经 nodeId→agentId 解析', () => {
    const { edges } = mapPythonTeamToRunShape(pyTeam);
    expect(edges).toContainEqual({ from: 'a1', to: 'a2', kind: 'sequential' });
    expect(edges).toContainEqual({ from: 'a2', to: 'a3', kind: 'conditional' });
  });
  it('policy_matrix 原样透传', () => {
    expect(mapPythonTeamToRunShape(pyTeam).policy_matrix).toEqual({ a1: { a2: 'permit' }, a2: { a3: 'warn' } });
  });
  it('空 workflow / 缺字段不崩,返回空 members/edges', () => {
    const r = mapPythonTeamToRunShape({ team_id: 't0' });
    expect(r.members).toEqual([]);
    expect(r.edges).toEqual([]);
    expect(r.policy_matrix).toEqual({});
  });
  it('edge 引用未知 node → 跳过该边,不产生悬空边', () => {
    const r = mapPythonTeamToRunShape({
      team_id: 't2', agent_ids: ['a1'],
      workflow: { nodes: [{ id: 'n1', data: { agentId: 'a1' } }], edges: [{ source: 'n1', target: 'nX' }] },
    });
    expect(r.edges).toEqual([]);
  });
});
