/**
 * Tests for BuilderPage — Story 8.2 (AC7) + Story 8.3 (AC8)
 *
 * Covers: form validation, API call, success/failure states, regenerate,
 * accept→Scene Mode (now shows real SceneModeShell), mode switching.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Reset builder store between tests to avoid cross-test contamination
import { useBuilderStore } from '../core/stores/builderStore';

// Mock the API layer — prevents real HTTP calls
vi.mock('../api/builder', () => ({
  generateBlueprint: vi.fn(),
  smokeRunBlueprint: vi.fn(),
  publishBlueprint: vi.fn(),
  BuilderApiError: class BuilderApiError extends Error {
    constructor(
      public status: number,
      public detail: unknown,
    ) {
      super(`Builder API error ${status}`);
    }
  },
}));

// Mock navigate so we can assert on /templates and /editor redirects
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import BuilderPage from './BuilderPage';
import * as builderApi from '../api/builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockBlueprint() {
  return {
    blueprint_id: 'bp-test',
    version: '1',
    name: 'Research Digest',
    goal: 'Survey OSS coding-agent research',
    audience: 'Engineering team',
    mode: 'team' as const,
    role_profiles: [
      {
        role_id: 'r1',
        name: 'Research Manager',
        description: '',
        persona: '',
        responsibilities: [],
        constraints: [],
        tools: [],
        executor_kind: 'api' as const,
        executor_provider: 'claude',
        executor_model: 'claude-3-5-sonnet',
        can_spawn_tasks: true,
        sub_agents: [
          {
            role_id: 'r1-s1',
            name: 'Search Worker',
            description: '',
            persona: '',
            responsibilities: [],
            constraints: [],
            tools: [],
            executor_kind: 'api' as const,
            executor_provider: 'claude',
            executor_model: 'claude-3-5-sonnet',
            can_spawn_tasks: false,
            sub_agents: [],
            capabilities: [],
            handoff_rules: [],
            persona_traits: {},
            state_fields: [],
            metadata: {},
          },
        ],
        capabilities: [],
        handoff_rules: [],
        persona_traits: {},
        state_fields: [],
        metadata: {},
      },
    ],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session' as const, writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: {
      target: 'none' as const,
      visibility: 'private' as const,
      publish_ref: '',
      metadata: {},
    },
    metadata: {},
  };
}

function mockSuccess() {
  vi.mocked(builderApi.generateBlueprint).mockResolvedValueOnce({
    data: makeMockBlueprint(),
    meta: {
      confidence: 0.72,
      missing_inputs: ['No documents uploaded yet'],
      suggested_next_step: 'scene',
    },
  });
}

function mockValidationError() {
  const err = new builderApi.BuilderApiError(422, { detail: 'goal too short' });
  vi.mocked(builderApi.generateBlueprint).mockRejectedValueOnce(err);
}

function mockServerError() {
  const err = new builderApi.BuilderApiError(500, 'Internal Server Error');
  vi.mocked(builderApi.generateBlueprint).mockRejectedValueOnce(err);
}

function renderBuilder(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/builder${search}`]}>
      <Routes>
        <Route path="/builder" element={<BuilderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function resetStore() {
  useBuilderStore.setState({
    mode: 'goal',
    blueprint: null,
    selection: null,
    treeExpanded: {},
    lastSmokeRunResult: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuilderPage — initial state (AC1, AC5)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    resetStore();
  });

  it('renders builder page shell with Goal mode active', () => {
    renderBuilder();
    expect(screen.getByTestId('builder-page')).toBeInTheDocument();
    expect(screen.getByTestId('goal-mode-form')).toBeInTheDocument();
    expect(screen.getByTestId('result-idle-hint')).toBeInTheDocument();
  });

  it('shows mode switcher with Goal tab active', () => {
    renderBuilder();
    expect(screen.getByTestId('mode-tab-goal')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mode-tab-scene')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('mode-tab-graph')).toHaveAttribute('aria-selected', 'false');
  });

  it('generate CTA is disabled when goal is empty', () => {
    renderBuilder();
    const btn = screen.getByTestId('cta-generate');
    expect(btn).toBeDisabled();
  });
});

describe('BuilderPage — goal pre-fill from URL (Story 7.8 compat)', () => {
  beforeEach(() => resetStore());

  it('pre-fills goal textarea from ?goal= param', () => {
    const goal = encodeURIComponent('研究论文助手');
    renderBuilder(`?from=chat&context_type=group&context_id=g-1&goal=${goal}`);
    const textarea = screen.getByTestId('field-goal') as HTMLTextAreaElement;
    expect(textarea.value).toBe('研究论文助手');
  });

  it('shows empty textarea when goal param is absent', () => {
    renderBuilder('');
    const textarea = screen.getByTestId('field-goal') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('shows DM banner when from=dm with context_id', () => {
    renderBuilder('?from=dm&context_type=dm&context_id=agent-xyz');
    expect(screen.getByTestId('builder-dm-banner')).toBeInTheDocument();
    expect(screen.getByTestId('builder-dm-banner').textContent).toContain('agent-xyz');
  });

  it('does NOT show DM banner for chat context', () => {
    renderBuilder('?from=chat&context_type=group&context_id=g-1');
    expect(screen.queryByTestId('builder-dm-banner')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Story 13-4 H1 — inferred intents from Goal Clarity Wizard handoff
// ---------------------------------------------------------------------------

describe('BuilderPage — inferred intents chip row (Story 13-4 H1)', () => {
  beforeEach(() => resetStore());

  it('renders inferred-intents chip row when ?intents=research,writing', () => {
    renderBuilder('?intents=research,writing');
    expect(screen.getByTestId('builder-inferred-intents')).toBeInTheDocument();
    expect(screen.getByTestId('builder-inferred-intent-research')).toBeInTheDocument();
    expect(screen.getByTestId('builder-inferred-intent-writing')).toBeInTheDocument();
    expect(screen.getByTestId('builder-inferred-intents').textContent).toContain('根据目标推断的意图');
  });

  it('does NOT render chip row when intents param is absent', () => {
    renderBuilder('');
    expect(screen.queryByTestId('builder-inferred-intents')).not.toBeInTheDocument();
  });

  it('ignores empty entries in intents param', () => {
    renderBuilder('?intents=research,,writing,');
    expect(screen.getByTestId('builder-inferred-intent-research')).toBeInTheDocument();
    expect(screen.getByTestId('builder-inferred-intent-writing')).toBeInTheDocument();
  });
});

describe('BuilderPage — form validation (AC5)', () => {
  beforeEach(() => {
    resetStore();
  });

  it('generate CTA is disabled when goal is empty (even with mode selected)', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('choice-single'));
    expect(screen.getByTestId('cta-generate')).toBeDisabled();
    expect(builderApi.generateBlueprint).not.toHaveBeenCalled();
  });

  it('generate button disabled when only goal is filled (mode missing)', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('field-goal'), 'Some goal');
    expect(screen.getByTestId('cta-generate')).toBeDisabled();
  });

  it('generate button enabled when goal, mode, AND desired_output all filled', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('field-goal'), 'Some goal');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    expect(screen.getByTestId('cta-generate')).not.toBeDisabled();
  });

  it('generate button disabled when desired_output not selected (goal+mode filled)', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('field-goal'), 'Some goal');
    await user.click(screen.getByTestId('choice-single'));
    expect(screen.getByTestId('cta-generate')).toBeDisabled();
    expect(builderApi.generateBlueprint).not.toHaveBeenCalled();
  });
});

describe('BuilderPage — API call and success state (AC3, AC7)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    resetStore();
  });

  it('calls generateBlueprint with form values on submit', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'Survey OSS coding-agent research');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-report'));
    await user.click(screen.getByTestId('cta-generate'));

    await waitFor(() => {
      expect(builderApi.generateBlueprint).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: 'Survey OSS coding-agent research',
          mode: 'team',
          desired_output: 'report',
        }),
      );
    });
  });

  it('shows result panel with confidence, missing_inputs, suggested_next_step on success', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A research goal');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    expect(await screen.findByTestId('goal-mode-result')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-bar')).toHaveTextContent('0.72');
    expect(screen.getByTestId('missing-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('missing-inputs').textContent).toContain('No documents uploaded yet');
    expect(screen.getByTestId('blueprint-meta').textContent).toContain('scene');
  });

  it('result panel shows 4 action CTAs', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A research goal');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    await screen.findByTestId('goal-mode-result');
    expect(screen.getByTestId('action-accept-scene')).toBeInTheDocument();
    expect(screen.getByTestId('action-regenerate')).toBeInTheDocument();
    expect(screen.getByTestId('action-from-template')).toBeInTheDocument();
    expect(screen.getByTestId('action-open-graph')).toBeInTheDocument();
  });

  it('shows loading spinner and disables CTA while generating', async () => {
    vi.mocked(builderApi.generateBlueprint).mockReturnValue(new Promise(() => {}));
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'Some goal');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('cta-generate')).toBeDisabled();
    expect(screen.getByTestId('cta-generate').textContent).toContain('Generating');
  });

  it('shows missing-inputs hint when knowledge_sources is none', async () => {
    vi.mocked(builderApi.generateBlueprint).mockResolvedValueOnce({
      data: makeMockBlueprint(),
      meta: {
        confidence: 0.72,
        missing_inputs: ['知识来源缺失 — 尚未绑定文档或 URL'],
        suggested_next_step: 'scene',
      },
    });
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'Some goal');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('choice-none'));
    await user.click(screen.getByTestId('cta-generate'));

    expect(await screen.findByTestId('missing-inputs')).toBeInTheDocument();
    expect(screen.getByTestId('missing-inputs').textContent).toContain('知识来源缺失');
  });
});

describe('BuilderPage — regenerate keeps form (AC4, AC7)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    resetStore();
  });

  it('regenerate re-calls API and preserves form values', async () => {
    mockSuccess();
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'Preserved goal text');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    await screen.findByTestId('action-regenerate');
    await user.click(screen.getByTestId('action-regenerate'));

    await waitFor(() => {
      expect(builderApi.generateBlueprint).toHaveBeenCalledTimes(2);
    });

    expect((screen.getByTestId('field-goal') as HTMLTextAreaElement).value).toBe(
      'Preserved goal text',
    );
  });

  it('regenerate preserves knowledge_sources, mode, and desired_output', async () => {
    mockSuccess();
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'Preserved goal text');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-report'));
    await user.click(screen.getByTestId('choice-docs'));
    await user.click(screen.getByTestId('cta-generate'));

    await screen.findByTestId('action-regenerate');
    await user.click(screen.getByTestId('action-regenerate'));

    await waitFor(() => {
      expect(builderApi.generateBlueprint).toHaveBeenCalledTimes(2);
    });

    expect((screen.getByTestId('field-goal') as HTMLTextAreaElement).value).toBe(
      'Preserved goal text',
    );
    expect(screen.getByTestId('choice-team')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('choice-report')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('BuilderPage — accept → Scene Mode (AC4, AC7, AC8)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    resetStore();
  });

  it('switches to Scene Mode shell after accepting blueprint', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A goal');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    await screen.findByTestId('action-accept-scene');
    await user.click(screen.getByTestId('action-accept-scene'));

    // Real Scene Mode shell renders
    expect(await screen.findByTestId('scene-mode-shell')).toBeInTheDocument();
    // Goal Mode form hidden
    expect(screen.queryByTestId('goal-mode-form')).not.toBeInTheDocument();
  });

  it('Scene Mode tab becomes active after accept', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A goal');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    await screen.findByTestId('action-accept-scene');
    await user.click(screen.getByTestId('action-accept-scene'));

    await waitFor(() => {
      expect(screen.getByTestId('mode-tab-scene')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('Scene Mode shows Scene Tree after accept', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A goal');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    await screen.findByTestId('action-accept-scene');
    await user.click(screen.getByTestId('action-accept-scene'));

    expect(await screen.findByTestId('scene-tree')).toBeInTheDocument();
  });

  it('Scene Mode without blueprint shows guidance to return to Goal Mode', () => {
    // Directly set mode to scene without blueprint
    useBuilderStore.setState({ mode: 'scene', blueprint: null, selection: null, treeExpanded: {} });
    renderBuilder();
    expect(screen.getByTestId('scene-no-blueprint')).toBeInTheDocument();
  });
});

describe('BuilderPage — Goal/Scene/Graph mode switching preserves blueprint (AC2, AC8)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    resetStore();
  });

  it('can switch back to Goal Mode from Scene Mode without losing form', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'Goal text');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));
    await screen.findByTestId('action-accept-scene');
    await user.click(screen.getByTestId('action-accept-scene'));

    // Switch back to goal
    await user.click(screen.getByTestId('mode-tab-goal'));

    // Goal form is back; blueprint in store is still set
    expect(screen.getByTestId('goal-mode-form')).toBeInTheDocument();
    expect(useBuilderStore.getState().blueprint).not.toBeNull();
  });

  it('Graph Mode tab navigates to /editor', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mode-tab-graph'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor');
  });
});

describe('BuilderPage — error states (AC5, AC7)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    resetStore();
  });

  it('shows validation error on 422 response', async () => {
    mockValidationError();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A');
    await user.click(screen.getByTestId('choice-single'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    expect(await screen.findByTestId('goal-validation-error')).toBeInTheDocument();
    expect(screen.getByTestId('goal-validation-error').textContent).toContain('校验规则');
  });

  it('shows user-readable server error banner on 5xx', async () => {
    mockServerError();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('field-goal'), 'A research goal');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));

    expect(await screen.findByTestId('server-error-banner')).toBeInTheDocument();
    expect(screen.getByTestId('server-error-banner').textContent).toContain('生成骨架失败');
    expect(screen.getByTestId('server-error-banner').textContent).not.toContain('500');
  });
});

describe('BuilderPage — from-template and graph navigation (AC4)', () => {
  beforeEach(() => resetStore());

  it('from-template navigates to /templates', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('cta-from-template'));
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('skip-to-graph navigates to /editor', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('cta-skip-graph'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor');
  });
});

// ---------------------------------------------------------------------------
// Story 8.4 — Knowledge Dock in Scene Mode (AC1, AC6, AC8)
// ---------------------------------------------------------------------------

describe('BuilderPage — Knowledge Dock in Scene Mode (Story 8.4)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    resetStore();
  });

  /** Helper: generate blueprint and accept into Scene Mode */
  async function acceptBlueprint() {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('field-goal'), 'A research goal');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));
    await screen.findByTestId('action-accept-scene');
    await user.click(screen.getByTestId('action-accept-scene'));
    await screen.findByTestId('scene-mode-shell');
    return user;
  }

  it('Scene Tree always shows Shared Knowledge node even with empty bindings (AC1)', async () => {
    await acceptBlueprint();
    // The tree node must be present whether or not bindings exist
    expect(screen.getByTestId('tree-node-shared-knowledge')).toBeInTheDocument();
  });

  it('clicking Shared Knowledge opens Knowledge Dock panel (AC1, AC6)', async () => {
    const user = await acceptBlueprint();
    await user.click(screen.getByTestId('tree-node-shared-knowledge'));
    expect(await screen.findByTestId('knowledge-dock')).toBeInTheDocument();
  });

  it('Knowledge Dock shows empty state when no bindings (AC6)', async () => {
    const user = await acceptBlueprint();
    await user.click(screen.getByTestId('tree-node-shared-knowledge'));
    await screen.findByTestId('knowledge-dock');
    expect(screen.getByTestId('knowledge-empty-state')).toBeInTheDocument();
  });

  it('Knowledge Dock shows "添加来源" button (AC2)', async () => {
    const user = await acceptBlueprint();
    await user.click(screen.getByTestId('tree-node-shared-knowledge'));
    await screen.findByTestId('knowledge-dock');
    expect(screen.getByTestId('btn-add-source')).toBeInTheDocument();
  });

  it('Knowledge Dock has Smoke Run hint (AC5)', async () => {
    const user = await acceptBlueprint();
    await user.click(screen.getByTestId('tree-node-shared-knowledge'));
    await screen.findByTestId('smoke-run-hint');
    expect(screen.getByTestId('smoke-run-hint')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Story 8.5 — Smoke Run validate tab & panel integration (AC1, AC6, AC8)
// ---------------------------------------------------------------------------

describe('BuilderPage — Validate Mode (Story 8.5)', () => {
  beforeEach(() => {
    vi.mocked(builderApi.generateBlueprint).mockReset();
    vi.mocked(builderApi.smokeRunBlueprint).mockReset();
    resetStore();
  });

  it('mode switcher has Validate (04) tab', () => {
    renderBuilder();
    expect(screen.getByTestId('mode-tab-validate')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-validate').textContent).toContain('Validate');
  });

  it('clicking Validate tab shows validate-mode-shell', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mode-tab-validate'));
    expect(screen.getByTestId('validate-mode-shell')).toBeInTheDocument();
  });

  it('Validate tab shows SmokeRunPanel with trigger button', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mode-tab-validate'));
    expect(screen.getByTestId('smoke-run-panel')).toBeInTheDocument();
    expect(screen.getByTestId('smoke-run-trigger')).toBeInTheDocument();
  });

  it('Validate panel shows no-blueprint hint when no blueprint loaded', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mode-tab-validate'));
    expect(screen.getByTestId('no-blueprint-hint')).toBeInTheDocument();
  });

  it('Validate panel trigger button is enabled after blueprint is set', async () => {
    mockSuccess();
    renderBuilder();
    const user = userEvent.setup();

    // First generate a blueprint
    await user.type(screen.getByTestId('field-goal'), 'Research OSS coding agent trends');
    await user.click(screen.getByTestId('choice-team'));
    await user.click(screen.getByTestId('choice-answer'));
    await user.click(screen.getByTestId('cta-generate'));
    await screen.findByTestId('action-accept-scene');
    await user.click(screen.getByTestId('action-accept-scene'));

    // Switch to Validate tab
    await user.click(screen.getByTestId('mode-tab-validate'));
    expect(screen.getByTestId('smoke-run-trigger')).not.toBeDisabled();
  });

  it('can switch back to Goal Mode from Validate tab', async () => {
    renderBuilder();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('mode-tab-validate'));
    expect(screen.getByTestId('validate-mode-shell')).toBeInTheDocument();
    await user.click(screen.getByTestId('mode-tab-goal'));
    expect(screen.getByTestId('goal-mode-form')).toBeInTheDocument();
    expect(screen.queryByTestId('validate-mode-shell')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Story 13.2 H1 follow-up — workflow_ref URL param consumption
// ---------------------------------------------------------------------------

describe('BuilderPage — Story 13.2 H1: workflow_ref URL param', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    resetStore();
  });

  it('reads ?workflow_ref + ?workflow_ref_name and writes to blueprint.execution_mode', async () => {
    // Pre-populate blueprint in store (simulating user already in scene mode)
    useBuilderStore.setState({
      mode: 'scene',
      blueprint: makeMockBlueprint(),
      selection: null,
      treeExpanded: {},
      lastSmokeRunResult: null,
    });

    renderBuilder('?workflow_ref=wf-12345678&workflow_ref_name=研究助手工作流');

    await waitFor(() => {
      const bp = useBuilderStore.getState().blueprint;
      expect(bp?.execution_mode).toEqual({
        mode: 'workflow',
        workflow_ref: 'wf-12345678',
        workflow_name: '研究助手工作流',
      });
    });
  });

  it('does nothing when blueprint is absent (no crash, no execution_mode write)', async () => {
    // No blueprint in store
    renderBuilder('?workflow_ref=wf-xxx');
    // Wait microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(useBuilderStore.getState().blueprint).toBeNull();
  });
});
