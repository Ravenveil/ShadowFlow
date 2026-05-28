/**
 * SyscardFB.test.tsx — Stream E
 *
 * 基本 mount 断言 + 3 种 kind 的 lab 文案与 data-kind 颜色钩子。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SyscardFB } from './SyscardFB';

describe('SyscardFB', () => {
  it('policy-reject kind 渲染默认 REJECT 标签', () => {
    render(
      <SyscardFB
        kind="policy-reject"
        reason="阿批 → 小写 · reason missing baseline"
      />
    );
    expect(screen.getByText(/POLICY MATRIX · REJECT/)).toBeTruthy();
    expect(screen.getByText(/missing baseline/)).toBeTruthy();
  });

  it('policy-approve kind 渲染 APPROVE 标签', () => {
    render(
      <SyscardFB kind="policy-approve" reason="审审 → 张明 · 通过 §6 review" />
    );
    expect(screen.getByText(/POLICY MATRIX · APPROVE/)).toBeTruthy();
  });

  it('system-event kind + 自定义 title 优先于 KIND_LABEL', () => {
    render(
      <SyscardFB
        kind="system-event"
        title="RUN #042 · 开始"
        reason="输入：arXiv:2410.11215"
      />
    );
    expect(screen.getByText(/RUN #042 · 开始/)).toBeTruthy();
    expect(screen.queryByText(/SYSTEM EVENT/)).toBeNull();
  });

  it('meta 字段渲染为 k/v 行', () => {
    render(
      <SyscardFB
        kind="policy-reject"
        reason="rollback to draft.v2"
        meta={{ rollback: 'draft.v2', retry: 'r2/3' }}
      />
    );
    expect(screen.getByText('rollback')).toBeTruthy();
    expect(screen.getByText('draft.v2')).toBeTruthy();
    expect(screen.getByText('retry')).toBeTruthy();
    expect(screen.getByText('r2/3')).toBeTruthy();
  });
});
