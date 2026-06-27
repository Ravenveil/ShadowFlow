// src/pages/chat-home/AgentWorkspacePane.tsx
// 2026-06-24 — 拍平为单排工作台（对齐 ClawsGO「Agent 的主机」）：一排 tab
// 产物/文件/任务/Brief + 顶部 run 状态细条。不再嵌套两排，「设定/人设」
// 移到中栏 DM 头部点开（见 PersonalChatView）。2026-06-27 精简移除「画布」tab。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, RefreshCw, ArrowUpRight, X, CheckCircle2 } from 'lucide-react';
import { RightPaneTabs, type RightPaneTabDef } from '../../components/run-session/RightPaneTabs';
import { useWorkspaceRun } from '../../core/hooks/useWorkspaceRun';
import PreviewPanel from '../../components/run-session/PreviewPanel';
import { WorkspaceFilesView } from './WorkspaceFilesView';
import { AgentSettingsCard } from './AgentSettingsCard';
import { ApprovalGatePanel } from '../../core/components/inbox/ApprovalGatePanel';
import { BriefBoardView } from '../../core/components/inbox/BriefBoardView';
import type { RunSessionSummary } from '../../api/runSessions';
import type { AgentRecord } from '../../api/agents';

type WsTab = 'role' | 'preview' | 'files' | 'tasks' | 'brief';

// 基础单排（对齐 ClawsGO + 设计稿右栏）。「角色」tab 不常驻——点中栏头部才弹出
// （见 roleSignal）。2026-06-27 精简：移除「画布」tab —— DAG 蓝图已在中栏头部 DAG
// 按钮可达，右栏重复入口冗余（对标设计稿右栏只有 文件/工作区，clawsgo 无画布）。
const BASE_TABS: RightPaneTabDef<WsTab>[] = [
  { key: 'preview', label: '产物' },
  { key: 'files', label: '文件' },
  { key: 'tasks', label: '任务' },
  { key: 'brief', label: 'Brief' },
];

const STATUS_META: Record<string, { label: string; fg: string; pulse?: boolean }> = {
  running: { label: '运行中', fg: 'var(--t-accent)', pulse: true },
  succeeded: { label: '已完成', fg: 'var(--t-ok, #16a34a)' },
  failed: { label: '出错', fg: 'var(--t-err, #dc2626)' },
  canceled: { label: '已取消', fg: 'var(--t-fg-4)' },
  idle: { label: '历史', fg: 'var(--t-fg-4)' },
};

/** run 状态细条 — 取代「概览」整 tab（ClawsGO 式：状态在顶部细条，工作台占满）。 */
function RunStatusBar({
  latest,
  reloading,
  celebrate = false,
  onReload,
  onOpen,
}: {
  latest: RunSessionSummary | null;
  reloading: boolean;
  /** R2 — 刚从 running→succeeded 时为 true，绿勾过冲弹入（clawsgo 任务完成）。 */
  celebrate?: boolean;
  onReload: () => void;
  onOpen: (sid: string) => void;
}) {
  const meta = latest ? STATUS_META[latest.status] ?? STATUS_META.idle : null;
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-panel)',
        minHeight: 34,
      }}
    >
      {latest && meta ? (
        <>
          {/* R2 — 完成态用绿勾 ✓（clawsgo 任务完成），刚转变时过冲弹入；运行态脉冲点。 */}
          {latest.status === 'succeeded' ? (
            <CheckCircle2 size={13} aria-hidden strokeWidth={2.4}
              style={{ color: meta.fg, flexShrink: 0 }}
              className={celebrate ? 'sf-pop-in' : undefined} />
          ) : (
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: meta.fg, flexShrink: 0 }}
              className={meta.pulse ? 'sf-pulse' : undefined} />
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: meta.fg, flexShrink: 0 }}>{meta.label}</span>
          <span style={{ fontSize: 11, color: 'var(--t-fg-3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {latest.goal || `Run #${latest.session_id.slice(0, 4)}`}
          </span>
          <button type="button" aria-label="打开 Run" title="打开整页 Run" onClick={() => onOpen(latest.session_id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-accent)', padding: 3, display: 'inline-flex' }}>
            <ArrowUpRight size={13} />
          </button>
        </>
      ) : (
        <>
          <Rocket size={13} aria-hidden style={{ color: 'var(--t-fg-4)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--t-fg-4)', flex: 1 }}>暂无运行记录 · 在左侧发起任务</span>
        </>
      )}
      <button type="button" aria-label="刷新" title="刷新" onClick={onReload}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 3, display: 'inline-flex' }}>
        <RefreshCw size={12} className={reloading ? 'sf-spin' : undefined} />
      </button>
    </div>
  );
}

