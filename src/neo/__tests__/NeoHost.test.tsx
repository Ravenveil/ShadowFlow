/**
 * NeoHost — W2 钉钉式融合：会话上下文驱动标题/成员 tab 分岔（2026-08-22）。
 *
 * 覆盖：非 DM 会话（团队群）→ 标题「团队的主机」+ 成员 tab（点击挂载
 * GroupMembersPanel）；DM 会话 / 无会话 → 保持「Agent 的主机」且无成员 tab。
 * 重依赖全部 stub（useRunSession / fs / runs / 各 projection），只验证
 * NeoHost 自身的 tab 契约。
 */
import { render, screen, fireEvent, act, waitFor } from '../../test/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  listRunsMock: vi.fn(),
  /** ArtifactsView stub 捕获的最近一份 props（测试手动触发 onOpen / onOpenRecord）。 */
  artifactsViewProps: {} as {
    onOpen?: (item: { id: string; name: string; url: string | null }) => void;
    onOpenRecord?: (rec: unknown) => void;
  },
}));

vi.mock('../../core/hooks/useRunSession', () => ({
  useRunSession: () => ({ perNodeChunks: {}, isStreaming: false, loops: [] }),
}));
vi.mock('../../api/fsFiles', () => ({
  listDirs: vi.fn(() => Promise.resolve(null)),
  pickNativeFolder: vi.fn(),
  rawUrl: (p: string) => p,
  readFile: vi.fn(),
  uploadFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('../../api/runs', () => ({
  getRunLoops: vi.fn(() => Promise.resolve({ loops: [] })),
  listRuns: (...args: unknown[]) => h.listRunsMock(...args),
  streamRunLoops: vi.fn(() => ({ close: vi.fn() })),
}));
vi.mock('../projections/ProcessView', () => ({ ProcessView: () => null }));
vi.mock('../projections/ArtifactsView', () => ({
  ArtifactsView: (props: Record<string, unknown>) => {
    h.artifactsViewProps = props as typeof h.artifactsViewProps;
    return null;
  },
}));
vi.mock('../projections/EvidencePanel', () => ({ EvidencePanel: () => null }));
vi.mock('../projections/LoopVerdicts', () => ({ LoopVerdicts: () => null }));
vi.mock('../projections/NeoArtifactPreview', () => ({ NeoArtifactPreview: () => null }));
vi.mock('../projections/NeoMarkdown', () => ({ NeoMarkdown: () => null }));
vi.mock('../projections/TeamPanel', () => ({ TeamPanel: () => null }));
vi.mock('../NeoAgentSoul', () => ({ NeoAgentSoul: () => null }));
vi.mock('../projections/GroupMembersPanel', () => ({
  GroupMembersPanel: () => <div data-testid="gm-panel-stub" />,
}));

import { NeoHost } from '../NeoHost';

describe('NeoHost — 会话上下文分岔（W2）', () => {
  it('非 DM 会话 → 「团队的主机」+ 成员 tab，点击挂载 GroupMembersPanel', () => {
    render(
      <NeoHost
        target={null}
        runId={null}
        soulAgent={null}
        conversation={{ groupId: 'g1', kind: 'group', teamId: 't1' }}
      />,
    );
    expect(screen.getByTestId('neo-host-title')).toHaveTextContent('团队的主机');
    fireEvent.click(screen.getByTestId('neo-host-members-tab'));
    expect(screen.getByTestId('gm-panel-stub')).toBeInTheDocument();
  });

  it('DM 会话 → 保持「Agent 的主机」，无成员 tab（灵魂 tab 仍在）', () => {
    render(
      <NeoHost
        target={null}
        runId={null}
        soulAgent={{ id: 'a1', name: '读读' }}
        conversation={{ groupId: 'g2', kind: 'dm', teamId: null }}
      />,
    );
    expect(screen.getByTestId('neo-host-title')).toHaveTextContent('Agent 的主机');
    expect(screen.queryByTestId('neo-host-members-tab')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-host-soul-tab')).toBeInTheDocument();
  });

  it('无会话 → 「Agent 的主机」，无成员 tab', () => {
    render(<NeoHost target={null} runId={null} soulAgent={null} conversation={null} />);
    expect(screen.getByTestId('neo-host-title')).toHaveTextContent('Agent 的主机');
    expect(screen.queryByTestId('neo-host-members-tab')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 动态产物 tab（2026-08-23，对标 clawsgo 可关闭 tab）
// ---------------------------------------------------------------------------

const REC_WITH_ARTIFACT = {
  run_id: 'r1',
  goal: '写报告',
  status: 'completed',
  session_id: 's1',
  skill_display_name: 'sk',
  artifact_url: '/runs/r1/artifact/report.md',
  artifact_type: 'markdown',
  artifact_filename: 'report.md',
};

describe('NeoHost — 动态产物 tab（可关闭 / 去重聚焦）', () => {
  beforeEach(() => {
    h.listRunsMock.mockReset().mockResolvedValue([]);
    // 产物 tab 内容 effect 会 fetch(tab.url) 拉文本（NeoArtifactPreview 已 stub）
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('# md') })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('产物出现 → 自动开以产物文件名命名的动态 tab（带 ×），固定 tab 保持原样', async () => {
    h.listRunsMock.mockResolvedValue([REC_WITH_ARTIFACT]);
    const { container } = render(
      <NeoHost target={null} runId="r1" soulAgent={null} conversation={null} />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-tab="artifact:r1"]')).not.toBeNull(),
    );
    const tab = container.querySelector('[data-tab="artifact:r1"]')!;
    expect(tab).toHaveTextContent('report.md');
    expect(tab.className).toContain('neo-host-tab--on');
    expect(tab.querySelector('.neo-host-tab-close')).not.toBeNull();
    // 固定 tab 不受影响
    for (const id of ['workspace', 'artifacts', 'process']) {
      expect(container.querySelector(`[data-tab="${id}"]`)).not.toBeNull();
    }
  });

  it('点 × 关闭动态 tab → tab 消失并回落「产物」固定 tab', async () => {
    h.listRunsMock.mockResolvedValue([REC_WITH_ARTIFACT]);
    const { container } = render(
      <NeoHost target={null} runId="r1" soulAgent={null} conversation={null} />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-tab="artifact:r1"]')).not.toBeNull(),
    );
    fireEvent.click(
      container.querySelector('[data-tab="artifact:r1"] .neo-host-tab-close')!,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-tab="artifact:r1"]')).toBeNull(),
    );
    expect(container.querySelector('[data-tab="artifacts"]')!.className).toContain(
      'neo-host-tab--on',
    );
  });

  it('产物行点击追加动态 tab；重复点击不重复开、聚焦已有 tab', async () => {
    // runRecord 为 null（无自动开 tab），只走 ArtifactsView.onOpen 路径
    const { container } = render(
      <NeoHost target={null} runId="r1" soulAgent={null} conversation={null} />,
    );
    const item = { id: 'a1', name: 'plan.md', url: '/p/plan.md' };
    act(() => h.artifactsViewProps.onOpen?.(item));
    expect(container.querySelectorAll('[data-tab="artifact:a1"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-tab="artifact:a1"]')!.className,
    ).toContain('neo-host-tab--on');
    // 重复点击同一产物 → 不重复开
    act(() => h.artifactsViewProps.onOpen?.(item));
    expect(container.querySelectorAll('[data-tab="artifact:a1"]')).toHaveLength(1);
    // 第二个产物 → 并存且激活新的；点回 a1 → 聚焦已有 tab
    act(() =>
      h.artifactsViewProps.onOpen?.({ id: 'a2', name: 'report.html', url: '/p/report.html' }),
    );
    expect(container.querySelectorAll('[data-tab="artifact:a2"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-tab="artifact:a2"]')!.className,
    ).toContain('neo-host-tab--on');
    fireEvent.click(container.querySelector('[data-tab="artifact:a1"]')!);
    expect(
      container.querySelector('[data-tab="artifact:a1"]')!.className,
    ).toContain('neo-host-tab--on');
  });
});
