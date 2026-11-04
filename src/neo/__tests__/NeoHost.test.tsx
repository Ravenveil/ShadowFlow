/**
 * NeoHost — W2 钉钉式融合：会话上下文驱动标题/tab 分岔（2026-08-22）。
 *
 * 覆盖：非 DM 会话（团队群）→ 标题跟随群聊名称（缺失回落「团队的主机」）
 * + 编队 tab（三合一；2026-11-04 第六批：编队 pane 尾部重复的成员面板
 * GroupMembersPanel 与一级「封驳矩阵」section 移除，只留前部 TeamPanel）；
 * DM 会话 / 无会话 → 保持「Agent 的主机」且无编队 tab。
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

// 稳定单例：useRunSession 每次渲染必须返回同一对象 —— 否则 NeoHost 的
// loops effect（依赖 session.loops 身份）会因新数组引用无限重跑 +
// setLoops(新数组) 无限渲染（Maximum update depth，全文件连跑时挂死）。
vi.mock('../../core/hooks/useRunSession', () => {
  const session = { perNodeChunks: {}, isStreaming: false, loops: [] };
  return { useRunSession: () => session };
});
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
// 定时任务 tab（os-unified 2026-11-04）：面板与 getAgent 都要 stub——
// 否则真实 fetch 打到跑着的 dev 后端，异步 setState 跨测试泄漏，
// 会让后续「产物出现」用例陷入 setState 死循环（Maximum update depth）。
vi.mock('../AgentSchedulesPanel', () => ({ AgentSchedulesPanel: () => null }));
vi.mock('../../api/agents', () => ({ getAgent: vi.fn(() => Promise.resolve(null)) }));

import { NeoHost } from '../NeoHost';

describe('NeoHost — 会话上下文分岔（W2）', () => {
  it('非 DM 会话 → 标题跟随群聊名称 + 编队 tab（三合一）', () => {
    render(
      <NeoHost
        target={null}
        runId={null}
        soulAgent={null}
        conversation={{ groupId: 'g1', kind: 'group', teamId: 't1', teamName: '氢能获客群' }}
      />,
    );
    // 2026-11-04 用户反馈：团队群标题不再固定「团队的主机」，跟随群聊名称
    expect(screen.getByTestId('neo-host-title')).toHaveTextContent('氢能获客群');
    // os-unified 2026-11-04 三合一：独立「成员」tab 已并入「编队」tab。
    expect(screen.getByTestId('neo-host-team-tab')).toBeInTheDocument();
    expect(screen.getByTestId('neo-host-team-pane')).toBeInTheDocument();
    // 2026-11-04 第六批：编队 pane 尾部重复的成员面板已移除
    expect(screen.queryByTestId('gm-panel-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-host-members-tab')).not.toBeInTheDocument();
  });

  it('群名缺失 → 标题回落「团队的主机」', () => {
    render(
      <NeoHost
        target={null}
        runId={null}
        soulAgent={null}
        conversation={{ groupId: 'g1', kind: 'group', teamId: 't1', teamName: null }}
      />,
    );
    expect(screen.getByTestId('neo-host-title')).toHaveTextContent('团队的主机');
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
    expect(screen.queryByTestId('neo-host-team-tab')).not.toBeInTheDocument();
    expect(screen.getByTestId('neo-host-soul-tab')).toBeInTheDocument();
  });

  it('os-unified 2026-11-04：定时任务 tab 在「灵魂」右边（独立 tab，不在灵魂面板内）', () => {
    render(
      <NeoHost
        target={null}
        runId={null}
        soulAgent={{ id: 'a1', name: '读读' }}
        conversation={{ groupId: 'g2', kind: 'dm', teamId: null }}
      />,
    );
    const soulTab = screen.getByTestId('neo-host-soul-tab');
    const schedTab = screen.getByTestId('neo-host-schedules-tab');
    expect(schedTab).toBeInTheDocument();
    // tab 条 DOM 顺序：定时任务紧跟灵魂（compareDocumentPosition 4 = FOLLOWING）
    expect(soulTab.compareDocumentPosition(schedTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 点击激活 → pane 挂载
    fireEvent.click(schedTab);
    expect(screen.getByTestId('neo-host-schedules-pane')).toBeInTheDocument();
  });

  it('无会话 → 「Agent 的主机」，无编队 tab（也无灵魂/定时任务 tab）', () => {
    render(<NeoHost target={null} runId={null} soulAgent={null} conversation={null} />);
    expect(screen.getByTestId('neo-host-title')).toHaveTextContent('Agent 的主机');
    expect(screen.queryByTestId('neo-host-team-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-host-soul-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('neo-host-schedules-tab')).not.toBeInTheDocument();
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
    // 固定 tab 不受影响（os-unified 三合一后 process/members 已并入 team，
    // 此用例无团队上下文 → team tab 不应出现）
    for (const id of ['workspace', 'artifacts']) {
      expect(container.querySelector(`[data-tab="${id}"]`)).not.toBeNull();
    }
    expect(container.querySelector('[data-tab="team"]')).toBeNull();
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
