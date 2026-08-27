/**
 * NeoRail — Neo 左栏导航（clawsgo 形态，2026-08-19 跳转收敛后纯受控组件）。
 *
 * 展开 180px / 折叠 56px 图标 rail，宽度 240ms spring 过渡。**本组件不再持有
 * 任何导航状态**：中栏视图（nav）与列表区（section）全部由 NeoApp 下发，
 * 所有点击经唯一入口 onNavigate 上报——列表、中栏、高亮同源，不会分叉。
 *
 * 展开态结构（复刻 home.html .sidebar）：
 *   - 栏顶导航簇：←/→ 历史导航 + 折叠钮（ZCode 式）
 *   - 一级导航行：新任务(onNewTask) / 知识库 / 记忆 / 团队 / 员工 / 搜索
 *     （知识库/记忆/团队/员工 → onNavigate 对应变体；搜索按需展开过滤框）
 *   - 列表区（section 受控）：home=最近会话（GAP A3 项目分组：项目 label +
 *     新建项目行，会话按 session.group_id 归项目桶，无项目落默认「会话」组）；
 *     agents=员工+新建；teams=团队+群聊现场（群聊同按项目分桶）；
 *     knowledge=知识分包；memory=记忆条目
 *   - 底部账户行（useAuth）+ 设置齿轮（/settings）
 *
 * 会话入口统一走 find-or-create resolve（与 DM resolve 同款模式）：
 *   - 员工/会话行 → resolveDmConversation → conversation（失败兜底 agent-target）
 *   - 团队行 → resolveTeamGroup → conversation（失败兜底 team-target）
 * 列表行 = 纯文字 + 细线图标（15px --t-fg-3），选中 = 灰底 600 加粗（对齐
 * ClawsGo home.html .nav-row / .group-label 复刻；无彩色 tile、无指示条）。
 *
 * 管理面闭环（2026-08-23）：员工行 hover 出删除，群/DM 行 hover 出移入项目
 * + 重命名 + 删除，项目 label hover 出重命名 + 删除——全部真实 API，删除
 * 二次确认（window.confirm），失败红条（neo-manage-error），删当前打开的
 * 会话/员工后跳回 home 安全页。移入项目（GAP A3 回写）按互链 group_id
 * PATCH /api/conversations/by-group/:gid，浮层内「默认项目」= project_id 置空。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Folder,
  FolderInput,
  History,
  Library,
  MessageSquare,
  PanelLeft,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  SquarePen,
  Trash2,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';
import { deleteAgent, listAgents, type AgentRecord } from '../api/agents';
import { listTeams, type TeamRecord } from '../api/teams';
import {
  deleteGroup,
  patchGroup,
  resolveDmConversation,
  resolveTeamGroup,
} from '../api/groupApi';
import {
  createProject,
  deleteProject,
  listProjectsWithSessions,
  patchProject,
  type ProjectWithSessions,
} from '../api/projects';
import { moveGroupConversationToProject } from '../api/conversations';
import type { AgentDMItem, GroupItem } from '../common/types/inbox';
import { listPacks } from '../api/knowledge';
import type { KnowledgePack } from '../common/types/knowledge';
import { listVaults } from '../api/knowledgeVaults';
import type { KnowledgeVault } from '../common/types/knowledgeVault';
import { listMemoryEntries, type MemoryEntry } from '../api/memoryEntries';
import { useAuth } from '../core/auth/AuthContext';
import { useI18n } from '../common/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import { useCommandK } from '../core/hooks/useCommandK';
import type { NeoRailProps } from './types';
import { NeoCreateAgentModal } from './NeoCreateAgentModal';
import { NeoCreateGroupModal } from './NeoCreateGroupModal';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * A4 rail 行相对时间（ClawsGo a_019「1m」形态）：
 * 刚刚 / N 分钟前 / N 小时前 / 昨天 / M-D。
 * lastActivityAt 缺失或不可解析 → null（该行不渲染时间，不造数据）。
 */
