import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  GitBranch,
  LayoutGrid,
  Link2,
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
  Users,
  WalletCards,
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

/** 人物头像（DiceBear micah —— 现代扁平插画，比 Lorelei 线稿更精致；
    按 agent accent 色铺底，加载失败回落字母头像。键 = AgentAvatar label）。 */
function sfAvatarUrl(label: string, color: string): string {
  const bg = color.replace("#", "");
  return `https://api.dicebear.com/9.x/micah/svg?seed=${encodeURIComponent(
    label,
  )}&backgroundColor=${bg}&radius=0`;
}

type View = "chat" | "agents" | "knowledge" | "dashboard" | "projects" | "schedules" | "settings";

const viewCopy: Record<Exclude<View, "chat">, { title: string; subtitle: string }> = {
  agents: { title: "Agent 团队", subtitle: "管理角色、能力与协作关系" },
  knowledge: { title: "知识库", subtitle: "管理团队共享的知识与上下文" },
  dashboard: { title: "数据看板", subtitle: "用量、成本、Run 成功率与每日简报" },
  projects: { title: "项目", subtitle: "管理工作空间、会话与交付成果" },
  schedules: { title: "定时任务", subtitle: "管理所有 Agent 的周期与一次性计划" },
  settings: { title: "设置", subtitle: "模型、Skills、集成、记忆与工作空间" },
};

type ThreadKind = "ceo" | "atlas" | "fresh" | "growth" | "research" | "proposal";

type Conversation = {
  id: string;
  title: string;
  preview: string;
  time: string;
  unread?: boolean;
  pinned?: boolean;
  thread: ThreadKind;
};

const ceoConversation: Conversation = {
  id: "ceo",
  title: "董事长",
  preview: "全局调度 · 任务拆解与决策",
  time: "刚刚",
  unread: true,
  pinned: true,
  thread: "ceo",
};

const conversations: Conversation[] = [
  {
    id: "atlas",
    title: "Atlas 新品发布计划",
    preview: "品牌策略已进入人工审核",
    time: "刚刚",
    unread: true,
    thread: "atlas",
  },
  {
    id: "growth",
    title: "Q2 内容增长策略",
    preview: "内容团队已完成渠道排期",
    time: "昨天",
    thread: "growth",
  },
  {
    id: "research",
    title: "竞品市场研究",
    preview: "已分析 24 个竞品样本",
    time: "周一",
    thread: "research",
  },
  {
    id: "proposal",
    title: "客户提案自动化",
    preview: "等待补充预算范围",
    time: "05/18",
    thread: "proposal",
  },
];

type ScriptReply = {
  label: string;
  name: string;
  color: string;
  time: string;
  text: string;
};

const threadScripts: Record<Exclude<ThreadKind, "atlas" | "fresh">, { user: string; replies: ScriptReply[] }> = {
  ceo: {
    user: "团队现在的整体执行情况怎么样？接下来应该怎么排优先级？",
    replies: [
      {
        label: "CEO",
        name: "董事长",
        color: "#ff5e3a",
        time: "10:26",
        text: "三个项目并行推进：Atlas 发布已进入人工审核环节，Q2 内容增长完成渠道排期，客户提案自动化在等待预算输入。建议今天优先敲定 Atlas 的品牌主张，其余两条线按计划自动推进。",
      },
      {
        label: "CEO",
        name: "董事长",
        color: "#ff5e3a",
        time: "10:27",
        text: "需要调整优先级或临时加塞任务，直接在这里说一声，我会重新拆解并调度团队。",
      },
    ],
  },
  growth: {
    user: "帮我制定 Q2 内容增长策略，重点是多渠道分发和内容复用。",
    replies: [
      {
        label: "GM",
        name: "总经理",
        color: "#ff5e3a",
        time: "昨天 14:02",
        text: "已拆解为渠道矩阵、内容排期与数据复盘三条线。内容创意会先给出一周样例排期，市场研究员同步补充各渠道的竞品声量基线。",
      },
    ],
  },
  research: {
    user: "输出一份竞品市场研究简报，覆盖最近上新的同类产品。",
    replies: [
      {
        label: "MR",
        name: "市场研究员",
        color: "#2777e8",
        time: "周一 09:40",
        text: "完成 24 个竞品样本分析：可控的多 Agent 协作仍是最明显的差异化机会。简报已归档到知识库，可随时让品牌策略师引用。",
      },
    ],
  },
  proposal: {
    user: "把客户提案流程自动化，先给一版落地方案。",
    replies: [
      {
        label: "GM",
        name: "总经理",
        color: "#ff5e3a",
        time: "05/18 16:20",
        text: "方案已生成：提案模板 + 自动填充 + 人工终审三步走。当前在等待你补充预算范围，确认后我会生成完整执行计划。",
      },
    ],
  },
};

const quickPrompts = [
  "制定 Atlas 新品发布计划",
  "分析竞品并输出简报",
  "查看团队执行状态",
  "创建一个定时任务",
];

const dayLabels: Record<ThreadKind, string> = {
  ceo: "今天 10:26",
  atlas: "今天 10:24",
  growth: "昨天 14:02",
  research: "周一 09:40",
  proposal: "05/18 16:20",
  fresh: "新对话",
};

