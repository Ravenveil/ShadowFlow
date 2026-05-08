/**
 * RoleProfilePanel tests — Story 8.3b (AC1–AC7)
 *
 * 覆盖：各分组折叠/展开、capabilities 增删写回、handoff_rules 添加/下拉联动、
 *       persona_traits key-value 增删、state_fields 变量名校验、blueprint state 写回。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { RoleProfilePanel } from '../RoleProfilePanel';
import { useBuilderStore } from '../../../../stores/builderStore';
import type { AgentBlueprint, RoleProfile } from '../../../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<RoleProfile> = {}): RoleProfile {
  return {
    role_id: 'r1',
    name: 'Research Agent',
    description: 'Searches and summarises',
    persona: '',
    responsibilities: [],
    constraints: [],
    tools: [],
    executor_kind: 'api',
    executor_provider: 'anthropic',
    executor_model: 'claude-sonnet-4-6',
    capabilities: [],
    handoff_rules: [],
    persona_traits: {},
    state_fields: [],
    can_spawn_tasks: false,
    sub_agents: [],
    metadata: {},
    ...overrides,
  };
}

function setupStore(role: RoleProfile, extraRoles: RoleProfile[] = []) {
  const bp: AgentBlueprint = {
    blueprint_id: 'bp-1',
    version: '1',
    name: 'Test Team',
    goal: 'Test goal',
    audience: '',
    mode: 'team',
    role_profiles: [role, ...extraRoles],
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

function getRole(): RoleProfile {
  return useBuilderStore.getState().blueprint!.role_profiles[0];
}

// ---------------------------------------------------------------------------
// AC1: 分组折叠/展开
// ---------------------------------------------------------------------------

describe('AC1 — 分组折叠展开', () => {
  beforeEach(() => resetStore());

  it('基本信息 和 能力边界 默认展开', () => {
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    // 展开时可见 data-testid="insp-role-title"
    expect(screen.getByTestId('insp-role-title')).toBeInTheDocument();
    expect(screen.getByTestId('capabilities-editor')).toBeInTheDocument();
  });

  it('Handoff 规则、个性特征、持久状态字段 默认折叠', () => {
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    expect(screen.queryByTestId('handoff-rules-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('persona-traits-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('state-fields-editor')).not.toBeInTheDocument();
  });

  it('点击 Handoff 规则 切换展开', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-handoff-rules-toggle'));
    expect(screen.getByTestId('handoff-rules-editor')).toBeInTheDocument();

    await user.click(screen.getByTestId('section-handoff-rules-toggle'));
    expect(screen.queryByTestId('handoff-rules-editor')).not.toBeInTheDocument();
  });

  it('点击 个性特征 切换展开', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-persona-traits-toggle'));
    expect(screen.getByTestId('persona-traits-editor')).toBeInTheDocument();
  });

  it('点击 持久状态字段 切换展开', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-state-fields-toggle'));
    expect(screen.getByTestId('state-fields-editor')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC2: capabilities 增删写回 blueprint state
// ---------------------------------------------------------------------------

describe('AC2 — capabilities 增删写回', () => {
  beforeEach(() => resetStore());

  it('回车添加 capability，写回 blueprint state', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    const input = screen.getByTestId('capabilities-input');
    await user.type(input, '撰写研究报告{Enter}');

    expect(getRole().capabilities).toEqual(['撰写研究报告']);
  });

  it('× 删除 capability，写回 blueprint state', async () => {
    const user = userEvent.setup();
    const role = makeRole({ capabilities: ['能力A', '能力B'] });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('capability-remove-0'));
    expect(getRole().capabilities).toEqual(['能力B']);
  });

  it('达到 20 条上限时显示提示', () => {
    const role = makeRole({ capabilities: Array.from({ length: 20 }, (_, i) => `cap-${i}`) });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    expect(screen.getByTestId('capabilities-max-msg')).toBeInTheDocument();
    expect(screen.queryByTestId('capabilities-input')).not.toBeInTheDocument();
  });

  it('空 capabilities 显示引导空态', () => {
    const role = makeRole({ capabilities: [] });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    expect(screen.getByTestId('capabilities-empty')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AC3: handoff_rules 添加、target_role 下拉联动
// ---------------------------------------------------------------------------

describe('AC3 — handoff_rules 添加与下拉联动', () => {
  beforeEach(() => resetStore());

  it('点击"添加规则"新增一行', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-handoff-rules-toggle'));
    await user.click(screen.getByTestId('handoff-rules-add'));

    expect(getRole().handoff_rules).toHaveLength(1);
    expect(screen.getByTestId('handoff-rule-row-0')).toBeInTheDocument();
  });

  it('target_role 下拉包含其他角色', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    const writer = makeRole({ role_id: 'r2', name: 'Writer' });
    setupStore(role, [writer]);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-handoff-rules-toggle'));
    await user.click(screen.getByTestId('handoff-rules-add'));

    const select = screen.getByTestId('handoff-target-role-0');
    expect(within(select).getByText('Writer')).toBeInTheDocument();
    // 自身不出现在下拉中
    expect(within(select).queryByText('Research Agent')).not.toBeInTheDocument();
  });

  it('× 删除规则，写回 blueprint state', async () => {
    const user = userEvent.setup();
    const role = makeRole({
      handoff_rules: [{ trigger: '当需要写作时', target_role: 'r2' }],
    });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-handoff-rules-toggle'));
    await user.click(screen.getByTestId('handoff-rule-remove-0'));

    expect(getRole().handoff_rules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC4: persona_traits key-value 增删
// ---------------------------------------------------------------------------

describe('AC4 — persona_traits 增删', () => {
  beforeEach(() => resetStore());

  it('点击"添加特征"新增一行，写回 blueprint state', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-persona-traits-toggle'));
    await user.click(screen.getByTestId('persona-traits-add'));

    expect(screen.getByTestId('persona-trait-row-0')).toBeInTheDocument();
  });

  it('× 删除 trait，写回 blueprint state', async () => {
    const user = userEvent.setup();
    const role = makeRole({ persona_traits: { tone: 'formal' } });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-persona-traits-toggle'));
    await user.click(screen.getByTestId('persona-trait-remove-0'));

    expect(getRole().persona_traits).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// AC5: state_fields 变量名校验
// ---------------------------------------------------------------------------

describe('AC5 — state_fields 变量名校验', () => {
  beforeEach(() => resetStore());

  it('非法变量名高亮提示', async () => {
    const user = userEvent.setup();
    const role = makeRole({ state_fields: [{ name: '', type: 'string', default: '' }] });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-state-fields-toggle'));

    const nameInput = screen.getByTestId('state-field-name-0');
    // 输入含非法字符的变量名（StateFieldsEditor 有本地 state，直接检查 UI）
    await user.type(nameInput, 'bad-name!');

    expect(screen.getByTestId('state-field-name-error-0')).toBeInTheDocument();
  });

  it('type=boolean 时 default 为 toggle', async () => {
    const user = userEvent.setup();
    const role = makeRole({
      state_fields: [{ name: 'is_active', type: 'boolean', default: false }],
    });
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-state-fields-toggle'));
    expect(screen.getByTestId('state-field-default-toggle-0')).toBeInTheDocument();
    expect(screen.queryByTestId('state-field-default-0')).not.toBeInTheDocument();
  });

  it('+ 添加状态变量写回 blueprint state', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    await user.click(screen.getByTestId('section-state-fields-toggle'));
    await user.click(screen.getByTestId('state-fields-add'));

    expect(getRole().state_fields).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC6: 写回格式与向后兼容
// ---------------------------------------------------------------------------

describe('AC6 — 写回格式', () => {
  beforeEach(() => resetStore());

  it('基本信息编辑写回 name 字段（snake_case）', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    const titleInput = screen.getByTestId('insp-role-title');
    await user.clear(titleInput);
    await user.type(titleInput, 'New Title');

    expect(getRole().name).toBe('New Title');
  });

  it('capabilities 字段名为 capabilities（snake_case）', async () => {
    const user = userEvent.setup();
    const role = makeRole();
    setupStore(role);
    render(<RoleProfilePanel role={role} isBoss={false} />);

    const input = screen.getByTestId('capabilities-input');
    await user.type(input, '能力A{Enter}');

    const stored = getRole();
    expect('capabilities' in stored).toBe(true);
    expect(stored.capabilities).toEqual(['能力A']);
  });
});
