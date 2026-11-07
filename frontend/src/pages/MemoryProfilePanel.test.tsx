/**
 * MemoryProfilePanel.test.tsx — 记忆画像面板（Story 9.3 前端补齐，2026-08-23）契约测试。
 *
 * Vitest + RTL（对齐 KnowledgePage.test.tsx 模式）：mock api 层控制响应形状。
 * 覆盖：
 *   - 空态：listMemoryProfiles 返回空列表 → 空态文案，不 mock 假数据
 *   - 列表：listMemoryProfiles 返回的画像直接渲染
 *   - 统计卡：getMemoryStats → 工作记忆上限 / 保留天数 / 技能数
 *   - 新建：弹窗提交 → createMemoryProfile 入参 + 列表出现
 *   - 编辑：updateMemoryProfile 入参 + 列表更新
 *   - 删除：二次确认（confirm 取消不删；确认后 deleteMemoryProfile + 列表剔除）
 *   - 手动写回：triggerManualWriteback(runId) + 结果回显
 *   - 一次性迁移：localStorage 历史 id 与远端列表并集去重（远端为准），
 *     远端缺失的 id 逐个 GET，404 剔除，迁移后移除 localStorage key
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../api/memory', () => ({
  createMemoryProfile: vi.fn(),
  getMemoryProfile: vi.fn(),
  listMemoryProfiles: vi.fn(),
  updateMemoryProfile: vi.fn(),
  deleteMemoryProfile: vi.fn(),
  getMemoryStats: vi.fn(),
  triggerManualWriteback: vi.fn(),
  MemoryApiError: class MemoryApiError extends Error {
    code: string;
    constructor(
      public status: number,
      _detail: unknown,
      code = '',
    ) {
      super(`Memory API error ${status}`);
      this.code = code || `HTTP_${status}`;
    }
  },
}));

import {
  createMemoryProfile,
  deleteMemoryProfile,
  getMemoryProfile,
  getMemoryStats,
  listMemoryProfiles,
  triggerManualWriteback,
  updateMemoryProfile,
  MemoryApiError,
} from '../api/memory';
import type { MemoryProfile } from '../common/types/memory';
import MemoryProfilePanel from './MemoryProfilePanel';
import { I18nProvider } from '../common/i18n';

const mockedCreate = createMemoryProfile as unknown as ReturnType<typeof vi.fn>;
const mockedGet = getMemoryProfile as unknown as ReturnType<typeof vi.fn>;
const mockedList = listMemoryProfiles as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = updateMemoryProfile as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = deleteMemoryProfile as unknown as ReturnType<typeof vi.fn>;
const mockedStats = getMemoryStats as unknown as ReturnType<typeof vi.fn>;
const mockedWriteback = triggerManualWriteback as unknown as ReturnType<typeof vi.fn>;

const IDS_KEY = 'sf.memory-profile-ids';

const PROFILE: MemoryProfile = {
  profile_id: '11111111-2222-3333-4444-555555555555',
  working_memory_limit: 4096,
  episodic_retention_days: 30,
  semantic_retrieval_top_k: 5,
  writeback_policy: 'on_task_complete',
  state_sync_policy: 'lazy',
  compression_policy: 'none',
  created_at: '2026-08-23T01:00:00.000Z',
  updated_at: '2026-08-23T01:00:00.000Z',
};

const PROFILE2: MemoryProfile = {
  ...PROFILE,
  profile_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  working_memory_limit: 8192,
};

const STATS = {
  working_memory_limit: 8192,
  episodic_retention_days: 14,
  semantic_skills_count: 3,
};

function renderPanel() {
  return render(
    <I18nProvider>
      <MemoryProfilePanel />
    </I18nProvider>,
  );
}

describe('MemoryProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockedList.mockResolvedValue({ data: [], meta: { count: 0 } });
    mockedStats.mockResolvedValue({ data: STATS, meta: {} });
  });

  it('空态：远端无画像时给空态文案且不请求 getMemoryProfile', async () => {
    renderPanel();
    expect(await screen.findByTestId('memory-profile-empty')).toBeTruthy();
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('统计卡：渲染 getMemoryStats 返回的三项指标', async () => {
    renderPanel();
    const card = await screen.findByTestId('memory-stats-card');
    expect(card.textContent).toContain('8192');
    expect(card.textContent).toContain('14');
    expect(card.textContent).toContain('3');
  });

  it('新建：弹窗提交调用 createMemoryProfile，列表出现且不写 localStorage', async () => {
    mockedCreate.mockResolvedValue({ data: PROFILE, meta: {} });
    renderPanel();
    await screen.findByTestId('memory-profile-empty');

    fireEvent.click(screen.getByTestId('create-profile-btn'));
    const modal = await screen.findByTestId('memory-profile-modal');
    expect(modal).toBeTruthy();

    fireEvent.change(screen.getByTestId('profile-modal-wml'), { target: { value: '8192' } });
    fireEvent.change(screen.getByTestId('profile-modal-wb-policy'), { target: { value: 'manual' } });
    fireEvent.click(screen.getByTestId('profile-modal-submit'));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          working_memory_limit: 8192,
          episodic_retention_days: 30,
          semantic_retrieval_top_k: 5,
          writeback_policy: 'manual',
        }),
      );
    });
    expect(await screen.findByTestId(`memory-profile-${PROFILE.profile_id}`)).toBeTruthy();
    expect(window.localStorage.getItem(IDS_KEY)).toBeNull();
  });

  it('列表：listMemoryProfiles 返回的画像直接渲染', async () => {
    mockedList.mockResolvedValue({ data: [PROFILE], meta: { count: 1 } });
    renderPanel();
    const card = await screen.findByTestId(`memory-profile-${PROFILE.profile_id}`);
    expect(card.textContent).toContain('4096');
    expect(card.textContent).toContain('on_task_complete');
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('一次性迁移：localStorage 中远端缺失的 id 逐个 GET 合并，迁移后移除 key', async () => {
    window.localStorage.setItem(IDS_KEY, JSON.stringify([PROFILE.profile_id, PROFILE2.profile_id]));
    mockedList.mockResolvedValue({ data: [PROFILE], meta: { count: 1 } });
    mockedGet.mockResolvedValue({ data: PROFILE2, meta: {} });
    renderPanel();
    const card = await screen.findByTestId(`memory-profile-${PROFILE2.profile_id}`);
    expect(card.textContent).toContain('8192');
    expect(screen.getByTestId(`memory-profile-${PROFILE.profile_id}`)).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith(PROFILE2.profile_id);
    expect(window.localStorage.getItem(IDS_KEY)).toBeNull();
  });

  it('一次性迁移：GET 返回 404 的历史 id 被剔除并显示远端列表', async () => {
    window.localStorage.setItem(IDS_KEY, JSON.stringify([PROFILE.profile_id, PROFILE2.profile_id]));
    mockedList.mockResolvedValue({ data: [PROFILE], meta: { count: 1 } });
    mockedGet.mockRejectedValue(new MemoryApiError(404, {}, 'PROFILE_NOT_FOUND'));
    renderPanel();
    await screen.findByTestId(`memory-profile-${PROFILE.profile_id}`);
    expect(screen.queryByTestId(`memory-profile-${PROFILE2.profile_id}`)).toBeNull();
    expect(window.localStorage.getItem(IDS_KEY)).toBeNull();
  });

  it('编辑：提交调用 updateMemoryProfile 并更新列表', async () => {
    mockedList.mockResolvedValue({ data: [PROFILE], meta: { count: 1 } });
    mockedUpdate.mockResolvedValue({
      data: { ...PROFILE, working_memory_limit: 2048 },
      meta: {},
    });
    renderPanel();
    await screen.findByTestId(`memory-profile-${PROFILE.profile_id}`);

    fireEvent.click(screen.getByTestId(`edit-profile-${PROFILE.profile_id}`));
    await screen.findByTestId('memory-profile-modal');
    fireEvent.change(screen.getByTestId('profile-modal-wml'), { target: { value: '2048' } });
    fireEvent.click(screen.getByTestId('profile-modal-submit'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        PROFILE.profile_id,
        expect.objectContaining({ working_memory_limit: 2048 }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId(`memory-profile-${PROFILE.profile_id}`).textContent).toContain('2048');
    });
  });

  it('删除：需二次确认（NeoConfirmModal 弹窗），确认后调用 deleteMemoryProfile 并剔除', async () => {
    mockedList.mockResolvedValue({ data: [PROFILE], meta: { count: 1 } });
    mockedDelete.mockResolvedValue(undefined);
    renderPanel();
    await screen.findByTestId(`memory-profile-${PROFILE.profile_id}`);

    // 弹窗打开 → 点取消 → 不删
    fireEvent.click(screen.getByTestId(`delete-profile-${PROFILE.profile_id}`));
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-cancel'));
    expect(mockedDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('neo-confirm-modal')).toBeNull());

    // 再开弹窗 → 点确认 → 删除并从列表剔除
    fireEvent.click(screen.getByTestId(`delete-profile-${PROFILE.profile_id}`));
    await screen.findByTestId('neo-confirm-modal');
    fireEvent.click(screen.getByTestId('neo-confirm-confirm'));
    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(PROFILE.profile_id);
    });
    expect(await screen.findByTestId('memory-profile-empty')).toBeTruthy();
  });

  it('手动写回：输入 run_id 触发 triggerManualWriteback 并回显状态', async () => {
    mockedWriteback.mockResolvedValue({
      data: { run_id: 'run-1', status: 'writeback_triggered' },
      meta: {},
    });
    renderPanel();
    await screen.findByTestId('memory-profile-empty');

    const btn = screen.getByTestId('writeback-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('writeback-run-id'), { target: { value: 'run-1' } });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockedWriteback).toHaveBeenCalledWith('run-1');
    });
    const msg = await screen.findByTestId('writeback-msg');
    expect(msg.textContent).toContain('writeback_triggered');
  });
});
