/**
 * NeoApp — Neo (clawsgo-style chat-first) 三栏壳。
 *
 * 布局（clawsgo 视频实测形态）：
 *   - 无 run 且无选中：左栏 NeoRail + 中栏 NeoChat 全宽（首页/空会话没有右栏）
 *   - run/会话/目标态：中栏收窄为 ~440px 聊天列，右栏 NeoHost（「Agent 的主机」）
 *     弹性占满剩余空间；可整栏折叠，折叠后聊天列回弹全宽
 *
 * 导航（2026-08-19 收敛）：NeoApp 单点持有唯一导航状态 nav（NeoNav，见
 * types.ts）——中栏视图、左栏列表区（section）、选中高亮全部由它派生；
 * NeoRail 纯受控，所有点击经 onNavigate 一个动词上报。runId 与导航正交
 * （run 可挂在任意导航上下文上），仍由本组件持有。
 * 右栏折叠状态 localStorage 记忆（'sf.neo.hostCollapsed'）。
 * runId 刷新恢复：URL ?run=<id> 为主、localStorage 'sf.last-run-id' 兜底，
 * 恢复后由 useRunSession 重订 /stream（增量续传 / 只读重放见组件内注释）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react';
import { NeoRail } from './NeoRail';
import { NeoChat } from './NeoChat';
import { NeoHost } from './NeoHost';
import { NeoGroupChat } from './NeoGroupChat';
import { NeoAgentSoul } from './NeoAgentSoul';
import { NeoRunHistory } from './NeoRunHistory';
import KnowledgePage, { parseSourceId } from '../pages/KnowledgePage';
// 记忆页（2026-11-06 折叠批）：已并入「设置 → 记忆」，NeoApp 不再内嵌。
// 数据看板（2026-11-05，整合 OPC-OS PR#3 看板设计）
import DashboardPage from '../pages/DashboardPage';
// 定时任务管理页（2026-11-06，GrokBot/OpenBot /routines 对齐批）
import SchedulesPage from '../pages/SchedulesPage';
// ClawHub（2026-10-30 内嵌化）：中栏变体，左栏常驻（原独立路由保留兼容）。
import ClawHubPage from '../pages/clawhub/ClawHubPage';
import { useI18n } from '../common/i18n';
import { usePythonBackendStatus } from '../core/hooks/usePythonBackendStatus';
import { useInboxStore } from '../core/store/useInboxStore';
import { ensureGroupTeam, getGroup, postGroupMessage, resolveDmConversation } from '../api/groupApi';
import { useWorkspaceStore } from '../store/workspaceStore';
import { SECRETARY_AGENT_ID } from './secretary';
import { NeoOnboardingModal, ONBOARDING_DONE_KEY } from './NeoOnboardingModal';
import { useOnboardingGate } from './useOnboardingGate';
import type { NeoNav, NeoTarget, RailSection } from './types';
import './neo.css';

const HOST_COLLAPSED_KEY = 'sf.neo.hostCollapsed';
const LAST_RUN_KEY = 'sf.last-run-id';
const RAIL_COLLAPSED_KEY = 'sf.neo.railCollapsed';
// 左栏拖宽（2026-11-06）：持久化 key + 夹取范围（折叠态 56px 不受此影响）
const RAIL_WIDTH_KEY = 'sf.neo.railWidth';
const RAIL_MIN_WIDTH = 120;
const RAIL_MAX_WIDTH = 360;
const RAIL_DEFAULT_WIDTH = 180;

/**
 * nav.view → 左栏列表区默认映射；不在表里的（conversation/兜底目标/agent-soul/
 * dashboard/schedules/knowledge）列表保持不动——Grok 式「内容页不抢侧边栏」：
 * 数据看板、定时任务（2026-11-06 用户反馈：点定时任务左栏依旧显示 agent 列表）、
 * 知识库（2026-11-07 用户反馈：知识库左侧边栏要保持成员显示——知识源列表由
 * 知识页自带 rail 承担）都是阅读态页。os-unified 后 agents/teams 浏览视图移除；
 * memory 分区已随「记忆折叠进设置」批（#18）下线。 */
