interface Phase {
  phase: string;
  label: string;
  status: 'done' | 'next' | 'future';
  period: string;
  headline: string;
  items: string[];
}

const PHASES: Phase[] = [
  {
    phase: 'Phase 1',
    label: 'MVP Done',
    status: 'done',
    period: '2026-04 · 已交付',
    headline: 'Runtime Contract + 0G 全栈原生',
    items: [
      'Policy Matrix：运行时声明并强制执行 Agent 间审批规则',
      '6 种子模板：Solo Company / Academic Paper / Newsroom / Ming Cabinet / 内容工厂 / 代码团队',
      '0G Storage：Trajectory 上传 · Merkle 验证 · CID 作者署名链',
      '0G Compute：作为第 5 Provider 接入，BYOK 密钥管理',
      'Checkpoint Resume：失败后精确回到任意历史节点续跑',
      'Approval Gate · Barrier · Retry：多 Agent 协作原语完整闭环',
    ],
  },
  {
    phase: 'Phase 2',
    label: 'Sidecar 集成',
    status: 'next',
    period: '2026-05 下旬',
    headline: '桌面化 + 实时化 + 可观测',
    items: [
      'Tauri externalBin：嵌入 Shadow 原生桌面客户端',
      'SSE → WebSocket：低延迟实时流，支持大规模并发 Agent 团队',
      'Sentry 接入：生产级错误追踪与 Agent 异常告警',
      'Fleet Dashboard：多团队并行运行总览与热力图',
      'AgentDM + BriefBoard：Inbox 协作四视图正式上线',
    ],
  },
  {
    phase: 'Phase 3',
    label: 'INFT Marketplace',
    status: 'future',
    period: '2026-Q3+',
    headline: '链上知识资产可交易',
    items: [
      'INFT 铸造：基于 CID 作者署名链，将团队铸造为链上可交易 NFT',
      '跨 persona 克隆：fork 任意 INFT 团队并在链上验证完整血统',
      'Marketplace：Agent 团队 · Policy · Checkpoint 包构成可组合知识资产',
      '激活学习器（ActivationBandit）：从执行反馈中持续学习最优积木组合',
      '学术论文投稿：Workflow-Level Neural Module Composition（ICLR/NeurIPS Workshop）',
    ],
  },
];

const STATUS_STYLES = {
  done: {
    dot: '#10B981',
    label: { background: 'var(--status-ok-tint)', color: 'var(--status-ok)', border: '1px solid var(--status-ok)' },
    line: '#10B981',
  },
  next: {
    dot: '#A855F7',
    label: { background: 'var(--accent-tint)', color: 'var(--accent-bright)', border: '1px solid var(--accent)' },
    line: '#A855F7',
  },
  future: {
    dot: '#3F3F46',
    label: { background: 'transparent', color: 'var(--fg-4)', border: '1px solid var(--border)' },
    line: '#27272A',
  },
};

const STATUS_SUFFIX = { done: '✅', next: '→ Next', future: '→ Future' };

export default function RoadmapTimeline() {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div
        className="absolute left-4 top-4 bottom-4 w-px"
        style={{ background: 'linear-gradient(to bottom, #10B981, #A855F7, #27272A)' }}
        aria-hidden="true"
      />

      <div className="space-y-8">
        {PHASES.map((phase) => {
          const styles = STATUS_STYLES[phase.status];
          return (
            <div key={phase.phase} className="relative flex gap-6 pl-10">
              {/* Dot */}
              <div
                className="absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2"
                style={{
                  background: phase.status === 'done' ? 'var(--status-ok-tint)' : phase.status === 'next' ? 'var(--accent-tint)' : 'var(--bg-elev-2)',
                  borderColor: styles.dot,
                }}
                aria-hidden="true"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: styles.dot }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 rounded-sf border p-5" style={{ borderColor: 'var(--border)', background: 'var(--bg-elev-1)' }}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] text-sf-fg4">{phase.phase}</span>
                  <span
                    className="px-2 py-0.5 rounded-pill text-[10px] font-mono font-medium"
                    style={styles.label}
                  >
                    {phase.label} {STATUS_SUFFIX[phase.status]}
                  </span>
                  <span className="font-mono text-[10px] text-sf-fg4 ml-auto">{phase.period}</span>
                </div>

                <h3 className="text-base font-semibold text-white/90 mb-3">{phase.headline}</h3>

                <ul className="space-y-1.5">
                  {phase.items.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-sf-fg3 leading-relaxed">
                      <span className="shrink-0 mt-1" style={{ color: styles.dot }} aria-hidden="true">
                        ·
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
