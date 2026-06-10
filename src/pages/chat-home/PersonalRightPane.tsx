import { useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { HfAvatar } from '../../components/hifi';
import type { AgentRecord } from '../../api/agents';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';

type TabId = 'employee' | 'tasks' | 'brief';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'employee', label: '员工' },
  { id: 'tasks', label: '任务' },
  { id: 'brief', label: 'Brief' },
];

interface PersonalRightPaneProps {
  agent: AgentRecord;
  /** dm conversation 的 groupId — 任务/Brief 面板直接复用群聊后端。 */
  groupId: string;
}

/** 员工卡 — Cherry Studio 助手面板的薄版(头像/名字/soul)。M2 接执行指标。 */
function EmployeeCard({ agent }: { agent: AgentRecord }) {
  const soulLines = (agent.soul ?? '').split('\n').filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 18, overflow: 'auto' }}>
      <HfAvatar glyph={Array.from(agent.name)[0] ?? '?'} color={agent.avatar_color ?? 'var(--t-accent)'} size={72} />
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-fg)' }}>{agent.name}</div>
      <div style={{ width: '100%', borderTop: '1px dashed var(--t-border)', paddingTop: 12 }}>
        {soulLines.slice(0, 8).map((line, i) => (
          <div key={i} style={{ fontSize: 12, color: i === 0 ? 'var(--t-fg-2)' : 'var(--t-fg-4)', lineHeight: 1.6, fontWeight: i === 0 ? 600 : 400 }}>{line}</div>
        ))}
        {soulLines.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-fg-4)' }}>暂无人设</div>}
      </div>
    </div>
  );
}

/**
 * PersonalRightPane — 个人态右栏(run 式标签页设计,M1)。
 * 标签条视觉对齐 run-session RightPaneTabs;面板全复用现有组件
 * (dm conversation 有真实 groupId,任务/Brief 即插即用)。可收起。
 */
export function PersonalRightPane({ agent, groupId }: PersonalRightPaneProps) {
  const [tab, setTab] = useState<TabId>('employee');
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div style={{ width: 40, flexShrink: 0, borderLeft: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
        <button type="button" aria-label="展开右栏" title="展开右栏" onClick={() => setCollapsed(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 6, borderRadius: 6 }}>
          <PanelRightOpen size={15} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* run 式标签条 */}
      <div role="tablist" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, padding: '8px 8px 0', borderBottom: '1px solid var(--t-border)' }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.id)}
              style={{ padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? 'var(--t-fg)' : 'var(--t-fg-3)', background: 'transparent', borderBottom: on ? '2px solid var(--t-accent)' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button type="button" aria-label="收起右栏" title="收起右栏" onClick={() => setCollapsed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 6, borderRadius: 6 }}>
          <PanelRightClose size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'employee' && <EmployeeCard agent={agent} />}
        {tab === 'tasks' && <ApprovalGatePanel groupId={groupId} />}
        {tab === 'brief' && <BriefBoardView groupId={groupId} />}
      </div>
    </div>
  );
}
