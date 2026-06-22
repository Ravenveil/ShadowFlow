import { type ReactNode, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { HfAvatar } from '../../components/hifi';
import type { AgentRecord } from '../../api/agents';
import { RightPaneTabs, type RightPaneTabDef } from '../../components/run-session/RightPaneTabs';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';
import { RunWorkPane } from './RunWorkPane';
import { EmbeddedPage } from '../../components/run-session/EmbeddedPage';
import CalendarPage from '../CalendarPage';
import ProjectsPage from '../ProjectsPage';

// 2026-06-18 — DM 单聊右栏 = 该 agent 的「设定卡」(用户选定:prompt/模型/工具)。
// 「设定」置首并默认,工作区/任务/Brief 降为次级 tab(保留,不删 — UI 保护规则)。
// 2026-06-22 — 用户要求把「日历」「项目」整页塞进右栏标签页(三处右栏统一)。
type TabId = 'employee' | 'work' | 'tasks' | 'brief' | 'calendar' | 'projects';
const TABS: RightPaneTabDef<TabId>[] = [
  { key: 'employee', label: '设定' },
  { key: 'work', label: '工作区' },
  { key: 'tasks', label: '任务' },
  { key: 'brief', label: 'Brief' },
  { key: 'calendar', label: '日历' },
  { key: 'projects', label: '项目' },
];

interface PersonalRightPaneProps {
  /** 选中的助手；未选时第三栏仍常驻（设计稿），设定/任务/Brief 显示引导。 */
  agent?: AgentRecord | null;
  /** dm conversation 的 groupId — 任务/Brief/工作区 面板直接复用群聊后端。 */
  groupId?: string | null;
}

/** 设定卡里的分段标题。 */
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-fg-5)', marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/**
 * 设定卡 — DM 单聊右栏主体（对标 Cherry Studio 助手面板）：
 *   头像 + 名字 + 模型徽章 · 系统 Prompt 全文 · 工具/知识库 chips。
 * 模型/工具藏在 agent.blueprint（QuickCreateRequest.model/tools 落库处）。
 */
function AgentSettingsCard({ agent }: { agent: AgentRecord }) {
  const bp = (agent.blueprint ?? {}) as Record<string, unknown>;
  const model = typeof bp.model === 'string' && bp.model.trim() ? bp.model.trim() : null;
  const tools = Array.isArray(bp.tools)
    ? (bp.tools as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  const soul = (agent.soul ?? '').trim();

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 头部：头像 + 名字 + 模型徽章 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
        <HfAvatar glyph={Array.from(agent.name)[0] ?? '?'} color={agent.avatar_color ?? 'var(--t-accent)'} size={72} />
        <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--t-fg)' }}>{agent.name}</div>
        {model && (
          <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', padding: '2px 9px', borderRadius: 999, background: 'var(--t-accent-tint)', color: 'var(--t-accent-bright)', border: '1px solid var(--t-accent)' }}>
            {model}
          </span>
        )}
      </div>

      {/* 系统 Prompt 全文 */}
      <SettingsSection title="系统 Prompt">
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.65, color: 'var(--t-fg-2)', fontFamily: 'inherit', margin: 0, padding: '10px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 8 }}>
          {soul || '暂无人设'}
        </pre>
      </SettingsSection>

      {/* 工具 / 知识库 */}
      <SettingsSection title="工具 / 知识库">
        {tools.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map((t) => (
              <span key={t} style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', padding: '2px 8px', borderRadius: 6, background: 'var(--t-panel-2)', color: 'var(--t-fg-3)', border: '1px solid var(--t-border)' }}>
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--t-fg-4)' }}>默认工具集（未单独配置）</div>
        )}
      </SettingsSection>
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
            <AgentSettingsCard agent={agent} />
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
          // 日历 / 项目 — 整页直接塞入(自带布局,EmbeddedPage 只负责撑满高度)
          calendar: <EmbeddedPage><CalendarPage /></EmbeddedPage>,
          projects: <EmbeddedPage><ProjectsPage /></EmbeddedPage>,
        }}
      />
    </div>
  );
}
