import {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  GitBranch,
  LayoutGrid,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UserRound,
  Users,
  X,
  Zap,
  AlertTriangle,
  Clock,
  Download,
  Pin,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import "./product-app.css";
import AuthModal from "./src/AuthModal";
import EmbeddingSection from "./src/EmbeddingSection";
import CreditsUsageSection from "./src/CreditsUsageSection";
import { authGuest, authLogout, displayNameOf, initialsOf, useAuthState } from "./src/auth";
import { productBuyUrl } from "./src/shop";
import {
  ApiError,
  apiFetch,
  CHAT_UPLOAD_MAX_BYTES,
  chatAssetUrl,
  decideApproval,
  createGroup,
  createMemo,
  createProject,
  getGroupDag,
  getTeamDag,
  getTeams,
  listAgents,
  listGroups,
  listPendingApprovals,
  listMemos,
  listProjects,
  listRunSessionsByGroup,
  resolveDm,
  retryRunStep,
  setUnauthorizedHandler,
  updateMemo,
  deleteMemo,
  uploadChatAttachment,
  type AgentRecord,
  type GroupRecord,
  type PendingApprovalItem,
  type RunSessionItem,
  type SfMemo,
  type SfTeamDag as ApiTeamDag,
  type TimelineMessage,
  type UserAttachment,
} from "./src/chat-api";
import { useGroupChat, type GroupChat } from "./src/useGroupChat";
import { isTerminalRunStatus } from "./src/message-patches";
import { TimelineList, userVisibleText } from "./src/TimelineView";
import { stripMarkdown } from "./src/markdown";
import { AgentAvatar } from "./src/avatar";
import { TurnRail } from "./src/TurnRail";

/** 数据加载三态（加载中 / 成功 / 失败）：各视图状态标签统一入口，
 *  避免把「加载中」与「加载失败」混为一态而在加载过程闪现错误提示。 */
type SfLoadState = "loading" | "ready" | "error";

function SfLoadTag({ state, okText }: { state: SfLoadState; okText?: string }) {
  if (state === "loading") return <p className="sf-live-tag">加载中…</p>;
  if (state === "error") return null;
  return okText ? <p className="sf-live-tag on">{okText}</p> : null;
}

type View = "chat" | "agents" | "knowledge" | "biz" | "projects" | "schedules" | "settings";

const viewCopy: Record<Exclude<View, "chat">, { title: string; subtitle: string }> = {
  agents: { title: "Agent 团队", subtitle: "管理角色、能力与协作关系" },
  knowledge: { title: "知识库", subtitle: "管理团队共享的知识与上下文" },
  biz: { title: "生意看板", subtitle: "手工艺品代销：商品、销售、快递、社媒与盈利" },
  projects: { title: "工作备忘", subtitle: "个人日程与备忘，随手增删" },
  schedules: { title: "定时任务", subtitle: "管理所有 Agent 的周期与一次性计划" },
  settings: { title: "设置", subtitle: "模型、Skills、集成、记忆与工作空间" },
};

const quickPrompts = [
  "制定 Atlas 新品发布计划",
  "分析竞品并输出简报",
  "查看团队执行状态",
  "创建一个定时任务",
];

/** 相对时间（会话列表用）：刚刚 / N 分钟前 / N 小时前 / 昨天 / MM/DD。 */
function fmtRelativeTime(iso?: string | number | null): string {
  if (iso == null || iso === "") return "";
  const ts = typeof iso === "number" ? iso : Date.parse(String(iso));
  if (!Number.isFinite(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 172800_000) return "昨天";
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** 会话列表预览：最后一条消息内容截断（2026-11-08 协议标记行剥掉不进预览，md 语法剥平）。 */
function groupPreview(group: GroupRecord): string {
  const msgs = Array.isArray(group.messages) ? group.messages : [];
  const last = msgs[msgs.length - 1];
  const content = stripMarkdown(userVisibleText((last?.content ?? "").trim())).replace(/\s+/g, " ");
  if (!content) return "还没有消息";
  return content.length > 32 ? `${content.slice(0, 32)}…` : content;
}

/** 会话「最近活跃」时间：updated_at → 末条消息时间 → created_at 三级兜底。
 *  后端补 updated_at 之前创建的记录没有该字段，排序/时间列不能因此失真。 */
function groupActivityIso(group: GroupRecord): string | undefined {
  const msgs = Array.isArray(group.messages) ? group.messages : [];
  const last = msgs.length > 0 ? msgs[msgs.length - 1].timestamp : undefined;
  return group.updated_at || last || group.created_at;
}

/**
 * 展示口径的 6 名部门核心员工（对齐后端 .shadowflow/agents 的手工艺品代卖团队成员，
 * 由 craft-team-setup 播种；旧「AI 营销公司」seed 编制已于 2026-11-08 清理）。
 * 后端不可达时作为各视图的兜底占位数据；id 同时用作 DEMO_TEAM 的 DAG 节点 id。
 */
const agents = [
  {
    id: "MA",
    name: "市场分析师",
    role: "目标用户、市场、竞品和需求分析",
    initials: "市场",
    color: "#2777e8",
    status: "执行中",
  },
  {
    id: "BP",
    name: "品牌策划师",
    role: "品牌定位、产品卖点、品牌故事",
    initials: "品牌",
    color: "#7c5cff",
    status: "执行中",
  },
  {
    id: "CC",
    name: "内容策划师",
    role: "商品详情页、图文、短视频脚本",
    initials: "内容",
    color: "#e2603a",
    status: "已完成",
  },
  {
    id: "OPS",
    name: "运营专员",
    role: "商品资料、上架准备、店铺运营支持",
    initials: "运营",
    color: "#0ea5a4",
    status: "等待中",
  },
  {
    id: "BD",
    name: "商务专员",
    role: "企业采购材料、潜在客户筛选跟进",
    initials: "商务",
    color: "#57a04a",
    status: "等待中",
  },
  {
    id: "CR",
    name: "合规审核员",
    role: "内容合规、授权、品牌伦理和质量检查",
    initials: "合规",
    color: "#d6455e",
    status: "在线",
  },
];

/** 后端内置的调度中枢 / 服务账号不计入「AI 员工」展示（员工恒为 6 名部门核心员工）。 */
const HIDDEN_AGENT_IDS = new Set(["agent-shadow-secretary"]);

/** 「AI 员工」展示口径：API 列表过滤掉内置中枢与秘书。 */
function displayAgents(list: AgentRecord[]): AgentRecord[] {
  return list.filter((a) => !HIDDEN_AGENT_IDS.has(String(a.agent_id ?? "")));
}

// ── 拖拽图片解析（2026-11-09 修复「拖入就没反应」）──────────────────────────
// 从微信/浏览器/网页/Word 拖图片时 dataTransfer 只有 text/uri-list / text/html
// （没有 Files），需要从 URL 拉取转 File 后走既有上传链路。

/** 拖拽是否由聊天区接管：Files，或携带 text/uri-list / text/html 的图片类拖拽。 */
function isChatDragAccepted(dt: DataTransfer): boolean {
  const types: ReadonlyArray<string> = Array.from(dt.types ?? []);
  return types.includes("Files") || types.includes("text/uri-list") || types.includes("text/html");
}

/** 从 text/uri-list / text/html 解析候选图片地址（drop 时 getData 才可读）。 */
function extractDragUrls(dt: DataTransfer): string[] {
  const urls: string[] = [];
  for (const line of (dt.getData("text/uri-list") || "").split(/\r?\n/)) {
    const url = line.trim();
    if (url && !url.startsWith("#")) urls.push(url); // # 开头是 uri-list 注释行
  }
  if (urls.length === 0) {
    // 网页/微信富文本拖拽：取 <img src="..."> 的地址
    const re = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
    for (const m of (dt.getData("text/html") || "").matchAll(re)) urls.push(m[1]);
  }
  return urls.slice(0, 9); // 与单条消息 9 个附件上限对齐
}

/**
 * 拖拽 URL → File：fetch 取 blob（data: 与 http(s) 同路径）后转 File。
 * 失败抛错：FETCH_FAIL=取不到（跨域 CORS / file: / weixin: 协议受限），NOT_IMAGE=不是图片。
 */
async function dragUrlToFile(url: string, index: number): Promise<File> {
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("FETCH_FAIL");
    blob = await res.blob();
  } catch {
    // 跨域/协议受限统一按取不到处理，调用方提示改用回形针或粘贴（不许静默）
    throw new Error("FETCH_FAIL");
  }
  const extHint = /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  // 优先看 Content-Type；缺失/兜底时信 URL 扩展名（部分 CDN 回 octet-stream）
  if (!blob.type.startsWith("image/") && !(extHint && blob.size > 0)) throw new Error("NOT_IMAGE");
  const rawExt = (extHint ?? blob.type.split("/")[1] ?? "png").toLowerCase();
  const ext = rawExt === "jpeg" || rawExt === "jpg" ? "jpg" : rawExt === "svg+xml" || rawExt === "svg" ? "svg" : "png";
  return new File([blob], `拖入图片-${Date.now()}-${index}.${ext}`, {
    type: blob.type || (ext === "svg" ? "image/svg+xml" : `image/${ext}`),
  });
}

/** composer 附件条目（2026-11-07 对话框拖拽传图）：上传中/成功/失败三态可见。 */
interface ComposerAtt {
  id: string;
  name: string;
  size: number;
  isImage: boolean;
  /** 本地缩略图 object URL（上传中预览，完成后回收）。 */
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  /** 上传成功后的服务端附件（status=done）。 */
  data?: UserAttachment;
  /** 失败原因（status=error）。 */
  error?: string;
}

/**
 * 瞬断自动重试一次（2026-11-08）：网关 tsx watch 热重启 / Python 重载窗口期会出现
 * 5xx 信封（如 "upstream connect failed"）或 fetch 网络层 TypeError——这类错误请求
 * 大概率没到业务层，安全重试一次；4xx 业务错误不重试。
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const retryable =
      err instanceof TypeError ||
      (err instanceof ApiError && err.status >= 500);
    if (!retryable) throw err;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return await fn();
  }
}

export default function ProductApp() {
  const [view, setView] = useState<View>("chat");
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [detailOpen, setDetailOpen] = useState(true);
  const auth = useAuthState();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  // ── 侧边栏「新建」菜单（2026-11-08 做全）：对话/项目都接真实后端创建 ──
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuView, setNewMenuView] = useState<"root" | "project">("root");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const newMenuRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // ── 真实数据：群列表 / Agent / 项目树 ────────────────────────────────────
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [groupsState, setGroupsState] = useState<"loading" | "ready" | "error">("loading");
  const [agentsList, setAgentsList] = useState<AgentRecord[]>([]);
  const [agentsState, setAgentsState] = useState<SfLoadState>("loading");
  const [projectsTree, setProjectsTree] = useState<SfProject[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("新对话");
  const [ceoPinAvailable, setCeoPinAvailable] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const chat = useGroupChat(activeGroupId);

  // ── 聊天附件（2026-11-07 对话框拖拽传图）：拖拽/点选文件 → 上传 → 随消息发送 ──
  const [atts, setAtts] = useState<ComposerAtt[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // 内联提示（2026-11-09）：拖拽取不到图 / 失败附件拦截发送等，不许静默失败
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0); // dragenter/leave 计数，避免经过子元素时遮罩闪烁
  const attIdRef = useRef(0);
  const sendingRef = useRef(false); // submitMessage 异步窗口防重入

  // ── 连接器徽标（2026-11-10 UI 改造）：点「小红书发布」后在加号旁显示小红书
  //    图标（参考 WorkBuddy 的 +GitHub 形式），点击图标可移除 ──
  const [xhsChip, setXhsChip] = useState(false);

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setAuthOpen(true);
    setAccountMenuOpen(false);
  }

  // 401 → 弹登录框（apiFetch 全局钩子）
  useEffect(
    () => setUnauthorizedHandler(() => setAuthOpen(true)),
    [],
  );

  const reloadGroups = useCallback(async () => {
    try {
      const list = await listGroups("all");
      list.sort((a, b) => {
        const ta = Date.parse(groupActivityIso(a) ?? "") || 0;
        const tb = Date.parse(groupActivityIso(b) ?? "") || 0;
        return tb - ta;
      });
      setGroups(list);
      setGroupsState("ready");
    } catch {
      setGroupsState("error");
    }
  }, []);

  useEffect(() => {
    void reloadGroups();
    listAgents()
      .then((list) => {
        setAgentsList(list);
        setAgentsState("ready");
      })
      .catch(() => {
        setAgentsList([]);
        setAgentsState("error");
      });
    listProjects()
      .then(setProjectsTree)
      .catch(() => setProjectsTree([]));
  }, [reloadGroups]);

  // 身份切换（游客 ↔ 登录/注册）→ 旧身份的会话按归属隔离已不可再访问，
  // 清掉当前会话并重拉列表，避免 timeline 404 把界面卡死在「Group not found」
  // （2026-11-08 修「消息发不出来」的前端侧）。
  const authUserId = auth.user?.user_id ?? null;
  const prevAuthUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevAuthUserIdRef.current;
    prevAuthUserIdRef.current = authUserId;
    if (prev === undefined || prev === authUserId) return;
    setActiveGroupId(null);
    setActiveTitle("新对话");
    void reloadGroups();
  }, [authUserId, reloadGroups]);

  // 侧边栏预览/排序随消息活动刷新（2026-11-08 做全）：会话内消息变化
  // （用户发出 / Agent 回复）后防抖重拉列表，预览与「最近」排序不再
  // 滞后到手动刷新。用最后一条消息 ts 单调推进做信号，切换会话只记录
  // 不刷新（切到更旧会话 ts 不推进）。
  const lastChatActivityTsRef = useRef<number>(0);
  useEffect(() => {
    const msgs = chat.messages;
    const lastTs = msgs.length > 0 ? Number(msgs[msgs.length - 1].ts) || 0 : 0;
    if (lastTs <= lastChatActivityTsRef.current) return;
    lastChatActivityTsRef.current = lastTs;
    const timer = window.setTimeout(() => {
      void reloadGroups();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [chat.messages, reloadGroups]);

  // 点击账号区外部时收起「三个点」菜单
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountMenuOpen]);

  // 点击「新建」菜单外部收起（同账号菜单惯例）
  useEffect(() => {
    if (!newMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        setNewMenuOpen(false);
        setNewMenuView("root");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [newMenuOpen]);

  // ⌘K / Ctrl+K 聚焦搜索框（kbd 已画在输入框上，此前没接线）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setView("chat");
        setPanelOpen(true);
        window.setTimeout(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        }, 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chatStatusText = !activeGroupId
    ? "选择或新建一个会话"
    : chat.status === "loading"
      ? "正在加载会话…"
      : chat.status === "error"
        ? ""
        : chat.runs.some((r) => !isTerminalRunStatus(r.status))
          ? "Agent 团队执行中"
          : chat.typing
            ? `${chat.typing} 正在输入…`
            : "会话在线";

  const filteredConversations = useMemo(
    () =>
      groups.filter((group) =>
        `${group.name ?? ""}${groupPreview(group)}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [groups, query],
  );

  // 搜索做全（2026-11-08）：placeholder 承诺「搜索对话、项目或 Agent」，
  // 此前只过滤对话。项目按 名称/会话标题 匹配，Agent 按 名称/ID 匹配。
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectsTree;
    return projectsTree.filter((p) => {
      const sessions = Array.isArray(p.sessions) ? p.sessions : [];
      const sessionHit = sessions.some((s) => {
        const row = s as { title?: string; session_id?: string };
        return `${row.title ?? ""}${row.session_id ?? ""}`.toLowerCase().includes(q);
      });
      return `${p.name ?? ""}${p.project_id ?? ""}`.toLowerCase().includes(q) || sessionHit;
    });
  }, [projectsTree, query]);

  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list =
      agentsList.length > 0 ? displayAgents(agentsList) : (agents as unknown as AgentRecord[]);
    if (!q) return list;
    return list.filter((a) =>
      `${a.name ?? ""}${a.agent_id ?? ""}`.toLowerCase().includes(q),
    );
  }, [agentsList, query]);

  function openGroup(group: GroupRecord) {
    setActiveGroupId(group.group_id);
    setActiveTitle(group.name || "会话");
    setView("chat");
    setMobileRailOpen(false);
    if (window.innerWidth <= 820) setPanelOpen(false);
  }

  /** 「董事长」置顶：resolve DM（总经理 agent-shadow-secretary）→ 打开；失败回落第一个 agent 的 DM。 */
  async function openCeoDm() {
    const candidates = ["agent-shadow-secretary", ...agentsList.map((a) => a.agent_id)];
    for (const agentId of candidates) {
      try {
        const res = await resolveDm(agentId);
        if (res?.group_id) {
          const label = agentId === "agent-shadow-secretary" ? "董事长" : agentsList.find((a) => a.agent_id === agentId)?.name || "单聊";
          setActiveGroupId(res.group_id);
          setActiveTitle(label);
          setView("chat");
          setMobileRailOpen(false);
          void reloadGroups();
          return;
        }
      } catch {
        /* 试下一个候选 */
      }
    }
    setCeoPinAvailable(false); // 一个 agent 都没有 → 隐藏置顶行
  }

  async function openAgentDm(agent: AgentRecord) {
    try {
      const res = await resolveDm(agent.agent_id);
      if (res?.group_id) {
        setActiveGroupId(res.group_id);
        setActiveTitle(agent.name || agent.agent_id);
        setView("chat");
        setMobileRailOpen(false);
        if (window.innerWidth <= 820) setPanelOpen(false);
        void reloadGroups();
      }
    } catch {
      /* 后端不可达 —— 静默 */
    }
  }

  /**
   * 新建对话的默认成员（2026-11-08 修复「Agent 说不出话」）：此前 createGroup
   * 不带 agent_ids → 空成员群 → 后端回「[chat] No agents are members」什么都不答。
   * 默认全员入群（总经理 + 各部门），@点名 / 策略矩阵路由到对口的人。
   * 上限 8 对齐后端 MAX_FANOUT_AGENTS（超编裁剪防 422）。
   */
  async function defaultGroupAgentIds(): Promise<string[]> {
    const list =
      agentsList.length > 0 ? agentsList : await listAgents().catch(() => [] as AgentRecord[]);
    return [...new Set(list.map((a) => String(a.agent_id ?? "")).filter(Boolean))].slice(0, 8);
  }

  /** 新建对话 → POST /api/groups（真实建群）后进入。
   *  2026-11-08 做全：创建中态 + 失败可见（不再静默吞掉，之前「点了没反应」的根因）
   *  + 网关瞬断自动重试一次（tsx watch 热重启窗口期会 5xx/fetch 失败）+ 成功聚焦输入框接上发送。 */
  async function createConversation() {
    if (creatingConversation) return;
    setCreatingConversation(true);
    const name = `新对话 ${groups.length + 1}`;
    try {
      const group = await withRetry(async () =>
        createGroup({
          name: name.slice(0, 40),
          kind: "group",
          agent_ids: await defaultGroupAgentIds(),
        }),
      );
      if (group?.group_id) {
        setActiveGroupId(group.group_id);
        setActiveTitle(group.name || name);
        await reloadGroups();
        setNewMenuOpen(false);
        setNewMenuView("root");
        window.setTimeout(() => composerRef.current?.focus(), 0);
        return;
      }
      showNotice("创建对话失败：后端未返回会话 ID，请重试");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(`创建对话失败：${msg}（后端可达后可再次点击「新建」重试）`);
    } finally {
      setCreatingConversation(false);
    }
  }

  /** 新建项目 → POST /api/projects，成功刷新侧边栏项目树。 */
  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("newProjectName") as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    try {
      await withRetry(() => createProject(name));
      setNewMenuOpen(false);
      setNewMenuView("root");
      listProjects()
        .then(setProjectsTree)
        .catch(() => setProjectsTree((cur) => cur));
      showNotice(`项目「${name}」已创建`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(`创建项目失败：${msg}`);
    } finally {
      setCreatingProject(false);
    }
  }

  /**
   * 发送消息。返回 true=已发出或已排入补发；false=建群失败（调用方保留 composer 内容供重试）。
   * 无活动会话时先建群，成功后跨群补发（2026-11-08 主理人裁决：不再静默丢内容）。
   * opts：executor/model 透传预留（模型选择器已于 2026-11-10 移除，默认服务端路由）。
   */
  async function sendText(
    text: string,
    attachments?: UserAttachment[],
    opts?: { executor?: string; model?: string },
  ): Promise<boolean> {
    if (!activeGroupId) {
      const name = text.trim().slice(0, 40) || `新对话 ${groups.length + 1}`;
      try {
        const group = await createGroup({
          name,
          kind: "group",
          agent_ids: await defaultGroupAgentIds(),
        });
        if (!group?.group_id) return false;
        setActiveGroupId(group.group_id);
        setActiveTitle(group.name || name);
        await reloadGroups();
        // 建群成功 → 跨群补发（gidOverride 指向新群，消息随新会话服务端回读出现）
        void chat.send(text, attachments, group.group_id, opts);
        return true;
      } catch {
        return false; // 建群失败 → 无处可发
      }
    }
    void chat.send(text, attachments, undefined, opts);
    return true;
  }

  // ── 聊天附件（2026-11-07 对话框拖拽传图）────────────────────────────────

  /** 批量加入附件：逐个上传 /api/fs/chat-upload，单个失败不阻塞其它。 */
  function addChatFiles(files: File[]) {
    // 非失败条目计数：后端 coerceAttachments 单条消息上限 9 个附件，超出会被丢弃，前端同步拦截
    let slots = atts.filter((a) => a.status !== "error").length;
    for (const file of files) {
      const id = `att-${(attIdRef.current += 1)}`;
      const isImage =
        file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
      // 与后端守卫一致：8MB 上限；文件名不允许路径分隔符或 ..；单条消息最多 9 个附件
      const badName = /[\\/]/.test(file.name) || file.name.includes("..");
      const overCount = slots >= 9;
      if (badName || overCount || file.size > CHAT_UPLOAD_MAX_BYTES) {
        setAtts((cur) => [
          ...cur,
          {
            id,
            name: file.name,
            size: file.size,
            isImage,
            status: "error",
            error: badName
              ? "文件名含非法字符"
              : overCount
                ? "单条消息最多 9 个附件"
                : "超过 8MB 上限",
          },
        ]);
        continue;
      }
      slots += 1;
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      setAtts((cur) => [
        ...cur,
        { id, name: file.name, size: file.size, isImage, previewUrl, status: "uploading" },
      ]);
      void (async () => {
        try {
          const data = await uploadChatAttachment(file);
          patchChatAtt(id, { status: "done", data, previewUrl: undefined });
        } catch (err) {
          patchChatAtt(id, {
            status: "error",
            error: err instanceof Error ? err.message : "上传失败",
            previewUrl: undefined,
          });
        } finally {
          // 完成后回收本地预览（成功态改用服务端直链）
          if (previewUrl) URL.revokeObjectURL(previewUrl);
        }
      })();
    }
  }

  function patchChatAtt(id: string, patch: Partial<ComposerAtt>) {
    setAtts((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function removeChatAtt(id: string) {
    setAtts((cur) => {
      const hit = cur.find((a) => a.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return cur.filter((a) => a.id !== id);
    });
  }

  /** 内联提示（拖拽取不到图 / 发送被拦截）：8 秒自动收起，可手动关闭。 */
  function showNotice(text: string) {
    setNotice(text);
    if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 8000);
  }

  /** 剪贴板粘贴图片（2026-11-09）：截图/复制的图片 blob 直接进附件队列。 */
  function onChatPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f != null);
    if (files.length === 0) return;
    event.preventDefault(); // 图片粘贴不再向输入框插文本
    addChatFiles(files);
  }

  // ── 聊天框加号菜单（2026-11-08）：技能 / 连接器两级弹层，数据接后端 ──────

  type PlusView = "root" | "skills" | "connectors";
  type PlusSkill = {
    skill_id: string;
    name: string;
    description?: string;
    example_prompt?: string;
    enabled?: boolean;
  };
  type PlusConnector = {
    id: string;
    name: string;
    kind?: string;
    transport?: string;
    status?: string;
    policy?: { enabled?: boolean; approval_mode?: string };
  };
  type PlusPublishAccount = {
    id: string;
    platform: string;
    account_name?: string;
    auth_mode?: string;
    status?: string;
  };

  const [plusView, setPlusView] = useState<PlusView | null>(null);
  const [plusSkills, setPlusSkills] = useState<PlusSkill[] | null>(null);
  const [plusConnectors, setPlusConnectors] = useState<{
    connectors: PlusConnector[];
    accounts: PlusPublishAccount[];
  } | null>(null);

  /** 打开加号子菜单；首次进入拉真实数据（技能列表 / 连接器+发布通道）。 */
  function openPlusView(view: "skills" | "connectors") {
    setPlusView(view);
    if (view === "skills" && plusSkills === null) {
      sfFetch<PlusSkill[]>("/api/skills")
        .then((list) => setPlusSkills(Array.isArray(list) ? list : []))
        .catch(() => setPlusSkills([]));
    }
    if (view === "connectors" && plusConnectors === null) {
      Promise.all([
        sfFetch<{ items?: PlusConnector[] }>("/api/connectors"),
        sfFetch<{ accounts?: PlusPublishAccount[] }>("/api/social-publish/accounts"),
      ])
        .then(([c, a]) =>
          setPlusConnectors({ connectors: c.items ?? [], accounts: a.accounts ?? [] }),
        )
        .catch(() => setPlusConnectors({ connectors: [], accounts: [] }));
    }
  }

  /** 向输入框注入文本（保留已输入内容，换行衔接）并收起菜单。 */
  function insertIntoComposer(text: string) {
    setMessage((cur) => (cur.trim() ? `${cur.replace(/\n+$/, "")}\n${text}` : text));
    setPlusView(null);
  }

  /** 技能启用/停用（PATCH /api/skills/:id/enabled）。 */
  async function togglePlusSkill(row: PlusSkill) {
    const enabled = !(row.enabled ?? true);
    try {
      await sfFetch(`/api/skills/${encodeURIComponent(row.skill_id)}/enabled`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setPlusSkills(
        (cur) => cur?.map((s) => (s.skill_id === row.skill_id ? { ...s, enabled } : s)) ?? null,
      );
    } catch {
      /* 失败保持原状态 */
    }
  }

  /** 连接器启用/停用（POST /api/connectors/:id/policy，执行前裁定+留痕）。 */
  async function togglePlusConnector(row: PlusConnector) {
    const enabled = !(row.policy?.enabled ?? true);
    try {
      await sfFetch(`/api/connectors/${encodeURIComponent(row.id)}/policy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setPlusConnectors(
        (cur) =>
          cur && {
            ...cur,
            connectors: cur.connectors.map((c) =>
              c.id === row.id ? { ...c, policy: { ...(c.policy ?? {}), enabled } } : c,
            ),
          },
      );
    } catch {
      /* 失败保持原状态 */
    }
  }

  /**
   * 拖拽接管（2026-11-09 修复「拖入就没反应」）：除 Files 外，还接受携带
   * text/uri-list / text/html 的图片拖拽（微信/浏览器/网页/Word 拖图时
   * dataTransfer 没有 Files，此前守卫静默返回 → 遮罩与 drop 全部失效）。
   * enter/leave 计数防闪烁。
   */
  function onChatDragEnter(event: ReactDragEvent) {
    if (!isChatDragAccepted(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  }

  function onChatDragOver(event: ReactDragEvent) {
    if (!isChatDragAccepted(event.dataTransfer)) return;
    event.preventDefault(); // 必须阻止默认行为，否则浏览器直接打开文件/图片
    event.dataTransfer.dropEffect = "copy";
  }

  function onChatDragLeave(event: ReactDragEvent) {
    if (!isChatDragAccepted(event.dataTransfer)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }

  /**
   * 拖放处理：优先 dataTransfer.files；为空则从 text/uri-list / text/html 解析
   * 图片 URL，fetch 拿 blob 转 File 后走既有 addChatFiles。取不到图/识别不了
   * 都给可见内联提示，不许静默。
   */
  function onChatDrop(event: ReactDragEvent) {
    const dt = event.dataTransfer;
    const files = Array.from(dt.files ?? []);
    const urls = files.length === 0 ? extractDragUrls(dt) : [];
    dragDepthRef.current = 0;
    setDragOver(false);
    if (files.length === 0 && urls.length === 0) {
      // 无文件也无 URL（纯文本拖放）：只提示不接管，交还浏览器默认行为
      //（如向输入框插入文字，preventDefault 会把这类插入一并吞掉）
      if (isChatDragAccepted(dt)) {
        showNotice("未识别到可上传的图片，请改用回形针按钮或截图后粘贴");
      }
      return;
    }
    event.preventDefault(); // 必须阻止：否则浏览器直接打开/导航到拖入的图片 URL
    if (files.length > 0) {
      addChatFiles(files);
      return;
    }
    void (async () => {
      const converted: File[] = [];
      for (let i = 0; i < urls.length; i += 1) {
        try {
          converted.push(await dragUrlToFile(urls[i], i));
        } catch (err) {
          // 跨域取不到/内容不是图片 → 明确告诉用户换姿势，不许静默
          showNotice(
            err instanceof Error && err.message === "NOT_IMAGE"
              ? "拖入的内容不是图片，仅支持图片文件"
              : "无法获取该图片，请改用回形针按钮或截图后粘贴",
          );
        }
      }
      if (converted.length > 0) addChatFiles(converted);
    })();
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    // 上传完成前不发送，防丢附件
    if (atts.some((a) => a.status === "uploading")) return;
    // 失败附件拦截发送（2026-11-09）：此前 error chip 被静默丢弃，用户以为图已发出
    if (atts.some((a) => a.status === "error")) {
      showNotice("有附件上传失败（红标），请移除后重试，或改用回形针重新上传");
      return;
    }
    const ready = atts.flatMap((a) => (a.data ? [a.data] : []));
    if (!message.trim() && ready.length === 0) return;
    if (sendingRef.current) return; // 建群补发路径有异步窗口，防回车连发重复建群
    sendingRef.current = true;
    try {
      // 小红书徽标点亮时（2026-11-10）：发送自动套 [post] 标记，协议 JSON 不暴露给用户。
      // 已含 craft 标记的消息不重复包装；title 取首行（截 30 字），正文为全文。
      const raw = message.trim();
      const outbound =
        xhsChip && raw && !/\[(post|draft|link|order|ship|intake|report)\]/.test(raw)
          ? `[post] ${JSON.stringify({ platform: "小红书", title: raw.split("\n")[0].slice(0, 30), text: raw })}`
          : raw;
      // 发出/排入补发才清空 composer；失败保留输入与附件 chips 供重试（2026-11-08 主理人裁决）
      const ok = await sendText(outbound, ready.length > 0 ? ready : undefined);
      if (ok) {
        setMessage("");
        setXhsChip(false); // 一次性激活：发完即灭，防后续消息误发成笔记
        // 仅清理已发出的 done 附件，其余保留（2026-11-09，不再一刀切清空）
        setAtts((cur) => cur.filter((a) => a.status !== "done"));
        setNotice(null); // 发送成功即收起旧拦截提示，不再等 8 秒自动消失（2026-11-09 回归打磨）
      }
    } finally {
      sendingRef.current = false;
    }
  }

  function navigate(nextView: View) {
    setView(nextView);
    setMobileRailOpen(false);
  }

  return (
    <div className="sf-app">
      <aside className={`sf-rail ${mobileRailOpen ? "open" : ""}`}>
        <div className="sf-rail-head">
          <a className="sf-product-brand" href="#/" aria-label="返回 ShadowFlow 官网">
            <ProductLogo />
            <span>ShadowFlow</span>
          </a>
          <button
            className="sf-mobile-close"
            onClick={() => setMobileRailOpen(false)}
            aria-label="关闭导航"
          >
            <X size={18} />
          </button>
        </div>

        <div className="sf-dialogue-wrap">
          <button
            className={`sf-dialogue-button ${view === "chat" ? "active" : ""}`}
            onClick={() => {
              if (view !== "chat") {
                setView("chat");
                setPanelOpen(true);
              } else {
                setPanelOpen(!panelOpen);
              }
            }}
            aria-expanded={view === "chat" && panelOpen}
          >
            <MessageSquare size={17} />
            <span>对话</span>
            <ChevronDown size={15} />
          </button>
        </div>

        <nav className="sf-primary-nav">
          <button className={view === "agents" ? "active" : ""} onClick={() => navigate("agents")}>
            <Users size={17} />
            <span>Agent 团队</span>
            {agentsList.length > 0 && <span className="sf-count">{displayAgents(agentsList).length}</span>}
          </button>
          <button
            className={view === "knowledge" ? "active" : ""}
            onClick={() => navigate("knowledge")}
          >
            <BookOpen size={17} />
            <span>知识库</span>
          </button>
          <button className={view === "biz" ? "active" : ""} onClick={() => navigate("biz")}>
            <Store size={17} />
            <span>生意看板</span>
          </button>
        </nav>

        <div className="sf-rail-section">
          <p>工作空间</p>
          <button
            className={view === "projects" ? "active" : ""}
            onClick={() => navigate("projects")}
          >
            <LayoutGrid size={15} />
            <span>备忘</span>
          </button>
          <button
            className={view === "schedules" ? "active" : ""}
            onClick={() => navigate("schedules")}
          >
            <CalendarClock size={15} />
            <span>定时任务</span>
          </button>
        </div>

        <div className="sf-rail-foot">
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings size={16} />
            <span>设置</span>
          </button>
          {auth.user ? (
            <div className="sf-account sf-account--user" ref={accountRef}>
              <button
                className="sf-account-main"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                aria-expanded={accountMenuOpen}
              >
                <span>{initialsOf(auth.user)}</span>
                <div>
                  <strong>{displayNameOf(auth.user)}</strong>
                  <small>{auth.user.email || auth.user.address || "已登录"}</small>
                </div>
              </button>
              <button
                className="sf-account-dots"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                aria-label="账号菜单"
              >
                <MoreHorizontal size={15} />
              </button>
              {accountMenuOpen && (
                <div className="sf-account-menu" role="menu">
                  <p>{auth.user.email || auth.user.address}</p>
                  {auth.user.auth_type === "guest" && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        openAuth("login");
                      }}
                    >
                      <UserRound size={13} /> 登录 / 注册
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      void authLogout();
                    }}
                  >
                    <LogOut size={13} /> 退出登录
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="sf-account sf-account--guest" onClick={() => openAuth("login")}>
              <span>
                <UserRound size={15} />
              </span>
              <div>
                <strong>登录 / 注册</strong>
                <small>当前为演示模式</small>
              </div>
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </aside>

      {view === "chat" && panelOpen && (
        <button
          className="sf-panel-overlay"
          onClick={() => setPanelOpen(false)}
          aria-label="关闭对话面板"
        />
      )}

      {mobileRailOpen && (
        <button
          className="sf-mobile-overlay"
          onClick={() => setMobileRailOpen(false)}
          aria-label="关闭导航"
        />
      )}

      <main className="sf-main">
        <header className="sf-topbar">
          <div>
            <button
              className="sf-mobile-menu"
              onClick={() => setMobileRailOpen(true)}
              aria-label="打开导航"
            >
              <Menu size={19} />
            </button>
            {view === "chat" ? (
              <>
                <button className="sf-history" onClick={() => setPanelOpen(!panelOpen)}>
                  <ArrowLeft size={15} />
                </button>
                <div className="sf-title-block">
                  <strong>{activeTitle}</strong>
                  <span>
                    <i /> {chatStatusText}
                  </span>
                </div>
              </>
            ) : (
              <div className="sf-title-block">
                <strong>{viewCopy[view].title}</strong>
                <span>{viewCopy[view].subtitle}</span>
              </div>
            )}
          </div>
          <div className="sf-top-actions">
            {view === "chat" && (
              <button className="sf-members">
                {(() => {
                  const group = groups.find((g) => g.group_id === activeGroupId);
                  const ids = group?.agent_ids ?? [];
                  const members = ids
                    .map((id) => agentsList.find((a) => a.agent_id === id))
                    .filter(Boolean)
                    .slice(0, 3) as AgentRecord[];
                  if (members.length === 0) return <span>董</span>;
                  return members.map((m) => (
                    <span key={m.agent_id}>{(m.name || m.agent_id).slice(0, 1)}</span>
                  ));
                })()}
              </button>
            )}
            <button>
              <MoreHorizontal size={18} />
            </button>
            {view === "chat" && (
              <button className="sf-detail-toggle" onClick={() => setDetailOpen(!detailOpen)}>
                执行详情
              </button>
            )}
          </div>
        </header>

        {auth.ready && !auth.user && (
          <div className="sf-login-banner" role="status">
            <ShieldCheck size={15} />
            <div>
              <strong>请先登录以使用真实工作台数据</strong>
              <small>当前为演示模式 —— 界面可浏览，数据将在登录后与后端打通</small>
            </div>
            <button onClick={() => void authGuest()}>游客体验</button>
            <button onClick={() => openAuth("login")}>登录</button>
            <button className="ghost" onClick={() => openAuth("register")}>
              注册
            </button>
          </div>
        )}

        {view === "chat" && (
          <div
            className={`sf-chat-layout ${panelOpen ? "" : "panel-closed"}`}
          >
            {panelOpen && (
              <aside className="sf-thread-panel">
                <div className="sf-drawer-head">
                  <div>
                    <span>
                      <MessageSquare size={14} />
                    </span>
                    <div>
                      <strong>对话</strong>
                      <small>搜索、新建或继续任何会话</small>
                    </div>
                  </div>
                  <button onClick={() => setPanelOpen(false)} aria-label="收起对话面板">
                    <X size={15} />
                  </button>
                </div>
                <div className="sf-new-wrap" ref={newMenuRef}>
                  <button
                    className="sf-new-chat"
                    onClick={() => setNewMenuOpen((v) => !v)}
                    aria-expanded={newMenuOpen}
                    aria-haspopup="menu"
                  >
                    <Plus size={12} />
                    <span>新建</span>
                    <ChevronDown size={12} className="sf-new-caret" />
                  </button>
                  {newMenuOpen && (
                    <>
                      <button
                        className="sf-plus-backdrop"
                        aria-label="关闭新建菜单"
                        onClick={() => {
                          setNewMenuOpen(false);
                          setNewMenuView("root");
                        }}
                      />
                      <div className="sf-new-menu" role="menu">
                        {newMenuView === "root" ? (
                          <>
                            <button
                              type="button"
                              className="sf-plus-item"
                              role="menuitem"
                              disabled={creatingConversation}
                              onClick={() => void createConversation()}
                            >
                              <MessageSquare size={14} />
                              <span>{creatingConversation ? "创建中…" : "新建对话"}</span>
                            </button>
                            <button
                              type="button"
                              className="sf-plus-item"
                              role="menuitem"
                              onClick={() => setNewMenuView("project")}
                            >
                              <Folder size={14} />
                              <span>新建项目</span>
                              <ChevronRight size={13} className="sf-plus-chev" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="sf-plus-item sf-plus-head"
                              onClick={() => setNewMenuView("root")}
                            >
                              <ChevronLeft size={13} />
                              <span>新建项目</span>
                            </button>
                            <form className="sf-new-form" onSubmit={handleCreateProject}>
                              <input
                                autoFocus
                                required
                                name="newProjectName"
                                maxLength={60}
                                placeholder="输入项目名称"
                                disabled={creatingProject}
                              />
                              <button type="submit" disabled={creatingProject}>
                                {creatingProject ? "创建中…" : "创建"}
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <label className="sf-search">
                  <Search size={13} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索对话、项目或 Agent"
                  />
                  <kbd>⌘K</kbd>
                </label>
                {ceoPinAvailable && (
                  <button
                    className={`sf-ceo-pin ${activeTitle === "董事长" ? "active" : ""}`}
                    onClick={() => void openCeoDm()}
                  >
                    <AgentAvatar label="CEO" color="#ff5e3a" size="lg" />
                    <div>
                      <strong>董事长</strong>
                      <small>全局调度 · 任务拆解与决策</small>
                    </div>
                    <i />
                  </button>
                )}
                <p>最近对话</p>
                <div className="sf-conversation-list">
                  {groupsState === "loading" && <p className="sf-thread-hint">正在加载会话…</p>}
                  {groupsState === "error" && (
                    <p className="sf-thread-hint">
                      <button type="button" className="sf-link-btn" onClick={() => void reloadGroups()}>
                        重试
                      </button>
                    </p>
                  )}
                  {groupsState === "ready" && filteredConversations.length === 0 && (
                    <p className="sf-thread-hint">
                      {groups.length === 0
                        ? "还没有会话 —— 点「新建」或用下面的快捷指令开始。"
                        : "没有匹配的会话"}
                    </p>
                  )}
                  {filteredConversations.map((group) => (
                    <button
                      key={group.group_id}
                      className={activeGroupId === group.group_id ? "active" : ""}
                      onClick={() => openGroup(group)}
                    >
                      <span className="sf-conversation-icon">
                        <MessageSquare size={12} />
                        {group.kind === "dm" && <i />}
                      </span>
                      <span>
                        <strong>{group.name || "未命名会话"}</strong>
                        <small>{groupPreview(group)}</small>
                      </span>
                      <time>{fmtRelativeTime(groupActivityIso(group))}</time>
                    </button>
                  ))}
                </div>
                <p>项目与 Agent</p>
                <div className="sf-project-tree">
                  {projectsTree.length === 0 && agentsList.length === 0 && (
                    <p className="sf-thread-hint">暂无项目与 Agent（尚未创建）</p>
                  )}
                  {query.trim() &&
                    projectsTree.length + agentsList.length > 0 &&
                    filteredProjects.length === 0 &&
                    filteredAgents.length === 0 && (
                      <p className="sf-thread-hint">没有匹配的项目或 Agent</p>
                    )}
                  {filteredProjects.map((project) => {
                    const expanded = !!expandedProjects[project.project_id];
                    const sessions = Array.isArray(project.sessions) ? project.sessions : [];
                    return (
                      <Fragment key={project.project_id}>
                        <button
                          className="sf-folder-row"
                          onClick={() =>
                            setExpandedProjects((all) => ({
                              ...all,
                              [project.project_id]: !expanded,
                            }))
                          }
                          aria-expanded={expanded}
                        >
                          <ChevronRight size={12} className={expanded ? "sf-rot90" : ""} />
                          <Folder size={13} />
                          <span>{project.name || project.project_id}</span>
                          {sessions.length > 0 && <em className="sf-tree-count">{sessions.length}</em>}
                        </button>
                        {expanded &&
                          (sessions.length === 0 ? (
                            <p className="sf-thread-hint sf-tree-empty">暂无会话</p>
                          ) : (
                            sessions.map((session, idx) => {
                              const s = session as { session_id?: string; status?: string; title?: string };
                              return (
                                <div className="sf-session-row" key={s.session_id ?? idx}>
                                  <span />
                                  <p>
                                    {s.title || s.session_id || `会话 ${idx + 1}`}
                                    {s.status ? ` · ${s.status}` : ""}
                                  </p>
                                </div>
                              );
                            })
                          ))}
                      </Fragment>
                    );
                  })}
                  {filteredAgents.map((agent) => (
                    <button
                      className="sf-agent-tree-row"
                      key={agent.agent_id ?? agent.name}
                      onClick={() => void openAgentDm(agent)}
                      title="点击打开单聊"
                    >
                      <AgentAvatar
                        label={(agent.name || agent.agent_id || "?").slice(0, 2).toUpperCase()}
                        color={
                          agents.find((a) => a.name === agent.name)?.color ??
                          SF_PALETTE[(agent.name ?? "").length % SF_PALETTE.length]
                        }
                        small
                      />
                      <span>
                        <strong>{agent.name || agent.agent_id}</strong>
                        <small>{agent.soul || agent.role || "Agent"}</small>
                      </span>
                      <i className={agent.status === "执行中" ? "working" : ""} />
                    </button>
                  ))}
                </div>
              </aside>
            )}
            <section
              className="sf-chat"
              onDragEnter={onChatDragEnter}
              onDragOver={onChatDragOver}
              onDragLeave={onChatDragLeave}
              onDrop={onChatDrop}
            >
              <div className="sf-chat-scroll sf-thread-enter" key={activeGroupId ?? "none"}>
                <ChatThread chat={chat} onQuick={sendText} onLogin={() => openAuth("login")} />
              </div>

              <TurnRail messages={chat.messages} />

              {/* 任务面板 + 输入框一体化底座（2026-11-08 UI 改造）：
                  上层任务执行状态面板（受顶栏「执行详情」开关联动），下层原输入框 */}
              <div className="sf-composer-dock">
                {detailOpen && (
                  <TaskStatusPanel
                    groupId={activeGroupId}
                    groupName={activeTitle}
                    chat={chat}
                    agentsList={agentsList}
                    agentsState={agentsState}
                    onClose={() => setDetailOpen(false)}
                  />
                )}
              <form className="sf-composer" onSubmit={submitMessage}>
                {notice && (
                  <p className="sf-composer-notice" role="alert">
                    <AlertTriangle size={12} />
                    <span>{notice}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示">
                      <X size={11} />
                    </button>
                  </p>
                )}
                {atts.length > 0 && (
                  <div className="sf-composer-atts">
                    {atts.map((a) => (
                      <div key={a.id} className={`sf-att-chip ${a.status}`}>
                        {a.data?.is_image ? (
                          <img src={chatAssetUrl(a.data.url)} alt="" />
                        ) : a.status === "uploading" && a.isImage && a.previewUrl ? (
                          <img src={a.previewUrl} alt="" />
                        ) : (
                          <FileText size={13} />
                        )}
                        <span title={a.name}>{a.name}</span>
                        {a.status === "uploading" && <em className="sf-att-up">上传中…</em>}
                        {a.status === "error" && (
                          <em className="sf-att-err" title={a.error}>
                            {a.error || "失败"}
                          </em>
                        )}
                        <button
                          type="button"
                          onClick={() => removeChatAtt(a.id)}
                          aria-label={`移除附件 ${a.name}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onPaste={onChatPaste}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={
                    activeGroupId
                      ? "继续这个会话，或给团队下发新任务…"
                      : "告诉团队接下来要做什么…"
                  }
                />
                <div>
                  <span className="sf-composer-tools">
                    {/* 加号置最左（2026-11-10）；连接器激活后旁侧显示小红书徽标（参考 WorkBuddy +GitHub 形式） */}
                    <button
                      type="button"
                      aria-label="更多"
                      className={plusView ? "sf-plus-trigger open" : "sf-plus-trigger"}
                      onClick={() => setPlusView(plusView ? null : "root")}
                    >
                      <Plus size={15} />
                    </button>
                    {xhsChip && (
                      <button
                        type="button"
                        className="sf-conn-chip"
                        aria-label="小红书发布已就绪（点击移除）"
                        title="小红书发布已就绪 · 点击移除"
                        onClick={() => setXhsChip(false)}
                      >
                        <XhsIcon size={17} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="添加附件"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={16} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => {
                        const picked = Array.from(event.currentTarget.files ?? []);
                        if (picked.length > 0) addChatFiles(picked);
                        event.currentTarget.value = ""; // 允许重复选同一文件
                      }}
                    />
                    {plusView && (
                      <>
                        <div
                          className="sf-plus-backdrop"
                          aria-hidden="true"
                          onClick={() => setPlusView(null)}
                        />
                        <div className="sf-plus-menu" role="menu">
                          {plusView === "root" && (
                            <>
                              <button
                                type="button"
                                className="sf-plus-item"
                                role="menuitem"
                                onClick={() => openPlusView("skills")}
                              >
                                <Sparkles size={14} />
                                <span>技能</span>
                                <ChevronRight size={13} className="sf-plus-chev" />
                              </button>
                              <button
                                type="button"
                                className="sf-plus-item"
                                role="menuitem"
                                onClick={() => openPlusView("connectors")}
                              >
                                <Link2 size={14} />
                                <span>连接器</span>
                                <ChevronRight size={13} className="sf-plus-chev" />
                              </button>
                            </>
                          )}
                          {plusView === "skills" && (
                            <>
                              <button
                                type="button"
                                className="sf-plus-item sf-plus-head"
                                onClick={() => setPlusView("root")}
                              >
                                <ChevronLeft size={13} />
                                <span>技能</span>
                              </button>
                              {plusSkills === null && <p className="sf-plus-note">加载中…</p>}
                              {plusSkills?.length === 0 && <p className="sf-plus-note">暂无技能</p>}
                              {plusSkills?.map((s) => (
                                <div key={s.skill_id} className="sf-plus-row">
                                  <button
                                    type="button"
                                    className="sf-plus-row-main"
                                    title={s.description || s.skill_id}
                                    onClick={() =>
                                      insertIntoComposer(
                                        s.example_prompt?.trim() || `【技能】${s.name || s.skill_id}`,
                                      )
                                    }
                                  >
                                    <strong>{s.name || s.skill_id}</strong>
                                    <small>{s.description || s.skill_id}</small>
                                  </button>
                                  <button
                                    type="button"
                                    className={s.enabled === false ? "sf-plus-tag off" : "sf-plus-tag"}
                                    title={s.enabled === false ? "点击启用" : "点击停用"}
                                    onClick={() => void togglePlusSkill(s)}
                                  >
                                    {s.enabled === false ? "停用" : "启用"}
                                  </button>
                                </div>
                              ))}
                            </>
                          )}
                          {plusView === "connectors" && (
                            <>
                              <button
                                type="button"
                                className="sf-plus-item sf-plus-head"
                                onClick={() => setPlusView("root")}
                              >
                                <ChevronLeft size={13} />
                                <span>连接器</span>
                              </button>
                              <p className="sf-plus-group">发布通道</p>
                              {plusConnectors === null && <p className="sf-plus-note">加载中…</p>}
                              {(() => {
                                const xhsAccounts = plusConnectors?.accounts.filter((a) =>
                                  a.platform.includes("xiaohongshu"),
                                );
                                const xhs =
                                  xhsAccounts?.find((a) => a.auth_mode === "real") ?? xhsAccounts?.[0];
                                const xhsStatus = xhs
                                  ? `${xhs.auth_mode === "real" ? "真实发布" : "mock 演示"}${xhs.account_name ? ` · ${xhs.account_name}` : ""}`
                                  : "未配置账号 · 默认 mock 演示";
                                return (
                                  <div className="sf-plus-row">
                                    <button
                                      type="button"
                                      className="sf-plus-row-main"
                                      title="点亮后，输入的内容将以小红书笔记直接发布（不再显示协议文本）"
                                      onClick={() => {
                                        setXhsChip(true); // 只点亮徽标，不往输入框塞 [post] JSON（2026-11-10）
                                        setPlusView(null);
                                      }}
                                    >
                                      <strong>小红书发布</strong>
                                      <small>{xhsStatus}</small>
                                    </button>
                                    <span className="sf-plus-tag">发帖</span>
                                  </div>
                                );
                              })()}
                              <p className="sf-plus-group">MCP / ACP</p>
                              {plusConnectors?.connectors.length === 0 && (
                                <p className="sf-plus-note">未检测到连接器</p>
                              )}
                              {plusConnectors?.connectors.map((c) => {
                                const on = c.policy?.enabled ?? true;
                                return (
                                  <div key={c.id} className="sf-plus-row">
                                    <div className="sf-plus-row-main static" title={c.id}>
                                      <strong>{c.name || c.id}</strong>
                                      <small>
                                        {c.kind ?? "connector"} · {c.status ?? "未知状态"} ·{" "}
                                        {c.policy?.approval_mode ?? "auto"}
                                      </small>
                                    </div>
                                    <button
                                      type="button"
                                      className={on ? "sf-plus-tag" : "sf-plus-tag off"}
                                      title={on ? "点击停用" : "点击启用"}
                                      onClick={() => void togglePlusConnector(c)}
                                    >
                                      {on ? "启用" : "停用"}
                                    </button>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </span>
                  <span>
                    <small>Enter 发送 · Shift + Enter 换行</small>
                    <button
                      className="sf-send"
                      type="submit"
                      disabled={
                        (!message.trim() && !atts.some((a) => a.status === "done")) ||
                        atts.some((a) => a.status === "uploading")
                      }
                      aria-label="发送"
                    >
                      <Send size={15} />
                    </button>
                  </span>
                </div>
              </form>
              </div>

              {dragOver && (
                <div className="sf-drop-overlay" aria-hidden="true">
                  <Paperclip size={22} />
                  <strong>松开以上传</strong>
                  <small>单个文件不超过 8MB</small>
                </div>
              )}
            </section>
          </div>
        )}

        {view === "agents" && <AgentsView />}
        {view === "knowledge" && <KnowledgeView />}
        {view === "biz" && (
          <BizView
            // 看板同步（2026-11-09）：run 状态签名变化（一轮干完/新任务开跑）→ 静默刷新
            runsSig={chat.runs.map((r) => `${r.session_id}:${r.status}`).join("|")}
          />
        )}
        {view === "projects" && <MemosView />}
        {view === "schedules" && <SchedulesView />}
        {view === "settings" && <SettingsView />}
      </main>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </div>
  );
}


const RUN_STATUS_TEXT: Record<string, string> = {
  done: "已完成",
  running: "执行中",
  pending: "等待中",
  failed: "失败",
};

type RunStep = {
  name: string;
  status: "done" | "running" | "pending" | "failed";
  meta: string;
  substeps: { agent: string; slot: string; status: "done" | "running" | "pending" | "failed" }[];
};

type ApprovalItem = {
  id: string;
  /** 审批节点 id（POST /api/groups/:id/approvals/:nodeId 的 :nodeId）。 */
  nodeId?: string;
  from: string;
  label: string;
  color: string;
  summary: string;
  when: string;
  state: "pending" | "approved" | "rejected";
  /** 驳回原因（可选） */
  reason?: string;
  /** 通过时附带的补充命令 / 说明（可选） */
  note?: string;
  /** 审批对象 —— 明确「到底在审批什么」 */
  kind: string;
  target: string;
  detail: string;
  impact: string;
};

type ArtifactItem = {
  id: string;
  name: string;
  type: string;
  summary: string;
  size: string;
  pinned: boolean;
  url?: string;
};

function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** timeline step_panel/plan_card → 步骤列表（无运行数据 → 空数组=空态）。
 *  status 归一：done/running/failed 保留，其余（pending/blocked）按等待处理。 */
function deriveSteps(messages: TimelineMessage[]): RunStep[] {
  const mapStatus = (s: string | undefined): RunStep["status"] =>
    s === "done" ? "done" : s === "running" ? "running" : s === "failed" ? "failed" : "pending";
  const panel = [...messages]
    .reverse()
    .find((m) => m.kind === "step_panel" && (m.steps ?? []).length > 0);
  if (panel) {
    return (panel.steps ?? []).map((s) => {
      const status = mapStatus(s.status);
      return {
        name: s.name,
        status,
        meta: s.elapsed_ms != null ? fmtElapsed(s.elapsed_ms) : status === "pending" ? "等待中" : status === "failed" ? "失败" : "",
        substeps: (s.substeps ?? []).map((sub) => ({
          agent: sub.name,
          slot: "",
          status: mapStatus(sub.status),
        })),
      };
    });
  }
  const plan = [...messages]
    .reverse()
    .find((m) => m.kind === "plan_card" && (m.tasks ?? []).length > 0);
  if (plan) {
    return (plan.tasks ?? []).map((t) => ({
      name: t.title,
      status: mapStatus(t.status),
      meta: t.assignee || t.agent_id || "",
      substeps: [],
    }));
  }
  return [];
}

/** timeline diff/commit/artifact 归并为产物列表。 */
function deriveArtifacts(messages: TimelineMessage[]): ArtifactItem[] {
  const out: ArtifactItem[] = [];
  for (const m of messages) {
    if (m.kind === "diff_panel" || m.kind === "file_diff") {
      out.push({
        id: m.id,
        name: m.filename ?? m.path ?? "diff",
        type: "diff",
        summary: `+${m.added ?? 0} −${m.removed ?? 0}`,
        size: `${(m.lines ?? []).length} 行`,
        pinned: false,
      });
    } else if (m.kind === "commit_record") {
      out.push({
        id: m.id,
        name: `${m.short_sha ?? ""} ${m.message ?? ""}`.trim() || "commit",
        type: "commit",
        summary: `${m.repo ?? ""}${m.author ? ` · ${m.author}` : ""}`,
        size: `${m.files_changed ?? 0} 文件`,
        pinned: false,
        url: m.url,
      });
    } else if (m.kind === "artifact_card") {
      out.push({
        id: m.id,
        name: m.filename ?? m.title ?? "artifact",
        type: m.artifact_type ?? "file",
        summary: m.note ?? "",
        size: "",
        pinned: false,
        url: m.url,
      });
    }
  }
  return out;
}

/** msg_foot/status_line/tool_call 归并为运行统计。 */
function deriveRunStats(messages: TimelineMessage[]): {
  status: string;
  elapsedMs: number;
  tools: number;
  tokens: number;
  cost: number;
} {
  const foot = [...messages].reverse().find((m) => m.kind === "msg_foot");
  const statusLine = [...messages].reverse().find((m) => m.kind === "status_line");
  const toolCount = messages.filter((m) => m.kind === "tool_call").length;
  return {
    status: foot?.status === "done" ? "done" : statusLine && !statusLine.terminal ? "running" : (foot?.status ?? "idle"),
    elapsedMs: foot?.elapsed_ms ?? (statusLine?.elapsed_s != null ? statusLine.elapsed_s * 1000 : 0),
    tools: foot?.tools ?? toolCount,
    tokens: foot?.tokens ?? 0,
    cost: foot?.cost_cny ?? 0,
  };
}

/** apiGet 的宽接口 DAG → 本地强类型 DAG（mode 归一、字段兜底）。 */
function normalizeDag(d: ApiTeamDag): SfTeamDag {
  return {
    team_id: d.team_id ?? "",
    name: d.name ?? "",
    members: d.members ?? [],
    resolved_agents: (d.resolved_agents ?? []).map((a) => ({
      id: a.id,
      title: a.title ?? a.id,
      sub: a.sub,
    })),
    edges: (d.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
      mode: e.mode ?? e.data?.mode,
      data: e.data,
    })),
    policy: (d.policy ?? null) as PolicyMatrix | null,
  };
}

/** GET /api/groups/:id/approvals/pending 的条目 → UI 审批卡。 */
function normalizeApproval(item: PendingApprovalItem, idx: number): ApprovalItem {
  const id = String(item.approval_id ?? item.id ?? item.gate_id ?? item.node_id ?? `ap-${idx}`);
  const nodeId = String(item.node_id ?? item.gate_id ?? item.approval_id ?? id);
  const name = item.submitter_name || "Agent";
  return {
    id,
    nodeId,
    from: name,
    label: name.slice(0, 2).toUpperCase(),
    color: SF_PALETTE[name.length % SF_PALETTE.length],
    summary: item.summary || `${item.kind ?? "审批"} · ${item.target ?? id}`,
    when: item.waiting_seconds != null ? `已等待 ${fmtElapsed(item.waiting_seconds * 1000)}` : "等待中",
    state: "pending",
    kind: String(item.kind ?? "审批"),
    target: String(item.target ?? id),
    detail: String(item.detail ?? ""),
    impact: String(item.impact ?? ""),
  };
}

/** 群 DAG（或回落团队 DAG）的紧凑竖排渲染（复用 sf-dag-rail 样式）。 */
function SfDagRail({ dag }: { dag: SfTeamDag }) {
  const nodes = dag.resolved_agents.length
    ? dag.resolved_agents
    : (dag.members ?? []).map((id) => ({ id, title: id }));
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id;
  return (
    <div className="sf-dag-rail">
      {nodes.map((node, idx) => {
        const outs = dag.edges.filter((e) => e.source === node.id);
        return (
          <div key={node.id}>
            <div className="sf-dag-node">
              <span className={idx === 0 ? "entry" : ""} />
              <strong>{node.title || node.id}</strong>
              <em>{outs.some((e) => (e.mode ?? e.data?.mode) === "approve") ? "approve · 人工门" : "task"}</em>
            </div>
            {outs.map((e, i) => (
              <p className="sf-dag-edge" key={`${e.target}-${i}`}>
                ↓ {e.mode ?? e.data?.mode ?? "direct"} · {titleOf(e.target)}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** 某 agent 在时间线里的最近活动（团队 tab 展开卡）。 */
function lastActivityOf(messages: TimelineMessage[], name: string): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.agent_name !== name && m.sender_name !== name) continue;
    if (m.kind === "tool_call") return `${m.name ?? "工具"}${m.status ? ` · ${m.status}` : ""}`;
    if (m.kind === "assistant_text") return "输出回复";
    if (m.kind === "thinking") return m.label || "思考中";
    return String(m.kind);
  }
  return "—";
}

/**
 * TaskStatusPanel —— 集成在对话输入框顶部的任务执行面板（2026-11-08 UI 改造）。
 * 三行结构：① 任务概览（状态/头像/任务名/进度/折叠）② 紧凑步骤列表 ③ 流程/团队/审批/产物四 Tab。
 * 数据全部来自真实后端（timeline 派生 + run-sessions + approvals + DAG），无假进度。
 */
function TaskStatusPanel({
  groupId,
  groupName,
  chat,
  agentsList,
  agentsState,
  onClose,
}: {
  groupId: string | null;
  groupName: string;
  chat: GroupChat;
  agentsList: AgentRecord[];
  agentsState: SfLoadState;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"flow" | "team" | "approval" | "artifacts">("flow");
  const [dagOpen, setDagOpen] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [opinions, setOpinions] = useState<Record<string, string>>({});
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [decided, setDecided] = useState<ApprovalItem[]>([]);
  const [approvalsLive, setApprovalsLive] = useState(false);
  const [dag, setDag] = useState<SfTeamDag | null>(null);
  const [artifactsPins, setArtifactsPins] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  // ── 任务面板状态机：空闲收起 / 执行中自动展开 / 完成与失败保留结果视图 ──
  const [expanded, setExpanded] = useState(false);
  // ── 多任务切换：真实 run 任务列表（goal=任务名），activeSid=null 为合并视图 ──
  const [sessions, setSessions] = useState<RunSessionItem[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);

  const messages = chat.messages;
  // 任务切片：选中具体任务时只归并该 session 的过程消息（消息↔任务关联来自 session_id 标签）
  const scoped = useMemo(
    () => (activeSid ? messages.filter((m) => m.session_id === activeSid) : messages),
    [messages, activeSid],
  );
  const steps = useMemo(() => deriveSteps(scoped), [scoped]);
  const artifacts = useMemo(() => deriveArtifacts(scoped), [scoped]);
  const stats = useMemo(() => deriveRunStats(scoped), [scoped]);
  const running =
    chat.runs.some((r) => !isTerminalRunStatus(r.status)) ||
    chat.awaitingReply ||
    chat.typing != null;
  const lastRun = [...chat.runs].reverse().find((r) => r.session_id);
  const runFailed = !running && lastRun?.status === "failed";
  const runSucceeded = !running && lastRun?.status === "succeeded";

  // 任务列表（真实数据）：群/运行状态变化时刷新
  const loadSessions = useCallback(async () => {
    if (!groupId) {
      setSessions([]);
      return;
    }
    try {
      const list = await listRunSessionsByGroup(groupId);
      setSessions(list);
    } catch {
      /* 接口不可达时保留旧列表，run 兜底仍可用 */
    }
  }, [groupId]);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions, chat.runs]);

  // 执行中自动展开实时步骤；会话切换复位（收起、回到合并视图、默认流程 Tab）
  useEffect(() => {
    if (running) setExpanded(true);
  }, [running]);
  useEffect(() => {
    setExpanded(false);
    setActiveSid(null);
    setTab("flow");
  }, [groupId]);

  // 仅真实运行中才跳秒（不再伪造固定时长）
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const loadApprovals = useCallback(async () => {
    if (!groupId) return;
    try {
      const items = await listPendingApprovals(groupId);
      setApprovals(items.map((item, idx) => normalizeApproval(item, idx)));
      setApprovalsLive(true);
    } catch {
      setApprovals([]);
      setApprovalsLive(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals, tab]);

  // DAG：GET /api/groups/:id/dag → 回落 GET /api/teams/:id/dag → 空态
  useEffect(() => {
    if (!groupId) return;
    let dead = false;
    (async () => {
      try {
        const d = await getGroupDag(groupId);
        if (!dead && d && Array.isArray(d.edges)) setDag(normalizeDag(d));
      } catch {
        try {
          const teams = await getTeams();
          const tid = teams[0]?.team_id ?? teams[0]?.id;
          if (!tid) throw new Error("no team");
          const d = await getTeamDag(tid);
          if (!dead && d && Array.isArray(d.edges)) setDag(normalizeDag(d));
        } catch {
          if (!dead) setDag(null);
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [groupId, groupName]);

  const elapsedText = fmtElapsed(stats.elapsedMs);
  // 运行中且 msg_foot 尚未给出耗时 → 从最后一个 user_turn 起真实跳秒
  const turnStart = useMemo(() => {
    const lastUser = [...scoped].reverse().find((m) => m.kind === "user_turn");
    return lastUser?.ts ?? 0;
  }, [scoped]);
  const liveElapsed =
    running && stats.elapsedMs <= 0 && turnStart > 0 ? fmtElapsed(nowMs - turnStart) : elapsedText;
  const pendingCount = approvals.filter((a) => a.state === "pending").length;
  const doneSteps = steps.filter((s) => s.status === "done").length;
  // 概览行：任务名 = 选中任务的 goal（真实 run 目标），回落群名；Agent = 正在输入/最近发言者
  const activeSession = activeSid ? sessions.find((s) => s.session_id === activeSid) : null;
  const taskName = activeSession?.goal || groupName;
  const activeAgentName =
    chat.typing ??
    [...scoped].reverse().find((m) => m.agent_name)?.agent_name ??
    "Agent 团队";
  const progressPct = steps.length > 0 ? Math.round((doneSteps / steps.length) * 100) : 0;

  /** 步骤级重跑：优先调 run-sessions step retry，再消息重下发（无假动画）。 */
  const retryStep = async (name: string, index: number) => {
    const run = [...chat.runs].reverse().find((r) => r.session_id);
    if (run) {
      try {
        await retryRunStep(run.session_id, index);
      } catch {
        /* retry 接口不可用 → 仅消息重下发 */
      }
    }
    await chat.send(`重跑步骤「${name}」`);
  };

  const rerunAll = () => {
    void chat.rerun();
  };

  const resolveApproval = async (id: string, state: "approved" | "rejected") => {
    const item = approvals.find((a) => a.id === id);
    const comment = (opinions[id] ?? "").trim();
    const decidedItem: ApprovalItem = {
      ...(item ?? {
        id,
        from: "Agent",
        label: "AG",
        color: "#999",
        summary: id,
        kind: "审批",
        target: id,
        detail: "",
        impact: "",
      }),
      state,
      when: "刚刚",
      note: state === "approved" ? comment || undefined : undefined,
      reason: state === "rejected" ? comment || undefined : undefined,
    };
    setApprovals((all) => all.filter((x) => x.id !== id));
    setDecided((all) => [decidedItem, ...all]);
    setOpinions((all) => {
      const next = { ...all };
      delete next[id];
      return next;
    });
    try {
      await decideApproval(groupId ?? "", item?.nodeId ?? id, state === "approved" ? "approve" : "reject");
    } catch {
      // 409（无挂起）/ 404 / 网络失败 → 重拉 pending 与真实状态对齐
      void loadApprovals();
    }
  };

  return (
    <div className="sf-task-panel">
      {/* Row 1 · 任务概览（收起时仅保留这一行摘要，不占多余空间） */}
      <div className="sf-task-head">
        <span
          className={`sf-task-status ${running ? "running" : runFailed ? "failed" : runSucceeded ? "done" : "idle"}`}
          title={running ? "执行中" : runFailed ? "任务失败" : runSucceeded ? "任务完成" : "空闲"}
        >
          {running ? (
            <RotateCcw size={11} className="sf-spin" />
          ) : runFailed ? (
            <X size={11} />
          ) : runSucceeded ? (
            <Check size={11} />
          ) : (
            <Zap size={11} />
          )}
        </span>
        <AgentAvatar
          label={activeAgentName.slice(0, 2).toUpperCase()}
          color={SF_PALETTE[activeAgentName.length % SF_PALETTE.length]}
          small
        />
        <div className="sf-task-title">
          <strong title={taskName}>{taskName}</strong>
          <small>
            {activeAgentName}
            {running ? " · 执行中" : runFailed ? " · 失败" : runSucceeded ? " · 已完成" : ""}
          </small>
        </div>
        {steps.length > 0 && (
          <div className="sf-task-progress" title={`${doneSteps} / ${steps.length} 个步骤已完成`}>
            <span className="sf-task-progress-track">
              <i style={{ width: `${progressPct}%` }} />
            </span>
            <em>{progressPct}%</em>
          </div>
        )}
        <div className="sf-run-meta">
          <span className={`sf-run-pill ${running ? "running" : runFailed ? "failed" : "stopped"}`}>
            {running ? "运行中" : runFailed ? "失败" : runSucceeded ? "已完成" : "空闲"}
          </span>
          {(stats.elapsedMs > 0 || (running && turnStart > 0)) && (
            <span className="sf-run-ticker">
              <Clock size={9} />
              {liveElapsed}
            </span>
          )}
          {stats.cost > 0 && <span className="sf-run-cost">¥{stats.cost.toFixed(3)}</span>}
        </div>
        <div className="sf-run-actions">
          {running && groupId ? (
            <button className="sf-mini-btn danger" onClick={() => void chat.stop()} title="停止当前任务">
              <Square size={8} /> 停止
            </button>
          ) : runFailed ? (
            <button className="sf-mini-btn ok" onClick={rerunAll} title="重试失败的任务">
              <RotateCcw size={8} /> 重试
            </button>
          ) : runSucceeded ? (
            <button
              className="sf-mini-btn ok"
              onClick={() => {
                setExpanded(true);
                setTab("artifacts");
              }}
              title="查看任务产物"
            >
              <FileText size={8} /> 产物
            </button>
          ) : (
            <button className="sf-mini-btn ok" onClick={rerunAll} title="重跑上一轮任务">
              <Play size={8} /> 重跑上一轮
            </button>
          )}
        </div>
        <button
          className={`sf-task-chevron ${expanded ? "open" : ""}`}
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "收起任务面板" : "展开任务面板"}
          title={expanded ? "收起" : "展开"}
        >
          <ChevronDown size={13} />
        </button>
        <button className="sf-task-chevron" onClick={onClose} aria-label="隐藏任务面板" title="隐藏（顶栏可再打开）">
          <X size={12} />
        </button>
      </div>

      {expanded && (
        <div className="sf-task-body">
          {/* 多任务切换：多个后台任务可区分切换（goal=真实任务名） */}
          {sessions.length > 1 && (
            <div className="sf-task-chips">
              <button
                className={activeSid === null ? "on" : ""}
                onClick={() => setActiveSid(null)}
              >
                全部
              </button>
              {sessions.map((s) => (
                <button
                  key={s.session_id}
                  className={`${activeSid === s.session_id ? "on" : ""} ${
                    !isTerminalRunStatus(s.status) ? "live" : ""
                  }`}
                  onClick={() => setActiveSid(s.session_id === activeSid ? null : s.session_id)}
                  title={`${s.goal || s.session_id} · ${s.status}`}
                >
                  {!isTerminalRunStatus(s.status) && <i className="sf-chip-dot" />}
                  {s.goal || s.session_id.slice(0, 8)}
                </button>
              ))}
            </div>
          )}

          {/* Row 2 · 紧凑任务执行列表（绿勾 / 动态加载 / 灰等待 / 红错） */}
          <div className="sf-task-steps">
            <div className="sf-task-steps-title">
              <span>执行步骤{steps.length > 0 ? ` · ${doneSteps}/${steps.length}` : ""}</span>
              {running && <em className="sf-step-live">实时更新</em>}
            </div>
            {steps.length === 0 ? (
              <p className="sf-empty">
                暂无运行记录 —— 在对话里给团队下发任务后，这里会实时显示执行步骤。
              </p>
            ) : (
              <ol className="sf-task-step-list">
                {steps.map((step, idx) => (
                  <li key={`${step.name}-${idx}`} className={`sf-task-step ${step.status}`}>
                    <span className="sf-task-step-icon">
                      {step.status === "done" ? (
                        <Check size={9} />
                      ) : step.status === "running" ? (
                        <RotateCcw size={9} className="sf-spin" />
                      ) : step.status === "failed" ? (
                        <X size={9} />
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <strong>{step.name}</strong>
                    <small>
                      {step.meta || (RUN_STATUS_TEXT[step.status] ?? step.status)}
                    </small>
                    {step.substeps.length > 0 && (
                      <span className="sf-task-sub-chips">
                        {step.substeps.map((sub, si) => (
                          <em key={`${sub.agent}-${si}`} className={sub.status}>
                            {sub.agent}
                            {sub.slot ? ` · ${sub.slot}` : ""} ·{" "}
                            {RUN_STATUS_TEXT[sub.status] ?? sub.status}
                          </em>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

      <div className="sf-run-tabs">
        <button className={tab === "flow" ? "on" : ""} onClick={() => setTab("flow")}>
          过程
        </button>
        <button className={tab === "team" ? "on" : ""} onClick={() => setTab("team")}>
          团队
        </button>
        <button className={tab === "approval" ? "on" : ""} onClick={() => setTab("approval")}>
          审批{pendingCount > 0 ? <em>{pendingCount}</em> : null}
        </button>
        <button className={tab === "artifacts" ? "on" : ""} onClick={() => setTab("artifacts")}>
          产物
        </button>
      </div>

      {tab === "flow" && (
        <div className="sf-panel-section">
          <div className="sf-panel-title">
            <span>步骤{steps.length > 0 ? ` · ${steps.length}` : ""}</span>
            <button onClick={() => setDagOpen(!dagOpen)}>{dagOpen ? "收起 DAG" : "查看 DAG"}</button>
          </div>
          {steps.length === 0 ? (
            <p className="sf-empty">
              暂无运行记录 —— 在对话里给团队下发任务后，这里会实时显示执行步骤。
            </p>
          ) : (
            <div className="sf-step-tree">
              {steps.map((step, idx) => (
                <div key={`${step.name}-${idx}`}>
                  <div className={`sf-step-row ${step.status}`}>
                    <span className="sf-step-dot">
                      {step.status === "done" ? (
                        <Check size={9} />
                      ) : step.status === "running" ? (
                        <RotateCcw size={9} className="sf-spin" />
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <div>
                      <strong>{step.name}</strong>
                      <small>{step.meta}</small>
                    </div>
                    {step.status === "done" && groupId && (
                      <button className="sf-retry" onClick={() => void retryStep(step.name, idx)}>
                        <RotateCcw size={8} /> 重跑
                      </button>
                    )}
                    {step.status === "running" && <span className="sf-step-live">执行中</span>}
                  </div>
                  {step.substeps.map((sub, si) => (
                    <div className="sf-step-sub" key={`${sub.agent}-${si}`}>
                      <span />
                      <p>
                        {sub.agent}
                        {sub.slot ? ` · ${sub.slot}` : ""}
                      </p>
                      <em className={sub.status}>{RUN_STATUS_TEXT[sub.status] ?? sub.status}</em>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {dagOpen &&
            (dag ? (
              <SfDagRail dag={dag} />
            ) : (
              <p className="sf-empty">暂无 DAG 数据（接口未就绪或该会话尚未运行）</p>
            ))}
        </div>
      )}

      {tab === "team" && (
        <div className="sf-panel-section">
          <div className="sf-panel-title">
            <span>当前团队</span>
          </div>
          {(agentsList.length > 0
            ? displayAgents(agentsList).map((a) => ({
                key: a.agent_id,
                name: a.name || a.agent_id,
                role: a.soul || a.role || "Agent",
                initials: (a.name || a.agent_id).slice(0, 2).toUpperCase(),
                color:
                  agents.find((x) => x.name === a.name)?.color ??
                  SF_PALETTE[(a.name ?? a.agent_id).length % SF_PALETTE.length],
                status: a.status ?? "在线",
                live: lastActivityOf(messages, a.name || a.agent_id),
              }))
            : agents.map((a) => ({
                key: a.name,
                name: a.name,
                role: a.role,
                initials: a.initials,
                color: a.color,
                status: a.status,
                live: "暂无最近活动",
              }))
          ).map((row) => (
            <div key={row.key}>
              <button
                className="sf-agent-row"
                onClick={() => setOpenAgent(openAgent === row.name ? null : row.name)}
              >
                <AgentAvatar label={row.initials} color={row.color} small />
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.role}</small>
                </div>
                <span className={row.status === "执行中" || row.status === "running" ? "running" : ""}>
                  {row.status}
                </span>
              </button>
              {openAgent === row.name && (
                <div className="sf-expand-card">
                  <p>当前：{row.live}</p>
                </div>
              )}
            </div>
          ))}
          <SfLoadTag state={agentsState} okText="已连接后端" />
        </div>
      )}

      {tab === "approval" && (
        <div className="sf-panel-section">
          <div className="sf-panel-title">
            <span>人工审批门</span>
            <button onClick={() => void loadApprovals()}>{pendingCount} 项待审批 · 刷新</button>
          </div>
          <p className="sf-appr-hint">
            每张卡片写明正在等待审批的具体对象与影响。可直接通过 / 驳回，也可以在意见框里补充命令或说明原因。
          </p>
          {!approvalsLive && approvals.length === 0 && (
            <p className="sf-empty">
              暂无待审批事项（审批接口不可达或该会话没有挂起的审批门）。
            </p>
          )}
          {approvalsLive && approvals.length === 0 && decided.length === 0 && (
            <p className="sf-empty">暂无待审批事项 —— Agent 交接触发审批门时会出现在这里。</p>
          )}
          {[...approvals, ...decided].map((ap) => (
            <div className={`sf-appr-card ${ap.state}`} key={ap.id}>
              <div className="sf-appr-head">
                <AgentAvatar label={ap.label} color={ap.color} small />
                <div>
                  <strong>{ap.summary}</strong>
                  <small>
                    {ap.from} · {ap.when}
                  </small>
                </div>
              </div>
              <div className="sf-appr-target">
                <p>
                  <em>审批对象</em>
                  <b>{ap.kind}</b>
                </p>
                <strong>{ap.target}</strong>
                {ap.detail && <small>{ap.detail}</small>}
                {ap.impact && <small className="sf-appr-impact">通过后：{ap.impact}</small>}
              </div>
              {ap.state === "pending" ? (
                <>
                  <textarea
                    className="sf-appr-opinion"
                    rows={2}
                    value={opinions[ap.id] ?? ""}
                    onChange={(e: FormEvent<HTMLTextAreaElement>) =>
                      setOpinions((all) => ({ ...all, [ap.id]: e.currentTarget.value }))
                    }
                    placeholder="意见（可选）：留空可直接通过 / 驳回；通过时可补充命令，驳回时请说明原因"
                  />
                  <div className="sf-appr-actions">
                    <button className="ok" onClick={() => void resolveApproval(ap.id, "approved")}>
                      <Check size={9} /> {(opinions[ap.id] ?? "").trim() ? "通过并附意见" : "通过"}
                    </button>
                    <button className="no" onClick={() => void resolveApproval(ap.id, "rejected")}>
                      <X size={9} /> {(opinions[ap.id] ?? "").trim() ? "驳回并说明" : "驳回"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="sf-appr-log">
                  {ap.state === "approved" ? "✅ 已批准" : "❌ 已驳回"}
                  {ap.note ? ` · 补充命令：${ap.note}` : ""}
                  {ap.reason ? ` · 原因：${ap.reason}` : ""}
                </div>
              )}
            </div>
          ))}
          <div className="sf-policy-note">
            <ShieldCheck size={16} />
            <div>
              <strong>人工审核已开启</strong>
              <small>关键策略不会未经确认直接执行</small>
            </div>
          </div>
        </div>
      )}

      {tab === "artifacts" && (
        <div className="sf-panel-section">
          <div className="sf-panel-title">
            <span>产物 · {artifacts.length}</span>
            <button onClick={() => chat.reload()}>刷新</button>
          </div>
          {artifacts.length === 0 && (
            <p className="sf-empty">暂无产物 —— 运行产出的 diff、提交与文件会归并到这里。</p>
          )}
          {artifacts.map((art) => (
            <div className="sf-art-row" key={art.id}>
              <span className="sf-art-icon">
                <FileText size={11} />
              </span>
              <div>
                <strong>{art.name}</strong>
                <small>
                  {art.type}
                  {art.size ? ` · ${art.size}` : ""}
                  {art.summary ? ` · ${art.summary}` : ""}
                </small>
              </div>
              <div className="sf-art-actions">
                <button
                  className={artifactsPins[art.id] ? "pin on" : "pin"}
                  title={artifactsPins[art.id] ? "取消置顶" : "置顶"}
                  onClick={() =>
                    setArtifactsPins((all) => ({ ...all, [art.id]: !all[art.id] }))
                  }
                >
                  <Pin size={9} />
                </button>
                {art.url ? (
                  <a href={art.url} target="_blank" rel="noreferrer" title="打开">
                    <Download size={9} />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sf-run-foot">
        {stats.tools} tools · {(stats.tokens / 1000).toFixed(1)}k tokens · ¥{stats.cost.toFixed(3)}
      </div>
        </div>
      )}
    </div>
  );
}

function ProductLogo() {
  return (
    <span className="sf-logo">
      <i />
      <i />
      <i />
    </span>
  );
}

function CeoHero({ onQuick }: { onQuick: (text: string) => void }) {
  return (
    <div className="sf-ceo-hero">
      <AgentAvatar label="CEO" color="#ff5e3a" size="xl" />
      <h2>董事长</h2>
      <p>
        <i /> 在线 · 全局调度、任务拆解与决策
      </p>
      <div className="sf-ceo-chips">
        {quickPrompts.map((prompt) => (
          <button type="button" key={prompt} onClick={() => onQuick(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 真实时间线渲染入口：GET /api/groups/:id/timeline + SSE/run 流增量。
 *  状态覆盖：加载 / 错误重试 / 空态（CeoHero + 快捷指令）/ 正常时间线 / 流式指示。 */
function ChatThread({
  chat,
  onQuick,
  onLogin,
}: {
  chat: GroupChat;
  onQuick: (text: string) => void;
  onLogin: () => void;
}) {
  const hasMessages = chat.messages.length > 0;
  // 有 run 在飞 = 团队真在干活（spinner 状态细分 2026-11-09：转圈不再只会说「拆解中」）。
  const runsActive = chat.runs.some((r) => !isTerminalRunStatus(r.status));

  // 加载态：首次进入拉取 timeline
  if (chat.status === "loading" && !hasMessages) {
    return (
      <div className="sf-empty">
        <span className="sf-empty-spinner" />
        <p>正在加载会话记录…</p>
      </div>
    );
  }

  // 错误态：拉取失败 → 重试 / 登录引导
  if (chat.status === "error" && !hasMessages) {
    return (
      <div className="sf-empty">
        <div className="sf-empty-actions">
          <button type="button" className="sf-link-btn" onClick={() => chat.reload()}>
            重试
          </button>
          <button type="button" className="sf-link-btn" onClick={onLogin}>
            登录 / 注册
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 空态：无消息时给引导与快捷指令，不渲染空时间线 */}
      {!hasMessages && (
        <>
          <CeoHero onQuick={onQuick} />
          <p className="sf-thread-hint">还没有消息 —— 试试上面的快捷指令，或直接输入你的第一个任务。</p>
        </>
      )}
      {/* 正常态：真实时间线（全部 TimelineMessage kind） */}
      <TimelineList messages={chat.messages} />
      {/* 增量加载失败但已有内容：行内错误条，保留已渲染消息 */}
      {chat.error && hasMessages && (
        <div className="sf-inline-error">
          <button type="button" className="sf-link-btn" onClick={() => chat.reload()}>
            重试
          </button>
        </div>
      )}
      {/* 流式指示（2026-11-09 状态细分）：正在生成 / 等待你审批 / 团队执行中 / 拆解调度中。
          一轮干完（run 全终态或收到回复）即收起，不再干挂转圈。 */}
      {(chat.typing || chat.awaitingReply || chat.waitingApproval || runsActive) && (
        <div className="sf-working">
          <span />
          <span />
          <span />
          <p>
            {chat.typing ? (
              <>
                <strong>{chat.typing}</strong> 正在生成回复
              </>
            ) : chat.waitingApproval ? (
              <>
                <strong>等待你审批</strong> · 团队已暂停，批/拒后继续（任务面板可操作）
              </>
            ) : runsActive ? (
              <>
                <strong>Agent 团队</strong> 执行中，过程卡实时推进
              </>
            ) : (
              <>
                <strong>Agent</strong> 正在拆解任务并调度团队
              </>
            )}
          </p>
        </div>
      )}
    </>
  );
}

// ═══ 团队编排（对齐 ShadowFlow 后端：/api/teams、/api/teams/:id/dag、
//     /api/teams/:id/policy、/api/groups/:id/approvals/*、/api/approvals/*）═
// 后端可达 → 拉真实编队；不可达（静态预览）→ 回落占位数据。

type PolicyCellState = "permit" | "warn" | "deny";
type PolicyMatrix = Record<string, Record<string, PolicyCellState>>;

interface SfDagEdge {
  source: string;
  target: string;
  /** direct | approve | conditional（后端在 e.data.mode，这里归一） */
  mode?: string;
  data?: { mode?: string };
}
interface SfDagAgent {
  id: string;
  title: string;
  sub?: string;
}
interface SfTeamDag {
  team_id: string;
  name: string;
  members?: string[];
  edges: SfDagEdge[];
  resolved_agents: SfDagAgent[];
  policy?: PolicyMatrix | null;
}
interface SfApproval {
  approval_id: string;
  gate_id: string;
  submitter_name: string;
  summary: string;
  waiting_seconds: number;
}
interface SfDashOverview {
  usage: {
    calls: number;
    total_tokens: number;
    cost_est_usd: number;
    deltas: { calls: number | null; total_tokens: number | null; cost_est_usd: number | null };
  };
  runs: { total: number; succeeded: number; failed: number; canceled: number; success_rate: number | null };
  active: { projects: number; conversations: number };
}
/** /api/dashboard/briefing —— 每日简报（零 LLM，库内现算）。 */
interface SfDashBriefing {
  generated_at: number;
  today: { calls: number; total_tokens: number; cost_est_usd: number };
  yesterday: { calls: number; total_tokens: number; cost_est_usd: number };
  failed_top: Array<{ goal: string; n: number }>;
  lessons_learned: Array<{ kind: string; n: number }>;
  trend_7d: {
    total_tokens: number;
    daily: Array<{ day: number; calls: number; tokens: number; cost_est_usd: number }>;
  };
  alerts: string[];
}
/** /api/dashboard/agents —— Agent 产出排行（agent_hops 交接产出字符/次数现算）。 */
interface SfDashAgentItem {
  agent: string;
  hops: number;
  output_chars: number;
  done: number;
  failed: number;
}

/** 旧视图专用 fetch：委托 apiFetch（Bearer 鉴权 + 401 → AuthModal），保留 {data} 解包。 */
async function sfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await apiFetch<unknown>(path, init);
  if (json && typeof json === "object" && "data" in (json as Record<string, unknown>)) {
    return (json as { data: T }).data;
  }
  return json as T;
}

const POLICY_COLORS: Record<PolicyCellState, string> = {
  permit: "#16a34a",
  warn: "#d97706",
  deny: "#dc2626",
};
const POLICY_LABELS: Record<PolicyCellState, string> = {
  permit: "允许",
  warn: "警告",
  deny: "拒绝",
};
const POLICY_RANK: Record<PolicyCellState, number> = { deny: 3, warn: 2, permit: 1 };
const POLICY_CYCLE: (PolicyCellState | null)[] = [null, "permit", "warn", "deny"];
const SF_PALETTE = ["#ff5e3a", "#2777e8", "#d97b38", "#c64f7d", "#7c5cff", "#0ea5a4"];

/** 小红书 Logo（2026-11-10）：红底圆角方块 + 白色「小红书」字样，加号旁连接器徽标。 */
function XhsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="小红书"
      style={{ display: "block", borderRadius: 5 }}
    >
      <rect width="24" height="24" rx="5" fill="#ff2442" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="8.2"
        fontWeight={700}
        fontFamily="'PingFang SC', 'Microsoft YaHei', sans-serif"
      >
        小红书
      </text>
    </svg>
  );
}

/** 演示编队（后端不可达时的回落，与上方 agents 卡片同一批 6 名部门员工）。 */
const DEMO_TEAM: SfTeamDag = {
  team_id: "demo-atlas",
  name: "Atlas 新品发布作战室",
  edges: [
    { source: "MA", target: "BP", mode: "direct" },
    { source: "MA", target: "BD", mode: "direct" },
    { source: "BP", target: "CC", mode: "direct" },
    { source: "CC", target: "CR", mode: "approve" },
    { source: "CR", target: "CC", mode: "conditional" },
    { source: "CR", target: "OPS", mode: "direct" },
    { source: "BD", target: "OPS", mode: "direct" },
  ],
  resolved_agents: [
    { id: "MA", title: "市场分析师" },
    { id: "BP", title: "品牌策划师" },
    { id: "CC", title: "内容策划师" },
    { id: "OPS", title: "运营专员" },
    { id: "BD", title: "商务专员" },
    { id: "CR", title: "合规审核员" },
  ],
  policy: {
    MA: { BP: "permit", BD: "permit" },
    BP: { CC: "permit" },
    CC: { CR: "warn" },
    CR: { CC: "deny", OPS: "permit" },
    BD: { OPS: "warn" },
  },
};

/** 最长路径分层（移植 neo/TeamDagCanvas.computeTeamDagColumns：回边不参与分层）。 */
function dagLayers(edges: SfDagEdge[], ids: string[]): Map<string, number> {
  const out: Record<string, string[]> = {};
  const seqOut: Record<string, string[]> = {};
  const inc: Record<string, string[]> = {};
  ids.forEach((id) => {
    out[id] = [];
    seqOut[id] = [];
    inc[id] = [];
  });
  edges.forEach((e) => {
    if (seqOut[e.source] && seqOut[e.target]) seqOut[e.source].push(e.target);
  });
  const isAncestor = (from: string, to: string): boolean => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to && cur !== from) return true;
      for (const nx of seqOut[cur] ?? []) {
        if (!seen.has(nx)) {
          seen.add(nx);
          stack.push(nx);
        }
      }
    }
    return false;
  };
  edges.forEach((e) => {
    if (!inc[e.target] || !out[e.source]) return;
    if (e.mode === "conditional" && isAncestor(e.target, e.source)) return;
    inc[e.target].push(e.source);
    out[e.source].push(e.target);
  });
  const col = new Map<string, number>();
  const queue: string[] = [];
  ids.forEach((id) => {
    if ((inc[id] ?? []).length === 0) {
      col.set(id, 0);
      queue.push(id);
    }
  });
  const guard = ids.length * 4 + 8;
  const maxCol = Math.max(0, ids.length - 1);
  let steps = 0;
  while (queue.length && steps++ < guard) {
    const id = queue.shift()!;
    const c = col.get(id) ?? 0;
    for (const next of out[id] ?? []) {
      const prev = col.get(next);
      if ((prev === undefined || prev < c + 1) && c + 1 <= maxCol) {
        col.set(next, c + 1);
        queue.push(next);
      }
    }
  }
  ids.forEach((id) => {
    if (!col.has(id)) col.set(id, 0);
  });
  return col;
}

/** 成员对策略态（无向取更严，与 neo/teamPolicyVisual.lookupPairPolicy 同口径）。 */
function pairPolicy(matrix: PolicyMatrix, a: string, b: string): PolicyCellState | null {
  const s1 = matrix[a]?.[b];
  const s2 = matrix[b]?.[a];
  const cand = [s1, s2].filter(Boolean) as PolicyCellState[];
  return cand.length ? cand.sort((x, y) => POLICY_RANK[y] - POLICY_RANK[x])[0] : null;
}

/** 单个成员的最严策略态（节点描边染色用，与 buildAgentPolicyColor 同口径）。 */
function agentPolicy(matrix: PolicyMatrix, id: string): PolicyCellState | null {
  let best: PolicyCellState | null = null;
  for (const [from, row] of Object.entries(matrix)) {
    for (const [to, s] of Object.entries(row ?? {})) {
      if (from !== id && to !== id) continue;
      if (!best || POLICY_RANK[s] > POLICY_RANK[best]) best = s;
    }
  }
  return best;
}

function SfDagPanel({ team, matrix }: { team: SfTeamDag; matrix: PolicyMatrix }) {
  const nodes = team.resolved_agents.length
    ? team.resolved_agents
    : (team.members ?? []).map((id) => ({ id, title: id }));
  const col = useMemo(
    () => dagLayers(team.edges, nodes.map((n) => n.id)),
    [team],
  );

  const NW = 150;
  const NH = 44;
  const COLG = 62;
  const ROWG = 36;
  const M = 26;

  const byCol = new Map<number, string[]>();
  nodes.forEach(({ id }) => {
    const c = col.get(id) ?? 0;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c)!.push(id);
  });
  const maxColIdx = Math.max(0, ...byCol.keys());
  let maxRows = 1;
  byCol.forEach((list) => {
    maxRows = Math.max(maxRows, list.length);
  });

  const pos = new Map<string, { x: number; y: number }>();
  byCol.forEach((list, c) => {
    list.forEach((id, r) => {
      pos.set(id, { x: M + c * (NW + COLG), y: M + r * (NH + ROWG) });
    });
  });
  const W = M * 2 + (maxColIdx + 1) * NW + maxColIdx * COLG;
  const hasBackEdge = team.edges.some(
    (e) => (col.get(e.target) ?? 0) < (col.get(e.source) ?? 0),
  );
  const H = M * 2 + maxRows * NH + (maxRows - 1) * ROWG + (hasBackEdge ? 38 : 0);

  const edgeVisual = (e: SfDagEdge): { stroke: string; dash?: string; w: number; label?: string } => {
    const p = pairPolicy(matrix, e.source, e.target);
    if (p) {
      return {
        stroke: POLICY_COLORS[p],
        w: p === "deny" ? 2.4 : 1.9,
        dash: !e.mode || e.mode === "direct" ? undefined : "5 4",
        label: POLICY_LABELS[p],
      };
    }
    if (e.mode === "approve") return { stroke: "#d97706", w: 1.6, dash: "5 4", label: "审批" };
    if (e.mode === "conditional") return { stroke: "#0891b2", w: 1.6, dash: "5 4", label: "回炉" };
    return { stroke: "#c9c5ba", w: 1.6 };
  };

  const colorOf = (id: string, index: number, title?: string): string =>
    agents.find((a) => a.id === id || a.initials === id || (!!title && a.name === title))?.color ??
    SF_PALETTE[index % SF_PALETTE.length];

  return (
    <div className="sf-teamops-panel">
      <div className="sf-teamops-head">
        <GitBranch size={14} />
        <h3>工作流 DAG</h3>
        <span className="sf-teamops-name">{team.name}</span>
      </div>
      <p className="sf-teamops-sub">
        交接边随协作策略染色 · 虚线为审批门 / 驳回回炉边
      </p>
      <div className="sf-dag-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", minWidth: Math.min(W, 560) }}>
          {team.edges.map((e, i) => {
            const s = pos.get(e.source);
            const t = pos.get(e.target);
            if (!s || !t) return null;
            const x1 = s.x + NW;
            const y1 = s.y + NH / 2;
            const x2 = t.x;
            const y2 = t.y + NH / 2;
            const backward = (col.get(e.target) ?? 0) < (col.get(e.source) ?? 0);
            const v = edgeVisual(e);
            let d: string;
            let lx: number;
            let ly: number;
            if (backward) {
              // 回边（驳回回炉）：下弧线绕过中间列，避免横穿节点
              const drop = Math.max(...Array.from(pos.values()).map((p) => p.y)) + NH + 26;
              d = `M ${x1} ${y1} C ${x1} ${drop}, ${x2} ${drop}, ${x2} ${y2}`;
              lx = (x1 + x2) / 2;
              ly = drop + 9;
            } else {
              const dx = Math.max(36, (x2 - x1) / 2);
              d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              lx = (x1 + x2) / 2;
              ly = (y1 + y2) / 2 - 5;
            }
            return (
              <g key={`e${i}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={v.stroke}
                  strokeWidth={v.w}
                  strokeDasharray={v.dash}
                  markerEnd="url(#sf-arrow)"
                />
                {v.label && (
                  <text x={lx} y={ly} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={v.stroke}>
                    {v.label}
                  </text>
                )}
              </g>
            );
          })}
          <defs>
            <marker
              id="sf-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {nodes.map((n, i) => {
            const p = pos.get(n.id)!;
            const st = agentPolicy(matrix, n.id);
            const stroke = st ? POLICY_COLORS[st] : "#e3e0d8";
            const color = colorOf(n.id, i, n.title);
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`}>
                <rect
                  width={NW}
                  height={NH}
                  rx={12}
                  fill="#fff"
                  stroke={stroke}
                  strokeWidth={st ? 2 : 1}
                  style={{ filter: "drop-shadow(0 1px 2px rgba(23,22,45,0.06))" }}
                />
                <circle cx={22} cy={NH / 2} r={12.5} fill={color} />
                <text
                  x={22}
                  y={NH / 2 + 3.5}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fill="#fff"
                >
                  {(n.title || n.id).slice(0, 1)}
                </text>
                <text x={41} y={NH / 2 + 3.5} fontSize={13} fontWeight={650} fill="#17162d">
                  {n.title || n.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="sf-dag-legend">
        <span><i style={{ borderColor: "#c9c5ba" }} />direct 交接</span>
        <span><i style={{ borderColor: "#d97706", borderStyle: "dashed" }} />approve 审批门</span>
        <span><i style={{ borderColor: "#0891b2", borderStyle: "dashed" }} />驳回回炉</span>
        <span><i style={{ borderColor: "#16a34a" }} />允许</span>
        <span><i style={{ borderColor: "#d97706" }} />警告</span>
        <span><i style={{ borderColor: "#dc2626" }} />拒绝</span>
      </div>
    </div>
  );
}

function SfPolicyPanel({
  team,
  matrix,
  dirty,
  saveState,
  onCell,
  onSave,
}: {
  team: SfTeamDag;
  matrix: PolicyMatrix;
  dirty: boolean;
  saveState: "idle" | "saving" | "ok" | "err";
  onCell: (a: string, b: string) => void;
  onSave: () => void;
}) {
  const roster = team.resolved_agents.length
    ? team.resolved_agents
    : (team.members ?? []).map((id) => ({ id, title: id }));
  const colorOf = (id: string, index: number, title?: string): string =>
    agents.find((a) => a.id === id || a.initials === id || (!!title && a.name === title))?.color ??
    SF_PALETTE[index % SF_PALETTE.length];
  const cellOf = (a: string, b: string): PolicyCellState | null => matrix[a]?.[b] ?? null;
  return (
    <div className="sf-teamops-panel">
      <div className="sf-teamops-head">
        <LayoutGrid size={14} />
        <h3>协作策略矩阵</h3>
      </div>
      <p className="sf-teamops-sub">行 → 列 方向的交接许可 · 点击格子切换 允许 / 警告 / 拒绝</p>
      <div
        className="sf-policy-grid"
        style={{ gridTemplateColumns: `58px repeat(${roster.length}, 30px)` }}
      >
        <span />
        {roster.map((c, ci) => (
          <span className="sf-policy-head" key={`h${c.id}`} title={c.title}>
            <i style={{ background: colorOf(c.id, ci, c.title) }}>{(c.title || c.id).slice(0, 1)}</i>
            {(c.title || c.id).slice(0, 2)}
          </span>
        ))}
        {roster.map((r, ri) => (
          <Fragment key={`r${r.id}`}>
            <span className="sf-policy-head sf-policy-row" title={r.title}>
              <i style={{ background: colorOf(r.id, ri, r.title) }}>{(r.title || r.id).slice(0, 1)}</i>
              {(r.title || r.id).slice(0, 4)}
            </span>
            {roster.map((c) => {
              if (r.id === c.id) {
                return (
                  <span className="sf-policy-cell diag" key={`${r.id}-${c.id}`}>
                    <s>—</s>
                  </span>
                );
              }
              const st = cellOf(r.id, c.id);
              return (
                <button
                  type="button"
                  key={`${r.id}-${c.id}`}
                  className="sf-policy-cell"
                  style={{ background: st ? POLICY_COLORS[st] : "#f1efe9" }}
                  title={`${r.title} → ${c.title}：${st ? POLICY_LABELS[st] : "默认允许（未配置）"}`}
                  onClick={() => onCell(r.id, c.id)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="sf-policy-foot">
        <span className="sf-policy-legend">
          <i style={{ background: "#16a34a" }} />允许
          <i style={{ background: "#d97706" }} />警告
          <i style={{ background: "#dc2626" }} />拒绝
          <i style={{ background: "#f1efe9" }} />未配置
        </span>
        {dirty && (
          <button className="sf-policy-save" onClick={onSave} disabled={saveState === "saving"}>
            {saveState === "saving" ? "保存中…" : "保存策略"}
          </button>
        )}
        {!dirty && saveState === "ok" && <span className="sf-policy-hint">已保存 ✓</span>}
        {saveState === "err" && <span className="sf-policy-hint err">保存失败，请重试</span>}
      </div>
    </div>
  );
}

function SfApprovalsPanel({
  approvals,
  onDecide,
}: {
  approvals: SfApproval[];
  onDecide: (id: string, decision: "approve" | "reject") => void;
}) {
  return (
    <div className="sf-teamops-panel">
      <div className="sf-teamops-head">
        <ShieldCheck size={14} />
        <h3>审批门 · 封驳矩阵</h3>
        <span className="sf-teamops-count">{approvals.length} 待决</span>
      </div>
      {approvals.length === 0 ? (
        <p className="sf-teamops-empty">暂无待审批事项 —— Agent 交接触发审批门时会出现在这里。</p>
      ) : (
        <div className="sf-approve-list">
          {approvals.map((a) => (
            <div className="sf-approve-item" key={a.approval_id}>
              <div className="sf-approve-body">
                <strong>{a.submitter_name || a.gate_id}</strong>
                {a.summary && <span>{a.summary}</span>}
              </div>
              <span className="sf-approve-wait">
                {a.waiting_seconds < 60
                  ? `${Math.floor(a.waiting_seconds)}s`
                  : a.waiting_seconds < 3600
                    ? `${Math.floor(a.waiting_seconds / 60)}min`
                    : `${Math.floor(a.waiting_seconds / 3600)}h`}
              </span>
              <button
                className="sf-approve-btn ok"
                title="批准"
                onClick={() => onDecide(a.approval_id, "approve")}
              >
                <Check size={14} strokeWidth={2.4} />
              </button>
              <button
                className="sf-approve-btn no"
                title="驳回"
                onClick={() => onDecide(a.approval_id, "reject")}
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamOpsSection() {
  const [team, setTeam] = useState<SfTeamDag>(DEMO_TEAM);
  const [live, setLive] = useState(false);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  const [matrix, setMatrix] = useState<PolicyMatrix>(DEMO_TEAM.policy ?? {});
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "err">("idle");
  const [approvals, setApprovals] = useState<SfApproval[]>([]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const teams = await sfFetch<SfTeamDag[]>("/api/teams");
        const first = Array.isArray(teams) ? teams[0] : null;
        const tid = (first as any)?.team_id ?? (first as any)?.id;
        if (!tid) throw new Error("no team");
        const dag = await sfFetch<SfTeamDag>(`/api/teams/${tid}/dag`);
        if (!dag || !dag.resolved_agents?.length) throw new Error("no dag");
        if (dead) return;
        setTeam({
          ...dag,
          team_id: tid,
          edges: (dag.edges ?? []).map((e: any) => ({
            source: e.source,
            target: e.target,
            mode: e.mode ?? e.data?.mode ?? "direct",
          })),
        });
        setLive(true);
        setLoadState("ready");
        try {
          const pol = await sfFetch<PolicyMatrix>(`/api/teams/${tid}/policy`);
          if (!dead) setMatrix(pol ?? {});
        } catch {
          /* 策略为空即默认全允许 */
        }
        try {
          const ap = await sfFetch<SfApproval[] | { items?: SfApproval[] }>(
            `/api/groups/${tid}/approvals/pending`,
          );
          const items = Array.isArray(ap) ? ap : ap?.items ?? [];
          if (!dead) setApprovals(items);
        } catch {
          /* 审批接口不可达 —— 空态 */
        }
      } catch {
        /* 后端不可达 —— 保留占位编队 */
        setLoadState("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const savePolicy = async () => {
    setSaveState("saving");
    try {
      if (!team.team_id.startsWith("demo")) {
        await sfFetch(`/api/teams/${team.team_id}/policy`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matrix }),
        });
      }
      setSaveState("ok");
      setDirty(false);
    } catch {
      setSaveState("err");
    }
  };

  const decide = async (approvalId: string, decision: "approve" | "reject") => {
    try {
      await sfFetch(`/api/approvals/${approvalId}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: decision === "reject" ? JSON.stringify({ reason: "" }) : JSON.stringify({}),
      });
      setApprovals((cur) => cur.filter((a) => a.approval_id !== approvalId));
    } catch {
      /* 失败静默，刷新可见 */
    }
  };

  return (
    <div className="sf-teamops">
      <div className="sf-teamops-main">
        <SfDagPanel team={team} matrix={matrix} />
      </div>
      <div className="sf-teamops-side">
        <SfPolicyPanel
          team={team}
          matrix={matrix}
          dirty={dirty}
          saveState={saveState}
          onCell={(a, b) => {
            const row = { ...(matrix[a] ?? {}) };
            const cur = row[b] ?? null;
            const next = POLICY_CYCLE[(POLICY_CYCLE.indexOf(cur) + 1) % POLICY_CYCLE.length];
            if (next) row[b] = next;
            else delete row[b];
            setMatrix({ ...matrix, [a]: row });
            setDirty(true);
            setSaveState("idle");
          }}
          onSave={() => void savePolicy()}
        />
        <SfApprovalsPanel approvals={approvals} onDecide={(id, d) => void decide(id, d)} />
      </div>
      <span className={`sf-live-tag ${live ? "on" : ""}`} data-testid="sf-teamops-source">
        {loadState === "loading" ? "加载中…" : live ? "LIVE · 已连接后端" : ""}
      </span>
    </div>
  );
}

function AgentsView() {
  return (
    <section className="sf-subview">
      <div className="sf-subview-intro">
        <div>
          <p>AI WORKFORCE</p>
          <h1>你的 Agent 团队</h1>
          <span>为不同角色配置能力、工具与责任边界。</span>
        </div>
        <button>
          <Plus size={15} /> 创建 Agent
        </button>
      </div>
      <div className="sf-agent-grid">
        {agents.map((agent) => (
          <article key={agent.name}>
            <div>
              <AgentAvatar label={agent.initials} color={agent.color} />
              <button>
                <MoreHorizontal size={17} />
              </button>
            </div>
            <h2>{agent.name}</h2>
            <p>{agent.role}</p>
            <div>
              <span>
                <Zap size={13} /> 6 Skills
              </span>
              <span>
                <BookOpen size={13} /> 3 知识源
              </span>
            </div>
            <footer>
              <span>
                <i /> {agent.status}
              </span>
              <button>
                配置 <ChevronRight size={14} />
              </button>
            </footer>
          </article>
        ))}
      </div>
      <TeamOpsSection />
    </section>
  );
}

type SfPackCard = {
  pack_id?: string;
  name?: string;
  title?: string;
  description?: string;
  source_count?: number;
  /** /api/memory-bank/packs 实际返回 stats.sources（不是 source_count）。 */
  stats?: { sources?: number; chunks?: number; bytes?: number };
  created_at?: string;
  status?: string;
};

/** 新建知识包弹窗：POST /api/memory-bank/packs + 可选上传来源文件。 */
function PackCreateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setFiles([]);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const pack = await sfFetch<{ pack_id?: string }>("/api/memory-bank/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const packId = pack?.pack_id;
      if (packId) {
        for (const file of files) {
          const form = new FormData();
          form.append("upload", file);
          await sfFetch(`/api/memory-bank/packs/${packId}/files`, { method: "POST", body: form });
        }
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请确认后端已连接");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="contact-modal sf-auth-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭">
          <X />
        </button>
        <p className="kicker">NEW KNOWLEDGE PACK</p>
        <h2>新建知识包</h2>
        <p>知识包是团队共享的知识单元；创建后可继续添加文档、网页与文本来源。</p>
        <form onSubmit={submit}>
          <label>
            名称
            <input
              required
              value={name}
              onChange={(e: FormEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
              placeholder="例如：品牌空间 / 新品发布研究"
              maxLength={200}
            />
          </label>
          <label>
            描述
            <input
              value={description}
              onChange={(e: FormEvent<HTMLInputElement>) => setDescription(e.currentTarget.value)}
              placeholder="这个知识包包含什么？（可选）"
            />
          </label>
          <label>
            上传来源文件（可选）
            <input
              type="file"
              multiple
              onChange={(e: FormEvent<HTMLInputElement>) =>
                setFiles(Array.from(e.currentTarget.files ?? []))
              }
            />
          </label>
          {files.length > 0 && <p className="sf-embed-result ok">已选择 {files.length} 个文件，创建后自动摄入</p>}
          {error && <p className="sf-auth-error">{error}</p>}
          <button className="button-primary" type="submit" disabled={busy}>
            {busy ? "创建中…" : "创建知识包"}
            {!busy && <Plus size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function KnowledgeView() {
  const [packs, setPacks] = useState<SfPackCard[] | null>(null);
  const [packsState, setPacksState] = useState<SfLoadState>("loading");
  const [createOpen, setCreateOpen] = useState(false);
  const reload = () => {
    setPacksState("loading");
    sfFetch<{ packs?: SfPackCard[] }>("/api/memory-bank/packs")
      .then((d) => {
        setPacks(Array.isArray(d?.packs) ? d.packs : []);
        setPacksState("ready");
      })
      .catch(() => {
        setPacks(null);
        setPacksState("error");
      });
  };
  useEffect(() => {
    reload();
  }, []);
  const cards: Array<[string, string, string, string, string]> = (packs ?? []).slice(0, 6).map((p) => [
    "知识包",
    p.name || p.title || (p.pack_id ? p.pack_id.slice(0, 8) : "未命名"),
    p.description || "团队共享知识包。",
    `${p.stats?.sources ?? p.source_count ?? 0} 个来源`,
    p.created_at ? fmtRelativeTime(p.created_at) : "",
  ]);
  return (
    <section className="sf-subview">
      <div className="sf-subview-intro">
        <div>
          <p>SHARED CONTEXT</p>
          <h1>团队知识库</h1>
          <span>让每位 Agent 都基于同一份可靠信息工作。</span>
        </div>
        <button onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> 添加知识
        </button>
      </div>
      <div className="sf-network-card">
        <div className="sf-card-title">
          <div>
            <strong>知识网络</strong>
            <span>文档 × Agent 的引用关系图</span>
          </div>
          <span className="sf-net-count">
            {packs === null ? "加载中…" : `${packs.length} 个知识包 · 网络示意`}
          </span>
        </div>
        <svg viewBox="0 0 720 170" preserveAspectRatio="xMidYMid meet" aria-label="知识网络">
          <defs>
            <linearGradient id="sfNetLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#8e6cff" stopOpacity=".55" />
              <stop offset="100%" stopColor="#2ec4a6" stopOpacity=".55" />
            </linearGradient>
          </defs>
          {[
            ["M 120 85 L 300 40", "#8e6cff"],
            ["M 120 85 L 300 85", "#c9c5ba"],
            ["M 120 85 L 300 130", "#8e6cff"],
            ["M 300 40 L 470 55", "#c9c5ba"],
            ["M 300 85 L 470 55", "#c9c5ba"],
            ["M 300 85 L 470 100", "#2ec4a6"],
            ["M 300 130 L 470 100", "#c9c5ba"],
            ["M 470 55 L 620 40", "#ff5e3a"],
            ["M 470 100 L 620 85", "#ff5e3a"],
            ["M 470 100 L 620 130", "#2ec4a6"],
          ].map(([d, c], i) => (
            <path key={i} d={d} stroke={c} strokeWidth="1.4" fill="none" opacity="0.7" />
          ))}
          {[
            [120, 85, "#8e6cff", "品牌空间", 30],
            [300, 40, "#2777e8", "竞品简报", 22],
            [300, 85, "#ff5e3a", "产品手册", 26],
            [300, 130, "#2ec4a6", "用户访谈", 22],
            [470, 55, "#d97b38", "定位假设", 20],
            [470, 100, "#c64f7d", "渠道排期", 22],
            [620, 40, "#ff5e3a", "总经理", 20],
            [620, 85, "#2777e8", "市场研究员", 20],
            [620, 130, "#2ec4a6", "内容创意", 20],
          ].map(([cx, cy, color, label, r], i) => (
            <g key={`n${i}`}>
              <circle cx={cx as number} cy={cy as number} r={r as number} fill={color as string} opacity="0.16" />
              <circle cx={cx as number} cy={cy as number} r={(r as number) / 2.4} fill={color as string} />
              <text
                x={cx as number}
                y={(cy as number) + (r as number) + 11}
                textAnchor="middle"
                fontSize="10"
                fill="#77737d"
              >
                {label as string}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <SfLoadTag state={packsState} />
      {packsState === "ready" && cards.length === 0 && (
        <p className="sf-biz-empty">还没有知识包 —— 点右上角「添加知识」创建</p>
      )}
      <div className="sf-knowledge-layout">
        {cards.map(([tag, title, desc, count, updated], i) => (
          <div key={title} className={`sf-knowledge-card${i === 0 ? " featured" : ""}`}>
            {i === 0 ? <BookOpen /> : i === 1 ? <FileText /> : <GitBranch />}
            <small>{tag}</small>
            <h2>{title}</h2>
            <p>{desc}</p>
            <footer>
              <span>{count}</span>
              <span>{updated}</span>
            </footer>
          </div>
        ))}
      </div>
      <PackCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reload} />
    </section>
  );
}

/** 数字紧凑格式（k/M）。 */
function fmtCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}
/** 环比 delta 展示：null（上期无数据）显示 "—"。 */
function fmtDelta(d: number | null): [string, string] {
  if (d == null) return ["—", ""];
  return [`${d >= 0 ? "+" : ""}${d}%`, d >= 0 ? "up" : "down"];
}
/**
 * 运行数据速览卡（2026-11-08 数据看板从侧边栏撤下，重点并入生意看板）：
 * 用量 / 成本 / Run 成功率 + 每日简报要点 + Agent 产出排行，实时取
 * /api/dashboard/{overview,briefing,agents}（零 LLM，库内现算）。
 */
function RunDigestCard() {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<SfLoadState>("loading");
  const [ov, setOv] = useState<SfDashOverview | null>(null);
  const [brief, setBrief] = useState<SfDashBriefing | null>(null);
  const [agentRows, setAgentRows] = useState<SfDashAgentItem[]>([]);

  useEffect(() => {
    let dead = false;
    setState("loading");
    (async () => {
      try {
        const [o, br, ag] = await Promise.all([
          sfFetch<SfDashOverview>("/api/dashboard/overview?days=7"),
          sfFetch<SfDashBriefing>("/api/dashboard/briefing?days=7"),
          sfFetch<{ items?: SfDashAgentItem[] }>("/api/dashboard/agents?days=7"),
        ]);
        if (dead) return;
        setOv(o ?? null);
        setBrief(br ?? null);
        setAgentRows(ag.items ?? []);
        setState("ready");
      } catch {
        if (dead) return;
        setOv(null);
        setBrief(null);
        setAgentRows([]);
        setState("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, [reload]);

  const runs = ov?.runs ?? { total: 0, succeeded: 0, failed: 0, canceled: 0, success_rate: null };
  const stats: Array<[string, string, string, string]> = ov
    ? (() => {
        const dc = fmtDelta(ov.usage.deltas.calls);
        const dt = fmtDelta(ov.usage.deltas.total_tokens);
        const dp = fmtDelta(ov.usage.deltas.cost_est_usd);
        return [
          ["LLM 调用", ov.usage.calls.toLocaleString(), dc[0], dc[1]],
          ["Token 消耗", fmtCompact(ov.usage.total_tokens), dt[0], dt[1]],
          ["估算成本", `$${ov.usage.cost_est_usd.toFixed(2)}`, dp[0], dp[1]],
          [
            "Run 成功率",
            runs.success_rate != null ? `${runs.success_rate}%` : "—",
            `共 ${runs.total} 次`,
            "",
          ],
        ];
      })()
    : [
        ["LLM 调用", "—", "—", ""],
        ["Token 消耗", "—", "—", ""],
        ["估算成本", "—", "—", ""],
        ["Run 成功率", "—", "—", ""],
      ];
  // Agent 产出排行 top5（agent_hops 交接产出字符）
  const agentBars: Array<[string, number, number]> = agentRows
    .slice(0, 5)
    .map((row) => [row.agent.slice(0, 8), row.output_chars ?? 0, row.hops ?? 0] as [string, number, number]);
  const maxAgentChars = Math.max(...agentBars.map(([, n]) => n), 1);

  return (
    <article className="sf-digest-card">
      <div className="sf-card-title">
        <div>
          <strong>运行数据速览</strong>
          <span>原「数据看板」重点 · 近 7 天 · 实时同步</span>
        </div>
        <div className="sf-digest-head">
          <SfLoadTag state={state} okText="已同步" />
          <button onClick={() => setReload((n) => n + 1)}>
            <RotateCcw size={12} /> 刷新
          </button>
        </div>
      </div>

      <div className="sf-metric-grid sf-digest-stats">
        {stats.map(([label, value, delta, deltaState]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
            <span className={deltaState}>{delta}</span>
          </article>
        ))}
      </div>

      <div className="sf-digest-cols">
        <div className="sf-digest-brief">
          <div className="sf-brief-highlight">
            <span>
              <Zap size={17} />
            </span>
            <div>
              <small>今日调用</small>
              <strong>{brief ? brief.today.calls : "—"}</strong>
            </div>
            <em>{brief ? `成本 $${brief.today.cost_est_usd.toFixed(2)}` : "—"}</em>
          </div>
          <ul>
            <li>
              <span>昨日调用</span>
              <strong>{brief ? brief.yesterday.calls : "—"}</strong>
            </li>
            <li>
              <span>7 日 Tokens</span>
              <strong>{brief ? fmtCompact(brief.trend_7d.total_tokens) : "—"}</strong>
            </li>
            <li>
              <span>失败任务</span>
              <strong className={runs.failed > 0 ? "warm" : ""}>{ov ? runs.failed : "—"}</strong>
            </li>
            <li>
              <span>经验记忆</span>
              <strong>
                {brief ? brief.lessons_learned.reduce((sum, l) => sum + l.n, 0) : "—"}
              </strong>
            </li>
          </ul>
          <div className="sf-dashboard-alert">
            <ShieldCheck size={15} />
            <span>{brief?.alerts?.[0] ?? "近 7 天无告警"}</span>
          </div>
        </div>

        <div className="sf-digest-agents">
          <div className="sf-card-title">
            <div>
              <strong>Agent 产出排行</strong>
              <span>按交接产出字符</span>
            </div>
          </div>
          <ul className="sf-usage-bars">
            {agentBars.length === 0 && (
              <li>
                <span className="sf-usage-name">暂无数据</span>
              </li>
            )}
            {agentBars.map(([name, chars, hops], i) => (
              <li key={name} title={`${name} · 交接 ${hops} 次`}>
                <span className="sf-usage-name">{name}</span>
                <span className="sf-usage-track">
                  <i
                    style={{
                      width: `${(chars / maxAgentChars) * 100}%`,
                      background: SF_PALETTE[i % SF_PALETTE.length],
                    }}
                  />
                </span>
                <span className="sf-usage-val">{fmtCompact(chars)} 字</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

// ── 生意看板（手工艺品代销业务域）──────────────────────────────────────────
// 数据全部来自后端：/api/craft-profit（商品/销售/盈利）、/api/ops（快递/运营步骤）、
// /api/social-publish（社媒账号/帖子）。不再回落演示假数据——空就是空。

type BizOverview = {
  sales_count: number;
  units: number;
  revenue_cents: number;
  cost_cents: number;
  shipping_cents: number;
  profit_cents: number;
  margin_pct: number | null;
};
type BizProduct = {
  id: string;
  name: string;
  /** 一句话卖点（商品页副标题）。 */
  subtitle: string;
  price_cents: number;
  /** 市场价（划线价，0 不展示）。 */
  market_price_cents: number;
  cost_cents: number;
  shipping_cents: number;
  /** 库存件数（下单扣减、取消回补）。 */
  stock: number;
  /** 商品介绍。 */
  intro: string;
  /** 宣传图列表（≤5 张，第一张封面；老数据空时看 image_url）。 */
  images: string[];
  /** active 在售 | off_shelf 已下架。 */
  status: string;
  sold_units: number;
  revenue_cents: number;
  profit_cents: number;
  /** 封面图（/projects/_uploads/... 相对直链，可空串；商品售卖列表用）。 */
  image_url: string;
  /** 每件盈利 = 售价 − 成本 − 快递（后端算好）。 */
  profit_per_unit_cents: number;
};
type BizSale = {
  id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price_cents: number;
  shipping_cents: number;
  /** 订单状态机：unpaid 待支付 / pending 待发货 / shipped 已发货 / done 已完成 / cancelled 已取消。 */
  status: string;
  tracking: string;
  /** 快递公司（管理端发货时填；[ship] 标记路径为空串）。 */
  express_company: string;
  /** 买家称呼/电话（扫码购买下单的单有值；[order] 标记落库为空串）。 */
  buyer_name: string;
  buyer_contact: string;
  /** 收货地址 / 备注 / 支付时间（unpaid 为 null）。 */
  address: string;
  note: string;
  paid_at: number | null;
  created_at: number;
  profit_cents: number;
};
type BizShipment = {
  id: string;
  carrier: string;
  mode: string;
  tracking_no: string;
  receiver_name: string;
  receiver_address: string;
  status: string;
  remark: string;
  created_at: number;
  shipped_at: number | null;
};
type BizPost = {
  id: string;
  platform: string;
  title: string;
  content: string;
  status: string;
  external_id: string | null;
  error: string | null;
  created_at: number;
  published_at: number | null;
};
type BizOpsStep = {
  key: string;
  name: string;
  count: number;
  done: boolean;
  gap: string[];
  next_hint: string;
};

/** 分 → 元。 */
function fmtYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}
/** 毫秒时间戳 → MM-DD HH:mm。 */
function fmtBizTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const BIZ_POST_STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: "已发布", cls: "ok" },
  failed: { label: "失败", cls: "bad" },
  draft: { label: "草稿", cls: "" },
};
/** 订单状态机徽标（2026-11-09 图1 订单管理）：unpaid→pending→shipped→done，cancelled 为终态。
 *  refunded 为历史遗留行兜底。 */
const BIZ_SALE_STATUS: Record<string, { label: string; cls: string }> = {
  unpaid: { label: "待支付", cls: "warn" },
  pending: { label: "待发货", cls: "info" },
  shipped: { label: "已发货", cls: "ok" },
  done: { label: "已完成", cls: "" },
  cancelled: { label: "已取消", cls: "bad" },
  refunded: { label: "已退款", cls: "bad" },
};

// ── 商品/博文卡片（2026-11-09 Task #4 数据看板）────────────────────────────
// 流水线（图片→AI 草拟→审批门→落商品）的产出面：商品卡（名称/图/状态/盈利）
// 与博文卡（标题/封面/状态/发布）。数据来自 be-worker Task #2 契约（2026-11-09 接入）：
//   GET /api/craft-products        → { items: CraftProductRow[] }（profit_per_unit_cents
//     每件盈利，后端算好；status: active|off_shelf，无「售罄」枚举）
//   GET /api/craft-profit/products?days=30 → { items: CraftProfitRow[] }（30 天累计
//     profit_cents；LEFT JOIN 口径零销量商品也返回 0，按商品 id 并联）
//   GET /api/craft-posts           → { items: CraftPostRow[] }（status: draft|confirmed|
//     published；封面取 images.find(is_image) 优先、回落 images[0]）
// 盈利口径（2026-11-09 与 be-worker 对齐）：主数字=近 30 天累计盈利 profit_cents，
// 每件盈利 profit_per_unit_cents 做小字次要展示。
// 金融约定：金额 ¥（fmtYuan），盈利涨跌用「涨红跌绿」（profit_delta_pct 契约暂无，
// 有值即着色，无值不显示环比）。

/** 商品行（对齐 /api/craft-products 响应；product_id 是 id 的别名）。 */
type CraftProductRow = {
  id: string;
  product_id?: string;
  name: string;
  /** 商品图（聊天附件 url / 本地路径，可空串）。 */
  image_url: string;
  /** active 在售 | off_shelf 已下架。 */
  status: string;
  /** 来源博文（管道落商品反引；手动上传为空）。 */
  source_post_id?: string | null;
  /** 每件盈利（分），后端算好。 */
  profit_per_unit_cents: number;
  created_at: number;
};

/** 博文行（对齐 /api/craft-posts 响应）。 */
type CraftPostRow = {
  post_id: string;
  title: string;
  images: Array<{ name?: string; url: string; is_image?: boolean }>;
  /** draft 草稿 | confirmed 已确认 | published 已发布（单向状态机）。 */
  status: string;
  /** 关联商品（cp_products.id，null=未关联）；卡片只留挂在实际商品上的。 */
  product_id?: string | null;
  created_at: number;
  published_at: number | null;
};

/** 看板卡片视图模型（渲染层消费，字段按 brief：商品 名称/图/状态/盈利；博文 标题/封面/状态/发布）。 */
type CraftCardProduct = {
  id: string;
  name: string;
  image_url: string;
  status: string;
  /** 每件盈利（分），小字次要展示。 */
  profit_per_unit_cents: number;
  /** 近 30 天累计盈利（分），卡片主数字（/api/craft-profit/products?days=30）。 */
  profit_30d_cents: number;
  /** 盈利环比（%）；null=无数据（契约暂未提供）。涨红跌绿：涨(+)红、跌(−)绿。 */
  profit_delta_pct: number | null;
};
type CraftCardPost = {
  id: string;
  title: string;
  /** 封面（images.find(is_image) 优先、回落 images[0]；空串=占位图）。 */
  cover_url: string;
  status: string;
  published_at: number | null;
};

/** 30 天累计盈利行（对齐 /api/craft-profit/products?days=30；LEFT JOIN 零销量返回 0）。 */
type CraftProfitRow = {
  id: string;
  sold_units: number;
  revenue_cents: number;
  profit_cents: number;
};

const CRAFT_PRODUCT_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "在售", cls: "ok" },
  off_shelf: { label: "已下架", cls: "bad" },
};
const CRAFT_POST_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "" },
  confirmed: { label: "已确认", cls: "info" },
  published: { label: "已发布", cls: "ok" },
};

/** 卡片数据入口（2026-11-09 接 be-worker 契约）：目录域两读端点 + 盈利聚合并发拉取后映射为卡片视图。 */
async function fetchCraftCards(): Promise<{ products: CraftCardProduct[]; posts: CraftCardPost[] }> {
  const [pr, po, pf] = await Promise.all([
    sfFetch<{ items?: CraftProductRow[] }>("/api/craft-products"),
    sfFetch<{ items?: CraftPostRow[] }>("/api/craft-posts"),
    // 30 天累计盈利（LEFT JOIN 口径：零销量商品也返回 0），按商品 id 并联到目录
    sfFetch<{ items?: CraftProfitRow[] }>("/api/craft-profit/products?days=30"),
  ]);
  const profitById = new Map((pf.items ?? []).map((r) => [r.id, r]));
  // 卡片与商品同生共死（2026-11-08）：博文卡只保留挂在实际商品上的——
  // product_id 直挂 或 商品 source_post_id 反引（管道回挂口径）；无主博文
  // （商品已删 / 测试残留）不出卡，与下方实际商品（货架/商品管理）对齐。
  const productIds = new Set((pr.items ?? []).map((p) => p.id));
  const sourcePostIds = new Set(
    (pr.items ?? []).map((p) => p.source_post_id).filter((v): v is string => !!v),
  );
  return {
    products: (pr.items ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url ?? "",
      status: p.status,
      profit_per_unit_cents: p.profit_per_unit_cents ?? 0,
      // 主数字=近 30 天累计盈利；查不到聚合行按 0 兜底
      profit_30d_cents: profitById.get(p.id)?.profit_cents ?? 0,
      // 环比字段契约暂无：留位，有值即按涨红跌绿着色
      profit_delta_pct: null,
    })),
    posts: (po.items ?? [])
      .filter((t) => (t.product_id ? productIds.has(t.product_id) : sourcePostIds.has(t.post_id)))
      .map((t) => ({
        id: t.post_id,
        title: t.title,
        // 封面取第一张图片附件（is_image），回落首个附件（2026-11-09 be-worker 契约修订）
        cover_url: t.images?.find((i) => i.is_image)?.url ?? t.images?.[0]?.url ?? "",
        status: t.status,
        published_at: t.published_at ?? null,
      })),
  };
}

/**
 * 商品/博文卡片区（2026-11-09 Task #4）：加载/错误/空态/正常四态齐全。
 * 图片走 chatAssetUrl 服务端直链；空就是空（不回落演示假数据）。
 */
function CraftCardsSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<SfLoadState>("loading");
  const [products, setProducts] = useState<CraftCardProduct[]>([]);
  const [posts, setPosts] = useState<CraftCardPost[]>([]);
  useEffect(() => {
    let dead = false;
    setState("loading");
    fetchCraftCards()
      .then((d) => {
        if (dead) return;
        setProducts(d.products);
        setPosts(d.posts);
        setState("ready");
      })
      .catch(() => {
        if (dead) return;
        setProducts([]);
        setPosts([]);
        setState("error");
      });
    return () => {
      dead = true;
    };
  }, [refreshKey]);

  return (
    <article className="sf-craft-cards">
      <div className="sf-card-title">
        <div>
          <strong>商品 · 博文卡片</strong>
          <span>流水线产出：图片 → AI 草拟 → 审批门 → 落商品</span>
        </div>
        <div className="sf-craft-head">
          <SfLoadTag state={state} okText="已同步" />
        </div>
      </div>

      <p className="sf-craft-group">商品</p>
      {state === "ready" && products.length === 0 && (
        <p className="sf-craft-empty">还没有商品 —— 流水线落商品后在此上架</p>
      )}
      <div className="sf-craft-grid">
        {products.map((p) => {
          const st = CRAFT_PRODUCT_STATUS[p.status] ?? { label: p.status, cls: "" };
          const d = p.profit_delta_pct;
          return (
            <article key={p.id} className="sf-craft-card">
              <div className="sf-craft-thumb">
                {p.image_url ? (
                  <img src={chatAssetUrl(p.image_url)} alt={p.name} loading="lazy" />
                ) : (
                  <span>
                    <Store size={20} />
                  </span>
                )}
              </div>
              <div className="sf-craft-info">
                <strong title={p.name}>{p.name}</strong>
                <div className="sf-craft-meta">
                  <span className={`sf-biz-badge ${st.cls}`}>{st.label}</span>
                </div>
                <div className="sf-craft-money">
                  <em>盈利 · 近30天</em>
                  <b>{fmtYuan(p.profit_30d_cents)}</b>
                  {/* 每件盈利降为小字次要（2026-11-09 be-worker 盈利口径） */}
                  <small>每件 {fmtYuan(p.profit_per_unit_cents)}</small>
                  {d != null && (
                    // 涨红跌绿（金融约定）：盈利上涨红、下跌绿
                    <span className={`sf-craft-delta ${d >= 0 ? "up" : "down"}`}>
                      {d >= 0 ? "▲" : "▼"} {Math.abs(d)}%
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="sf-craft-group">博文</p>
      {state === "ready" && posts.length === 0 && (
        <p className="sf-craft-empty">还没有博文 —— 流水线草拟确认后在此展示</p>
      )}
      <div className="sf-craft-grid">
        {posts.map((p) => {
          const st = CRAFT_POST_STATUS[p.status] ?? { label: p.status, cls: "" };
          return (
            <article key={p.id} className="sf-craft-card">
              <div className="sf-craft-thumb">
                {p.cover_url ? (
                  <img src={chatAssetUrl(p.cover_url)} alt={p.title} loading="lazy" />
                ) : (
                  <span>
                    <BookOpen size={20} />
                  </span>
                )}
              </div>
              <div className="sf-craft-info">
                <strong title={p.title}>{p.title}</strong>
                <div className="sf-craft-meta">
                  <span className={`sf-biz-badge ${st.cls}`}>{st.label}</span>
                </div>
                <div className="sf-craft-money">
                  <em>发布</em>
                  <b>{p.published_at ? fmtBizTime(p.published_at) : "未发布"}</b>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </article>
  );
}

/** 购买链接的紧凑展示形式（host + #/buy/短 id…）；title 里放完整 URL。 */
function shortBuyUrl(url: string): string {
  try {
    const u = new URL(url);
    const id = u.hash.replace(/^#\/buy\//, "");
    return `${u.host}/#/buy/${id.slice(0, 8)}…`;
  } catch {
    return url.length > 36 ? `${url.slice(0, 36)}…` : url;
  }
}

function BizView({ runsSig }: { runsSig?: string }) {
  const [tab, setTab] = useState<"overview" | "products" | "sales" | "shipments" | "posts">("overview");
  const [state, setState] = useState<SfLoadState>("loading");
  const [ov, setOv] = useState<BizOverview | null>(null);
  const [products, setProducts] = useState<BizProduct[]>([]);
  const [sales, setSales] = useState<BizSale[]>([]);
  const [shipments, setShipments] = useState<BizShipment[]>([]);
  const [posts, setPosts] = useState<BizPost[]>([]);
  const [steps, setSteps] = useState<BizOpsStep[]>([]);
  const [shopDialog, setShopDialog] = useState<
    { mode: "add" } | { mode: "edit"; product: BizProduct } | null
  >(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** 卡片区刷新钥匙（2026-11-08 卡片伴随商品生命周期）：商品增删后自增重拉卡片。 */
  const [cardsKey, setCardsKey] = useState(0);
  /** 订单管理（2026-11-09 图1）：状态筛选 chips / 发货弹窗 / 取消订单二步确认。 */
  const [orderFilter, setOrderFilter] = useState<"all" | "unpaid" | "pending" | "shipped" | "done" | "cancelled">("all");
  const [shipFor, setShipFor] = useState<BizSale | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const load = useCallback((silent = false) => {
    if (!silent) setState("loading");
    sfFetch<BizOverview>("/api/craft-profit/overview")
      .then((d) => {
        setOv(d);
        setState("ready");
      })
      .catch(() => {
        setOv(null);
        setState("error");
      });
    sfFetch<{ items?: BizProduct[] }>("/api/craft-profit/products")
      .then((d) => setProducts(d.items ?? []))
      .catch(() => setProducts([]));
    sfFetch<{ items?: BizSale[] }>("/api/craft-profit/sales?limit=500")
      .then((d) => setSales(d.items ?? []))
      .catch(() => setSales([]));
    sfFetch<{ shipments?: BizShipment[] }>("/api/ops/shipments")
      .then((d) => setShipments(d.shipments ?? []))
      .catch(() => setShipments([]));
    sfFetch<{ posts?: BizPost[] }>("/api/social-publish/posts")
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => setPosts([]));
    sfFetch<{ steps?: BizOpsStep[] }>("/api/ops/overview")
      .then((d) => setSteps(d.steps ?? []))
      .catch(() => setSteps([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // 看板同步（2026-11-09）：团队干活落库（[intake]/[post]/[order]/[ship]/[report]
  // 标记）发生在聊天轮里——run 状态翻转（一轮干完/新任务开跑）→ 静默刷新；
  // 另挂 15s 兜底轮询覆盖轮内增量（silent 不闪加载骨架）。
  const lastSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSigRef.current === null) {
      lastSigRef.current = runsSig ?? "";
      return; // 首个值由挂载时的 load() 覆盖
    }
    if (lastSigRef.current === runsSig) return;
    lastSigRef.current = runsSig ?? "";
    load(true);
  }, [load, runsSig]);
  useEffect(() => {
    const t = setInterval(() => load(true), 15_000);
    return () => clearInterval(t);
  }, [load]);

  /** 发布/重试发布帖子（POST /api/social-publish/posts/:id/publish）。 */
  async function publishPost(id: string) {
    try {
      await sfFetch(`/api/social-publish/posts/${id}/publish`, { method: "POST" });
    } finally {
      load();
    }
  }
  /** 发货（POST /api/ops/shipments/:id/ship，mock/真实由运单 mode 决定）。 */
  async function shipShipment(id: string) {
    try {
      await sfFetch(`/api/ops/shipments/${id}/ship`, { method: "POST" });
    } finally {
      load();
    }
  }

  /** 删除商品（DELETE /api/craft-profit/products/:id）：两步确认后调用。
   *  失败静默刷新回真实状态；销售流水保留快照，历史盈利不变。 */
  async function removeProduct(id: string) {
    try {
      await sfFetch(`/api/craft-profit/products/${id}`, { method: "DELETE" });
    } catch {
      /* 删除失败（网络/后端）时下方 load() 会还原真实状态 */
    } finally {
      setConfirmDel(null);
      setCardsKey((k) => k + 1); // 卡片伴随商品消失：博文卡随商品级联撤下，卡片区即时重拉
      load();
    }
  }

  /** 复制购买链接（剪贴板不可用的非安全上下文时静默降级）。 */
  async function copyBuyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* 剪贴板不可用 —— 用户仍可手动复制链接文本 */
    }
  }

  /** 标记完成（POST /api/craft-profit/sales/:id/complete）：shipped→done，幂等。 */
  async function completeOrder(id: string) {
    try {
      await sfFetch(`/api/craft-profit/sales/${id}/complete`, { method: "POST" });
    } catch {
      /* 失败静默，load() 还原真实状态 */
    } finally {
      load();
    }
  }
  /** 取消订单（POST /api/craft-profit/sales/:id/cancel）：仅待支付单可取消，库存回补。 */
  async function cancelOrder(id: string) {
    try {
      await sfFetch(`/api/craft-profit/sales/${id}/cancel`, { method: "POST" });
    } catch {
      /* 失败静默，load() 还原真实状态 */
    } finally {
      setConfirmCancel(null);
      load();
    }
  }

  const kpis: Array<[string, string, string]> = [
    ["营收", ov ? fmtYuan(ov.revenue_cents) : "—", "近 30 天"],
    ["盈利", ov ? fmtYuan(ov.profit_cents) : "—", ov?.margin_pct != null ? `利润率 ${ov.margin_pct}%` : "利润率 —"],
    ["售出", ov ? `${ov.units} 件` : "—", ov ? `${ov.sales_count} 单` : "—"],
    ["成本", ov ? fmtYuan(ov.cost_cents + ov.shipping_cents) : "—", "货本 + 运费"],
  ];

  return (
    <section className="sf-subview">
      <div className="sf-subview-intro">
        <div>
          <p>BUSINESS BOARD</p>
          <h1>生意看板</h1>
          <span>手工艺品代销：商品、销售、快递、社媒与盈利，实时同步自后端业务域。</span>
        </div>
        <button onClick={() => load()}>
          <RotateCcw size={15} /> 刷新
        </button>
      </div>
      <SfLoadTag state={state} okText="业务数据已同步" />

      <div className="sf-biz-kpi">
        {kpis.map(([label, value, sub]) => (
          <article key={label} className="sf-biz-kpi-card">
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{sub}</span>
          </article>
        ))}
      </div>

      {steps.length > 0 && (
        <div className="sf-biz-steps">
          {steps.map((s) => (
            <div key={s.key} className={`sf-biz-step ${s.done ? "done" : ""}`} title={s.next_hint}>
              <span>{s.done ? "✓" : "·"}</span>
              <strong>{s.name}</strong>
              <small>{s.done ? `${s.count} 项完成` : s.gap[0] || `${s.count} 项`}</small>
            </div>
          ))}
        </div>
      )}

      <div className="sf-biz-tabs">
        {(
          [
            ["overview", "总览"],
            ["products", `商品 ${products.length}`],
            ["sales", `订单 ${sales.length}`],
            ["shipments", `快递 ${shipments.length}`],
            ["posts", `社媒 ${posts.length}`],
          ] as Array<[typeof tab, string]>
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <RunDigestCard />}

      {/* 商品/博文卡片（2026-11-09 Task #4）：流水线产出面，接 /api/craft-products + /api/craft-posts */}
      {tab === "overview" && <CraftCardsSection refreshKey={cardsKey} />}

      {tab === "overview" && (
        <div className="sf-biz-table-wrap">
          <table className="sf-biz-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>数值</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>营收</td>
                <td>{ov ? fmtYuan(ov.revenue_cents) : "—"}</td>
                <td>全部销售流水</td>
              </tr>
              <tr>
                <td>货本</td>
                <td>{ov ? fmtYuan(ov.cost_cents) : "—"}</td>
                <td>商品成本合计</td>
              </tr>
              <tr>
                <td>运费</td>
                <td>{ov ? fmtYuan(ov.shipping_cents) : "—"}</td>
                <td>快递费用合计</td>
              </tr>
              <tr>
                <td>盈利</td>
                <td>{ov ? fmtYuan(ov.profit_cents) : "—"}</td>
                <td>营收 − 货本 − 运费</td>
              </tr>
              <tr>
                <td>利润率</td>
                <td>{ov?.margin_pct != null ? `${ov.margin_pct}%` : "—"}</td>
                <td>盈利 / 营收</td>
              </tr>
              <tr>
                <td>社媒发布</td>
                <td>{posts.filter((p) => p.status === "published").length} / {posts.length}</td>
                <td>已发布帖子 / 全部帖子</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "products" && (
        <div className="sf-biz-table-wrap">
          <table className="sf-biz-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>售价</th>
                <th>货本</th>
                <th>运费</th>
                <th>已售</th>
                <th>营收</th>
                <th>盈利</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="sf-biz-empty">
                    还没有商品 —— 让团队执行 [intake] 登记商品
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{fmtYuan(p.price_cents)}</td>
                  <td>{fmtYuan(p.cost_cents)}</td>
                  <td>{fmtYuan(p.shipping_cents)}</td>
                  <td>{p.sold_units}</td>
                  <td>{fmtYuan(p.revenue_cents)}</td>
                  <td>{fmtYuan(p.profit_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 订单管理（2026-11-09 图1「商品与订单」）：KPI 行 + 状态筛选 + 订单卡片，
          发货/完成/取消全走真实状态机端点，库存与统计随 load() 联动刷新。 */}
      {tab === "sales" && (
        <div className="sf-orders">
          <div className="sf-biz-kpi sf-orders-kpi">
            <article className="sf-biz-kpi-card">
              <p>商品</p>
              <strong>{products.length}</strong>
              <span>
                在售 {products.filter((p) => p.status === "active").length} · 下架{" "}
                {products.filter((p) => p.status !== "active").length}
              </span>
            </article>
            <article className="sf-biz-kpi-card">
              <p>库存</p>
              <strong>{products.reduce((n, p) => n + p.stock, 0)} 件</strong>
              <span>可售库存合计</span>
            </article>
            <article className="sf-biz-kpi-card">
              <p>累计销量</p>
              <strong>{products.reduce((n, p) => n + p.sold_units, 0)} 件</strong>
              <span>已支付订单口径</span>
            </article>
            <article className="sf-biz-kpi-card">
              <p>待发货</p>
              <strong>{sales.filter((s) => s.status === "pending").length} 笔</strong>
              <span>支付后待寄出</span>
            </article>
          </div>

          <div className="sf-order-filters">
            {(
              [
                ["all", "全部"],
                ["unpaid", "待支付"],
                ["pending", "待发货"],
                ["shipped", "已发货"],
                ["done", "已完成"],
                ["cancelled", "已取消"],
              ] as Array<["all" | "unpaid" | "pending" | "shipped" | "done" | "cancelled", string]>
            ).map(([key, label]) => {
              const n = key === "all" ? sales.length : sales.filter((s) => s.status === key).length;
              return (
                <button
                  key={key}
                  className={orderFilter === key ? "active" : ""}
                  onClick={() => setOrderFilter(key)}
                >
                  {label} {n}
                </button>
              );
            })}
          </div>

          {(orderFilter === "all" ? sales : sales.filter((s) => s.status === orderFilter)).length === 0 ? (
            <p className="sf-order-empty">
              {sales.length === 0
                ? "还没有订单 —— 顾客扫码下单后会出现在这里（[order] 标记登记的也在此列）"
                : "该状态下没有订单"}
            </p>
          ) : (
            (orderFilter === "all" ? sales : sales.filter((s) => s.status === orderFilter)).map((s) => {
              const st = BIZ_SALE_STATUS[s.status] ?? { label: s.status, cls: "" };
              return (
                <article key={s.id} className="sf-order-card">
                  <div className="sf-order-top">
                    <strong>{s.product_name || "—"}</strong>
                    <span className={`sf-biz-badge ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="sf-order-price">
                    {fmtYuan(s.price_cents)} × {s.qty} 件 · 运费 {fmtYuan(s.shipping_cents)}
                    <b className="sf-order-total">
                      合计 {fmtYuan((s.price_cents + s.shipping_cents) * s.qty)}
                    </b>
                  </p>
                  <div className="sf-order-meta">
                    <span>下单 {fmtBizTime(s.created_at)}</span>
                    {s.paid_at ? <span>支付 {fmtBizTime(s.paid_at)}</span> : null}
                    <span className="sf-order-profit">盈利 {fmtYuan(s.profit_cents)}</span>
                  </div>
                  {(s.buyer_name || s.buyer_contact) && (
                    <div className="sf-order-row">
                      <em>买家</em>
                      {s.buyer_name || "—"}
                      {s.buyer_contact ? ` · ${s.buyer_contact}` : ""}
                    </div>
                  )}
                  {s.address ? (
                    <div className="sf-order-row">
                      <em>地址</em>
                      {s.address}
                    </div>
                  ) : null}
                  {s.note ? (
                    <div className="sf-order-row">
                      <em>备注</em>
                      {s.note}
                    </div>
                  ) : null}
                  {(s.express_company || s.tracking) && (
                    <div className="sf-order-row">
                      <em>快递</em>
                      {s.express_company || "—"} {s.tracking}
                    </div>
                  )}
                  {(s.status === "pending" || s.status === "shipped" || s.status === "unpaid") && (
                    <div className="sf-order-actions">
                      {s.status === "pending" && (
                        <button className="sf-order-primary" onClick={() => setShipFor(s)}>
                          发货
                        </button>
                      )}
                      {s.status === "shipped" && (
                        <button className="sf-order-primary" onClick={() => void completeOrder(s.id)}>
                          标记完成
                        </button>
                      )}
                      {s.status === "unpaid" &&
                        (confirmCancel === s.id ? (
                          <>
                            <button className="sf-order-danger" onClick={() => void cancelOrder(s.id)}>
                              确认取消
                            </button>
                            <button className="sf-biz-act" onClick={() => setConfirmCancel(null)}>
                              返回
                            </button>
                          </>
                        ) : (
                          <button className="sf-order-cancel" onClick={() => setConfirmCancel(s.id)}>
                            取消订单
                          </button>
                        ))}
                    </div>
                  )}
                </article>
              );
            })
          )}

          {shipFor && (
            <BizShipDialog
              sale={shipFor}
              onClose={() => setShipFor(null)}
              onShipped={() => {
                setShipFor(null);
                load();
              }}
            />
          )}
        </div>
      )}

      {tab === "shipments" && (
        <div className="sf-biz-table-wrap">
          <table className="sf-biz-table">
            <thead>
              <tr>
                <th>承运</th>
                <th>运单号</th>
                <th>收件人</th>
                <th>状态</th>
                <th>寄出时间</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={7} className="sf-biz-empty">
                    还没有快递单 —— 让团队执行 [ship] 寄件
                  </td>
                </tr>
              )}
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.carrier.toUpperCase()} · {s.mode}
                  </td>
                  <td>{s.tracking_no || "—"}</td>
                  <td>{s.receiver_name}</td>
                  <td>
                    <span className={`sf-biz-badge ${s.status === "shipped" ? "ok" : "warn"}`}>
                      {s.status === "shipped" ? "已寄出" : s.status}
                    </span>
                  </td>
                  <td>{fmtBizTime(s.shipped_at)}</td>
                  <td>{s.remark || "—"}</td>
                  <td>
                    {s.status !== "shipped" && (
                      <button className="sf-biz-act" onClick={() => void shipShipment(s.id)}>
                        发货
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "posts" && (
        <div className="sf-biz-table-wrap">
          <table className="sf-biz-table">
            <thead>
              <tr>
                <th>平台</th>
                <th>标题</th>
                <th>状态</th>
                <th>外部 ID</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {posts.length === 0 && (
                <tr>
                  <td colSpan={6} className="sf-biz-empty">
                    还没有帖子 —— 让团队执行 [post] 发帖
                  </td>
                </tr>
              )}
              {posts.map((p) => {
                const st = BIZ_POST_STATUS[p.status] ?? { label: p.status, cls: "" };
                return (
                  <tr key={p.id}>
                    <td>{p.platform}</td>
                    <td title={p.content}>{p.title || "（无标题）"}</td>
                    <td>
                      <span className={`sf-biz-badge ${st.cls}`}>{st.label}</span>
                      {p.error ? <small className="sf-biz-err">{p.error}</small> : null}
                    </td>
                    <td>{p.external_id || "—"}</td>
                    <td>{fmtBizTime(p.published_at ?? p.created_at)}</td>
                    <td>
                      {p.status !== "published" && (
                        <button className="sf-biz-act" onClick={() => void publishPost(p.id)}>
                          发布
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 商品售卖列表（2026-11-08）：看板底部常驻货架 —— 每件商品带购买链接，
          顾客打开链接进 #/buy/<id> 购买页下单并在页面内付费；右上「添加商品」上架。 */}
      <div className="sf-shop">
        <div className="sf-shop-head">
          <div>
            <h2>商品售卖列表</h2>
            <p>顾客打开商品链接即可进购买页下单，在链接页面完成支付</p>
          </div>
          <button className="sf-shop-add" onClick={() => setShopDialog({ mode: "add" })}>
            <Plus size={14} /> 添加商品
          </button>
        </div>
        {products.length === 0 ? (
          <p className="sf-shop-empty">还没有商品 —— 点右上「添加商品」上架第一件手工艺品</p>
        ) : (
          <div className="sf-shop-grid">
            {products.map((p) => {
              const buyUrl = productBuyUrl(p.id);
              return (
                <article key={p.id} className="sf-shop-card">
                  <div className="sf-shop-img">
                    {p.image_url ? (
                      <img
                        src={chatAssetUrl(p.image_url)}
                        alt={p.name}
                        onError={(e) => {
                          // 图片链接失效（文件被清理等）→ 降级占位，不显破图
                          e.currentTarget.style.display = "none";
                          e.currentTarget.parentElement?.classList.add("sf-shop-img-broken");
                        }}
                      />
                    ) : (
                      <span>
                        <Store size={22} />
                      </span>
                    )}
                  </div>
                  <div className="sf-shop-info">
                    <strong>{p.name}</strong>
                    <p className="sf-shop-price">{fmtYuan(p.price_cents)}</p>
                    <small>
                      已售 {p.sold_units} 件 · 每件盈利 {fmtYuan(p.profit_per_unit_cents)} · 库存{" "}
                      {p.stock} 件
                      {p.status !== "active" ? " · 已下架" : ""}
                    </small>
                  </div>
                  {/* 商品链接（2026-11-08 下午：货架收款码撤掉，付费引导统一
                      走链接页）：链接旁提示买家在链接页面完成支付，一键复制；
                      删除走两步确认防误触（销售流水保留，历史盈利不变）。 */}
                  <div className="sf-shop-foot">
                    <a
                      className="sf-shop-link"
                      href={buyUrl}
                      title={buyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortBuyUrl(buyUrl)}
                    </a>
                    <span className="sf-shop-pay-hint" title="请把链接发给买家，买家在链接页面内下单并完成支付">
                      请在链接页面付费
                    </span>
                    <button
                      className="sf-shop-copy"
                      title="复制购买链接"
                      onClick={() => void copyBuyLink(p.id, buyUrl)}
                    >
                      {copiedId === p.id ? <Check size={11} /> : <Copy size={11} />}
                      {copiedId === p.id ? "已复制" : "复制"}
                    </button>
                    <button
                      className="sf-shop-copy"
                      title="编辑商品"
                      onClick={() => setShopDialog({ mode: "edit", product: p })}
                    >
                      <Pencil size={11} /> 编辑
                    </button>
                    {confirmDel === p.id ? (
                      <span className="sf-shop-del-ask">
                        <button className="sf-shop-del-yes" onClick={() => void removeProduct(p.id)}>
                          确认删除
                        </button>
                        <button className="sf-shop-del-no" onClick={() => setConfirmDel(null)}>
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        className="sf-shop-del"
                        title="删除商品"
                        onClick={() => setConfirmDel(p.id)}
                      >
                        <Trash2 size={11} /> 删除
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {shopDialog && (
        <BizProductDialog
          product={shopDialog.mode === "edit" ? shopDialog.product : null}
          onClose={() => setShopDialog(null)}
          onSaved={() => {
            setShopDialog(null);
            setCardsKey((k) => k + 1); // 卡片伴随商品出生：商品卡+草稿博文卡即时上板
            load();
          }}
        />
      )}
    </section>
  );
}

/** 商品弹窗（添加/编辑，2026-11-08 图3 商品编辑）：完整商品信息 + 宣传图多张（第一张封面）。
 *  添加走 POST /api/craft-products，编辑走 PATCH /api/craft-products/:id（apiGuard 内网写）。
 *  毛利 = 售价 − 成本（不含运费），随输入实时提示。 */
function BizProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: BizProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [subtitle, setSubtitle] = useState(product?.subtitle ?? "");
  const [price, setPrice] = useState(product ? (product.price_cents / 100).toFixed(2) : "");
  const [cost, setCost] = useState(product ? (product.cost_cents / 100).toFixed(2) : "");
  const [market, setMarket] = useState(
    product && product.market_price_cents > 0 ? (product.market_price_cents / 100).toFixed(2) : "",
  );
  const [stock, setStock] = useState(product ? String(product.stock) : "999");
  const [ship, setShip] = useState(product ? (product.shipping_cents / 100).toFixed(2) : "");
  const [pstatus, setPstatus] = useState(product?.status ?? "active");
  const [intro, setIntro] = useState(product?.intro ?? "");
  // 宣传图初始列表（2026-11-08 黑屏修复）：接口 images 出过 JSON 文本形态（"[]"），
  // 直接当数组用会在 keptUrls.map 抛错整页崩掉 —— 数组 / JSON 文本 / 异常三态都归一成 string[]。
  const initImgs: string[] = (() => {
    const raw: unknown = product?.images;
    let list: unknown[] = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    }
    return list.filter((x): x is string => typeof x === "string").slice(0, 5);
  })();
  const [keptUrls, setKeptUrls] = useState<string[]>(
    initImgs.length > 0 ? initImgs : product?.image_url ? [product.image_url] : [],
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const totalImgs = keptUrls.length + newFiles.length;

  function pickFiles(list: FileList | null) {
    setError("");
    if (!list) return;
    const added: File[] = [];
    for (const f of Array.from(list)) {
      if (totalImgs + added.length >= 5) {
        setError("宣传图最多 5 张");
        break;
      }
      if (!f.type.startsWith("image/")) {
        setError("只支持图片文件（png / jpg / webp 等）");
        continue;
      }
      if (f.size > CHAT_UPLOAD_MAX_BYTES) {
        setError("图片超过 8MB，请压缩后再传");
        continue;
      }
      added.push(f);
    }
    if (added.length === 0) return;
    setNewFiles((prev) => [...prev, ...added]);
    for (const f of added) {
      const reader = new FileReader();
      reader.onload = () => setNewPreviews((prev) => [...prev, String(reader.result ?? "")]);
      reader.readAsDataURL(f);
    }
  }

  function removeAt(i: number) {
    if (i < keptUrls.length) {
      setKeptUrls((prev) => prev.filter((_, x) => x !== i));
    } else {
      const j = i - keptUrls.length;
      setNewFiles((prev) => prev.filter((_, x) => x !== j));
      setNewPreviews((prev) => prev.filter((_, x) => x !== j));
    }
  }

  function yuanToCents(v: string, field: string): number {
    const n = Number(v);
    if (v.trim() !== "" && (!Number.isFinite(n) || n < 0)) throw new Error(`${field} 不能是负数`);
    return Math.round((Number.isFinite(n) ? n : 0) * 100);
  }

  const priceNum = Number(price);
  const costNum = Number(cost);
  const marginPct =
    Number.isFinite(priceNum) && priceNum > 0 && Number.isFinite(costNum)
      ? Math.round(((priceNum - costNum) / priceNum) * 1000) / 10
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!name.trim()) {
      setError("请填写商品名称");
      return;
    }
    let priceCents = 0;
    let costCents = 0;
    let shipCents = 0;
    let marketCents = 0;
    let stockN = 0;
    try {
      priceCents = yuanToCents(price, "售价");
      costCents = yuanToCents(cost, "成本");
      shipCents = yuanToCents(ship, "运费");
      marketCents = yuanToCents(market, "市场价");
      stockN = Number(stock);
      if (!Number.isInteger(stockN) || stockN < 0) throw new Error("库存必须是非负整数");
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setBusy(true);
    try {
      // 新图走聊天附件同款上传（_uploads/<ts>-<rand>/，/projects 直链）；
      // 列表顺序 = 展示顺序，第一张为封面（与 image_url 同步）。
      const uploaded: string[] = [];
      for (const f of newFiles) {
        const att = await uploadChatAttachment(f);
        uploaded.push(att.url);
      }
      const images = [...keptUrls, ...uploaded];
      const payload = {
        name: name.trim(),
        subtitle: subtitle.trim(),
        price_cents: priceCents,
        market_price_cents: marketCents,
        cost_cents: costCents,
        shipping_cents: shipCents,
        stock: stockN,
        intro: intro.trim(),
        images,
        status: pstatus,
      };
      if (editing) {
        await sfFetch(`/api/craft-products/${encodeURIComponent(product.id)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        const created = await sfFetch<{ product_id?: string; id?: string }>(
          "/api/craft-products",
          { method: "POST", body: JSON.stringify(payload) },
        );
        // 卡片伴随商品出生（2026-11-08）：上传商品成对生成博文草稿卡（封面=商品
        // 首图、正文=商品简介），删除商品时随商品级联删除——卡片与商品同生共死。
        const pid = created.product_id ?? created.id ?? "";
        if (pid) {
          const cover = images[0] ?? "";
          try {
            await sfFetch("/api/craft-posts", {
              method: "POST",
              body: JSON.stringify({
                title: name.trim(),
                body: intro.trim(),
                product_id: pid,
                images: cover
                  ? [{ name: "商品封面", path: cover, url: cover, is_image: true }]
                  : [],
              }),
            });
          } catch {
            /* 伴随卡生成失败不阻断商品上架（商品卡仍会正常上板） */
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-shop-mask" onClick={onClose}>
      <div className="sf-shop-modal sf-shop-modal-wide" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{editing ? "编辑商品" : "添加商品"}</h3>
          <button className="sf-shop-close" onClick={onClose} aria-label="关闭">
            <X size={15} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="sf-shop-modal-body">
            <div className="sf-shop-fields">
              <label>
                <span>商品名称 *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：水杯"
                  maxLength={200}
                />
              </label>
              <label>
                <span>一句话卖点</span>
                <input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="如：一个水杯"
                  maxLength={200}
                />
              </label>
              <div className="sf-shop-fields-row">
                <label>
                  <span>售价（元）*</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="21.00"
                    inputMode="decimal"
                  />
                </label>
                <label>
                  <span>成本（元）</span>
                  <input
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="12.00"
                    inputMode="decimal"
                  />
                </label>
                <label>
                  <span>市场价（元）</span>
                  <input
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    placeholder="40.00（划线价，可空）"
                    inputMode="decimal"
                  />
                </label>
              </div>
              <div className="sf-shop-fields-row">
                <label>
                  <span>库存（件）</span>
                  <input
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="999"
                    inputMode="numeric"
                  />
                </label>
                <label>
                  <span>运费（元）</span>
                  <input
                    value={ship}
                    onChange={(e) => setShip(e.target.value)}
                    placeholder="2.00"
                    inputMode="decimal"
                  />
                </label>
                <label>
                  <span>上架状态</span>
                  <select value={pstatus} onChange={(e) => setPstatus(e.target.value)}>
                    <option value="active">在售</option>
                    <option value="off_shelf">已下架</option>
                  </select>
                </label>
              </div>
              <p className="sf-shop-margin-tip">
                毛利 = 售价 − 成本，当前毛利 <strong>{marginPct !== null ? `${marginPct}%` : "—"}</strong>
                ；营收统计不含运费。
              </p>
              <label>
                <span>商品介绍</span>
                <textarea
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="一个可以喝水的水杯"
                />
              </label>
            </div>
            <div className="sf-shop-pick sf-shop-pick-multi">
              <span className="sf-shop-pick-title">宣传图片（最多 5 张，第一张为封面）</span>
              <div className="sf-shop-imgs">
                {keptUrls.map((u, i) => (
                  <div key={`k${i}`} className="sf-shop-img-tile">
                    <img src={chatAssetUrl(u)} alt={`宣传图 ${i + 1}`} />
                    {i === 0 ? <em className="sf-shop-cover">封面</em> : null}
                    <button
                      type="button"
                      className="sf-shop-img-x"
                      onClick={() => removeAt(i)}
                      aria-label="移除图片"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {newPreviews.map((u, i) => (
                  <div key={`n${i}`} className="sf-shop-img-tile">
                    <img src={u} alt={`新图 ${i + 1}`} />
                    {keptUrls.length === 0 && i === 0 ? <em className="sf-shop-cover">封面</em> : null}
                    <button
                      type="button"
                      className="sf-shop-img-x"
                      onClick={() => removeAt(keptUrls.length + i)}
                      aria-label="移除图片"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {totalImgs < 5 ? (
                  <button type="button" className="sf-shop-img-add" onClick={() => fileRef.current?.click()}>
                    + 上传图片
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <small>支持 JPG / PNG / WebP，单张 ≤ 8MB。</small>
            </div>
          </div>
          {error ? <p className="sf-shop-modal-err">{error}</p> : null}
          <footer>
            <button type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="sf-shop-save" disabled={busy}>
              {busy ? "保存中…" : editing ? "保存修改" : "保存并上架"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/** 发货弹窗（2026-11-09 图1「快递公司 + 快递单号」）：POST /api/craft-profit/sales/:id/ship。
 *  快递单号必填；后端同步建 ops_shipments 运单（快递 tab 直接可见，fail-soft 不阻断）。 */
function BizShipDialog({
  sale,
  onClose,
  onShipped,
}: {
  sale: BizSale;
  onClose: () => void;
  onShipped: () => void;
}) {
  const [company, setCompany] = useState("顺丰速运");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const t = tracking.trim();
    if (!t) {
      setError("请填写快递单号");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sfFetch(`/api/craft-profit/sales/${sale.id}/ship`, {
        method: "POST",
        body: JSON.stringify({ express_company: company, tracking: t }),
      });
      onShipped();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发货失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-shop-mask" onClick={onClose}>
      <div className="sf-shop-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>发货</h3>
          <button className="sf-shop-close" onClick={onClose} aria-label="关闭">
            <X size={15} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="sf-shop-modal-body">
            <p className="sf-ship-product">
              {sale.product_name} · {fmtYuan(sale.price_cents)} × {sale.qty} 件 · 合计{" "}
              {fmtYuan((sale.price_cents + sale.shipping_cents) * sale.qty)}
            </p>
            <div className="sf-shop-fields">
              <label>
                <span>快递公司 *</span>
                <select value={company} onChange={(e) => setCompany(e.target.value)}>
                  {["顺丰速运", "中通快递", "圆通速递", "京东物流", "邮政EMS", "德邦快递"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>快递单号 *</span>
                <input
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="如：SF1234567890"
                  maxLength={64}
                />
              </label>
            </div>
          </div>
          {error ? <p className="sf-shop-modal-err">{error}</p> : null}
          <footer>
            <button type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="sf-shop-save" disabled={busy}>
              {busy ? "保存中…" : "确认发货"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/** 备忘日期徽标：逾期/今天/未来三态（类日程）。 */
function memoDueInfo(due: string | null): { label: string; tone: "over" | "today" | "future" } | null {
  if (!due) return null;
  const now = new Date();
  const t = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (due < t) return { label: `已逾期 · ${due}`, tone: "over" };
  if (due === t) return { label: `今天 · ${due}`, tone: "today" };
  return { label: due, tone: "future" };
}

/** 工作备忘（2026-11-08）：「项目」页改造成个人备忘/日程区，自由增删改。 */
function MemosView() {
  const [memos, setMemos] = useState<SfMemo[] | null>(null);
  const [memosState, setMemosState] = useState<SfLoadState>("loading");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadMemos = useCallback(() => {
    setMemosState("loading");
    listMemos()
      .then((list) => {
        setMemos(list);
        setMemosState("ready");
      })
      .catch(() => {
        setMemos(null);
        setMemosState("error");
      });
  }, []);
  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

  function resetForm() {
    setTitle("");
    setDue("");
    setNote("");
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateMemo(editingId, { title: t, note: note.trim(), due_at: due || null });
      } else {
        await createMemo({ title: t, note: note.trim(), due_at: due || null });
      }
      resetForm();
      loadMemos();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m: SfMemo) {
    setEditingId(m.memo_id);
    setTitle(m.title);
    setDue(m.due_at ?? "");
    setNote(m.note);
    setFormError(null);
  }

  async function toggleDone(m: SfMemo) {
    try {
      await updateMemo(m.memo_id, { done: !m.done });
      loadMemos();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "更新失败，请重试");
    }
  }

  async function removeMemo(m: SfMemo) {
    if (!window.confirm(`删除备忘「${m.title}」？`)) return;
    try {
      await deleteMemo(m.memo_id);
      if (editingId === m.memo_id) resetForm();
      loadMemos();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "删除失败，请重试");
    }
  }

  const list = memos ?? [];
  const openCount = list.filter((m) => !m.done).length;
  return (
    <section className="sf-subview">
      <div className="sf-subview-intro">
        <div>
          <p>MEMO · SCHEDULE</p>
          <h1>工作备忘</h1>
          <span>个人日程与备忘，随手增删。</span>
        </div>
      </div>
      <SfLoadTag state={memosState} />
      <form className="sf-memo-form" onSubmit={handleSubmit}>
        <input
          autoFocus
          maxLength={200}
          placeholder="备忘标题（必填）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          disabled={saving}
          title="日期（可选）"
        />
        <input
          maxLength={2000}
          placeholder="备注（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
        />
        <button type="submit" disabled={saving || !title.trim()}>
          {saving ? "保存中…" : editingId ? "保存修改" : "添加"}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} disabled={saving}>
            <X size={15} /> 取消
          </button>
        )}
        {formError && <span className="sf-inline-create-error">{formError}</span>}
      </form>
      {memosState === "ready" && (
        <p className="sf-memo-stats">
          共 {list.length} 条 · 待办 {openCount} 条 · 已完成 {list.length - openCount} 条
        </p>
      )}
      {memosState === "ready" && list.length === 0 && (
        <p className="sf-biz-empty">还没有备忘 —— 在上方填一条，点「添加」</p>
      )}
      <ul className="sf-memo-list">
        {list.map((m) => {
          const dueInfo = memoDueInfo(m.due_at);
          return (
            <li key={m.memo_id} className={`sf-memo-item${m.done ? " done" : ""}`}>
              <button
                className="sf-memo-check"
                onClick={() => toggleDone(m)}
                title={m.done ? "标记为待办" : "标记完成"}
              >
                {m.done ? "✓" : ""}
              </button>
              <div className="sf-memo-main">
                <div className="sf-memo-head">
                  <h3>{m.title}</h3>
                  {dueInfo && <span className={`sf-memo-due ${dueInfo.tone}`}>{dueInfo.label}</span>}
                </div>
                {m.note && <p>{m.note}</p>}
              </div>
              <div className="sf-memo-actions">
                <button onClick={() => startEdit(m)} title="编辑">
                  <Pencil size={13} />
                </button>
                <button onClick={() => removeMemo(m)} title="删除">
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type SfScheduleRow = {
  schedule_id: string;
  task_description: string;
  group_id?: string | null;
  agent_id?: string | null;
  cron_expression?: string | null;
  start_at?: string | null;
  next_run_time?: string | null;
  enabled: boolean;
};

/** 定时任务：列表接 GET /api/schedules，创建接 POST /api/schedules，
 *  启停接 PATCH、删除接 DELETE（此前假数据 + 死按钮，2026-11-08 接真）。 */
function SchedulesView() {
  const [rows, setRows] = useState<SfScheduleRow[]>([]);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  const [reload, setReload] = useState(0);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<"cron" | "once">("cron");

  const agentNames = useMemo(
    () => new Map(agents.map((a) => [String(a.agent_id), a.name || String(a.agent_id)])),
    [agents],
  );

  useEffect(() => {
    sfFetch<SfScheduleRow[]>("/api/schedules")
      .then((list) => {
        if (!Array.isArray(list)) {
          setLoadState("error");
          return;
        }
        setRows(list);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [reload]);

  useEffect(() => {
    listGroups("all").then(setGroups).catch(() => setGroups([]));
    listAgents().then(setAgents).catch(() => setAgents([]));
  }, []);

  function toggle(index: number) {
    const row = rows[index];
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)));
    sfFetch(`/api/schedules/${row.schedule_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    }).catch(() => setRows((prev) => prev.map((r, i) => (i === index ? row : r))));
  }

  function removeRow(id: string) {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.schedule_id !== id));
    sfFetch(`/api/schedules/${id}`, { method: "DELETE" }).catch(() => setRows(prev));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const desc = (form.elements.namedItem("taskDescription") as HTMLInputElement | null)?.value.trim();
    const groupId = (form.elements.namedItem("groupId") as HTMLSelectElement | null)?.value;
    const agentId = (form.elements.namedItem("agentId") as HTMLSelectElement | null)?.value;
    if (!desc || !groupId) return;
    const body: Record<string, unknown> = { group_id: groupId, task_description: desc };
    if (agentId) body.agent_id = agentId;
    if (trigger === "cron") {
      const cron = (form.elements.namedItem("cronExpr") as HTMLInputElement | null)?.value.trim();
      if (!cron) return;
      body.cron_expression = cron;
    } else {
      const at = (form.elements.namedItem("startAt") as HTMLInputElement | null)?.value;
      if (!at) return;
      body.start_at = new Date(at).toISOString();
    }
    setCreating(true);
    setCreateError(null);
    try {
      await sfFetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowCreate(false);
      setReload((n) => n + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败，请重试");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="sf-subview">
      <div className="sf-subview-intro">
        <div>
          <p>AUTOMATIONS</p>
          <h1>定时任务</h1>
          <span>全部 Agent 的周期与一次性执行计划。</span>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}>
          <Plus size={15} /> 创建定时任务
        </button>
      </div>
      <SfLoadTag state={loadState} />
      {showCreate && (
        <form className="sf-schedule-create" onSubmit={handleCreate}>
          <label>
            任务描述
            <input
              autoFocus
              required
              name="taskDescription"
              maxLength={500}
              placeholder="例如：每天生成竞品动态简报"
              disabled={creating}
            />
          </label>
          <label>
            触发方式
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value === "once" ? "once" : "cron")}
              disabled={creating}
            >
              <option value="cron">周期（cron）</option>
              <option value="once">一次性</option>
            </select>
          </label>
          {trigger === "cron" ? (
            <label>
              cron 表达式
              <input name="cronExpr" required placeholder="0 9 * * *（分 时 日 月 周）" disabled={creating} />
            </label>
          ) : (
            <label>
              执行时间
              <input name="startAt" type="datetime-local" required disabled={creating} />
            </label>
          )}
          <label>
            执行群组
            <select name="groupId" required defaultValue="" disabled={creating}>
              <option value="" disabled>
                选择群组…
              </option>
              {groups.map((g) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.name || g.group_id}
                </option>
              ))}
            </select>
          </label>
          <label>
            指定 Agent（可选）
            <select name="agentId" defaultValue="" disabled={creating}>
              <option value="">自动调度</option>
              {agents.map((a) => (
                <option key={String(a.agent_id)} value={String(a.agent_id)}>
                  {a.name || a.agent_id}
                </option>
              ))}
            </select>
          </label>
          <div className="sf-schedule-create-actions">
            <button type="submit" disabled={creating}>
              {creating ? "创建中…" : "创建"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} disabled={creating}>
              取消
            </button>
            {createError && <span className="sf-schedule-create-error">{createError}</span>}
          </div>
        </form>
      )}
      {loadState === "ready" && rows.length === 0 && (
        <p className="sf-biz-empty">还没有定时任务 —— 点右上角「创建定时任务」添加</p>
      )}
      <div className="sf-schedule-list">
        {rows.map((schedule, index) => (
          <article key={schedule.schedule_id} className={schedule.enabled ? "" : "disabled"}>
            <span className="sf-schedule-icon">
              <CalendarClock size={18} />
            </span>
            <div>
              <strong>{schedule.task_description || schedule.schedule_id}</strong>
              <p>
                <span>{schedule.agent_id ? (agentNames.get(String(schedule.agent_id)) ?? schedule.agent_id) : "自动调度"}</span>
                {" · "}
                {schedule.cron_expression
                  ? `cron · ${schedule.cron_expression}`
                  : `一次性 · ${String(schedule.start_at ?? "").slice(0, 16).replace("T", " ")}`}
                {" · 下次 "}
                {schedule.next_run_time ? String(schedule.next_run_time).slice(0, 16).replace("T", " ") : "待触发"}
              </p>
            </div>
            <span className={schedule.enabled ? "enabled" : ""}>
              {schedule.enabled ? "运行中" : "已停用"}
            </span>
            <button
              className={`sf-switch ${schedule.enabled ? "on" : ""}`}
              onClick={() => toggle(index)}
              aria-label={schedule.enabled ? "停用任务" : "启用任务"}
            >
              <i />
            </button>
            <button onClick={() => removeRow(schedule.schedule_id)} aria-label="删除任务">
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

type ByokProviderData = {
  apiKey: string;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  type?: string;
  syncedModels?: string[];
  manualModels?: string[];
};
type ByokStoreData = {
  providers: Record<string, ByokProviderData>;
  defaultModel: string | null;
  routingPriority: string;
};
type SfProject = {
  project_id: string;
  name: string;
  sessions?: unknown[];
  updated_at?: string | number | null;
};

const BYOK_META: Record<
  string,
  { name: string; short: string; tint: string; monogram: string; defaultUrl: string; keyPlaceholder: string; noKey: boolean; docsUrl: string }
> = {
  mimo:      { name: "Xiaomi MiMo",     short: "MiMo V2.6 / V2.5",    tint: "#FF6900", monogram: "MI", defaultUrl: "https://api.xiaomimimo.com/v1",                     keyPlaceholder: "sk-…",  noKey: false, docsUrl: "https://platform.xiaomimimo.com/" },
  anthropic: { name: "Anthropic",       short: "Claude family",       tint: "#D97706", monogram: "A",  defaultUrl: "https://api.anthropic.com",                         keyPlaceholder: "sk-ant-…", noKey: false, docsUrl: "https://console.anthropic.com/settings/keys" },
  openai:    { name: "OpenAI",          short: "GPT family",          tint: "#10B981", monogram: "O",  defaultUrl: "https://api.openai.com/v1",                         keyPlaceholder: "sk-…",  noKey: false, docsUrl: "https://platform.openai.com/api-keys" },
  google:    { name: "Google Gemini",   short: "Gemini family",       tint: "#4285F4", monogram: "G",  defaultUrl: "https://generativelanguage.googleapis.com/v1beta",  keyPlaceholder: "AIza…", noKey: false, docsUrl: "https://aistudio.google.com/app/apikey" },
  deepseek:  { name: "DeepSeek",        short: "V3 / R1",             tint: "#3D8BFD", monogram: "DS", defaultUrl: "https://api.deepseek.com",                          keyPlaceholder: "sk-…",  noKey: false, docsUrl: "https://platform.deepseek.com/api_keys" },
  zhipu:     { name: "Zhipu GLM",       short: "GLM-4 family",        tint: "#1447E6", monogram: "ZP", defaultUrl: "https://open.bigmodel.cn/api/paas/v4",              keyPlaceholder: "xxxx.yyyyyy", noKey: false, docsUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
  qwen:      { name: "Qwen · Alibaba",  short: "Alibaba Bailian",     tint: "#1447E6", monogram: "Qw", defaultUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyPlaceholder: "sk-…",  noKey: false, docsUrl: "https://bailian.console.aliyun.com/?apiKey=1" },
  moonshot:  { name: "Moonshot · Kimi", short: "K2 / K1.5",           tint: "#06B6D4", monogram: "MK", defaultUrl: "https://api.moonshot.cn/v1",                        keyPlaceholder: "sk-…",  noKey: false, docsUrl: "https://platform.moonshot.cn/console/api-keys" },
  mistral:   { name: "Mistral",         short: "Large 2 · Codestral", tint: "#FB923C", monogram: "Mi", defaultUrl: "https://api.mistral.ai/v1",                         keyPlaceholder: "sk-…",  noKey: false, docsUrl: "https://console.mistral.ai/api-keys/" },
  groq:      { name: "Groq",            short: "LPU inference",       tint: "#F97316", monogram: "Gr", defaultUrl: "https://api.groq.com/openai/v1",                    keyPlaceholder: "gsk_…", noKey: false, docsUrl: "https://console.groq.com/keys" },
  azure:     { name: "Azure OpenAI",    short: "Enterprise",          tint: "#0078D4", monogram: "Az", defaultUrl: "https://{deployment}.openai.azure.com",             keyPlaceholder: "…",     noKey: false, docsUrl: "https://learn.microsoft.com/en-us/azure/ai-services/openai/" },
  ollama:    { name: "Ollama",          short: "Local",               tint: "#A1A1AA", monogram: "Ol", defaultUrl: "http://localhost:11434/v1",                         keyPlaceholder: "",      noKey: true,  docsUrl: "https://ollama.com" },
  lmstudio:  { name: "LM Studio",       short: "Local",               tint: "#22C55E", monogram: "LM", defaultUrl: "http://localhost:1234/v1",                          keyPlaceholder: "",      noKey: true,  docsUrl: "https://lmstudio.ai" },
};
const BYOK_ORDER = ["mimo", "anthropic", "openai", "google", "deepseek", "zhipu", "qwen", "moonshot", "mistral", "groq", "azure", "ollama", "lmstudio"];

const DEMO_BYOK: ByokStoreData = {
  providers: {
    mimo: { apiKey: "sk-demo", baseUrl: "https://api.xiaomimimo.com/v1", models: ["mimo-v2.6-pro", "mimo-v2.6-flash"], enabled: true, syncedModels: ["mimo-v2.6-pro", "mimo-v2.6-flash"], manualModels: [] },
    zhipu: { apiKey: "xxxx.demo", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-plus", "glm-4-flash"], enabled: false, syncedModels: [], manualModels: ["glm-4-plus"] },
  },
  defaultModel: "mimo-v2.6-pro",
  routingPriority: "fallback",
};

function ModelKeysSection() {
  const [store, setStore] = useState<ByokStoreData>(DEMO_BYOK);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  const [selected, setSelected] = useState("mimo");
  const [keyDraft, setKeyDraft] = useState("");
  const [baseDraft, setBaseDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sfFetch<Partial<ByokStoreData>>("/api/settings/byok")
      .then((data) => {
        setStore({
          providers: data.providers ?? {},
          defaultModel: data.defaultModel ?? null,
          routingPriority: data.routingPriority ?? "fallback",
        });
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  const provider = store.providers[selected] ?? null;
  const meta = BYOK_META[selected];
  const defaultModelOptions = useMemo(() => {
    const out: Array<{ provider: string; id: string }> = [];
    for (const pid of BYOK_ORDER) {
      const p = store.providers[pid];
      if (!p?.enabled) continue;
      for (const m of p.models) out.push({ provider: pid, id: m });
    }
    return out;
  }, [store.providers]);

  const BLANK_PROVIDER: ByokProviderData = { apiKey: "", baseUrl: "", models: [], enabled: false };

  function updateSelected(patch: Partial<ByokProviderData>) {
    setStore((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [selected]: { ...BLANK_PROVIDER, ...(prev.providers[selected] ?? {}), ...patch },
      },
    }));
  }

  async function saveProvider(override?: Partial<ByokProviderData>) {
    const cur: ByokProviderData = { ...BLANK_PROVIDER, ...(provider ?? {}), ...(override ?? {}) };
    const body: Record<string, unknown> = {
      baseUrl: baseDraft.trim() || cur.baseUrl || meta.defaultUrl,
      models: cur.models,
      enabled: cur.enabled,
      syncedModels: cur.syncedModels ?? [],
      manualModels: cur.manualModels ?? [],
      routingPriority: store.routingPriority,
    };
    if (keyDraft.trim()) body.apiKey = keyDraft.trim();
    if (store.defaultModel) body.defaultModel = store.defaultModel;
    setBusy(true);
    try {
      await sfFetch(`/api/settings/byok/${selected}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setKeyDraft("");
      setNotice({ tone: "ok", text: `已保存 ${meta.name} 配置` });
    } catch {
      setNotice({ tone: "err", text: "保存失败，请稍后重试" });
    }
    setBusy(false);
  }

  async function pullRemote() {
    setBusy(true);
    try {
      const j = await sfFetch<{ models?: Array<string | { id?: string }> }>(`/api/settings/byok/${selected}/models/remote`);
      const ids = (j.models ?? []).map((m) => (typeof m === "string" ? m : (m.id ?? ""))).filter(Boolean);
      const merged = Array.from(new Set([...(provider?.models ?? []), ...ids]));
      const synced = Array.from(new Set([...(provider?.syncedModels ?? []), ...ids]));
      updateSelected({ models: merged, syncedModels: synced });
      setNotice({ tone: "ok", text: `已拉取 ${ids.length} 个远端模型，点击「保存配置」入库` });
    } catch {
      setNotice({ tone: "err", text: "远端拉取失败：请先填写密钥与 Base URL 并保存" });
    }
    setBusy(false);
  }

  async function checkConn() {
    setBusy(true);
    try {
      const j = await sfFetch<{ overall?: string }>(`/api/settings/byok/${selected}/check`, { method: "POST" });
      setNotice({ tone: j.overall === "ok" ? "ok" : "err", text: j.overall === "ok" ? "连接正常，密钥有效" : `连接检查结果：${j.overall ?? "失败"}` });
    } catch {
      setNotice({ tone: "err", text: "连接检查失败（先保存密钥与 Base URL）" });
    }
    setBusy(false);
  }

  async function revealKey() {
    if (revealedKey !== null) {
      setRevealedKey(null);
      return;
    }
    try {
      const j = await sfFetch<{ apiKey?: string }>(`/api/settings/byok/${selected}/reveal`);
      setRevealedKey(j.apiKey ?? "");
    } catch {
      setNotice({ tone: "err", text: "无法读取密钥（该提供商尚未配置）" });
    }
  }

  async function removeProvider() {
    setBusy(true);
    try {
      await sfFetch(`/api/settings/byok/${selected}`, { method: "DELETE" });
      setStore((prev) => {
        const next = { ...prev.providers };
        delete next[selected];
        return { ...prev, providers: next };
      });
      setNotice({ tone: "ok", text: `已删除 ${meta.name} 配置` });
    } catch {
      setNotice({ tone: "err", text: "删除失败，请稍后重试" });
    }
    setBusy(false);
  }

  function addModel() {
    const id = modelDraft.trim();
    if (!id) return;
    const models = provider?.models ?? [];
    if (models.includes(id)) {
      setNotice({ tone: "info", text: "该模型已在列表中" });
      return;
    }
    updateSelected({ models: [...models, id], manualModels: Array.from(new Set([...(provider?.manualModels ?? []), id])) });
    setModelDraft("");
    setNotice({ tone: "info", text: `已添加自定义模型 ${id}，点击「保存配置」入库` });
  }

  function removeModel(id: string) {
    updateSelected({
      models: (provider?.models ?? []).filter((m) => m !== id),
      manualModels: (provider?.manualModels ?? []).filter((m) => m !== id),
      syncedModels: (provider?.syncedModels ?? []).filter((m) => m !== id),
    });
  }

  async function persistDefaults(patch: Partial<ByokStoreData>) {
    const next = { ...store, ...patch };
    setStore(next);
    try {
      await sfFetch(`/api/settings/byok/${selected}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModel: next.defaultModel ?? undefined,
          routingPriority: next.routingPriority,
        }),
      });
    } catch {
      /* 演示态忽略 */
    }
  }

  return (
    <div className="sf-byok">
      <div className="sf-byok-top">
        <div className="sf-setting-block">
          <div>
            <span>
              <Server />
            </span>
            <div>
              <strong>默认模型</strong>
              <small>新对话与 Agent 的默认推理模型</small>
            </div>
          </div>
          <select
            className="sf-select"
            value={store.defaultModel ?? ""}
            onChange={(e) => persistDefaults({ defaultModel: e.target.value || null })}
          >
            <option value="">未设置</option>
            {defaultModelOptions.map((o) => (
              <option key={`${o.provider}:${o.id}`} value={o.id}>
                {BYOK_META[o.provider]?.name ?? o.provider} · {o.id}
              </option>
            ))}
          </select>
        </div>
        <div className="sf-setting-block">
          <div>
            <span>
              <Link2 />
            </span>
            <div>
              <strong>模型回退链</strong>
              <small>主模型不可用时自动切换</small>
            </div>
          </div>
          <button
            type="button"
            className={`sf-switch ${store.routingPriority === "fallback" ? "on" : ""}`}
            onClick={() => persistDefaults({ routingPriority: store.routingPriority === "fallback" ? "off" : "fallback" })}
            aria-label="切换模型回退链"
          >
            <i />
          </button>
        </div>
      </div>
      <SfLoadTag state={loadState} />
      <div className="sf-byok-layout">
        <aside className="sf-byok-rail">
          {BYOK_ORDER.map((pid) => {
            const p = store.providers[pid];
            const m = BYOK_META[pid];
            return (
              <button
                key={pid}
                type="button"
                className={selected === pid ? "active" : ""}
                onClick={() => {
                  setSelected(pid);
                  setKeyDraft("");
                  setBaseDraft("");
                  setModelDraft("");
                  setRevealedKey(null);
                  setNotice(null);
                }}
              >
                <i style={{ background: m.tint }}>{m.monogram}</i>
                <div>
                  <strong>{m.name}</strong>
                  <small>{p?.apiKey ? (p.enabled ? "已启用" : "已配置") : m.short}</small>
                </div>
                {p?.enabled ? <b /> : null}
              </button>
            );
          })}
        </aside>
        <div className="sf-byok-detail">
          <header>
            <div>
              <h2>{meta.name}</h2>
              <span>{meta.short} · {meta.defaultUrl}</span>
            </div>
            <button
              type="button"
              className={`sf-switch ${provider?.enabled ? "on" : ""}`}
              onClick={() => {
                const next = !provider?.enabled;
                updateSelected({ enabled: next });
                saveProvider({ enabled: next });
              }}
              aria-label="启用该提供商"
            >
              <i />
            </button>
          </header>
          <label className="sf-byok-field">
            <span>API 密钥</span>
            <div>
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={provider?.apiKey ? provider.apiKey : meta.keyPlaceholder}
                autoComplete="off"
              />
              <button type="button" onClick={revealKey}>
                {revealedKey !== null ? "隐藏" : "显示"}
              </button>
            </div>
            {revealedKey !== null && <code className="sf-byok-reveal">{revealedKey || "(空)"}</code>}
            <small>
              密钥仅保存在你的工作空间中 · <a href={meta.docsUrl} target="_blank" rel="noreferrer">点击这里获取密钥</a>
            </small>
          </label>
          <label className="sf-byok-field">
            <span>Base URL</span>
            <div>
              <input
                value={baseDraft || provider?.baseUrl || ""}
                onChange={(e) => setBaseDraft(e.target.value)}
                placeholder={meta.defaultUrl}
                disabled={meta.noKey && !provider?.baseUrl ? false : undefined}
              />
            </div>
            <small>OpenAI 兼容接口地址，留空使用官方默认端点</small>
          </label>
          <div className="sf-byok-field">
            <span>
              模型列表 <em>支持自定义模型</em>
            </span>
            <div className="sf-byok-models">
              {(provider?.models ?? []).map((mid) => (
                <button key={mid} type="button" className="sf-model-chip" onClick={() => removeModel(mid)} title="点击移除">
                  {mid} <X size={11} />
                </button>
              ))}
              {(provider?.models ?? []).length === 0 && (
                <em className="sf-byok-empty">暂无模型：可在下方手动添加自定义模型，或从远端拉取</em>
              )}
            </div>
            <div className="sf-byok-add">
              <input
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addModel();
                  }
                }}
                placeholder="输入模型 ID，如 mimo-v2.6-pro 或任意自定义模型"
              />
              <button type="button" onClick={addModel}>
                添加模型
              </button>
              <button type="button" onClick={pullRemote} disabled={busy}>
                拉取远端模型
              </button>
            </div>
          </div>
          <div className="sf-byok-actions">
            <button type="button" className="sf-primary" onClick={() => saveProvider()} disabled={busy}>
              保存配置
            </button>
            <button type="button" onClick={checkConn} disabled={busy}>
              测试连接
            </button>
            <button type="button" onClick={revealKey} disabled={busy}>
              {revealedKey !== null ? "隐藏密钥" : "显示密钥"}
            </button>
            <button type="button" className="sf-danger" onClick={removeProvider} disabled={busy}>
              删除配置
            </button>
          </div>
          {notice && <p className={`sf-byok-notice ${notice.tone}`}>{notice.text}</p>}
        </div>
      </div>
    </div>
  );
}

function SkillsSettingsList() {
  type Row = { skill_id: string; name: string; description?: string; enabled?: boolean; source?: string };
  const [items, setItems] = useState<Row[] | null>(null);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  useEffect(() => {
    sfFetch<Row[]>("/api/skills")
      .then((list) => {
        setItems(Array.isArray(list) ? list : []);
        setLoadState("ready");
      })
      .catch(() => {
        setItems(null);
        setLoadState("error");
      });
  }, []);
  return (
    <div className="sf-settings-list">
      <SfLoadTag state={loadState} />
      {(items ?? []).map((row) => (
        <article key={row.skill_id}>
          <strong>{row.name || row.skill_id}</strong>
          <p>{row.description ?? row.skill_id}</p>
          <span>
            {row.source ?? "builtin"}
            {row.enabled === false ? " · 已停用" : " · 已启用"}
          </span>
        </article>
      ))}
      {items !== null && items.length === 0 && <em className="sf-byok-empty">暂无技能数据</em>}
    </div>
  );
}

function CliProvidersSection() {
  type Row = { id: string; name?: string; version?: string | null; installed?: boolean };
  const [items, setItems] = useState<Row[] | null>(null);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  useEffect(() => {
    sfFetch<{ agents?: Row[] }>("/api/settings/agents/detect")
      .then((j) => {
        setItems((j.agents ?? []).filter((a) => a.installed !== false));
        setLoadState("ready");
      })
      .catch(() => {
        setItems(null);
        setLoadState("error");
      });
  }, []);
  return (
    <div className="sf-settings-list">
      <SfLoadTag state={loadState} />
      {(items ?? []).map((row) => (
        <article key={row.id}>
          <strong>{row.name || row.id}</strong>
          <p>本地 CLI 执行器 · {row.version || "版本未知"}</p>
          <span>{row.installed ? "已安装" : "未安装"}</span>
        </article>
      ))}
      {items !== null && items.length === 0 && <em className="sf-byok-empty">未检测到本地 CLI 执行器</em>}
    </div>
  );
}

function ConnectorsSection({ mcp }: { mcp?: boolean }) {
  type Row = {
    id: string;
    name: string;
    kind?: string;
    transport?: string;
    status?: string;
    policy?: { enabled?: boolean; approval_mode?: string };
  };
  const [items, setItems] = useState<Row[] | null>(null);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  useEffect(() => {
    sfFetch<{ items?: Row[] }>("/api/connectors")
      .then((j) => {
        const list = j.items ?? [];
        setItems(mcp ? list.filter((c) => c.transport === "stdio" || c.transport === "http") : list);
        setLoadState("ready");
      })
      .catch(() => {
        setItems(null);
        setLoadState("error");
      });
  }, [mcp]);

  // 策略操作（POST /api/connectors/:id/policy）：启用/停用 + 审批模式循环
  const APPROVAL_CYCLE = ["auto", "prompt", "block"] as const;
  async function patchPolicy(row: Row, patch: { enabled?: boolean; approval_mode?: string }) {
    try {
      await sfFetch(`/api/connectors/${encodeURIComponent(row.id)}/policy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      setItems((cur) =>
        (cur ?? []).map((c) =>
          c.id === row.id ? { ...c, policy: { ...(c.policy ?? {}), ...patch } } : c,
        ),
      );
    } catch {
      /* 失败保持原状态 */
    }
  }
  function cycleApproval(row: Row) {
    const cur = row.policy?.approval_mode ?? "auto";
    const next = APPROVAL_CYCLE[(APPROVAL_CYCLE.indexOf(cur as (typeof APPROVAL_CYCLE)[number]) + 1) % APPROVAL_CYCLE.length];
    void patchPolicy(row, { approval_mode: next });
  }

  return (
    <div className="sf-settings-list">
      <SfLoadTag state={loadState} />
      {(items ?? []).map((row) => {
        const on = row.policy?.enabled !== false;
        return (
          <article key={row.id}>
            <strong>{row.name || row.id}</strong>
            <p>
              {row.kind ?? "connector"} · {row.transport ?? "stdio"} · {row.status ?? "未知状态"}
            </p>
            <span>
              {on ? "已启用" : "已禁用"} · 审批 {row.policy?.approval_mode ?? "auto"}
              <button
                type="button"
                className="sf-settings-act"
                onClick={() => void patchPolicy(row, { enabled: !on })}
              >
                {on ? "停用" : "启用"}
              </button>
              <button
                type="button"
                className="sf-settings-act"
                title="切换审批模式 auto → prompt → block"
                onClick={() => cycleApproval(row)}
              >
                切换审批
              </button>
            </span>
          </article>
        );
      })}
      {items !== null && items.length === 0 && <em className="sf-byok-empty">暂无{mcp ? " MCP " : " "}连接器</em>}
    </div>
  );
}

function MemoryEntriesSection() {
  type Row = { id: string; scope?: string; title?: string; content?: string; created_at?: string };
  const [items, setItems] = useState<Row[] | null>(null);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    sfFetch<Row[]>("/api/memory-entries")
      .then((list) => {
        setItems(Array.isArray(list) ? list : []);
        setLoadState("ready");
      })
      .catch(() => {
        setItems(null);
        setLoadState("error");
      });
    sfFetch<{ enabled?: boolean }>("/api/memory-entries/settings")
      .then((j) => setEnabled(j.enabled !== false))
      .catch(() => undefined);
  }, []);
  function toggleMemory() {
    const next = !enabled;
    setEnabled(next);
    sfFetch("/api/memory-entries/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => undefined);
  }
  return (
    <div className="sf-settings-list">
      <div className="sf-setting-block">
        <div>
          <span>
            <Bot />
          </span>
          <div>
            <strong>记忆写回</strong>
            <small>允许 Agent 把经验沉淀为记忆条目</small>
          </div>
        </div>
        <button type="button" className={`sf-switch ${enabled ? "on" : ""}`} onClick={toggleMemory} aria-label="切换记忆写回">
          <i />
        </button>
      </div>
      <SfLoadTag state={loadState} />
      {(items ?? []).slice(0, 12).map((row) => (
        <article key={row.id}>
          <strong>{row.title || row.id.slice(0, 8)}</strong>
          <p>{(row.content ?? "").slice(0, 90) || "（无内容）"}</p>
          <span>
            {row.scope ?? "user"} · {row.created_at ? String(row.created_at).slice(0, 10) : ""}
          </span>
        </article>
      ))}
      {items !== null && items.length === 0 && <em className="sf-byok-empty">暂无记忆条目</em>}
    </div>
  );
}

type AdminUserRow = {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  auth_type?: string;
  role?: string | null;
  disabled?: boolean;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  resource_count?: number;
};

/** 管理员用户管理：GET /api/admin/users（{users:[…]} 信封）+ PATCH 角色/停用 + DELETE。
 *  403 = 无管理员权限，404 = 接口未就绪 → 分别给出引导（待联调）。 */
function AdminUsersSection() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "forbidden" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setNotice(null);
    try {
      const json = await apiFetch<{ data?: AdminUserRow[]; users?: AdminUserRow[] } | AdminUserRow[]>(
        "/api/admin/users",
      );
      const list = Array.isArray(json)
        ? json
        : ((json?.data ?? json?.users ?? []) as AdminUserRow[]);
      setRows(list);
      setState("ready");
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 403) {
        setState("forbidden");
      } else if (status === 404) {
        setState("unavailable");
      } else {
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchUser(userId: string, patch: { role?: string; disabled?: boolean }) {
    setBusyId(userId);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
      setNotice("已更新");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(userId: string) {
    if (!window.confirm("确认删除该用户？此操作不可撤销。")) return;
    setBusyId(userId);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      await load();
      setNotice("已删除");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  if (state === "loading") return <p className="sf-live-tag">正在加载用户列表…</p>;
  if (state === "forbidden") {
    return (
      <div className="sf-settings-placeholder">
        <ShieldCheck size={25} />
        <strong>无管理员权限</strong>
        <p>当前账号不是管理员，无法查看用户列表（后端返回 403 FORBIDDEN）。</p>
      </div>
    );
  }
  if (state === "unavailable") {
    return (
      <div className="sf-settings-placeholder">
        <ShieldCheck size={25} />
        <strong>管理员接口未就绪</strong>
        <p>后端 /api/admin/users 返回 404，用户管理暂不可用（待后端联调）。</p>
        <button type="button" onClick={() => void load()}>
          重试
        </button>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="sf-settings-placeholder">
        <AlertTriangle size={25} />
        <button type="button" onClick={() => void load()}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="sf-admin-users">
      <div className="sf-admin-users-head">
        <span>共 {(rows ?? []).length} 个用户</span>
        <button type="button" className="sf-link-btn" onClick={() => void load()}>
          刷新
        </button>
        {notice && <em className="sf-admin-notice">{notice}</em>}
      </div>
      {(rows ?? []).length === 0 && <em className="sf-byok-empty">暂无用户</em>}
      {(rows ?? []).map((row) => (
        <article key={row.user_id}>
          <div>
            <strong>{row.display_name || row.email || row.user_id.slice(0, 8)}</strong>
            <small>
              {row.email ?? ""} · {row.auth_type ?? "email"} · {row.role ?? "user"}
              {row.disabled ? " · 已停用" : ""}
              {row.resource_count != null ? ` · ${row.resource_count} 个资源` : ""}
            </small>
          </div>
          <div className="sf-admin-actions">
            <button
              type="button"
              disabled={busyId === row.user_id}
              onClick={() =>
                void patchUser(row.user_id, { role: row.role === "admin" ? "user" : "admin" })
              }
            >
              {row.role === "admin" ? "取消管理员" : "设为管理员"}
            </button>
            <button
              type="button"
              disabled={busyId === row.user_id}
              onClick={() => void patchUser(row.user_id, { disabled: !row.disabled })}
            >
              {row.disabled ? "启用" : "停用"}
            </button>
            <button
              type="button"
              className="sf-danger-btn"
              disabled={busyId === row.user_id}
              onClick={() => void deleteUser(row.user_id)}
            >
              删除
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function SettingsView() {
  const auth = useAuthState();
  const isAdmin = auth.user?.role === "admin";
  const [section, setSection] = useState("模型与密钥");
  const groups: Array<[string, string[]]> = [
    ["账户", ["个人资料"]],
    ["外观", ["主题与显示", "语言"]],
    ["集成", ["Skills", "模型与密钥", "向量模型", "工具提供商", "连接器", "MCP 集成"]],
    ["记忆", ["记忆条目", "Agent 画像", "交接与写回"]],
    ["计费", ["用量"]],
    ["数据", ["通知", "高级设置"]],
  ];
  if (isAdmin) groups.push(["管理员", ["用户管理"]]);
  return (
    <section className="sf-settings">
      <aside>
        {groups.map(([group, items]) => (
          <div key={group}>
            <p>{group}</p>
            {items.map((item) => (
              <button
                key={item}
                className={section === item ? "active" : ""}
                onClick={() => setSection(item)}
              >
                {item === "模型与密钥" ? (
                  <Server size={15} />
                ) : item === "向量模型" ? (
                  <Zap size={15} />
                ) : item === "用量" ? (
                  <BarChart3 size={15} />
                ) : item === "个人资料" ? (
                  <Users size={15} />
                ) : item === "用户管理" ? (
                  <ShieldCheck size={15} />
                ) : item.includes("记忆") ? (
                  <Bot size={15} />
                ) : (
                  <Settings size={15} />
                )}
                {item}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="sf-settings-content">
        <p>SETTINGS</p>
        <h1>{section}</h1>
        {section === "模型与密钥" ? (
          <ModelKeysSection />
        ) : section === "向量模型" ? (
          <EmbeddingSection />
        ) : section === "Skills" ? (
          <SkillsSettingsList />
        ) : section === "工具提供商" ? (
          <CliProvidersSection />
        ) : section === "连接器" ? (
          <ConnectorsSection />
        ) : section === "MCP 集成" ? (
          <ConnectorsSection mcp />
        ) : section === "记忆条目" ? (
          <MemoryEntriesSection />
        ) : section === "用量" ? (
          <CreditsUsageSection />
        ) : section === "用户管理" ? (
          <AdminUsersSection />
        ) : (
          <div className="sf-settings-placeholder">
            <Settings size={25} />
            <strong>{section}</strong>
            <p>在这里管理 {section} 相关配置。所有修改会应用到当前工作空间。</p>
            <button>保存设置</button>
          </div>
        )}
      </div>
    </section>
  );
}
