/**
 * ChatPage — FB-HiFi 4-column layout (icon rail · inbox · main · drawer)
 * Design: shadowflow/project/fb-tab-chat.jsx + FB-HiFi.css
 *
 * Live wiring:
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
  Smile, AtSign, Slash, Pin, Sparkles,
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
import { fetchRecentMessages, patchGroup } from '../api/groupApi';
import { listAgents, type AgentRecord } from '../api/agents';
import PythonBackendBanner from '../components/PythonBackendBanner';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { GroupItem, GroupMetrics, Message } from '../common/types/inbox';
import { useI18n } from '../common/i18n';
import { ChatStream } from '../core/components/chat/ChatStream';
import { useChatStream } from '../core/hooks/useChatStream';
// ── Stream D 2026-05-28 · 接入 chat-fb FB-HiFi 组件 ─────────────────────────
import InboxPanelFB from '../components/chat-fb/InboxPanelFB';
import ConvHeaderFB from '../components/chat-fb/ConvHeaderFB';
import PinnedBriefFB from '../components/chat-fb/PinnedBriefFB';
import ComposerFB from '../components/chat-fb/ComposerFB';
import { ChatFeedFB, type ChatFeedAction } from '../components/chat-fb/ChatFeedFB';
import { ThreadDrawerFB, type ThreadSourceMessage } from '../components/chat-fb/ThreadDrawerFB';
import FeedSearchbarFB, { type FeedSearchFilterKey } from '../components/chat-fb/FeedSearchbarFB';
import GroupSettingsModalFB from '../components/chat-fb/GroupSettingsModalFB';
import { postGroupMessage } from '../api/groupApi';

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
/** @deprecated 2026-05-28 — 仅供旧 InboxPanel / ConvHeader / ChatDrawer 内部使用，
 *  这些组件本身已被 chat-fb FB-HiFi 版替代（见 src/components/chat-fb/）。
 *  保留是为了不破坏 deprecated 函数定义引用关系，符合"只能加不能删"原则。 */
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

// ── InboxRow ─────────────────────────────────────────────────────────────────
/** @deprecated 2026-05-28 — 由 chat-fb/InboxPanelFB 内部 IbxRow 替代 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
/** @deprecated 2026-05-28 — 由 chat-fb/InboxPanelFB 替代 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/** @deprecated 2026-05-28 — 已替换为 chat-fb/InboxPanelFB（FB-HiFi 风）。
 *  保留供回滚 / diff 阅读 ；不再被 ChatPage 主渲染调用。 */
