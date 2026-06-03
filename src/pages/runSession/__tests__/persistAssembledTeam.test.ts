import { describe, it, expect, vi } from 'vitest';
import { persistAssembledTeam, type PersistDeps, type PersistInput } from '../persistAssembledTeam';

function makeInput(): PersistInput {
  return {
    agentSpecs: [{ name: 'PM', soul: 'You are PM', model: undefined, tools: undefined, raci: undefined }],
    teamMeta: { name: 'BMAD 团队', description: 'goal', workspaceId: 'ws-1' },
    buildWorkflow: (ids) => ({ nodes: [{ id: 'n1', type: 'agentTask', position: { x: 0, y: 0 }, data: { agentId: ids[0], name: 'PM', soul: 'PM' } }], edges: [] }),
    buildPolicyMatrix: (ids) => ({ [ids[0]]: { [ids[0]]: 'permit' } }),
    buildGroup: (teamId, ids, matrix) => ({ name: 'BMAD 团队', agentIds: ids, policyMatrix: matrix, teamId }),
  };
}

function okDeps(overrides: Partial<PersistDeps> = {}): PersistDeps {
  return {
    quickCreateAgent: vi.fn(async () => ({ agent_id: 'a1' })),
    createTeam: vi.fn(async () => ({ team_id: 't1' })),
    putTeamWorkflow: vi.fn(async () => undefined),
    putTeamPolicy: vi.fn(async () => undefined),
    createGroup: vi.fn(async () => ({ groupId: 'g1' })),
    ...overrides,
  };
}

describe('persistAssembledTeam', () => {
  it('全部成功 → fullyPersisted=true, 无 failedSteps', async () => {
    const r = await persistAssembledTeam(makeInput(), okDeps());
    expect(r.teamId).toBe('t1');
    expect(r.fullyPersisted).toBe(true);
    expect(r.failedSteps).toEqual([]);
  });

  it('[REGRESSION] putTeamWorkflow 抛错 → 标 workflow failed、fullyPersisted=false、不假成功', async () => {
    const r = await persistAssembledTeam(
      makeInput(),
      okDeps({ putTeamWorkflow: vi.fn(async () => { throw new Error('disk full'); }) }),
    );
    expect(r.teamId).toBe('t1');
    expect(r.steps.workflow).toBe('failed');
    expect(r.failedSteps).toContain('workflow');
    expect(r.fullyPersisted).toBe(false);
  });

  it('[REGRESSION] putTeamPolicy 抛错 → 标 policy failed、fullyPersisted=false', async () => {
    const r = await persistAssembledTeam(
      makeInput(),
      okDeps({ putTeamPolicy: vi.fn(async () => { throw new Error('400 BAD_MATRIX'); }) }),
    );
    expect(r.steps.policy).toBe('failed');
    expect(r.failedSteps).toContain('policy');
    expect(r.fullyPersisted).toBe(false);
  });

  it('createGroup 抛错 → 容忍(group 非关键),fullyPersisted 仍 true', async () => {
    const r = await persistAssembledTeam(
      makeInput(),
      okDeps({ createGroup: vi.fn(async () => { throw new Error('no groups backend'); }) }),
    );
    expect(r.steps.group).toBe('failed');
    expect(r.fullyPersisted).toBe(true);
  });

  it('quickCreateAgent 抛错 → steps.agents=failed, fatalError 置位、不假成功', async () => {
    const r = await persistAssembledTeam(
      makeInput(),
      okDeps({ quickCreateAgent: vi.fn(async () => { throw new Error('network'); }) }),
    );
    expect(r.steps.agents).toBe('failed');
    expect(r.fatalError).toBeInstanceOf(Error);
    expect(r.teamId).toBeNull();
    expect(r.fullyPersisted).toBe(false);
  });

  it('createTeam 抛错 → fatalError 置位、teamId null、fullyPersisted=false', async () => {
    const r = await persistAssembledTeam(
      makeInput(),
      okDeps({ createTeam: vi.fn(async () => { throw new Error('500'); }) }),
    );
    expect(r.fatalError).toBeInstanceOf(Error);
    expect(r.teamId).toBeNull();
    expect(r.fullyPersisted).toBe(false);
  });
});
