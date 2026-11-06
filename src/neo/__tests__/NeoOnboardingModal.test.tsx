/**
 * NeoOnboardingModal 组件测试（2026-11-06，ZCode/Codex 式入职问卷）。
 * 覆盖：首屏渲染、chips 多选、下一步/上一步、完成回调拼消息、跳过回调。
 */
import { render, screen, fireEvent } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NeoOnboardingModal, ONBOARDING_DONE_KEY, USER_PROFILE_KEY } from '../NeoOnboardingModal';

beforeEach(() => {
  localStorage.clear();
});

describe('NeoOnboardingModal', () => {
  it('首屏渲染第一问（怎么称呼你，无预设 chips）', () => {
    render(<NeoOnboardingModal onFinished={vi.fn()} onSkipped={vi.fn()} />);
    expect(screen.getByTestId('neo-onboarding-modal')).toBeInTheDocument();
    expect(screen.getByText('怎么称呼你')).toBeInTheDocument();
    // 第一问已无预设选项（用户反馈：老板/哥/姐删除）
    expect(screen.queryByTestId('neo-onb-chip-老板')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-onb-next')).toBeInTheDocument();
  });

  it('下一步推进 + 上一步回退', () => {
    render(<NeoOnboardingModal onFinished={vi.fn()} onSkipped={vi.fn()} />);
    fireEvent.click(screen.getByTestId('neo-onb-next'));
    expect(screen.getByText('你是做什么的（职业/身份）')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('neo-onb-back'));
    expect(screen.getByText('怎么称呼你')).toBeInTheDocument();
  });

  it('chips 选择 + 输入 + 完成：onFinished 收到拼好的自我介绍', () => {
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    // 直接跳到最后一问（今天想做的事）
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByTestId('neo-onb-next'));
    expect(screen.getByText('今天就想让影先帮你做成的一件事')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('neo-onb-input-firstTask'), {
      target: { value: '整理行业日报' },
    });
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    expect(onFinished).toHaveBeenCalledTimes(1);
    const msg = onFinished.mock.calls[0][0] as string;
    expect(msg).toContain('（认识一下）');
    expect(msg).toContain('整理行业日报');
    // 标记与画像落盘
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBe('1');
    const profile = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) ?? '{}');
    expect(profile.answers?.firstTask).toBe('整理行业日报');
  });

  it('全部留空完成：onFinished 收到空串（不发起消息）', () => {
    const onFinished = vi.fn();
    render(<NeoOnboardingModal onFinished={onFinished} onSkipped={vi.fn()} />);
    for (let i = 0; i < 7; i++) fireEvent.click(screen.getByTestId('neo-onb-next'));
    fireEvent.click(screen.getByTestId('neo-onb-finish'));
    expect(onFinished).toHaveBeenCalledWith('');
  });

  it('右上 × 跳过：onSkipped 触发、无落盘', () => {
    const onSkipped = vi.fn();
    render(<NeoOnboardingModal onFinished={vi.fn()} onSkipped={onSkipped} />);
    fireEvent.click(screen.getByTestId('neo-onboarding-skip'));
    expect(onSkipped).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ONBOARDING_DONE_KEY)).toBeNull();
  });
});
