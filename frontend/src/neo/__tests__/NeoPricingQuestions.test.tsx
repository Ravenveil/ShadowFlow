/**
 * NeoPricingQuestions 组件测试（2026-11-07 定价提问卡）。
 *
 * 覆盖：
 *   - 固定三条提问：售价 / 成本 / 快递费（成本口径，无「给手艺人/营销分摊」）；
 *   - 点卡片 → onPick 回传答案脚手架（填输入框，不直接发送）；
 *   - 「×」→ onDismiss 收起。
 */
import { render, screen, fireEvent } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';
import { NeoPricingQuestions, PRICING_QUESTIONS } from '../NeoPricingQuestions';

describe('NeoPricingQuestions', () => {
  it('渲染固定三条提问（售价/成本/快递费）', () => {
    render(<NeoPricingQuestions onPick={() => {}} onDismiss={() => {}} />);
    expect(screen.getByTestId('neo-pricing-questions')).toBeTruthy();
    expect(screen.getByTestId('neo-pricing-q-price').textContent).toContain('售价定多少');
    expect(screen.getByTestId('neo-pricing-q-cost').textContent).toContain('成本多少');
    expect(screen.getByTestId('neo-pricing-q-shipping').textContent).toContain('快递费按单算多少');
    // 成本口径：不再有「给手艺人/营销分摊」
    expect(screen.queryByText(/给手艺人/)).toBeNull();
    expect(screen.queryByText(/营销分摊/)).toBeNull();
  });

  it('点提问卡 → onPick 回传答案脚手架', () => {
    const onPick = vi.fn();
    render(<NeoPricingQuestions onPick={onPick} onDismiss={() => {}} />);
    fireEvent.click(screen.getByTestId('neo-pricing-q-cost'));
    expect(onPick).toHaveBeenCalledWith('成本：');
    fireEvent.click(screen.getByTestId('neo-pricing-q-price'));
    expect(onPick).toHaveBeenCalledWith('售价：');
    fireEvent.click(screen.getByTestId('neo-pricing-q-shipping'));
    expect(onPick).toHaveBeenCalledWith('快递费：');
  });

  it('「×」→ onDismiss 收起', () => {
    const onDismiss = vi.fn();
    render(<NeoPricingQuestions onPick={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId('neo-pricing-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('卡片与答案脚手架一一对应（fill 非空且不重复）', () => {
    const fills = PRICING_QUESTIONS.map((q) => q.fill);
    expect(fills).toHaveLength(3);
    expect(new Set(fills).size).toBe(3);
    for (const f of fills) expect(f.length).toBeGreaterThan(0);
  });
});