/**
 * AgentWorkspacePane — 聊天右栏「Agent 工作台」（个人态/群聊态共用）。
 * 单排 tab：产物/文件/画布/任务/Brief；顶部 run 状态细条。接 useWorkspaceRun 实时态。
 */
export function AgentWorkspacePane({
  groupId,
  trailing,
  agent,
  roleSignal,
  onAgentUpdated,
}: {
  groupId?: string | null;
  trailing?: ReactNode;
  /** 选中的 agent — 提供后「角色」tab 可弹出（点中栏头部触发）。 */
  agent?: AgentRecord | null;
  /** 中栏头部点击的递增信号 — 变化即弹出并激活「角色」tab。 */
  roleSignal?: number;
  /** soul 保存成功后回调父组件刷新 selected agent state。 */
  onAgentUpdated?: (updated: AgentRecord) => void;
}) {
  const [tab, setTab] = useState<WsTab>('preview');
  const [roleOpen, setRoleOpen] = useState(false);
  const navigate = useNavigate();
  const { session, latest, loading, reload, runCwd } = useWorkspaceRun(groupId);

  // R2 — 追踪 running→succeeded 转变，给状态条绿勾 2.6s 庆祝弹入（clawsgo 任务完成）。
  const [celebrate, setCelebrate] = useState(false);
  const prevStatusRef = useRef<string | undefined>(latest?.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    const cur = latest?.status;
    prevStatusRef.current = cur;
    if (prev === 'running' && cur === 'succeeded') {
      setCelebrate(true);
      const t = window.setTimeout(() => setCelebrate(false), 2600);
      return () => window.clearTimeout(t);
    }
  }, [latest?.status]);

  // 点中栏头部（roleSignal 递增）→ 右栏弹出「角色」tab 并激活。
  useEffect(() => {
    if (roleSignal && roleSignal > 0 && agent) {
      setRoleOpen(true);
      setTab('role');
    }
  }, [roleSignal, agent]);

  const closeRole = () => {
    setRoleOpen(false);
    setTab((t) => (t === 'role' ? 'preview' : t));
  };

  const tabs: RightPaneTabDef<WsTab>[] =
    roleOpen && agent ? [{ key: 'role', label: '角色' }, ...BASE_TABS] : BASE_TABS;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <RunStatusBar
        latest={latest}
        reloading={loading}
        celebrate={celebrate}
        onReload={reload}
        onOpen={(sid) => navigate(`/run-session/${sid}`)}
      />
      <RightPaneTabs<WsTab>
        activeTab={tab}
        onTabChange={setTab}
        tabs={tabs}
        ariaLabel="工作台标签"
        trailing={trailing}
        panels={{
          role: agent ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid var(--t-border)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-fg-4)', flex: 1 }}>角色 · agent 详情</span>
                <button type="button" aria-label="关闭角色" title="关闭" onClick={closeRole}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 3, display: 'inline-flex' }}>
                  <X size={13} />
                </button>
              </div>
              <AgentSettingsCard agent={agent} onAgentUpdated={onAgentUpdated} />
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          ),
          preview: <PreviewPanel session={session} />,
          files: <WorkspaceFilesView root={runCwd} />,
          tasks: groupId ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
              <ApprovalGatePanel groupId={groupId} />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--t-fg-4)', fontSize: 12 }}>选择会话后显示待办</div>
          ),
          brief: groupId ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14 }}>
              <BriefBoardView groupId={groupId} />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--t-fg-4)', fontSize: 12 }}>选择会话后显示简报</div>
          ),
        }}
      />
    </div>
  );
}
