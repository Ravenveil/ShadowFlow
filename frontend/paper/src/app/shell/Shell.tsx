/**
 * Shell — 四栏工作台外壳：Rail / 会话列表 / 聊天 / 执行详情。
 *
 * 只负责**视图状态**（哪条会话、面板开关、设置开关），所有业务数据来自
 * `data/useWorkspace()`；数据源是 mock 还是 http 由 `data/source.ts` 决定，
 * 这里不认识任何一个具体数据文件。文案仍在 `content/app.ts`。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Rail } from '@/app/shell/Rail';
import { SessionList } from '@/app/shell/SessionList';
import { TeamPane } from '@/app/shell/panes/TeamPane';
import { KnowledgePane } from '@/app/shell/panes/KnowledgePane';
import { ProjectsPane } from '@/app/shell/panes/ProjectsPane';
import { NewsPane } from '@/app/shell/panes/NewsPane';
import { usePaneWidth } from '@/app/shell/usePaneWidth';
import { ChatArea } from '@/runtime/chat/ChatArea';
import { AgentPanel } from '@/runtime/panel/AgentPanel';
import { SettingsSheet, type SettingsSection } from '@/app/settings/SettingsSheet';
import { CHAT } from '@/shared/content/app';
import type { Outbound } from '@/shared/data/types';
import { DEFAULT_SESSION_ID } from '@/shared/data/source';
import { useWorkspace } from '@/shared/data/useWorkspace';
import { downloadJson } from '@/shared/ui/download';
import { getAgents } from '@/shared/data/http/generic';
import { setAgentAvatars } from '@/shared/data/avatarRegistry';
import NewsView from '@/business/news/NewsView';
import TeamsView from '@/business/teams/TeamsView';
import KnowledgeView from '@/business/knowledge/KnowledgeView';
import SchedulesView from '@/business/schedules/SchedulesView';
import ProjectsView from '@/business/projects/ProjectsView';
import FilesView from '@/runtime/host/FilesView';

/** 工作台视图 id，与 content/app.ts 的 RAIL 导航项对齐。 */
type ViewId = string;

/** 会话列表栏 / 右栏的宽度记忆 key（夹取范围在 tokens.css，不在这里抄数字）。 */
const LIST_WIDTH_KEY = 'sf.paper.listWidth';
/** 会话列表收起状态（0 = 收起）；收起后聊天区头部留一个展开按钮。 */
const LIST_OPEN_KEY = 'sf.paper.listOpen';
const PANEL_WIDTH_KEY = 'sf.paper.panelWidth';
/** 键盘微调步长（← 变宽 / → 变窄）：交互参数，布局里没有对应值。 */
const PANEL_STEP = 16;

/**
 * 读一个 CSS 变量的 px 值。
 *
 * 列宽、夹取范围的真源都在 `tokens.css`：主题换风格时那里会变，
 * JS 再抄一份就会两边不同步（这次差点又抄一遍 rail-w）。
 */
