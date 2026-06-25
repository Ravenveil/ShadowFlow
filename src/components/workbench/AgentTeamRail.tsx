/**
 * AgentTeamRail — Studio 左栏：pick an Agent / switch to a team。
 *
 * OWNER: shell-left。round 2 落地真实数据 + 交互 + clawsgo 切换手感。
 *
 * 设计意图（hermes-desktop Layout.tsx sidebar + ProfileSwitcher / clawsgo 切换手感）：
 *   - 顶部 Workspace 选择器（切工作区 = 换 agents/teams 数据源，与现有 WorkspaceSelector 同源 store）。
 *   - Agent/Team 模式 segmented，带「滑动 thumb」动画（clawsgo 切换手感）。
 *   - Agent 模式：列出当前 workspace 的 agents；点选 = admin 选中（高亮，不开聊）；
 *     悬浮出现「Chat with」=开始与该 agent 对话（onSelectAgent，hermes 的两态语义）。
 *   - Team 模式：列出 teams；点选 = 切到团队协作对话（onSelectTeam）。
 *   - 选中态左侧滑动指示条（sf 动效）；列表切换走 sf-anim-scale-in。
 *   - 列表底部「新建对话」action + 内联 EXPANDABLE 最近会话（可折叠、localStorage 持久化）。
 *
 * 复用：
 *   - src/api/agents.ts  → listAgents(workspaceId), AgentRecord
 *   - src/api/teams.ts   → listTeams(workspaceId), TeamRecord
 *   - src/store/workspaceStore → workspaces / currentId / switchTo（与现有 WorkspaceSelector 同源）
 *   - src/index.css sf-* → sf-anim-fade/scale-in, sf-hoverable, sf-press, sf-focus-ring, sf-empty, sf-scroll
 */
import { useEffect, useState } from 'react';
import { Bot, Users, MessageSquarePlus, ChevronRight, History, Layers } from 'lucide-react';
import { listAgents, type AgentRecord } from '../../api/agents';
import { listTeams, type TeamRecord } from '../../api/teams';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { paletteFor, paletteFromColor, initialOf } from '../chat-fb/agentAvatar';

export type RailMode = 'agents' | 'teams';

/** 一条最近会话记录（持久化在 localStorage，跨刷新保留）。 */
interface RecentSession {
  kind: 'agent' | 'team';
  id: string;
  name: string;
  color?: string | null;
  /** epoch ms — 最近使用时间，用于排序。 */
  ts: number;
}

const LS_RECENT = 'sf.studio.rail.recent';
const LS_RECENT_EXPANDED = 'sf.studio.rail.recentExpanded';
const RECENT_MAX = 8;

function readRecent(): RecentSession[] {
  try {
    const raw = localStorage.getItem(LS_RECENT);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string');
  } catch {
    return [];
  }
}
function writeRecent(list: RecentSession[]) {
  try {
    localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* private mode / quota — 记忆是增强非必需 */
  }
}
function readBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v == null ? dflt : v === '1';
  } catch {
    return dflt;
  }
}

export interface AgentTeamRailProps {
  /** 当前 workspace；用于过滤 agents/teams。null = ShadowFlow 根（不拉数据）。 */
  workspaceId?: string | null;
  /** 当前选中的 agent_id（受控高亮）。 */
  selectedAgentId?: string | null;
  /** 当前选中的 team_id（受控高亮）。 */
  selectedTeamId?: string | null;
  /** 选中一个 agent（开始与该 agent 对话）。 */
  onSelectAgent?: (agent: AgentRecord) => void;
  /** 选中一个 team（切到团队协作对话）。 */
  onSelectTeam?: (team: TeamRecord) => void;
  /** 初始模式（默认 agents）。 */
  initialMode?: RailMode;
}

