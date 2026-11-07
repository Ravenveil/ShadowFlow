/**
 * NeoQuickSchedule.test.tsx — 会话内快捷定时任务表单（2026-11-05 GrokBot 对齐）。
 *
 * 覆盖：
 *   - 渲染：标题 + 任务输入 + 四种频率 + 创建/取消
 *   - daily 频率 → 提交 createSchedule 收到 cron_expression="m h * * *" + group_id/agent_id
 *   - weekly 多选星期 → cron day_of_week 排序拼接
 *   - once → start_at ISO + 不带 cron
 *   - 空任务 → 内联报错，不调 API
 *   - 成功 → onCreated + onClose；失败 → 错误条可见
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NeoQuickSchedule } from '../NeoQuickSchedule';
import type { ScheduleRecord } from '../../api/schedules';

const createScheduleMock = vi.fn();

vi.mock('../../api/schedules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/schedules')>();
  return {
    ...actual,
    createSchedule: (...args: unknown[]) => createScheduleMock(...args),
  };
});

vi.mock('../../common/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../common/i18n')>();
  const t = (
    _key: string,
    opts?: { defaultValue?: string } & Record<string, unknown>,
  ): string => {
    let s = opts?.defaultValue ?? _key;
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        if (k === 'defaultValue') continue;
        s = s.replaceAll(`{{${k}}}`, String(v));
      }
    }
    return s;
  };
  return {
    ...actual,
    i18n: { language: 'zh', changeLanguage: async () => 'zh' },
    useI18n: () => ({ t, language: 'zh' }),
  };
});

const mkSchedule = (over: Partial<ScheduleRecord> = {}): ScheduleRecord =>
  ({
    schedule_id: 'sc1',
    group_id: 'g1',
    task_description: '整理新闻',
    enabled: true,
    ...over,
  }) as ScheduleRecord;

describe('NeoQuickSchedule — /schedule 快捷定时任务', () => {
  beforeEach(() => {
    createScheduleMock.mockReset();
  });

  it('渲染：标题 + 任务输入 + 四频率 + 创建钮', () => {
    render(<NeoQuickSchedule groupId="g1" onClose={() => {}} />);
    expect(screen.getByTestId('neo-quick-schedule')).toBeTruthy();
    expect(screen.getByText('新建定时任务')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '每天' })).toBeTruthy();
    expect(screen.getByTestId('neo-qs-submit')).toBeTruthy();
  });

  it('daily → cron "0 9 * * *" + group_id + agent_id', async () => {
    createScheduleMock.mockResolvedValue(mkSchedule());
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<NeoQuickSchedule groupId="g1" agentId="a1" onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText(/到点要干什么/), { target: { value: '早报' } });
    // 默认频率 = daily，默认时间 09:00
    fireEvent.click(screen.getByTestId('neo-qs-submit'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createScheduleMock).toHaveBeenCalledWith({
      group_id: 'g1',
      agent_id: 'a1',
      cron_expression: '0 9 * * *',
      task_description: '早报',
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('weekly 多选 → day_of_week 排序拼接', async () => {
    createScheduleMock.mockResolvedValue(mkSchedule());
    render(<NeoQuickSchedule groupId="g1" onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/到点要干什么/), { target: { value: '周报' } });
    fireEvent.click(screen.getByRole('radio', { name: '每周' }));
    // 默认选了周一(0)；再加周三(2)、周五(4)
    fireEvent.click(screen.getByRole('button', { name: '三' }));
    fireEvent.click(screen.getByRole('button', { name: '五' }));
    fireEvent.click(screen.getByTestId('neo-qs-submit'));
    await waitFor(() => expect(createScheduleMock).toHaveBeenCalled());
    expect(createScheduleMock.mock.calls[0]![0].cron_expression).toBe('0 9 * * 0,2,4');
  });

  it('once → start_at ISO，无 cron', async () => {
    createScheduleMock.mockResolvedValue(mkSchedule());
    render(<NeoQuickSchedule groupId="g1" onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/到点要干什么/), { target: { value: '提醒' } });
    fireEvent.click(screen.getByRole('radio', { name: '一次性' }));
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '2026-11-06T09:30' } });
    fireEvent.click(screen.getByTestId('neo-qs-submit'));
    await waitFor(() => expect(createScheduleMock).toHaveBeenCalled());
    const req = createScheduleMock.mock.calls[0]![0];
    expect(req.cron_expression).toBeUndefined();
    expect(req.start_at).toBe(new Date(Date.parse('2026-11-06T09:30')).toISOString());
  });

  it('空任务 → 内联报错，不调 API', async () => {
    render(<NeoQuickSchedule groupId="g1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('neo-qs-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(createScheduleMock).not.toHaveBeenCalled();
  });

  it('API 失败 → 错误条可见，弹层不关', async () => {
    createScheduleMock.mockRejectedValue(new Error('backend down'));
    const onClose = vi.fn();
    render(<NeoQuickSchedule groupId="g1" onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/到点要干什么/), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('neo-qs-submit'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('backend down'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
