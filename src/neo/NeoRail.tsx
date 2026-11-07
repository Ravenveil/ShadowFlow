/**
 * NeoRail — Neo 左栏导航（clawsgo 形态，2026-08-19 跳转收敛后纯受控组件）。
 *
 * 展开 180px / 折叠 56px 图标 rail，宽度 240ms spring 过渡。**本组件不再持有
 * 任何导航状态**：中栏视图（nav）与列表区（section）全部由 NeoApp 下发，
 * 所有点击经唯一入口 onNavigate 上报——列表、中栏、高亮同源，不会分叉。
 *
 * os-unified（2026-11-03，Grok Bot 范式改造）：
 *   - home 会话区并入员工/团队：团队 = 可折叠分组（组内团队群聊 + 成员
 *     agent 会话项），未归属团队的员工落「成员」组。
 *   - agent 会话项 = DiceBear 头像 + 名称 + 最后消息预览 + 相对时间 + 未读；
 *     整行（含头像）点击 = 进 DM 会话（openAgentDm 通路不变）。灵魂编辑
 *     不再独立弹出 agent-soul 页（2026-11-06 用户反馈），走会话内右栏
 *     NeoHost「灵魂」tab（内嵌 NeoAgentSoul）。
 *   - agents/teams 分区同样走会话项/分组形态，视觉行为统一。
 *
 * 展开态结构（复刻 home.html .sidebar）：
 *   - 栏顶导航簇：←/→ 历史导航 + 折叠钮（ZCode 式）
 *   - 一级导航行：新任务(onNewTask) / 知识库 / 记忆 / 团队 / 员工 / 搜索
 *     （知识库/记忆/团队/员工 → onNavigate 对应变体；搜索按需展开过滤框）
 *   - 列表区（section 受控）：home=最近会话+团队分组+成员（GAP A3 项目分组
 *     保留）；agents=员工会话项；teams=团队分组+群聊现场；knowledge=知识
 *     分包；memory=记忆条目
 *   - 底部账户行（useAuth）+ 设置齿轮（/settings）
 *
 * 会话入口统一走 find-or-create resolve（与 DM resolve 同款模式）：
 *   - 员工/会话行 → resolveDmConversation → conversation（失败兜底 agent-target）
 *   - 团队行 → resolveTeamGroup → conversation（失败兜底 team-target）
 * 列表行 = 纯文字 + 细线图标（15px --t-fg-3），选中 = 灰底 600 加粗（对齐
 * ClawsGo home.html .nav-row / .group-label 复刻；无彩色 tile、无指示条）。
 *
 * 管理面闭环（2026-08-23）：群/DM 行 hover 出重命名 + 删除，项目 label
 * hover 出重命名 + 删除——全部真实 API，删除二次确认（window.confirm），
 * 失败红条（neo-manage-error），删当前打开的会话/员工后跳回 home 安全页。
 * 「移入项目」hover 浮层已于 2026-11-04 移除（拖拽会话到项目分组取代交互；
 * 底层 PATCH /api/conversations/by-group/:gid 通路保留供拖拽 drop 复用，
 * 「默认项目」= project_id 置空）。
 * 项目 label hover 另有产物钮（2026-09-03）：GET /api/projects/:id/artifacts
 * 居中模态列表，预览/下载直链（相对路径，与 NeoHost 产物 tab 同款）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarClock,
  ChevronDown,
  Folder,
  FolderOpen,
  Library,
  PanelLeft,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
  UsersRound,
} from 'lucide-react';
import { listAgents, type AgentRecord } from '../api/agents';
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
import { fsPickNative } from '../api/fsBrowse';
import type { AgentDMItem, GroupItem } from '../common/types/inbox';
import { listPacks as listMemoryPacks, type MemoryBankPack } from '../api/memoryBank';
import { listSchedules, type ScheduleRecord } from '../api/schedules';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { GroupStackAvatar } from '../components/agent/GroupStackAvatar';
// 内置秘书（2026-11-06）：固定 id 常量 + 会话去重过滤共用。
import { SECRETARY_AGENT_ID, SECRETARY_NAME } from './secretary';
// ClawHub（2026-06，T08）：AgentAvatar 样式（增量引入）
import '../pages/clawhub/clawhub.css';
import { useAuth } from '../core/auth/AuthContext';
import { useI18n } from '../common/i18n';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useInboxStore } from '../core/store/useInboxStore';
import { useCommandK } from '../core/hooks/useCommandK';
import type { NeoRailProps } from './types';
import { NeoCreateAgentModal } from './NeoCreateAgentModal';
import { NeoCreateGroupModal } from './NeoCreateGroupModal';
import { NeoRenameModal } from './NeoRenameModal';
import { NeoConfirmModal } from './NeoConfirmModal';

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
  width,
  onResizeStart,
  style,
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
  // 「+ 新建」聚合菜单（2026-11-06 用户反馈：三个创建入口收进一个加号，
  // 点加号弹出 新建 Agent / 新建项目 / 发起群聊 三项菜单）
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  // 加载失败后的手动重试触发器（+1 重新跑列表 effect）
  const [reloadTick, setReloadTick] = useState(0);
  // A14/B27 新建 Agent 模态开关
  const [createAgentOpen, setCreateAgentOpen] = useState(false);
  // 发起群聊模态（2026-11-06 重做回归：微信选人式，入口在列表区「新建项目」行后）
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  // 2026-08-22 第二轮 — Agent 创建成功后的「去对话试试」轻提示（auto-dismiss）。
  // 只在调用方/成功回调侧加引导，NeoCreateAgentModal 本体归另一代理。
  const [agentCreatedToast, setAgentCreatedToast] = useState<string | null>(null);
  // GAP A3（2026-08-22）项目分组：项目+会话（GET /api/projects?withSessions=1），
  // home/teams 分区拉取；「新建项目」为内联输入行（+ 图标行展开，Enter 提交）。
  const [projects, setProjects] = useState<ProjectWithSessions[] | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectError, setProjectError] = useState<string | null>(null);
  // 新建项目可选绑定的本地文件夹（fsPickNative 原生对话框拿到的绝对路径）。
  const [projectWorkspace, setProjectWorkspace] = useState<string | null>(null);
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

  // 「+ 新建」菜单点外关闭（微信/钉钉范式：无遮罩浮层，document mousedown
  // 点外即收；菜单内部点击不关——选中项自己负责收菜单）。
  useEffect(() => {
    if (!plusMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (plusMenuRef.current?.contains(tgt)) return;
      setPlusMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [plusMenuOpen]);

  // Agent 创建成功 toast 自动消失（2.6s，与 composer toast 同款节奏）。
  useEffect(() => {
    if (!agentCreatedToast) return;
    const id = setTimeout(() => setAgentCreatedToast(null), 2600);
    return () => clearTimeout(id);
  }, [agentCreatedToast]);

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  // 侧栏一次成型批（2026-11-06）：agents/teams/inbox 三路 settle 标记——home
  // 列表在全部 settle 前渲染骨架行而非空白，消灭「先空白、数据到了瞬间全量
  // 爆发」。projects 不参与判定（慢一路不阻塞列表，到了自然插进分组）。
  const [agentsSettled, setAgentsSettled] = useState(false);
  const [teamsSettled, setTeamsSettled] = useState(false);
  // workspace 切换 = 新一轮加载：settle 标记复位，骨架重新接管（旧数据仍显示，
  // 只是不再判「空态」——避免切工作区时闪错误空文案）。
  useEffect(() => {
    setAgentsSettled(false);
    setTeamsSettled(false);
  }, [workspaceId]);
  // 知识源（统一:本地仓库 + 知识分包）/ 记忆条目（左栏分区列表;进入对应分区才拉取）
  const [packs, setPacks] = useState<MemoryBankPack[] | null>(null);
  const [packsState, setPacksState] = useState<LoadState>('loading');
  // 定时任务（2026-11-06 /routines 对齐）：进入 schedules 分区拉全量计划
  const [schedules, setSchedules] = useState<ScheduleRecord[] | null>(null);
  const [schedulesState, setSchedulesState] = useState<LoadState>('loading');

  // 会话条目（最近单聊，数据源同 PersonalChatView）；Python 宕机时 store 降级
  // 为空数组，渲染干净空态即可。
  const agentDMs = useInboxStore((s) => s.agentDMs) ?? [];
  // 群列表（Polynoia 对标 2026-08-15）— 团队的干活现场（群聊网关按
  // group.team_id 触发团队 DAG），点击中栏内嵌打开。
  const groups = useInboxStore((s) => s.groups) ?? [];
  // inbox 加载态（侧栏一次成型批）：参与 home 骨架判定。首轮 loading 期间
  // agentDMs/groups 都是空数组，不判它会把「加载中」误判成「没有会话」。
  const inboxLoading = useInboxStore((s) => s.loading);

  const toggleCollapsed = onToggleCollapsed;

  // 员工列表常驻加载（折叠态头像条 + home 会话兜底都用它），不再按视图门控。
  useEffect(() => {
    let alive = true;
    listAgents(workspaceId ?? undefined)
      .then((rows) => {
        if (!alive) return;
        setAgents(rows);
        setAgentsSettled(true);
      })
      .catch(() => {
        if (!alive) return;
        setAgents([]);
        setAgentsSettled(true);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId, reloadTick]);

  // 团队列表：os-unified 后左栏只有 home 一个会话分区，团队分组常驻渲染，
  // 无视图门控（Grok 范式：侧边栏随时完整）。
  useEffect(() => {
    let alive = true;
    listTeams(workspaceId ?? undefined)
      .then((rows) => {
        if (!alive) return;
        setTeams(rows);
        setTeamsSettled(true);
      })
      .catch(() => {
        if (!alive) return;
        setTeams([]);
        setTeamsSettled(true);
      });
    return () => {
      alive = false;
    };
  }, [workspaceId, reloadTick]);

  // 项目分组（GAP A3）：home 分区拉取项目+会话；失败降级 null（全落默认组，
  // 不影响既有列表渲染）。os-unified 后常驻加载（home 是唯一会话分区）。
  // 不参与骨架判定（projects 慢一路不阻塞列表渲染）。
  useEffect(() => {
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
  }, [workspaceId, reloadTick]);

  // 统一知识源（2026-11-07 知识库统一批）:知识库唯一实现 = 多模态记忆库,
  // 进入 knowledge 分区拉记忆库知识包;行点击带 sourceId 深链预选中栏。
  useEffect(() => {
    if (section !== 'knowledge') return;
    let alive = true;
    setPacksState('loading');
    listMemoryPacks()
      .then((res) => {
        if (!alive) return;
        setPacks(res.data.packs);
        setPacksState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setPacks([]);
        setPacksState('error');
      });
    return () => {
      alive = false;
    };
  }, [section, reloadTick]);

  // 定时任务列表（2026-11-06：进入 schedules 分区拉全量计划；Python 后端，
  // 宕机时 error 态 + 重试钮，与 knowledge/memory 分区同款降级）
  useEffect(() => {
    if (section !== 'schedules') return;
    let alive = true;
    setSchedulesState('loading');
    listSchedules()
      .then((rows) => {
        if (!alive) return;
        setSchedules(rows);
        setSchedulesState('ready');
      })
      .catch(() => {
        if (!alive) return;
        setSchedules([]);
        setSchedulesState('error');
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

  // ── os-unified（2026-11-03）：「员工+团队」合并入会话区的数据来源 ──────────
  // Grok Bot 范式：员工 = 会话项（DiceBear 头像 + 名称 + 最后消息预览），
  // 团队 = 分组标题（组内是团队群聊 + 成员 agent 会话项）。这里做三件事：
  //   1) 从 teams 的 agent_ids 展开团队成员 → agentId 集合，判定"归属团队的员工"；
  //   2) 每个 agent 会话项合并 inbox DM 的 lastMessage/unread（无 DM 也展示，预览空）；
  //   3) 群聊按 team_id join（groups 来自 inbox，无 team_id 字段则落默认组）。
  const agentsById = useMemo(() => {
    const m = new Map<string, AgentRecord>();
    for (const a of agents) m.set(a.agent_id, a);
    return m;
  }, [agents]);

  const teamAgentIds = useMemo(() => {
    const s = new Set<string>();
    for (const tm of teams) for (const id of tm.agent_ids ?? []) s.add(id);
    return s;
  }, [teams]);

  const dmByAgentId = useMemo(() => {
    const m = new Map<string, AgentDMItem>();
    for (const d of agentDMs) m.set(d.agentId, d);
    return m;
  }, [agentDMs]);

  // 团队 → 该团队群聊（inbox groups 无 team_id，需从群名与团队名匹配兜底；
  // resolveTeamGroup 建群时 name = team.name，同名即归属，找不到落 unassigned）。
  const groupByTeamId = useMemo(() => {
    const m = new Map<string, GroupItem>();
    const byName = new Map<string, GroupItem>();
    for (const g of groups) {
      const rec = g as GroupItem & { team_id?: string | null };
      if (rec.team_id) m.set(rec.team_id, g);
      else if (g.name) byName.set(g.name, g);
    }
    for (const tm of teams) {
      if (!m.has(tm.team_id)) {
        const hit = byName.get(tm.name);
        if (hit) m.set(tm.team_id, hit);
      }
    }
    return m;
  }, [groups, teams]);

  // ── os-unified 2026-11-04（用户反馈批）：项目 = 顶层分组（Grok「工作/生活」
  // 范式），组内混排「成员会话 + 团队分组 + 群聊」；未归项目的落默认区。
  // 归属推导复用既有 join：DM.group_id → projectByGroupId（会话↔项目）；
  // 团队 → groupByTeamId 群聊 → projectByGroupId。成员只渲染一行（Grok：
  // 每 Bot 恰好出现一次）——归属团队的成员只在团队分组内出现，散养成员
  // 按 DM 归项目桶，无 DM 的散养成员落「成员」区。
  const projectByTeamId = useMemo(() => {
    const m = new Map<string, ProjectWithSessions>();
    for (const tm of teams) {
      const g = groupByTeamId.get(tm.team_id);
      const p = g ? projectByGroupId.get(g.id) : undefined;
      if (p) m.set(tm.team_id, p);
    }
    return m;
  }, [teams, groupByTeamId, projectByGroupId]);

  // 散养成员的 DM（归属团队的成员 DM 不单独渲染，行已收进团队分组）。
  // 内置秘书单独前置渲染（常驻行），不进散养 DM 桶（去重）。
  const soloDms = useMemo(
    () => recentDMs.filter((d) => !teamAgentIds.has(d.agentId) && d.agentId !== SECRETARY_AGENT_ID),
    [recentDMs, teamAgentIds],
  );
  const soloDmBuckets = useMemo(
    () => bucketByProject(soloDms, (d) => d.group_id),
    [bucketByProject, soloDms],
  );
  // 无团队且无 DM 的成员（纯「成员」区行，点行自动 find-or-create DM）。
  // 影固定 id 已被常驻行渲染，从散养成员里排除。
  const loneAgents = useMemo(
    () =>
      filteredAgents.filter(
        (a) =>
          !teamAgentIds.has(a.agent_id) &&
          !dmByAgentId.has(a.agent_id) &&
          a.agent_id !== SECRETARY_AGENT_ID,
      ),
    [filteredAgents, teamAgentIds, dmByAgentId],
  );
  // 内置秘书的 agent 记录（后端启动播种；未拉到时用固定 id/名兜底渲染）。
  const secretaryAgent = useMemo(
    () => agents.find((a) => a.agent_id === SECRETARY_AGENT_ID) ?? null,
    [agents],
  );
  // 秘书的 inbox DM 条目（有会话时行尾显示最后消息/时间；无会话时预览为引导文案）。
  const secretaryDm = useMemo(
    () => dmByAgentId.get(SECRETARY_AGENT_ID) ?? null,
    [dmByAgentId],
  );
  // 已被团队分组收编的群聊 id（不进散群列表，避免团队分组内外双渲染）
  const teamGroupIdSet = useMemo(() => {
    const s = new Set<string>();
    for (const tm of teams) {
      const g = groupByTeamId.get(tm.team_id);
      if (g) s.add(g.id);
    }
    return s;
  }, [teams, groupByTeamId]);
  const looseGroups = useMemo(
    () => recentGroups.filter((g) => !teamGroupIdSet.has(g.id)),
    [recentGroups, teamGroupIdSet],
  );
  const looseGroupBuckets = useMemo(
    () => bucketByProject(looseGroups, (g) => g.id),
    [bucketByProject, looseGroups],
  );
  // 项目桶（顺序 = 项目列表顺序）：项目 label + 散群 + 团队分组 + 成员 DM
  const projectSections = useMemo(
    () =>
      (projects ?? []).map((project) => ({
        project,
        groups: looseGroupBuckets.grouped.find(
          (b) => b.project.project_id === project.project_id,
        )?.rows ?? [],
        teams: teams.filter(
          (tm) => projectByTeamId.get(tm.team_id)?.project_id === project.project_id,
        ),
        dms: soloDmBuckets.grouped.find(
          (b) => b.project.project_id === project.project_id,
        )?.rows ?? [],
      })),
    [projects, looseGroupBuckets, teams, projectByTeamId, soloDmBuckets],
  );
  const defaultTeams = useMemo(
    () => filteredTeams.filter((tm) => !projectByTeamId.has(tm.team_id)),
    [filteredTeams, projectByTeamId],
  );
  // home 空态判定（侧栏一次成型批）：只在 agents/teams/inbox 三路全部 settle
  // 后才允许判空——加载中一律走骨架，不闪「还没有会话」。
  const homeLoading = !agentsSettled || !teamsSettled || inboxLoading;
  const railEmpty =
    !homeLoading &&
    teams.length === 0 &&
    recentGroups.length === 0 &&
    recentDMs.length === 0 &&
    agents.length === 0;

  // 选中高亮从 nav 派生（与中栏同源）：会话行比 groupId；员工/团队兜底目标态
  // 比 agentId/teamId——conversation 打开时对应列表行不抢高亮（列表保持浏览态）。
  const isConversation = (groupId: string | null | undefined) =>
    !!groupId && nav.view === 'conversation' && nav.groupId === groupId;
  const isAgentOn = (agentId: string) =>
    (nav.view === 'agent-target' && nav.agentId === agentId) ||
    (nav.view === 'agent-soul' && nav.agentId === agentId);
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

  // ── os-unified（2026-11-03）：agent 会话项「点头像 = 主机卡片」────────────
  // 2026-11-06 用户反馈：点头像不再弹独立灵魂页（agent-soul），整行（含头像）
  // 一律走 openAgentDm 进单聊；灵魂编辑由会话内右栏 NeoHost「灵魂」tab 承接。

  // 团队分组折叠状态（Grok Bot 分组范式：组标题可折叠，默认全展开）
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((m) => ({ ...m, [key]: !m[key] }));
  }, []);

  // 团队群聊行点击 = 中栏打开该团队的群聊现场（后端按 group.team_id 跑团队
  // DAG，团队的干活现场就是它的群）；无群则建一条挂在团队下的群。失败兜底
  // team-target（中栏 composer 面向该 team，右栏编队 tab）。
  // os-unified：群聊行渲染在团队分组内（renderTeamGroup），已持有 group.id 时
  // 直接 conversation 跳转；group 缺失才走 resolveTeamGroup find-or-create。
  const openTeamChat = useCallback(
    (tm: TeamRecord) => {
      const existing = groupByTeamId.get(tm.team_id);
      if (existing) {
        onNavigate({ view: 'conversation', groupId: existing.id });
        return;
      }
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
    [onNavigate, workspaceId, groupByTeamId],
  );

  // GAP A3 新建项目（内联输入行 Enter 提交）：成功 → 收起输入 + 重新拉项目分组；
  // 失败留输入行并显示错误条（不吞错）。
  const submitNewProject = useCallback(() => {
    // 选了文件夹但名称为空 → 用目录 basename 作项目名。
    const name =
      projectName.trim() ||
      (projectWorkspace?.split(/[\\/]/).filter(Boolean).pop() ?? '');
    if (!name) return;
    createProject(name, projectWorkspace ?? undefined)
      .then(() => {
        setCreateProjectOpen(false);
        setProjectName('');
        setProjectWorkspace(null);
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
  }, [projectName, projectWorkspace, t, language]);

  // 「新建项目」行的文件夹按钮：原生对话框选本地文件夹作为 workspace_path；
  // 取消/不支持（null）→ 静默保持现状，仍可不绑目录创建。
  const pickProjectFolder = useCallback(() => {
    void fsPickNative().then((p) => {
      if (p) setProjectWorkspace(p);
    });
  }, []);

  // ── 管理面闭环（2026-08-23）：行级 hover 操作（暂停/恢复/重命名/删除）─────
  // 全部真实调 API；删除二次确认走 NeoConfirmModal（2026-11-04 用户反馈批：
  // window.confirm 原生框带「localhost:3007 显示」标题、样式与应用脱节，
  // 统一替换为应用内弹窗）；失败进 manageError 红条（不吞错、不假成功）；
  // 成功后刷新本地 store/列表。删当前打开的会话/员工 →
  // 跳回 home 安全页，避免中栏停留在已删除对象上。
  const [manageError, setManageError] = useState<string | null>(null);
  // 「移入项目」行内浮层入口已移除（2026-11-04：拖拽归组取代）；状态随之清理。

  // 删除确认弹窗（2026-11-04 用户反馈批）：会话/群聊/项目三处删除共用一个
  // NeoConfirmModal。confirmTarget 记待删对象；busy/error 由本层真实 API
  // 状态驱动（请求中两钮失效 + 转圈；失败弹窗保持打开、行内红条）。
  const [confirmTarget, setConfirmTarget] = useState<{
    kind: 'conversation' | 'project';
    groupId?: string;
    dmAgentId?: string;
    projectId?: string;
    name: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // 重命名弹窗（2026-11-04 用户反馈批「编辑项目名字能不能成熟一点」）：
  // 项目/会话两处 window.prompt 统一替换为 NeoRenameModal。组件自身不持有
  // busy/error —— patch 真实 API 的 loading 与失败都发生在本层，经 props 下发
  // （失败弹窗保持打开，行内红条展示；成功关闭 + 刷新列表/本地 store）。
  const [renameTarget, setRenameTarget] = useState<{
    kind: 'project' | 'conversation';
    projectId?: string;
    groupId?: string;
    dmAgentId?: string;
    currentName: string;
  } | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const failManage = useCallback(() => {
    setManageError(
      t('neo.manage.opFailed', {
        defaultValue: language === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry',
      }),
    );
  }, [t, language]);

  // 员工：删除入口已收敛到 agent 主机卡片（NeoAgentSoul 头部删除钮，2026-11-04
  // 用户反馈批：二次确认走 NeoConfirmModal）。rail 行内不再直挂，本层不再持有
  // removeAgent 回调（原 window.confirm 版本已随入口移除而清理）。

  // 群/DM：重命名（patchGroup 真实改名）。原 window.prompt 改 NeoRenameModal：
  // 确认 → busy → patchGroup → 成功后本地 store 同步（DM 行显示名来自 inbox
  // 的 agentName，同步 renameAgentDM 即时反映；fetchWorkspaceInbox 已填充时
  // 会 skip 重拉，所以直接写本地 store，不做无效重拉）再关闭；失败行内红条、
  // 弹窗保持打开（不吞错、不假成功）。
  const renameConversation = useCallback(
    (groupId: string, currentName: string, dmAgentId?: string) => {
      setRenameError(null);
      setRenameTarget({ kind: 'conversation', groupId, dmAgentId, currentName });
    },
    [],
  );

  const confirmConversationRename = useCallback(
    (name: string) => {
      const target = renameTarget;
      const groupId = target?.groupId;
      if (!groupId) return;
      setRenameBusy(true);
      setRenameError(null);
      patchGroup(groupId, { name })
        .then(() => {
          const inbox = useInboxStore.getState();
          if (target?.dmAgentId) inbox.renameAgentDM(target.dmAgentId, name);
          else inbox.updateGroupMeta(groupId, { name });
          setRenameTarget(null);
        })
        .catch(() =>
          setRenameError(
            t('neo.manage.opFailed', {
              defaultValue: language === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry',
            }),
          ),
        )
        .finally(() => setRenameBusy(false));
    },
    [renameTarget, t, language],
  );

  // 群/DM：删除（NeoConfirmModal 二次确认，2026-11-04 起）；删当前打开的
  // 会话 → 回 home 安全页。本回调只负责开弹窗，真实删除在 confirmDelete。
  const removeConversation = useCallback(
    (groupId: string, name: string, dmAgentId?: string) => {
      setConfirmError(null);
      setConfirmTarget({ kind: 'conversation', groupId, dmAgentId, name });
    },
    [],
  );

  const confirmConversationDelete = useCallback(
    (groupId: string, dmAgentId: string | undefined) => {
      setConfirmBusy(true);
      setConfirmError(null);
      deleteGroup(groupId)
        .then(() => {
          const inbox = useInboxStore.getState();
          if (dmAgentId) inbox.removeAgentDM(dmAgentId);
          else inbox.removeGroup(groupId);
          if (nav.view === 'conversation' && nav.groupId === groupId) {
            onNavigate({ view: 'home' });
          }
          setConfirmTarget(null);
        })
        .catch(() =>
          setConfirmError(
            t('neo.manage.opFailed', {
              defaultValue: language === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry',
            }),
          ),
        )
        .finally(() => setConfirmBusy(false));
    },
    [nav, onNavigate, t, language],
  );

  // 「移入项目」归属回写通路（拖拽归组 drop 复用）：按互链 group_id PATCH
  // 会话归属（projectId=null = 移回默认项目），成功后 reloadTick 重拉项目分组
  // 刷新分桶。原行内浮层入口已移除，本回调仅供 handleDropOnProject 调用。
  const moveConversation = useCallback(
    (groupId: string, projectId: string | null) => {
      setManageError(null);
      moveGroupConversationToProject(groupId, projectId)
        .then(() => setReloadTick((n) => n + 1))
        .catch(failManage);
    },
    [failManage],
  );

  // ── os-unified（2026-11-04 用户反馈）头像拖拽归组 ─────────────────────────
  // Grok Bot 交互：按住会话行（Bot 头像/整行）拖到项目分组 pill（或折叠组）上
  // 松手完成归组，复用既有「移入项目」PATCH 通路。dragConvRef 持被拖会话 id；
  // dropTargetState 记当前 hover 的投放目标（高亮 pill）。
  const dragConvRef = useRef<{ groupId: string; name: string } | null>(null);
  const [dropTargetProject, setDropTargetProject] = useState<string | 'default' | null>(null);
  /** 被拖会话的 groupId（dragstart 加 .neo-dragging 半透明，dragend 清）。 */
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const handleDragStart = useCallback((groupId: string, name: string) => {
    dragConvRef.current = { groupId, name };
    setDraggingGroupId(groupId);
  }, []);
  const handleDragEnd = useCallback(() => {
    dragConvRef.current = null;
    setDropTargetProject(null);
    setDraggingGroupId(null);
  }, []);
  const handleDropOnProject = useCallback(
    (projectId: string | null) => {
      const dragged = dragConvRef.current;
      dragConvRef.current = null;
      setDropTargetProject(null);
      if (dragged) moveConversation(dragged.groupId, projectId);
    },
    [moveConversation],
  );
  const projectDropProps = useCallback(
    (projectId: string | null, tag: string) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!dragConvRef.current) return;
        e.preventDefault(); // 允许 drop
        e.dataTransfer.dropEffect = 'move';
        setDropTargetProject(tag);
      },
      onDragLeave: () => {
        setDropTargetProject((cur) => (cur === tag ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        handleDropOnProject(projectId);
      },
    }),
    [handleDropOnProject],
  );

  // 项目：重命名/删除（管理面闭环补的 patchProject/deleteProject 客户端）。
  // 重命名原 window.prompt 改 NeoRenameModal：确认 → busy → patchProject →
  // 成功关闭 + reloadTick 重拉项目分组刷新分桶；失败行内红条、弹窗保持打开。
  const renameProject = useCallback(
    (p: ProjectWithSessions) => {
      setRenameError(null);
      setRenameTarget({ kind: 'project', projectId: p.project_id, currentName: p.name });
    },
    [],
  );

  const confirmProjectRename = useCallback(
    (name: string) => {
      const target = renameTarget;
      if (!target?.projectId) return;
      setRenameBusy(true);
      setRenameError(null);
      patchProject(target.projectId, { name })
        .then(() => {
          setRenameTarget(null);
          setReloadTick((n) => n + 1);
        })
        .catch(() =>
          setRenameError(
            t('neo.manage.opFailed', {
              defaultValue: language === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry',
            }),
          ),
        )
        .finally(() => setRenameBusy(false));
    },
    [renameTarget, t, language],
  );

  // 项目：删除（NeoConfirmModal 二次确认，2026-11-04 起）。本回调只负责开
  // 弹窗；真实删除在 confirmProjectDelete（成功后 reloadTick 重拉项目分组）。
  const removeProject = useCallback(
    (p: ProjectWithSessions) => {
      setConfirmError(null);
      setConfirmTarget({ kind: 'project', projectId: p.project_id, name: p.name });
    },
    [],
  );

  const confirmProjectDelete = useCallback(
    (projectId: string) => {
      setConfirmBusy(true);
      setConfirmError(null);
      deleteProject(projectId)
        .then(() => {
          setConfirmTarget(null);
          setReloadTick((n) => n + 1);
        })
        .catch(() =>
          setConfirmError(
            t('neo.manage.opFailed', {
              defaultValue: language === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry',
            }),
          ),
        )
        .finally(() => setConfirmBusy(false));
    },
    [t, language],
  );

  // 「移入项目」hover 钮已移除（2026-11-04 用户反馈：拖拽会话到项目分组即可
  // 归组，行内浮层入口冗余）。底层 moveConversation PATCH 通路保留——拖拽
  // drop（handleDropOnProject）仍复用它完成归属回写。

  // ── 内置秘书常驻行（2026-11-06，GrokBot 主Bot范式）─────────────────
  // home 列表区第一位常驻：无论有没有会话，老板随时能找到秘书。点击 =
  // openAgentDm（find-or-create DM；后端对新 DM 预置欢迎语问候）。
  // 无 inbox 记录时预览显示引导文案；agent 记录未拉到时也用固定 id/名渲染。
  const renderSecretaryRow = () => {
    const rec = secretaryAgent;
    const dm = secretaryDm;
    const preview = dm?.lastMessage || (language === 'zh' ? '随时听候吩咐' : 'At your service');
    const rel = dm ? relativeTime(dm.lastActivityAt, nowTick, t) : null;
    return (
      <div className="neo-agent-row" data-testid="neo-secretary-row">
        <button
          type="button"
          className={`neo-row neo-sess-row neo-secretary-row${dm && isConversation(dm.group_id) ? ' on' : ''}`}
          onClick={() => openAgentDm(SECRETARY_AGENT_ID, rec?.name ?? SECRETARY_NAME)}
          title={preview}
        >
          <span className="neo-sess-avatar">
            <AgentAvatar
              name={rec?.name ?? SECRETARY_NAME}
              style={rec?.avatar_style ?? 'lorelei'}
              seed={rec?.avatar_seed ?? 'mishu'}
              image={rec?.avatar_image ?? null}
              size={32}
              fallback={
                <NeoAgentAvatar
                  seed={SECRETARY_AGENT_ID}
                  name={SECRETARY_NAME}
                  color={rec?.avatar_color ?? null}
                  status={rec ? agentStatusToDot(rec.status) : undefined}
                />
              }
            />
          </span>
          <span className="neo-sess-text">
            <span className="neo-sess-name">{rec?.name ?? SECRETARY_NAME}</span>
            <span className="neo-sess-preview">{preview}</span>
          </span>
          {rel && <span className="neo-row-time">{rel}</span>}
          {dm && dm.unreadCount > 0 && <span className="neo-row-badge">{dm.unreadCount}</span>}
        </button>
      </div>
    );
  };

  // DM 会话行 / 群聊现场行渲染器（home 默认组与项目分组桶共用，行为不变：
  // 点击 = 中栏打开会话；DM 无 group_id 时走 find-or-create resolve 通路）。
  // 管理面闭环（2026-08-23）：有 group_id 的行追加 hover 重命名/删除钮
  // （「移入项目」hover 钮 2026-11-04 移除，拖拽归组取代）。
  const renderDmRow = (d: AgentDMItem) => {
    const rel = relativeTime(d.lastActivityAt, nowTick, t);
    // os-unified 2026-11-04：DM 行升级 Grok 会话项形态（真实头像 + 名称 +
    // 消息预览两行结构）——与成员会话行统一；Claw 徽章移到预览行尾。
    // 行尾 hover 钮（重命名/删除）保留；移入项目钮已删（拖拽归组取代）。
    const dmAgent = agentsById.get(d.agentId) ?? null;
    const dmAgentClaw = dmAgent?.claw_id ?? null;
    // 侧栏一次成型批：头像优先 inbox 自带四件套（首帧即有），agents 记录
    // 到达后再接管（claw 徽章/状态点等富信息仍以 agents 记录为准）。
    const dmAvatar = (
      <AgentAvatar
        name={d.agentName}
        style={d.avatar_style ?? dmAgent?.avatar_style}
        seed={d.avatar_seed ?? dmAgent?.avatar_seed ?? d.agentName}
        image={d.avatar_image ?? dmAgent?.avatar_image ?? null}
        size={32}
        fallback={
          <NeoAgentAvatar
            seed={d.agentId}
            name={d.agentName}
            color={d.avatar_color ?? dmAgent?.avatar_color ?? null}
            status={dmAgent ? agentStatusToDot(dmAgent.status) : undefined}
          />
        }
      />
    );
    const openDm = () => {
      if (d.group_id) onNavigate({ view: 'conversation', groupId: d.group_id });
      else openAgentDm(d.agentId, d.agentName);
    };
    return (
      <div key={d.agentId} className="neo-agent-row">
        <button
          type="button"
          className={`neo-row neo-sess-row${isConversation(d.group_id) ? ' on' : ''}${draggingGroupId === d.group_id ? ' neo-dragging' : ''}`}
          onClick={openDm}
          draggable={!!d.group_id}
          onDragStart={() => d.group_id && handleDragStart(d.group_id, d.agentName)}
          onDragEnd={handleDragEnd}
          data-testid="neo-dm-row"
          title={d.lastMessage || d.agentName}
        >
          <span className="neo-sess-avatar">
            {dmAvatar}
          </span>
          <span className="neo-sess-text">
            <span className="neo-sess-name">{d.agentName}</span>
            {(d.lastMessage || dmAgentClaw) && (
              <span className="neo-sess-preview">
                {d.lastMessage}
                {dmAgentClaw && (
                  <span
                    className="neo-row-claw-tag"
                    data-testid="neo-dm-claw-tag"
                    style={{ marginLeft: 6 }}
                    title={language === 'zh' ? `Claw 驱动：${dmAgentClaw}` : `Driven by claw: ${dmAgentClaw}`}
                  >
                    {dmAgentClaw}
                  </span>
                )}
              </span>
            )}
          </span>
          {rel && <span className="neo-row-time">{rel}</span>}
          {d.unreadCount > 0 && (
            <span className="neo-row-badge">{d.unreadCount}</span>
          )}
        </button>
        {d.group_id && (
          <>
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
    // os-unified 2026-11-04 用户反馈批：群头像 = 成员头像组合（Grok/微信范式）。
    // 侧栏一次成型批：优先 inbox 自带 members 快照（首帧即拼贴完整），快照
    // 缺失（老数据）回落 agent_ids join 本地 agents 列表。
    const gMembers: Array<{
      agent_id?: string;
      name: string;
      avatar_style?: string | null;
      avatar_seed?: string | null;
      avatar_image?: string | null;
    }> = g.members?.length
      ? g.members
      : (g.agent_ids ?? [])
          .map((id) => agentsById.get(id))
          .filter((a): a is AgentRecord => !!a);
    return (
      <div key={g.id} className="neo-agent-row">
        <button
          type="button"
          className={`neo-row neo-sess-row${isConversation(g.id) ? ' on' : ''}${draggingGroupId === g.id ? ' neo-dragging' : ''}`}
          onClick={() => onNavigate({ view: 'conversation', groupId: g.id })}
          draggable
          onDragStart={() => handleDragStart(g.id, g.name)}
          onDragEnd={handleDragEnd}
          data-testid="neo-group-row"
          title={g.lastMessage || g.name}
        >
          <span className="neo-sess-avatar">
            <GroupStackAvatar members={gMembers} size={32} />
          </span>
          <span className="neo-sess-text">
            <span className="neo-sess-name">{g.name}</span>
            {g.lastMessage && <span className="neo-sess-preview">{g.lastMessage}</span>}
          </span>
          {rel && <span className="neo-row-time">{rel}</span>}
          {g.unreadCount > 0 && <span className="neo-row-badge">{g.unreadCount}</span>}
        </button>
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

  // ── os-unified：agent 会话行渲染器（Grok Bot 范式）────────────────────────
  // 头像（DiceBear）+ 名称 + 最后消息预览 + 相对时间 + 未读徽标。
  // 点击整行（含头像）= 进 DM 会话（openAgentDm 同既有通路）。
  const renderAgentSessionRow = (a: AgentRecord) => {
    const dm = dmByAgentId.get(a.agent_id);
    const rel = relativeTime(dm?.lastActivityAt, nowTick, t);
    const preview = dm?.lastMessage ?? '';
    const status = agentStatusToDot(a.status);
    return (
      <div key={`sess-${a.agent_id}`} className="neo-agent-row">
        <button
          type="button"
          className={`neo-row neo-sess-row${isConversation(dm?.group_id) || isAgentOn(a.agent_id) ? ' on' : ''}${draggingGroupId === dm?.group_id ? ' neo-dragging' : ''}`}
          onClick={() => openAgentDm(a.agent_id, a.name)}
          draggable={!!dm?.group_id}
          onDragStart={() => dm?.group_id && handleDragStart(dm.group_id, a.name)}
          onDragEnd={handleDragEnd}
          data-testid="neo-agent-session-row"
          data-agent-id={a.agent_id}
          title={preview || a.name}
        >
          <span
            className="neo-sess-avatar"
            aria-hidden
            draggable={false}
          >
            <AgentAvatar
              name={a.name}
              style={a.avatar_style}
              seed={a.avatar_seed ?? a.name}
              image={a.avatar_image ?? null}
              size={32}
              fallback={
                <NeoAgentAvatar
                  seed={a.agent_id}
                  name={a.name}
                  color={a.avatar_color ?? null}
                  status={status}
                />
              }
            />
          </span>
          <span className="neo-sess-text">
            <span className="neo-sess-name">{a.name}</span>
            {preview && <span className="neo-sess-preview">{preview}</span>}
          </span>
          {rel && <span className="neo-row-time">{rel}</span>}
          {(dm?.unreadCount ?? 0) > 0 && (
            <span className="neo-row-badge">{dm!.unreadCount}</span>
          )}
        </button>
      </div>
    );
  };

  // ── os-unified：团队分组渲染器（组标题可折叠 + 组内群聊 + 成员会话项）─────
  const renderTeamGroup = (tm: TeamRecord) => {
    const key = `team-${tm.team_id}`;
    const open = !collapsedGroups[key];
    const group = groupByTeamId.get(tm.team_id);
    // 团队分组内的成员行仍以 teams.roster join agents 为准（含状态点）；
    // 群头像拼贴优先 group.members 快照（首帧完整），缺失回落 roster join。
    const members = (tm.agent_ids ?? [])
      .map((id) => agentsById.get(id))
      .filter((a): a is AgentRecord => !!a);
    const stackMembers = group?.members?.length
      ? group.members
      : members;
    return (
      <div key={key} data-testid="neo-team-group" data-team-id={tm.team_id}>
        <div className="neo-agent-row">
          <button
            type="button"
            className={`neo-group-label${open ? '' : ' collapsed'}`}
            onClick={() => toggleGroup(key)}
            aria-expanded={open}
            data-testid="neo-team-group-toggle"
          >
            <ChevronDown
              size={12}
              strokeWidth={1.75}
              aria-hidden
              style={{
                transform: open ? 'none' : 'rotate(-90deg)',
                transition: 'transform 160ms var(--ease-out)',
              }}
            />
            <span className="neo-section-label" style={{ padding: 0, flex: 1, minWidth: 0 }}>
              {tm.name}
            </span>
            <span className="neo-row-meta">{tm.agent_ids?.length ?? 0}</span>
          </button>
        </div>
        {open && (
          <div className="neo-team-group-body">
            {group ? (
              <div className="neo-agent-row">
                <button
                  type="button"
                  className={`neo-row neo-sess-row${isConversation(group.id) ? ' on' : ''}${draggingGroupId === group.id ? ' neo-dragging' : ''}`}
                  onClick={() => onNavigate({ view: 'conversation', groupId: group.id })}
                  draggable
                  onDragStart={() => handleDragStart(group.id, group.name)}
                  onDragEnd={handleDragEnd}
                  data-testid="neo-team-group-chat"
                  title={group.lastMessage || group.name}
                >
                  <span className="neo-sess-avatar">
                    {/* os-unified 2026-11-04 用户反馈批：团队群头像 = 成员头像组合 */}
                    <GroupStackAvatar members={stackMembers} size={32} />
                  </span>
                  <span className="neo-sess-text">
                    <span className="neo-sess-name">{group.name}</span>
                    {group.lastMessage && (
                      <span className="neo-sess-preview">{group.lastMessage}</span>
                    )}
                  </span>
                  {relativeTime(group.lastActivityAt, nowTick, t) && (
                    <span className="neo-row-time">{relativeTime(group.lastActivityAt, nowTick, t)}</span>
                  )}
                  {group.unreadCount > 0 && (
                    <span className="neo-row-badge">{group.unreadCount}</span>
                  )}
                </button>
              </div>
            ) : (
              /* 无群聊现场：显式入口行（点击走 openTeamChat find-or-create 建群），
                 替代旧版平铺团队行的隐式建群 */
              <div className="neo-agent-row">
                <button
                  type="button"
                  className="neo-row"
                  onClick={() => openTeamChat(tm)}
                  data-testid="neo-team-row"
                  title={t('neo.team.openChat', {
                    defaultValue: language === 'zh' ? `打开「${tm.name}」群聊现场` : `Open ${tm.name} group chat`,
                  })}
                >
                  <Users size={15} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">
                    {t('neo.team.openChatRow', {
                      defaultValue: language === 'zh' ? '群聊现场' : 'Group room',
                    })}
                  </span>
                  <Plus size={13} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            )}
            {members.map(renderAgentSessionRow)}
          </div>
        )}
      </div>
    );
  };

  // 未归属任何团队的员工（os-unified 2026-11-04：归属团队的成员行已收进
  // 团队分组；散养成员经 soloDms/loneAgents 两条路渲染，此 memo 不再直接使用）

  // ── os-unified 2026-11-04：项目 = 顶层分组，组内混排 ──────────────────────
  // Grok「工作/生活」范式 + 用户反馈「不同项目里是不同的规划」：项目 label
  // （可折叠）→ 组内 = 该项目群聊 + 团队分组 + 成员会话。默认区（未归项目）
  // 同构混排：散养团队 + 散群 + 成员 DM + 孤儿成员。
  //
  // 2026-11-04 用户反馈批：默认区**不再按类型插子标题**（此前有「群聊现场」/
  // 「成员」两道 label，把同一层会话又切成了上下两块）。Grok 左栏就是一列
  // 会话/Bot，团队以可折叠分组的形式出现，其余一律平级行——不再有
  // 「成员 vs 团队」的分区感。分组语义交给项目/团队折叠组表达。
  const renderProjectBody = () => (
    <>
      {/* 秘书不在这里渲染（2026-11-06 修复重复）：常驻行由列表区
          「+ 新建」之下统一渲染一次（项目分组之上），默认组只含普通会话。 */}
      {defaultTeams.map(renderTeamGroup)}
      {looseGroupBuckets.unassigned.map(renderGroupRow)}
      {soloDmBuckets.unassigned.map(renderDmRow)}
      {loneAgents.map(renderAgentSessionRow)}
    </>
  );

  const renderProjectSection = ({
    project,
    groups,
    teams: teamRows,
    dms,
  }: {
    project: ProjectWithSessions;
    groups: GroupItem[];
    teams: TeamRecord[];
    dms: AgentDMItem[];
  }) => {
    const key = `proj-${project.project_id}`;
    const open = !collapsedGroups[key];
    const memberCount = groups.length + teamRows.length + dms.length;
    const isDropTarget = dropTargetProject === project.project_id;
    return (
      <div key={key} data-testid="neo-project-section" data-project-id={project.project_id}>
        <div
          className="neo-agent-row"
          {...projectDropProps(project.project_id, project.project_id)}
        >
          <button
            type="button"
            className={`neo-group-label${open ? '' : ' collapsed'}${isDropTarget ? ' neo-drop-target' : ''}`}
            onClick={() => toggleGroup(key)}
            aria-expanded={open}
            data-testid="neo-project-section-toggle"
          >
            <ChevronDown
              size={12}
              strokeWidth={1.75}
              aria-hidden
              style={{
                transform: open ? 'none' : 'rotate(-90deg)',
                transition: 'transform 160ms var(--ease-out)',
              }}
            />
            <span className="neo-section-label" style={{ padding: 0, flex: 1, minWidth: 0 }}>
              <Folder size={12} strokeWidth={1.75} aria-hidden style={{ marginRight: 4 }} />
              {project.name}
            </span>
            {memberCount > 0 && <span className="neo-row-meta">{memberCount}</span>}
          </button>
          {/* hover 管理钮（旧项目 label 三钮剩二：重命名/删除；产物钮 2026-11-03 移除） */}
          <button
            type="button"
            className="neo-icon-btn neo-row-soul"
            onClick={() => renameProject(project)}
            aria-label={t('neo.manage.renameProject', {
              defaultValue: language === 'zh' ? `重命名项目 ${project.name}` : `Rename project ${project.name}`,
            })}
            title={t('neo.manage.rename', { defaultValue: language === 'zh' ? '重命名' : 'Rename' })}
            data-testid="neo-project-rename"
          >
            <Pencil size={12} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className="neo-icon-btn neo-row-soul"
            onClick={() => removeProject(project)}
            aria-label={t('neo.manage.deleteProject', {
              defaultValue: language === 'zh' ? `删除项目 ${project.name}` : `Delete project ${project.name}`,
            })}
            title={t('common.delete', { defaultValue: language === 'zh' ? '删除' : 'Delete' })}
            data-testid="neo-project-delete"
          >
            <Trash2 size={12} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {open && (
          <div className="neo-team-group-body">
            {groups.map(renderGroupRow)}
            {teamRows.map(renderTeamGroup)}
            {dms.map(renderDmRow)}
          </div>
        )}
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
      <nav className="neo-rail collapsed" aria-label={t('shell.navigation')} style={style}>
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
        {/* 「新任务」图标钮已收起（2026-11-06 用户反馈，⌘K 快捷键保留） */}
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
              {/* ClawHub（2026-10-30）：员工头像统一 DiceBear —— 配了 style/seed
                  用配置值，未配置按名字 hash 稳定生成（同一 agent 永远同头像）；
                  字母色块仅作 SVG 异常兜底（AgentAvatar 内置）。 */}
              <AgentAvatar
                name={a.name}
                style={a.avatar_style}
                seed={a.avatar_seed ?? a.name}
                size={24}
                fallback={
                  <NeoAgentAvatar
                    seed={a.agent_id}
                    name={a.name}
                    color={a.avatar_color ?? null}
                    status={agentStatusToDot(a.status)}
                  />
                }
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

  // ── 展开态：默认 180px / 拖宽后 var(--rail-w)（2026-11-06 侧栏可拖宽）────
  return (
    <nav
      className="neo-rail"
      aria-label={t('shell.navigation')}
      style={style}
      data-width={width ?? undefined}
    >
      {/* 右缘拖宽热区（2026-11-06 用户反馈：侧边栏可左右拉动）：6px 命中条，
          pointerdown 上报 NeoApp（move/up 由其窗口级监听跟随），折叠态不渲染。 */}
      {onResizeStart && (
        <div
          className="neo-rail-resize-handle"
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('neo.rail.resize', { defaultValue: language === 'zh' ? '拖动调整侧边栏宽度' : 'Resize sidebar' })}
          data-testid="neo-rail-resize-handle"
        />
      )}
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
          os-unified（2026-11-04 Grok Bot 范式批）：只留全局动作（知识库/
          记忆/搜索/ClawHub）——团队/员工/历史按钮移除，成员即会话、团队即
          home 列表区分组，历史由会话列表本身承担。
          2026-11-06 用户反馈：「新任务」入口收起不展示（主控对话由秘书
          承担，⌘K 快捷键保留）。 */}
      <nav className="neo-nav">
        <button
          type="button"
          className={`neo-nav-row${nav.view === 'knowledge' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'knowledge' })}
          aria-pressed={nav.view === 'knowledge'}
          data-testid="neo-nav-knowledge"
        >
          <Library size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.knowledgeBase', { defaultValue: language === 'zh' ? '知识库' : 'Knowledge' })}
          </span>
        </button>
        {/* 记忆入口已折叠进设置（2026-11-06 折叠批）：记忆条目 / 画像 / 交接
            统一在「设置 → 记忆」下管理，左栏不再占一级导航行。 */}
        {/* 数据看板（2026-11-05，整合 OPC-OS PR#3 看板设计）：nav 常驻行。
            列表区保持当前内容（dashboard 是内容阅读态，不占列表区）。 */}
        <button
          type="button"
          className={`neo-nav-row${nav.view === 'dashboard' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'dashboard' })}
          aria-pressed={nav.view === 'dashboard'}
          data-testid="neo-nav-dashboard"
        >
          <BarChart3 size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.dashboard', { defaultValue: language === 'zh' ? '数据看板' : 'Dashboard' })}
          </span>
        </button>
        {/* 定时任务（2026-11-06，GrokBot 教程「定时任务」章节 + OpenBot /routines
            surface 对齐）：全局计划管理面入口，中栏 SchedulesPage + 左栏
            schedules 列表区。 */}
        <button
          type="button"
          className={`neo-nav-row${nav.view === 'schedules' ? ' on' : ''}`}
          onClick={() => onNavigate({ view: 'schedules' })}
          aria-pressed={nav.view === 'schedules'}
          data-testid="neo-nav-schedules"
        >
          <CalendarClock size={15} strokeWidth={1.75} aria-hidden />
          <span className="neo-nav-row-name">
            {t('neo.schedules.nav', { defaultValue: language === 'zh' ? '定时任务' : 'Schedules' })}
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
            {/* 「+ 新建」聚合入口（2026-11-06 用户反馈）：三个创建入口
                （新建 Agent / 新建项目 / 发起群聊）收进一个加号行，点加号
                弹出三项菜单（Grok/微信「+」范式，列表区收干净）。
                造 Bot 仍是最高频动作排菜单第一位。 */}
            <div className="neo-plus-wrap" ref={plusMenuRef}>
              <button
                type="button"
                className={`neo-row${plusMenuOpen ? ' on' : ''}`}
                onClick={() => setPlusMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={plusMenuOpen}
                data-testid="neo-new-plus"
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">
                  {t('neo.newPlus', { defaultValue: language === 'zh' ? '新建' : 'New' })}
                </span>
              </button>
              {plusMenuOpen && (
                <div className="neo-plus-menu" role="menu" data-testid="neo-plus-menu">
                  <button
                    type="button"
                    className="neo-row neo-plus-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setCreateAgentOpen(true);
                    }}
                    data-testid="neo-new-agent"
                  >
                    <Plus size={15} strokeWidth={1.75} aria-hidden />
                    <span className="neo-row-name">
                      {t('neo.newAgent', { defaultValue: language === 'zh' ? '新建 Agent' : 'New Agent' })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="neo-row neo-plus-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setCreateProjectOpen(true);
                    }}
                    data-testid="neo-new-project"
                  >
                    <Plus size={15} strokeWidth={1.75} aria-hidden />
                    <span className="neo-row-name">
                      {t('neo.newProject', { defaultValue: language === 'zh' ? '新建项目' : 'New Project' })}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="neo-row neo-plus-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      setCreateGroupOpen(true);
                    }}
                    data-testid="neo-new-group"
                  >
                    <UsersRound size={15} strokeWidth={1.75} aria-hidden />
                    <span className="neo-row-name">
                      {t('neo.newGroup.entry', { defaultValue: language === 'zh' ? '发起群聊' : 'New Group' })}
                    </span>
                  </button>
                </div>
              )}
            </div>
            {createProjectOpen && (
              <>
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
                        setProjectWorkspace(null);
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
                  <button
                    type="button"
                    className="neo-icon-btn"
                    onClick={pickProjectFolder}
                    title={t('neo.newProject.pickFolder', {
                      defaultValue: language === 'zh'
                        ? '选择本地文件夹作为项目目录'
                        : 'Pick a local folder for the project',
                    })}
                    aria-label={t('neo.newProject.pickFolder', {
                      defaultValue: language === 'zh'
                        ? '选择本地文件夹作为项目目录'
                        : 'Pick a local folder for the project',
                    })}
                    data-testid="neo-new-project-pick-folder"
                  >
                    <FolderOpen size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
                {projectWorkspace && (
                  <div className="neo-list-note" title={projectWorkspace}>
                    <span className="neo-list-error-text" data-testid="neo-new-project-workspace">
                      {projectWorkspace.length > 34
                        ? `…${projectWorkspace.slice(-33)}`
                        : projectWorkspace}
                    </span>
                  </div>
                )}
              </>
            )}
            {projectError && (
              <div className="neo-list-note neo-list-error">
                <span className="neo-list-error-text">{projectError}</span>
              </div>
            )}

            {/* 秘书常驻行（2026-11-06 位置调整）：「+ 新建」之下、
                项目分组之上——老板进门先看到秘书，再往下翻项目与会话。
                只渲染这一次（默认组 renderProjectBody 内不再重复）。 */}
            {renderSecretaryRow()}

            {projectSections.map(renderProjectSection)}

            {/* 默认区：未归项目的团队分组 / 散群 / 成员 DM / 孤儿成员
                (os-unified 2026-11-04：也是拖拽归组的投放目标——拖到这里 = 移回默认项目）
                侧栏一次成型批（2026-11-06）：四路数据 settle 前渲染骨架行占位，
                数据到齐后一次性原位替换——加载过程不再「空白→全量爆发」。 */}
            {railEmpty ? (
              <div className="neo-list-note">
                {t('neo.sessionsEmpty', {
                  defaultValue: language === 'zh'
                    ? '还没有其他会话，向总经理吩咐第一件事吧'
                    : 'No conversations yet — tell the GM your first task',
                })}
              </div>
            ) : homeLoading ? (
              <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')} data-testid="neo-rail-home-skeleton">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="neo-rail-sess-skeleton">
                    <span className="sf-skeleton neo-rail-skel-avatar" />
                    <span className="sf-skeleton neo-rail-skel-lines">
                      <span className="sf-skeleton neo-rail-skel-line" />
                      <span className="sf-skeleton neo-rail-skel-line neo-rail-skel-line--short" />
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                {...projectDropProps(null, 'default')}
                className={dropTargetProject === 'default' ? 'neo-drop-target' : undefined}
                style={{ borderRadius: 10 }}
                data-testid="neo-default-drop-zone"
              >
                {renderProjectBody()}
              </div>
            )}

            {/* 2026-11-04 用户反馈批：「新建 Agent」入口已前置到列表区顶部；
                「新建群聊」入口移除 —— 建群改走会话内「添加成员」（Grok 范式：
                加第二个人即成群），左栏只留造 Bot / 建项目两个创建入口。 */}
          </>
        )}

        {/* 统一知识源列表（2026-11-07 知识库统一批）：记忆库知识包，
            点行 → 中栏知识页并预选该源（sourceId 深链，rail 常驻）。
            2026-11-07 用户反馈「知识库左侧边栏要保持成员显示」：知识库导航
            不再切分区（SECTION_BY_NAV 出表，列表保持 home 成员/会话列表，
            与 schedules 2026-11-06 同款处理）——本分区渲染保留但导航不可达，
            知识源列表由知识页自带 rail（neo-kv-rail）承担。 */}
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
              (packs?.length ?? 0) === 0 && (
                <div className="neo-list-note">
                  {t('neo.knowledgeEmpty', {
                    defaultValue: language === 'zh' ? '还没有知识源' : 'No sources yet',
                  })}
                </div>
              )}
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

        {/* 定时任务列表（2026-11-06 /routines 对齐）：行 = 频率 + 任务摘要 +
            下次运行；点行进中栏管理页（启停/删除在页内做，列表区保持轻）。
            折叠态摘要：启用数/总数。 */}
        {section === 'schedules' && (
          <>
            <div className="neo-section-label">
              {t('neo.schedules.nav', { defaultValue: language === 'zh' ? '定时任务' : 'Schedules' })}
              <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
            </div>
            {schedulesState === 'loading' && (
              <div className="neo-rail-skeletons" aria-busy="true" aria-label={t('common.loading')}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sf-skeleton neo-rail-skeleton" />
                ))}
              </div>
            )}
            {schedulesState === 'error' && (
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
            {schedulesState === 'ready' && (schedules?.length ?? 0) === 0 && (
              <div className="neo-list-note" data-testid="neo-rail-schedules-empty">
                {t('neo.schedules.emptyShort', {
                  defaultValue: language === 'zh'
                    ? '还没有计划，到 Agent 主机卡片或 /schedule 新建'
                    : 'No schedules yet',
                })}
              </div>
            )}
            {schedulesState === 'ready' &&
              (schedules ?? []).map((s) => (
                <button
                  key={s.schedule_id}
                  type="button"
                  className={`neo-row${nav.view === 'schedules' ? ' on' : ''}`}
                  onClick={() => onNavigate({ view: 'schedules' })}
                  data-testid="neo-rail-schedule-row"
                  title={`${s.cron_expression || s.start_at || ''}\n${s.task_description}`}
                >
                  <CalendarClock size={15} strokeWidth={1.75} aria-hidden />
                  <span className="neo-row-name">{s.task_description || s.cron_expression || '—'}</span>
                  {s.enabled === false && (
                    <span className="neo-row-meta">
                      {t('neo.schedules.disabledShort', { defaultValue: language === 'zh' ? '停用' : 'off' })}
                    </span>
                  )}
                </button>
              ))}
            {schedulesState === 'ready' && (schedules?.length ?? 0) > 0 && (
              <button
                type="button"
                className="neo-row"
                onClick={() => onNavigate({ view: 'schedules' })}
                data-testid="neo-rail-schedules-manage"
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden />
                <span className="neo-row-name">
                  {t('neo.schedules.manageAll', {
                    defaultValue: language === 'zh' ? '管理全部…' : 'Manage all…',
                  })}
                </span>
              </button>
            )}
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

      {/* 发起群聊模态（2026-11-06 选人式重做）：成功 → 跳群聊现场 + 刷新 inbox
          （新群即时出现在列表）+ 重拉项目分组（会话可能已归属项目桶）。 */}
      {createGroupOpen && (
        <NeoCreateGroupModal
          workspaceId={workspaceId ?? null}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(g) => {
            setCreateGroupOpen(false);
            onNavigate({ view: 'conversation', groupId: g.groupId });
            void useInboxStore.getState().fetchWorkspaceInbox(workspaceId ?? null);
            setReloadTick((n) => n + 1);
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

      {/* 重命名弹窗（2026-11-04 用户反馈批）：项目/会话共用一个 NeoRenameModal，
          标题随 renameTarget.kind 区分；busy/error 由本层 patch 状态驱动。 */}
      {renameTarget && (
        <NeoRenameModal
          title={
            renameTarget.kind === 'project'
              ? t('neo.manage.renameProjectTitle', {
                  defaultValue: language === 'zh' ? '重命名项目' : 'Rename project',
                })
              : t('neo.manage.renameConversationTitle', {
                  defaultValue: language === 'zh' ? '重命名会话' : 'Rename conversation',
                })
          }
          initial={renameTarget.currentName}
          busy={renameBusy}
          error={renameError}
          onConfirm={(name) =>
            renameTarget.kind === 'project' ? confirmProjectRename(name) : confirmConversationRename(name)
          }
          onClose={() => {
            if (renameBusy) return;
            setRenameTarget(null);
            setRenameError(null);
          }}
        />
      )}

      {/* 删除确认弹窗（2026-11-04 用户反馈批）：会话/群聊/项目共用一个
          NeoConfirmModal（红色危险确认钮 + 「不可撤销」警示文案），替换
          window.confirm 原生框。busy/error 由本层删除 API 状态驱动。 */}
      {confirmTarget && (
        <NeoConfirmModal
          title={
            confirmTarget.kind === 'project'
              ? t('neo.manage.deleteProjectTitle', {
                  defaultValue: language === 'zh' ? '删除项目' : 'Delete project',
                })
              : t('neo.manage.deleteConversationTitle', {
                  defaultValue: language === 'zh' ? '删除会话' : 'Delete conversation',
                })
          }
          message={
            language === 'zh'
              ? `确定删除「${confirmTarget.name}」？此操作不可撤销`
              : `Delete "${confirmTarget.name}"? This cannot be undone`
          }
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => {
            if (confirmTarget.kind === 'project' && confirmTarget.projectId) {
              confirmProjectDelete(confirmTarget.projectId);
            } else if (confirmTarget.kind === 'conversation' && confirmTarget.groupId) {
              confirmConversationDelete(confirmTarget.groupId, confirmTarget.dmAgentId);
            }
          }}
          onClose={() => {
            if (confirmBusy) return;
            setConfirmTarget(null);
            setConfirmError(null);
          }}
        />
      )}

      {/* 2026-11-04 用户反馈批：「新建群聊」模态入口整体移除。
          Grok 里没有「先建群再选人」——在会话里加第二个人，这个会话就自然
          变成群聊（见 addGroupMembers：成员数 > 1 → kind='group'）。
          建群动作收敛到会话顶栏的「添加成员」，左栏不再放这个入口。 */}
    </nav>
  );
}