export function AgentTeamRail({
  workspaceId,
  selectedAgentId,
  selectedTeamId,
  onSelectAgent,
  onSelectTeam,
  initialMode = 'agents',
}: AgentTeamRailProps) {
  const [mode, setMode] = useState<RailMode>(initialMode);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    setSearch('');
  }, [mode]);

  // ── workspace 选择器：与现有 WorkspaceSelector 同源（切 workspace = 换数据源）──
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentId = useWorkspaceStore((s) => s.currentId);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  // 拉一次 workspace 列表（store 自带 currentId 校正）。
  useEffect(() => {
    if (workspaces.length === 0) void fetchWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 受控 workspaceId 优先；否则跟随 store.currentId。
  const effectiveWid = workspaceId !== undefined ? workspaceId : currentId;

  // ── 最近会话（持久化 + 可折叠）──────────────────────────────────────────
  const [recent, setRecent] = useState<RecentSession[]>(() => readRecent());
  const [recentExpanded, setRecentExpanded] = useState<boolean>(() =>
    readBool(LS_RECENT_EXPANDED, true),
  );
  const toggleRecent = () =>
    setRecentExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_RECENT_EXPANDED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  const pushRecent = (r: Omit<RecentSession, 'ts'>) => {
    setRecent((prev) => {
      const next = [
        { ...r, ts: Date.now() },
        ...prev.filter((p) => !(p.kind === r.kind && p.id === r.id)),
      ].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const wid = effectiveWid ?? undefined;
    Promise.allSettled([listAgents(wid), listTeams(wid)])
      .then(([a, t]) => {
        if (!alive) return;
        if (a.status === 'fulfilled') setAgents(a.value);
        if (t.status === 'fulfilled') setTeams(t.value);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [effectiveWid]);

  const items = mode === 'agents' ? agents : teams;
  const filteredItems = search.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;
  const filteredAgents = filteredItems as AgentRecord[];
  const filteredTeams = filteredItems as TeamRecord[];
  // 在线 agent 计数（status==='running'）→ segmented Agents tab 旁的小徽标。
  const runningCount = agents.filter((a) => a.status === 'running').length;

  // ── 选中行为 ──────────────────────────────────────────────────────────
  const chatWithAgent = (a: AgentRecord) => {
    onSelectAgent?.(a);
    pushRecent({ kind: 'agent', id: a.agent_id, name: a.name, color: a.avatar_color ?? null });
  };
  const chatWithTeam = (tm: TeamRecord) => {
    onSelectTeam?.(tm);
    pushRecent({ kind: 'team', id: tm.team_id, name: tm.name });
  };
  /** 「新建对话」：保持当前对象、由中栏开新会话。无对象时不阻塞（中栏会引导）。 */
  const newChat = () => {
    if (mode === 'agents') {
      const cur = agents.find((a) => a.agent_id === selectedAgentId) ?? agents[0];
      if (cur) chatWithAgent(cur);
    } else {
      const cur = teams.find((t) => t.team_id === selectedTeamId) ?? teams[0];
      if (cur) chatWithTeam(cur);
    }
  };
  /** 点最近一条 → 复用为当前对象（按 kind 反查真实 record；查不到则用记录里的名字直发）。 */
  const openRecent = (r: RecentSession) => {
    if (r.kind === 'agent') {
      const a = agents.find((x) => x.agent_id === r.id);
      if (a) return chatWithAgent(a);
      setMode('agents');
      onSelectAgent?.({
        agent_id: r.id,
        name: r.name,
        avatar_color: r.color ?? null,
      } as AgentRecord);
    } else {
      const tm = teams.find((x) => x.team_id === r.id);
      if (tm) return chatWithTeam(tm);
      setMode('teams');
      onSelectTeam?.({ team_id: r.id, name: r.name, agent_ids: [] } as unknown as TeamRecord);
    }
    pushRecent({ kind: r.kind, id: r.id, name: r.name, color: r.color });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Workspace 选择器（切工作区 = 换 agents/teams 数据源）── */}
      <div style={{ padding: '8px 8px 0' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 8,
            border: '1px solid var(--t-border)',
            background: 'var(--t-panel-2)',
          }}
        >
          <Layers size={13} strokeWidth={2} style={{ color: 'var(--t-fg-4)', flexShrink: 0 }} />
          <select
            value={effectiveWid ?? ''}
            onChange={(e) => switchTo(e.target.value || null)}
            className="sf-focus-ring"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--t-fg-2)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title="切换工作区"
          >
            <option value="">ShadowFlow（全部）</option>
            {workspaces.map((w) => (
              <option key={w.workspace_id} value={w.workspace_id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── segmented mode switch（滑动 thumb，clawsgo 切换手感）── */}
      <div style={{ padding: 8 }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            padding: 3,
            borderRadius: 9,
            border: '1px solid var(--t-border)',
            background: 'var(--t-panel-2)',
          }}
        >
          {/* 滑动 thumb：translateX 在 0% / 100% 之间过渡 */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 3,
              left: 3,
              width: 'calc(50% - 3px)',
              height: 'calc(100% - 6px)',
              borderRadius: 7,
              background: 'color-mix(in oklab, var(--t-accent) 14%, var(--t-panel))',
              border: '1px solid color-mix(in oklab, var(--t-accent) 45%, transparent)',
              transform: mode === 'teams' ? 'translateX(100%)' : 'translateX(0)',
              transition:
                'transform var(--sf-dur-base, 200ms) var(--sf-ease-spring, cubic-bezier(.2,.8,.2,1))',
              zIndex: 0,
            }}
          />
          {(['agents', 'teams'] as RailMode[]).map((m) => {
            const on = mode === m;
            const Icon = m === 'agents' ? Bot : Users;
            const count = m === 'agents' ? agents.length : teams.length;
            return (
              <button
                key={m}
                type="button"
                className="sf-press sf-focus-ring"
                onClick={() => setMode(m)}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '6px 8px',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  color: on ? 'var(--t-accent)' : 'var(--t-fg-3)',
                  transition: 'color var(--sf-dur-fast, 120ms) var(--sf-ease)',
                }}
              >
                <Icon size={13} strokeWidth={2} />
                {m === 'agents' ? 'Agents' : 'Teams'}
                {count > 0 && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9.5,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: '2px 5px',
                      borderRadius: 999,
                      color: on ? 'var(--t-accent)' : 'var(--t-fg-4)',
                      background: on
                        ? 'color-mix(in oklab, var(--t-accent) 18%, transparent)'
                        : 'var(--t-panel)',
                      transition: 'color var(--sf-dur-fast, 120ms) var(--sf-ease)',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* 在线汇总：直接由真实 agent.status 驱动（运行中 = 脉冲绿点）。 */}
        {mode === 'agents' && runningCount > 0 && (
          <div
            className="sf-anim-fade"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 4px 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--t-fg-4)',
            }}
          >
            <span
              aria-hidden
              className="sf-anim-pulse"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--status-ok, #10B981)',
                flexShrink: 0,
              }}
            />
            <span>{runningCount} 个 agent 运行中</span>
          </div>
        )}
      </div>

      {/* ── 搜索过滤输入（仅当列表 >= 3 条时显示，避免小列表杂乱）── */}
      {items.length >= 3 && (
        <div style={{ padding: '0 8px 6px' }}>
          <input
            type="search"
            placeholder={mode === 'agents' ? 'Filter agents...' : 'Filter teams...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sf-focus-ring"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '5px 8px',
              borderRadius: 7,
              border: '1px solid var(--t-border)',
              background: 'var(--t-panel-2)',
              color: 'var(--t-fg-1)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* ── 列表（mode 切换走 scale-in；key=mode 让动画重放）── */}
      <div
        key={mode}
        className="sf-anim-scale-in sf-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 4px' }}
      >
        {loading && filteredItems.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: 12,
              color: 'var(--t-fg-4)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            加载中…
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              {mode === 'agents' ? <Bot size={22} /> : <Users size={22} />}
            </span>
            <div className="sf-empty-title">{mode === 'agents' ? '还没有 Agent' : '还没有团队'}</div>
            <p className="sf-empty-sub">
              {mode === 'agents' ? (
                <>去 <a href="/start" style={{ color: 'var(--t-accent)' }}>+ /start</a> 招募一个 agent</>
              ) : (
                <>去 <a href="/teams" style={{ color: 'var(--t-accent)' }}>+ /teams</a> 组建一个团队</>
              )}
            </p>
          </div>
        ) : mode === 'agents' ? (
          filteredAgents.map((a) => {
            const on = a.agent_id === selectedAgentId;
            return (
              <AgentRow
                key={a.agent_id}
                agent={a}
                on={on}
                onChatWith={() => chatWithAgent(a)}
              />
            );
          })
        ) : (
          filteredTeams.map((tm) => {
            const on = tm.team_id === selectedTeamId;
            return (
              <TeamRow key={tm.team_id} team={tm} on={on} onChatWith={() => chatWithTeam(tm)} />
            );
          })
        )}
      </div>

      {/* ── 新建对话 action ── */}
      <div style={{ padding: '6px 8px', borderTop: '1px solid var(--t-border)' }}>
        <button
          type="button"
          className="sf-press sf-focus-ring"
          onClick={newChat}
          disabled={items.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: items.length === 0 ? 'not-allowed' : 'pointer',
            opacity: items.length === 0 ? 0.5 : 1,
            border: '1px solid color-mix(in oklab, var(--t-accent) 45%, transparent)',
            background: 'color-mix(in oklab, var(--t-accent) 12%, var(--t-panel))',
            color: 'var(--t-accent)',
          }}
        >
          <MessageSquarePlus size={14} strokeWidth={2.2} />
          新建对话
        </button>
      </div>

      {/* ── 内联 EXPANDABLE 最近会话（可折叠 + localStorage 持久化）── */}
      <div style={{ borderTop: '1px solid var(--t-border)', flexShrink: 0 }}>
        <button
          type="button"
          className="sf-press"
          onClick={toggleRecent}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t-fg-3)',
          }}
          aria-expanded={recentExpanded}
        >
          <ChevronRight
            size={13}
            strokeWidth={2.4}
            style={{
              transform: recentExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform var(--sf-dur-fast, 140ms) var(--sf-ease)',
            }}
          />
          <History size={12} strokeWidth={2} />
          <span
            style={{
              flex: 1,
              textAlign: 'left',
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            最近会话
          </span>
          {recent.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--t-fg-4)',
                background: 'var(--t-panel-2)',
                borderRadius: 6,
                padding: '1px 6px',
              }}
            >
              {recent.length}
            </span>
          )}
        </button>

        {recentExpanded && (
          <div
            className="sf-anim-fade sf-scroll"
            style={{ maxHeight: 200, overflowY: 'auto', padding: '0 8px 8px' }}
          >
            {recent.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '4px 8px 8px',
                  fontSize: 11,
                  color: 'var(--t-fg-4)',
                }}
              >
                选一个 Agent 或 Team 开始对话，会出现在这里。
              </p>
            ) : (
              recent.map((r) => {
                const on =
                  (r.kind === 'agent' && r.id === selectedAgentId) ||
                  (r.kind === 'team' && r.id === selectedTeamId);
                const color = r.color || 'var(--t-accent)';
                return (
                  <button
                    key={`${r.kind}:${r.id}`}
                    type="button"
                    className="sf-hoverable"
                    onClick={() => openRecent(r)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '6px 8px',
                      marginBottom: 2,
                      borderRadius: 7,
                      cursor: 'pointer',
                      border: on
                        ? `1px solid color-mix(in oklab, ${color} 40%, transparent)`
                        : '1px solid transparent',
                      background: on
                        ? `color-mix(in oklab, ${color} 10%, var(--t-panel))`
                        : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 10,
                        background: `color-mix(in oklab, ${color} 18%, var(--t-panel-2))`,
                        color,
                      }}
                    >
                      {r.kind === 'team' ? (
                        <Users size={11} strokeWidth={2.2} />
                      ) : (
                        initialOf(r.name)
                      )}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: 600,
                        color: on ? 'var(--t-fg)' : 'var(--t-fg-2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 行组件：sliding 选中指示条 + hover「Chat with」CTA ───────────────────────

function AgentRow({
  agent,
  on,
  onChatWith,
}: {
  agent: AgentRecord;
  on: boolean;
  onChatWith: () => void;
}) {
  const [hover, setHover] = useState(false);
  // 头像配色：与全 app 统一（后端 avatar_color → paletteFromColor；否则按名字 hash）。
  const pal = agent.avatar_color ? paletteFromColor(agent.avatar_color) : paletteFor(agent.name);
  const color = pal.accent;
  const st = statusMeta(agent.status);
  return (
    <div
      role="button"
      tabIndex={0}
      className="sf-focus-ring"
      aria-pressed={on}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onChatWith}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChatWith();
        }
      }}
      style={{ ...rowWrapStyle(on, color), cursor: 'pointer' }}
    >
      <SelectIndicator on={on} color={color} />
      <span style={{ position: 'relative', flexShrink: 0 }}>
        <span style={avatarStyle(pal)}>{initialOf(agent.name)}</span>
        {/* 状态点：覆在头像右下角（在线=脉冲绿，其余=对应色）。 */}
        <span
          aria-hidden
          className={agent.status === 'running' ? 'sf-anim-pulse' : undefined}
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: st.color,
            border: '2px solid var(--t-panel)',
            boxSizing: 'content-box',
          }}
        />
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={nameStyle(on)}>{agent.name}</span>
        <span style={{ ...subStyle, color: st.color }}>{st.label}</span>
      </span>
      <ChatWithCta show={hover || on} onClick={onChatWith} />
    </div>
  );
}

