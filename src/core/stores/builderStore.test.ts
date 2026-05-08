/**
 * builderStore tests — Story 8.3 (AC6, AC8) + Story 8.4 (AC2, AC3)
 *
 * Covers: blueprintToSceneProjection 派生逻辑, store actions, knowledge binding CRUD
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  blueprintToSceneProjection,
  useBuilderStore,
} from './builderStore';
import type { AgentBlueprint, KnowledgeBinding, RoleProfile } from '../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkerRole(id: string, name: string): RoleProfile {
  return {
    role_id: id,
    name,
    description: '',
    persona: '',
    responsibilities: [],
    constraints: [],
    tools: [],
    executor_kind: 'api',
    executor_provider: 'claude',
    executor_model: 'claude-3-5-sonnet',
    can_spawn_tasks: false,
    sub_agents: [],
    capabilities: [],
    handoff_rules: [],
    persona_traits: {},
    state_fields: [],
    metadata: {},
  };
}

function makeBossRole(id: string, name: string, workers: RoleProfile[]): RoleProfile {
  return {
    ...makeWorkerRole(id, name),
    can_spawn_tasks: true,
    sub_agents: workers,
  };
}

function makeBlueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    blueprint_id: 'bp-1',
    version: '1',
    name: 'Test Team',
    goal: 'Do stuff',
    audience: 'Devs',
    mode: 'team',
    role_profiles: [],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// blueprintToSceneProjection
// ---------------------------------------------------------------------------

describe('blueprintToSceneProjection — null blueprint', () => {
  it('returns empty when blueprint is null', () => {
    const proj = blueprintToSceneProjection(null);
    expect(proj.nodes).toHaveLength(0);
    expect(proj.edges).toHaveLength(0);
  });
});

describe('blueprintToSceneProjection — basic blueprint', () => {
  it('always creates a team root node', () => {
    const bp = makeBlueprint();
    const { nodes } = blueprintToSceneProjection(bp);
    expect(nodes.find((n) => n.id === 'team')).toBeDefined();
    expect(nodes.find((n) => n.id === 'team')?.kind).toBe('team');
  });

  it('projects top-level worker role correctly', () => {
    const bp = makeBlueprint({
      role_profiles: [makeWorkerRole('w1', 'Worker One')],
    });
    const { nodes, edges } = blueprintToSceneProjection(bp);
    const workerNode = nodes.find((n) => n.id === 'w1');
    expect(workerNode).toBeDefined();
    expect(workerNode?.kind).toBe('worker');
    expect(edges.some((e) => e.from === 'team' && e.to === 'w1')).toBe(true);
  });

  it('projects boss + sub_agents correctly', () => {
    const worker = makeWorkerRole('w1', 'Worker');
    const boss = makeBossRole('boss1', 'Boss', [worker]);
    const bp = makeBlueprint({ role_profiles: [boss] });
    const { nodes, edges } = blueprintToSceneProjection(bp);

    expect(nodes.find((n) => n.id === 'boss1')?.kind).toBe('boss');
    expect(nodes.find((n) => n.id === 'w1')?.kind).toBe('worker');
    expect(edges.some((e) => e.from === 'boss1' && e.to === 'w1' && e.kind === 'spawn_task')).toBe(true);
  });

  it('creates shared-tools node when tool_policies exist', () => {
    const bp = makeBlueprint({
      tool_policies: [
        { tool_id: 'web_search', trust_level: 'internal', side_effects: 'read_only', requires_confirmation: false, metadata: {}, visibility: 'enabled', permission_rules: [], default_permission: 'allow' },
      ],
    });
    const { nodes } = blueprintToSceneProjection(bp);
    expect(nodes.find((n) => n.id === 'shared-tools')).toBeDefined();
  });

  it('always creates shared-tools node even when no tool_policies (Patch 3 — mirrors shared-knowledge)', () => {
    // Users need the ToolPicker entry point even before adding any policy
    const bp = makeBlueprint({ tool_policies: [] });
    const { nodes } = blueprintToSceneProjection(bp);
    expect(nodes.find((n) => n.id === 'shared-tools')).toBeDefined();
  });

  it('always creates shared-knowledge node (AC1 — Knowledge Dock first-class entry)', () => {
    // Empty bindings — node still present so users can click to open the dock
    const bp = makeBlueprint({ knowledge_bindings: [] });
    const { nodes } = blueprintToSceneProjection(bp);
    expect(nodes.find((n) => n.id === 'shared-knowledge')).toBeDefined();
  });

  it('creates shared-memory node when memory_profile.enabled', () => {
    const bp = makeBlueprint({
      memory_profile: { scope: 'session', writeback_target: null, enabled: true, metadata: {} },
    });
    const { nodes } = blueprintToSceneProjection(bp);
    expect(nodes.find((n) => n.id === 'shared-memory')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// builderStore actions
// ---------------------------------------------------------------------------

describe('useBuilderStore — setBlueprint', () => {
  beforeEach(() => {
    useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {} });
  });

  it('sets blueprint and auto-expands boss roles', () => {
    const worker = makeWorkerRole('w1', 'Worker');
    const boss = makeBossRole('boss1', 'Boss', [worker]);
    const bp = makeBlueprint({ role_profiles: [boss] });

    useBuilderStore.getState().setBlueprint(bp);
    const state = useBuilderStore.getState();

    expect(state.blueprint).not.toBeNull();
    expect(state.treeExpanded['boss1']).toBe(true);
  });
});

describe('useBuilderStore — setSelection', () => {
  beforeEach(() => {
    useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {} });
  });

  it('sets selection to a role id', () => {
    useBuilderStore.getState().setSelection('r1');
    expect(useBuilderStore.getState().selection).toBe('r1');
  });

  it('can clear selection', () => {
    useBuilderStore.getState().setSelection('r1');
    useBuilderStore.getState().setSelection(null);
    expect(useBuilderStore.getState().selection).toBeNull();
  });
});

describe('useBuilderStore — updateRoleProfile', () => {
  beforeEach(() => {
    const worker = makeWorkerRole('w1', 'Original Name');
    const bp = makeBlueprint({ role_profiles: [worker] });
    useBuilderStore.setState({ mode: 'goal', blueprint: bp, selection: null, treeExpanded: {} });
  });

  it('updates a top-level role name', () => {
    useBuilderStore.getState().updateRoleProfile('w1', { name: 'Updated Name' });
    const bp = useBuilderStore.getState().blueprint!;
    expect(bp.role_profiles[0].name).toBe('Updated Name');
  });

  it('updates a sub_agent name', () => {
    const worker = makeWorkerRole('sub1', 'Sub Worker');
    const boss = makeBossRole('boss1', 'Boss', [worker]);
    const bp = makeBlueprint({ role_profiles: [boss] });
    useBuilderStore.setState({ mode: 'goal', blueprint: bp, selection: null, treeExpanded: {} });

    useBuilderStore.getState().updateRoleProfile('sub1', { name: 'Updated Sub' });
    const updated = useBuilderStore.getState().blueprint!;
    expect(updated.role_profiles[0].sub_agents[0].name).toBe('Updated Sub');
  });
});

describe('useBuilderStore — toggleTreeNode', () => {
  beforeEach(() => {
    useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: { 'n1': true } });
  });

  it('toggles expanded false→true', () => {
    useBuilderStore.getState().toggleTreeNode('new-node');
    expect(useBuilderStore.getState().treeExpanded['new-node']).toBe(true);
  });

  it('toggles expanded true→false', () => {
    useBuilderStore.getState().toggleTreeNode('n1');
    expect(useBuilderStore.getState().treeExpanded['n1']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Story 8.4 — knowledge binding actions (AC2, AC3)
// ---------------------------------------------------------------------------

function makeKB(overrides: Partial<KnowledgeBinding> = {}): KnowledgeBinding {
  return {
    binding_id: 'kb-1',
    source_type: 'url',
    source_ref: 'https://example.com',
    retrieval_mode: 'auto',
    citation_required: false,
    freshness_hint: 'static',
    scope: 'shared',
    target_ref: null,
    metadata: {},
    ...overrides,
  };
}

describe('useBuilderStore — addKnowledgeBinding (AC2)', () => {
  beforeEach(() => {
    useBuilderStore.setState({ mode: 'goal', blueprint: makeBlueprint(), selection: null, treeExpanded: {} });
  });

  it('adds a binding to blueprint.knowledge_bindings', () => {
    const binding = makeKB({ binding_id: 'kb-add' });
    useBuilderStore.getState().addKnowledgeBinding(binding);
    const bindings = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
    expect(bindings).toHaveLength(1);
    expect(bindings[0].binding_id).toBe('kb-add');
  });

  it('preserves all required fields', () => {
    const binding = makeKB({ binding_id: 'kb-fields', source_type: 'pack', retrieval_mode: 'semantic', freshness_hint: 'daily' });
    useBuilderStore.getState().addKnowledgeBinding(binding);
    const [b] = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
    expect(b.source_type).toBe('pack');
    expect(b.retrieval_mode).toBe('semantic');
    expect(b.freshness_hint).toBe('daily');
  });

  it('does nothing when blueprint is null', () => {
    useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {} });
    useBuilderStore.getState().addKnowledgeBinding(makeKB());
    expect(useBuilderStore.getState().blueprint).toBeNull();
  });
});

describe('useBuilderStore — removeKnowledgeBinding (AC2)', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      mode: 'goal',
      blueprint: makeBlueprint({ knowledge_bindings: [makeKB({ binding_id: 'kb-rm' })] }),
      selection: null,
      treeExpanded: {},
    });
  });

  it('removes the binding by id', () => {
    useBuilderStore.getState().removeKnowledgeBinding('kb-rm');
    expect(useBuilderStore.getState().blueprint?.knowledge_bindings).toHaveLength(0);
  });

  it('is idempotent when id does not exist', () => {
    useBuilderStore.getState().removeKnowledgeBinding('kb-ghost');
    expect(useBuilderStore.getState().blueprint?.knowledge_bindings).toHaveLength(1);
  });
});

describe('useBuilderStore — updateKnowledgeBinding (AC2, AC5)', () => {
  beforeEach(() => {
    useBuilderStore.setState({
      mode: 'goal',
      blueprint: makeBlueprint({ knowledge_bindings: [makeKB({ binding_id: 'kb-up', citation_required: false })] }),
      selection: null,
      treeExpanded: {},
    });
  });

  it('updates citation_required', () => {
    useBuilderStore.getState().updateKnowledgeBinding('kb-up', { citation_required: true });
    const [b] = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
    expect(b.citation_required).toBe(true);
  });

  it('updates multiple fields at once', () => {
    useBuilderStore.getState().updateKnowledgeBinding('kb-up', { freshness_hint: 'daily', retrieval_mode: 'hybrid' });
    const [b] = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
    expect(b.freshness_hint).toBe('daily');
    expect(b.retrieval_mode).toBe('hybrid');
  });

  it('is idempotent when id does not exist', () => {
    useBuilderStore.getState().updateKnowledgeBinding('kb-ghost', { citation_required: true });
    const [b] = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
    expect(b.citation_required).toBe(false); // unchanged
  });
});

// ---------------------------------------------------------------------------
// R2-HIGH-6 — selection preserved across mode switches (AC2, AC8)
// ---------------------------------------------------------------------------

describe('useBuilderStore — selection preserved across mode switches (R2-HIGH-6)', () => {
  beforeEach(() => {
    useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {}, lastSmokeRunResult: null });
  });

  it('setMode does not clear selection', () => {
    useBuilderStore.getState().setSelection('boss-1');
    useBuilderStore.getState().setMode('scene');
    expect(useBuilderStore.getState().selection).toBe('boss-1');
  });

  it('setMode scene→goal preserves selection', () => {
    useBuilderStore.getState().setSelection('shared-knowledge');
    useBuilderStore.getState().setMode('scene');
    useBuilderStore.getState().setMode('goal');
    expect(useBuilderStore.getState().selection).toBe('shared-knowledge');
  });
});

// ---------------------------------------------------------------------------
// R2-HIGH-7 — updateToolPolicy (update + create paths)
// ---------------------------------------------------------------------------

describe('useBuilderStore — updateToolPolicy (R2-HIGH-7)', () => {
  beforeEach(() => {
    const bp = makeBlueprint({
      tool_policies: [{
        tool_id: 'web_search',
        visibility: 'enabled',
        permission_rules: [],
        default_permission: 'allow',
        trust_level: 'internal',
        side_effects: 'read_only',
        requires_confirmation: false,
        metadata: {},
      }],
    });
    useBuilderStore.setState({ mode: 'goal', blueprint: bp, selection: null, treeExpanded: {}, lastSmokeRunResult: null });
  });

  it('updates existing tool policy', () => {
    useBuilderStore.getState().updateToolPolicy('web_search', { trust_level: 'external' });
    const policy = useBuilderStore.getState().blueprint?.tool_policies.find((p) => p.tool_id === 'web_search');
    expect(policy?.trust_level).toBe('external');
  });

  it('creates new tool policy when tool_id does not exist', () => {
    useBuilderStore.getState().updateToolPolicy('code_exec', { requires_confirmation: true });
    const policies = useBuilderStore.getState().blueprint?.tool_policies ?? [];
    expect(policies).toHaveLength(2);
    const newPolicy = policies.find((p) => p.tool_id === 'code_exec');
    expect(newPolicy).toBeDefined();
    expect(newPolicy?.requires_confirmation).toBe(true);
    expect(newPolicy?.visibility).toBe('enabled'); // default
  });
});