function relativeTime(
  iso: string | undefined,
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  const diff = now - ts;
  if (diff < 60_000) return t('neo.time.justNow', { defaultValue: '刚刚' });
  const m = Math.floor(diff / 60_000);
  if (m < 60) return t('neo.time.minutesAgo', { defaultValue: `${m} 分钟前`, count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('neo.time.hoursAgo', { defaultValue: `${h} 小时前`, count: h });
  const d = new Date(ts);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return t('neo.time.yesterday', { defaultValue: '昨天' });
  }
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

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

export function NeoRail({
  nav,
  section,
  onNavigate,
  onNewTask,
  collapsed,
  onToggleCollapsed,
}: NeoRailProps) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const workspaceId = useWorkspaceStore((s) => s.currentId);

  // ── 历史导航（ZCode 式 ←/→，簇挂在栏顶）──────────────────────────────────
  // react-router 在 history.state.idx 记录当前历史位置：后退 = idx > 0；
  // 前进无原生 API，用 ref 记本会话见过的峰值 idx，idx < 峰值即可前进。
  const navigateHistory = useNavigate();
  const maxIdxRef = useRef(-1);
  const histIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (histIdx > maxIdxRef.current) maxIdxRef.current = histIdx;
  const canBack = histIdx > 0;
  const canForward = histIdx < maxIdxRef.current;

  const [query, setQuery] = useState('');
  // 「搜索」导航行按需展开过滤输入框（复刻页侧栏无常驻输入框，默认收起）
  const [searchOpen, setSearchOpen] = useState(false);
  // 加载失败后的手动重试触发器（+1 重新跑列表 effect）
  const [reloadTick, setReloadTick] = useState(0);
  // A14/B27 新建 Agent 模态开关
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  // 2026-08-22 第二轮 — Agent 创建成功后的「去对话试试」轻提示（auto-dismiss）。
  // 只在调用方/成功回调侧加引导，NeoCreateAgentModal 本体归另一代理。
  const [agentCreatedToast, setAgentCreatedToast] = useState<string | null>(null);
  // GAP D 新建群聊模态开关
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  // GAP A3（2026-08-22）项目分组：项目+会话（GET /api/projects?withSessions=1），
  // home/teams 分区拉取；「新建项目」为内联输入行（+ 图标行展开，Enter 提交）。
  const [projects, setProjects] = useState<ProjectWithSessions[] | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectError, setProjectError] = useState<string | null>(null);
  // A4 相对时间戳每分钟自愈（页面隐藏时暂停计时，对齐轮播/探活策略）
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setNowTick(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  // 列表区切换 → 清掉上一分区的过滤词（搜索框保留展开态）
  useEffect(() => {
    setQuery('');
  }, [section]);

  // Agent 创建成功 toast 自动消失（2.6s，与 composer toast 同款节奏）。
  useEffect(() => {
    if (!agentCreatedToast) return;
    const id = setTimeout(() => setAgentCreatedToast(null), 2600);
    return () => clearTimeout(id);
  }, [agentCreatedToast]);

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsState, setAgentsState] = useState<LoadState>('loading');
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsState, setTeamsState] = useState<LoadState>('loading');
  // 知识源（统一:本地仓库 + 知识分包）/ 记忆条目（左栏分区列表;进入对应分区才拉取）
  const [packs, setPacks] = useState<KnowledgePack[] | null>(null);
  const [vaults, setVaults] = useState<KnowledgeVault[] | null>(null);
  const [packsState, setPacksState] = useState<LoadState>('loading');
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[] | null>(null);
  const [memoryState, setMemoryState] = useState<LoadState>('loading');

  // 会话条目（最近单聊，数据源同 PersonalChatView）；Python 宕机时 store 降级
  // 为空数组，渲染干净空态即可。
  const agentDMs = useInboxStore((s) => s.agentDMs) ?? [];
  // 群列表（Polynoia 对标 2026-08-15）— 团队的干活现场（群聊网关按
  // group.team_id 触发团队 DAG），点击中栏内嵌打开。
  const groups = useInboxStore((s) => s.groups) ?? [];

  const toggleCollapsed = onToggleCollapsed;

  // 员工列表常驻加载（折叠态头像条 + home 会话兜底都用它），不再按视图门控。
  useEffect(() => {
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
  }, [workspaceId, reloadTick]);

  // 团队列表进入 teams 分区才拉取
  useEffect(() => {
    if (section !== 'teams') return;
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
  }, [section, workspaceId, reloadTick]);

  // 项目分组（GAP A3）：home/teams 分区拉取项目+会话；失败降级 null（全落默认组，
  // 不影响既有列表渲染）。
  useEffect(() => {
    if (section !== 'home' && section !== 'teams') return;
    let alive = true;
    listProjectsWithSessions()
      .then((rows) => {
        if (alive) setProjects(rows);
      })
      .catch(() => {
        if (alive) setProjects(null);
      });
    return () => {
      alive = false;
    };
  }, [section, reloadTick]);

  // 统一知识源（2026-08-19 知识库合并批）:进入 knowledge 分区同时拉
  // Python 侧知识包 + Node 侧本地仓库;行点击带 sourceId 深链预选中栏。
  useEffect(() => {
    if (section !== 'knowledge') return;
    let alive = true;
    setPacksState('loading');
    Promise.all([
      listPacks({ limit: 50 }).catch(() => ({ data: { packs: [] as KnowledgePack[] } })),
      listVaults().catch(() => ({ data: { vaults: [] as KnowledgeVault[] } })),
    ])
      .then(([packRes, vaultRes]) => {
        if (!alive) return;
        setPacks(packRes.data.packs);
        setVaults(vaultRes.data.vaults);
        setPacksState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setPacks([]);
        setVaults([]);
        setPacksState('error');
      });
    return () => {
      alive = false;
    };
  }, [section, reloadTick]);

  // 记忆条目（进入 memory 分区拉取；Node 侧 /api/memory-entries）
  useEffect(() => {
    if (section !== 'memory') return;
    let alive = true;
    setMemoryState('loading');
    listMemoryEntries()
      .then((rows) => {
        if (!alive) return;
        setMemoryEntries(rows);
        setMemoryState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setMemoryEntries([]);
        setMemoryState('error');
      });
    return () => {
      alive = false;
    };
  }, [section, reloadTick]);

  useEffect(() => {
    void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
  }, [workspaceId]);

  const q = query.trim().toLowerCase();
  // 防御：后端 inbox/agent 数据里 name 可能为 null（如 agent 已删但会话残留），
  // 搜索过滤一律 (x ?? '') 兜底，避免整条 rail 崩进 ErrorBoundary。
  const filteredAgents = useMemo(
    () => (q ? agents.filter((a) => (a.name ?? '').toLowerCase().includes(q)) : agents),
    [agents, q],
  );
  const filteredTeams = useMemo(
    () => (q ? teams.filter((tm) => (tm.name ?? '').toLowerCase().includes(q)) : teams),
    [teams, q],
  );
  const recentDMs = useMemo(
    () =>
      [...agentDMs]
        .sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
        .filter((d) => (q ? (d.agentName ?? '').toLowerCase().includes(q) : true))
        .slice(0, 8),
    [agentDMs, q],
  );
  const recentGroups = useMemo(
    () =>
      [...groups]
        .sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
        .filter((g) => (q ? (g.name ?? '').toLowerCase().includes(q) : true))
        .slice(0, 6),
    [groups, q],
  );

  // GAP A3 项目分组归组：session.group_id（conversations 表）↔ inbox 条目的
  // group_id（DM）/ id（群）。无匹配 → 默认组（保持既有平铺展示）。
  const projectByGroupId = useMemo(() => {
    const m = new Map<string, ProjectWithSessions>();
    for (const p of projects ?? [])
      for (const s of p.sessions) if (s.group_id) m.set(s.group_id, p);
    return m;
  }, [projects]);

  /** 把 inbox 条目按项目分桶：grouped 按项目列表顺序，unassigned 落默认组。 */
  const bucketByProject = useCallback(
    <T extends AgentDMItem | GroupItem>(rows: T[], keyOf: (r: T) => string | null | undefined) => {
      const byId = new Map<string, T[]>();
      const unassigned: T[] = [];
      for (const r of rows) {
        const p = projectByGroupId.get(keyOf(r) ?? '');
        if (p) {
          const arr = byId.get(p.project_id) ?? [];
          arr.push(r);
          byId.set(p.project_id, arr);
        } else {
          unassigned.push(r);
        }
      }
      const grouped = (projects ?? [])
        .filter((p) => byId.has(p.project_id))
        .map((p) => ({ project: p, rows: byId.get(p.project_id)! }));
      return { grouped, unassigned };
    },
    [projectByGroupId, projects],
  );

  const dmBuckets = useMemo(
    () => bucketByProject(recentDMs, (d) => d.group_id),
    [bucketByProject, recentDMs],
  );
  const groupBuckets = useMemo(
    () => bucketByProject(recentGroups, (g) => g.id),
    [bucketByProject, recentGroups],
  );

  // 选中高亮从 nav 派生（与中栏同源）：会话行比 groupId；员工/团队兜底目标态
  // 比 agentId/teamId——conversation 打开时对应列表行不抢高亮（列表保持浏览态）。
  const isConversation = (groupId: string | null | undefined) =>
    !!groupId && nav.view === 'conversation' && nav.groupId === groupId;
  const isAgentOn = (agentId: string) =>
    (nav.view === 'agent-target' && nav.agentId === agentId) ||
    (nav.view === 'agent-soul' && nav.agentId === agentId);
  const isTeamOn = (teamId: string) =>
    nav.view === 'team-target' && nav.teamId === teamId;
  // 知识源行高亮:nav.sourceId 深链命中才亮(无 sourceId = 浏览态,不抢高亮)
  const isSourceOn = (sid: string) =>
    nav.view === 'knowledge' && nav.sourceId === sid;

  // 「新任务」行 kbd 提示（Kimi tmp5D2B）对应的真实绑定：复用全局 useCommandK，
  // Ctrl/⌘+K = 回到新任务 composer（NeoApp.handleNewTask）。Neo 路由不挂
  // HfLayout，QuickSwitcher 的 ⌘K 不在此作用域，无冲突。
  useCommandK({ onOpen: onNewTask });

  const userName =
    user?.display_name || (user?.address ? shortAddress(user.address) : t('neo.anonymous'));
  // 用户行第二行（复刻 .user-mail 位）：钱包地址缩写，缺失回落账号类型
  const userMail = user?.address ? shortAddress(user.address) : user?.type || null;

  // ── 会话入口（find-or-create，全部走 onNavigate）──────────────────────────

  // 员工/会话/折叠头像点击 = 中栏打开该 agent 的单聊；resolve 失败（后端不可
  // 用等）兜底 agent-target（中栏 composer 面向该 agent）。
  const openAgentDm = useCallback(
    (agentId: string, name: string) => {
      resolveDmConversation(agentId, workspaceId ?? undefined)
        .then((gid) => {
          if (gid) onNavigate({ view: 'conversation', groupId: gid });
          else onNavigate({ view: 'agent-target', agentId, name });
        })
        .catch(() => onNavigate({ view: 'agent-target', agentId, name }));
    },
    [onNavigate, workspaceId],
  );

  // 团队行点击 = 中栏打开该团队的群聊现场（后端按 group.team_id 跑团队 DAG，
  // 团队的干活现场就是它的群）；无群则建一条挂在团队下的群。失败兜底
  // team-target（中栏 composer 面向该 team，右栏编队 tab）。
  const openTeamChat = useCallback(
    (tm: TeamRecord) => {
      resolveTeamGroup(tm, workspaceId ?? undefined)
        .then((gid) => {
          if (gid) {
            onNavigate({ view: 'conversation', groupId: gid });
            // 首次建群后刷新 inbox，群聊现场列表即时出新群（Python 未起时静默）
            void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
          } else {
            onNavigate({ view: 'team-target', teamId: tm.team_id, name: tm.name });
          }
        })
        .catch(() => onNavigate({ view: 'team-target', teamId: tm.team_id, name: tm.name }));
    },
    [onNavigate, workspaceId],
  );

  // GAP A3 新建项目（内联输入行 Enter 提交）：成功 → 收起输入 + 重新拉项目分组；
  // 失败留输入行并显示错误条（不吞错）。
  const submitNewProject = useCallback(() => {
    const name = projectName.trim();
    if (!name) return;
    createProject(name)
      .then(() => {
        setCreateProjectOpen(false);
        setProjectName('');
        setProjectError(null);
        setReloadTick((n) => n + 1);
      })
      .catch(() =>
        setProjectError(
          t('neo.project.createError', {
            defaultValue: language === 'zh' ? '创建项目失败' : 'Failed to create project',
          }),
        ),
      );
  }, [projectName, t, language]);

  // ── 管理面闭环（2026-08-23）：行级 hover 操作（暂停/恢复/重命名/删除）─────
  // 全部真实调 API；删除一律 window.confirm 二次确认；失败进 manageError 红条
  // （不吞错、不假成功）；成功后刷新本地 store/列表。删当前打开的会话/员工 →
  // 跳回 home 安全页，避免中栏停留在已删除对象上。
  const [manageError, setManageError] = useState<string | null>(null);
  // GAP A3 回写（2026-08-23）「移入项目」：当前打开项目浮层的行（group_id）。
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);

  const failManage = useCallback(() => {
    setManageError(
      t('neo.manage.opFailed', {
        defaultValue: language === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry',
      }),
    );
  }, [t, language]);

  // 员工：删除（二次确认）；删的若是当前打开的员工（target/灵魂页）→ 回 home。
  const removeAgent = useCallback(
    (a: AgentRecord) => {
      if (
        !window.confirm(
          t('neo.manage.deleteAgentConfirm', {
            defaultValue:
              language === 'zh'
                ? `确定删除员工「${a.name}」？此操作不可撤销`
                : `Delete agent "${a.name}"? This cannot be undone`,
          }),
        )
      )
        return;
      setManageError(null);
      deleteAgent(a.agent_id)
        .then(() => {
          if (
            (nav.view === 'agent-target' || nav.view === 'agent-soul') &&
            nav.agentId === a.agent_id
          ) {
            onNavigate({ view: 'home' });
          }
          setReloadTick((n) => n + 1);
        })
        .catch(failManage);
    },
    [nav, onNavigate, failManage, t, language],
  );

  // 群/DM：重命名（patchGroup 真实改名）。DM 行显示名来自 inbox 的 agentName，
  // 同步 renameAgentDM 即时反映；fetchWorkspaceInbox 已填充时会 skip 重拉，
  // 所以这里直接写本地 store，不做无效重拉。
  const renameConversation = useCallback(
    (groupId: string, currentName: string, dmAgentId?: string) => {
      const name = window
        .prompt(
          t('neo.manage.renamePrompt', {
            defaultValue: language === 'zh' ? '新名称' : 'New name',
          }),
          currentName,
        )
        ?.trim();
      if (!name || name === currentName) return;
      setManageError(null);
      patchGroup(groupId, { name })
        .then(() => {
          const inbox = useInboxStore.getState();
          if (dmAgentId) inbox.renameAgentDM(dmAgentId, name);
          else inbox.updateGroupMeta(groupId, { name });
        })
        .catch(failManage);
    },
    [failManage, t, language],
  );

  // 群/DM：删除（二次确认）；删当前打开的会话 → 回 home 安全页。
  const removeConversation = useCallback(
    (groupId: string, name: string, dmAgentId?: string) => {
      if (
        !window.confirm(
          t('neo.manage.deleteConversationConfirm', {
            defaultValue:
              language === 'zh'
                ? `确定删除会话「${name}」？此操作不可撤销`
                : `Delete conversation "${name}"? This cannot be undone`,
          }),
        )
      )
        return;
      setManageError(null);
      deleteGroup(groupId)
        .then(() => {
          const inbox = useInboxStore.getState();
          if (dmAgentId) inbox.removeAgentDM(dmAgentId);
          else inbox.removeGroup(groupId);
          if (nav.view === 'conversation' && nav.groupId === groupId) {
            onNavigate({ view: 'home' });
          }
        })
        .catch(failManage);
    },
    [nav, onNavigate, failManage, t, language],
  );

  // GAP A3 回写（2026-08-23）「移入项目」：按互链 group_id PATCH 会话归属
  // （projectId=null = 移回默认项目），成功后 reloadTick 重拉项目分组刷新分桶。
  const moveConversation = useCallback(
    (groupId: string, projectId: string | null) => {
      setMoveMenuFor(null);
      setManageError(null);
      moveGroupConversationToProject(groupId, projectId)
        .then(() => setReloadTick((n) => n + 1))
        .catch(failManage);
    },
    [failManage],
  );

  // 项目：重命名/删除（管理面闭环补的 patchProject/deleteProject 客户端）；
  // 成功重拉项目分组（reloadTick 驱动 listProjectsWithSessions 重取）。
  const renameProject = useCallback(
    (p: ProjectWithSessions) => {
      const name = window
        .prompt(
          t('neo.manage.renamePrompt', {
            defaultValue: language === 'zh' ? '新名称' : 'New name',
          }),
          p.name,
        )
        ?.trim();
      if (!name || name === p.name) return;
      setManageError(null);
      patchProject(p.project_id, { name })
        .then(() => setReloadTick((n) => n + 1))
        .catch(failManage);
    },
    [failManage, t, language],
  );

  const removeProject = useCallback(
    (p: ProjectWithSessions) => {
      if (
        !window.confirm(
          t('neo.manage.deleteProjectConfirm', {
            defaultValue:
              language === 'zh'
                ? `确定删除项目「${p.name}」？此操作不可撤销`
                : `Delete project "${p.name}"? This cannot be undone`,
          }),
        )
      )
        return;
      setManageError(null);
      deleteProject(p.project_id)
        .then(() => setReloadTick((n) => n + 1))
        .catch(failManage);
    },
    [failManage, t, language],
  );

  // 项目分组 label + hover 管理操作（重命名/删除）；复用 .neo-agent-row/.neo-row-soul
  // 的悬停显现样式（与员工行 soul 钮同款），label 本体撑满剩余宽度。
  const renderProjectLabel = (p: ProjectWithSessions) => (
    <div className="neo-agent-row">
      <div
        className="neo-section-label"
        style={{ flex: 1, minWidth: 0 }}
        data-testid="neo-project-label"
      >
        <Folder size={12} strokeWidth={1.75} aria-hidden />
        {p.name}
      </div>
      <button
        type="button"
        className="neo-icon-btn neo-row-soul"
        onClick={() => renameProject(p)}
        aria-label={t('neo.manage.renameProject', {
          defaultValue: language === 'zh' ? `重命名项目 ${p.name}` : `Rename project ${p.name}`,
        })}
        title={t('neo.manage.rename', { defaultValue: language === 'zh' ? '重命名' : 'Rename' })}
        data-testid="neo-project-rename"
      >
        <Pencil size={12} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="neo-icon-btn neo-row-soul"
        onClick={() => removeProject(p)}
        aria-label={t('neo.manage.deleteProject', {
          defaultValue: language === 'zh' ? `删除项目 ${p.name}` : `Delete project ${p.name}`,
        })}
        title={t('common.delete', { defaultValue: language === 'zh' ? '删除' : 'Delete' })}
        data-testid="neo-project-delete"
      >
        <Trash2 size={12} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );

  // GAP A3 回写（2026-08-23）「移入项目」hover 钮 + 轻量浮层：行内
  // neo-icon-btn 风格 + 内联样式小菜单（同 agentCreatedToast 先例，不引重型
  // 组件）。浮层列项目（当前归属打 ✓；'default' 行并入「默认项目」入口，
  // project_id 置空 = 移回默认组），选择后 PATCH + reloadTick 刷新分桶。
  const renderMoveControl = (groupId: string, name: string, testid: string) => {
    const currentPid = projectByGroupId.get(groupId)?.project_id ?? null;
    const open = moveMenuFor === groupId;
    return (
      <span style={{ position: 'relative', flex: '0 0 auto' }}>
        <button
          type="button"
          className="neo-icon-btn neo-row-soul"
          onClick={() => setMoveMenuFor(open ? null : groupId)}
          aria-expanded={open}
          aria-label={t('neo.manage.moveConversation', {
            defaultValue:
              language === 'zh'
                ? `移入项目 ${name}`
                : `Move conversation ${name} to project`,
          })}
          title={t('neo.manage.moveToProject', {
            defaultValue: language === 'zh' ? '移入项目' : 'Move to project',
          })}
          data-testid={testid}
        >
          <FolderInput size={12} strokeWidth={1.75} aria-hidden />
        </button>
        {open && (
          <div
            role="menu"
            data-testid="neo-move-menu"
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              zIndex: 10001,
              minWidth: 140,
              padding: 4,
              borderRadius: 8,
              background: 'var(--t-panel)',
              border: '1px solid var(--t-border)',
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {(projects ?? [])
              .filter((p) => p.project_id !== 'default')
              .map((p) => (
                <button
                  key={p.project_id}
                  type="button"
                  role="menuitem"
                  className="neo-row"
                  onClick={() => moveConversation(groupId, p.project_id)}
                  data-testid="neo-move-option"
                  data-project-id={p.project_id}
                >
                  <Folder size={12} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">{p.name}</span>
                  {currentPid === p.project_id && (
                    <Check size={12} strokeWidth={2} aria-hidden />
                  )}
                </button>
              ))}
            <button
              type="button"
              role="menuitem"
              className="neo-row"
              onClick={() => moveConversation(groupId, null)}
              data-testid="neo-move-default"
            >
              <Folder size={12} strokeWidth={1.75} aria-hidden />
              <span className="neo-row-name">
                {t('neo.manage.defaultProject', {
                  defaultValue: language === 'zh' ? '默认项目' : 'Default project',
                })}
              </span>
              {(currentPid === null || currentPid === 'default') && (
                <Check size={12} strokeWidth={2} aria-hidden />
              )}
            </button>
          </div>
        )}
      </span>
    );
  };

  // DM 会话行 / 群聊现场行渲染器（home 默认组与项目分组桶共用，行为不变：
  // 点击 = 中栏打开会话；DM 无 group_id 时走 find-or-create resolve 通路）。
  // 管理面闭环（2026-08-23）：有 group_id 的行追加 hover 重命名/删除钮。
  const renderDmRow = (d: AgentDMItem) => {
    const rel = relativeTime(d.lastActivityAt, nowTick, t);
    const openDm = () => {
      if (d.group_id) onNavigate({ view: 'conversation', groupId: d.group_id });
      else openAgentDm(d.agentId, d.agentName);
    };
    return (
      <div key={d.agentId} className="neo-agent-row">
        <button
          type="button"
          className={`neo-row${isConversation(d.group_id) ? ' on' : ''}`}
          onClick={openDm}
          data-testid="neo-dm-row"
          title={d.lastMessage || d.agentName}
        >
          <MessageSquare size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-row-name">{d.agentName}</span>
          {rel && <span className="neo-row-time">{rel}</span>}
          {d.unreadCount > 0 && (
            <span className="neo-row-badge">{d.unreadCount}</span>
          )}
        </button>
        {d.group_id && (
          <>
            {renderMoveControl(d.group_id, d.agentName, 'neo-dm-move')}
            <button
              type="button"
              className="neo-icon-btn neo-row-soul"
              onClick={() => renameConversation(d.group_id!, d.agentName, d.agentId)}
              aria-label={t('neo.manage.renameConversation', {
                defaultValue: language === 'zh' ? `重命名会话 ${d.agentName}` : `Rename conversation ${d.agentName}`,
              })}
              title={t('neo.manage.rename', { defaultValue: language === 'zh' ? '重命名' : 'Rename' })}
              data-testid="neo-dm-rename"
            >
              <Pencil size={12} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              className="neo-icon-btn neo-row-soul"
              onClick={() => removeConversation(d.group_id!, d.agentName, d.agentId)}
              aria-label={t('neo.manage.deleteConversation', {
                defaultValue: language === 'zh' ? `删除会话 ${d.agentName}` : `Delete conversation ${d.agentName}`,
              })}
              title={t('common.delete', { defaultValue: language === 'zh' ? '删除' : 'Delete' })}
              data-testid="neo-dm-delete"
            >
              <Trash2 size={12} strokeWidth={1.75} aria-hidden />
            </button>
          </>
        )}
      </div>
    );
  };

  const renderGroupRow = (g: GroupItem) => {
    const rel = relativeTime(g.lastActivityAt, nowTick, t);
    return (
      <div key={g.id} className="neo-agent-row">
        <button
          type="button"
          className={`neo-row${isConversation(g.id) ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'conversation', groupId: g.id })}
          data-testid="neo-group-row"
          title={g.lastMessage || g.name}
        >
          <UsersRound size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-row-name">{g.name}</span>
          {rel && <span className="neo-row-time">{rel}</span>}
          {g.unreadCount > 0 && <span className="neo-row-badge">{g.unreadCount}</span>}
        </button>
        {renderMoveControl(g.id, g.name, 'neo-group-move')}
        <button
          type="button"
          className="neo-icon-btn neo-row-soul"
          onClick={() => renameConversation(g.id, g.name)}
          aria-label={t('neo.manage.renameConversation', {
            defaultValue: language === 'zh' ? `重命名会话 ${g.name}` : `Rename conversation ${g.name}`,
          })}
          title={t('neo.manage.rename', { defaultValue: language === 'zh' ? '重命名' : 'Rename' })}
          data-testid="neo-group-rename"
        >
          <Pencil size={12} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className="neo-icon-btn neo-row-soul"
          onClick={() => removeConversation(g.id, g.name)}
          aria-label={t('neo.manage.deleteConversation', {
            defaultValue: language === 'zh' ? `删除会话 ${g.name}` : `Delete conversation ${g.name}`,
          })}
          title={t('common.delete', { defaultValue: language === 'zh' ? '删除' : 'Delete' })}
          data-testid="neo-group-delete"
        >
          <Trash2 size={12} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    );
  };

  // 历史导航 ←/→ 两钮（栏顶导航簇共用；第三枚折叠/展开钮各态自渲染）
  const navHistoryBtns = (
    <>
      <button
        type="button"
        className="neo-icon-btn"
        onClick={() => navigateHistory(-1)}
        disabled={!canBack}
        aria-label={t('neo.nav.back', { defaultValue: '后退' })}
        title={t('neo.nav.back', { defaultValue: '后退' })}
        data-testid="neo-nav-back"
      >
        <ArrowLeft size={15} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className="neo-icon-btn"
        onClick={() => navigateHistory(1)}
        disabled={!canForward}
        aria-label={t('neo.nav.forward', { defaultValue: '前进' })}
        title={t('neo.nav.forward', { defaultValue: '前进' })}
        data-testid="neo-nav-forward"
      >
        <ArrowRight size={15} strokeWidth={1.75} aria-hidden />
      </button>
    </>
  );

  // ── 折叠态：56px 图标 rail（ZCode 式精简：导航簇 / 新任务 / 头像列表 /
  //    底部账户钮）───────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <nav className="neo-rail collapsed" aria-label={t('shell.navigation')}>
        <div className="neo-rail-nav" role="group" aria-label={t('neo.nav.history', { defaultValue: '历史导航' })}>
          {navHistoryBtns}
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
        </div>
        <button
          type="button"
          className="neo-icon-btn neo-newtask-icon"
          onClick={onNewTask}
          aria-label={t('neo.newTask')}
          title={t('neo.newTask')}
          data-testid="neo-new-task"
        >
          <SquarePen size={15} strokeWidth={1.75} aria-hidden />
        </button>
        <div className="neo-rail-icons" role="list">
          {filteredAgents.map((a) => (
            <button
              key={a.agent_id}
              type="button"
              role="listitem"
              className={`neo-icon-btn neo-avatar-btn${isAgentOn(a.agent_id) ? ' on' : ''}`}
              onClick={() => openAgentDm(a.agent_id, a.name)}
              title={a.name}
              aria-label={a.name}
              aria-pressed={isAgentOn(a.agent_id)}
            >
              <NeoAgentAvatar
                seed={a.agent_id}
                name={a.name}
                color={a.avatar_color ?? null}
                status={agentStatusToDot(a.status)}
              />
            </button>
          ))}
        </div>
        <div className="neo-rail-spacer" />
        {/* 底部账户钮（ShadowFlow 徽章：白底 S）：直达 /settings */}
        <Link
          to="/settings"
          className="neo-icon-btn"
          aria-label={t('common.settings')}
          title={userName}
          data-testid="neo-user-settings"
        >
          <span className="neo-user-face neo-user-face--sm" aria-hidden>
            S
          </span>
        </Link>
      </nav>
    );
  }

  // ── 展开态：180px 完整导航 ────────────────────────────────────────────────
  return (
    <nav className="neo-rail" aria-label={t('shell.navigation')}>
      {/* 栏顶导航簇（ZCode 式 ←/→/折叠；工作区头已按用户要求移除） */}
      <div className="neo-rail-nav" role="group" aria-label={t('neo.nav.history', { defaultValue: '历史导航' })}>
        {navHistoryBtns}
        <button
          type="button"
          className="neo-icon-btn"
          onClick={toggleCollapsed}
          aria-label={t('neo.collapseRail')}
          title={t('neo.collapseRail')}
          data-testid="neo-rail-collapse"
        >
          <PanelLeft size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {/* 一级导航（全部经 onNavigate/onNewTask 上报，NeoApp 统一映射列表区）：
          新任务 / 知识库 / 记忆 / 团队 / 员工 / 搜索（按需展开过滤框）。 */}
      <nav className="neo-nav">
        <button
          type="button"
          className={`neo-nav-row${section === 'home' ? ' on' : ''}`}
          onClick={onNewTask}
          aria-pressed={section === 'home'}
          data-testid="neo-new-task"
        >
          <SquarePen size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">{t('neo.newTask')}</span>
        </button>
        <button
          type="button"
          className={`neo-nav-row${section === 'knowledge' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'knowledge' })}
          aria-pressed={section === 'knowledge'}
          data-testid="neo-nav-knowledge"
        >
          <Library size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.knowledgeBase', { defaultValue: language === 'zh' ? '知识库' : 'Knowledge' })}
          </span>
        </button>
        <button
          type="button"
          className={`neo-nav-row${section === 'memory' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'memory' })}
          aria-pressed={section === 'memory'}
          data-testid="neo-nav-memory"
        >
          <Brain size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.memoryBase', { defaultValue: language === 'zh' ? '记忆' : 'Memory' })}
          </span>
        </button>
        <button
          type="button"
          className={`neo-nav-row${section === 'teams' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'teams' })}
          aria-pressed={section === 'teams'}
          data-testid="neo-nav-teams"
        >
          <Users size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.nav.teamsSub', { defaultValue: language === 'zh' ? '团队' : 'Teams' })}
          </span>
        </button>
        <button
          type="button"
          className={`neo-nav-row${section === 'agents' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'agents' })}
          aria-pressed={section === 'agents'}
          data-testid="neo-nav-agents"
        >
          <UserRound size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.nav.agentsCloud', {
              defaultValue: language === 'zh' ? '员工' : 'Staff',
            })}
          </span>
        </button>
        <button
          type="button"
          className={`neo-nav-row${nav.view === 'runs' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'runs' })}
          aria-pressed={nav.view === 'runs'}
          data-testid="neo-nav-runs"
        >
          <History size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.nav.runs', { defaultValue: language === 'zh' ? '历史' : 'History' })}
          </span>
        </button>
        <button
          type="button"
          className="neo-nav-row"
          onClick={() => setSearchOpen((o) => !o)}
          aria-expanded={searchOpen}
          data-testid="neo-nav-search"
        >
          <Search size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.nav.search', { defaultValue: language === 'zh' ? '搜索' : 'Search' })}
          </span>
        </button>
      </nav>

      {searchOpen && (
        <div className="neo-search">
          <Search size={13} strokeWidth={1.9} aria-hidden className="neo-search-icon" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('agent.searchPlaceholder')}
            aria-label={t('common.search')}
          />
        </div>
      )}

      {/* 列表区（section 受控）：home=最近会话；agents=员工；teams=团队+群聊现场；
          knowledge=知识分包；memory=记忆条目。 */}
      <div className="neo-rail-body">
        {/* 管理面闭环行级操作失败红条（真实后端错误，不吞不假成功） */}
        {manageError && (
          <div className="neo-list-note neo-list-error" role="alert">
            <span className="neo-list-error-text" data-testid="neo-manage-error">
              {manageError}
            </span>
          </div>
        )}
        {section === 'home' && (
          <>
            {/* GAP A3（2026-08-22）项目分组：label + 「新建项目」行（内联输入），
                会话按 session.group_id 归入项目桶，无项目归入默认「会话」组。 */}
            <div className="neo-section-label">
              {t('neo.projects', { defaultValue: language === 'zh' ? '项目' : 'Projects' })}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            <button
              type="button"
              className="neo-row"
              onClick={() => setCreateProjectOpen((o) => !o)}
              aria-expanded={createProjectOpen}
              data-testid="neo-new-project"
            >
              <Plus size={15} strokeWidth={1.75} aria-hidden />
              <span className="neo-row-name">
                {t('neo.newProject', { defaultValue: language === 'zh' ? '新建项目' : 'New Project' })}
              </span>
            </button>
            {createProjectOpen && (
              <div className="neo-search">
                <input
                  autoFocus
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewProject();
                    if (e.key === 'Escape') {
                      setCreateProjectOpen(false);
                      setProjectName('');
                      setProjectError(null);
                    }
                  }}
                  placeholder={t('neo.newProject.placeholder', {
                    defaultValue: language === 'zh' ? '项目名称，回车创建' : 'Project name, Enter to create',
                  })}
                  aria-label={t('neo.newProject', {
                    defaultValue: language === 'zh' ? '新建项目' : 'New Project',
                  })}
                  data-testid="neo-new-project-input"
                />
              </div>
            )}
            {projectError && (
              <div className="neo-list-note neo-list-error">
                <span className="neo-list-error-text">{projectError}</span>
              </div>
            )}
            {dmBuckets.grouped.map(({ project, rows }) => (
              <div key={project.project_id}>
                {renderProjectLabel(project)}
                {rows.map(renderDmRow)}
              </div>
            ))}
            {recentDMs.length > 0 ? (
              dmBuckets.unassigned.length > 0 && (
                <>
                  <div className="neo-section-label">
                    {t('neo.sessions')}
                    <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
                  </div>
                  {dmBuckets.unassigned.map(renderDmRow)}
                </>
              )
            ) : (
              (projects ?? []).length === 0 && (
                <div className="neo-list-note">
                  {t('neo.sessionsEmpty', {
                    defaultValue: language === 'zh' ? '还没有会话，发一条消息开始' : 'No conversations yet',
                  })}
                </div>
              )
            )}
          </>
        )}

        {section === 'agents' && (
          <>
            <div className="neo-section-label">
              {t('shell.navAgents')}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {/* A14/B27 新建 Agent 入口（ClawsGo a_001/a_019「创建 Agent」行形态：
                + 图标纯文字行，点击开 NeoCreateAgentModal，真实 POST /api/agents） */}
            <button
              type="button"
              className="neo-row"
              onClick={() => setCreateAgentOpen(true)}
              data-testid="neo-new-agent"
            >
              <Plus size={15} strokeWidth={1.75} aria-hidden />
              <span className="neo-row-name">
                {t('neo.newAgent', { defaultValue: language === 'zh' ? '新建 Agent' : 'New Agent' })}
              </span>
            </button>
            {agentsState === 'loading' && (
              <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sf-skeleton neo-rail-skeleton" />
                ))}
              </div>
            )}
            {agentsState === 'error' && (
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
            {agentsState === 'ready' && filteredAgents.length === 0 && (
              <div className="neo-list-note">{t('agent.noAgents')}</div>
            )}
            {filteredAgents.map((a) => (
              <div key={a.agent_id} className="neo-agent-row">
                <button
                  type="button"
                  className={`neo-row${isAgentOn(a.agent_id) ? ' on' : ''}`}
                  onClick={() => openAgentDm(a.agent_id, a.name)}
                  aria-pressed={isAgentOn(a.agent_id)}
                >
                  <Bot size={15} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">{a.name}</span>
                </button>
                {/* 行内只留删除（悬停显现）：灵魂编辑走 DM → 右侧主机「灵魂」tab，
                    暂停/恢复在灵魂页头部状态钮（neo-soul-status-toggle） */}
                <button
                  type="button"
                  className="neo-icon-btn neo-row-soul"
                  onClick={() => removeAgent(a)}
                  aria-label={t('neo.manage.deleteAgent', {
                    defaultValue: language === 'zh' ? `删除员工 ${a.name}` : `Delete agent ${a.name}`,
                  })}
                  title={t('common.delete', { defaultValue: language === 'zh' ? '删除' : 'Delete' })}
                  data-testid="neo-agent-delete"
                >
                  <Trash2 size={13} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            ))}
          </>
        )}

        {section === 'teams' && (
          <>
            <div className="neo-section-label">
              {t('shell.navTeams')}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {teamsState === 'loading' && (
              <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sf-skeleton neo-rail-skeleton" />
                ))}
              </div>
            )}
            {teamsState === 'error' && (
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
            {teamsState === 'ready' && filteredTeams.length === 0 && (
              <div className="neo-list-note">{t('chat.noTeams')}</div>
            )}
            {filteredTeams.map((tm) => (
              <button
                key={tm.team_id}
                type="button"
                className={`neo-row${isTeamOn(tm.team_id) ? ' on' : ''}`}
                onClick={() => openTeamChat(tm)}
                aria-pressed={isTeamOn(tm.team_id)}
                data-testid="neo-team-row"
              >
                <Users size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">{tm.name}</span>
                <span className="neo-row-meta">{tm.agent_ids.length}</span>
              </button>
            ))}

            {/* 群聊现场入口（Polynoia 对标 2026-08-15）— 点击中栏内嵌打开群时间线。
                GAP D（2026-08-22）：label 常驻 + 显式「新建群聊」行（名称 + 团队/Agent
                选人，真实 POST /api/groups），不再只靠团队行隐式 find-or-create。 */}
            <div className="neo-section-label">
              {t('neo.groups', { defaultValue: language === 'zh' ? '群聊现场' : 'Group Rooms' })}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            <button
              type="button"
              className="neo-row"
              onClick={() => setCreateGroupOpen(true)}
              data-testid="neo-new-group"
            >
              <Plus size={15} strokeWidth={1.75} aria-hidden />
              <span className="neo-row-name">
                {t('neo.newGroup.entry', { defaultValue: language === 'zh' ? '新建群聊' : 'New Group' })}
              </span>
            </button>
            {recentGroups.length > 0 && (
              <>
                {/* GAP A3：群聊按项目分桶（group.id ↔ session.group_id），
                    无项目归默认平铺。 */}
                {groupBuckets.grouped.map(({ project, rows }) => (
                  <div key={project.project_id}>
                    {renderProjectLabel(project)}
                    {rows.map(renderGroupRow)}
                  </div>
                ))}
                {groupBuckets.unassigned.map(renderGroupRow)}
              </>
            )}
          </>
        )}

        {/* 统一知识源列表（2026-08-19 合并批）：本地仓库 + 知识包混排，
            点行 → 中栏知识页并预选该源（sourceId 深链，rail 常驻）。 */}
        {section === 'knowledge' && (
          <>
            <div className="neo-section-label">
              {t('neo.knowledgeBase', { defaultValue: language === 'zh' ? '知识库' : 'Knowledge' })}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {packsState === 'loading' && (
              <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sf-skeleton neo-rail-skeleton" />
                ))}
              </div>
            )}
            {packsState === 'error' && (
              <div className="neo-list-note neo-list-error">
                <span className="neo-list-error-text">{t('team.loadError')}</span>
                <button
                  type="button"
                  className="neo-list-retry"
                  onClick={() => setReloadTick((n) => n + 1)}
                >
                  <RotateCcw size={11} strokeWidth={2} aria-hidden />
                  {t('common.retry')}
                </button>
              </div>
            )}
            {packsState === 'ready' &&
              (vaults?.length ?? 0) + (packs?.length ?? 0) === 0 && (
                <div className="neo-list-note">
                  {t('neo.knowledgeEmpty', {
                    defaultValue: language === 'zh' ? '还没有知识源' : 'No sources yet',
                  })}
                </div>
              )}
            {packsState === 'ready' &&
              (vaults ?? []).map((v) => (
                <button
                  key={v.vault_id}
                  type="button"
                  className={`neo-row${isSourceOn(`vault:${v.vault_id}`) ? ' on' : ''}`}
                  onClick={() => onNavigate({ view: 'knowledge', sourceId: `vault:${v.vault_id}` })}
                  data-testid="neo-vault-row"
                  title={v.path}
                >
                  <Folder size={15} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">{v.name}</span>
                  {v.health !== 'active' && <span className="neo-row-meta">missing</span>}
                </button>
              ))}
            {packsState === 'ready' &&
              (packs ?? []).map((p) => (
                <button
                  key={p.pack_id}
                  type="button"
                  className={`neo-row${isSourceOn(`pack:${p.pack_id}`) ? ' on' : ''}`}
                  onClick={() => onNavigate({ view: 'knowledge', sourceId: `pack:${p.pack_id}` })}
                  data-testid="neo-pack-row"
                  title={p.description}
                >
                  <Library size={15} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">{p.name}</span>
                  <span className="neo-row-meta">{p.status}</span>
                </button>
              ))}
          </>
        )}

        {/* 记忆条目列表：点条目 → 中栏记忆页（embedded，rail 常驻） */}
        {section === 'memory' && (
          <>
            <div className="neo-section-label">
              {t('neo.memoryBase', { defaultValue: language === 'zh' ? '记忆' : 'Memory' })}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {memoryState === 'loading' && (
              <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sf-skeleton neo-rail-skeleton" />
                ))}
              </div>
            )}
            {memoryState === 'error' && (
              <div className="neo-list-note neo-list-error">
                <span className="neo-list-error-text">{t('team.loadError')}</span>
                <button
                  type="button"
                  className="neo-list-retry"
                  onClick={() => setReloadTick((n) => n + 1)}
                >
                  <RotateCcw size={11} strokeWidth={2} aria-hidden />
                  {t('common.retry')}
                </button>
              </div>
            )}
            {memoryState === 'ready' && (memoryEntries?.length ?? 0) === 0 && (
              <div className="neo-list-note">
                {t('neo.memory.empty', { defaultValue: '还没有记忆条目' })}
              </div>
            )}
            {(memoryEntries ?? []).map((entry) => {
              const rel = relativeTime(entry.updated_at, nowTick, t);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="neo-row"
                  onClick={() => onNavigate({ view: 'memory' })}
                  data-testid="neo-memory-row"
                  title={entry.content}
                >
                  <Brain size={15} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">{entry.title}</span>
                  {rel && <span className="neo-row-time">{rel}</span>}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* 底部账户行：ShadowFlow 徽章头像（白底 S 字母）+ 名 + 设置（直达
          /settings）。循环引擎入口已移除——迭代环并入右栏「过程」tab。 */}
      <div className="neo-usercard">
        <span className="neo-user-face" aria-hidden>
          S
        </span>
        <span className="neo-user-meta">
          <span className="neo-user-name">{userName}</span>
          {userMail && <span className="neo-user-mail">{userMail}</span>}
        </span>
        <Link
          to="/settings"
          className="neo-icon-btn"
          aria-label={t('common.settings')}
          title={t('common.settings')}
          data-testid="neo-user-settings"
        >
          <Settings size={16} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      {/* A14/B27 新建 Agent 模态：成功 → 刷新列表 + 选中新 agent + 「去对话试试」
          轻提示（toast）；失败在模态内红条 */}
      {createAgentOpen && (
        <NeoCreateAgentModal
          workspaceId={workspaceId ?? null}
          onClose={() => setCreateAgentOpen(false)}
          onCreated={(a) => {
            setCreateAgentOpen(false);
            setReloadTick((n) => n + 1);
            openAgentDm(a.agent_id, a.name);
            setAgentCreatedToast(
              t('neo.agent.createdToast', { defaultValue: `已创建「${a.name}」，去对话试试` }),
            );
          }}
        />
      )}

      {/* Agent 创建成功轻提示：左下角 toast，auto-dismiss；DM 已由 openAgentDm 打开。 */}
      {agentCreatedToast && (
        <div
          role="status"
          data-testid="neo-agent-created-toast"
          style={{
            position: 'fixed', left: 12, bottom: 72, zIndex: 10001,
            padding: '7px 12px', borderRadius: 8, fontSize: 12,
            background: 'var(--t-panel)', color: 'var(--t-fg-2)',
            border: '1px solid var(--t-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          }}
        >
          {agentCreatedToast}
        </div>
      )}

      {/* GAP D 新建群聊模态：成功 → 中栏打开新群现场 + 刷新 inbox 群列表 */}
      {createGroupOpen && (
        <NeoCreateGroupModal
          workspaceId={workspaceId ?? null}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(g) => {
            setCreateGroupOpen(false);
            onNavigate({ view: 'conversation', groupId: g.groupId });
            void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
          }}
        />
      )}
    </nav>
  );
}