/** agent.status → 状态点颜色 + 中文标签（与全 app 状态语义对齐）。 */
function statusMeta(status: AgentRecord['status']): { color: string; label: string } {
  switch (status) {
    case 'running':
      return { color: 'var(--status-ok, #10B981)', label: '运行中' };
    case 'paused':
      return { color: 'var(--status-warn, #F59E0B)', label: '已暂停' };
    case 'error':
      return { color: 'var(--status-reject, #EF4444)', label: '错误' };
    case 'idle':
    default:
      return { color: 'var(--t-fg-4)', label: '空闲' };
  }
}

function TeamRow({
  team,
  on,
  onChatWith,
}: {
  team: TeamRecord;
  on: boolean;
  onChatWith: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = 'var(--t-accent)';
  const teamPal = {
    accent: color,
    bg: 'color-mix(in oklab, var(--t-accent) 20%, var(--t-panel-2))',
    border: 'color-mix(in oklab, var(--t-accent) 45%, transparent)',
    fg: color,
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className="sf-focus-ring"
      aria-pressed={on}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onChatWith}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChatWith();
        }
      }}
      style={{ ...rowWrapStyle(on, color), cursor: 'pointer' }}
    >
      <SelectIndicator on={on} color={color} />
      <span style={avatarStyle(teamPal)}>
        <Users size={14} strokeWidth={2} />
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={nameStyle(on)}>{team.name}</span>
        <span style={subStyle}>{team.agent_ids?.length ?? 0} agents</span>
      </span>
      <ChatWithCta show={hover || on} onClick={onChatWith} />
    </div>
  );
}

