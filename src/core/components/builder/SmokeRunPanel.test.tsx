/**
 * SmokeRunPanel tests — Story 8.5 (AC1, AC2, AC3, AC6, AC8)
 *
 * Covers:
 *  - Trigger Smoke Run from panel (AC1, AC6)
 *  - Running state display
 *  - 5-item check list rendering (AC2)
 *  - Failure explanation translation (AC3)
 *  - Fix-action buttons for each failure category (AC3, AC6)
 *  - All-passed state (AC6)
 *  - No-blueprint guard hint
 *  - Error state + retry (AC6)
 *  - citation_required check behavior (AC4)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { SmokeRunPanel } from './SmokeRunPanel';
import { useBuilderStore } from '../../stores/builderStore';
import type { AgentBlueprint, BuilderSmokeRunResponse, RoleProfile, SmokeCheck } from '../../../common/types/agent-builder';
import * as builderApi from '../../../api/builder';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../api/builder', () => ({
  smokeRunBlueprint: vi.fn(),
  BuilderApiError: class BuilderApiError extends Error {
    constructor(public status: number, public detail: unknown) {
      super(`Builder API error ${status}`);
    }
  },
}));

const mockSmokeRunBlueprint = builderApi.smokeRunBlueprint as MockedFunction<typeof builderApi.smokeRunBlueprint>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRole(id = 'role-1'): RoleProfile {
  return {
    role_id: id, name: 'Researcher', description: 'Researches topics', persona: '',
    responsibilities: [], constraints: [], tools: [],
    executor_kind: 'api', executor_provider: 'anthropic', executor_model: 'claude-sonnet-4-6',
    can_spawn_tasks: false, sub_agents: [],
    capabilities: [], handoff_rules: [], persona_traits: {}, state_fields: [],
    metadata: {},
  };
}

function makeBlueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    blueprint_id: 'bp-test',
    version: '1.0',
    name: 'Test Agent',
    goal: 'Research AI trends in 2025',
    audience: 'Developers',
    mode: 'single',
    role_profiles: [makeRole()],
    tool_policies: [],
    knowledge_bindings: [],
    memory_profile: { scope: 'session', writeback_target: null, enabled: false, metadata: {} },
    eval_profile: { smoke_eval_enabled: false, eval_criteria: [], regression_gate: false, metadata: {} },
    publish_profile: { target: 'none', visibility: 'private', publish_ref: '', metadata: {} },
    metadata: {},
    ...overrides,
  };
}

function makeCheck(overrides: Partial<SmokeCheck> = {}): SmokeCheck {
  return {
    check_id: 'role_init',
    label: '角色能否正常初始化',
    status: 'passed',
    reason: '1 个角色已定义，配置完整',
    target_ref: null,
    failure_category: 'none',
    raw_reason: null,
    ...overrides,
  };
}

function makePassedResponse(): BuilderSmokeRunResponse {
  return {
    data: {
      status: 'passed',
      checks: [
        makeCheck({ check_id: 'role_init', label: '角色能否正常初始化' }),
        makeCheck({ check_id: 'tools_available', label: '必要工具是否可用' }),
        makeCheck({ check_id: 'knowledge_accessible', label: '知识绑定是否可访问' }),
        makeCheck({ check_id: 'min_task_loop', label: '最小任务能否从输入走到输出' }),
        makeCheck({ check_id: 'citation_check', label: '引用要求是否被满足', status: 'skipped', reason: '未启用引用要求，跳过引用检查' }),
      ],
      summary: '当前已通过最小闭环验证，可继续发布流程',
      recommended_fix: null,
      primary_blocker: null,
    },
    meta: { warnings: [] },
  };
}

function makeFailedResponse(): BuilderSmokeRunResponse {
  return {
    data: {
      status: 'failed',
      checks: [
        makeCheck({ check_id: 'role_init', label: '角色能否正常初始化' }),
        makeCheck({
          check_id: 'min_task_loop',
          label: '最小任务能否从输入走到输出',
          status: 'failed',
          reason: '目标描述过于简短或缺失，无法形成有效任务闭环',
          target_ref: 'goal_mode',
          failure_category: 'goal_clarity',
          raw_reason: 'goal_word_count=1',
        }),
        makeCheck({ check_id: 'tools_available', label: '必要工具是否可用' }),
        makeCheck({ check_id: 'knowledge_accessible', label: '知识绑定是否可访问' }),
        makeCheck({ check_id: 'citation_check', label: '引用要求是否被满足', status: 'skipped', reason: '未启用引用要求' }),
      ],
      summary: '发现 1 项阻塞问题，发布前必须修复',
      recommended_fix: '返回 Goal Mode 补充目标描述',
      primary_blocker: 'min_task_loop',
    },
    meta: { warnings: [] },
  };
}

function resetStore(blueprint: AgentBlueprint | null = makeBlueprint()) {
  useBuilderStore.setState({ mode: 'validate', blueprint, selection: null, treeExpanded: {} });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmokeRunPanel — idle state', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('renders the panel with trigger button', () => {
    render(<SmokeRunPanel />);
    expect(screen.getByTestId('smoke-run-panel')).toBeInTheDocument();
    expect(screen.getByTestId('smoke-run-trigger')).toBeInTheDocument();
  });

  it('shows no-blueprint hint when blueprint is null', () => {
    resetStore(null);
    render(<SmokeRunPanel />);
    expect(screen.getByTestId('no-blueprint-hint')).toBeInTheDocument();
  });

  it('disables trigger button when no blueprint', () => {
    resetStore(null);
    render(<SmokeRunPanel />);
    expect(screen.getByTestId('smoke-run-trigger')).toBeDisabled();
  });
});

describe('SmokeRunPanel — triggering Smoke Run (AC1)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('calls smokeRunBlueprint with current blueprint on click', async () => {
    mockSmokeRunBlueprint.mockResolvedValueOnce(makePassedResponse());
    const user = userEvent.setup();

    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    expect(mockSmokeRunBlueprint).toHaveBeenCalledOnce();
    expect(mockSmokeRunBlueprint).toHaveBeenCalledWith(makeBlueprint());
  });

  it('shows running state while request is in flight', async () => {
    let resolveFn!: (v: BuilderSmokeRunResponse) => void;
    mockSmokeRunBlueprint.mockReturnValueOnce(new Promise((r) => { resolveFn = r; }));
    const user = userEvent.setup();

    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    expect(screen.getByTestId('smoke-run-trigger')).toBeDisabled();
    expect(screen.getByTestId('smoke-run-trigger').textContent).toContain('检查中');

    // Resolve to avoid unhandled promise
    resolveFn(makePassedResponse());
  });
});

describe('SmokeRunPanel — passed result (AC6)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockSmokeRunBlueprint.mockResolvedValue(makePassedResponse());
  });

  it('shows overall passed banner', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-overall-status')).toBeInTheDocument();
    });
    expect(screen.getByTestId('smoke-run-overall-status').textContent).toContain('全部通过');
  });

  it('shows all 5 check rows', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-check-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('check-row-role_init')).toBeInTheDocument();
    expect(screen.getByTestId('check-row-tools_available')).toBeInTheDocument();
    expect(screen.getByTestId('check-row-knowledge_accessible')).toBeInTheDocument();
    expect(screen.getByTestId('check-row-min_task_loop')).toBeInTheDocument();
    expect(screen.getByTestId('check-row-citation_check')).toBeInTheDocument();
  });

  it('shows summary text', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-overall-status').textContent).toContain('最小闭环验证');
    });
  });

  it('shows re-run button after completion', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-rerun')).toBeInTheDocument();
    });
  });
});

describe('SmokeRunPanel — failed result with fix actions (AC3, AC6)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockSmokeRunBlueprint.mockResolvedValue(makeFailedResponse());
  });

  it('shows failed overall banner', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-overall-status').textContent).toContain('阻塞问题');
    });
  });

  it('marks primary blocker check row', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('check-row-min_task_loop').textContent).toContain('首要阻塞');
    });
  });

  it('shows failure category label (goal_clarity)', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('check-row-min_task_loop').textContent).toContain('目标不够清晰');
    });
  });

  it('shows fix-action button targeting goal_mode', async () => {
    const user = userEvent.setup();
    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('fix-action-goal_mode')).toBeInTheDocument();
    });
    expect(screen.getByTestId('fix-action-goal_mode').textContent).toContain('Goal Mode');
  });

  it('calls onSwitchMode("goal") when fix-action clicked', async () => {
    const onSwitchMode = vi.fn();
    const user = userEvent.setup();
    render(<SmokeRunPanel onSwitchMode={onSwitchMode} />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('fix-action-goal_mode')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('fix-action-goal_mode'));
    expect(onSwitchMode).toHaveBeenCalledWith('goal');
  });
});

describe('SmokeRunPanel — knowledge fix action (AC3)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('shows knowledge-dock fix action for knowledge_inaccessible failure', async () => {
    mockSmokeRunBlueprint.mockResolvedValueOnce({
      data: {
        status: 'failed',
        checks: [
          makeCheck({
            check_id: 'knowledge_accessible',
            label: '知识绑定是否可访问',
            status: 'failed',
            reason: '知识缺失或不可访问：来源引用不完整',
            target_ref: 'knowledge_dock',
            failure_category: 'knowledge_inaccessible',
          }),
          makeCheck({ check_id: 'role_init' }),
          makeCheck({ check_id: 'tools_available' }),
          makeCheck({ check_id: 'min_task_loop' }),
          makeCheck({ check_id: 'citation_check', status: 'skipped', reason: '未启用' }),
        ],
        summary: '存在阻塞',
        recommended_fix: '打开 Knowledge Dock',
        primary_blocker: 'knowledge_accessible',
      },
      meta: { warnings: [] },
    });
    const onOpenKnowledgeDock = vi.fn();
    const user = userEvent.setup();

    render(<SmokeRunPanel onOpenKnowledgeDock={onOpenKnowledgeDock} />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('fix-action-knowledge_dock')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('fix-action-knowledge_dock'));
    expect(onOpenKnowledgeDock).toHaveBeenCalled();
  });
});

describe('SmokeRunPanel — error state (AC6)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('shows error banner on API failure', async () => {
    const { BuilderApiError } = await import('../../../api/builder');
    mockSmokeRunBlueprint.mockRejectedValueOnce(new BuilderApiError(500, 'internal error'));
    const user = userEvent.setup();

    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-error-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('smoke-run-error-banner').textContent).toContain('失败');
  });

  it('retries when retry button clicked', async () => {
    const { BuilderApiError } = await import('../../../api/builder');
    mockSmokeRunBlueprint
      .mockRejectedValueOnce(new BuilderApiError(500, 'error'))
      .mockResolvedValueOnce(makePassedResponse());
    const user = userEvent.setup();

    render(<SmokeRunPanel />);
    await user.click(screen.getByTestId('smoke-run-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-error-banner')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /重试/ }));

    await waitFor(() => {
      expect(screen.getByTestId('smoke-run-overall-status')).toBeInTheDocument();
    });
    expect(mockSmokeRunBlueprint).toHaveBeenCalledTimes(2);
  });
});
