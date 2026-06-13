import { useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { HfAvatar } from '../../components/hifi';
import type { AgentRecord } from '../../api/agents';
import { RightPaneTabs, type RightPaneTabDef } from '../../components/run-session/RightPaneTabs';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';
import { RunWorkPane } from './RunWorkPane';

type TabId = 'work' | 'employee' | 'tasks' | 'brief';
const TABS: RightPaneTabDef<TabId>[] = [
  { key: 'work', label: '工作区' },
  { key: 'employee', label: '员工' },
  { key: 'tasks', label: '任务' },
  { key: 'brief', label: 'Brief' },
];

interface PersonalRightPaneProps {
  /** 选中的助手；未选时第三栏仍常驻（设计稿），员工/任务/Brief 显示引导。 */
  agent?: AgentRecord | null;
  /** dm conversation 的 groupId — 任务/Brief/工作区 面板直接复用群聊后端。 */
  groupId?: string | null;
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

function NeedAgentHint() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--t-fg-4)', lineHeight: 1.7 }}>选择一个助手后这里显示 TA 的资料与任务</span>
    </div>
  );
}

/**
 * PersonalRightPane — 个人态右栏（第三栏，常驻）。
 * M3 三栏融合：复用 run-session 的 RightPaneTabs shell；「工作区」tab =
 * RunWorkPane（run-session 右半部分进聊天——按 dm 会话关联 run，设计稿框架）。
 * 员工/任务/Brief 面板全复用现有组件。可收起。
 */
export function PersonalRightPane({ agent, groupId }: PersonalRightPaneProps) {
  // 单聊 1:1 默认看「员工」(该 agent 的资料/人设)——比 run 列表更贴合单聊语境；
  // 未选助手(无 agent)时回落「工作区」。
  const [tab, setTab] = useState<TabId>(agent ? 'employee' : 'work');
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
    <div style={{ width: 312, flexShrink: 0, borderLeft: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <RightPaneTabs<TabId>
        activeTab={tab}
        onTabChange={setTab}
        tabs={TABS}
        ariaLabel="个人态右栏标签"
        trailing={
          <button type="button" aria-label="收起右栏" title="收起右栏" onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 6, borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}>
            <PanelRightClose size={15} strokeWidth={1.75} />
          </button>
        }
        panels={{
          work: <RunWorkPane groupId={groupId} />,
          employee: agent ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <EmployeeCard agent={agent} />
            </div>
          ) : (
            <NeedAgentHint />
          ),
          tasks: groupId ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
              <ApprovalGatePanel groupId={groupId} />
            </div>
          ) : (
            <NeedAgentHint />
          ),
          brief: groupId ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
              <BriefBoardView groupId={groupId} />
            </div>
          ) : (
            <NeedAgentHint />
          ),
        }}
      />
    </div>
  );
}
