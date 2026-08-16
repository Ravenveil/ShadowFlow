/**
 * NeoRail — Neo 左栏导航（clawsgo 形态）。
 *
 * 展开 240px / 折叠 56px 图标 rail，宽度 240ms spring 过渡，折叠状态
 * localStorage 记忆（'sf.neo.railCollapsed'）。结构：
 *   - 顶部「个人 | 团队」切换（复用 PersonalTeamToggle，折叠态用 compact）
 *   - 「+ 新任务」近黑主按钮（sf-btn-primary，day 主题近黑）
 *   - 搜索框（过滤当前列表）
 *   - Agents/Teams 区：个人态 listAgents、团队态 listTeams（真实 API，不 mock）
 *   - 会话条目：个人态最近单聊（useInboxStore agentDMs，同 PersonalChatView 数据源）
 *   - 底部用户卡（useAuth）+ 设置齿轮（/settings）
 * 列表行 = 纯文字 + 细线图标（15px --t-fg-3），选中 = 灰底 600 加粗（对齐
 * ClawsGo home.html .nav-row / .group-label 复刻；无彩色 tile、无指示条）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  ChevronDown,
  Library,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { listAgents, type AgentRecord } from '../api/agents';
import { listTeams, type TeamRecord } from '../api/teams';
import { useAuth } from '../core/auth/AuthContext';
import { useI18n } from '../common/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import { useCommandK } from '../core/hooks/useCommandK';
import {
  PersonalTeamToggle,
  type ChatHomeView,
} from '../pages/chat-home/PersonalTeamToggle';
import type { NeoRailProps, NeoTarget } from './types';

const RAIL_COLLAPSED_KEY = 'sf.neo.railCollapsed';
const VIEW_KEY = 'sf.neo.view';

type LoadState = 'loading' | 'ready' | 'error';

/** rail 折叠态头像状态点（data-status → --t-run/warn/err，样式在 neo.css .neo-avatar-dot）。 */
type NeoAvatarStatus = 'run' | 'warn' | 'err';

function agentStatusToDot(status: AgentRecord['status']): NeoAvatarStatus | undefined {
  if (status === 'running') return 'run';
  if (status === 'error') return 'err';
  if (status === 'paused') return 'warn';
  return undefined;
}

/* ── Neo 本地极简头像（阶段 2.5：替代旧体系 AgentAvatar 渲染组件）────────────
   圆形色块 + 首字母，纯 CSS（neo.css .neo-avatar）。色 = 后端 avatar_color（hex
   时直接用）否则按种子 hash 落 7 色环，同一 agent 稳定同色。 */

/** 浅墨兰迪 7 色环（与旧体系 agentAvatar AGENT_PALETTE accent 同色值，换壳不换色）。 */
const NEO_AVATAR_COLORS = ['#F59E0B', '#A855F7', '#EF4444', '#0891B2', '#22D3EE', '#10B981', '#71717A'];

function neoAvatarColor(seed: string, color: string | null): string {
  if (color && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) return color.trim();
  let h = 0;
  const key = seed || '?';
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return NEO_AVATAR_COLORS[Math.abs(h) % NEO_AVATAR_COLORS.length];
}

function neoAvatarInitial(name: string): string {
  const first = Array.from((name ?? '').trim())[0] ?? '?';
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}

function NeoAgentAvatar({
  seed,
  name,
  color,
  status,
}: {
  seed: string;
  name: string;
  color: string | null;
  status?: NeoAvatarStatus;
}) {
  return (
    <span className="neo-avatar" style={{ background: neoAvatarColor(seed, color) }} aria-hidden>
      {neoAvatarInitial(name)}
      {status && <span className="neo-avatar-dot" data-status={status} />}
    </span>
  );
}

