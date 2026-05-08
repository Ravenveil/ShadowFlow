/**
 * SceneTree tests — Story 8.3 (AC3, AC8)
 *
 * Covers: tree rendering, expand/collapse, selection sync
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneTree } from './SceneTree';
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

function makeBlueprint(roles: RoleProfile[] = []): AgentBlueprint {
  return {
    blueprint_id: 'bp-1',
    version: '1',
    name: 'Test Team',
    goal: 'Do stuff',
    audience: 'Devs',
    mode: 'team',
    role_profiles: roles,
    tool_policies: [
      { tool_id: 'web_search', trust_level: 'internal', side_effects: 'read_only', requires_confirmation: false, metadata: {}, visibility: 'enabled', permission_rules: [], default_permission: 'allow' },
    ],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: true, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
  };
}

function resetStore() {
  useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {}, lastSmokeRunResult: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneTree — rendering (AC3)', () => {
  beforeEach(() => resetStore());

  it('shows team root node', () => {
    render(<SceneTree blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('tree-node-team')).toBeInTheDocument();
  });

  it('shows top-level worker roles', () => {
    const bp = makeBlueprint([makeWorker('w1', 'Worker One')]);
    render(<SceneTree blueprint={bp} />);
    expect(screen.getByTestId('tree-node-w1')).toBeInTheDocument();
    expect(screen.getByTestId('tree-node-w1').textContent).toContain('Worker One');
  });

  it('shows boss role with boss badge', () => {
    const boss = makeBoss('boss1', 'Research Manager', [makeWorker('w1', 'Search Worker')]);
    render(<SceneTree blueprint={makeBlueprint([boss])} />);
    const bossNode = screen.getByTestId('tree-node-boss1');
    expect(bossNode.textContent).toContain('Research Manager');
    expect(bossNode.textContent).toContain('boss');
  });

  it('shows shared-tools when tool_policies exist', () => {
    render(<SceneTree blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('tree-node-shared-tools')).toBeInTheDocument();
  });

  it('shows shared-memory when memory_profile.enabled', () => {
    render(<SceneTree blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('tree-node-shared-memory')).toBeInTheDocument();
  });
});

describe('SceneTree — selection drives store (AC3)', () => {
  beforeEach(() => resetStore());

  it('clicking a role node sets selection in store', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint([makeWorker('w1', 'Worker One')]);
    render(<SceneTree blueprint={bp} />);

    await user.click(screen.getByTestId('tree-node-w1'));
    expect(useBuilderStore.getState().selection).toBe('w1');
  });

  it('clicking team root sets selection to "team"', async () => {
    const user = userEvent.setup();
    render(<SceneTree blueprint={makeBlueprint()} />);

    await user.click(screen.getByTestId('tree-node-team'));
    expect(useBuilderStore.getState().selection).toBe('team');
  });

  it('selected node gets aria-selected=true', async () => {
    const user = userEvent.setup();
    const bp = makeBlueprint([makeWorker('w1', 'Worker One')]);
    render(<SceneTree blueprint={bp} />);

    await user.click(screen.getByTestId('tree-node-w1'));
    expect(screen.getByTestId('tree-node-w1')).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking shared-tools sets selection to "shared-tools"', async () => {
    const user = userEvent.setup();
    render(<SceneTree blueprint={makeBlueprint()} />);

    await user.click(screen.getByTestId('tree-node-shared-tools'));
    expect(useBuilderStore.getState().selection).toBe('shared-tools');
  });
});

describe('SceneTree — expand/collapse boss (AC3)', () => {
  beforeEach(() => resetStore());

  it('sub-agents hidden when boss collapsed', () => {
    // treeExpanded empty → boss not expanded
    const boss = makeBoss('boss1', 'Manager', [makeWorker('w1', 'Worker')]);
    render(<SceneTree blueprint={makeBlueprint([boss])} />);
    // worker node not visible when collapsed
    expect(screen.queryByTestId('tree-node-w1')).not.toBeInTheDocument();
  });

  it('sub-agents visible when boss expanded', () => {
    // Pre-expand boss1 in store
    useBuilderStore.setState({ ...useBuilderStore.getState(), treeExpanded: { boss1: true } });
    const boss = makeBoss('boss1', 'Manager', [makeWorker('w1', 'Worker')]);
    render(<SceneTree blueprint={makeBlueprint([boss])} />);
    expect(screen.getByTestId('tree-node-w1')).toBeInTheDocument();
  });

  it('clicking boss toggles expansion via store', async () => {
    const user = userEvent.setup();
    const boss = makeBoss('boss1', 'Manager', [makeWorker('w1', 'Worker')]);
    render(<SceneTree blueprint={makeBlueprint([boss])} />);

    // Boss caret is now a button with unique data-testid (R2-MED-11)
    const caret = screen.getByTestId('tree-node-caret-boss1');
    await user.click(caret);

    expect(useBuilderStore.getState().treeExpanded['boss1']).toBe(true);
    expect(screen.getByTestId('tree-node-w1')).toBeInTheDocument();
  });
});

describe('SceneTree — mode=single blueprint shows Team root (AC3, R2-HIGH-8)', () => {
  beforeEach(() => resetStore());

  it('renders team root for mode=single blueprint', () => {
    const bp = makeBlueprint([makeWorker('w1', 'Solo Agent')]);
    const singleBp = { ...bp, mode: 'single' as const };
    render(<SceneTree blueprint={singleBp} />);
    expect(screen.getByTestId('tree-node-team')).toBeInTheDocument();
    expect(screen.getByTestId('tree-node-w1')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Story 13.3 AC1 — import-from-catalog button visibility
// ---------------------------------------------------------------------------

describe('SceneTree — import-from-catalog button (Story 13.3 AC1)', () => {
  beforeEach(() => resetStore());

  it('renders import button when mode=team AND onOpenCatalogImport is provided', () => {
    const bp = makeBlueprint([makeWorker('w1', 'Worker')]);
    render(<SceneTree blueprint={bp} onOpenCatalogImport={() => {}} />);
    expect(screen.getByTestId('import-from-catalog-btn')).toBeInTheDocument();
  });

  it('hides import button when mode=single (regardless of onOpenCatalogImport)', () => {
    const bp = makeBlueprint([makeWorker('w1', 'Solo')]);
    const singleBp = { ...bp, mode: 'single' as const };
    render(<SceneTree blueprint={singleBp} onOpenCatalogImport={() => {}} />);
    expect(screen.queryByTestId('import-from-catalog-btn')).not.toBeInTheDocument();
  });

  it('hides import button when onOpenCatalogImport prop is omitted', () => {
    const bp = makeBlueprint([makeWorker('w1', 'Worker')]);
    render(<SceneTree blueprint={bp} />);
    expect(screen.queryByTestId('import-from-catalog-btn')).not.toBeInTheDocument();
  });

  it('clicking import button invokes onOpenCatalogImport', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const bp = makeBlueprint([makeWorker('w1', 'Worker')]);
    render(<SceneTree blueprint={bp} onOpenCatalogImport={onOpen} />);
    await user.click(screen.getByTestId('import-from-catalog-btn'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
