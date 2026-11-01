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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, PanelRightClose, PanelRightOpen, RotateCcw } from 'lucide-react';
import { NeoRail } from './NeoRail';
import { NeoChat } from './NeoChat';
import { NeoHost } from './NeoHost';
import { NeoGroupChat } from './NeoGroupChat';
import { NeoAgentSoul } from './NeoAgentSoul';
import { NeoRunHistory } from './NeoRunHistory';
import KnowledgePage, { parseSourceId } from '../pages/KnowledgePage';
import MemoryPage from '../pages/MemoryPage';
// ClawHub（2026-10-30 内嵌化）：中栏变体，左栏常驻（原独立路由保留兼容）。
import ClawHubPage from '../pages/clawhub/ClawHubPage';
import { useI18n } from '../common/i18n';
import { usePythonBackendStatus } from '../core/hooks/usePythonBackendStatus';
import { useInboxStore } from '../core/store/useInboxStore';
import { getGroup } from '../api/groupApi';
import type { NeoNav, NeoTarget, RailSection } from './types';
import './neo.css';

const HOST_COLLAPSED_KEY = 'sf.neo.hostCollapsed';
const LAST_RUN_KEY = 'sf.last-run-id';
const RAIL_COLLAPSED_KEY = 'sf.neo.railCollapsed';

/** nav.view → 左栏列表区默认映射；不在表里的（conversation/兜底目标）列表保持不动。 */
const SECTION_BY_NAV: Partial<Record<NeoNav['view'], RailSection>> = {
  home: 'home',
  knowledge: 'knowledge',
  memory: 'memory',
  agents: 'agents',
  teams: 'teams',
  'agent-soul': 'agents',
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
  }, []);

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

  // 「+ 新任务」：回 home hero 并清掉当前 run 关联（左栏列表切回会话）。
  const handleNewTask = useCallback(() => {
    navigate({ view: 'home' });
    setRunId(null);
  }, [navigate]);

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
  // 知识库/记忆/灵魂/历史页是内容阅读态：不套 440px 窄聊天列布局（neo-main--run），
  // 中栏按默认 flex 自然展开。
  const pageView =
    nav.view === 'knowledge' || nav.view === 'memory' || nav.view === 'agent-soul' ||
    nav.view === 'runs' || nav.view === 'clawhub';
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
      />

      <main className={`neo-main${runLayout ? ' neo-main--run' : ''}`}>
        {nav.view === 'conversation' ? (
          <NeoGroupChat groupId={nav.groupId} embedded onNavigate={navigate} />
        ) : nav.view === 'knowledge' ? (
          <KnowledgePage
            embedded
            initialSource={parseSourceId(nav.sourceId)}
          />
        ) : nav.view === 'memory' ? (
          <MemoryPage embedded />
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
            <NeoHost target={target} runId={runId} soulAgent={soulAgent} conversation={convGroup} />
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
    </div>
  );
}

export default NeoApp;
