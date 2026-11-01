/**
 * 救场 UI 测试（2026-08-23）：
 *   - LoopVerdicts 急停：active（loop 运行中）露出按钮 → 两步确认 →
 *     haltLoop(runId, loopId)；成功锁定「已急停」pill，失败红字提示；
 *     非 active 不露出。
 *   - NeoStepPanel 单步重跑：done 步骤行尾「重跑」→ onRetryStep(index)；
 *     进行中 loading 禁用；false/异常 → 行内红字；有步骤 running 时整组
 *     按钮收起；未传 onRetryStep（群聊/只读回放）不渲染。
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TimelineMessage } from '../../components/run-session/timeline/types';

// ── api/runs mock（LoopVerdicts 数据源 + haltLoop）──────────────────────────
const getLoopVerdictsMock = vi.fn();
const haltLoopMock = vi.fn();

vi.mock('../../api/runs', () => ({
  getLoopVerdicts: (...args: unknown[]) => getLoopVerdictsMock(...args),
  haltLoop: (...args: unknown[]) => haltLoopMock(...args),
}));

import { LoopVerdicts } from '../projections/LoopVerdicts';
import { NeoTimeline } from '../NeoTimeline';

beforeEach(() => {
  getLoopVerdictsMock.mockReset();
  haltLoopMock.mockReset();
});

// ---------------------------------------------------------------------------
// LoopVerdicts — loop 急停
// ---------------------------------------------------------------------------

describe('LoopVerdicts 急停', () => {
  it('active 时露出按钮；两步确认后调 haltLoop 并锁定「已急停」', async () => {
    haltLoopMock.mockResolvedValue({ status: 'halted', message: 'ok' });
    render(<LoopVerdicts runId="r1" loopId="L1" active={true} />);

    fireEvent.click(screen.getByRole('button', { name: /急停本循环/ }));
    // 确认态防误触：出现确认 + 取消，原按钮消失
    expect(screen.queryByRole('button', { name: /急停本循环/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认急停' }));

    await waitFor(() => expect(screen.getByText('已急停')).toBeTruthy());
    expect(haltLoopMock).toHaveBeenCalledWith('r1', 'L1');
    expect(screen.queryByRole('button', { name: /急停/ })).toBeNull();
  });

  it('确认页可取消，不发请求', () => {
    render(<LoopVerdicts runId="r1" loopId="L1" active={true} />);
    fireEvent.click(screen.getByRole('button', { name: /急停本循环/ }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(haltLoopMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /急停本循环/ })).toBeTruthy();
  });

  it('halt 失败 → 红字提示，按钮仍可重试', async () => {
    haltLoopMock.mockRejectedValue(new Error('500'));
    render(<LoopVerdicts runId="r1" loopId="L1" active={true} />);
    fireEvent.click(screen.getByRole('button', { name: /急停本循环/ }));
    fireEvent.click(screen.getByRole('button', { name: '确认急停' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('急停失败'));
    expect(screen.queryByText('已急停')).toBeNull();
  });

  it('非 active（loop 未在跑）不露出急停控制', () => {
    render(<LoopVerdicts runId="r1" loopId="L1" active={false} />);
    expect(screen.queryByRole('button', { name: /急停/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NeoStepPanel — 单步重跑
// ---------------------------------------------------------------------------

function stepPanelMsg(
  steps: Array<{ name: string; status: 'done' | 'running' | 'pending'; elapsed_ms?: number }>,
): TimelineMessage {
  return {
    id: 'sp1',
    kind: 'step_panel',
    turn_id: 't1',
    ts: 1000,
    total_steps: steps.length,
    steps,
  } as TimelineMessage;
}

describe('NeoStepPanel 重跑', () => {
  it('done 步骤行尾渲染「重跑」，点击调 onRetryStep(realIdx)', async () => {
    const onRetry = vi.fn().mockResolvedValue(true);
    render(
      <NeoTimeline
        messages={[stepPanelMsg([
          { name: '抓取资料', status: 'done', elapsed_ms: 120 },
          { name: '生成报告', status: 'done', elapsed_ms: 340 },
        ])]}
        onRetryStep={onRetry}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: /重跑/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('重跑进行中按钮 loading 禁用；返回 false → 行内红字失败提示', async () => {
    let resolveFn: (v: boolean) => void = () => {};
    const onRetry = vi.fn().mockImplementation(
      () => new Promise<boolean>((res) => { resolveFn = res; }),
    );
    render(
      <NeoTimeline
        messages={[stepPanelMsg([{ name: '抓取资料', status: 'done' }])]}
        onRetryStep={onRetry}
      />,
    );
    const btn = screen.getByRole('button', { name: /重跑/ });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: /重跑中/ })).toBeTruthy());
    expect((screen.getByRole('button', { name: /重跑中/ }) as HTMLButtonElement).disabled).toBe(true);
    resolveFn(false);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('重跑失败'));
  });

  it('onRetryStep 抛异常 → 红字失败提示', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('network'));
    render(
      <NeoTimeline
        messages={[stepPanelMsg([{ name: '抓取资料', status: 'done' }])]}
        onRetryStep={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /重跑/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('重跑失败'));
  });

  it('有步骤 running 时整组重跑按钮收起', () => {
    const onRetry = vi.fn();
    render(
      <NeoTimeline
        messages={[stepPanelMsg([
          { name: '抓取资料', status: 'done', elapsed_ms: 120 },
          { name: '生成报告', status: 'running' },
        ])]}
        onRetryStep={onRetry}
      />,
    );
    expect(screen.queryByRole('button', { name: /重跑/ })).toBeNull();
  });

  it('未传 onRetryStep（群聊/只读回放）不渲染重跑按钮', () => {
    render(
      <NeoTimeline
        messages={[stepPanelMsg([{ name: '抓取资料', status: 'done', elapsed_ms: 120 }])]}
      />,
    );
    expect(screen.queryByRole('button', { name: /重跑/ })).toBeNull();
  });
});