function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function NeoRail({ target, onSelect, onNewTask }: NeoRailProps) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((s) => s.currentId);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [view, setView] = useState<ChatHomeView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'team' ? 'team' : 'personal';
    } catch {
      return 'personal';
    }
  });
  const [query, setQuery] = useState('');
  // 加载失败后的手动重试触发器（+1 重新跑列表 effect）
  const [reloadTick, setReloadTick] = useState(0);

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsState, setAgentsState] = useState<LoadState>('loading');
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsState, setTeamsState] = useState<LoadState>('loading');

  // 会话条目（个人态）— 最近单聊，数据源同 PersonalChatView；Python 宕机时
  // store 降级为空数组，渲染干净空态即可。
  const agentDMs = useInboxStore((s) => s.agentDMs) ?? [];
  // 群列表（Polynoia 对标 2026-08-15）— 点击进群聊现场页（/group/:id），
  // 看单聊编排派发后 agents 干活的可视现场。
  const groups = useInboxStore((s) => s.groups) ?? [];

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // localStorage 不可用就只用内存态
      }
      return next;
    });

  const changeView = (v: ChatHomeView) => {
    setView(v);
    setQuery('');
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 忽略持久化失败
    }
  };

  useEffect(() => {
    if (view !== 'personal') return;
    let alive = true;
    setAgentsState('loading');
    listAgents(workspaceId ?? undefined)
      .then((rows) => {
        if (!alive) return;
        setAgents(rows);
        setAgentsState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setAgents([]);
        setAgentsState('error');
      });
    return () => {
      alive = false;
    };
  }, [view, workspaceId, reloadTick]);

  useEffect(() => {
    if (view !== 'team') return;
    let alive = true;
    setTeamsState('loading');
    listTeams(workspaceId ?? undefined)
      .then((rows) => {
        if (!alive) return;
        setTeams(rows);
        setTeamsState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setTeams([]);
        setTeamsState('error');
      });
    return () => {
      alive = false;
    };
  }, [view, workspaceId, reloadTick]);

  useEffect(() => {
    if (view !== 'personal') return;
    void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
  }, [view, workspaceId]);

  const q = query.trim().toLowerCase();
  const filteredAgents = useMemo(
    () => (q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents),
    [agents, q],
  );
  const filteredTeams = useMemo(
    () => (q ? teams.filter((tm) => tm.name.toLowerCase().includes(q)) : teams),
    [teams, q],
  );
  const recentDMs = useMemo(
    () =>
      [...agentDMs]
        .sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
        .filter((d) => (q ? d.agentName.toLowerCase().includes(q) : true))
        .slice(0, 8),
    [agentDMs, q],
  );
  const recentGroups = useMemo(
    () =>
      [...groups]
        .sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
        .filter((g) => (q ? g.name.toLowerCase().includes(q) : true))
        .slice(0, 6),
    [groups, q],
  );

  const isOn = (kind: NeoTarget['kind'], id: string) =>
    target?.kind === kind && target.id === id;

  // 「新任务」行 kbd 提示（Kimi tmp5D2B）对应的真实绑定：复用全局 useCommandK，
  // Ctrl/⌘+K = 回到新任务 composer（NeoApp.handleNewTask）。Neo 路由不挂
  // HfLayout，QuickSwitcher 的 ⌘K 不在此作用域，无冲突。
  useCommandK({ onOpen: onNewTask });

  const listState = view === 'personal' ? agentsState : teamsState;

  const userName =
    user?.display_name || (user?.address ? shortAddress(user.address) : t('neo.anonymous'));

  // ── 折叠态：56px 图标 rail ────────────────────────────────────────────────
  if (collapsed) {
    return (
      <nav className="neo-rail collapsed" aria-label={t('shell.navigation')}>
        <button
          type="button"
          className="neo-icon-btn"
          onClick={toggleCollapsed}
          aria-label={t('neo.expandRail')}
          title={t('neo.expandRail')}
          data-testid="neo-rail-expand"
        >
          <PanelLeftOpen size={15} strokeWidth={1.75} aria-hidden />
        </button>
        <PersonalTeamToggle view={view} onChange={changeView} compact />
        <button
          type="button"
          className="neo-icon-btn neo-newtask-icon"
          onClick={onNewTask}
          aria-label={t('neo.newTask')}
          title={t('neo.newTask')}
          data-testid="neo-new-task"
        >
          <Plus size={15} strokeWidth={2} aria-hidden />
        </button>
        <div className="neo-rail-icons" role="list">
          {view === 'personal'
            ? filteredAgents.map((a) => (
                <button
                  key={a.agent_id}
                  type="button"
                  role="listitem"
                  className={`neo-icon-btn neo-avatar-btn${isOn('agent', a.agent_id) ? ' on' : ''}`}
                  onClick={() => onSelect({ kind: 'agent', id: a.agent_id, name: a.name })}
                  title={a.name}
                  aria-label={a.name}
                  aria-pressed={isOn('agent', a.agent_id)}
                >
                  <NeoAgentAvatar
                    seed={a.agent_id}
                    name={a.name}
                    color={a.avatar_color ?? null}
                    status={agentStatusToDot(a.status)}
                  />
                </button>
              ))
            : filteredTeams.map((tm) => (
                <button
                  key={tm.team_id}
                  type="button"
                  role="listitem"
                  className={`neo-icon-btn neo-avatar-btn${isOn('team', tm.team_id) ? ' on' : ''}`}
                  onClick={() => onSelect({ kind: 'team', id: tm.team_id, name: tm.name })}
                  title={tm.name}
                  aria-label={tm.name}
                  aria-pressed={isOn('team', tm.team_id)}
                >
                  <Users size={16} strokeWidth={1.75} aria-hidden />
                </button>
              ))}
        </div>
        <div className="neo-rail-spacer" />
        <span className="neo-user-initial" title={userName}>
          {(userName || '?').slice(0, 1).toUpperCase()}
        </span>
        <Link
          to="/loop-engine"
          className="neo-icon-btn"
          aria-label={t('shell.loopEngine')}
          title={t('shell.loopEngine')}
        >
          <Repeat size={15} strokeWidth={1.75} aria-hidden />
        </Link>
        <Link
          to="/settings"
          className="neo-icon-btn"
          aria-label={t('common.settings')}
          title={t('common.settings')}
        >
          <Settings size={15} strokeWidth={1.75} aria-hidden />
        </Link>
      </nav>
    );
  }

  // ── 展开态：240px 完整导航 ────────────────────────────────────────────────
  return (
    <nav className="neo-rail" aria-label={t('shell.navigation')}>
      <div className="neo-rail-head">
        <div className="neo-rail-head-row">
          <div className="neo-rail-toggle-wrap">
            <PersonalTeamToggle view={view} onChange={changeView} />
          </div>
          <button
            type="button"
            className="neo-icon-btn"
            onClick={toggleCollapsed}
            aria-label={t('neo.collapseRail')}
            title={t('neo.collapseRail')}
            data-testid="neo-rail-collapse"
          >
            <PanelLeftClose size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className="sf-btn sf-btn-primary neo-newtask"
          onClick={onNewTask}
          data-testid="neo-new-task"
        >
          <Plus size={15} strokeWidth={2} aria-hidden />
          <span>{t('neo.newTask')}</span>
          {/* 2026-08-15 Kimi tmp5D2B：行右侧 kbd 小胶囊，真实绑定见上方 useCommandK */}
          <kbd className="neo-kbd" aria-hidden>
            Ctrl K
          </kbd>
        </button>
        <div className="neo-search">
          <Search size={13} strokeWidth={1.9} aria-hidden className="neo-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('agent.searchPlaceholder')}
            aria-label={t('common.search')}
          />
        </div>
        {/* 2026-08-15 阶段1：知识库导航行（ClawsGo home.html .nav-row 复刻）。
            承接真实页面：KnowledgePage（Story 9.1，GET /knowledge/packs）挂 /knowledge
            路由。视觉仍是旧体系样式，Neo 化留给后续；locale key 暂未入库，先用 defaultValue。 */}
        <Link
          to="/knowledge"
          className="neo-nav-row"
          data-testid="neo-nav-knowledge"
        >
          <Library size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.knowledgeBase', { defaultValue: language === 'zh' ? '知识库' : 'Knowledge' })}
          </span>
        </Link>
      </div>

      <div className="neo-rail-body">
        <div className="neo-section-label">
          {view === 'personal' ? t('shell.navAgents') : t('shell.navTeams')}
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
        </div>
        {listState === 'loading' && (
          <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="sf-skeleton neo-rail-skeleton" />
            ))}
          </div>
        )}
        {listState === 'error' && (
          <div className="neo-list-note neo-list-error">
            <span className="neo-list-error-text">{t('team.loadError')}</span>
            <button
              type="button"
              className="neo-list-retry"
              onClick={() => setReloadTick((n) => n + 1)}
              data-testid="neo-rail-retry"
            >
              <RotateCcw size={11} strokeWidth={2} aria-hidden />
              {t('common.retry')}
            </button>
          </div>
        )}
        {listState === 'ready' && view === 'personal' && filteredAgents.length === 0 && (
          <div className="neo-list-note">{t('agent.noAgents')}</div>
        )}
        {listState === 'ready' && view === 'team' && filteredTeams.length === 0 && (
          <div className="neo-list-note">{t('chat.noTeams')}</div>
        )}
        {view === 'personal'
          ? filteredAgents.map((a) => (
              <button
                key={a.agent_id}
                type="button"
                className={`neo-row${isOn('agent', a.agent_id) ? ' on' : ''}`}
                onClick={() => onSelect({ kind: 'agent', id: a.agent_id, name: a.name })}
                aria-pressed={isOn('agent', a.agent_id)}
              >
                <Bot size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">{a.name}</span>
              </button>
            ))
          : filteredTeams.map((tm) => (
              <button
                key={tm.team_id}
                type="button"
                className={`neo-row${isOn('team', tm.team_id) ? ' on' : ''}`}
                onClick={() => onSelect({ kind: 'team', id: tm.team_id, name: tm.name })}
                aria-pressed={isOn('team', tm.team_id)}
              >
                <Users size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">{tm.name}</span>
                <span className="neo-row-meta">{tm.agent_ids.length}</span>
              </button>
            ))}

        {view === 'personal' && recentDMs.length > 0 && (
          <>
            <div className="neo-section-label">
              {t('neo.sessions')}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {recentDMs.map((d) => (
              <button
                key={d.agentId}
                type="button"
                className={`neo-row${isOn('agent', d.agentId) ? ' on' : ''}`}
                onClick={() => onSelect({ kind: 'agent', id: d.agentId, name: d.agentName })}
                aria-pressed={isOn('agent', d.agentId)}
              >
                <MessageSquare size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">{d.agentName}</span>
                {d.unreadCount > 0 && (
                  <span className="neo-row-badge">{d.unreadCount}</span>
                )}
              </button>
            ))}
          </>
        )}

        {/* 群聊现场入口（Polynoia 对标 2026-08-15）— /group/:id 群时间线页。 */}
        {recentGroups.length > 0 && (
          <>
            <div className="neo-section-label">
              {t('neo.groups', { defaultValue: language === 'zh' ? '群聊现场' : 'Group Rooms' })}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {recentGroups.map((g) => (
              <Link key={g.id} to={`/group/${g.id}`} className="neo-row neo-row-link" data-testid="neo-group-row">
                <UsersRound size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">{g.name}</span>
                {g.unreadCount > 0 && <span className="neo-row-badge">{g.unreadCount}</span>}
              </Link>
            ))}
          </>
        )}
      </div>

      {/* 邀请/说明卡（ClawsGo home.html .invite 复刻：白卡 + hairline + 图标盒
          + 两行灰字）。无真实邀请后端 → 纯信息卡、不放假按钮，缺口见 GAP.md。 */}
      <div className="neo-invite" data-testid="neo-invite-card">
        <span className="neo-invite-icon" aria-hidden>
          <UserPlus size={16} strokeWidth={1.75} />
        </span>
        <span className="neo-invite-text">
          <span className="neo-invite-t1">
            {t('neo.inviteTitle', { defaultValue: language === 'zh' ? 'ShadowFlow 本地版' : 'ShadowFlow Local' })}
          </span>
          <span className="neo-invite-t2">
            {t('neo.inviteDesc', {
              defaultValue:
                language === 'zh'
                  ? '数据保存在本机 · 邀请协作者即将上线'
                  : 'Data stays on this device · collaborator invites coming soon',
            })}
          </span>
        </span>
      </div>

      <div className="neo-usercard">
        <span className="neo-user-initial" aria-hidden>
          {(userName || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="neo-user-meta">
          <span className="neo-user-name">{userName}</span>
          {user?.type && <span className="neo-user-type">{user.type}</span>}
        </span>
        <Link
          to="/loop-engine"
          className="neo-icon-btn"
          aria-label={t('shell.loopEngine')}
          title={t('shell.loopEngine')}
        >
          <Repeat size={15} strokeWidth={1.75} aria-hidden />
        </Link>
        <Link
          to="/settings"
          className="neo-icon-btn"
          aria-label={t('common.settings')}
          title={t('common.settings')}
        >
          <Settings size={15} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </nav>
  );
}

export default NeoRail;