// @ts-expect-error TS6133 — deprecated 保留版，主渲染已切到 InboxPanelFB
function InboxPanel({ groups, groupId, agentDMs, onGroup, onDm }: InboxPanelProps) {
  const { t } = useI18n();
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

  const chips: Array<[string, FilterKey]> = [
    [t('chat.filterAll'), 'all'],
    [t('chat.filterUnread'), 'unread'],
    [t('chat.filterMention'), 'mention'],
    [t('chat.filterAgent'), 'agent'],
  ];

  return (
    <div style={{ width: 268, flexShrink: 0, borderRight: `1px solid ${T.bd}`, background: T.p, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Search */}
      <div style={{ padding: '0 8px 6px' }}>
        <div style={{ height: 30, padding: '0 10px', borderRadius: 7, background: T.p2, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 8, cursor: 'text' }}>
          <Search size={13} strokeWidth={1.7} style={{ color: T.fg4, flexShrink: 0 }}/>
          <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.fg4 }}>{t('chat.searchJump')}</span>
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
          <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, color: T.fg5, letterSpacing: '0.06em' }}>{t('chat.sectionGroups')}</span>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>{visibleGroups.length}</span>
        </div>
        <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column' }}>
          {visibleGroups.length === 0 ? (
            <div style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: T.bg, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fg5 }}>
                <Users size={15} strokeWidth={1.7}/>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: T.fg5, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {filter !== 'all' ? t('chat.noMatchedGroups') : t('chat.emptyGroups')}
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
              <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, color: T.fg5, letterSpacing: '0.06em' }}>{t('chat.sectionDMs')}</span>
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
/** @deprecated 2026-05-28 — 已替换为 chat-fb/ConvHeaderFB */
// @ts-expect-error TS6133 — deprecated 保留版
function ConvHeader({ group, isRunning, builderUrl, t }: { group?: GroupItem; isRunning: boolean; builderUrl: string; t: (k: string, opts?: Record<string, unknown>) => string }) {
  const members = group?.metrics?.members ?? 0;
  const runCount = group?.metrics?.activeRuns ?? 0;

  return (
    <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 10, background: T.p, flexShrink: 0, minHeight: 58 }}>
      <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: T.p2, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.acB }}>
        <Hash size={16} strokeWidth={1.7}/>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.fg }}>{group?.name ?? t('chat.selectTeam')}</span>
          {group && <>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5 }}>· {t('chat.memberCount', { count: members })}</span>
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
/** @deprecated 2026-05-28 — 已替换为 chat-fb/PinnedBriefFB */
// @ts-expect-error TS6133 — deprecated 保留版
function PinnedBrief({ group }: { group?: GroupItem }) {
  const { t } = useI18n();
  if (!group) return null;
  const runCount = group.metrics?.activeRuns ?? 0;
  return (
    <div style={{ padding: '8px 18px', borderBottom: `1px solid ${T.bd}`, background: `color-mix(in oklab, ${T.ac} 6%, ${T.p2})`, display: 'flex', alignItems: 'flex-start', gap: 9, flexShrink: 0 }}>
      <Pin size={13} strokeWidth={2} style={{ color: T.ac, marginTop: 3, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 700, color: T.acB, letterSpacing: '0.08em' }}>BRIEF · run #{runCount > 0 ? String(runCount).padStart(3, '0') : '---'}</span>
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>· {t('chat.brief.pinned')}</span>
        </div>
        <div style={{ fontSize: 11.5, color: T.fg3, marginTop: 2, lineHeight: 1.45 }}>
          <b style={{ color: T.fg2 }}>{t('chat.brief.goal')}</b>&nbsp;{group.name} ·
          <b style={{ color: T.fg2, marginLeft: 6 }}>{t('chat.brief.gate')}</b>&nbsp;Policy Matrix L2 ·
          <b style={{ color: T.fg2, marginLeft: 6 }}>{t('chat.brief.status')}</b>&nbsp;{group.status === 'running' ? t('chat.brief.statusRunning') : group.status === 'pending_approval' ? t('chat.brief.statusPending') : t('chat.brief.statusIdle')}
        </div>
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg4, cursor: 'pointer', flexShrink: 0 }}>{t('chat.brief.expand')}</span>
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