const SECTION_BY_NAV: Partial<Record<NeoNav['view'], RailSection>> = {
  home: 'home',
};

export function NeoApp() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  // ── 导航状态机：nav = 中栏视图唯一来源；section = 左栏列表区 ─────────────
  const [nav, setNav] = useState<NeoNav>({ view: 'home' });
  const [section, setSection] = useState<RailSection>('home');
  const navigate = useCallback((next: NeoNav) => {
    setNav(next);
    const s = SECTION_BY_NAV[next.view];
    if (s) setSection(s);
    // 2026-11-05 Task#11 — 切走当前会话（换群/回首页）即关检查器（挂着的
    // inspectAgent.groupId 已不对应新视图，留着只会显示串台数据）。
    setInspectAgent(null);
  }, []);

  // ── Agent 检查器（2026-11-05 Task#11，ZCode 后台运行式）────────────────
  // 群聊里点 agent 头像（气泡/顶栏成员栈）→ NeoGroupChat.onInspectAgent 上报
  // → NeoHost 右栏整体覆盖为检查浮层（后台活动流 + 发起私聊）。
  const [inspectAgent, setInspectAgent] = useState<{
    agentId: string;
    name: string;
    groupId: string;
  } | null>(null);

  // 编排目标从 nav 派生（兜底目标态才有；conversation 里发言走群聊网关，
  // 不需要 target）。NeoHost 编队 tab 据此出现。
  const target = useMemo<NeoTarget | null>(() => {
    if (nav.view === 'agent-target')
      return { kind: 'agent', id: nav.agentId, name: nav.name };
    if (nav.view === 'team-target')
      return { kind: 'team', id: nav.teamId, name: nav.name };
    return null;
  }, [nav]);

  // 当前 agent 上下文（NeoHost「灵魂」tab 据此露出）：agent-target 直接取；
  // DM 会话先从 inbox 的 agentDMs 按 group_id 反查，查不到（inbox 未加载/
  // 工作区过滤不含该会话）时回落 GET /api/groups/:id —— kind='dm' 且单 agent
  // 即单聊。群聊/团队会话 → null。
  // 同时沉淀 convGroup（kind/team_id）下发 NeoHost：非 DM 会话 → 「团队的
  // 主机」+ 成员 tab（W2 钉钉式融合，2026-08-22）。
  const inboxDMs = useInboxStore((s) => s.agentDMs);
  const [convAgent, setConvAgent] = useState<{ id: string; name: string } | null>(null);
  const [convGroup, setConvGroup] = useState<{
    groupId: string;
    kind: string | null;
    teamId: string | null;
    teamName: string | null;
  } | null>(null);
  // 2026-11-06 建群即建编队（heal）：已补过链的群（无论成败）—— 每群每会话
  // 只 find-or-create 一次，防 effect 重入（nav/inboxDMs 抖动）双跑建出两个团队。
  const healedGroupRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (nav.view !== 'conversation') {
      setConvAgent(null);
      setConvGroup(null);
      return;
    }
    const dm = (inboxDMs ?? []).find((d) => d.group_id === nav.groupId);
    if (dm) {
      setConvAgent({ id: dm.agentId, name: dm.agentName });
      setConvGroup({ groupId: nav.groupId, kind: 'dm', teamId: null, teamName: null });
      return;
    }
    let alive = true;
    getGroup(nav.groupId)
      .then((g) => {
        if (!alive) return;
        const kind = (g?.kind as string | undefined) ?? null;
        setConvGroup(
          g
            ? { groupId: nav.groupId, kind, teamId: g.team_id ?? null, teamName: g.name ?? null }
            : null,
        );
        if (g && kind === 'dm' && g.agent_ids && g.agent_ids.length > 0) {
          setConvAgent({ id: g.agent_ids[0], name: g.name ?? '' });
        } else {
          setConvAgent(null);
        }
        // 2026-11-06 建群即建编队：非 DM 且无 team 的群（「发起群聊」建出的
        // 自由群、单聊加人升级成群的会话）→ find-or-create 同名编队挂链，
        // 否则编队 tab 拿不到 teamId 整块空白（用户反馈：创建群聊后编队不
        // 显示成员）。补链完成后回写 convGroup.teamId（group 级守卫，防止
        // 等待期间切走会话被误写）；失败不阻断聊天主链路。
        if (g && kind !== 'dm' && !g.team_id && !healedGroupRef.current.has(nav.groupId)) {
          healedGroupRef.current.add(nav.groupId);
          void ensureGroupTeam(g).then((tid) => {
            if (!tid) return;
            setConvGroup((prev) =>
              prev && prev.groupId === nav.groupId && !prev.teamId
                ? { ...prev, teamId: tid }
                : prev,
            );
          });
        }
      })
      .catch(() => {
        if (alive) {
          setConvAgent(null);
          setConvGroup(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [nav, inboxDMs]);
  const soulAgent = useMemo<{ id: string; name: string } | null>(
    () => (target?.kind === 'agent' ? { id: target.id, name: target.name } : convAgent),
    [target, convAgent],
  );

  // 刷新恢复：runId 持久化。启动优先级 URL ?run= > localStorage 兜底。
  // 恢复 = 把 id 交给 useRunSession 重新订阅 /stream：活 run 续跑（?after
  // 增量），已完成/过期 run 由服务端 read-only replay 重放历史（run-sessions
  // O4 streamReadOnlyReplay），不存在才落 404 错误帧。
  const [runId, setRunId] = useState<string | null>(() => {
    const fromUrl = searchParams.get('run');
    if (fromUrl) return fromUrl;
    try {
      return localStorage.getItem(LAST_RUN_KEY);
    } catch {
      return null;
    }
  });

  // runId 变化 → 同步 URL param + localStorage。仅在 active run 时写
  // ?run=，回首页（null）两处都清，不污染 idle 首页 URL；其余 param
  // （如 fallback=synthetic 调试开关）原样保留。replace 避免历史栈 spam。
  useEffect(() => {
    try {
      if (runId) localStorage.setItem(LAST_RUN_KEY, runId);
      else localStorage.removeItem(LAST_RUN_KEY);
    } catch {
      // localStorage 不可用就只靠 URL
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (runId) {
          if (next.get('run') === runId) return prev;
          next.set('run', runId);
        } else {
          if (!next.has('run')) return prev;
          next.delete('run');
        }
        return next;
      },
      { replace: true },
    );
  }, [runId, setSearchParams]);
  const [hostCollapsed, setHostCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HOST_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleHost = useCallback(() => {
    setHostCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(HOST_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // localStorage 不可用就只用内存态
      }
      return next;
    });
  }, []);

  // 左栏折叠态也由外壳持有：中栏顶栏的 panel-left 折叠钮（复刻 home.html
  // topbar）与折叠 rail 自身的展开钮都要触发同一状态。
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleRail = useCallback(() => {
    setRailCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // localStorage 不可用就只用内存态
      }
      return next;
    });
  }, []);

  // ── 左栏拖宽（2026-11-06 用户反馈：侧边栏可左右拉动）────────────────────
  // 宽度持久化 localStorage（'sf.neo.railWidth'），120–360px 夹取；拖拽经
  // NeoRail 右缘热区 onResizeStart 上报，move/up 挂 window 跟随；起点宽度
  // 在 pointerdown 时冻结（startWidth + 位移差值），避免事件间累加漂移。
  const [railWidth, setRailWidth] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(RAIL_WIDTH_KEY));
      return Number.isFinite(v) && v >= RAIL_MIN_WIDTH && v <= RAIL_MAX_WIDTH ? v : null;
    } catch {
      return null;
    }
  });
  const railResizingRef = useRef(false);
  const handleRailResizeStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    railResizingRef.current = true;
    document.body.classList.add('neo-rail-resizing');
    // 起点宽度：当前生效值（null = CSS 默认 180）；起点指针 X。
    const startWidth =
      railWidth ??
      (() => {
        try {
          const v = Number(localStorage.getItem(RAIL_WIDTH_KEY));
          return Number.isFinite(v) && v >= RAIL_MIN_WIDTH && v <= RAIL_MAX_WIDTH
            ? v
            : RAIL_DEFAULT_WIDTH;
        } catch {
          return RAIL_DEFAULT_WIDTH;
        }
      })();
    const startX = e.clientX;
    // 全局 zoom 抵消（index.css html{zoom:var(--app-zoom)}）：clientX 是物理
    // 像素，栏宽是逻辑像素，位移要除回 zoom 才是真实拖拽量。
    const zoomRaw = Number(
      getComputedStyle(document.documentElement).getPropertyValue('--app-zoom') || 1,
    );
    const zoom = Number.isFinite(zoomRaw) && zoomRaw > 0 ? zoomRaw : 1;
    const move = (ev: PointerEvent) => {
      if (!railResizingRef.current) return;
      const next = Math.min(
        RAIL_MAX_WIDTH,
        Math.max(RAIL_MIN_WIDTH, Math.round(startWidth + (ev.clientX - startX) / zoom)),
      );
      setRailWidth(next);
      try {
        localStorage.setItem(RAIL_WIDTH_KEY, String(next));
      } catch {
        // localStorage 不可用就只用内存态
      }
    };
    const up = () => {
      railResizingRef.current = false;
      document.body.classList.remove('neo-rail-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    // railWidth 只在冻结起点时读一次，故意不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const railWidthStyle = useMemo(
    () => (railWidth === null ? undefined : ({ '--rail-w': `${railWidth}px` } as CSSProperties)),
    [railWidth],
  );

  // 「+ 新任务」：回 home hero 并清掉当前 run 关联（左栏列表切回会话）。
  const handleNewTask = useCallback(() => {
    navigate({ view: 'home' });
    setRunId(null);
  }, [navigate]);

  // ── 默认落地 = 秘书的会话（2026-11-06 用户反馈：不显示首页 hero）──────────
  // 每次启动：无恢复的 run（URL ?run= / localStorage）时 find-or-create 秘书的
  // DM 并直接进入——打开产品即与秘书对话。后端对新 DM 预置欢迎语问候。
  // 有 run 恢复则保持原行为（回到上次运行现场，不被拽走）。
  // resolve 失败（Python 未起等）有限重试自愈（2026-11-06 用户反馈「拉 main 后
  // 依旧显示首页」——只试一次时页面开着就永远停首页）；3 次后放弃留 home。
  const navViewRef = useRef(nav.view);
  navViewRef.current = nav.view;
  useEffect(() => {
    if (runId) return; // 有恢复的 run → 不抢
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const scheduleRetry = () => {
      // 后端未起/瞬时失败：1.5s/3s/4.5s 有限重试；3 次后仍失败才放弃，
      // 留 home，下次启动再试。
      if (attempts >= 3) return;
      attempts += 1;
      timer = setTimeout(tryLand, 1500 * attempts);
    };
    function tryLand() {
      resolveDmConversation(SECRETARY_AGENT_ID, useWorkspaceStore.getState().currentId)
        .then((gid) => {
          if (!alive) return;
          // 用户已自行导航（知识库/会话等）就不抢屏（2026-11-06「不抢」纪律）。
          if (gid && navViewRef.current === 'home') {
            navigate({ view: 'conversation', groupId: gid });
          } else if (!gid) {
            scheduleRetry();
          }
        })
        .catch(() => {
          if (alive) scheduleRetry();
        });
    }
    tryLand();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // 故意只跑一次（挂载时）；依赖数组留空。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 首访入职问卷（2026-11-06，模仿 ZCode/Codex 对话框弹出形式）────────────
  // 时序（用户反馈 2026-11-06 15:23）：先进秘书的会话 → 欢迎语渲染出来 → 问卷
  // 再弹（欢迎先行，问卷不抢首屏）。触发面收口（2026-11-07，文档口径）：只在
  // **秘书的会话**弹（useOnboardingGate：首访标记缺失 + nav.groupId === 秘书
  // DM gid），别的 agent 的 DM / 群聊不再误弹——此前只看 nav.view 会话视图。
  // 延迟 800ms 让欢迎语先上屏；跳过 = 只记完成标记，零副作用。
  const { open: onboardingOpen, close: closeOnboarding } = useOnboardingGate(nav);
  const handleOnboardingFinished = useCallback(
    (introMessage: string) => {
      closeOnboarding();
      if (!introMessage) return;
      // 秘书的会话 id：首访 effect 刚 resolve 过；此处从 inbox DM 反查，查不到
      // 就再 resolve 一次（幂等）。发送失败静默——画像已落 localStorage。
      const wsId = useWorkspaceStore.getState().currentId;
      const dmGid = (useInboxStore.getState().agentDMs ?? []).find(
        (d) => d.agentId === SECRETARY_AGENT_ID,
      )?.group_id;
      const p = dmGid
        ? Promise.resolve(dmGid)
        : resolveDmConversation(SECRETARY_AGENT_ID, wsId).catch(() => null);
      p.then((gid) => {
        if (!gid) return;
        return postGroupMessage(gid, introMessage, { senderKind: 'user' }).catch(() => undefined);
      }).catch(() => undefined);
    },
    [closeOnboarding],
  );

  // B36 Python 后端宕机横幅：只复用 usePythonBackendStatus 状态源（单例 20s
  // 轮询 + 可见性恢复重探），UI 为 Neo 化顶部细条，不 import 旧渲染组件。
  // available === null（未探测完）不渲染，避免首屏闪烁。
  const pyStatus = usePythonBackendStatus();
  const pyDown = pyStatus.available === false;
  const [pyRechecking, setPyRechecking] = useState(false);

  // 右栏出现条件：run 活跃、中栏开着会话、或编排目标兜底态在场
  // （团队/员工/会话点击后三栏成型——设计口径：左选 agent/团队 · 中聊天 ·
  // 右项目文件）。纯首页/浏览态（agents/teams/knowledge/memory）不渲染右栏。
  const hostActive =
    runId !== null || nav.view === 'conversation' || target !== null;
  // 知识库/灵魂/历史/数据看板页是内容阅读态：不套 440px 窄聊天列布局（neo-main--run），
  // 中栏按默认 flex 自然展开。dashboard 也不改左栏列表（section 保持不变）。
  // 记忆页（2026-11-06 折叠批）已整体并入设置，不再是中栏视图。
  const pageView =
    nav.view === 'knowledge' || nav.view === 'agent-soul' ||
    nav.view === 'runs' || nav.view === 'clawhub' || nav.view === 'dashboard' ||
    nav.view === 'schedules';
  // 主机未折叠 → 聊天列收窄，主机占满（clawsgo 运行态三栏）
  const runLayout = hostActive && !hostCollapsed && !pageView;

  return (
    <div className={`neo-app${pyDown ? ' neo-app--pydown' : ''}`}>
      {pyDown && (
        <div className="neo-py-banner" role="alert" data-testid="neo-py-banner">
          <AlertTriangle size={13} strokeWidth={1.9} aria-hidden />
          <span className="neo-py-banner-text">
            {t('neo.pyDown', {
              defaultValue: 'Python 后端未连接，部分能力不可用',
            })}
          </span>
          <button
            type="button"
            className="neo-py-banner-retry"
            disabled={pyRechecking}
            onClick={() => {
              setPyRechecking(true);
              void pyStatus.recheck().finally(() => setPyRechecking(false));
            }}
            data-testid="neo-py-banner-retry"
          >
            {pyRechecking ? (
              <Loader2 size={11} strokeWidth={2} className="neo-spin" aria-hidden />
            ) : (
              <RotateCcw size={11} strokeWidth={2} aria-hidden />
            )}
            {t('common.retry', { defaultValue: '重试' })}
          </button>
        </div>
      )}
      <NeoRail
        nav={nav}
        section={section}
        onNavigate={navigate}
        onNewTask={handleNewTask}
        collapsed={railCollapsed}
        onToggleCollapsed={toggleRail}
        width={railWidth}
        onResizeStart={handleRailResizeStart}
        style={railWidthStyle}
      />

      <main className={`neo-main${runLayout ? ' neo-main--run' : ''}`}>
        {nav.view === 'conversation' ? (
          <NeoGroupChat
            groupId={nav.groupId}
            embedded
            onNavigate={navigate}
            onInspectAgent={setInspectAgent}
          />
        ) : nav.view === 'knowledge' ? (
          <KnowledgePage
            embedded
            initialSource={parseSourceId(nav.sourceId)}
          />
        ) : nav.view === 'dashboard' ? (
          <DashboardPage embedded />
        ) : nav.view === 'schedules' ? (
          <SchedulesPage embedded />
        ) : nav.view === 'clawhub' ? (
          <ClawHubPage embedded />
        ) : nav.view === 'agent-soul' ? (
          <NeoAgentSoul agentId={nav.agentId} />
        ) : nav.view === 'runs' ? (
          <NeoRunHistory />
        ) : (
          <NeoChat
            target={target}
            runId={runId}
            onRunChange={setRunId}
            onNavigate={navigate}
          />
        )}
      </main>

      {hostActive && (
        <aside className={`neo-host${hostCollapsed ? ' collapsed' : ''}`}>
          <div className="neo-host-panel" aria-hidden={hostCollapsed}>
            <NeoHost
              target={target}
              runId={runId}
              soulAgent={soulAgent}
              conversation={convGroup}
              inspectAgent={inspectAgent}
              onCloseInspectAgent={() => setInspectAgent(null)}
              onNavigate={navigate}
            />
          </div>
          <button
            type="button"
            className="neo-icon-btn neo-host-toggle"
            onClick={toggleHost}
            aria-label={hostCollapsed ? t('neo.expandHost') : t('neo.collapseHost')}
            title={hostCollapsed ? t('neo.expandHost') : t('neo.collapseHost')}
            data-testid="neo-host-toggle"
          >
            {hostCollapsed ? (
              <PanelRightOpen size={15} strokeWidth={1.75} aria-hidden />
            ) : (
              <PanelRightClose size={15} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </aside>
      )}

      {/* 首访入职问卷（2026-11-06，ZCode/Codex 弹窗式）：提交 → 画像落盘 +
          自我介绍发进与秘书的会话；跳过 → 只记标记。 */}
      {onboardingOpen && (
        <NeoOnboardingModal
          onFinished={handleOnboardingFinished}
          onSkipped={() => {
            try {
              localStorage.setItem(ONBOARDING_DONE_KEY, '1');
            } catch {
              /* ignore */
            }
            closeOnboarding();
          }}
          onAgentCreated={() => {
            // 专属助理 Agent 创建成功 → 刷新左栏会话/员工列表（Grok 范式：
            // 新员工即刻出现在侧栏）。
            void useInboxStore
              .getState()
              .fetchWorkspaceInbox(useWorkspaceStore.getState().currentId);
          }}
        />
      )}
    </div>
  );
}

export default NeoApp;
