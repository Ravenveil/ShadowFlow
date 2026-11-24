/**
 * 收尾轮（GAP :14/:15）ArtifactsView 测试：
 *   - filecard 副标题：metadata.summary 优先，无则回落 producer
 *   - 置顶图标：pinned 节点排前；点击调 toggleArtifactPin 且不触发展开预览
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';

const getArtifactLineageMock = vi.fn();
const getCheckpointLineageMock = vi.fn();
const toggleArtifactPinMock = vi.fn();

vi.mock('../../api/runs', () => ({
  getArtifactLineage: (...args: unknown[]) => getArtifactLineageMock(...args),
  getCheckpointLineage: (...args: unknown[]) => getCheckpointLineageMock(...args),
  toggleArtifactPin: (...args: unknown[]) => toggleArtifactPinMock(...args),
}));

import { ArtifactsView } from '../projections/ArtifactsView';

const EMPTY_CHECKPOINTS = {
  projection_kind: 'checkpoint_lineage_graph',
  version: '1',
  scope: {},
  summary: {},
  filters: {},
  nodes: [],
  edges: [],
  metadata: {},
};

function lineageWithTwoArtifacts() {
  return {
    projection_kind: 'artifact_lineage_graph',
    version: '1',
    scope: {},
    summary: {},
    filters: {},
    nodes: [
      {
        id: 'a1',
        entity_type: 'artifact',
        label: 'plan.md',
        refs: {},
        timestamps: {},
        metadata: { kind: 'report', summary: '计划文档的内容摘要', pinned: false },
      },
      {
        id: 'a2',
        entity_type: 'artifact',
        label: 'report.html',
        refs: {},
        timestamps: {},
        metadata: { kind: 'html', preview_url: '/api/artifacts/a2/preview', pinned: true },
      },
    ],
    edges: [],
    metadata: {},
  };
}

function renderView(onOpen = vi.fn()) {
  getCheckpointLineageMock.mockResolvedValue(EMPTY_CHECKPOINTS);
  render(
    <ArtifactsView runId="r1" active={false} runRecord={null} onOpen={onOpen} onOpenRecord={vi.fn()} />,
  );
  return onOpen;
}

describe('ArtifactsView pin + summary', () => {
  it('副标题优先显示 summary；无 summary 的节点不渲染副标题', async () => {
    getArtifactLineageMock.mockResolvedValue(lineageWithTwoArtifacts());
    renderView();
    await waitFor(() => expect(screen.getByText('plan.md')).toBeTruthy());
    expect(screen.getByText('计划文档的内容摘要')).toBeTruthy();
    // a2 无 summary 且无 producer → 无副标题行
    const row = screen.getByText('report.html').closest('.neo-host-artifact-row')!;
    expect(row.querySelector('.neo-host-artifact-producer')).toBeNull();
  });

  it('pinned 节点排在未置顶节点之前', async () => {
    getArtifactLineageMock.mockResolvedValue(lineageWithTwoArtifacts());
    renderView();
    await waitFor(() => expect(screen.getByText('plan.md')).toBeTruthy());
    const names = [...document.querySelectorAll('.neo-host-artifact-name')].map((n) => n.textContent);
    expect(names).toEqual(['report.html', 'plan.md']);
    // 置顶态图标带 --on 修饰
    expect(document.querySelector('.neo-host-artifact-pin--on')).toBeTruthy();
  });

  it('点击置顶图标调 toggleArtifactPin 且不触发展开预览', async () => {
    getArtifactLineageMock.mockResolvedValue(lineageWithTwoArtifacts());
    toggleArtifactPinMock.mockResolvedValue({ artifact_id: 'a1', pinned: true, pinned_at: 't' });
    const onOpen = renderView();
    await waitFor(() => expect(screen.getByText('plan.md')).toBeTruthy());

    const row = screen.getByText('plan.md').closest('.neo-host-artifact-row')!;
    const pin = row.querySelector('.neo-host-artifact-pin')!;
    fireEvent.click(pin);

    expect(toggleArtifactPinMock).toHaveBeenCalledWith('a1');
    expect(onOpen).not.toHaveBeenCalled();
    // toggle 确认后 a1 变置顶 → 排到最前
    await waitFor(() => {
      const names = [...document.querySelectorAll('.neo-host-artifact-name')].map((n) => n.textContent);
      expect(names).toEqual(['plan.md', 'report.html']);
    });
  });
});