/** @deprecated 2026-05-28 — 已替换为 chat-fb/ComposerFB */
// @ts-expect-error TS6133 — deprecated 保留版
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
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.fg5 }}>{t('chat.composerHint')}</span>
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
/** @deprecated 2026-05-28 — 已替换为 chat-fb/ThreadDrawerFB */
// @ts-expect-error TS6133 — deprecated 保留版
function ChatDrawer({ groupId, group, metrics }: { groupId?: string; group?: GroupItem; metrics: GroupMetrics }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DrawerTab>('Thread');
  const [threads, setThreads] = useState<Message[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  // Tab IDs stay constants (used as state values); rendered labels are i18n'd.
  const tabs: DrawerTab[] = ['Thread', '任务', '文档', 'Brief'];
  const tabLabel = (tb: DrawerTab) => {
    switch (tb) {
      case 'Thread': return t('chat.tabThread');
      case '任务':   return t('chat.tabTasks');
      case '文档':   return t('chat.tabDocs');
      case 'Brief':  return t('chat.tabBrief');
    }
  };

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
            {tabLabel(tb)}
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
              {groupId ? `${group?.name ?? ''} · ${t('chat.threadHeaderRecent')}` : t('chat.pickTeamFirst')}
            </div>
            {threadsLoading && (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5, textAlign: 'center', padding: '20px 0' }}>{t('common.loading')}</div>
            )}
            {!threadsLoading && groupId && threads.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.fg5, textAlign: 'center', padding: '20px 0' }}>{t('chat.noMessages')}</div>
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
              {groupId ? t('chat.approvalQueueHeader') : t('chat.pickTeamFirst')}
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
            {t('chat.noLinkedDocs')}
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
  const fetchWorkspaceInbox = useInboxStore(s => s.fetchWorkspaceInbox);
  const currentWorkspaceId = useWorkspaceStore(s => s.currentId);
  // Workspace-driven inbox fetch — pulls groups created by run-session
  // auto-save and any other ad-hoc groups so they appear in the rail.
  // Previously /chat only saw template-roster groups, leaving the rail
  // empty for runs that didn't go through a template.
  useEffect(() => {
    void fetchWorkspaceInbox(currentWorkspaceId);
  }, [currentWorkspaceId, fetchWorkspaceInbox]);

  const group = groups.find(g => g.id === groupId);
  const groupName = group?.name ?? groupId ?? '';
  const metrics = group?.metrics ?? DEFAULT_METRICS;
  const { t } = useI18n();
  const updateGroupMeta = useInboxStore(s => s.updateGroupMeta);

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

  // 2026-05-19 — guard against sending to a non-existent group. Previously
  // the sidebar linked to /chat/default which isn't a real group_id, so
  // POST /api/groups/default/messages returned 404 and the message vanished
  // on refresh. Now we refuse to send when (a) no groupId in URL, or (b)
  // the groupId doesn't match any real group in the inbox.
  const groupExists = groupId ? groups.some(g => g.id === groupId) : false;
  const handleSend = useCallback(async () => {
    const text = composer.trim();
    if (!text || chatStream.loading) return;
    if (!groupExists) {
      // Soft error — UI input stays so the user can copy out their text.
      console.warn('[ChatPage] no real group selected; refusing to send');
      return;
    }
    setComposer('');
    try {
      await chatStream.send(text);
      requestAnimationFrame(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; });
    } catch (err) { console.warn('[ChatPage] send failed:', err); }
  }, [composer, chatStream, groupExists]);

  const builderUrl = buildChatBuilderUrl({ chatId: groupId ?? '', goalText: groupName });
  const isRunning = group?.status === 'running' || (group?.metrics?.activeRuns ?? 0) > 0;

  // ── Stream D · Thread Drawer 显隐 (chat-fb.html .drawer.hide 行 604) ───────
  const [threadDrawerOpen, setThreadDrawerOpen] = useState(true);

  // ── Stream J 2026-05-28 · 群设置 modal 状态 ───────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  // workspace 维度 agents（GroupItem 没有 agent_ids，只能从全量 listAgents 过滤）
  // TODO Stream K：等后端给 group 加 agent_ids 字段后改成读 group.agent_ids
  const [allAgents, setAllAgents] = useState<AgentRecord[]>([]);
  useEffect(() => {
    listAgents(currentWorkspaceId ?? undefined)
      .then(setAllAgents)
      .catch(() => setAllAgents([]));
  }, [currentWorkspaceId]);

  // ── Stream J · 用户层 per-group 偏好 (mute / pin / fold / showNickname) ───
  // 暂存 localStorage；TODO Stream K：等后端 user-settings endpoint 上线后替换。
  interface GroupPrefs { muted: boolean; pinned: boolean; folded: boolean; showNickname: boolean }
  const PREFS_DEFAULT: GroupPrefs = { muted: false, pinned: false, folded: false, showNickname: true };
  const prefsKey = groupId ? `sf-group-prefs-${groupId}` : null;
  const [groupPrefs, setGroupPrefs] = useState<GroupPrefs>(PREFS_DEFAULT);
  useEffect(() => {
    if (!prefsKey) { setGroupPrefs(PREFS_DEFAULT); return; }
    try {
      const raw = localStorage.getItem(prefsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setGroupPrefs({ ...PREFS_DEFAULT, ...parsed });
      } else {
        setGroupPrefs(PREFS_DEFAULT);
      }
    } catch {
      setGroupPrefs(PREFS_DEFAULT);
    }
    // PREFS_DEFAULT 是常量，挪不出依赖列表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey]);

  const togglePref = useCallback((key: keyof GroupPrefs) => {
    setGroupPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (prefsKey) {
        try { localStorage.setItem(prefsKey, JSON.stringify(next)); }
        catch (err) { console.warn('[ChatPage] persist group prefs failed:', err); }
      }
      return next;
    });
  }, [prefsKey]);

  // 群成员（注入 modal members prop）— 设计稿固定 5 色映射
  const AVATAR_COLORS: Array<'b' | 'r' | 'g' | 'p' | 'o'> = ['b', 'r', 'g', 'p', 'o'];
  function hashColor(id: string): 'b' | 'r' | 'g' | 'p' | 'o' {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }
  // TODO Stream K：当后端 group record 有 agent_ids 时改为按 id 取并保留顺序。
  // 临时方案：当前 workspace 的全量 agents 都视为成员（小公司单 workspace 假设）。
  const settingsMembers = allAgents.slice(0, 12).map(a => ({
    id: a.agent_id,
    name: a.name,
    role: (a.soul?.split('\n')[0] ?? '').slice(0, 12) || 'Agent',
    avatarColor: hashColor(a.agent_id),
  }));
  const settingsAgentCount = settingsMembers.length || (metrics.members ?? 0);
  const settingsOnlineCount = Math.max(settingsAgentCount - 1, 0);

  // GroupSettingsModalFB 的 onEditField 只回传 field key（不带新值）。
  // 由 ChatPage 自己负责弹 prompt / inline 编辑器收集新值，再决定是否调 patchGroup。
  // 当前阶段先用 window.prompt 占位；TODO Stream K：换 chat-fb 风内联输入。
  const handleEditField = useCallback(
    async (field: 'groupNickname' | 'announcement' | 'myNickname' | 'searchChat') => {
      if (!groupId) return;
      if (field === 'searchChat') {
        // 复用顶部 inline search bar
        setSettingsOpen(false);
        setSearchOpen(true);
        return;
      }
      if (field === 'groupNickname') {
        const cur = group?.name ?? '';
        const next = typeof window !== 'undefined' ? window.prompt('修改群昵称', cur) : null;
        if (!next || next === cur) return;
        updateGroupMeta(groupId, { name: next });
        try {
          await patchGroup(groupId, { name: next });
        } catch (err) {
          console.warn('[ChatPage] patchGroup name 失败（Stream K 后端可能未上线）：', err);
        }
        return;
      }
      if (field === 'announcement') {
        const cur = (group as unknown as { announcement?: string })?.announcement ?? '';
        const next = typeof window !== 'undefined' ? window.prompt('修改群公告', cur) : null;
        if (next === null || next === cur) return;
        try {
          await patchGroup(groupId, { announcement: next });
          updateGroupMeta(groupId, { /* 占位 — 等 GroupItem 类型加 announcement */ } as Partial<GroupItem>);
        } catch (err) {
          console.warn('[ChatPage] patchGroup announcement 失败：', err);
        }
        return;
      }
      // myNickname — 用户层 settings；目前没 endpoint，先 console.log
      // TODO Stream K：写入 user prefs endpoint
      console.log('[ChatPage] onEditField myNickname → TODO Stream K user prefs');
    },
    [groupId, group, updateGroupMeta],
  );

  // ── Stream H · feed inline searchbar 显隐 + state ─────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFilters, setSearchFilters] = useState<FeedSearchFilterKey[]>([]);
  const toggleSearchFilter = useCallback((k: FeedSearchFilterKey) => {
    setSearchFilters(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  }, []);

  // ── Stream H · Thread Drawer 源消息 + 9 个 hover toolbar 动作分发 ─────────
  const [threadSourceMsg, setThreadSourceMsg] = useState<ThreadSourceMessage | null>(null);

  // 用最新 messages 反查源消息（state 在 callback 里只能取闭包快照，用 ref 解决）
  const messagesRef = useRef(chatStream.messages);
  messagesRef.current = chatStream.messages;

  const handleMessageAction = useCallback((action: ChatFeedAction, messageId: string) => {
    const msg = messagesRef.current.find(m => m.id === messageId);
    if (!msg) return;
    if (action === 'thread') {
      setThreadSourceMsg({
        id: msg.id,
        senderName: msg.senderName ?? (msg.role === 'user' ? '我' : 'Agent'),
        excerpt: msg.content,
        timestamp: msg.timestamp,
      });
      setThreadDrawerOpen(true);
      return;
    }
    if (action === 'reply') {
      // 插入 @sender 到 composer 头部（最朴素引用语义；后续 Story 接富文本）
      const who = msg.senderName ?? 'Agent';
      setComposer(prev => prev.startsWith(`@${who} `) ? prev : `@${who} ${prev}`);
      return;
    }
    if (action === 'quote') {
      setComposer(prev => `> ${msg.senderName ?? 'Agent'}: ${msg.content.slice(0, 80)}\n${prev}`);
      return;
    }
    if (action === 'translate' || action === 'rewrite' || action === 'forward' || action === 'pin' || action === 'react' || action === 'more') {
      // TODO Stream H · 等后端 reactions / pin / rewrite 接口上线后接 API
      // eslint-disable-next-line no-console
      console.log(`[ChatPage] message action ${action} on ${messageId} — TODO 接 API`);
      return;
    }
  }, []);

  // ── Stream H · ThreadDrawer onReplySubmit（POST 带 reply_to） ──────────────
  const handleReplySubmit = useCallback(
    async (text: string, postToMain: boolean) => {
      if (!groupId || !threadSourceMsg) return;
      // 主线（reply_to 指向源消息），用于 thread 子频道
      await postGroupMessage(groupId, text, {
        senderName: 'user',
        senderKind: 'user',
        replyTo: threadSourceMsg.id,
      });
      if (postToMain) {
        // 同时投到主频道（不带 reply_to）
        await postGroupMessage(groupId, text, {
          senderName: 'user',
          senderKind: 'user',
        });
        // 刷新 feed 让主频道新消息出现（Stream H 用最简方案：轻量重拉历史）
        // TODO: 接入 useChatStream 的 mutateMessages，避免整段重拉。
      }
    },
    [groupId, threadSourceMsg],
  );

  // Typing dots 用的 agent name（取群里第一个 agent；查不到默认 "Agent"）
  // TODO: 等 chat SSE 推 "typing" 事件后用真正的发起方名替换。
  const typingAgentName = (() => {
    if (!chatStream.loading) return undefined;
    const lastAgent = [...chatStream.messages].reverse().find(m => m.role === 'agent');
    return lastAgent?.senderName ?? 'Agent';
  })();

  return (
    // 2026-05-28 修 composer 截断 (round 3)：父容器 (HfLayout.tsx:58) 是
    // overflow:auto，会让我们的 flex 高度计算"软绑定"，子内容可以撑大整页超出
    // viewport 下沿。这里显式 height:100% 强制取父高度，再配合 minHeight:0
    // 让 column 链能 shrink，composer (flex-shrink:0) 才能稳稳贴在底部。
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', background: T.bg, color: T.fg }}>
      {/* Hidden elements for test compatibility */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', pointerEvents: 'none' }}>
        <BreadcrumbBar label={groupName}/>
        <GroupMetricsBar metrics={metrics}/>
        <ChatBriefBoardToggle briefBoardAlias={briefBoardAlias} activeTab={activeTab} onChange={handleTabChange} pendingApprovalsCount={metrics.pendingApprovalsCount}/>
      </div>

      <div style={{ padding: '12px 16px 0' }}>
        <PythonBackendBanner />
      </div>

      {/* 3-column body: inbox · main · drawer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Stream D · FB-HiFi InboxPanel — chat-fb.html 行 878-1014 */}
        <InboxPanelFB
          groups={groups}
          groupId={groupId}
          agentDMs={agentDMs}
          onGroup={id => navigate(`/chat/${id}`)}
          onDm={id => navigate(`/agent-dm/${id}`)}
          i18n={{
            searchPlaceholder: t('chat.searchJump'),
            filterAll: t('chat.filterAll'),
            filterUnread: t('chat.filterUnread'),
            filterMention: t('chat.filterMention'),
            filterAgent: t('chat.filterAgent'),
            sectionDMs: t('chat.sectionDMs'),
            emptyGroups: t('chat.emptyGroups'),
            noMatched: t('chat.noMatchedGroups'),
          }}
        />

        {/* ─ Center column ─
            2026-05-28 修 composer 显示不全：column flex 父容器必须 minHeight:0，
            否则 flex:1 的 chat-feed 不会让出空间给后面 flex-shrink:0 的 composer，
            composer 被推到 viewport 之下，底部 compFoot（send 按钮 + kbd hint）
            就看不见了。 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          {/* 2026-05-28 — 用户明确要求删掉「基于此对话创建 Agent」按钮（截图标注）
              ConvHeaderFB 现在独占 header 行，去掉外层 flex 包装。 */}
          {group && (
            <ConvHeaderFB
              group={group}
              isRunning={isRunning}
              t={t}
              threadOpen={threadDrawerOpen}
              tasksCount={metrics.pendingApprovalsCount}
              onThreadToggle={() => setThreadDrawerOpen(p => !p)}
              onTasksClick={() => handleTabChange('approvals')}
              onSearchToggle={() => setSearchOpen(p => !p)}
              onMoreClick={() => setSettingsOpen(true)}
            />
          )}
          <PinnedBriefFB group={group} t={t}/>

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

          {/* Chat messages — Stream D · FB-HiFi feed */}
          {activeTab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: T.bg }}>
              {/* Stream H · feed 顶 inline 搜索条 — 由 ConvHeader 搜索按钮 toggle */}
              <FeedSearchbarFB
                open={searchOpen}
                onClose={() => setSearchOpen(false)}
                value={searchValue}
                onChange={setSearchValue}
                filters={searchFilters}
                onToggleFilter={toggleSearchFilter}
              />
              <div ref={chatScrollRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {chatStream.messages.length === 0 ? (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, padding: 32 }}>
                    {!groupId ? (
                      <>
                        <div style={{ width: 48, height: 48, borderRadius: 14, background: T.p, border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.fg5 }}>
                          <Users size={22} strokeWidth={1.4}/>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: T.fg3 }}>{t('chat.emptyPickTeamTitle')}</p>
                          <p style={{ margin: 0, fontSize: 11, color: T.fg5, lineHeight: 1.6 }}>{t('chat.emptyPickTeamHint')}</p>
                        </div>
                      </>
                    ) : (
                      <p style={{ fontSize: 13, color: T.fg5, margin: 0 }}>{t('chat.noMessages')}</p>
                    )}
                  </div>
                ) : (
                  <ChatFeedFB
                    messages={chatStream.messages}
                    groupName={group?.name}
                    onMessageAction={handleMessageAction}
                    typing={chatStream.loading}
                    typingAgentName={typingAgentName}
                  />
                )}
              </div>
              {chatStream.error && (
                <div style={{ padding: '6px 18px', fontSize: 11, color: T.err, background: `color-mix(in oklab, ${T.err} 12%, transparent)`, borderTop: `1px solid ${T.bd}`, flexShrink: 0 }}>
                  {chatStream.error}
                </div>
              )}
            </div>
          )}

          {/* 隐藏的旧 ChatStream — 保留供测试可能依赖的 markup 渲染（非 chat tab 时不渲染） */}
          <div style={{ display: 'none' }} aria-hidden>
            <ChatStream messages={[]} />
          </div>

          <ComposerFB
            value={composer}
            onChange={setComposer}
            onSend={() => void handleSend()}
            onRunSkill={() => { const goal = composer.trim(); if (goal) navigate(`/run-session?goal=${encodeURIComponent(goal)}`); }}
            loading={chatStream.loading}
            t={t}
          />
        </div>

        {threadDrawerOpen && (
          <ThreadDrawerFB
            groupId={groupId}
            group={group}
            metrics={metrics}
            t={t}
            onClose={() => {
              setThreadDrawerOpen(false);
              setThreadSourceMsg(null);
            }}
            sourceMessage={threadSourceMsg ?? undefined}
            onReplySubmit={threadSourceMsg ? handleReplySubmit : undefined}
          />
        )}
      </div>

      {scheduleDrawerOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 499, background: 'rgba(0,0,0,0.4)' }} onClick={() => { setScheduleDrawerOpen(false); refreshSchedule(); }}/>
          <ScheduleDrawer groupId={groupId ?? ''} onClose={() => { setScheduleDrawerOpen(false); refreshSchedule(); }}/>
        </>
      )}

      {/* Stream J 2026-05-28 · DingTalk 风群设置 modal — 由 ConvHeaderFB ⋯ 触发 */}
      {group && (
        <GroupSettingsModalFB
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          groupName={group.name}
          agentCount={settingsAgentCount}
          onlineCount={settingsOnlineCount}
          startedAt={undefined /* TODO Stream K: group.startedAt 或 currentRun.started_at */}
          members={settingsMembers}
          groupNickname={group.name}
          announcement={(group as unknown as { announcement?: string }).announcement ?? ''}
          myNickname="我"
          isOwner={false /* TODO Stream K: 接 owner 概念 */}
          settings={groupPrefs}
          onEditField={field => void handleEditField(field)}
          onToggleSetting={key => togglePref(key as keyof GroupPrefs)}
          onViewAllMembers={() => console.log('[ChatPage] onViewAllMembers — TODO Stream K')}
          onInviteMember={() => console.log('[ChatPage] onInviteMember — TODO Stream K')}
          onSearchInChat={() => console.log('[ChatPage] onSearchInChat — TODO Stream K')}
          onArchive={() => console.log('[ChatPage] onArchive — TODO Stream K')}
          onLeave={() => console.log('[ChatPage] onLeave — TODO Stream K')}
        />
      )}
    </div>
  );
}
