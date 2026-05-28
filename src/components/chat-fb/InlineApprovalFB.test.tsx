/**
 * InlineApprovalFB.test.tsx — Stream E
 *
 * pending / approved / rejected 三态切换 + 按钮点击回调。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { InlineApprovalFB, type InlineApprovalChoice } from './InlineApprovalFB';

const CHOICES: InlineApprovalChoice[] = [
  { key: 'approve', label: '批准 · 进 Review', kind: 'approve' },
  { key: 'reject', label: '驳回 · 重写', kind: 'reject' },
  { key: 'diff', label: '看 diff', kind: 'edit' },
];

describe('InlineApprovalFB', () => {
  it('pending 状态显示所有按钮 + wait 文案', () => {
    render(
      <InlineApprovalFB
        gateId="g1"
        agentName="小写"
        description="重写 §6 完成"
        choices={CHOICES}
        status="pending"
        waitText="等待 1m04s"
      />
    );
    expect(screen.getByText(/批准 · 进 Review/)).toBeTruthy();
    expect(screen.getByText(/驳回 · 重写/)).toBeTruthy();
    expect(screen.getByText(/看 diff/)).toBeTruthy();
    expect(screen.getByText(/等待 1m04s/)).toBeTruthy();
  });

  it('approved 状态隐藏按钮 + 显示已批准条', () => {
    render(
      <InlineApprovalFB
        gateId="g1"
        agentName="小写"
        description="重写 §6 完成"
        choices={CHOICES}
        status="approved"
      />
    );
    expect(screen.queryByText(/批准 · 进 Review/)).toBeNull();
    expect(screen.queryByText(/驳回 · 重写/)).toBeNull();
    expect(screen.getByText(/已批准/)).toBeTruthy();
  });

  it('rejected 状态显示已驳回条', () => {
    render(
      <InlineApprovalFB
        gateId="g1"
        description="重写 §6 完成"
        choices={CHOICES}
        status="rejected"
      />
    );
    expect(screen.getByText(/已驳回/)).toBeTruthy();
  });

  it('点击按钮触发 onChoose 携带 key', () => {
    const onChoose = vi.fn();
    render(
      <InlineApprovalFB
        gateId="g1"
        description="重写 §6"
        choices={CHOICES}
        status="pending"
        onChoose={onChoose}
      />
    );
    fireEvent.click(screen.getByText(/驳回 · 重写/));
    expect(onChoose).toHaveBeenCalledWith('reject');
  });

  it('metrics 渲染为 kv cell', () => {
    render(
      <InlineApprovalFB
        gateId="g1"
        description="重写"
        choices={CHOICES}
        status="pending"
        metrics={[
          { k: 'diff', v: '+142 / -38' },
          { k: 'tokens', v: '2.1k / 5k' },
        ]}
      />
    );
    expect(screen.getByText('diff')).toBeTruthy();
    expect(screen.getByText('+142 / -38')).toBeTruthy();
  });
});
