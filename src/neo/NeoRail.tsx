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
 * 选中高亮 = 灰底黑字 + 左侧蓝色弹性指示条（对齐 sf-rail-nav-row 语言）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { listAgents, type AgentRecord } from '../api/agents';
import { listTeams, type TeamRecord } from '../api/teams';
import { useAuth } from '../core/auth/AuthContext';
import { useI18n } from '../common/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import {
  PersonalTeamToggle,
  type ChatHomeView,
} from '../pages/chat-home/PersonalTeamToggle';
import { AgentAvatar } from '../components/chat-fb/agentAvatar';
import type { AgentAvatarProps } from '../components/chat-fb/agentAvatar';
import type { NeoRailProps, NeoTarget } from './types';

const RAIL_COLLAPSED_KEY = 'sf.neo.railCollapsed';
const VIEW_KEY = 'sf.neo.view';

type LoadState = 'loading' | 'ready' | 'error';

function agentStatusToDot(status: AgentRecord['status']): AgentAvatarProps['status'] {
  if (status === 'running') return 'run';
  if (status === 'error') return 'err';
  if (status === 'paused') return 'warn';
  return undefined;
}

function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function NeoRail({ target, onSelect, onNewTask }: NeoRailProps) {
  const { t } = useI18n();
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

  const isOn = (kind: NeoTarget['kind'], id: string) =>
    target?.kind === kind && target.id === id;

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
                  <AgentAvatar
                    seed={a.agent_id}
                    name={a.name}
                    color={a.avatar_color ?? null}
                    size={24}
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
                  <span className="neo-team-tile">
                    <Users size={13} strokeWidth={1.9} aria-hidden />
                  </span>
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
      </div>

      <div className="neo-rail-body">
        <div className="neo-section-label">
          {view === 'personal' ? t('shell.navAgents') : t('shell.navTeams')}
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
                <AgentAvatar
                  seed={a.agent_id}
                  name={a.name}
                  color={a.avatar_color ?? null}
                  size={22}
                  status={agentStatusToDot(a.status)}
                />
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
                <span className="neo-team-tile">
                  <Users size={13} strokeWidth={1.9} aria-hidden />
                </span>
                <span className="neo-row-name">{tm.name}</span>
                <span className="neo-row-meta">{tm.agent_ids.length}</span>
              </button>
            ))}

        {view === 'personal' && recentDMs.length > 0 && (
          <>
            <div className="neo-section-label">{t('neo.sessions')}</div>
            {recentDMs.map((d) => (
              <button
                key={d.agentId}
                type="button"
                className={`neo-row${isOn('agent', d.agentId) ? ' on' : ''}`}
                onClick={() => onSelect({ kind: 'agent', id: d.agentId, name: d.agentName })}
                aria-pressed={isOn('agent', d.agentId)}
              >
                <AgentAvatar seed={d.agentId} name={d.agentName} size={22} />
                <span className="neo-row-name">{d.agentName}</span>
                {d.unreadCount > 0 && (
                  <span className="neo-row-badge">{d.unreadCount}</span>
                )}
              </button>
            ))}
          </>
        )}
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
