/**
 * L6 证据层打包 UI 测试：
 *   - LoopVerdicts — verifier 面板：展开拉取 verdicts，渲染 rationale + claims
 *   - NeoRunHistory — 历史 runs 列表：listRuns(50) 渲染，行链接 /?run=<id>
 *   - ArtifactsView — artifact 节点 preview_url 直链优先，缺失时文件名回落
 */
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { describe, expect, it, vi } from 'vitest';
import type { RunRecord } from '../../api/runs';

// ── api/runs mock（类型导入在编译期擦除，只需提供运行时函数）──────────────
const getLoopVerdictsMock = vi.fn();
const listRunsMock = vi.fn();
const getArtifactLineageMock = vi.fn();
const getCheckpointLineageMock = vi.fn();

vi.mock('../../api/runs', () => ({
  getLoopVerdicts: (...args: unknown[]) => getLoopVerdictsMock(...args),
  listRuns: (...args: unknown[]) => listRunsMock(...args),
  getArtifactLineage: (...args: unknown[]) => getArtifactLineageMock(...args),
  getCheckpointLineage: (...args: unknown[]) => getCheckpointLineageMock(...args),
}));

import { LoopVerdicts } from '../projections/LoopVerdicts';
import { NeoRunHistory } from '../NeoRunHistory';
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

function lineageWithArtifact(metadata: Record<string, unknown>) {
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
        label: 'report.html',
        refs: {},
        timestamps: {},
        metadata,
      },
    ],
    edges: [],
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// LoopVerdicts
// ---------------------------------------------------------------------------

describe('LoopVerdicts', () => {
  it('收起时不拉取；展开后渲染每轮 rationale + claims', async () => {
    getLoopVerdictsMock.mockResolvedValue([
      { iteration: 0, score: 0.62, rationale: '证据不足，结论未覆盖目标', claims: [{ text: '覆盖全部子任务', status: 'unsupported' }] },
    ]);
    render(<LoopVerdicts runId="r1" loopId="L1" active={false} />);
    expect(getLoopVerdictsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /验证意见/ }));
    await waitFor(() => expect(screen.getByText('证据不足，结论未覆盖目标')).toBeTruthy());
    expect(screen.getByText('覆盖全部子任务')).toBeTruthy();
    expect(screen.getByText('unsupported')).toBeTruthy();
    expect(screen.getByText('score 0.62')).toBeTruthy();
    expect(getLoopVerdictsMock).toHaveBeenCalledWith('r1', 'L1');
  });

  it('端点失败 → 干净错误条', async () => {
    getLoopVerdictsMock.mockRejectedValue(new Error('404'));
    render(<LoopVerdicts runId="r1" loopId="L1" active={false} />);
    fireEvent.click(screen.getByRole('button', { name: /验证意见/ }));
    await waitFor(() => expect(screen.getByText('验证意见加载失败')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// NeoRunHistory
// ---------------------------------------------------------------------------

describe('NeoRunHistory', () => {
  it('listRuns(50) 渲染列表，行链接沿用 /?run=<id> 形态', async () => {
    const rec: RunRecord = {
      run_id: 'run-abc',
      session_id: 's1',
      goal: '写一份氢能报告',
      skill_name: 'report',
      skill_display_name: '报告生成',
      artifact_type: 'markdown',
      artifact_filename: 'report.md',
      artifact_url: '/api/artifacts/x',
      status: 'completed',
      created_at: '2026-08-20T10:00:00',
      completed_at: '2026-08-20T10:01:00',
    };
    listRunsMock.mockResolvedValue([rec]);
    render(<NeoRunHistory />);
    await waitFor(() => expect(screen.getByText('写一份氢能报告')).toBeTruthy());
    const link = screen.getByText('写一份氢能报告').closest('a');
    expect(link?.getAttribute('href')).toBe('/?run=run-abc');
    expect(listRunsMock).toHaveBeenCalledWith(50);
    expect(screen.getByText('report.md')).toBeTruthy();
  });

  it('加载失败 → 错误条 + 重试', async () => {
    listRunsMock.mockRejectedValueOnce(new Error('boom'));
    render(<NeoRunHistory />);
    await waitFor(() => expect(screen.getByText('历史任务加载失败')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// ArtifactsView — preview_url 优先 / 文件名回落
// ---------------------------------------------------------------------------

describe('ArtifactsView preview_url', () => {
  it('artifact 节点带 preview_url → 直链优先（忽略不可 fetch 的 uri）', async () => {
    getArtifactLineageMock.mockResolvedValue(
      lineageWithArtifact({ kind: 'html', preview_url: '/api/artifacts/a1/preview', uri: 'sandbox:/tmp/x' }),
    );
    getCheckpointLineageMock.mockResolvedValue(EMPTY_CHECKPOINTS);
    const onOpen = vi.fn();
    render(
      <ArtifactsView runId="r1" active={false} runRecord={null} onOpen={onOpen} onOpenRecord={vi.fn()} />,
    );
    const row = await waitFor(() => screen.getByText('report.html'));
    fireEvent.click(row.closest('button')!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/artifacts/a1/preview' }));
  });

  it('无 preview_url 且 uri 不可直链 → 文件名匹配回落 RunRecord.artifact_url', async () => {
    getArtifactLineageMock.mockResolvedValue(
      lineageWithArtifact({ kind: 'html', uri: 'sandbox:/tmp/x' }),
    );
    getCheckpointLineageMock.mockResolvedValue(EMPTY_CHECKPOINTS);
    const onOpen = vi.fn();
    const rec = {
      run_id: 'r1', session_id: 's1', goal: 'g', skill_name: 'k', skill_display_name: 'k',
      artifact_type: 'html', artifact_filename: 'report.html', artifact_url: '/runs/r1/artifact',
      status: 'completed', created_at: '', completed_at: '',
    } as RunRecord;
    render(
      <ArtifactsView runId="r1" active={false} runRecord={rec} onOpen={onOpen} onOpenRecord={vi.fn()} />,
    );
    const row = await waitFor(() => screen.getByText('report.html'));
    fireEvent.click(row.closest('button')!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ url: '/runs/r1/artifact' }));
  });
});