function cssPx(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** 布局尺寸快照：挂载时读一次（主题切换只换色，不改这几项）。 */
function useShellMetrics() {
  const [metrics] = useState(() => ({
    rail: cssPx('--rail-w'),
    list: cssPx('--list-w'),
    listMin: cssPx('--list-min-w'),
    listMax: cssPx('--list-max-w'),
    panelDefault: cssPx('--panel-w'),
    panelMin: cssPx('--panel-min-w'),
    panelMax: cssPx('--panel-max-w'),
    chatMin: cssPx('--chat-min-w'),
  }));
  return metrics;
}

export function Shell({ onExit }: { onExit: () => void }) {
  const metrics = useShellMetrics();
  const {
    data,
    status,
    error,
    send,
    sending,
    stop,
    watch,
    focus,
    transcribe,
    savePolicy,
    patchSettings,
    savingSettings,
    rescanCli,
    testSsh,
    reset,
    reload,
    resolveDm,
    resolveApproval,
    listProjects,
    createProject,
    renameProject,
    deleteProject,
    createProjectConversation,
    createConversation,
    createGroupChat,
    useTeamTemplate,
    listArtifacts,
    readArtifact,
    artifactRawUrl,
    loadArcRuns,
    loadArcPipeline,
    readArcArtifact,
    arcArtifactRawUrl,
  } = useWorkspace();
  /**
   * 演示态的默认会话；接真后端时这个 id 不存在，会自动回落到列表第一条
   * （消息按**解析出来的** session.id 取，所以回落也不会串号）。
   */
  const [activeId, setActiveId] = useState(DEFAULT_SESSION_ID);
  /** 第二栏（会话列表）收起了没有：× 收起后留一条窄栏拿回来。 */
  const [listOpen, setListOpen] = useState(() => {
    try {
      return localStorage.getItem(LIST_OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LIST_OPEN_KEY, listOpen ? '1' : '0');
    } catch {
      // localStorage 不可用时只留内存态
    }
  }, [listOpen]);
  const [panelOpen, setPanelOpen] = useState(true);
  /** 当前工作台视图：chat 走四栏对话壳，其余走单页子视图。 */
  const [view, setView] = useState<ViewId>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('appearance');
  /** 选中的模型 id；空表示还没选过，用数据里的第一个。 */
  const [modelId, setModelId] = useState<string | null>(null);
  /**
   * 正在右栏看谁的产物（成员显示名）；null = 全部（工作目录浏览）。
   * 由聊天区成员条 / 编队成员格 / 产物页胶囊共同驱动 —— 一个状态，三处一致。
   */
  const [focusedMember, setFocusedMember] = useState<string | null>(null);

  /**
   * 每个子视图各自记着「第二栏里选了谁」：切走再切回来，还是原来那一项。
   * 键是视图 id，值是团队 / 知识包 / 项目的主键。
   */
  const [paneKey, setPaneKey] = useState<Record<string, string>>({});
  const pickers = useMemo(() => {
    const of = (id: ViewId) => (key: string) =>
      setPaneKey((prev) => (prev[id] === key ? prev : { ...prev, [id]: key }));
    return { team: of('team'), kb: of('kb'), project: of('project'), news: of('news') };
  }, []);
  const paneWidth = usePaneWidth();

  // ── 会话列表栏拖宽（对齐 legacy NeoRail：右缘热区 + window pointer 跟随）──
  const [listWidth, setListWidth] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(LIST_WIDTH_KEY));
      return Number.isFinite(v) && v >= metrics.listMin && v <= metrics.listMax ? v : null;
    } catch {
      return null;
    }
  });
  const listResizingRef = useRef(false);
  const handleListResizeStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    listResizingRef.current = true;
    document.body.classList.add('sf-list-resizing');
    const startWidth = listWidth ?? metrics.list;
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      if (!listResizingRef.current) return;
      const next = Math.min(
        metrics.listMax,
        Math.max(metrics.listMin, Math.round(startWidth + (ev.clientX - startX))),
      );
      setListWidth(next);
      try {
        localStorage.setItem(LIST_WIDTH_KEY, String(next));
      } catch {
        // localStorage 不可用就只用内存态
      }
    };
    const up = () => {
      listResizingRef.current = false;
      document.body.classList.remove('sf-list-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // listWidth 只在冻结起点时读一次，故意不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ── 右栏拖宽（拖左缘，向左变宽；与左栏同一套 window pointer 跟随）──
  const [panelWidth, setPanelWidth] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(PANEL_WIDTH_KEY));
      return Number.isFinite(v) && v >= metrics.panelMin && v <= metrics.panelMax ? v : null;
    } catch {
      return null;
    }
  });
  const panelResizingRef = useRef(false);

  /**
   * 右栏上限跟着窗口走：固定 560 在 1280 以下会把聊天区挤成一条缝。
   * 左边三栏占多少就扣多少，余下再留 --chat-min-w 给正文。
   */
  const panelCeiling = useCallback(() => {
    const room = window.innerWidth - metrics.rail - (listWidth ?? metrics.list) - metrics.chatMin;
    return Math.max(metrics.panelMin, Math.min(metrics.panelMax, room));
  }, [listWidth]);
  /** pointermove 里读，避免把 panelCeiling 塞进空依赖的 useCallback。 */
  const ceilingRef = useRef(panelCeiling);
  ceilingRef.current = panelCeiling;

  const clampPanel = useCallback(
    (px: number) => Math.max(metrics.panelMin, Math.min(ceilingRef.current(), Math.round(px))),
    [],
  );

  const storePanelWidth = useCallback((px: number) => {
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(px));
    } catch {
      // localStorage 不可用时仅用内存态
    }
  }, []);

  const handlePanelResizeStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    panelResizingRef.current = true;
    document.body.classList.add('sf-panel-resizing');
    const startWidth = panelWidth ?? metrics.panelDefault;
    const startX = e.clientX;
    const move = (ev: PointerEvent) => {
      if (!panelResizingRef.current) return;
      setPanelWidth(clampPanel(startWidth - (ev.clientX - startX)));
    };
    const up = () => {
      panelResizingRef.current = false;
      document.body.classList.remove('sf-panel-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // panelWidth 只在冻结起点时读一次，故意不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 键盘微调：← 变宽 / → 变窄，一次一个步长。 */
  const bumpPanelWidth = useCallback(
    (dir: 1 | -1) => setPanelWidth((w) => clampPanel((w ?? metrics.panelDefault) + dir * PANEL_STEP)),
    [clampPanel],
  );

  /** 双击把手：回到主题默认宽度，并把记忆清掉。 */
  const resetPanelWidth = useCallback(() => {
    setPanelWidth(null);
    try {
      localStorage.removeItem(PANEL_WIDTH_KEY);
    } catch {
      // 隐私模式下删不掉也无所谓，下次打开仍是默认宽度
    }
  }, []);

  // 宽度只在这里落盘：拖动 / 键盘 / 复位都先改 state，避免每条 pointermove 都写盘。
  useEffect(() => {
    if (panelWidth === null) return;
    storePanelWidth(panelWidth);
  }, [panelWidth, storePanelWidth]);

  // 窗口变窄时收敛到新上限，别把聊天区挤成一条缝。
  useEffect(() => {
    const onResize = () => setPanelWidth((w) => (w === null ? null : clampPanel(w)));
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [clampPanel]);

  const gridStyle = useMemo(    () =>
      ({
        ...(listWidth === null ? {} : { '--list-w': `${listWidth}px` }),
        ...(panelWidth === null ? {} : { '--panel-w': `${panelWidth}px` }),
      }) as CSSProperties,
    [listWidth, panelWidth],
  );

  const session = useMemo(
    () => data?.sessions.find((s) => s.id === activeId) ?? data?.sessions[0],
    [data, activeId],
  );
  /** 消息永远跟着**解析出来的**会话走（activeId 可能是空或已失效的旧 id）。 */
  const messages = useMemo(
    () => (session ? (data?.threads[session.id] ?? []) : []),
    [data, session],
  );

  /** 董事长单聊解析出来的会话 id；置顶卡的选中态靠它点亮。 */
  const [ceoDmId, setCeoDmId] = useState('');

  /**
   * 打开某个 agent 的单聊：resolve → 刷新会话列表 → 聚焦。
   * resolve 返回的 group id 不一定已在本地 sessions 里，reload 一次才接得上消息。
   */
  const openAgentDm = useCallback(
    async (agentId: string) => {
      const gid = await resolveDm(agentId).catch(() => '');
      if (gid) {
        setActiveId(gid);
        reload();
      }
      return gid;
    },
    [resolveDm, reload],
  );

  /**
   * 董事长置顶卡：先在后端名册里找「主控」，找不到才回落到旧 id。
   *
   * 以前写死 `agent-shadow-secretary`：后端一换 agent 集合，这张卡就只剩
   * 「Agent not found」—— 名册里有真主控时不看名册，等于没接上后端。
   */
  const openCeoDm = useCallback(() => {
    const roster = data?.roster ?? [];
    const ceo = roster.find((m) =>
      CHAT.ceoMatch.some((k) => `${m.name}${m.role ?? ''}`.toLowerCase().includes(k)),
    );
    const candidates = [ceo?.id, 'agent-shadow-secretary', ...roster.map((m) => m.id)].filter(
      (id): id is string => !!id,
    );
    void (async () => {
      for (const agentId of candidates) {
        const gid = await openAgentDm(agentId).catch(() => '');
        if (gid) {
          setCeoDmId(gid);
          return;
        }
      }
    })();
  }, [openAgentDm, data?.roster]);

  const select = useCallback((id: string) => setActiveId(id), []);

  // 切会话：右栏那块（编队 / 策略 / 工作流 / 执行）跟着换。
  // 数据里记着这四块属于哪条会话（`focused`），不一致才重取，首屏不重复拉。
  useEffect(() => {
    if (session && data && data.focused !== session.id) focus(session.id);
  }, [session?.id, data?.focused, focus]);

  // 订阅当前会话的后续消息（真后端走 SSE；演示态没有订阅，等于空操作）
  useEffect(() => {
    if (!session) return;
    return watch(session.id);
  }, [session?.id, watch]);

  // 换会话就松开「在看谁」：上一条会话的成员不该继续挂在右栏上
  useEffect(() => {
    setFocusedMember(null);
  }, [session?.id]);

  /** 点成员：右栏翻到他的产物，并确保面板是开着的。 */
  const focusMember = useCallback((name: string | null) => {
    setFocusedMember(name);
    if (name) setPanelOpen(true);
  }, []);

  const sendOut = useCallback(
    (out: Outbound) => (session ? send(session.id, out) : Promise.resolve()),
    [session, send],
  );

  /** 导出：把当前工作区（会话 / 策略 / 设置）落成一个 JSON 文件。 */
  const exportWorkspace = useCallback(() => {
    if (!data) return;
    downloadJson('shadowflow-workspace.json', {
      exportedAt: new Date().toISOString(),
      sessions: data.sessions,
      threads: data.threads,
      panel: data.panel,
      policy: data.policy,
      dag: data.dag,
      settings: data.settings,
    });
  }, [data]);

  /** 导航回调：切到「工作空间」时先取当前会话工作目录，供文件页用。 */
  const navigate = useCallback((id: ViewId) => {
    if (id === 'files' && session) {
      void listArtifacts(session.id)
        .then((listing) => {
          if (listing?.root) localStorage.setItem('sf.paper.activeWorkspaceDir', listing.root);
          else localStorage.removeItem('sf.paper.activeWorkspaceDir');
        })
        .catch(() => localStorage.removeItem('sf.paper.activeWorkspaceDir'));
    }
    setView(id);
  }, [session, listArtifacts]);

  // 全局头像真源：启动拉一次 /api/agents，聊天/列表/右栏所有头像据此统一。
  useEffect(() => {
    getAgents()
      .then((rows) => setAgentAvatars(rows))
      .catch(() => undefined);
  }, []);

  if (!data || !session) {
    return (
      <div className="shell shell--boot" data-panel="closed">
        <span className="shell-boot">
          {status === 'error' ? CHAT.loadError(error ?? '') : CHAT.loading}
        </span>
        {status === 'error' ? (
          <>
            <span className="shell-boot-hint">{CHAT.loadErrorHint}</span>
            <button className="shell-boot-retry" onClick={reload}>
              {CHAT.retry}
            </button>
          </>
        ) : null}
      </div>
    );
  }

  const railProps = {
    onOpenSettings: () => setSettingsOpen(true),
    onHome: onExit,
    activeView: view,
    onNavigate: navigate,
  };

  /** 子视图分发：每个 id 对应一个页面组件。 */
  const subView = (() => {
    switch (view) {
      case 'news': return <NewsView selected={paneKey.news} />;
      case 'team': return <TeamsView selected={paneKey.team} />;
      case 'kb': return <KnowledgeView selected={paneKey.kb} />;
      case 'cron': return <SchedulesView />;
      case 'project':
        return (
          <ProjectsView
            selected={paneKey.project}
            onOpenSession={(id) => {
              setActiveId(id);
              setView('chat');
            }}
          />
        );
      case 'files': return <FilesView />;
      default: return null;
    }
  })();

  /**
   * 第二栏：当前视图「要选的单位」。
   * 对话页用会话列表（走四栏壳），团队 / 知识库 / 项目各有自己的一列；
   * 新闻、定时、主机、文件没有可选项，这列就不出现（不留空壳）。
   */
  const pane = (() => {
    switch (view) {
      case 'news': return <NewsPane selected={paneKey.news} onPick={pickers.news} />;
      case 'team': return <TeamPane selected={paneKey.team} onPick={pickers.team} />;
      case 'kb': return <KnowledgePane selected={paneKey.kb} onPick={pickers.kb} />;
      case 'project': return <ProjectsPane selected={paneKey.project} onPick={pickers.project} />;
      default: return null;
    }
  })();

  return (
    <>
      {view === 'chat' ? (
        <div
          className="shell"
          data-panel={panelOpen ? 'open' : 'closed'}
          data-list={listOpen ? 'open' : 'closed'}
          style={gridStyle}
        >
          <Rail {...railProps} />
          {listOpen ? (
            <SessionList
              onResizeStart={handleListResizeStart}
              sessions={data.sessions}
              roster={data.roster}
              activeId={session.id}
              onSelect={select}
              onCreate={(title) => {
                // 空标题 = 直接建（用户定版 2026-11-25：新建对话不弹输入框），标题落「新对话」。
                void createConversation(title.trim() || '新对话')
                  .then((gid) => {
                    setActiveId(gid);
                    reload();
                  })
                  .catch(() => undefined);
              }}
              createGroupChat={createGroupChat}
              useTeamTemplate={useTeamTemplate}
              onCollapse={() => setListOpen(false)}
              onOpenCeo={openCeoDm}
              openAgentDm={openAgentDm}
              ceoDmId={ceoDmId}
              listProjects={listProjects}
              createProject={createProject}
              renameProject={renameProject}
              deleteProject={deleteProject}
              createProjectConversation={createProjectConversation}
              onOpenProjectFolder={(dir) => {
                try {
                  localStorage.setItem('sf.paper.activeWorkspaceDir', dir);
                } catch {
                  // 隐私模式下存不了目录，落到当前会话工作区
                }
                navigate('files');
              }}
              onOpenSession={select}
              onCreatedConversation={(gid) => { setActiveId(gid); reload(); }}
            />
          ) : null}
          <ChatArea
            session={session}
            messages={messages}
            roster={data.roster}
            composer={data.composer}
            model={modelId ?? data.composer.models[0]?.id ?? ''}
            onModelChange={setModelId}
            sending={sending}
            onSend={sendOut}
            onStop={() => stop(session.id)}
            transcribe={transcribe}
            onInspect={() => setPanelOpen(true)}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((v) => !v)}
            listOpen={listOpen}
            onToggleList={() => setListOpen((v) => !v)}
            onOpenAgentDm={openAgentDm}
            onOpenSession={select}
            focusedMember={focusedMember}
            onFocusMember={focusMember}
            steps={data.panel.steps}
          />
          {panelOpen ? (
            <AgentPanel
              panel={data.panel}
              roster={data.roster}
              policy={data.policy}
              dag={data.dag}
              sessionId={session.id}
              thread={messages}
              focusedMember={focusedMember}
              onFocusMember={focusMember}
              onResizeStart={handlePanelResizeStart}
              onResizeStep={bumpPanelWidth}
              onResizeReset={resetPanelWidth}
              agentHint={session.kind === 'dm' ? session.members[0] : undefined}
              listArtifacts={listArtifacts}
              readArtifact={readArtifact}
              artifactRawUrl={artifactRawUrl}
              loadArcRuns={loadArcRuns}
              loadArcPipeline={loadArcPipeline}
              readArcRunArtifact={readArcArtifact}
              arcRunRawUrl={arcArtifactRawUrl}
              onSavePolicy={savePolicy}
              onResolveApproval={(decision) => {
                const nodeId = data.panel.approval?.nodeId;
                if (nodeId) void resolveApproval(session.id, nodeId, decision);
              }}
            />
          ) : null}
        </div>
      ) : (
        <div className="subview-shell" data-pane={pane ? 'true' : undefined} style={paneWidth.style}>
          <Rail {...railProps} />
          {pane ? (
            <div className="pane-slot">
              {pane}
              {/* 把手挂在槽位上，各栏组件不必各自再实现一次拖动 */}
              <div
                className="pane-handle"
                role="separator"
                aria-orientation="vertical"
                onPointerDown={paneWidth.startResize}
                onDoubleClick={paneWidth.resetWidth}
              />
            </div>
          ) : null}
          <div className="subview-main">{subView}</div>
        </div>
      )}
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        section={settingsSection}
        onSection={setSettingsSection}
        settings={data.settings}
        saving={savingSettings}
        onPatch={(patch) => void patchSettings(patch)}
        onRescanCli={rescanCli}
        onTestSsh={testSsh}
        onExport={exportWorkspace}
        onReset={reset}
        onLoggedOut={() => {
          setSettingsOpen(false);
          onExit();
        }}
      />
    </>
  );
}
