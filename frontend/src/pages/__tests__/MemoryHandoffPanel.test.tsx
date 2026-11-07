/**
 * MemoryHandoffPanel.test.tsx — 功能线③ 前端契约测试（2026-11-05）。
 *
 * 覆盖：交接包列表与统计、生成交接包、B 点接班、读取上下文（来源标注）、
 * 长期画像写回与当前值/流水展示、后端不可用时只降级不崩。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../common/i18n';
import * as api from '../../api/memoryHandoff';
import MemoryHandoffPanel from '../MemoryHandoffPanel';

vi.mock('../../api/memoryHandoff', () => ({
  listHandoffs: vi.fn(),
  getHandoffStats: vi.fn(),
  createHandoff: vi.fn(),
  acceptHandoff: vi.fn(),
  getHandoffContext: vi.fn(),
  getProfile: vi.fn(),
  writebackProfile: vi.fn(),
  listProfileConflicts: vi.fn(),
  resolveProfileConflict: vi.fn(),
  getFeedbackQueue: vi.fn(),
  submitFeedback: vi.fn(),
  runFeedbackQueue: vi.fn(),
}));

const handoff: api.Handoff = {
  id: 'h1',
  shift_id: 'shift-1',
  from_agent: 'A',
  to_agent: 'B',
  scope_key: 'copywriting',
  task_type: 'writer',
  summary: '夜班接手王老板文案单',
  status: 'pending',
  created_at: 1,
  accepted_at: null,
  context_items: 2,
};

const stats: api.HandoffStats = {
  handoffs: 1, pending: 1, accepted: 0, handoff_items: 0,
  profiles: 0, profile_events: 0, conflicts: 0, pending_conflicts: 0,
};

const conflict: api.ProfileConflict = {
  subject_type: 'customer',
  subject_id: 'cust-1',
  key: 'budget',
  current_value: '预算 800',
  current_confidence: 0.7,
  proposed_value: '预算 3000',
  proposed_confidence: 0.7,
  source: 'feedback',
  evidence: '客户后来改口',
  created_at: 1700000000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listHandoffs).mockResolvedValue([handoff]);
  vi.mocked(api.getHandoffStats).mockResolvedValue(stats);
  vi.mocked(api.createHandoff).mockResolvedValue({ handoff, idempotent: false });
  vi.mocked(api.acceptHandoff).mockResolvedValue({
    handoff: { ...handoff, status: 'accepted' }, injected: 2, idempotent: false,
  });
  vi.mocked(api.getHandoffContext).mockResolvedValue({
    agent: 'B',
    scope: { scope_key: 'copywriting', task_type: 'writer' },
    items: [{
      type: 'memory', source: 'handoff:h1', content: '烘焙文案：标题要带口味词',
      kind: 'lesson', from_agent: 'A', shift_id: 'shift-1', score: 0.8,
    }],
    count: 1,
    sources: ['handoff:h1'],
  });
  vi.mocked(api.writebackProfile).mockResolvedValue({
    subject_type: 'customer', subject_id: 'cust-1', key: 'preference',
    action: 'create', changed: true, value: '偏好简洁', confidence: 0.8,
  });
  vi.mocked(api.getProfile).mockResolvedValue({
    subject: { type: 'customer', id: 'cust-1' },
    profile: [{
      key: 'preference', value: '偏好简洁', confidence: 0.8,
      source: 'manual', evidence: '', updated_at: 1,
    }],
    history: [{
      key: 'preference', old_value: null, new_value: '偏好简洁', action: 'create',
      confidence: 0.8, source: 'manual', actor: 'system', created_at: 1,
    }],
    writes: 1,
    conflicts: 0,
    pending_conflicts: 0,
  });
  vi.mocked(api.getFeedbackQueue).mockResolvedValue({
    stats: { total: 2, pending: 0, processed: 1, skipped: 1, failed: 0, conflicts: 0 },
    items: [{
      id: 'f1', subject_type: 'customer', subject_id: 'cust-1',
      text: '客户偏好简洁', source: 'crm', source_ref: 'ticket-1',
      status: 'processed', profile_keys: ['preference'], actions: ['create'],
      conflicts: 0, error: '', actor: 'system', created_at: 1, processed_at: 2,
    }],
  });
  vi.mocked(api.submitFeedback).mockResolvedValue({
    received: 1, deduped: 0, processed: 1, skipped: 0, failed: 0, conflicts: 0,
    items: [{
      subject_id: 'cust-1', id: 'f2', dedup: false, status: 'processed',
      profile_keys: ['preference', 'budget'], actions: ['create', 'create'], conflicts: 0,
    }],
  });
  vi.mocked(api.runFeedbackQueue).mockResolvedValue({
    scanned: 1, processed: 1, skipped: 0, failed: 0, conflicts: 0,
  });
  vi.mocked(api.listProfileConflicts).mockResolvedValue([]);
  vi.mocked(api.resolveProfileConflict).mockResolvedValue({
    subject_type: 'customer', subject_id: 'cust-1', key: 'budget',
    decision: 'accept', action: 'override', value: '预算 3000',
    actor: 'ops', resolved_at: 1,
  });
});

function renderPanel() {
  return render(
    <I18nProvider>
      <MemoryHandoffPanel />
    </I18nProvider>,
  );
}

describe('MemoryHandoffPanel', () => {
  it('渲染交接包列表与统计', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('handoff-card-h1')).toBeInTheDocument());
    expect(screen.getByTestId('handoff-stats')).toHaveTextContent('交接 1');
    expect(screen.getByTestId('handoff-card-h1')).toHaveTextContent('A → B');
    expect(screen.getByTestId('handoff-card-h1')).toHaveTextContent('待接班');
  });

  it('点「接班」调用 acceptHandoff(id, to_agent)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId(`handoff-accept-${handoff.id}`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`handoff-accept-${handoff.id}`));
    await waitFor(() => expect(api.acceptHandoff).toHaveBeenCalledWith('h1', 'B'));
  });

  it('填班次生成交接包，提交后刷新列表', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('handoff-create-shift'), { target: { value: 'shift-2' } });
    fireEvent.change(screen.getByTestId('handoff-create-from'), { target: { value: 'A' } });
    fireEvent.change(screen.getByTestId('handoff-create-to'), { target: { value: 'C' } });
    fireEvent.click(screen.getByTestId('handoff-create-submit'));
    await waitFor(() =>
      expect(api.createHandoff).toHaveBeenCalledWith({
        shift_id: 'shift-2', from_agent: 'A', to_agent: 'C', scope_key: '',
      }),
    );
  });

  it('读 B 的上下文：逐条显示内容与来源', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('handoff-context-agent'), { target: { value: 'B' } });
    fireEvent.click(screen.getByTestId('handoff-context-load'));
    await waitFor(() => expect(screen.getByTestId('handoff-context-item')).toBeInTheDocument());
    expect(screen.getByTestId('handoff-context-item')).toHaveTextContent('handoff:h1');
    expect(screen.getByTestId('handoff-context-item')).toHaveTextContent('烘焙文案');
  });

  it('画像写回：提交后展示当前值与变更流水', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('handoff-profile-subject'), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByTestId('handoff-profile-key'), { target: { value: 'preference' } });
    fireEvent.change(screen.getByTestId('handoff-profile-value'), { target: { value: '偏好简洁' } });
    fireEvent.click(screen.getByTestId('handoff-profile-submit'));
    await waitFor(() => expect(api.writebackProfile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('handoff-profile-result')).toBeInTheDocument());
    expect(screen.getByTestId('handoff-profile-result')).toHaveTextContent('preference：偏好简洁');
    expect(screen.getByTestId('handoff-profile-result')).toHaveTextContent('变更流水 1 条');
  });

  it('后端不可用：显示错误条但不崩', async () => {
    vi.mocked(api.listHandoffs).mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('加载失败'));
    expect(screen.getByTestId('memory-handoff-panel')).toBeInTheDocument();
  });
});

describe('待裁决画像冲突（发现 → 人工定夺）', () => {
  beforeEach(() => {
    vi.mocked(api.listProfileConflicts).mockResolvedValue([conflict]);
  });

  it('渲染当前值 → 提议值与证据，并标出待处理条数', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('handoff-conflict')).toBeInTheDocument());
    expect(screen.getByTestId('handoff-conflict-values')).toHaveTextContent('预算 800 → 预算 3000');
    expect(screen.getByTestId('handoff-conflicts-count')).toHaveTextContent('1 条待处理');
    expect(screen.getByTestId('handoff-conflict')).toHaveTextContent('客户后来改口');
  });

  it('点「采纳提议」走 accept 裁决，并刷新待裁决列表', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('handoff-conflict-accept-cust-1-budget'));
    await waitFor(() =>
      expect(api.resolveProfileConflict).toHaveBeenCalledWith(
        expect.objectContaining({ subject_id: 'cust-1', key: 'budget', decision: 'accept', actor: 'ops' }),
      ),
    );
    await waitFor(() => expect(api.listProfileConflicts).toHaveBeenCalledTimes(2));
  });

  it('点「保留当前」走 dismiss 裁决，不把驳回写成覆盖', async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId('handoff-conflict-dismiss-cust-1-budget'));
    await waitFor(() =>
      expect(api.resolveProfileConflict).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'dismiss' }),
      ),
    );
  });

  it('没有冲突时显示空态，不渲染裁决按钮', async () => {
    vi.mocked(api.listProfileConflicts).mockResolvedValue([]);
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('handoff-conflicts')).toBeInTheDocument());
    expect(screen.queryByTestId('handoff-conflict')).not.toBeInTheDocument();
    expect(screen.getByTestId('handoff-conflicts')).toHaveTextContent('暂无冲突');
  });
});

describe('反馈自动写回队列（2026-11-06）', () => {
  it('渲染队列统计与最近一条审计记录', async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('handoff-feedback-stats')).toHaveTextContent('共 2'),
    );
    expect(screen.getByTestId('handoff-feedback-item')).toHaveTextContent('客户偏好简洁');
    expect(screen.getByTestId('handoff-feedback-item')).toHaveTextContent('命中 preference');
  });

  it('投递反馈走自动写回端点，并展示命中项与写回结果', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('handoff-profile-subject'), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByTestId('handoff-feedback-text'), { target: { value: '偏好简洁，预算 800' } });
    fireEvent.click(screen.getByTestId('handoff-feedback-submit'));
    await waitFor(() =>
      expect(api.submitFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ subject_id: 'cust-1', text: '偏好简洁，预算 800', source: 'feedback' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('handoff-feedback-note')).toHaveTextContent('已自动写回 2 项'),
    );
  });

  it('重复投递显示「未重复写回」，不假装又写了一次', async () => {
    vi.mocked(api.submitFeedback).mockResolvedValue({
      received: 1, deduped: 1, processed: 0, skipped: 0, failed: 0, conflicts: 0,
      items: [{
        subject_id: 'cust-1', id: 'f1', dedup: true, status: 'processed',
        profile_keys: ['preference'], actions: ['create'], conflicts: 0,
      }],
    });
    renderPanel();
    fireEvent.change(screen.getByTestId('handoff-profile-subject'), { target: { value: 'cust-1' } });
    fireEvent.change(screen.getByTestId('handoff-feedback-text'), { target: { value: '偏好简洁' } });
    fireEvent.click(screen.getByTestId('handoff-feedback-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('handoff-feedback-note')).toHaveTextContent('未重复写回'),
    );
  });

  it('点「补跑」调用 run 端点并回填处理统计', async () => {
    renderPanel();
    // 队列接口没回来前按钮是 disabled，等它可用再点（否则 fireEvent 不会触发）。
    const btn = await screen.findByTestId('handoff-feedback-run');
    await waitFor(() => expect(btn).not.toBeDisabled());
    fireEvent.click(btn);
    await waitFor(() => expect(api.runFeedbackQueue).toHaveBeenCalledWith({ limit: 100 }));
    await waitFor(() =>
      expect(screen.getByTestId('handoff-feedback-note')).toHaveTextContent('补跑 1 条'),
    );
  });

  it('旧后端没有队列端点时只降级，不拖垮整张面板', async () => {
    vi.mocked(api.getFeedbackQueue).mockRejectedValueOnce(new Error('404'));
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId('handoff-feedback-stats')).toHaveTextContent('队列不可用'),
    );
    expect(screen.getByTestId('handoff-conflicts')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
