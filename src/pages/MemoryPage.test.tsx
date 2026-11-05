/**
 * MemoryPage.test.tsx — 统一「记忆」视图契约测试（2026-11-05 统一批）。
 *
 * 手动条目（/api/memory-entries）与经验沉淀（/api/memory/lessons）合并为一张
 * 时间混排列表。覆盖：
 *   - 合并列表：两类卡片都渲染，按更新时间混排；手动=scope pill+编辑钮，
 *     经验=kind 三色 pill+来源/score/召回次数
 *   - 类型筛选：全部/手动/经验 tab 过滤
 *   - 新建：手动类型提交 createMemoryEntry；经验类型提交 rememberLesson(source=manual)
 *   - 删除：手动=物理删；经验=软删；均需 NeoConfirmModal 二次确认
 *   - 统计与自动沉淀开关
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/memoryEntries', () => ({
  createMemoryEntry: vi.fn(),
  listMemoryEntries: vi.fn(),
  updateMemoryEntry: vi.fn(),
  deleteMemoryEntry: vi.fn(),
}));

vi.mock('../api/memoryLessons', () => ({
  listMemoryLessons: vi.fn(),
  rememberLesson: vi.fn(),
  getMemoryLessonStats: vi.fn(),
  forgetMemoryLesson: vi.fn(),
  getMemorySetting: vi.fn(),
  putMemorySetting: vi.fn(),
  KIND_LABELS: { lesson: '教训', preference: '偏好', weakness: '弱项' },
  SOURCE_LABELS: { run_failed: 'run 失败沉淀', user_abort: '用户中断沉淀', manual: '手动补充' },
}));

// MemoryProfilePanel 依赖 Python 画像 API，本页测试不关心，整面板 mock 掉。
vi.mock('./MemoryProfilePanel', () => ({
  default: () => <section data-testid="memory-profile-panel-stub" />,
}));

// MemoryHandoffPanel 依赖 /api/memory/handoff，且同样用 .neo-mm-card；
// 本页测试要用「第一个 .neo-mm-card」断言记忆列表混排，故整面板 mock 掉。
vi.mock('./MemoryHandoffPanel', () => ({
  default: () => <section data-testid="memory-handoff-panel-stub" />,
}));

import {
  createMemoryEntry,
  deleteMemoryEntry,
  listMemoryEntries,
} from '../api/memoryEntries';
import {
  forgetMemoryLesson,
  getMemoryLessonStats,
  getMemorySetting,
  listMemoryLessons,
  putMemorySetting,
  rememberLesson,
} from '../api/memoryLessons';
import type { MemoryEntry } from '../api/memoryEntries';
import type { MemoryLesson } from '../api/memoryLessons';
import MemoryPage from './MemoryPage';
import { I18nProvider } from '../common/i18n';

const mockedListEntries = listMemoryEntries as unknown as ReturnType<typeof vi.fn>;
const mockedCreateEntry = createMemoryEntry as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteEntry = deleteMemoryEntry as unknown as ReturnType<typeof vi.fn>;
const mockedListLessons = listMemoryLessons as unknown as ReturnType<typeof vi.fn>;
const mockedRemember = rememberLesson as unknown as ReturnType<typeof vi.fn>;
const mockedStats = getMemoryLessonStats as unknown as ReturnType<typeof vi.fn>;
const mockedForget = forgetMemoryLesson as unknown as ReturnType<typeof vi.fn>;
const mockedGetSetting = getMemorySetting as unknown as ReturnType<typeof vi.fn>;
const mockedPutSetting = putMemorySetting as unknown as ReturnType<typeof vi.fn>;

const ENTRY: MemoryEntry = {
  id: 'eeee1111-0000-0000-0000-000000000001',
  scope: 'project',
  title: '输出格式偏好',
  content: '报表一律用表格输出',
  created_at: '2026-11-04T08:00:00.000Z',
  updated_at: '2026-11-04T09:00:00.000Z',
};

const LESSON: MemoryLesson = {
  id: 'llll2222-0000-0000-0000-000000000002',
  kind: 'lesson',
  scope_key: '',
  task_type: '',
  title: '网关空响应先查 abort 时序',
  content: '网关空响应要先看 abort 时序，再查 env 兜底。',
  source: 'run_failed',
  source_ref: 'run-123',
  score: 0.6,
  hits: 2,
  archived: 0,
  created_at: Date.parse('2026-11-05T02:00:00.000Z'),
  updated_at: Date.parse('2026-11-05T02:26:00.000Z'), // 比手动条目新 → 混排应排前面
};

const STATS = { total: 1, by_kind: { lesson: 1 }, top_k: 4, max_per_scope: 8 };

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListEntries.mockResolvedValue([ENTRY]);
  mockedListLessons.mockResolvedValue([LESSON]);
  mockedStats.mockResolvedValue(STATS);
  mockedGetSetting.mockResolvedValue(true);
});

describe('MemoryPage（统一记忆视图）', () => {
  it('合并列表：手动+经验两类卡片都渲染，经验（更新）排在手动前面；页标题为「记忆」', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    });
    expect(screen.getByTestId(`memory-card-${ENTRY.id}`)).toBeTruthy();
    // 页标题统一为「记忆」
    expect(screen.getByTestId('memory-page').textContent).toContain('记忆');
    // 混排：经验卡片在 DOM 中位于手动卡片之前
    const first = screen.getByTestId('memory-page').querySelector('.neo-mm-card');
    expect(first?.getAttribute('data-testid')).toBe(`memory-lesson-card-${LESSON.id}`);
    // 手动卡片有编辑钮；经验卡片带来源/score/召回
    const manualCard = screen.getByTestId(`memory-card-${ENTRY.id}`);
    expect(manualCard.textContent).toContain('编辑');
    expect(manualCard.textContent).toContain('项目');
    const lessonCard = screen.getByTestId(`memory-lesson-card-${LESSON.id}`);
    expect(lessonCard.textContent).toContain('run 失败沉淀');
    expect(lessonCard.textContent).toContain('召回 2 次');
    // 工具条：召回口径 + 自动沉淀开关
    expect(screen.getByTestId('memory-lessons-stats').textContent).toContain('召回 4');
    expect(screen.getByTestId('memory-lessons-autolearn')).toBeTruthy();
    // 画像区块仍在
    expect(screen.getByTestId('memory-profile-panel-stub')).toBeTruthy();
  });

  it('类型筛选：切「手动」只显示手动卡片，切「经验」只显示经验卡片', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('memory-type-manual'));
    await waitFor(() => {
      expect(screen.queryByTestId(`memory-lesson-card-${LESSON.id}`)).toBeNull();
    });
    expect(screen.getByTestId(`memory-card-${ENTRY.id}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId('memory-type-lesson'));
    await waitFor(() => {
      expect(screen.queryByTestId(`memory-card-${ENTRY.id}`)).toBeNull();
    });
    expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId('memory-type-all'));
    await waitFor(() => {
      expect(screen.getByTestId(`memory-card-${ENTRY.id}`)).toBeTruthy();
    });
  });

  it('新建-手动：类型选「手动记忆」提交 createMemoryEntry 后刷新', async () => {
    mockedCreateEntry.mockResolvedValue({ ...ENTRY, id: 'new-entry' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('create-memory-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('create-memory-btn'));
    await screen.findByTestId('memory-entry-modal');
    fireEvent.change(screen.getByTestId('memory-modal-title'), {
      target: { value: '测试标题' },
    });
    fireEvent.change(screen.getByTestId('memory-modal-content'), {
      target: { value: '测试内容' },
    });
    fireEvent.click(screen.getByTestId('memory-modal-submit'));
    await waitFor(() => {
      expect(mockedCreateEntry).toHaveBeenCalledWith({
        scope: 'user',
        title: '测试标题',
        content: '测试内容',
      });
    });
  });

  it('新建-经验：类型切「教训」提交 rememberLesson(source=manual)', async () => {
    mockedRemember.mockResolvedValue({ ...LESSON, id: 'new-lesson' });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('create-memory-btn')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('create-memory-btn'));
    await screen.findByTestId('memory-entry-modal');
    fireEvent.change(screen.getByTestId('memory-modal-type'), {
      target: { value: 'lesson' },
    });
    // 切到经验类型后：标题输入消失，作用域输入出现
    await waitFor(() => {
      expect(screen.queryByTestId('memory-modal-title')).toBeNull();
    });
    fireEvent.change(screen.getByTestId('memory-modal-scope-key'), {
      target: { value: 'translate' },
    });
    fireEvent.change(screen.getByTestId('memory-modal-content'), {
      target: { value: '长文翻译先分段再合' },
    });
    fireEvent.click(screen.getByTestId('memory-modal-submit'));
    await waitFor(() => {
      expect(mockedRemember).toHaveBeenCalledWith({
        kind: 'lesson',
        scope_key: 'translate',
        content: '长文翻译先分段再合',
        source: 'manual',
      });
    });
    expect(mockedCreateEntry).not.toHaveBeenCalled();
  });

  it('删除：手动卡片删除走 deleteMemoryEntry；经验卡片删除走 forgetMemoryLesson；均需二次确认', async () => {
    mockedDeleteEntry.mockResolvedValue(undefined);
    mockedForget.mockResolvedValue({ ...LESSON, archived: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    });
    // 手动卡片删除（卡片内 danger 钮，避免与弹窗确认钮同名歧义）
    const manualDelete = screen
      .getByTestId(`memory-card-${ENTRY.id}`)
      .querySelector('.neo-mm-btn-danger') as HTMLButtonElement;
    fireEvent.click(manualDelete);
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(mockedDeleteEntry).not.toHaveBeenCalled();
    fireEvent.click(manualDelete);
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-confirm'));
    await waitFor(() => {
      expect(mockedDeleteEntry).toHaveBeenCalledWith(ENTRY.id);
    });
    // 经验卡片删除
    await waitFor(() => {
      expect(screen.getByTestId(`memory-lesson-card-${LESSON.id}`)).toBeTruthy();
    });
    const lessonDelete = screen
      .getByTestId(`memory-lesson-card-${LESSON.id}`)
      .querySelector('.neo-mm-btn-danger') as HTMLButtonElement;
    fireEvent.click(lessonDelete);
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-confirm'));
    await waitFor(() => {
      expect(mockedForget).toHaveBeenCalledWith(LESSON.id);
    });
  });

  it('自动沉淀开关：缺省读取为开；切换写入 putMemorySetting(false)', async () => {
    mockedPutSetting.mockResolvedValue(undefined);
    renderPage();
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
    expect(checkbox.checked).toBe(false);
  });
});
