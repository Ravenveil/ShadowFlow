/**
 * ChatPage — FB-HiFi 4-column layout (icon rail · inbox · main · drawer)
 * Design: shadowflow/project/fb-tab-chat.jsx + FB-HiFi.css
 *
 * Live wiring:
 *  - OrgSwitcher → listWorkspaces() API
 *  - Filter chips → real group/DM filtering from useInboxStore
 *  - ChatRail badges → computed from store unread counts
 *  - ChatDrawer Thread → fetchRecentMessages(groupId)
 *  - ChatDrawer 任务 → ApprovalGatePanel
 *  - ChatDrawer Brief → BriefBoardView
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Users, Hash, Lock,
  CheckSquare, Search, MoreHorizontal, Send, Paperclip,
  Smile, AtSign, Slash, ChevronDown, Pin, Sparkles,
} from 'lucide-react';
import { BreadcrumbBar } from '../core/components/inbox/BreadcrumbBar';
import { GroupMetricsBar } from '../core/components/inbox/GroupMetricsBar';
import { ChatBriefBoardToggle } from '../core/components/inbox/ChatBriefBoardToggle';
import { BriefBoardView } from '../core/components/inbox/BriefBoardView';
import { CreateAgentButton } from '../core/components/inbox/CreateAgentButton';
import { ApprovalGatePanel } from '../core/components/inbox/ApprovalGatePanel';
import { ScheduleDrawer, describeSchedule } from '../components/briefboard/ScheduleDrawer';
import { listSchedules, type Schedule } from '../api/schedules';
import { useInboxStore } from '../core/store/useInboxStore';
import { getTemplate } from '../api/templates';
import { buildChatBuilderUrl } from '../core/utils/builderNavigation';
import { listWorkspaces, type WorkspaceSummary } from '../api/workspaces';
import { fetchRecentMessages } from '../api/groupApi';
import type { GroupItem, GroupMetrics, Message } from '../common/types/inbox';
import { useI18n } from '../common/i18n';
import { ChatStream } from '../core/components/chat/ChatStream';
import { useChatStream } from '../core/hooks/useChatStream';

// ── Design token helpers ────────────────────────────────────────────────────
const T = {
  bg:  'var(--t-bg)',
  p:   'var(--t-panel)',
  p2:  'var(--t-panel-2)',
  p3:  'var(--t-panel-3)',
  fg:  'var(--t-fg)',
  fg2: 'var(--t-fg-2)',
  fg3: 'var(--t-fg-3)',
  fg4: 'var(--t-fg-4)',
  fg5: 'var(--t-fg-5)',
  bd:  'var(--t-border)',
  bd2: 'var(--t-border-2)',
  ac:  'var(--t-accent)',
  acB: 'var(--t-accent-bright)',
  acT: 'var(--t-accent-tint)',
  acI: 'var(--t-accent-ink)',
  ok:  'var(--t-ok)',
  warn:'var(--t-warn)',
  err: 'var(--t-err)',
  run: 'var(--t-run)',
  mono:'var(--font-mono)',
  pop: 'var(--shadow-pop)',
};

const DEFAULT_METRICS: GroupMetrics = { activeRuns: 0, pendingApprovalsCount: 0, costToday: 0, members: 0 };
type FilterKey = 'all' | 'unread' | 'mention' | 'agent';
type DrawerTab = 'Thread' | '任务' | '文档' | 'Brief';

// ── Avatar (FBAv equivalent) ─────────────────────────────────────────────────
function Av({ g, color, size = 32, sq }: { g: string; color: string; size?: number; sq?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, flexShrink: 0, position: 'relative',
      fontSize: size * 0.42, fontWeight: 800, letterSpacing: '-0.03em',
      background: `color-mix(in oklab, ${color} 18%, var(--t-panel-2))`,
      border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
      color, borderRadius: sq ? size * 0.22 : '50%',
    }}>{g}</span>
  );
}

// ── OrgSwitcher (钉钉-style, API-connected) ──────────────────────────────────
function OrgSwitcher() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [active, setActive] = useState<WorkspaceSummary | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listWorkspaces().then(wss => {
      setWorkspaces(wss);
      if (wss.length > 0) setActive(wss[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initials = (name: string) => name.slice(0, 2);
  const wsName = active?.name ?? 'ShadowFlow';
  const wsInit = initials(wsName);

  return (
    <div ref={ref} style={{ position: 'relative', padding: '8px 8px 4px' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 8, background: T.p2, border: `1px solid ${T.bd}`, cursor: 'pointer' }}
      >
        <span style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: wsInit.length > 1 ? 10 : 13, background: active?.color ? `color-mix(in oklab, ${active.color} 22%, ${T.p2})` : `color-mix(in oklab, ${T.ac} 22%, ${T.p2})`, border: `1px solid color-mix(in oklab, ${active?.color ?? T.ac} 50%, transparent)`, color: active?.color ?? T.acB, letterSpacing: '-0.03em' }}>{wsInit}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wsName}</div>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg4, marginTop: 1 }}>
            {active ? `${active.agent_count} agents · ${active.team_count} teams` : 'Workspace'}
          </div>
        </div>
        <ChevronDown size={13} strokeWidth={2} style={{ color: T.fg4, flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}/>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 54, left: 8, right: 8, zIndex: 50, background: T.p, border: `1px solid ${T.bd}`, borderRadius: 10, boxShadow: T.pop, padding: 5 }}>
          {workspaces.length === 0 ? (
            <div style={{ padding: '10px 8px', fontFamily: T.mono, fontSize: 10, color: T.fg4 }}>暂无 Workspace</div>
          ) : workspaces.map(ws => {
            const on = ws.workspace_id === active?.workspace_id;
            return (
              <div key={ws.workspace_id} className={`sf-org-row${on ? ' active' : ''}`} onClick={() => { setActive(ws); setOpen(false); }}>
                <span style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, background: `color-mix(in oklab, ${ws.color} 18%, ${T.p2})`, border: `1px solid color-mix(in oklab, ${ws.color} 45%, transparent)`, color: ws.color, flexShrink: 0 }}>{initials(ws.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: on ? 700 : 600, color: T.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ws.name}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.fg5, marginTop: 1 }}>{ws.agent_count} agents · {ws.team_count} teams</div>
                </div>
                {on && <span style={{ color: T.ac, fontSize: 12 }}>✓</span>}
              </div>
            );
          })}
          <div style={{ height: 1, background: T.bd, margin: '4px 4px' }}/>
          <div className="sf-org-row" style={{ opacity: 0.75 }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.p2, border: `1px dashed ${T.bd2}`, color: T.fg4, flexShrink: 0 }}>+</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.fg2 }}>创建 / 加入 Workspace</div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.fg4, marginTop: 1 }}>0G CID 导入 · 或粘贴邀请</div>
            </div>
          </div>
          <div style={{ padding: '4px 7px 2px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.fg5 }}>⌘⇧O 切换</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.fg5 }}>{workspaces.length} / 10 seats</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── InboxRow ─────────────────────────────────────────────────────────────────
function InboxRow({ n, desc, u, active, run, warn, t, members, mention, lock, onClick }: {
  n: string; desc: string; u?: number; active?: boolean; run?: boolean; warn?: boolean;
  t?: string; members?: number; mention?: boolean; lock?: boolean; onClick?: () => void;
}) {
  return (
    <div className={`sf-inbox-row${active ? ' active' : ''}`} onClick={onClick}>
      <span style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, position: 'relative', background: T.p3, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? T.acB : T.fg4 }}>
        {lock ? <Lock size={14} strokeWidth={1.7}/> : <Hash size={14} strokeWidth={1.7}/>}
        {run  && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: '50%', background: T.run,  border: `2px solid ${T.p}`, animation: 'hf-pulse 1.4s infinite' }}/>}
        {warn && !run && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 9, height: 9, borderRadius: '50%', background: T.warn, border: `2px solid ${T.p}` }}/>}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: active || (u ?? 0) > 0 ? 700 : 600, color: T.fg, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
          {members !== undefined && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.fg5 }}>{members}</span>}
          {t && <span style={{ fontFamily: T.mono, fontSize: 9.5, color: (u ?? 0) > 0 ? T.acB : T.fg5 }}>{t}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          {mention && <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 800, color: T.err, padding: '0 4px', borderRadius: 3, background: `color-mix(in oklab, ${T.err} 12%, transparent)` }}>@</span>}
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg4, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span>
        </div>
      </div>
      {(u ?? 0) > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: T.err, color: 'white', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{u}</span>}
    </div>
  );
}

// ── DmRow ─────────────────────────────────────────────────────────────────────
function DmRow({ g, n, last, color, t, mention, run, unread, onClick }: {
  g: string; n: string; last?: string; color: string; t?: string;
  mention?: boolean; run?: boolean; unread?: number; onClick?: () => void;
}) {
  return (
    <div className="sf-dm-row" onClick={onClick}>
      <span style={{ position: 'relative' }}>
        <Av g={g} color={color} size={28} sq/>
        {run    && <span style={{ position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: '50%', background: T.run,  border: `1.5px solid ${T.p}`, animation: 'hf-pulse 1.4s infinite' }}/>}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.fg, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
          {mention  && <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 800, color: T.err }}>@</span>}
          {t        && <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>{t}</span>}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.fg4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{last}</div>
      </div>
      {(unread ?? 0) > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: T.err, color: 'white', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
    </div>
  );
}

// ── Inbox panel (268px) ───────────────────────────────────────────────────────
interface InboxPanelProps {
  groups: GroupItem[];
  groupId?: string;
  agentDMs: Array<{ agentId: string; agentName: string; kind: string; status: string; unreadCount: number; lastMessage: string }>;
  onGroup: (id: string) => void;
  onDm: (id: string) => void;
}

function InboxPanel({ groups, groupId, agentDMs, onGroup, onDm }: InboxPanelProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  function statusOf(g: GroupItem) {
    if (g.status === 'running') return 'run' as const;
    if (g.status === 'blocked' || g.status === 'pending_approval') return 'warn' as const;
    return 'ok' as const;
  }

  const visibleGroups = filter === 'agent' ? [] : filter === 'unread' || filter === 'mention'
    ? groups.filter(g => g.unreadCount > 0)
    : groups;

  const visibleDMs = filter === 'unread' || filter === 'mention'
    ? agentDMs.filter(d => d.unreadCount > 0)
    : agentDMs;

  const chips: Array<[string, FilterKey]> = [['全部', 'all'], ['未读', 'unread'], ['@我', 'mention'], ['Agent', 'agent']];

  return (
    <div style={{ width: 268, flexShrink: 0, borderRight: `1px solid ${T.bd}`, background: T.p, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <OrgSwitcher/>

      {/* Search */}
      <div style={{ padding: '0 8px 6px' }}>
        <div style={{ height: 30, padding: '0 10px', borderRadius: 7, background: T.p2, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 8, cursor: 'text' }}>
          <Search size={13} strokeWidth={1.7} style={{ color: T.fg4, flexShrink: 0 }}/>
          <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.fg4 }}>搜索 / 跳转</span>
          <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>⌘F</span>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ padding: '0 8px 8px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {chips.map(([l, k]) => {
          const on = filter === k;
          return (
            <span key={k} onClick={() => setFilter(k)} style={{ padding: '3px 8px', borderRadius: 10, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', background: on ? T.acT : T.p2, color: on ? T.acB : T.fg4, border: `1px solid ${on ? `color-mix(in oklab, ${T.ac} 35%, transparent)` : T.bd}`, userSelect: 'none' }}>{l}</span>
          );
        })}
      </div>

      {/* Scroll area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 2px' }}>
        {/* Groups */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 3px' }}>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, color: T.fg5, letterSpacing: '0.06em' }}>群组 · 频道</span>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>{visibleGroups.length}</span>
        </div>
        <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column' }}>
          {visibleGroups.length === 0 ? (
            <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: T.bg, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fg5 }}>
                <Users size={15} strokeWidth={1.7}/>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: T.fg5, lineHeight: 1.5 }}>
                {filter !== 'all' ? '无匹配群组' : '暂无群组\n创建 Team 后即可群聊'}
              </p>
            </div>
          ) : visibleGroups.map(gr => {
            const st = statusOf(gr);
            return (
              <InboxRow key={gr.id}
                n={gr.name}
                desc={gr.lastMessage || `${gr.metrics?.members ?? 0} agents`}
                u={gr.unreadCount}
                active={gr.id === groupId}
                run={st === 'run'}
                warn={st === 'warn'}
                members={gr.metrics?.members}
                onClick={() => onGroup(gr.id)}
              />
            );
          })}
        </div>

        {/* DMs */}
        {visibleDMs.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 3px' }}>
              <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, color: T.fg5, letterSpacing: '0.06em' }}>直接对话 · DM</span>
              <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>{visibleDMs.length}</span>
            </div>
            <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column' }}>
              {visibleDMs.map(d => (
                <DmRow key={d.agentId}
                  g={d.agentName.charAt(0)}
                  n={d.agentName}
                  last={d.lastMessage}
                  color={T.ac}
                  run={d.status === 'running'}
                  unread={d.unreadCount}
                  onClick={() => onDm(d.agentId)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Conversation header ───────────────────────────────────────────────────────
function ConvHeader({ group, isRunning, builderUrl, t }: { group?: GroupItem; isRunning: boolean; builderUrl: string; t: (k: string) => string }) {
  const members = group?.metrics?.members ?? 0;
  const runCount = group?.metrics?.activeRuns ?? 0;

  return (
    <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 10, background: T.p, flexShrink: 0, minHeight: 58 }}>
      <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: T.p2, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.acB }}>
        <Hash size={16} strokeWidth={1.7}/>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.fg }}>{group?.name ?? '选择 Team'}</span>
          {group && <>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5 }}>· {members} 人</span>
            {isRunning && (
              <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 999, background: `color-mix(in oklab, ${T.run} 14%, transparent)`, color: T.run, border: `1px solid color-mix(in oklab, ${T.run} 40%, transparent)`, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.run, animation: 'hf-pulse 1.4s ease-in-out infinite' }}/>
                RUNNING · #{runCount || '001'}
              </span>
            )}
            <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: T.p2, color: T.fg4, border: `1px solid ${T.bd}` }}>POLICY · L2</span>
          </>}
        </div>
        {group && members > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg4 }}>{members} agents · run {runCount > 0 ? `${runCount}m` : '--'}</span>
          </div>
        )}
      </div>

      {group && <>
        <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.bd}`, background: 'transparent', color: T.fg3, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 7l4 9"/><path d="M17 7l-4 9"/></svg>
          DAG
        </button>
        {([<Search size={15}/>, <CheckSquare size={15}/>, <Users size={15}/>, <MoreHorizontal size={15}/>] as const).map((ic, i) => (
          <button key={i} type="button" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: T.fg4, cursor: 'pointer' }}>{ic}</button>
        ))}
      </>}
      <CreateAgentButton label={t('chat.createAgentFromChat')} builderUrl={builderUrl}/>
    </div>
  );
}

// ── Pinned Brief ─────────────────────────────────────────────────────────────
function PinnedBrief({ group }: { group?: GroupItem }) {
  if (!group) return null;
  const runCount = group.metrics?.activeRuns ?? 0;
  return (
    <div style={{ padding: '8px 18px', borderBottom: `1px solid ${T.bd}`, background: `color-mix(in oklab, ${T.ac} 6%, ${T.p2})`, display: 'flex', alignItems: 'flex-start', gap: 9, flexShrink: 0 }}>
      <Pin size={13} strokeWidth={2} style={{ color: T.ac, marginTop: 3, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, color: T.acB, letterSpacing: '0.08em' }}>BRIEF · run #{runCount > 0 ? String(runCount).padStart(3, '0') : '---'}</span>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>· 置顶</span>
        </div>
        <div style={{ fontSize: 11.5, color: T.fg3, marginTop: 2, lineHeight: 1.45 }}>
          <b style={{ color: T.fg2 }}>目标</b>&nbsp;{group.name} ·
          <b style={{ color: T.fg2, marginLeft: 6 }}>Gate</b>&nbsp;Policy Matrix L2 ·
          <b style={{ color: T.fg2, marginLeft: 6 }}>状态</b>&nbsp;{group.status === 'running' ? '运行中' : group.status === 'pending_approval' ? '等待审批' : '空闲'}
        </div>
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg4, cursor: 'pointer', flexShrink: 0 }}>展开 ▾</span>
    </div>
  );
}

// ── Rich Composer ─────────────────────────────────────────────────────────────
interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onRunSkill: () => void;
  loading: boolean;
  t: (k: string) => string;
}

function RichComposer({ value, onChange, onSend, onRunSkill, loading, t }: ComposerProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const cmds = [
    { cmd: '/run',     d: '触发 team 跑一轮', sel: true  },
    { cmd: '/approve', d: '批准当前 gate'                },
    { cmd: '/retry',   d: '让 agent 重写'               },
    { cmd: '/assign',  d: '把任务派给 agent'             },
    { cmd: '/pin',     d: '置顶为 brief 卡片'            },
  ];
  const tools = [
    { ic: <AtSign size={14} strokeWidth={1.7}/>,    t: '@'        },
    { ic: <Slash size={14} strokeWidth={1.7}/>,     t: '/',    fn: () => setSlashOpen(p => !p) },
    { ic: <Smile size={14} strokeWidth={1.7}/>,     t: '表情'     },
    { ic: <Paperclip size={14} strokeWidth={1.7}/>, t: '附件'     },
    { ic: <CheckSquare size={14} strokeWidth={1.7}/>, t: '任务'  },
    { ic: <Sparkles size={14} strokeWidth={1.7}/>,  t: 'AI ⌘K'  },
  ];

  return (
    <div style={{ padding: '10px 18px 12px', borderTop: `1px solid ${T.bd}`, background: T.p, position: 'relative', flexShrink: 0 }}>
      {slashOpen && (
        <div style={{ position: 'absolute', bottom: 90, left: 18, width: 300, zIndex: 20, background: T.p, border: `1px solid ${T.bd}`, borderRadius: 9, boxShadow: '0 12px 32px -8px rgba(0,0,0,.5)', padding: 5 }}>
          <div style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg4, letterSpacing: '0.06em' }}>SLASH COMMANDS</span>
            <span style={{ flex: 1 }}/>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>↑↓ · ↵</span>
          </div>
          {cmds.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 5, cursor: 'pointer', background: it.sel ? T.acT : 'transparent' }}>
              <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: it.sel ? T.acB : T.fg2, minWidth: 64 }}>{it.cmd}</span>
              <span style={{ fontSize: 11.5, color: T.fg3, flex: 1 }}>{it.d}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: T.p2, border: `1px solid ${T.bd2}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '4px 7px', borderBottom: `1px solid ${T.bd}` }}>
          {tools.map((tb, i) => (
            <button key={i} type="button" title={tb.t} onClick={tb.fn}
              style={{ width: 26, height: 24, borderRadius: 5, border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.fg4, cursor: 'pointer' }}>
              {tb.ic}
            </button>
          ))}
          <span style={{ flex: 1 }}/>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5, padding: '0 5px' }}>Markdown</span>
        </div>
        {/* Text area */}
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={t('chat.composerPlaceholder')}
          rows={2}
          style={{ width: '100%', padding: '10px 12px', minHeight: 48, resize: 'none', fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: T.fg, fontFamily: 'inherit', lineHeight: 1.5, display: 'block' }}
        />
        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px 6px', borderTop: `1px solid ${T.bd}`, background: T.p }}>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>⏎ 发送 · ⇧⏎ 换行 · / 命令</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" disabled={!value.trim()} onClick={onRunSkill} data-testid="chat-run-skill-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 9px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: value.trim() ? T.fg3 : T.fg5, cursor: value.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              <Sparkles size={11} strokeWidth={2}/>
              {t('skillStudio.entry.runSkillFromChat')}
            </button>
            <button type="button" disabled={!value.trim() || loading} onClick={onSend}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 12px', borderRadius: 6, border: 'none', background: T.ac, color: T.acI, cursor: value.trim() && !loading ? 'pointer' : 'not-allowed', opacity: value.trim() && !loading ? 1 : 0.5, fontFamily: 'inherit', fontWeight: 600 }}>
              <Send size={11} strokeWidth={2}/>
              {loading ? t('chat.sending') : t('chat.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right drawer: Thread / 任务 / 文档 / Brief ────────────────────────────────
function ChatDrawer({ groupId, group, metrics }: { groupId?: string; group?: GroupItem; metrics: GroupMetrics }) {
  const [tab, setTab] = useState<DrawerTab>('Thread');
  const [threads, setThreads] = useState<Message[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const tabs: DrawerTab[] = ['Thread', '任务', '文档', 'Brief'];

  useEffect(() => {
    if (!groupId || tab !== 'Thread') return;
    setThreadsLoading(true);
    fetchRecentMessages(groupId, 10)
      .then(msgs => setThreads(msgs))
      .catch(() => setThreads([]))
      .finally(() => setThreadsLoading(false));
  }, [groupId, tab]);

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${T.bd}`, background: T.p, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Tab strip */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bd}`, padding: '0 6px', flexShrink: 0 }}>
        {tabs.map(tb => (
          <button key={tb} type="button" onClick={() => setTab(tb)}
            style={{ padding: '10px 10px', fontSize: 11.5, fontWeight: tab === tb ? 700 : 600, color: tab === tb ? T.fg : T.fg4, borderBottom: `2px solid ${tab === tb ? T.ac : 'transparent'}`, cursor: 'pointer', background: 'transparent', border: 'none', borderRadius: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'color 120ms' }}>
            {tb}
            {tb === '任务' && metrics.pendingApprovalsCount > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.fg4, padding: '0 5px', background: T.p2, borderRadius: 8, border: `1px solid ${T.bd}` }}>{metrics.pendingApprovalsCount}</span>
            )}
          </button>
        ))}
        <span style={{ flex: 1 }}/>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {/* Thread tab */}
        {tab === 'Thread' && (
          <div style={{ padding: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5, marginBottom: 10, letterSpacing: '0.04em' }}>
              {groupId ? `${group?.name ?? ''} · 最新消息` : '请先选择 Team'}
            </div>
            {threadsLoading && (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5, textAlign: 'center', padding: '20px 0' }}>加载中…</div>
            )}
            {!threadsLoading && groupId && threads.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5, textAlign: 'center', padding: '20px 0' }}>暂无消息记录</div>
            )}
            {!threadsLoading && threads.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {threads.slice(0, 6).map((msg, i) => (
                  <div key={i} style={{ padding: '9px 11px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.p2, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                      <Av g={(msg.sender_name ?? '?').charAt(0)} color={T.ac} size={22} sq/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.fg }}>{msg.sender_name ?? 'Unknown'}</span>
                          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.fg5 }}>{msg.sender_kind ?? ''}</span>
                        </div>
                        <div style={{ fontSize: 11, color: T.fg3, marginTop: 2, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {msg.content ?? ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 任务 tab — shows approval queue */}
        {tab === '任务' && (
          <div style={{ padding: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5, marginBottom: 10, letterSpacing: '0.04em' }}>
              {groupId ? '待审批 · Approval Queue' : '请先选择 Team'}
            </div>
            {groupId ? <ApprovalGatePanel groupId={groupId}/> : null}
          </div>
        )}

        {/* Brief tab */}
        {tab === 'Brief' && groupId && (
          <div style={{ padding: 14 }}>
            <BriefBoardView groupId={groupId}/>
          </div>
        )}

        {/* 文档 tab */}
        {tab === '文档' && (
          <div style={{ padding: 14, fontFamily: T.mono, fontSize: 10, color: T.fg5, textAlign: 'center', paddingTop: 30 }}>
            暂无关联文档
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const groups = useInboxStore(s => s.groups);
  const agentDMs = useInboxStore(s => s.agentDMs);
  const group = groups.find(g => g.id === groupId);
  const groupName = group?.name ?? groupId ?? '';
  const metrics = group?.metrics ?? DEFAULT_METRICS;
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'chat' | 'briefboard' | 'approvals'>('chat');
  const [briefBoardAlias, setBriefBoardAlias] = useState('BriefBoard');
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const [groupSchedule, setGroupSchedule] = useState<Schedule | null>(null);
  const [composer, setComposer] = useState('');

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  const chatStream = useChatStream({ mode: 'group', targetId: groupId ?? null, sseChannel: 'workflow', runId: undefined });


  useEffect(() => {
    if (!group?.templateId) return;
    getTemplate(group.templateId).then(tpl => { if (tpl.brief_board_alias) setBriefBoardAlias(tpl.brief_board_alias); }).catch(() => {});
  }, [group?.templateId]);

  const refreshSchedule = useCallback(async () => {
    if (!groupId) return;
    try { const res = await listSchedules(groupId); setGroupSchedule(res.data[0] ?? null); }
    catch { setGroupSchedule(null); }
  }, [groupId]);

  useEffect(() => { refreshSchedule(); }, [refreshSchedule]);

  function handleTabChange(tab: 'chat' | 'briefboard' | 'approvals') {
    if (tab !== 'chat' && chatScrollRef.current) savedScrollTop.current = chatScrollRef.current.scrollTop;
    setActiveTab(tab);
    if (tab === 'chat') requestAnimationFrame(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = savedScrollTop.current; });
  }

  const handleSend = useCallback(async () => {
    const text = composer.trim();
    if (!text || chatStream.loading) return;
    setComposer('');
    try {
      await chatStream.send(text);
      requestAnimationFrame(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; });
    } catch (err) { console.warn('[ChatPage] send failed:', err); }
  }, [composer, chatStream]);

  const builderUrl = buildChatBuilderUrl({ chatId: groupId ?? '', goalText: groupName });
  const isRunning = group?.status === 'running' || (group?.metrics?.activeRuns ?? 0) > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: T.bg, color: T.fg }}>
      {/* Hidden elements for test compatibility */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', pointerEvents: 'none' }}>
        <BreadcrumbBar label={groupName}/>
        <GroupMetricsBar metrics={metrics}/>
        <ChatBriefBoardToggle briefBoardAlias={briefBoardAlias} activeTab={activeTab} onChange={handleTabChange} pendingApprovalsCount={metrics.pendingApprovalsCount}/>
      </div>

      {/* 3-column body: inbox · main · drawer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <InboxPanel groups={groups} groupId={groupId} agentDMs={agentDMs} onGroup={id => navigate(`/chat/${id}`)} onDm={id => navigate(`/agent-dm/${id}`)}/>

        {/* ─ Center column ─ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <ConvHeader group={group} isRunning={isRunning} builderUrl={builderUrl} t={t}/>
          <PinnedBrief group={group}/>

          {/* Sub tabs (Chat / BriefBoard / Approvals) */}
          {groupId && (
            <div style={{ padding: '0 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 2, background: T.p2, flexShrink: 0 }}>
              {([['chat', 'Chat'], ['briefboard', briefBoardAlias], ['approvals', `审批${metrics.pendingApprovalsCount > 0 ? ` · ${metrics.pendingApprovalsCount}` : ''}`]] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => handleTabChange(key)}
                  style={{ padding: '9px 12px', fontSize: 12, fontWeight: activeTab === key ? 700 : 500, color: activeTab === key ? T.fg : T.fg4, borderBottom: `2px solid ${activeTab === key ? T.ac : 'transparent'}`, background: 'transparent', border: 'none', borderRadius: 0, cursor: 'pointer', fontFamily: 'inherit', transition: 'color 120ms' }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* BriefBoard */}
          {activeTab === 'briefboard' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 22px', borderBottom: `1px solid ${T.bd}`, flexShrink: 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.fg4 }}>{groupSchedule ? describeSchedule(groupSchedule) : 'No schedule'}</span>
                <button type="button" onClick={() => setScheduleDrawerOpen(true)}
                  style={{ fontSize: 11, padding: '5px 11px', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.fg3, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Schedule
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px' }}>
                <BriefBoardView groupId={groupId ?? ''}/>
              </div>
            </div>
          )}

          {/* Approvals */}
          {activeTab === 'approvals' && (
            <div data-testid="approvals-center" style={{ flex: 1, overflow: 'auto', background: T.bg }}>
              {groupId ? (
                <div style={{ width: '100%', maxWidth: 920, margin: '0 auto', padding: 24 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: T.fg4, letterSpacing: '0.08em', marginBottom: 12 }}>APPROVAL WORKFLOW</div>
                  <ApprovalGatePanel groupId={groupId}/>
                </div>
              ) : (
                <div style={{ padding: 24, fontFamily: T.mono, fontSize: 12, color: T.fg4 }}>{t('chat.selectTeamToView')}</div>
              )}
            </div>
          )}

          {/* Chat messages */}
          {activeTab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: T.bg }}>
              <div ref={chatScrollRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <ChatStream
                  messages={chatStream.messages}
                  showSenderHeader
                  emptyState={
                    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 32 }}>
                      {!groupId ? (
                        <>
                          <div style={{ width: 48, height: 48, borderRadius: 14, background: T.p, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fg5 }}>
                            <Users size={22} strokeWidth={1.4}/>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: T.fg3 }}>从左侧选择一个 Team</p>
                            <p style={{ margin: 0, fontSize: 11, color: T.fg5, lineHeight: 1.6 }}>选择后即可查看对话和工作流详情</p>
                          </div>
                        </>
                      ) : (
                        <p style={{ fontSize: 13, color: T.fg5, margin: 0 }}>{t('chat.noMessages')}</p>
                      )}
                    </div>
                  }
                />
              </div>
              {chatStream.error && (
                <div style={{ padding: '6px 18px', fontSize: 11, color: T.err, background: `color-mix(in oklab, ${T.err} 12%, transparent)`, borderTop: `1px solid ${T.bd}`, flexShrink: 0 }}>
                  {chatStream.error}
                </div>
              )}
            </div>
          )}

          <RichComposer
            value={composer}
            onChange={setComposer}
            onSend={() => void handleSend()}
            onRunSkill={() => { const goal = composer.trim(); if (goal) navigate(`/run-session?goal=${encodeURIComponent(goal)}`); }}
            loading={chatStream.loading}
            t={t}
          />
        </div>

        <ChatDrawer groupId={groupId} group={group} metrics={metrics}/>
      </div>

      {scheduleDrawerOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(0,0,0,0.4)' }} onClick={() => { setScheduleDrawerOpen(false); refreshSchedule(); }}/>
          <ScheduleDrawer groupId={groupId ?? ''} onClose={() => { setScheduleDrawerOpen(false); refreshSchedule(); }}/>
        </>
      )}
    </div>
  );
}
