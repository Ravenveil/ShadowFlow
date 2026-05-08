/**
 * SceneCanvasShell tests — Story 8.3 R2-HIGH-5 (AC4, AC8)
 *
 * Covers: empty state, no-roles empty state, team+boss+worker node rendering,
 * node click triggers setSelection.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { SceneCanvasShell } from './SceneCanvasShell';
import { useBuilderStore } from '../../stores/builderStore';
import type { AgentBlueprint, RoleProfile } from '../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorker(id: string, name: string): RoleProfile {
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

function makeBoss(id: string, name: string, workers: RoleProfile[]): RoleProfile {
  return { ...makeWorker(id, name), can_spawn_tasks: true, sub_agents: workers };
}

function makeBlueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    blueprint_id: 'bp-canvas',
    version: '1',
    name: 'Canvas Team',
    goal: 'Test canvas',
    audience: 'QA',
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

function resetStore() {
  useBuilderStore.setState({ mode: 'scene', blueprint: null, selection: null, treeExpanded: {}, lastSmokeRunResult: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneCanvasShell — empty states', () => {
  beforeEach(resetStore);

  it('shows no-roles guidance overlay when blueprint has roles=[] but still renders canvas', () => {
    const bp = makeBlueprint({ role_profiles: [] });
    render(<SceneCanvasShell blueprint={bp} />);
    // Guidance overlay present
    expect(screen.getByTestId('scene-canvas-no-roles')).toBeInTheDocument();
    // Canvas + team root node still rendered (team node is in projection even with 0 roles)
    expect(screen.getByTestId('canvas-node-team')).toBeInTheDocument();
  });
});

describe('SceneCanvasShell — node rendering (AC4)', () => {
  beforeEach(resetStore);

  it('renders team root canvas node', () => {
    const bp = makeBlueprint({ role_profiles: [makeWorker('w1', 'Solo')] });
    render(<SceneCanvasShell blueprint={bp} />);
    expect(screen.getByTestId('canvas-node-team')).toBeInTheDocument();
  });

  it('renders boss node and worker sub-agent node', () => {
    const worker = makeWorker('sub1', 'Sub Agent');
    const boss = makeBoss('boss1', 'Manager', [worker]);
    const bp = makeBlueprint({ role_profiles: [boss] });
    render(<SceneCanvasShell blueprint={bp} />);
    expect(screen.getByTestId('canvas-node-boss1')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-node-sub1')).toBeInTheDocument();
  });

  it('renders top-level worker node', () => {
    const bp = makeBlueprint({ role_profiles: [makeWorker('w2', 'Worker Two')] });
    render(<SceneCanvasShell blueprint={bp} />);
    expect(screen.getByTestId('canvas-node-w2')).toBeInTheDocument();
  });
});

describe('SceneCanvasShell — node click sets selection (AC4, AC6)', () => {
  beforeEach(resetStore);

  it('clicking a canvas node calls setSelection in store', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint({ role_profiles: [makeWorker('w3', 'Clickable')] });
    render(<SceneCanvasShell blueprint={bp} />);

    expect(useBuilderStore.getState().selection).toBeNull();
    await user.click(screen.getByTestId('canvas-node-w3'));
    expect(useBuilderStore.getState().selection).toBe('w3');
  });

  it('selected node has aria-pressed=true', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint({ role_profiles: [makeWorker('w4', 'Selected')] });
    render(<SceneCanvasShell blueprint={bp} />);

    await user.click(screen.getByTestId('canvas-node-w4'));
    expect(screen.getByTestId('canvas-node-w4')).toHaveAttribute('aria-pressed', 'true');
  });
});
