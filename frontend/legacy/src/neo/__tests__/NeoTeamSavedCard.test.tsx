/**
 * NeoTeamSavedCard 组件测试（2026-08-22 第二轮缺口 A）。
 *
 * 覆盖：
 *   - 渲染团队名 + 成员数 + 「去群聊运行」CTA；
 *   - 已互链群（groupId 非空）→ CTA 直接 onOpenGroup(groupId) 跳转；
 *   - 未互链群 → CTA 不跳转，展开内联下一步说明（不假按钮、不建群）。
 */
import { render, screen, fireEvent } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';
import { NeoTeamSavedCard } from '../NeoTeamSavedCard';
import type { TeamSavedEvent } from '../../api/runSessions';

const TEAM: TeamSavedEvent = {
  team_id: 'team-1',
  name: '氢能获客小队',
  agent_ids: ['a1', 'a2', 'a3'],
  workspace_id: 'ws-1',
};

describe('NeoTeamSavedCard', () => {
  it('渲染团队名 + 成员数 + CTA', () => {
    render(<NeoTeamSavedCard team={TEAM} groupId={null} onOpenGroup={() => {}} />);
    expect(screen.getByTestId('neo-team-saved-card')).toBeTruthy();
    expect(screen.getByTestId('neo-team-saved-name').textContent).toBe('氢能获客小队');
    expect(screen.getByTestId('neo-team-saved-count').textContent).toContain('3');
    expect(screen.getByTestId('neo-team-saved-cta')).toBeTruthy();
  });

  it('已互链群：CTA 跳转群聊现场', () => {
    const onOpenGroup = vi.fn();
    render(<NeoTeamSavedCard team={TEAM} groupId="g-1" onOpenGroup={onOpenGroup} />);
    fireEvent.click(screen.getByTestId('neo-team-saved-cta'));
    expect(onOpenGroup).toHaveBeenCalledTimes(1);
    expect(onOpenGroup).toHaveBeenCalledWith('g-1');
    // 跳转路径不展开提示
    expect(screen.queryByTestId('neo-team-saved-hint')).toBeNull();
  });

  it('未互链群：CTA 展开内联下一步说明，不调 onOpenGroup', () => {
    const onOpenGroup = vi.fn();
    render(<NeoTeamSavedCard team={TEAM} groupId={null} onOpenGroup={onOpenGroup} />);
    expect(screen.queryByTestId('neo-team-saved-hint')).toBeNull();
    fireEvent.click(screen.getByTestId('neo-team-saved-cta'));
    expect(onOpenGroup).not.toHaveBeenCalled();
    expect(screen.getByTestId('neo-team-saved-hint')).toBeTruthy();
  });
});
