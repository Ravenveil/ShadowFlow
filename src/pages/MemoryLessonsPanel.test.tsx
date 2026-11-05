/**
 * MemoryLessonsPanel.test.tsx — 经验记忆面板契约测试（2026-11-05）。
 *
 * Vitest + RTL（对齐 MemoryProfilePanel.test.tsx 模式）：mock api 层控制响应形状。
 * 覆盖：
 *   - 列表 + 统计卡渲染（总数/top_k/每域上限）
 *   - kind 筛选：切 tab 触发带 kind 的 listMemoryLessons
 *   - 手动补一条：弹窗提交 rememberLesson(source='manual') + 刷新列表
 *   - 删除：需二次确认（取消不删；确认后 forgetMemoryLesson + 列表剔除）
 *   - 自动沉淀开关：读 settings 缺省开；切换写入 putMemorySetting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/memoryLessons', () => ({
  listMemoryLessons: vi.fn(),
  rememberLesson: vi.fn(),
  getMemoryLessonStats: vi.fn(),
  forgetMemoryLesson: vi.fn(),
  getMemorySetting: vi.fn(),
  putMemorySetting: vi.fn(),
  KIND_LESSON: 'lesson',
  KIND_PREF: 'preference',
  KIND_WEAK: 'weakness',
  KIND_LABELS: { lesson: '教训', preference: '偏好', weakness: '弱项' },
  SOURCE_LABELS: { run_failed: 'run 失败沉淀', user_abort: '用户中断沉淀', manual: '手动补充' },
}));

import {
  forgetMemoryLesson,
  getMemoryLessonStats,
  getMemorySetting,
  listMemoryLessons,
  putMemorySetting,
  rememberLesson,
} from '../api/memoryLessons';
import type { MemoryLesson } from '../api/memoryLessons';
import MemoryLessonsPanel from './MemoryLessonsPanel';
import { I18nProvider } from '../common/i18n';

const mockedList = listMemoryLessons as unknown as ReturnType<typeof vi.fn>;
const mockedRemember = rememberLesson as unknown as ReturnType<typeof vi.fn>;
const mockedStats = getMemoryLessonStats as unknown as ReturnType<typeof vi.fn>;
const mockedForget = forgetMemoryLesson as unknown as ReturnType<typeof vi.fn>;
const mockedGetSetting = getMemorySetting as unknown as ReturnType<typeof vi.fn>;
const mockedPutSetting = putMemorySetting as unknown as ReturnType<typeof vi.fn>;

const LESSON: MemoryLesson = {
  id: 'llllllll-1111-2222-3333-444444444444',
  kind: 'lesson',
  scope_key: '',
  task_type: '',
  title: '网关空响应要先看 abort 时序',
  content: '网关空响应要先看 abort 时序，再查 env 兜底。',
  source: 'run_failed',
  source_ref: 'run-123',
  score: 0.6,
  hits: 2,
  archived: 0,
  created_at: 1793845583630,
  updated_at: 1793845583630,
};

const STATS = {
  total: 1,
  by_kind: { lesson: 1 },
  top_k: 4,
  max_per_scope: 8,
};

function renderPanel() {
  return render(
    <I18nProvider>
      <MemoryLessonsPanel />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue([LESSON]);
  mockedStats.mockResolvedValue(STATS);
  mockedGetSetting.mockResolvedValue(true);
});

describe('MemoryLessonsPanel', () => {
  it('列表与统计卡：渲染经验条目和三项指标', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('memory-lessons-panel')).toBeTruthy();
    });
    // 标题与正文（title 含「abort 时序」；content 是全文）
    await waitFor(() => {
      expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    });
    // 统计：1 在册 · 召回 4 · 上限 8
    const stats = screen.getByTestId('memory-lessons-stats');
    expect(stats.textContent).toContain('1');
    expect(stats.textContent).toContain('4');
    expect(stats.textContent).toContain('8');
    // 来源与召回次数
    const list = screen.getByTestId('memory-lessons-list');
    expect(list.textContent).toContain('run 失败沉淀');
    expect(list.textContent).toContain('召回 2 次');
    expect(list.textContent).toContain('通用经验');
  });

  it('kind 筛选：切「偏好」tab 触发带 kind 的列表请求', async () => {
    renderPanel();
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalled();
    });
    mockedList.mockClear();
    mockedList.mockResolvedValue([]);
    fireEvent.click(screen.getByTestId('memory-lessons-kind-preference'));
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith({ kind: 'preference' });
    });
    expect(screen.getByTestId('memory-lessons-kind-preference').getAttribute('aria-selected')).toBe('true');
  });

  it('手动补一条：提交 rememberLesson(source=manual) 后刷新', async () => {
    mockedRemember.mockResolvedValue({ ...LESSON, id: 'new', source: 'manual' });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId('create-lesson-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('create-lesson-btn'));
    const modal = await screen.findByTestId('memory-lesson-modal');
    expect(modal).toBeTruthy();
    fireEvent.change(screen.getByTestId('memory-lesson-modal-content'), {
      target: { value: '长文翻译先分段再合' },
    });
    fireEvent.change(screen.getByTestId('memory-lesson-modal-scope'), {
      target: { value: 'translate' },
    });
    fireEvent.click(screen.getByTestId('memory-lesson-modal-submit'));
    await waitFor(() => {
      expect(mockedRemember).toHaveBeenCalledWith(
        expect.objectContaining({ content: '长文翻译先分段再合', scope_key: 'translate', source: 'manual' }),
      );
    });
    // 提交成功后刷新列表（第二次 listMemoryLessons 调用）
    await waitFor(() => {
      expect(mockedList.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByTestId('memory-lesson-modal')).toBeNull();
  });

  it('删除需二次确认：取消不删，确认后 forgetMemoryLesson 并剔除', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    });
    const card2DeleteButton = () =>
      (screen.getByTestId(`memory-lesson-card-${LESSON.id}`).querySelector('.neo-mm-btn-danger') as HTMLButtonElement);
    // 卡片里的删除按钮（弹窗确认钮文案也是「删除」，需先定位到卡片再取按钮）
    const card = screen.getByTestId(`memory-lesson-card-${LESSON.id}`);
    fireEvent.click(card.querySelector('.neo-mm-btn-danger') as HTMLButtonElement);
    const confirmModal = await screen.findByTestId('neo-confirm-modal');
    expect(confirmModal).toBeTruthy();
    // 取消 → 不调用删除
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(mockedForget).not.toHaveBeenCalled();
    // 再开 → 确认 → 删除 + 剔除
    fireEvent.click(card2DeleteButton());
    await screen.findByTestId('neo-confirm-modal');
    mockedForget.mockResolvedValue({ ...LESSON, archived: 1 });
    fireEvent.click(screen.getByTestId('neo-confirm-confirm'));    await waitFor(() => {
      expect(mockedForget).toHaveBeenCalledWith(LESSON.id);
    });
    await waitFor(() => {
      expect(screen.queryByTestId(`memory-lesson-card-${LESSON.id}`)).toBeNull();
    });
  });

  it('自动沉淀开关：缺省读取为开；切换写入 putMemorySetting(false)', async () => {
    mockedPutSetting.mockResolvedValue(undefined);
    renderPanel();
    const toggle = await screen.findByTestId('memory-lessons-autolearn');
    const checkbox = toggle.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await waitFor(() => {
      expect(mockedGetSetting).toHaveBeenCalledWith('memory.autoLearn', true);
    });
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(mockedPutSetting).toHaveBeenCalledWith('memory.autoLearn', false);
    });
    // 乐观更新后仍是 false
    expect(checkbox.checked).toBe(false);
  });
});
