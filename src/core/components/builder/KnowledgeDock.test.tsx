/**
 * KnowledgeDock tests — Story 8.4 (AC1–AC8)
 *
 * Covers:
 *  - Empty state display (AC6)
 *  - Add source: file / url / pack / skip (AC2, AC3)
 *  - citation_required toggle + save (AC5)
 *  - Error state on invalid URL / missing input (AC8)
 *  - Blueprint state write-back (AC2)
 *  - Scope filtering: shared vs agent (AC2)
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeDock } from './KnowledgeDock';
import { useBuilderStore } from '../../stores/builderStore';
import type { AgentBlueprint, KnowledgeBinding, RoleProfile } from '../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRole(id: string): RoleProfile {
  return {
    role_id: id, name: 'Worker', description: '', persona: '',
    responsibilities: [], constraints: [], tools: [],
    executor_kind: 'api', executor_provider: 'claude', executor_model: 'claude-3-5-sonnet',
    can_spawn_tasks: false, sub_agents: [],
    capabilities: [], handoff_rules: [], persona_traits: {}, state_fields: [],
    metadata: {},
  };
}

function makeBinding(overrides: Partial<KnowledgeBinding> = {}): KnowledgeBinding {
  return {
    binding_id: 'kb-test-1',
    source_type: 'file',
    source_ref: 'report.pdf',
    retrieval_mode: 'auto',
    citation_required: false,
    freshness_hint: 'static',
    scope: 'shared',
    target_ref: null,
    metadata: {},
    ...overrides,
  };
}

function makeBlueprint(
  overrides: Partial<AgentBlueprint> = {},
): AgentBlueprint {
  return {
    blueprint_id: 'bp-1', version: '1', name: 'Test', goal: 'Test', audience: 'Devs',
    mode: 'team',
    role_profiles: [makeRole('r1')],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
    ...overrides,
  };
}

function resetStore(bp?: AgentBlueprint) {
  useBuilderStore.setState({
    mode: 'scene',
    blueprint: bp ?? makeBlueprint(),
    selection: null,
    treeExpanded: {},
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeDock — empty state (AC6)', () => {
  beforeEach(() => resetStore());

  it('renders the dock panel', () => {
    render(<KnowledgeDock scope="shared" />);
    expect(screen.getByTestId('knowledge-dock')).toBeInTheDocument();
  });

  it('shows empty state when no bindings', () => {
    render(<KnowledgeDock scope="shared" />);
    expect(screen.getByTestId('knowledge-empty-state')).toBeInTheDocument();
    expect(screen.getByText('还没有绑定任何资料')).toBeInTheDocument();
    expect(screen.getByText(/可先上传文档/)).toBeInTheDocument();
  });

  it('shows "添加来源" button in idle state', () => {
    render(<KnowledgeDock scope="shared" />);
    expect(screen.getByTestId('btn-add-source')).toBeInTheDocument();
  });

  it('shows Smoke Run hint', () => {
    render(<KnowledgeDock scope="shared" />);
    expect(screen.getByTestId('smoke-run-hint')).toBeInTheDocument();
  });
});

describe('KnowledgeDock — existing bindings (AC2, AC3)', () => {
  it('renders binding rows when bindings exist', () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [makeBinding({ binding_id: 'kb-a', source_ref: 'paper.pdf' })],
    }));
    render(<KnowledgeDock scope="shared" />);
    expect(screen.getByTestId('binding-row-kb-a')).toBeInTheDocument();
    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
  });

  it('hides empty state when bindings exist', () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [makeBinding()],
    }));
    render(<KnowledgeDock scope="shared" />);
    expect(screen.queryByTestId('knowledge-empty-state')).not.toBeInTheDocument();
  });

  it('filters to scope=shared only, excludes agent bindings', () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [
        makeBinding({ binding_id: 'kb-shared', scope: 'shared', target_ref: null }),
        makeBinding({ binding_id: 'kb-agent', scope: 'agent', target_ref: 'r1' }),
      ],
    }));
    render(<KnowledgeDock scope="shared" />);
    expect(screen.getByTestId('binding-row-kb-shared')).toBeInTheDocument();
    expect(screen.queryByTestId('binding-row-kb-agent')).not.toBeInTheDocument();
  });

  it('agent scope shows only its own bindings', () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [
        makeBinding({ binding_id: 'kb-shared', scope: 'shared', target_ref: null }),
        makeBinding({ binding_id: 'kb-r1', scope: 'agent', target_ref: 'r1' }),
        makeBinding({ binding_id: 'kb-r2', scope: 'agent', target_ref: 'r2' }),
      ],
    }));
    render(<KnowledgeDock scope="agent" targetRef="r1" />);
    expect(screen.getByTestId('binding-row-kb-r1')).toBeInTheDocument();
    expect(screen.queryByTestId('binding-row-kb-shared')).not.toBeInTheDocument();
    expect(screen.queryByTestId('binding-row-kb-r2')).not.toBeInTheDocument();
  });
});

describe('KnowledgeDock — delete binding (AC2)', () => {
  it('deletes a binding and shows empty state', async () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [makeBinding({ binding_id: 'kb-del' })],
    }));
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);

    expect(screen.getByTestId('binding-row-kb-del')).toBeInTheDocument();
    await user.click(screen.getByTestId('binding-delete-kb-del'));

    expect(screen.queryByTestId('binding-row-kb-del')).not.toBeInTheDocument();
    expect(screen.getByTestId('knowledge-empty-state')).toBeInTheDocument();

    // Verify store updated
    const state = useBuilderStore.getState();
    expect(state.blueprint?.knowledge_bindings).toHaveLength(0);
  });
});

describe('KnowledgeDock — citation toggle (AC5)', () => {
  it('toggles citation_required and saves to blueprint state', async () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [makeBinding({ binding_id: 'kb-cite', citation_required: false })],
    }));
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);

    const toggle = screen.getByTestId('citation-toggle-kb-cite');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Smoke run notice appears
    expect(screen.getByTestId('citation-notice-kb-cite')).toBeInTheDocument();

    // Blueprint state updated
    const binding = useBuilderStore.getState().blueprint?.knowledge_bindings[0];
    expect(binding?.citation_required).toBe(true);
  });

  it('hides citation notice when citation_required is off', () => {
    resetStore(makeBlueprint({
      knowledge_bindings: [makeBinding({ binding_id: 'kb-nc', citation_required: false })],
    }));
    render(<KnowledgeDock scope="shared" />);
    expect(screen.queryByTestId('citation-notice-kb-nc')).not.toBeInTheDocument();
  });
});

describe('KnowledgeDock — add source panel (AC2, AC3)', () => {
  beforeEach(() => resetStore());

  it('opens add panel on button click', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);

    await user.click(screen.getByTestId('btn-add-source'));
    expect(screen.getByTestId('add-source-panel')).toBeInTheDocument();
    expect(screen.getByTestId('source-tabs')).toBeInTheDocument();
  });

  it('shows all four tabs', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);
    await user.click(screen.getByTestId('btn-add-source'));

    expect(screen.getByTestId('tab-file')).toBeInTheDocument();
    expect(screen.getByTestId('tab-url')).toBeInTheDocument();
    expect(screen.getByTestId('tab-pack')).toBeInTheDocument();
    expect(screen.getByTestId('tab-skip')).toBeInTheDocument();
  });

  it('switches tab content when tab clicked', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);
    await user.click(screen.getByTestId('btn-add-source'));

    // File is default
    expect(screen.getByTestId('tab-content-file')).toBeInTheDocument();

    // Switch to URL
    await user.click(screen.getByTestId('tab-url'));
    expect(screen.queryByTestId('tab-content-file')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-content-url')).toBeInTheDocument();

    // Switch to Pack
    await user.click(screen.getByTestId('tab-pack'));
    expect(screen.getByTestId('tab-content-pack')).toBeInTheDocument();

    // Switch to Skip
    await user.click(screen.getByTestId('tab-skip'));
    expect(screen.getByTestId('tab-content-skip')).toBeInTheDocument();
  });

  it('shows error when URL tab confirmed with empty input', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);
    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-url'));
    await user.click(screen.getByTestId('btn-confirm-add'));

    expect(screen.getByTestId('add-source-error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('请输入来源信息');
  });

  it('shows error when URL is malformed', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);
    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-url'));
    await user.type(screen.getByTestId('url-input'), 'not-a-url');
    await user.click(screen.getByTestId('btn-confirm-add'));

    expect(screen.getByTestId('add-source-error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('http');
  });

  it('adds a URL binding and writes to blueprint state', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<KnowledgeDock scope="shared" />);

    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-url'));
    await user.type(screen.getByTestId('url-input'), 'https://example.com/paper');
    await user.click(screen.getByTestId('btn-confirm-add'));

    // Loading state
    expect(screen.getByTestId('add-loading')).toBeInTheDocument();

    // Advance timers to resolve the behavior-light async
    act(() => { vi.advanceTimersByTime(500); });

    await waitFor(() => {
      const bindings = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
      expect(bindings.some((b) => b.source_ref === 'https://example.com/paper')).toBe(true);
    });

    vi.useRealTimers();
  });

  it('adds a pack binding and writes to blueprint state', async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<KnowledgeDock scope="shared" />);

    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-pack'));
    await user.type(screen.getByTestId('pack-input'), 'Team KP · Engineering');
    await user.click(screen.getByTestId('btn-confirm-add'));

    act(() => { vi.advanceTimersByTime(500); });

    await waitFor(() => {
      const bindings = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
      const binding = bindings.find((b) => b.source_ref === 'Team KP · Engineering');
      expect(binding).toBeDefined();
      expect(binding?.source_type).toBe('pack');
    });

    vi.useRealTimers();
  });

  it('cancel button closes the panel', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);
    await user.click(screen.getByTestId('btn-add-source'));
    expect(screen.getByTestId('add-source-panel')).toBeInTheDocument();

    await user.click(screen.getByTestId('btn-cancel-add'));
    expect(screen.queryByTestId('add-source-panel')).not.toBeInTheDocument();
  });

  it('skip action closes panel without adding a binding', async () => {
    const user = userEvent.setup();
    render(<KnowledgeDock scope="shared" />);
    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-skip'));
    await user.click(screen.getByTestId('btn-confirm-add'));

    // Panel closed
    expect(screen.queryByTestId('add-source-panel')).not.toBeInTheDocument();
    // No binding added
    expect(useBuilderStore.getState().blueprint?.knowledge_bindings).toHaveLength(0);
  });
});

describe('KnowledgeDock — blueprint state integrity (AC2)', () => {
  it('new binding has all required fields', async () => {
    vi.useFakeTimers();
    resetStore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<KnowledgeDock scope="shared" />);

    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-url'));
    await user.type(screen.getByTestId('url-input'), 'https://arxiv.org/abs/1234');
    await user.click(screen.getByTestId('btn-confirm-add'));

    act(() => { vi.advanceTimersByTime(500); });

    await waitFor(() => {
      const [binding] = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
      expect(binding).toBeDefined();
      expect(binding.binding_id).toBeTruthy();
      expect(binding.source_type).toBe('url');
      expect(binding.source_ref).toBe('https://arxiv.org/abs/1234');
      expect(binding.retrieval_mode).toBe('auto');
      expect(binding.citation_required).toBe(false);
      expect(binding.freshness_hint).toBe('static');
      expect(binding.scope).toBe('shared');
      expect(binding.target_ref).toBeNull();
    });

    vi.useRealTimers();
  });

  it('agent-scope binding sets target_ref to role_id', async () => {
    vi.useFakeTimers();
    resetStore();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<KnowledgeDock scope="agent" targetRef="r1" />);

    await user.click(screen.getByTestId('btn-add-source'));
    await user.click(screen.getByTestId('tab-pack'));
    await user.type(screen.getByTestId('pack-input'), 'My Pack');
    await user.click(screen.getByTestId('btn-confirm-add'));

    act(() => { vi.advanceTimersByTime(500); });

    await waitFor(() => {
      const [binding] = useBuilderStore.getState().blueprint?.knowledge_bindings ?? [];
      expect(binding?.scope).toBe('agent');
      expect(binding?.target_ref).toBe('r1');
    });

    vi.useRealTimers();
  });
});
