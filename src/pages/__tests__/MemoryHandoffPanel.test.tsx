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
  ingestFeedback: vi.fn(),
  writebackProfile: vi.fn(),
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
  profiles: 0, profile_events: 0, conflicts: 0,
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
  });
  vi.mocked(api.ingestFeedback).mockResolvedValue({
    subject_id: 'cust-1', profile_keys: ['preference', 'budget'], extracted: 2, rules: 5,
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
