/**
 * RoleInspector tests — Story 8.3 (AC5, AC8)
 *
 * Covers: field rendering, edits write back to builderStore blueprint state
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { RoleInspector } from './RoleInspector';
import { useBuilderStore } from '../../../stores/builderStore';
import type { AgentBlueprint, RoleProfile } from '../../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<RoleProfile> = {}): RoleProfile {
  return {
    role_id: 'r1',
    name: 'Search Worker',
    description: 'Searches the web',
    persona: '',
    responsibilities: [],
    constraints: [],
    tools: ['web_search'],
    executor_kind: 'api',
    executor_provider: 'claude',
    executor_model: 'claude-3-5-sonnet',
    capabilities: [],
    handoff_rules: [],
    persona_traits: {},
    state_fields: [],
    can_spawn_tasks: false,
    sub_agents: [],
    metadata: { handoff_style: 'parallel' },
    ...overrides,
  };
}

function setupStore(role: RoleProfile) {
  const bp: AgentBlueprint = {
    blueprint_id: 'bp-1',
    version: '1',
    name: 'Test Team',
    goal: 'Test',
    audience: '',
    mode: 'team',
    role_profiles: [role],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
  };
  useBuilderStore.setState({ mode: 'scene', blueprint: bp, selection: role.role_id, treeExpanded: {} });
}

function resetStore() {
  useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {} });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoleInspector — rendering (AC5)', () => {
  beforeEach(() => resetStore());

  it('shows role name in header', () => {
    const role = makeRole();
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);
    expect(screen.getByTestId('inspector-role')).toBeInTheDocument();
    expect(screen.getByTestId('insp-role-title')).toHaveValue('Search Worker');
  });

  it('shows description in textarea', () => {
    const role = makeRole();
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);
    expect(screen.getByTestId('insp-role-description')).toHaveValue('Searches the web');
  });

  it('shows boss badge and workers list when isBoss=true', () => {
    const boss = makeRole({ can_spawn_tasks: true, sub_agents: [makeRole({ role_id: 'w1', name: 'Worker' })] });
    setupStore(boss);
    render(<RoleInspector role={boss} isBoss={true} />);
    expect(screen.getByTestId('insp-workers-list')).toBeInTheDocument();
    expect(screen.getByTestId('insp-workers-list').textContent).toContain('Worker');
  });

  it('does NOT show workers list when isBoss=false', () => {
    const role = makeRole();
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);
    expect(screen.queryByTestId('insp-workers-list')).not.toBeInTheDocument();
  });

  it('shows tools list', () => {
    const role = makeRole({ tools: ['web_search', 'web_fetch'] });
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);
    expect(screen.getByTestId('insp-tools-list').textContent).toContain('web_search');
  });
});

describe('RoleInspector — writes back to store (AC5)', () => {
  beforeEach(() => resetStore());

  it('editing role title updates store blueprint', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);

    const titleInput = screen.getByTestId('insp-role-title');
    await user.clear(titleInput);
    await user.type(titleInput, 'New Title');

    const updatedRole = useBuilderStore.getState().blueprint?.role_profiles[0];
    expect(updatedRole?.name).toBe('New Title');
  });

  it('editing description updates store blueprint', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);

    const descInput = screen.getByTestId('insp-role-description');
    await user.clear(descInput);
    await user.type(descInput, 'New description');

    const updatedRole = useBuilderStore.getState().blueprint?.role_profiles[0];
    expect(updatedRole?.description).toBe('New description');
  });

  it('selecting sequential handoff style updates metadata', async () => {
    const user = userEvent.setup();
    const role = makeRole({ metadata: { handoff_style: 'parallel' } });
    setupStore(role);
    render(<RoleInspector role={role} isBoss={false} />);

    const seqChips = screen.getAllByText('sequential');
    await user.click(seqChips[0]);

    const updatedRole = useBuilderStore.getState().blueprint?.role_profiles[0];
    expect((updatedRole?.metadata as Record<string, unknown>)?.handoff_style).toBe('sequential');
  });
});
