/**
 * ScopeSectionCard — Story 13.5 测试
 *
 * 覆盖：
 *   - 默认显示独立助手（scope = 'standalone'）
 *   - 切换到"团队成员候选"后展开协作配置区
 *   - 修改 accepts_from → onUpdate 调用正确
 *   - 切回独立助手 → 协作配置区收起，collaboration_contract 置空
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScopeSectionCard } from './ScopeSectionCard';
import type { RoleProfile } from '../../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRole(overrides: Partial<RoleProfile> = {}): RoleProfile {
  return {
    role_id: 'role-test-001',
    name: 'Test Agent',
    description: '',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScopeSectionCard', () => {
  let onUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUpdate = vi.fn();
  });

  it('默认显示独立助手（无 collaboration_contract）', () => {
    const role = makeRole();
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    const card = screen.getByTestId('scope-section-card');
    expect(card).toBeDefined();

    const standaloneBtn = screen.getByTestId('scope-standalone-btn');
    const teamBtn = screen.getByTestId('scope-team-candidate-btn');

    // 独立助手按钮应为激活状态
    expect(standaloneBtn.className).toContain('bg-sf-accent-tint');
    // 团队候选按钮非激活
    expect(teamBtn.className).not.toContain('bg-sf-accent-tint');

    // 协作配置区不应显示
    expect(screen.queryByTestId('accepts-from-tags')).toBeNull();
    expect(screen.queryByTestId('delivers-to-tags')).toBeNull();
  });

  it('collaboration_contract.scope = "standalone" 时独立助手按钮激活', () => {
    const role = makeRole({
      collaboration_contract: {
        scope: 'standalone',
        accepts_from: [],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    expect(screen.getByTestId('scope-standalone-btn').className).toContain('bg-sf-accent-tint');
    expect(screen.queryByTestId('accepts-from-tags')).toBeNull();
  });

  it('切换到"团队成员候选"后展开协作配置区，onUpdate 调用正确', () => {
    const role = makeRole();
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTestId('scope-team-candidate-btn'));

    expect(onUpdate).toHaveBeenCalledWith({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: [],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
  });

  it('scope = "team_member_candidate" 时显示协作配置区', () => {
    const role = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: ['planner'],
        delivers_to: ['reviewer'],
        collaboration_style: 'push',
      },
    });
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    expect(screen.getByTestId('accepts-from-tags')).toBeDefined();
    expect(screen.getByTestId('delivers-to-tags')).toBeDefined();
    expect(screen.getByTestId('collab-style-push')).toBeDefined();
    expect(screen.getByTestId('collab-style-pull')).toBeDefined();
  });

  it('修改 accepts_from → onUpdate 调用包含正确的 collaboration_contract', () => {
    const role = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: [],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    // 在 accepts_from TagInput 中输入一个标签并按 Enter
    const acceptsContainer = screen.getByTestId('accepts-from-tags');
    const input = acceptsContainer.querySelector('input') as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: 'planner' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith({
      collaboration_contract: expect.objectContaining({
        scope: 'team_member_candidate',
        accepts_from: ['planner'],
      }),
    });
  });

  it('切换 collaboration_style 为 pull → onUpdate 更新正确', () => {
    const role = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: [],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTestId('collab-style-pull'));

    expect(onUpdate).toHaveBeenCalledWith({
      collaboration_contract: expect.objectContaining({
        collaboration_style: 'pull',
      }),
    });
  });

  it('切回独立助手 → onUpdate({ collaboration_contract: undefined })', () => {
    const role = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: ['planner'],
        delivers_to: ['reviewer'],
        collaboration_style: 'pull',
      },
    });
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByTestId('scope-standalone-btn'));

    expect(onUpdate).toHaveBeenCalledWith({ collaboration_contract: undefined });
  });

  it('Round-1 LOW-1: TagInput trim + 大小写归一化（"Planner" 与 "planner" 视为同一个）', () => {
    const role = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: ['planner'],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
    render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    const acceptsContainer = screen.getByTestId('accepts-from-tags');
    const input = acceptsContainer.querySelector('input') as HTMLInputElement;

    // 输入 "  Planner  "（带空格 + 首字母大写） → 应被归一化为 "planner" 并去重（不新增）
    fireEvent.change(input, { target: { value: '  Planner  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // 不应触发 onUpdate（重复项被去重）
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('Round-1 LOW-2: 切换 scope 到 team_member_candidate 后再 patch，不污染下次 patch 的 scope', () => {
    // 模拟受控场景：初始 standalone → click team-candidate → onUpdate 携带正确 scope
    const role = makeRole();
    const { rerender } = render(<ScopeSectionCard role={role} onUpdate={onUpdate} />);

    // 第一次：切到 team_member_candidate
    fireEvent.click(screen.getByTestId('scope-team-candidate-btn'));
    const firstCall = onUpdate.mock.calls[0][0];
    expect(firstCall.collaboration_contract.scope).toBe('team_member_candidate');

    // 模拟外部 state 更新：rerender 一个带 team_member_candidate 的 role
    const teamRole = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: [],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
    rerender(<ScopeSectionCard role={teamRole} onUpdate={onUpdate} />);

    // 第二次：在协作配置区点 collab-style-pull → patch 应携带 team_member_candidate scope（非 standalone 闭包）
    fireEvent.click(screen.getByTestId('collab-style-pull'));
    const secondCall = onUpdate.mock.calls[1][0];
    expect(secondCall.collaboration_contract.scope).toBe('team_member_candidate');
    expect(secondCall.collaboration_contract.collaboration_style).toBe('pull');
  });

  it('切回独立助手后协作配置区收起', () => {
    // 使用受控方式：先渲染 team_member_candidate，然后渲染 standalone
    const roleTeam = makeRole({
      collaboration_contract: {
        scope: 'team_member_candidate',
        accepts_from: [],
        delivers_to: [],
        collaboration_style: 'push',
      },
    });
    const roleStandalone = makeRole(); // no collaboration_contract

    const { rerender } = render(<ScopeSectionCard role={roleTeam} onUpdate={onUpdate} />);

    // 协作配置区应可见
    expect(screen.getByTestId('accepts-from-tags')).toBeDefined();

    // 切换为 standalone role
    rerender(<ScopeSectionCard role={roleStandalone} onUpdate={onUpdate} />);

    // 协作配置区应不可见
    expect(screen.queryByTestId('accepts-from-tags')).toBeNull();
  });
});
