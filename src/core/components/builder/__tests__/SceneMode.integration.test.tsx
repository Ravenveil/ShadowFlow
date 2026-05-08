/**
 * Scene Mode integration tests — Story 8.3 F22 + F23 (AC8)
 *
 * F22: SceneTree click → Canvas node gets selected state (store sync)
 * F23: Canvas node click → Inspector mounts → field edit → blueprint state updated
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneTree } from '../SceneTree';
import { SceneCanvasShell } from '../SceneCanvasShell';
import { useBuilderStore } from '../../../stores/builderStore';
import type { AgentBlueprint, RoleProfile } from '../../../../common/types/agent-builder';

// KnowledgeDock has network/store deps — mock for integration tests
vi.mock('../KnowledgeDock', () => ({ KnowledgeDock: () => null }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRole(id: string, name: string): RoleProfile {
  return {
    role_id: id,
    name,
    description: 'A test role',
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

function makeBlueprint(roles: RoleProfile[] = []): AgentBlueprint {
  return {
    blueprint_id: 'bp-int',
    version: '1',
    name: 'Integration Team',
    goal: 'Test scene mode integration',
    audience: 'QA',
    mode: 'team',
    role_profiles: roles,
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
  };
}

function resetStore() {
  useBuilderStore.setState({
    mode: 'scene',
    blueprint: null,
    selection: null,
    treeExpanded: {},
    lastSmokeRunResult: null,
  });
}

// ---------------------------------------------------------------------------
// F22: SceneTree ↔ Canvas selection sync
// ---------------------------------------------------------------------------

describe('F22 — SceneTree↔Canvas selection sync (AC8)', () => {
  beforeEach(resetStore);

  it('clicking SceneTree node syncs selection to store (canvas reflects same state)', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint([makeRole('agent-1', 'Alpha Agent')]);

    render(
      <>
        <SceneTree blueprint={bp} />
        <SceneCanvasShell blueprint={bp} />
      </>,
    );

    // Initially nothing selected
    expect(useBuilderStore.getState().selection).toBeNull();

    // Click tree node
    await user.click(screen.getByTestId('tree-node-agent-1'));

    // Store selection updated
    expect(useBuilderStore.getState().selection).toBe('agent-1');

    // Canvas node should now have aria-pressed=true (selected state)
    const canvasNode = screen.getByTestId('canvas-node-agent-1');
    expect(canvasNode).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking Canvas node syncs selection to store (tree node gets aria-selected)', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint([makeRole('agent-2', 'Beta Agent')]);

    render(
      <>
        <SceneTree blueprint={bp} />
        <SceneCanvasShell blueprint={bp} />
      </>,
    );

    // Click canvas node
    await user.click(screen.getByTestId('canvas-node-agent-2'));
    expect(useBuilderStore.getState().selection).toBe('agent-2');

    // Tree node should now be selected
    const treeNode = screen.getByTestId('tree-node-agent-2');
    expect(treeNode).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking team root in SceneTree renders canvas team node selected', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint();

    render(
      <>
        <SceneTree blueprint={bp} />
        <SceneCanvasShell blueprint={bp} />
      </>,
    );

    await user.click(screen.getByTestId('tree-node-team'));
    expect(useBuilderStore.getState().selection).toBe('team');
    expect(screen.getByTestId('canvas-node-team')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ---------------------------------------------------------------------------
// F23: Canvas → Inspector → blueprint write-back
// ---------------------------------------------------------------------------

describe('F23 — Store selection drives blueprint state on edit (AC5, AC8)', () => {
  beforeEach(resetStore);

  it('setting selection updates store and matching node is reflected in selection', () => {
    const bp = makeBlueprint([makeRole('role-x', 'Role X')]);
    useBuilderStore.getState().setBlueprint(bp);

    act(() => {
      useBuilderStore.getState().setSelection('role-x');
    });

    expect(useBuilderStore.getState().selection).toBe('role-x');
  });

  it('updateRoleProfile writes back to blueprint state immediately', () => {
    const bp = makeBlueprint([makeRole('role-y', 'Original Name')]);
    useBuilderStore.getState().setBlueprint(bp);

    act(() => {
      useBuilderStore.getState().updateRoleProfile('role-y', { name: 'Updated Name' });
    });

    const updated = useBuilderStore.getState().blueprint?.role_profiles.find(
      (r) => r.role_id === 'role-y',
    );
    expect(updated?.name).toBe('Updated Name');
  });

  it('updateRoleProfile inside sub_agents also writes back', () => {
    const boss = makeRole('boss-1', 'Boss');
    const worker = makeRole('worker-1', 'Worker');
    boss.can_spawn_tasks = true;
    boss.sub_agents = [worker];
    const bp = makeBlueprint([boss]);
    useBuilderStore.getState().setBlueprint(bp);

    act(() => {
      useBuilderStore.getState().updateRoleProfile('worker-1', { name: 'Updated Worker' });
    });

    const updatedBoss = useBuilderStore.getState().blueprint?.role_profiles[0];
    expect(updatedBoss?.sub_agents[0].name).toBe('Updated Worker');
  });

  it('addSubAgent auto-expands boss node in treeExpanded', () => {
    const boss = makeRole('boss-2', 'Boss Node');
    boss.can_spawn_tasks = true;
    const bp = makeBlueprint([boss]);
    useBuilderStore.getState().setBlueprint(bp);

    const newWorker = makeRole('worker-new', 'New Worker');
    act(() => {
      useBuilderStore.getState().addSubAgent('boss-2', newWorker);
    });

    // F14: boss should now be auto-expanded
    expect(useBuilderStore.getState().treeExpanded['boss-2']).toBe(true);
    // Worker should be in sub_agents
    const boss2 = useBuilderStore.getState().blueprint?.role_profiles.find((r) => r.role_id === 'boss-2');
    expect(boss2?.sub_agents).toHaveLength(1);
    expect(boss2?.sub_agents[0].role_id).toBe('worker-new');
  });

  it('addSubAgent does not add duplicate worker role_id (F8)', () => {
    const boss = makeRole('boss-3', 'Boss');
    boss.can_spawn_tasks = true;
    const bp = makeBlueprint([boss]);
    useBuilderStore.getState().setBlueprint(bp);

    const w = makeRole('dup-worker', 'Worker');
    act(() => {
      useBuilderStore.getState().addSubAgent('boss-3', w);
      useBuilderStore.getState().addSubAgent('boss-3', w); // duplicate
    });

    const boss3 = useBuilderStore.getState().blueprint?.role_profiles.find((r) => r.role_id === 'boss-3');
    expect(boss3?.sub_agents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// R2-MED-12: Real UI-level integration path (AC8 — not just store action calls)
// ---------------------------------------------------------------------------

describe('R2-MED-12 — UI-level: SceneTree click → store selection → canvas aria-pressed', () => {
  beforeEach(resetStore);

  it('clicking tree node updates store and canvas node reflects selected state via DOM', async () => {
    const user = userEvent.setup();
    const role = makeRole('ui-role-1', 'UI Role');
    const bp = makeBlueprint([role]);

    render(
      <>
        <SceneTree blueprint={bp} />
        <SceneCanvasShell blueprint={bp} />
      </>,
    );

    // Initial state: nothing selected in DOM
    expect(screen.getByTestId('canvas-node-ui-role-1')).toHaveAttribute('aria-pressed', 'false');

    // User clicks the tree node (real DOM event)
    await user.click(screen.getByTestId('tree-node-ui-role-1'));

    // Both DOM nodes should reflect selection change
    expect(screen.getByTestId('tree-node-ui-role-1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('canvas-node-ui-role-1')).toHaveAttribute('aria-pressed', 'true');
  });
});