/** 选中态左侧滑动指示条（scaleY 0→1，clawsgo 选中手感）。 */
function SelectIndicator({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 6,
        bottom: 6,
        width: 3,
        borderRadius: 3,
        background: color,
        transformOrigin: 'center',
        transform: on ? 'scaleY(1)' : 'scaleY(0)',
        opacity: on ? 1 : 0,
        transition:
          'transform var(--sf-dur-base, 200ms) var(--sf-ease-spring), opacity var(--sf-dur-fast, 140ms) var(--sf-ease)',
      }}
    />
  );
}

/** hover/选中时出现的「Chat with」CTA（hermes 两态语义里的「开始对话」）。 */
function ChatWithCta({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="sf-press sf-focus-ring"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="开始对话"
      aria-label="开始对话"
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 7px',
        borderRadius: 6,
        fontSize: 10.5,
        fontWeight: 700,
        cursor: 'pointer',
        border: '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)',
        background: 'color-mix(in oklab, var(--t-accent) 14%, var(--t-panel))',
        color: 'var(--t-accent)',
        opacity: show ? 1 : 0,
        transform: show ? 'translateX(0)' : 'translateX(4px)',
        pointerEvents: show ? 'auto' : 'none',
        transition:
          'opacity var(--sf-dur-fast, 140ms) var(--sf-ease), transform var(--sf-dur-fast, 140ms) var(--sf-ease)',
      }}
    >
      <MessageSquarePlus size={11} strokeWidth={2.2} />
      Chat
    </button>
  );
}

// ── inline style helpers ─────────────────────────────────────────────────────
function rowWrapStyle(on: boolean, color: string): React.CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '7px 8px 7px 10px',
    marginBottom: 3,
    borderRadius: 8,
    border: on
      ? `1px solid color-mix(in oklab, ${color} 45%, transparent)`
      : '1px solid transparent',
    background: on ? `color-mix(in oklab, ${color} 12%, var(--t-panel))` : 'transparent',
    transition: 'background var(--sf-dur-fast, 140ms) var(--sf-ease), border-color var(--sf-dur-fast, 140ms) var(--sf-ease)',
  };
}
function avatarStyle(pal: { bg: string; border: string; fg: string }): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 8,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    fontSize: 12,
    background: pal.bg,
    border: `1px solid ${pal.border}`,
    color: pal.fg,
  };
}
function nameStyle(on: boolean): React.CSSProperties {
  return {
    display: 'block',
    fontSize: 12.5,
    fontWeight: on ? 700 : 600,
    color: on ? 'var(--t-fg)' : 'var(--t-fg-2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}
const subStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  color: 'var(--t-fg-4)',
  marginTop: 1,
};

export default AgentTeamRail;
