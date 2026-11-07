import {
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
  Plus,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
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
import { authGuest, authLogout, displayNameOf, initialsOf, useAuthState } from "./src/auth";
import {
  ApiError,
  apiFetch,
  CHAT_UPLOAD_MAX_BYTES,
  chatAssetUrl,
  decideApproval,
  createGroup,
  createProject,
  getGroupDag,
  getTeamDag,
  getTeams,
  listAgents,
  listGroups,
  listPendingApprovals,
  listProjects,
  resolveDm,
  retryRunStep,
  setUnauthorizedHandler,
  uploadChatAttachment,
  type AgentRecord,
  type GroupRecord,
  type PendingApprovalItem,
  type SfTeamDag as ApiTeamDag,
  type TimelineMessage,
  type UserAttachment,
} from "./src/chat-api";
import { useGroupChat, type GroupChat } from "./src/useGroupChat";
import { isTerminalRunStatus } from "./src/message-patches";
import { TimelineList } from "./src/TimelineView";

/** 人物头像（DiceBear micah —— 现代扁平插画，比 Lorelei 线稿更精致；
    按 agent accent 色铺底，加载失败回落字母头像。键 = AgentAvatar label）。 */
function sfAvatarUrl(label: string, color: string): string {
  const bg = color.replace("#", "");
  return `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(
    label,
  )}&backgroundColor=${bg}&radius=0`;
}

/** 数据加载三态（加载中 / 成功 / 失败）：各视图状态标签统一入口，
 *  避免把「加载中」与「加载失败」混为一态而在加载过程闪现错误提示。 */
type SfLoadState = "loading" | "ready" | "error";

function SfLoadTag({ state, okText }: { state: SfLoadState; okText?: string }) {
  if (state === "loading") return <p className="sf-live-tag">加载中…</p>;
  if (state === "error") return <p className="sf-live-tag">数据加载失败 · 请刷新重试</p>;
  return okText ? <p className="sf-live-tag on">{okText}</p> : null;
}

type View = "chat" | "agents" | "knowledge" | "dashboard" | "biz" | "projects" | "schedules" | "settings";

const viewCopy: Record<Exclude<View, "chat">, { title: string; subtitle: string }> = {
  agents: { title: "Agent 团队", subtitle: "管理角色、能力与协作关系" },
  knowledge: { title: "知识库", subtitle: "管理团队共享的知识与上下文" },
  dashboard: { title: "数据看板", subtitle: "用量、成本、Run 成功率与每日简报" },
  biz: { title: "生意看板", subtitle: "手工艺品代销：商品、销售、快递、社媒与盈利" },
  projects: { title: "项目", subtitle: "管理工作空间、会话与交付成果" },
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

/** 会话列表预览：最后一条消息内容截断。 */
function groupPreview(group: GroupRecord): string {
  const msgs = Array.isArray(group.messages) ? group.messages : [];
  const last = msgs[msgs.length - 1];
  const content = (last?.content ?? "").trim().replace(/\s+/g, " ");
  if (!content) return "还没有消息";
  return content.length > 32 ? `${content.slice(0, 32)}…` : content;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0); // dragenter/leave 计数，避免经过子元素时遮罩闪烁
  const attIdRef = useRef(0);
  const sendingRef = useRef(false); // submitMessage 异步窗口防重入

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
        const ta = a.updated_at ? Date.parse(String(a.updated_at)) : 0;
        const tb = b.updated_at ? Date.parse(String(b.updated_at)) : 0;
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

  const chatStatusText = !activeGroupId
    ? "选择或新建一个会话"
    : chat.status === "loading"
      ? "正在加载会话…"
      : chat.status === "error"
        ? "会话加载失败 · 点击重试"
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

  /** 新建对话 → POST /api/groups（真实建群）后进入。 */
  async function createConversation() {
    const name = `新对话 ${groups.length + 1}`;
    try {
      const group = await createGroup({ name: name.slice(0, 40), kind: "group" });
      if (group?.group_id) {
        setActiveGroupId(group.group_id);
        setActiveTitle(group.name || name);
        await reloadGroups();
      }
    } catch {
      // 建群失败（后端不可达/未登录）→ 本地空会话兜底（明确演示态）
      setActiveGroupId(null);
      setActiveTitle("新对话");
    }
    setView("chat");
    setMobileRailOpen(false);
    if (window.innerWidth <= 820) setPanelOpen(false);
  }

  /**
   * 发送消息。返回 true=已发出或已排入补发；false=建群失败（调用方保留 composer 内容供重试）。
   * 无活动会话时先建群，成功后跨群补发（2026-11-08 主理人裁决：不再静默丢内容）。
   */
  async function sendText(text: string, attachments?: UserAttachment[]): Promise<boolean> {
    if (!activeGroupId) {
      const name = text.trim().slice(0, 40) || `新对话 ${groups.length + 1}`;
      try {
        const group = await createGroup({ name, kind: "group" });
        if (!group?.group_id) return false;
        setActiveGroupId(group.group_id);
        setActiveTitle(group.name || name);
        await reloadGroups();
        // 建群成功 → 跨群补发（gidOverride 指向新群，消息随新会话服务端回读出现）
        void chat.send(text, attachments, group.group_id);
        return true;
      } catch {
        return false; // 建群失败 → 无处可发
      }
    }
    void chat.send(text, attachments);
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

  /** 拖拽上传：仅接管文件拖入；enter/leave 计数防闪烁。 */
  function onChatDragEnter(event: ReactDragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragOver(true);
  }

  function onChatDragOver(event: ReactDragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault(); // 必须阻止默认行为，否则浏览器直接打开文件
    event.dataTransfer.dropEffect = "copy";
  }

  function onChatDragLeave(event: ReactDragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }

  function onChatDrop(event: ReactDragEvent) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) addChatFiles(files);
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    // 上传完成前不发送，防丢附件；失败条目不随消息发出（可删除后重试）
    if (atts.some((a) => a.status === "uploading")) return;
    const ready = atts.flatMap((a) => (a.data ? [a.data] : []));
    if (!message.trim() && ready.length === 0) return;
    if (sendingRef.current) return; // 建群补发路径有异步窗口，防回车连发重复建群
    sendingRef.current = true;
    try {
      // 发出/排入补发才清空 composer；失败保留输入与附件 chips 供重试（2026-11-08 主理人裁决）
      const ok = await sendText(message.trim(), ready.length > 0 ? ready : undefined);
      if (ok) {
        setMessage("");
        setAtts([]);
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
            <span className="sf-count">4</span>
          </button>
          <button
            className={view === "knowledge" ? "active" : ""}
            onClick={() => navigate("knowledge")}
          >
            <BookOpen size={17} />
            <span>知识库</span>
          </button>
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => navigate("dashboard")}
          >
            <BarChart3 size={17} />
            <span>数据看板</span>
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
            <span>项目</span>
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
            className={`sf-chat-layout ${panelOpen ? "" : "panel-closed"} ${detailOpen ? "" : "detail-closed"}`}
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
                <button className="sf-new-chat" onClick={() => void createConversation()}>
                  <Plus size={12} />
                  <span>新建</span>
                </button>
                <label className="sf-search">
                  <Search size={13} />
                  <input
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
                      会话加载失败 ·{" "}
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
                      <time>{fmtRelativeTime(group.updated_at)}</time>
                    </button>
                  ))}
                </div>
                <p>项目与 Agent</p>
                <div className="sf-project-tree">
                  {projectsTree.length === 0 && agentsList.length === 0 && (
                    <p className="sf-thread-hint">暂无项目与 Agent（尚未创建）</p>
                  )}
                  {projectsTree.map((project) => {
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
                  {(agentsList.length > 0 ? displayAgents(agentsList) : (agents as unknown as AgentRecord[])).map((agent) => (
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

              <form className="sf-composer" onSubmit={submitMessage}>
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
                  rows={1}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
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
                    <button
                      type="button"
                      aria-label="更多"
                      className={plusView ? "sf-plus-trigger open" : "sf-plus-trigger"}
                      onClick={() => setPlusView(plusView ? null : "root")}
                    >
                      <Plus size={15} />
                    </button>
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
                                      title="插入 [post] 发帖标记，发到总经理 DM / 代卖群即落库发布"
                                      onClick={() =>
                                        insertIntoComposer(
                                          '[post] {"platform":"小红书","title":"（请替换标题）","text":"（请替换正文）"}',
                                        )
                                      }
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

              {dragOver && (
                <div className="sf-drop-overlay" aria-hidden="true">
                  <Paperclip size={22} />
                  <strong>松开以上传</strong>
                  <small>单个文件不超过 8MB</small>
                </div>
              )}
            </section>

            {detailOpen && (
              <RunPanel
                groupId={activeGroupId}
                groupName={activeTitle}
                chat={chat}
                agentsList={agentsList}
                agentsState={agentsState}
                onClose={() => setDetailOpen(false)}
              />
            )}
          </div>
        )}

        {view === "agents" && <AgentsView />}
        {view === "knowledge" && <KnowledgeView />}
        {view === "dashboard" && <DashboardView />}
        {view === "biz" && <BizView />}
        {view === "projects" && <ProjectsView />}
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
  status: "done" | "running" | "pending";
  meta: string;
  substeps: { agent: string; slot: string; status: "done" | "running" | "pending" }[];
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

/** timeline step_panel/plan_card → 步骤列表（无运行数据 → 空数组=空态）。 */
function deriveSteps(messages: TimelineMessage[]): RunStep[] {
  const panel = [...messages]
    .reverse()
    .find((m) => m.kind === "step_panel" && (m.steps ?? []).length > 0);
  if (panel) {
    return (panel.steps ?? []).map((s) => {
      const status = s.status === "done" ? "done" : s.status === "running" ? "running" : "pending";
      return {
        name: s.name,
        status,
        meta: s.elapsed_ms != null ? fmtElapsed(s.elapsed_ms) : status === "pending" ? "等待中" : "",
        substeps: (s.substeps ?? []).map((sub) => ({
          agent: sub.name,
          slot: "",
          status:
            sub.status === "done" ? "done" : sub.status === "running" ? "running" : "pending",
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
      status: t.status === "done" ? "done" : t.status === "running" ? "running" : "pending",
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

function RunPanel({
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

  const messages = chat.messages;
  const steps = useMemo(() => deriveSteps(messages), [messages]);
  const artifacts = useMemo(() => deriveArtifacts(messages), [messages]);
  const stats = useMemo(() => deriveRunStats(messages), [messages]);
  const running = chat.runs.some((r) => !isTerminalRunStatus(r.status));

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
    const lastUser = [...messages].reverse().find((m) => m.kind === "user_turn");
    return lastUser?.ts ?? 0;
  }, [messages]);
  const liveElapsed =
    running && stats.elapsedMs <= 0 && turnStart > 0 ? fmtElapsed(nowMs - turnStart) : elapsedText;
  const pendingCount = approvals.filter((a) => a.state === "pending").length;
  const doneSteps = steps.filter((s) => s.status === "done").length;

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
    <aside className="sf-run-panel">
      <div className="sf-run-head">
        <strong>执行详情</strong>
        <button onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="sf-run-card">
        <div>
          <span>
            <Zap size={17} />
          </span>
          <div>
            <small>ACTIVE RUN</small>
            <strong>{groupName}</strong>
          </div>
          <em>{steps.length > 0 ? `${Math.round((doneSteps / steps.length) * 100)}%` : "—"}</em>
        </div>
        <div className="sf-progress">
          <i style={{ width: steps.length > 0 ? `${(doneSteps / steps.length) * 100}%` : "0%" }} />
        </div>
        <p>
          {steps.length > 0
            ? `${doneSteps} / ${steps.length} 个步骤已完成`
            : "暂无运行记录"}
        </p>
        <div className="sf-run-meta">
          <span className={`sf-run-pill ${running ? "running" : "stopped"}`}>
            {running ? "运行中" : "空闲"}
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
            <button className="sf-mini-btn danger" onClick={() => void chat.stop()}>
              <Square size={8} /> 停止
            </button>
          ) : (
            <button className="sf-mini-btn ok" onClick={() => void chat.rerun()}>
              <Play size={8} /> 重跑上一轮
            </button>
          )}
          <button className="sf-mini-btn" onClick={rerunAll}>
            <RotateCcw size={8} /> 重跑
          </button>
        </div>
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
    </aside>
  );
}

function AgentAvatar({
  label,
  color,
  small = false,
  size,
}: {
  label: string;
  color: string;
  small?: boolean;
  size?: "lg" | "xl";
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`sf-agent-avatar ${small ? "small" : ""} ${size ?? ""}`}
        style={{ "--avatar-color": color } as React.CSSProperties}
      >
        {label.slice(0, 1)}
        <i />
      </span>
    );
  }
  return (
    <span
      className={`sf-agent-avatar ${small ? "small" : ""} ${size ?? ""} has-face`}
      style={{ "--avatar-color": color } as React.CSSProperties}
    >
      <img
        className="sf-agent-avatar-face"
        src={sfAvatarUrl(label, color)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <i />
    </span>
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
        <p>{chat.error ?? "会话加载失败"}</p>
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
          <p>{chat.error}</p>
          <button type="button" className="sf-link-btn" onClick={() => chat.reload()}>
            重试
          </button>
        </div>
      )}
      {/* 流式指示：agent.typing 瞬态 / 发出后等待回复（sf-working 动画保留到收到回复） */}
      {(chat.typing || chat.awaitingReply) && (
        <div className="sf-working">
          <span />
          <span />
          <span />
          <p>
            {chat.typing ? (
              <>
                <strong>{chat.typing}</strong> 正在生成回复
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
interface SfDashBreakdownItem {
  key?: string;
  model?: string;
  label?: string;
  calls?: number;
  total_tokens?: number;
  cost_est_usd?: number;
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
                  <text x={lx} y={ly} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={v.stroke}>
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
                  fontSize={11}
                  fontWeight={700}
                  fill="#fff"
                >
                  {(n.title || n.id).slice(0, 1)}
                </text>
                <text x={41} y={NH / 2 + 3.5} fontSize={11} fontWeight={650} fill="#17162d">
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
        {loadState === "loading" ? "加载中…" : live ? "LIVE · 已连接后端" : "数据加载失败 · 已显示默认编队"}
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

type SfPackCard = { pack_id?: string; name?: string; title?: string; description?: string; source_count?: number };

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
  const cards: Array<[string, string, string, string]> =
    packs === null || packs.length === 0
      ? [
          ["品牌空间", "Atlas Brand Hub", "品牌定位、语调、受众与核心产品信息。", "12 份文档"],
          ["项目资料", "新品发布研究", "市场、竞品与用户访谈的结构化资料。", "24 个来源"],
          ["方法论", "营销交付 SOP", "团队使用的流程模板与质量标准。", "8 个流程"],
        ]
      : packs.slice(0, 6).map((p) => [
          "知识包",
          p.name || p.title || (p.pack_id ? p.pack_id.slice(0, 8) : "未命名"),
          p.description || "团队共享知识包。",
          p.source_count != null ? `${p.source_count} 个来源` : "知识包",
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
          <span className="sf-net-count">44 个节点 · 61 条引用</span>
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
                fontSize="8"
                fill="#77737d"
              >
                {label as string}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <SfLoadTag state={packsState} />
      <div className="sf-knowledge-layout">
        {cards.map(([tag, title, desc, count], i) => (
          <div key={title} className={`sf-knowledge-card${i === 0 ? " featured" : ""}`}>
            {i === 0 ? <BookOpen /> : i === 1 ? <FileText /> : <GitBranch />}
            <small>{tag}</small>
            <h2>{title}</h2>
            <p>{desc}</p>
            <footer>
              <span>{count}</span>
              <span>{i === 0 ? "刚刚更新" : i === 1 ? "2 小时前" : "昨天"}</span>
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
/** 毫秒 → MM/DD（图表 X 轴）。 */
function fmtDayLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function DashboardView() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metric, setMetric] = useState<"tokens" | "calls" | "cost">("tokens");
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<SfLoadState>("loading");
  // 全部实时接 /api/dashboard/{overview,timeseries,breakdown,briefing,agents}；不可达显示空态
  const [ov, setOv] = useState<SfDashOverview | null>(null);
  const [series, setSeries] = useState<number[] | null>(null);
  const [seriesDays, setSeriesDays] = useState<number[]>([]);
  const [breakdown, setBreakdown] = useState<SfDashBreakdownItem[] | null>(null);
  const [agentRows, setAgentRows] = useState<SfDashAgentItem[]>([]);
  const [brief, setBrief] = useState<SfDashBriefing | null>(null);

  useEffect(() => {
    let dead = false;
    setState("loading");
    (async () => {
      try {
        const [o, t, b, br, ag] = await Promise.all([
          sfFetch<SfDashOverview>(`/api/dashboard/overview?days=${days}`),
          sfFetch<{ series?: Array<{ day?: number; tokens?: number; calls?: number; cost?: number }> }>(
            `/api/dashboard/timeseries?days=${days}&metric=${metric}`,
          ),
          sfFetch<{ items?: SfDashBreakdownItem[] }>(`/api/dashboard/breakdown?days=${days}&by=model`),
          sfFetch<SfDashBriefing>(`/api/dashboard/briefing?days=7`),
          sfFetch<{ items?: SfDashAgentItem[] }>(`/api/dashboard/agents?days=${days}`),
        ]);
        if (dead) return;
        setOv(o ?? null);
        const rows = t.series ?? [];
        setSeriesDays(rows.map((row) => Number(row.day) || 0));
        setSeries(
          rows.map((row) =>
            Number(metric === "cost" ? row.cost : metric === "calls" ? row.calls : row.tokens) || 0,
          ),
        );
        setBreakdown(b.items ?? []);
        setBrief(br ?? null);
        setAgentRows(ag.items ?? []);
        setState("ready");
      } catch {
        if (dead) return;
        setOv(null);
        setSeries(null);
        setSeriesDays([]);
        setBreakdown(null);
        setBrief(null);
        setAgentRows([]);
        setState("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, [days, metric, reload]);

  const values = series ?? [];
  const maxValue = Math.max(...values, 1);
  const niceMax = Math.ceil(maxValue / 4) * 4 || 4;
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 680},${142 - (value / niceMax) * 136}`,
    )
    .join(" ");
  const axisLabels = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0].map((v) =>
    v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${v}`,
  );
  // X 轴日期标签按真实数据日生成（首/¼/½/¾/末，末位标「今天」）
  const xLabels = (() => {
    const n = seriesDays.length;
    if (n === 0) return ["—", "—", "—", "—", "今天"];
    const picks = [...new Set([0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1])];
    return picks.map((i) => (i === n - 1 ? "今天" : fmtDayLabel(seriesDays[i])));
  })();

  const runs = ov?.runs ?? { total: 0, succeeded: 0, failed: 0, canceled: 0, success_rate: null };
  const successRate = runs.success_rate ?? 0;
  const usageCards: Array<[string, string, string, string]> = ov
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
            ov.runs.success_rate != null ? `${ov.runs.success_rate}%` : "—",
            `共 ${ov.runs.total} 次`,
            "",
          ],
          ["活跃项目", String(ov.active.projects), `${ov.active.conversations} 个会话`, ""],
        ];
      })()
    : [
        ["LLM 调用", "—", "—", ""],
        ["Token 消耗", "—", "—", ""],
        ["估算成本", "—", "—", ""],
        ["Run 成功率", "—", "—", ""],
        ["活跃项目", "—", "—", ""],
      ];
  const breakdownRows: Array<[string, string, string, string, string]> = (() => {
    const rows = breakdown ?? [];
    const totalTokens = rows.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0) || 1;
    return rows.slice(0, 5).map((row) => [
      row.key ?? row.model ?? row.label ?? "—",
      String(row.calls ?? "—"),
      fmtCompact(row.total_tokens ?? 0),
      `$${(row.cost_est_usd ?? 0).toFixed(2)}`,
      `${Math.round(((row.total_tokens ?? 0) / totalTokens) * 100)}%`,
    ]);
  })();
  // Agent 产出排行（/api/dashboard/agents，agent_hops 交接产出字符）
  const agentBars: Array<[string, number, number]> = agentRows
    .slice(0, 6)
    .map((row) => [row.agent.slice(0, 8), row.output_chars ?? 0, row.hops ?? 0] as [string, number, number]);
  const maxAgentChars = Math.max(...agentBars.map(([, n]) => n), 1);

  function refresh() {
    setRefreshing(true);
    setReload((n) => n + 1);
    window.setTimeout(() => setRefreshing(false), 650);
  }
  /** 模型用量分布导出 CSV（客户端生成，带 BOM 防 Excel 乱码）。 */
  function exportCsv() {
    const head = "模型,调用,Tokens,成本USD,占比\n";
    const body = breakdownRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([`\ufeff${head}${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-model-usage-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="sf-dashboard">
      <div className="sf-page-heading">
        <div>
          <p>DATA PLATFORM</p>
          <h1>数据看板</h1>
          <span>调用、Token 消耗、成本估算、Run 成功率与每日简报。</span>
        </div>
        <button onClick={refresh} disabled={refreshing}>
          <Zap size={14} /> {refreshing ? "刷新中…" : "刷新数据"}
        </button>
      </div>
      <SfLoadTag state={state} okText="看板数据已同步" />

      <div className="sf-range-tabs">
        {([7, 30, 90] as const).map((range) => (
          <button
            key={range}
            className={days === range ? "active" : ""}
            onClick={() => setDays(range)}
          >
            近 {range} 天
          </button>
        ))}
      </div>

      <div className="sf-metric-grid">
        {usageCards.map(([label, value, delta, state]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
            <span className={state}>{delta}</span>
          </article>
        ))}
      </div>

      <div className="sf-dashboard-grid">
        <article className="sf-chart-card">
          <div className="sf-card-title">
            <div>
              <strong>使用趋势</strong>
              <span>按日统计</span>
            </div>
            <div className="sf-metric-tabs">
              {(["tokens", "calls", "cost"] as const).map((item) => (
                <button
                  key={item}
                  className={metric === item ? "active" : ""}
                  onClick={() => setMetric(item)}
                >
                  {item === "tokens" ? "Tokens" : item === "calls" ? "调用" : "成本"}
                </button>
              ))}
            </div>
          </div>
          <div className="sf-chart">
            <div className="sf-chart-y">
              {axisLabels.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
            <svg viewBox="0 0 680 150" preserveAspectRatio="none" aria-label={`${metric} 使用趋势`}>
              <defs>
                <linearGradient id="sfChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff5e3a" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#ff5e3a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,150 ${points} 680,150`} fill="url(#sfChartFill)" />
              <polyline
                points={points}
                fill="none"
                stroke="#ff5e3a"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {values.map((value, index) => (
                <circle
                  key={index}
                  cx={(index / Math.max(1, values.length - 1)) * 680}
                  cy={142 - (value / niceMax) * 136}
                  r="3.5"
                  fill="#fff"
                  stroke="#ff5e3a"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>
          <div className="sf-chart-x">
            {xLabels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </article>

        <article className="sf-brief-card">
          <div className="sf-card-title">
            <div>
              <strong>每日简报</strong>
              <span>{brief ? `更新于 ${fmtBizTime(brief.generated_at)}` : "加载中…"}</span>
            </div>
          </div>
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
            <ChevronRight size={14} />
          </div>
        </article>
      </div>

      <div className="sf-dashboard-row2">
        <article className="sf-donut-card">
          <div className="sf-card-title">
            <div>
              <strong>Run 成功率</strong>
              <span>近 {days} 天 · 共 {runs.total} 次</span>
            </div>
          </div>
          <div className="sf-donut-wrap">
            <svg viewBox="0 0 120 120" role="img" aria-label="Run 成功率">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#f1efe9" strokeWidth="13" />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="#2ec4a6"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray={`${(successRate / 100) * 314} 314`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="60" textAnchor="middle" fontSize="19" fontWeight="800" fill="#17162d">
                {successRate}%
              </text>
              <text x="60" y="76" textAnchor="middle" fontSize="8" fill="#999">
                成功 {runs.succeeded}
              </text>
            </svg>
            <ul className="sf-donut-legend">
              <li><i style={{ background: "#2ec4a6" }} />成功 {runs.succeeded}</li>
              <li><i style={{ background: "#ff5e3a" }} />失败 {runs.failed}</li>
              <li><i style={{ background: "#d9d4ca" }} />取消 {runs.canceled}</li>
            </ul>
          </div>
        </article>
        <article className="sf-agent-usage-card">
          <div className="sf-card-title">
            <div>
              <strong>Agent 产出排行</strong>
              <span>按交接产出字符 · 实时</span>
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
        </article>
      </div>

      <div className="sf-breakdown-card">
        <div className="sf-card-title">
          <div>
            <strong>模型用量分布</strong>
            <span>按 Token 统计{state === "ready" ? " · 实时" : ""}</span>
          </div>
          <button onClick={exportCsv}>导出 CSV</button>
        </div>
        <div className="sf-breakdown-head">
          <span>模型</span>
          <span>调用</span>
          <span>Tokens</span>
          <span>成本</span>
          <span>占比</span>
        </div>
        {breakdownRows.length === 0 && <p className="sf-biz-empty">暂无模型用量数据</p>}
        {breakdownRows.map((row, index) => (
          <div className="sf-breakdown-row" key={row[0]}>
            <span>
              <i className={`model-${index}`} />
              {row[0]}
            </span>
            {row.slice(1).map((cell) => (
              <span key={cell}>{cell}</span>
            ))}
          </div>
        ))}
      </div>
    </section>
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
  price_cents: number;
  cost_cents: number;
  shipping_cents: number;
  sold_units: number;
  revenue_cents: number;
  profit_cents: number;
};
type BizSale = {
  id: string;
  product_name: string;
  qty: number;
  price_cents: number;
  status: string;
  tracking: string;
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
const BIZ_SALE_STATUS: Record<string, { label: string; cls: string }> = {
  shipped: { label: "已发货", cls: "ok" },
  pending: { label: "待发货", cls: "warn" },
  refunded: { label: "已退款", cls: "bad" },
};

function BizView() {
  const [tab, setTab] = useState<"overview" | "products" | "sales" | "shipments" | "posts">("overview");
  const [state, setState] = useState<SfLoadState>("loading");
  const [ov, setOv] = useState<BizOverview | null>(null);
  const [products, setProducts] = useState<BizProduct[]>([]);
  const [sales, setSales] = useState<BizSale[]>([]);
  const [shipments, setShipments] = useState<BizShipment[]>([]);
  const [posts, setPosts] = useState<BizPost[]>([]);
  const [steps, setSteps] = useState<BizOpsStep[]>([]);
  const load = useCallback(() => {
    setState("loading");
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
    sfFetch<{ items?: BizSale[] }>("/api/craft-profit/sales")
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
        <button onClick={load}>
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
            ["sales", `销售 ${sales.length}`],
            ["shipments", `快递 ${shipments.length}`],
            ["posts", `社媒 ${posts.length}`],
          ] as Array<[typeof tab, string]>
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

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

      {tab === "sales" && (
        <div className="sf-biz-table-wrap">
          <table className="sf-biz-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>数量</th>
                <th>单价</th>
                <th>状态</th>
                <th>快递单号</th>
                <th>时间</th>
                <th>盈利</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr>
                  <td colSpan={7} className="sf-biz-empty">
                    还没有销售记录 —— 让团队执行 [order] 登记订单
                  </td>
                </tr>
              )}
              {sales.map((s) => {
                const st = BIZ_SALE_STATUS[s.status] ?? { label: s.status, cls: "" };
                return (
                  <tr key={s.id}>
                    <td>{s.product_name || "—"}</td>
                    <td>{s.qty}</td>
                    <td>{fmtYuan(s.price_cents)}</td>
                    <td>
                      <span className={`sf-biz-badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td>{s.tracking || "—"}</td>
                    <td>{fmtBizTime(s.created_at)}</td>
                    <td>{fmtYuan(s.profit_cents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    </section>
  );
}

function ProjectsView() {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [liveProjects, setLiveProjects] = useState<SfProject[] | null>(null);
  const [projectsState, setProjectsState] = useState<SfLoadState>("loading");
  const loadProjects = useCallback(() => {
    setProjectsState("loading");
    sfFetch<SfProject[]>("/api/projects?withSessions=1")
      .then((list) => {
        setLiveProjects(Array.isArray(list) ? list : []);
        setProjectsState("ready");
      })
      .catch(() => {
        setLiveProjects(null);
        setProjectsState("error");
      });
  }, []);
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("projectName") as HTMLInputElement | null;
    const name = input?.value.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createProject(name);
      setShowCreate(false);
      loadProjects();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败，请重试");
    } finally {
      setCreating(false);
    }
  }

  const cards: Array<[string, string, string, string, string]> =
    liveProjects === null
      ? [
          ["Atlas 新品发布", "4 位 Agent · 8 个会话", "68%", "#ff5e3a", "今天"],
          ["Q2 内容增长", "3 位 Agent · 12 个会话", "42%", "#00a594", "今天"],
          ["客户提案自动化", "2 位 Agent · 5 个会话", "86%", "#8e6cff", "今天"],
        ]
      : liveProjects.map((p, i) => [
          p.name,
          `${(p.sessions ?? []).length} 个会话`,
          "",
          ["#ff5e3a", "#00a594", "#8e6cff", "#d97b38", "#c64f7d"][i % 5],
          p.updated_at ? String(p.updated_at).slice(0, 10) : "最近",
        ]);
  return (
    <section className="sf-subview">
      <div className="sf-subview-intro">
        <div>
          <p>WORKSPACES</p>
          <h1>项目</h1>
          <span>组织会话、Agent、知识与最终交付成果。</span>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}>
          <Plus size={15} /> 新建项目
        </button>
      </div>
      <SfLoadTag state={projectsState} />
      {showCreate && (
        <form className="sf-inline-create" onSubmit={handleCreate}>
          <Folder size={17} />
          <input
            autoFocus
            required
            name="projectName"
            maxLength={60}
            placeholder="输入项目名称"
            disabled={creating}
          />
          <button type="submit" disabled={creating}>
            {creating ? "创建中…" : "创建"}
          </button>
          <button type="button" onClick={() => setShowCreate(false)} disabled={creating}>
            <X size={15} />
          </button>
          {createError && <span className="sf-inline-create-error">{createError}</span>}
        </form>
      )}
      <div className="sf-project-grid">
        {cards.map(([name, meta, progress, color, updated]) => (
          <article key={name}>
            <header>
              <span style={{ background: color }}>
                <Folder size={17} />
              </span>
              <button>
                <MoreHorizontal size={17} />
              </button>
            </header>
            <h2>{name}</h2>
            <p>{meta}</p>
            {progress ? (
              <div>
                <span>
                  <i style={{ width: progress, background: color }} />
                </span>
                <strong>{progress}</strong>
              </div>
            ) : null}
            <footer>
              <span>最近更新：{updated}</span>
              <button>
                打开项目 <ChevronRight size={14} />
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

type SfScheduleRow = {
  schedule_id: string;
  task_description: string;
  agent_id?: string | null;
  cron_expression?: string | null;
  start_at?: string | null;
  next_run_time?: string | null;
  enabled: boolean;
};

function SchedulesView() {
  const demoRows: Array<{ id: string; name: string; agent: string; cron: string; next: string; enabled: boolean }> = [
    { id: "demo-1", name: "每天生成竞品动态简报", agent: "市场分析师", cron: "每天 09:00", next: "明天 09:00", enabled: true },
    { id: "demo-2", name: "汇总本周内容数据", agent: "内容策划师", cron: "每周五 18:00", next: "周五 18:00", enabled: true },
    { id: "demo-3", name: "检查品牌舆情风险", agent: "合规审核员", cron: "每 6 小时", next: "今天 16:00", enabled: false },
  ];
  const [rows, setRows] = useState(demoRows);
  const [loadState, setLoadState] = useState<SfLoadState>("loading");
  const live = loadState === "ready";
  useEffect(() => {
    sfFetch<SfScheduleRow[]>("/api/schedules")
      .then((list) => {
        if (!Array.isArray(list)) {
          setLoadState("error");
          return;
        }
        setRows(
          list.map((r) => ({
            id: r.schedule_id,
            name: r.task_description || r.schedule_id,
            agent: r.agent_id || "自动调度",
            cron: r.cron_expression || (r.start_at ? `一次性 · ${String(r.start_at).slice(0, 16).replace("T", " ")}` : "—"),
            next: r.next_run_time ? String(r.next_run_time).slice(0, 16).replace("T", " ") : "待触发",
            enabled: !!r.enabled,
          })),
        );
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);
  function toggle(index: number) {
    const row = rows[index];
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, enabled: !r.enabled } : r)));
    if (live) {
      sfFetch(`/api/schedules/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      }).catch(() => setRows((prev) => prev.map((r, i) => (i === index ? row : r))));
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
        <button>
          <Plus size={15} /> 创建定时任务
        </button>
      </div>
      <SfLoadTag state={loadState} />
      <div className="sf-schedule-list">
        {rows.map((schedule, index) => (
          <article key={schedule.id} className={schedule.enabled ? "" : "disabled"}>
            <span className="sf-schedule-icon">
              <CalendarClock size={18} />
            </span>
            <div>
              <strong>{schedule.name}</strong>
              <p>
                <span>{schedule.agent}</span> · {schedule.cron} · 下次 {schedule.next}
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
            <button>
              <MoreHorizontal size={17} />
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
        <strong>加载失败</strong>
        <p>用户列表加载出错，请稍后重试。</p>
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
