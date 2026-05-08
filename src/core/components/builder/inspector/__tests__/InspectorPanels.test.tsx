/**
 * Inspector panel tests — Story 8.3 F21 (AC8)
 *
 * Covers: EmptyInspector, TeamInspector, SharedResourceInspector
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmptyInspector } from '../EmptyInspector';
import { TeamInspector } from '../TeamInspector';
import { SharedResourceInspector } from '../SharedResourceInspector';
import { useBuilderStore } from '../../../../stores/builderStore';
import type { AgentBlueprint, ToolPolicy } from '../../../../../common/types/agent-builder';

// KnowledgeDock has store dependencies — mock it for panel-level tests
vi.mock('../../KnowledgeDock', () => ({
  KnowledgeDock: () => <div data-testid="mock-knowledge-dock" />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTool(id: string): ToolPolicy {
  return {
    tool_id: id,
    visibility: 'enabled',
    permission_rules: [],
    default_permission: 'allow',
    trust_level: 'internal',
    side_effects: 'read_only',
    requires_confirmation: false,
    metadata: {},
  };
}

function makeBlueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    blueprint_id: 'bp-test',
    version: '1',
    name: 'Alpha Team',
    goal: 'Research AI safety',
    audience: 'Researchers',
    mode: 'team',
    role_profiles: [],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: true, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
    ...overrides,
  };
}

function resetStore() {
  useBuilderStore.setState({ mode: 'goal', blueprint: null, selection: null, treeExpanded: {}, lastSmokeRunResult: null });
}

// ---------------------------------------------------------------------------
// EmptyInspector
// ---------------------------------------------------------------------------

describe('EmptyInspector', () => {
  it('renders empty state with data-testid', () => {
    render(<EmptyInspector />);
    expect(screen.getByTestId('inspector-empty')).toBeInTheDocument();
  });

  it('shows prompt text', () => {
    render(<EmptyInspector />);
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TeamInspector
// ---------------------------------------------------------------------------

describe('TeamInspector', () => {
  beforeEach(resetStore);

  it('shows team name', () => {
    render(<TeamInspector blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('inspector-team')).toBeInTheDocument();
    expect(screen.getByText('Alpha Team')).toBeInTheDocument();
  });

  it('shows blueprint mode', () => {
    render(<TeamInspector blueprint={makeBlueprint({ mode: 'single' })} />);
    expect(screen.getByText('single')).toBeInTheDocument();
  });

  it('shows role count', () => {
    const bp = makeBlueprint();
    render(<TeamInspector blueprint={bp} />);
    // 0 roles
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('truncates long goal text', () => {
    const longGoal = 'A'.repeat(200);
    render(<TeamInspector blueprint={makeBlueprint({ goal: longGoal })} />);
    // Should display truncated version ending with ellipsis
    expect(screen.getByText((content) => content.includes('…'))).toBeInTheDocument();
  });

  it('shows audience or dash', () => {
    render(<TeamInspector blueprint={makeBlueprint({ audience: '' })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SharedResourceInspector — shared-tools
// ---------------------------------------------------------------------------

describe('SharedResourceInspector — shared-tools', () => {
  beforeEach(resetStore);

  it('renders with data-testid', () => {
    render(<SharedResourceInspector kind="shared-tools" blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('inspector-shared-tools')).toBeInTheDocument();
  });

  it('shows empty state when no tool_policies', () => {
    render(<SharedResourceInspector kind="shared-tools" blueprint={makeBlueprint()} />);
    expect(screen.getByText(/no tools bound/i)).toBeInTheDocument();
  });

  it('lists tool policies when present', () => {
    const bp = makeBlueprint({ tool_policies: [makeTool('web_search'), makeTool('code_exec')] });
    render(<SharedResourceInspector kind="shared-tools" blueprint={bp} />);
    expect(screen.getByText(/web_search/)).toBeInTheDocument();
    expect(screen.getByText(/code_exec/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SharedResourceInspector — shared-memory
// ---------------------------------------------------------------------------

describe('SharedResourceInspector — shared-memory', () => {
  beforeEach(resetStore);

  it('renders memory scope', () => {
    const bp = makeBlueprint({ memory_profile: { scope: 'persistent', writeback_target: 'vector_store', enabled: true, metadata: {} } });
    render(<SharedResourceInspector kind="shared-memory" blueprint={bp} />);
    expect(screen.getByTestId('inspector-shared-memory')).toBeInTheDocument();
    expect(screen.getByText('persistent')).toBeInTheDocument();
  });

  it('shows "none" when no writeback_target', () => {
    render(<SharedResourceInspector kind="shared-memory" blueprint={makeBlueprint()} />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SharedResourceInspector — shared-knowledge (R2-MED-8)
// ---------------------------------------------------------------------------

describe('SharedResourceInspector — shared-knowledge', () => {
  beforeEach(resetStore);

  it('renders with data-testid="inspector-shared-knowledge"', () => {
    render(<SharedResourceInspector kind="shared-knowledge" blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('inspector-shared-knowledge')).toBeInTheDocument();
  });

  it('renders KnowledgeDock inside the wrapper', () => {
    render(<SharedResourceInspector kind="shared-knowledge" blueprint={makeBlueprint()} />);
    expect(screen.getByTestId('mock-knowledge-dock')).toBeInTheDocument();
  });
});