const agents = [
  {
    name: "总经理",
    role: "任务拆解与团队调度",
    initials: "GM",
    color: "#ff5e3a",
    status: "执行中",
  },
  {
    name: "市场研究员",
    role: "市场与竞品洞察",
    initials: "MR",
    color: "#2777e8",
    status: "已完成",
  },
  {
    name: "品牌策略师",
    role: "定位与传播策略",
    initials: "BS",
    color: "#d97b38",
    status: "执行中",
  },
  { name: "内容创意", role: "内容与渠道规划", initials: "CC", color: "#c64f7d", status: "等待中" },
];

export default function ProductApp() {
  const [view, setView] = useState<View>("chat");
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeConversation, setActiveConversation] = useState<Conversation>(ceoConversation);
  const [message, setMessage] = useState("");
  const [sentMap, setSentMap] = useState<Record<string, string[]>>({});
  const [detailOpen, setDetailOpen] = useState(true);

  const chatStatusText =
    activeConversation.thread === "ceo"
      ? "董事长在线 · 全局调度"
      : activeConversation.thread === "fresh"
        ? "新对话 · 等待你的第一条指令"
        : "3 位 Agent 正在协作";

  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        `${conversation.title}${conversation.preview}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  function openConversation(conversation: Conversation) {
    setActiveConversation(conversation);
    setView("chat");
    setMobileRailOpen(false);
    if (window.innerWidth <= 820) setPanelOpen(false);
  }

  function createConversation() {
    setActiveConversation({
      id: `new-${Date.now()}`,
      title: "新对话",
      preview: "还没有消息",
      time: "刚刚",
      thread: "fresh",
    });
    setView("chat");
    setMobileRailOpen(false);
    if (window.innerWidth <= 820) setPanelOpen(false);
  }

  function sendText(text: string) {
    const id = activeConversation.id;
    setSentMap((map) => ({ ...map, [id]: [...(map[id] || []), text] }));
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    sendText(message.trim());
    setMessage("");
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
          <div className="sf-account">
            <span>YL</span>
            <div>
              <strong>Yuki Lin</strong>
              <small>Personal workspace</small>
            </div>
            <MoreHorizontal size={15} />
          </div>
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
                  <strong>{activeConversation.title}</strong>
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
                {activeConversation.thread === "ceo" || activeConversation.thread === "fresh" ? (
                  <span>董</span>
                ) : (
                  <>
                    <span>GM</span>
                    <span>MR</span>
                    <span>BS</span>
                  </>
                )}
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
                <button className="sf-new-chat" onClick={createConversation}>
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
                <button
                  className={`sf-ceo-pin ${activeConversation.id === "ceo" ? "active" : ""}`}
                  onClick={() => openConversation(ceoConversation)}
                >
                  <AgentAvatar label="CEO" color="#ff5e3a" size="lg" />
                  <div>
                    <strong>董事长</strong>
                    <small>全局调度 · 任务拆解与决策</small>
                  </div>
                  <i />
                </button>
                <p>最近对话</p>
                <div className="sf-conversation-list">
                  {filteredConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      className={activeConversation.id === conversation.id ? "active" : ""}
                      onClick={() => openConversation(conversation)}
                    >
                      <span className="sf-conversation-icon">
                        <MessageSquare size={12} />
                        {conversation.unread && <i />}
                      </span>
                      <span>
                        <strong>{conversation.title}</strong>
                        <small>{conversation.preview}</small>
                      </span>
                      <time>{conversation.time}</time>
                    </button>
                  ))}
                </div>
                <p>项目与 Agent</p>
                <div className="sf-project-tree">
                  <button className="sf-folder-row">
                    <ChevronRight size={12} />
                    <Folder size={13} />
                    <span>Atlas 新品发布</span>
                  </button>
                  {agents.slice(0, 2).map((agent) => (
                    <button className="sf-agent-tree-row" key={agent.name}>
                      <AgentAvatar label={agent.initials} color={agent.color} small />
                      <span>
                        <strong>{agent.name}</strong>
                        <small>{agent.role}</small>
                      </span>
                      <i className={agent.status === "执行中" ? "working" : ""} />
                    </button>
                  ))}
                  <button className="sf-folder-row">
                    <ChevronRight size={12} />
                    <Folder size={13} />
                    <span>Q2 内容增长</span>
                  </button>
                </div>
              </aside>
            )}
            <section className="sf-chat">
              <div className="sf-chat-scroll sf-thread-enter" key={activeConversation.id}>
                <ChatThread
                  conversation={activeConversation}
                  sent={sentMap[activeConversation.id] || []}
                  onQuick={sendText}
                />
              </div>

              <form className="sf-composer" onSubmit={submitMessage}>
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
                    activeConversation.thread === "ceo"
                      ? "直接和董事长对话，或让它调度团队…"
                      : activeConversation.thread === "fresh"
                        ? "告诉团队接下来要做什么…"
                        : "继续这个会话…"
                  }
                />
                <div>
                  <span>
                    <button type="button" aria-label="添加附件">
                      <Paperclip size={16} />
                    </button>
                    <button type="button">
                      <Sparkles size={15} /> Skills
                    </button>
                  </span>
                  <span>
                    <small>Enter 发送 · Shift + Enter 换行</small>
                    <button
                      className="sf-send"
                      type="submit"
                      disabled={!message.trim()}
                      aria-label="发送"
                    >
                      <Send size={15} />
                    </button>
                  </span>
                </div>
              </form>
            </section>

            {detailOpen && (
              <RunPanel onClose={() => setDetailOpen(false)} />
            )}
          </div>
        )}

        {view === "agents" && <AgentsView />}
        {view === "knowledge" && <KnowledgeView />}
        {view === "dashboard" && <DashboardView />}
        {view === "projects" && <ProjectsView />}
        {view === "schedules" && <SchedulesView />}
        {view === "settings" && <SettingsView />}
      </main>
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

const RUN_STEPS: RunStep[] = [
  {
    name: "研究",
    status: "done",
    meta: "10:31 完成 · 4m 12s",
    substeps: [
      { agent: "市场研究员", slot: "竞品扫描与人群洞察", status: "done" },
      { agent: "总经理", slot: "任务拆解与派发", status: "done" },
    ],
  },
  {
    name: "策略",
    status: "running",
    meta: "正在执行 · 2m 47s",
    substeps: [
      { agent: "品牌策略师", slot: "定位与主张草案", status: "running" },
      { agent: "总经理", slot: "方案汇总复核", status: "pending" },
    ],
  },
  {
    name: "内容",
    status: "pending",
    meta: "等待策略产出",
    substeps: [{ agent: "内容创意", slot: "渠道排期与创意", status: "pending" }],
  },
  {
    name: "审核",
    status: "pending",
    meta: "由你确认",
    substeps: [{ agent: "人工审核", slot: "品牌主张终审", status: "pending" }],
  },
];

const RUN_DAG = {
  nodes: [
    { name: "研究", kind: "task" },
    { name: "策略", kind: "task" },
    { name: "内容", kind: "task" },
    { name: "审核", kind: "approve" },
  ],
  edges: [
    { from: "研究", to: "策略", mode: "顺序" },
    { from: "策略", to: "内容", mode: "顺序" },
    { from: "内容", to: "审核", mode: "approve · 人工门" },
  ],
};

type ApprovalItem = {
  id: string;
  from: string;
  label: string;
  color: string;
  summary: string;
  when: string;
  state: "pending" | "approved" | "rejected";
  reason?: string;
};

const RUN_APPROVALS: ApprovalItem[] = [
  {
    id: "ap1",
    from: "品牌策略师",
    label: "BS",
    color: "#d97b38",
    summary: "Atlas 品牌主张 v2 定稿（含 slogan 3 选 1）",
    when: "已等待 8 分钟",
    state: "pending",
  },
  {
    id: "ap0",
    from: "总经理",
    label: "GM",
    color: "#ff5e3a",
    summary: "竞品研究口径与数据源确认",
    when: "12 分钟前",
    state: "approved",
  },
  {
    id: "ap-1",
    from: "内容创意",
    label: "CC",
    color: "#c64f7d",
    summary: "Q2 渠道预算追加 5 万",
    when: "26 分钟前",
    state: "rejected",
    reason: "预算超限，请拆分到下季度再提",
  },
];

type ArtifactItem = {
  id: string;
  name: string;
  type: string;
  summary: string;
  size: string;
  pinned: boolean;
};

const RUN_ARTIFACTS: ArtifactItem[] = [
  {
    id: "ar1",
    name: "atlas-brand-proposal.yaml",
    type: "yaml",
    summary: "定位与主张草案 · 品牌策略师",
    size: "12 KB",
    pinned: true,
  },
  {
    id: "ar2",
    name: "competitor-brief.md",
    type: "markdown",
    summary: "竞品简报 · 市场研究员",
    size: "34 KB",
    pinned: false,
  },
  {
    id: "ar3",
    name: "campaign-calendar.html",
    type: "html",
    summary: "投放排期预览 · 内容创意",
    size: "18 KB",
    pinned: false,
  },
];

const TEAM_LIVE: Record<string, { sub: string; usage: string }> = {
  总经理: { sub: "汇总复核策略方案", usage: "本轮 4.2k tokens · ¥0.004" },
  市场研究员: { sub: "已交付竞品简报", usage: "本轮 6.1k tokens · ¥0.005" },
  品牌策略师: { sub: "起草定位与主张草案", usage: "本轮 3.8k tokens · ¥0.003" },
  内容创意: { sub: "等待策略产出后启动", usage: "本轮 0 tokens · ¥0.000" },
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

function RunPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"flow" | "team" | "approval" | "artifacts">("flow");
  const [runState, setRunState] = useState<"running" | "stopped">("running");
  const [startedAt] = useState(() => Date.now() - 754_000);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [steps, setSteps] = useState<RunStep[]>(RUN_STEPS);
  const [approvals, setApprovals] = useState<ApprovalItem[]>(RUN_APPROVALS);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>(RUN_ARTIFACTS);
  const [dagOpen, setDagOpen] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (runState !== "running") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runState]);

  const elapsed = fmtElapsed(runState === "running" ? nowMs - startedAt : 754_000);
  const pendingCount = approvals.filter((a) => a.state === "pending").length;

  const retryStep = (name: string) => {
    setSteps((all) =>
      all.map((x) => (x.name === name ? { ...x, status: "running" as const, meta: "重跑中…" } : x)),
    );
    window.setTimeout(() => {
      setSteps((all) =>
        all.map((x) => (x.name === name ? { ...x, status: "done" as const, meta: "刚刚 完成 · 4m 12s" } : x)),
      );
    }, 1800);
  };

  const rerunAll = () => {
    setSteps((all) =>
      all.map((x) => (x.status === "done" ? { ...x, status: "running" as const, meta: "重跑中…" } : x)),
    );
    window.setTimeout(() => {
      setSteps((all) =>
        all.map((x) =>
          x.status === "running" ? { ...x, status: "done" as const, meta: "刚刚 完成 · 4m 12s" } : x,
        ),
      );
    }, 2200);
  };

  const resolveApproval = (id: string, state: "approved" | "rejected") => {
    setApprovals((all) =>
      all.map((x) =>
        x.id === id
          ? {
              ...x,
              state,
              when: "刚刚",
              reason: state === "rejected" ? reason.trim() || "需要补充依据后再提交" : undefined,
            }
          : x,
      ),
    );
    setReasonFor(null);
    setReason("");
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
            <strong>Atlas 新品发布</strong>
          </div>
          <em>68%</em>
        </div>
        <div className="sf-progress">
          <i />
        </div>
        <p>3 / 4 个 Agent 已响应</p>
        <div className="sf-run-meta">
          <span className={`sf-run-pill ${runState}`}>{runState === "running" ? "运行中" : "已中断"}</span>
          <span className="sf-run-ticker">
            <Clock size={9} />
            {elapsed}
          </span>
          <span className="sf-run-cost">¥0.012</span>
        </div>
        <div className="sf-run-actions">
          {runState === "running" ? (
            <button className="sf-mini-btn danger" onClick={() => setRunState("stopped")}>
              <Square size={8} /> 停止
            </button>
          ) : (
            <button className="sf-mini-btn ok" onClick={() => setRunState("running")}>
              <Play size={8} /> 继续执行
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
            <span>步骤 · 4</span>
            <button onClick={() => setDagOpen(!dagOpen)}>{dagOpen ? "收起 DAG" : "查看 DAG"}</button>
          </div>
          <div className="sf-step-tree">
            {steps.map((step, idx) => (
              <div key={step.name}>
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
                  {step.status === "done" && (
                    <button className="sf-retry" onClick={() => retryStep(step.name)}>
                      <RotateCcw size={8} /> 重跑
                    </button>
                  )}
                  {step.status === "running" && <span className="sf-step-live">执行中</span>}
                </div>
                {step.substeps.map((sub) => (
                  <div className="sf-step-sub" key={sub.slot}>
                    <span />
                    <p>
                      {sub.agent} · {sub.slot}
                    </p>
                    <em className={sub.status}>{RUN_STATUS_TEXT[sub.status]}</em>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {dagOpen && (
            <div className="sf-dag-rail">
              {RUN_DAG.nodes.map((node, idx) => (
                <div key={node.name}>
                  <div className="sf-dag-node">
                    <span className={idx === 0 ? "entry" : ""} />
                    <strong>{node.name}</strong>
                    <em>{node.kind === "approve" ? "approve · 人工门" : "task"}</em>
                  </div>
                  {idx < RUN_DAG.edges.length && <p className="sf-dag-edge">↓ {RUN_DAG.edges[idx].mode}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "team" && (
        <div className="sf-panel-section">
          <div className="sf-panel-title">
            <span>当前团队</span>
            <button>管理</button>
          </div>
          {agents.map((agent) => (
            <div key={agent.name}>
              <button className="sf-agent-row" onClick={() => setOpenAgent(openAgent === agent.name ? null : agent.name)}>
                <AgentAvatar label={agent.initials} color={agent.color} small />
                <div>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </div>
                <span className={agent.status === "执行中" ? "running" : ""}>{agent.status}</span>
              </button>
              {openAgent === agent.name && (
                <div className="sf-expand-card">
                  <p>当前：{TEAM_LIVE[agent.name]?.sub ?? "—"}</p>
                  <p className="mono">{TEAM_LIVE[agent.name]?.usage ?? "—"}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "approval" && (
        <div className="sf-panel-section">
          <div className="sf-panel-title">
            <span>人工审批门</span>
            <button>{pendingCount} 项待审批</button>
          </div>
          {approvals.map((ap) => (
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
              {ap.state === "pending" ? (
                <>
                  <div className="sf-appr-actions">
                    <button className="ok" onClick={() => resolveApproval(ap.id, "approved")}>
                      <Check size={9} /> 批准
                    </button>
                    <button className="no" onClick={() => setReasonFor(reasonFor === ap.id ? null : ap.id)}>
                      <X size={9} /> 驳回
                    </button>
                  </div>
                  {reasonFor === ap.id && (
                    <div className="sf-appr-reason">
                      <input
                        value={reason}
                        onChange={(e: FormEvent<HTMLInputElement>) => setReason(e.currentTarget.value)}
                        placeholder="驳回理由（可选）"
                      />
                      <button className="no" onClick={() => resolveApproval(ap.id, "rejected")}>
                        确认驳回
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="sf-appr-log">
                  {ap.state === "approved" ? "✅ 已批准" : "❌ 已驳回"}
                  {ap.reason ? ` · ${ap.reason}` : ""}
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
            <button>全部下载</button>
          </div>
          {artifacts.map((art) => (
            <div className="sf-art-row" key={art.id}>
              <span className="sf-art-icon">
                <FileText size={11} />
              </span>
              <div>
                <strong>{art.name}</strong>
                <small>
                  {art.type} · {art.size} · {art.summary}
                </small>
              </div>
              <div className="sf-art-actions">
                <button
                  className={art.pinned ? "pin on" : "pin"}
                  title={art.pinned ? "取消置顶" : "置顶"}
                  onClick={() =>
                    setArtifacts((all) =>
                      all.map((x) => (x.id === art.id ? { ...x, pinned: !x.pinned } : x)),
                    )
                  }
                >
                  <Pin size={9} />
                </button>
                <button title="下载">
                  <Download size={9} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sf-run-foot">8 tools · 12.4k tokens · ¥0.012</div>
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

function AtlasThreadBody() {
  return (
    <>
      <article className="sf-user-message">
        <p>为 Atlas 的新品发布制定一套完整的营销方案，目标是获得 1,000 个早期用户。</p>
      </article>
      <article className="sf-agent-message">
        <AgentAvatar label="GM" color="#ff5e3a" />
        <div className="sf-message-body">
          <div className="sf-message-author">
            <strong>总经理</strong>
            <span>10:24</span>
          </div>
          <p>
            收到。我会先明确目标与交付标准，然后让研究员和策略师并行推进。关键品牌主张会在执行前交给你审核。
          </p>
          <div className="sf-plan">
            <div className="sf-plan-head">
              <span>
                <GitBranch size={15} /> 执行计划
              </span>
              <small>4 个阶段 · 预计 18 分钟</small>
            </div>
            {[
              ["市场与竞品研究", "市场研究员", "完成", "done"],
              ["定位与传播策略", "品牌策略师", "执行中", "running"],
              ["内容与渠道规划", "内容创意", "等待中", "pending"],
              ["人工审核与交付", "你", "等待中", "pending"],
            ].map(([title, owner, status, state], index) => (
              <div className="sf-plan-row" key={title}>
                <span className={state}>{state === "done" ? <Check size={12} /> : index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{owner}</small>
                </div>
                <em className={state}>{status}</em>
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="sf-agent-message">
        <AgentAvatar label="MR" color="#2777e8" />
        <div className="sf-message-body">
          <div className="sf-message-author">
            <strong>市场研究员</strong>
            <span>10:31</span>
          </div>
          <p>
            第一轮市场扫描完成。我分析了 24
            个同类产品，发现“可控的多 Agent 协作”仍是最明显的差异化机会。
          </p>
          <button className="sf-artifact">
            <span>
              <FileText size={17} />
            </span>
            <div>
              <strong>Atlas 市场与竞品研究</strong>
              <small>研究报告 · 24 个来源 · 8 页</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </article>
    </>
  );
}

function ChatThread({
  conversation,
  sent,
  onQuick,
}: {
  conversation: Conversation;
  sent: string[];
  onQuick: (text: string) => void;
}) {
  const kind = conversation.thread;
  const script = kind === "atlas" || kind === "fresh" ? null : threadScripts[kind];

  return (
    <>
      {(kind === "ceo" || kind === "fresh") && <CeoHero onQuick={onQuick} />}
      {kind !== "fresh" && (
        <div className="sf-date-line">
          <span>{dayLabels[kind]}</span>
        </div>
      )}
      {kind === "atlas" ? (
        <AtlasThreadBody />
      ) : kind === "fresh" ? (
        sent.length === 0 && (
          <p className="sf-thread-hint">还没有消息 —— 试试上面的快捷指令，或直接输入你的第一个任务。</p>
        )
      ) : (
        script && (
          <>
            <article className="sf-user-message">
              <p>{script.user}</p>
            </article>
            {script.replies.map((reply) => (
              <article className="sf-agent-message" key={reply.time}>
                <AgentAvatar label={reply.label} color={reply.color} />
                <div className="sf-message-body">
                  <div className="sf-message-author">
                    <strong>{reply.name}</strong>
                    <span>{reply.time}</span>
                  </div>
                  <p>{reply.text}</p>
                </div>
              </article>
            ))}
          </>
        )
      )}
      {sent.map((text, index) => (
        <article className="sf-user-message sf-new-message" key={`${index}-${text}`}>
          <p>{text}</p>
        </article>
      ))}
      {(kind === "atlas" || sent.length > 0) && (
        <div className="sf-working">
          <span />
          <span />
          <span />
          <p>
            {kind === "atlas" ? (
              <>
                <strong>品牌策略师</strong> 正在生成定位假设
              </>
            ) : (
              <>
                <strong>董事长</strong> 正在拆解任务并调度团队
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
// 后端可达 → 拉真实编队；不可达（Figma Make 静态预览）→ 回落演示数据。

type PolicyCellState = "permit" | "warn" | "deny";
type PolicyMatrix = Record<string, Record<string, PolicyCellState>>;

interface SfDagEdge {
  source: string;
  target: string;
  /** direct | approve | conditional（后端在 e.data.mode，这里归一） */
  mode?: string;
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
    deltas: { calls: number; total_tokens: number; cost_est_usd: number };
  };
  runs: { total: number; succeeded: number; failed: number; canceled: number; success_rate: number | null };
  active: { projects: number; conversations: number };
}
interface SfDashBreakdownItem {
  model?: string;
  label?: string;
  calls?: number;
  total_tokens?: number;
  cost_est_usd?: number;
}

const SF_API_BASE: string =
  ((import.meta as any).env && (import.meta as any).env.VITE_API_BASE) || "";

async function sfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SF_API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: unknown = await res.json().catch(() => null);
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

/** 演示编队（后端不可达时的回落，与上方 agents 卡片同一批角色）。 */
const DEMO_TEAM: SfTeamDag = {
  team_id: "demo-atlas",
  name: "Atlas 新品发布作战室",
  edges: [
    { source: "GM", target: "MR", mode: "direct" },
    { source: "GM", target: "BS", mode: "direct" },
    { source: "MR", target: "BS", mode: "direct" },
    { source: "BS", target: "CC", mode: "approve" },
    { source: "CC", target: "GM", mode: "conditional" },
  ],
  resolved_agents: [
    { id: "GM", title: "总经理" },
    { id: "MR", title: "市场研究员" },
    { id: "BS", title: "品牌策略师" },
    { id: "CC", title: "内容创意" },
  ],
  policy: {
    MR: { CC: "permit" },
    BS: { CC: "warn" },
    CC: { GM: "deny" },
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

  const colorOf = (id: string, index: number): string =>
    agents.find((a) => a.initials === id)?.color ?? SF_PALETTE[index % SF_PALETTE.length];

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
            const color = colorOf(n.id, i);
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
  const colorOf = (id: string, index: number): string =>
    agents.find((a) => a.initials === id)?.color ?? SF_PALETTE[index % SF_PALETTE.length];
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
            <i style={{ background: colorOf(c.id, ci) }}>{(c.title || c.id).slice(0, 1)}</i>
            {(c.title || c.id).slice(0, 2)}
          </span>
        ))}
        {roster.map((r, ri) => (
          <Fragment key={`r${r.id}`}>
            <span className="sf-policy-head sf-policy-row" title={r.title}>
              <i style={{ background: colorOf(r.id, ri) }}>{(r.title || r.id).slice(0, 1)}</i>
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
        /* 后端不可达 —— 保留演示数据 */
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
        {live ? "LIVE · 已连接后端" : "演示数据 · 未连接后端"}
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

function KnowledgeView() {
  const [packs, setPacks] = useState<SfPackCard[] | null>(null);
  useEffect(() => {
    sfFetch<{ packs?: SfPackCard[] }>("/api/memory-bank/packs")
      .then((d) => setPacks(Array.isArray(d?.packs) ? d.packs : []))
      .catch(() => setPacks(null));
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
        <button>
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
      {packs === null && <p className="sf-live-tag">演示数据 · 后端未连接</p>}
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
    </section>
  );
}

const dashboardSeries = {
  7: [18, 31, 27, 46, 39, 62, 71],
  30: [12, 18, 17, 28, 25, 39, 35, 51, 48, 58, 55, 73],
  90: [8, 14, 12, 21, 18, 32, 29, 40, 38, 55, 49, 67],
};

function DashboardView() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metric, setMetric] = useState<"tokens" | "calls" | "cost">("tokens");
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  // 对齐后端 /api/dashboard/{overview,timeseries,breakdown}；不可达回落演示数据
  const [ov, setOv] = useState<SfDashOverview | null>(null);
  const [series, setSeries] = useState<number[] | null>(null);
  const [breakdown, setBreakdown] = useState<SfDashBreakdownItem[] | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [o, t, b] = await Promise.all([
          sfFetch<SfDashOverview>(`/api/dashboard/overview?days=${days}`),
          sfFetch<{ series?: Array<{ tokens?: number; calls?: number; cost?: number }> }>(
            `/api/dashboard/timeseries?days=${days}&metric=${metric}`,
          ),
          sfFetch<{ items?: SfDashBreakdownItem[] }>(
            `/api/dashboard/breakdown?days=${days}&by=model`,
          ),
        ]);
        if (dead) return;
        setOv(o ?? null);
        setSeries(
          (t.series ?? []).map((row) =>
            Number(metric === "cost" ? row.cost : metric === "calls" ? row.calls : row.tokens) || 0,
          ),
        );
        setBreakdown(b.items ?? []);
        setLive(true);
      } catch {
        if (!dead) {
          setOv(null);
          setSeries(null);
          setBreakdown(null);
          setLive(false);
        }
      }
    })();
    return () => {
      dead = true;
    };
  }, [days, metric]);

  const values = series ?? dashboardSeries[days];
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
  const multiplier = days === 7 ? 0.34 : days === 30 ? 1 : 2.7;

  const runs = ov?.runs ?? { total: 126, succeeded: 119, failed: 4, canceled: 3, success_rate: 94.8 };
  const successRate = runs.success_rate ?? 0;
  const usageCards: Array<[string, string, string, string]> = ov
    ? [
        [
          "LLM 调用",
          ov.usage.calls.toLocaleString(),
          `${ov.usage.deltas.calls >= 0 ? "+" : ""}${ov.usage.deltas.calls}%`,
          ov.usage.deltas.calls >= 0 ? "up" : "down",
        ],
        [
          "Token 消耗",
          ov.usage.total_tokens >= 1e6
            ? `${(ov.usage.total_tokens / 1e6).toFixed(2)}M`
            : `${Math.round(ov.usage.total_tokens / 1e3)}k`,
          `${ov.usage.deltas.total_tokens >= 0 ? "+" : ""}${ov.usage.deltas.total_tokens}%`,
          ov.usage.deltas.total_tokens >= 0 ? "up" : "down",
        ],
        [
          "估算成本",
          `$${ov.usage.cost_est_usd.toFixed(2)}`,
          `${ov.usage.deltas.cost_est_usd >= 0 ? "+" : ""}${ov.usage.deltas.cost_est_usd}%`,
          ov.usage.deltas.cost_est_usd >= 0 ? "up" : "down",
        ],
        [
          "Run 成功率",
          ov.runs.success_rate != null ? `${ov.runs.success_rate}%` : "—",
          `共 ${ov.runs.total} 次`,
          "",
        ],
        [
          "活跃项目",
          String(ov.active.projects),
          `${ov.active.conversations} 个会话`,
          "",
        ],
      ]
    : [
        ["LLM 调用", Math.round(286 * multiplier).toLocaleString(), "+18.6%", "up"],
        ["Token 消耗", `${(1.84 * multiplier).toFixed(2)}M`, "+12.4%", "up"],
        ["估算成本", `$${(38.72 * multiplier).toFixed(2)}`, "-6.8%", "down"],
        ["Run 成功率", "94.8%", "+2.1%", "up"],
        ["活跃项目", Math.max(3, Math.round(8 * multiplier)).toString(), "12 个会话", ""],
      ];
  const breakdownRows: Array<[string, string, string, string, string]> = breakdown?.length
    ? (() => {
        const totalTokens = breakdown.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0) || 1;
        return breakdown.slice(0, 5).map((row) => [
          row.model ?? row.label ?? "—",
          String(row.calls ?? "—"),
          (row.total_tokens ?? 0) >= 1e6
            ? `${((row.total_tokens ?? 0) / 1e6).toFixed(2)}M`
            : `${Math.round((row.total_tokens ?? 0) / 1e3)}k`,
          `$${(row.cost_est_usd ?? 0).toFixed(2)}`,
          `${Math.round(((row.total_tokens ?? 0) / totalTokens) * 100)}%`,
        ]);
      })()
    : [
        ["Claude 3.7 Sonnet", "128", "842k", "$18.42", "46%"],
        ["GPT-4.1", "96", "615k", "$12.08", "33%"],
        ["Gemini 2.5 Pro", "62", "383k", "$8.22", "21%"],
      ];

  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 650);
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
            <span>05/01</span>
            <span>05/08</span>
            <span>05/15</span>
            <span>05/22</span>
            <span>今天</span>
          </div>
        </article>

        <article className="sf-brief-card">
          <div className="sf-card-title">
            <div>
              <strong>每日简报</strong>
              <span>今天 09:00 更新</span>
            </div>
          </div>
          <div className="sf-brief-highlight">
            <span>
              <Zap size={17} />
            </span>
            <div>
              <small>今日调用</small>
              <strong>38</strong>
            </div>
            <em>+$4.21</em>
          </div>
          <ul>
            <li>
              <span>完成 Runs</span>
              <strong>12</strong>
            </li>
            <li>
              <span>平均响应时间</span>
              <strong>18.4s</strong>
            </li>
            <li>
              <span>待人工审核</span>
              <strong className="warm">2</strong>
            </li>
            <li>
              <span>失败任务</span>
              <strong>1</strong>
            </li>
          </ul>
          <div className="sf-dashboard-alert">
            <ShieldCheck size={15} />
            <span>品牌策略 Agent 有 2 项输出等待审核</span>
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
              <strong>Agent 用量排行</strong>
              <span>按 Token 统计</span>
            </div>
          </div>
          <ul className="sf-usage-bars">
            {[
              ["总经理", 642, "#ff5e3a"],
              ["市场研究员", 488, "#2777e8"],
              ["品牌策略师", 397, "#8e6cff"],
              ["内容创意", 313, "#2ec4a6"],
            ].map(([name, tokens, color]) => (
              <li key={name as string}>
                <span className="sf-usage-name">{name}</span>
                <span className="sf-usage-track">
                  <i
                    style={{
                      width: `${((tokens as number) / 700) * 100}%`,
                      background: color as string,
                    }}
                  />
                </span>
                <span className="sf-usage-val">{tokens}k</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <div className="sf-breakdown-card">
        <div className="sf-card-title">
          <div>
            <strong>模型用量分布</strong>
            <span>按 Token 统计{live ? " · 实时" : ""}</span>
          </div>
          <button>导出 CSV</button>
        </div>
        <div className="sf-breakdown-head">
          <span>模型</span>
          <span>调用</span>
          <span>Tokens</span>
          <span>成本</span>
          <span>占比</span>
        </div>
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

function ProjectsView() {
  const [showCreate, setShowCreate] = useState(false);
  const [liveProjects, setLiveProjects] = useState<SfProject[] | null>(null);
  useEffect(() => {
    sfFetch<SfProject[]>("/api/projects?withSessions=1")
      .then((list) => setLiveProjects(Array.isArray(list) ? list : []))
      .catch(() => setLiveProjects(null));
  }, []);
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
      {liveProjects === null && <p className="sf-live-tag">演示数据 · 后端未连接</p>}
      {showCreate && (
        <form
          className="sf-inline-create"
          onSubmit={(event) => {
            event.preventDefault();
            setShowCreate(false);
          }}
        >
          <Folder size={17} />
          <input autoFocus required placeholder="输入项目名称" />
          <button type="submit">创建</button>
          <button type="button" onClick={() => setShowCreate(false)}>
            <X size={15} />
          </button>
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
    { id: "demo-1", name: "每天生成竞品动态简报", agent: "市场研究员", cron: "每天 09:00", next: "明天 09:00", enabled: true },
    { id: "demo-2", name: "汇总本周内容数据", agent: "内容创意", cron: "每周五 18:00", next: "周五 18:00", enabled: true },
    { id: "demo-3", name: "检查品牌舆情风险", agent: "品牌策略师", cron: "每 6 小时", next: "今天 16:00", enabled: false },
  ];
  const [rows, setRows] = useState(demoRows);
  const [live, setLive] = useState(false);
  useEffect(() => {
    sfFetch<SfScheduleRow[]>("/api/schedules")
      .then((list) => {
        if (!Array.isArray(list)) return;
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
        setLive(true);
      })
      .catch(() => setLive(false));
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
      {!live && <p className="sf-live-tag">演示数据 · 后端未连接</p>}
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
  const [live, setLive] = useState(false);
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
        setLive(true);
      })
      .catch(() => setLive(false));
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
      setNotice({ tone: "err", text: live ? "保存失败，请检查后端连接" : "后端未连接，改动仅保留在演示态" });
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
      setNotice({ tone: "err", text: live ? "删除失败" : "后端未连接，无法删除" });
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
      {!live && <p className="sf-live-tag">演示数据 · 后端未连接</p>}
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
  const [live, setLive] = useState(true);
  useEffect(() => {
    sfFetch<Row[]>("/api/skills")
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => {
        setLive(false);
        setItems([]);
      });
  }, []);
  return (
    <div className="sf-settings-list">
      {!live && <p className="sf-live-tag">后端未连接 · 无法加载技能列表</p>}
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
  const [live, setLive] = useState(true);
  useEffect(() => {
    sfFetch<{ agents?: Row[] }>("/api/settings/agents/detect")
      .then((j) => setItems((j.agents ?? []).filter((a) => a.installed !== false)))
      .catch(() => {
        setLive(false);
        setItems([]);
      });
  }, []);
  return (
    <div className="sf-settings-list">
      {!live && <p className="sf-live-tag">后端未连接 · 无法探测本地执行器</p>}
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
  const [live, setLive] = useState(true);
  useEffect(() => {
    sfFetch<{ items?: Row[] }>("/api/connectors")
      .then((j) => {
        const list = j.items ?? [];
        setItems(mcp ? list.filter((c) => c.transport === "stdio" || c.transport === "http") : list);
      })
      .catch(() => {
        setLive(false);
        setItems([]);
      });
  }, [mcp]);
  return (
    <div className="sf-settings-list">
      {!live && <p className="sf-live-tag">后端未连接 · 无法加载连接器</p>}
      {(items ?? []).map((row) => (
        <article key={row.id}>
          <strong>{row.name || row.id}</strong>
          <p>
            {row.kind ?? "connector"} · {row.transport ?? "stdio"} · {row.status ?? "未知状态"}
          </p>
          <span>
            {row.policy?.enabled === false ? "已禁用" : "已启用"} · 审批 {row.policy?.approval_mode ?? "auto"}
          </span>
        </article>
      ))}
      {items !== null && items.length === 0 && <em className="sf-byok-empty">暂无{mcp ? " MCP " : " "}连接器</em>}
    </div>
  );
}

function MemoryEntriesSection() {
  type Row = { id: string; scope?: string; title?: string; content?: string; created_at?: string };
  const [items, setItems] = useState<Row[] | null>(null);
  const [live, setLive] = useState(true);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    sfFetch<Row[]>("/api/memory-entries")
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => {
        setLive(false);
        setItems([]);
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
      {!live && <p className="sf-live-tag">后端未连接 · 无法加载记忆条目</p>}
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

function SettingsView() {
  const [section, setSection] = useState("模型与密钥");
  const groups: Array<[string, string[]]> = [
    ["账户", ["个人资料"]],
    ["外观", ["主题与显示", "语言"]],
    ["集成", ["Skills", "模型与密钥", "工具提供商", "连接器", "MCP 集成"]],
    ["记忆", ["记忆条目", "Agent 画像", "交接与写回"]],
    ["数据", ["通知", "高级设置"]],
  ];
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
                ) : item === "个人资料" ? (
                  <Users size={15} />
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
