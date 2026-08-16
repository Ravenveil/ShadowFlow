/**
 * NeoApp — Neo (clawsgo-style chat-first) 三栏壳。
 *
 * 布局（clawsgo 视频实测形态）：
 *   - 无 run：左栏 NeoRail + 中栏 NeoChat 全宽（clawsgo 首页/空会话没有右栏）
 *   - 有 run：中栏收窄为 ~440px 聊天列，右栏 NeoHost（「Agent 的主机」）
 *     弹性占满剩余空间——主机是主角；可整栏折叠，折叠后聊天列回弹全宽
 * NeoApp 持有跨栏共享状态并按 src/neo/types.ts 契约下发：
 *   - target：左栏当前选中的 Agent/Team（NeoRail.onSelect → NeoChat/NeoHost）
 *   - runId ：当前关联的 workflow run（NeoChat.onRunChange ↔ NeoHost 同步展示）
 * 右栏折叠状态 localStorage 记忆（'sf.neo.hostCollapsed'）。
 * runId 刷新恢复：URL ?run=<id> 为主、localStorage 'sf.last-run-id' 兜底，
 * 恢复后由 useRunSession 重订 /stream（增量续传 / 只读重放见组件内注释）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { NeoRail } from './NeoRail';
import { NeoChat } from './NeoChat';
import { NeoHost } from './NeoHost';
import { useI18n } from '../common/i18n';
import type { NeoTarget } from './types';
import './neo.css';

const HOST_COLLAPSED_KEY = 'sf.neo.hostCollapsed';
const LAST_RUN_KEY = 'sf.last-run-id';

export function NeoApp() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [target, setTarget] = useState<NeoTarget | null>(null);
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

  // 「+ 新任务」：清掉当前 run 关联，中栏回到新任务 composer 态（target 保留）。
  const handleNewTask = useCallback(() => setRunId(null), []);

  // 有 run 且主机未折叠 → 聊天列收窄，主机占满（clawsgo 运行态三栏）
  const runLayout = runId !== null && !hostCollapsed;

  return (
    <div className="neo-app">
      <NeoRail target={target} onSelect={setTarget} onNewTask={handleNewTask} />

      <main className={`neo-main${runLayout ? ' neo-main--run' : ''}`}>
        <NeoChat target={target} runId={runId} onRunChange={setRunId} />
      </main>

      {runId !== null && (
        <aside className={`neo-host${hostCollapsed ? ' collapsed' : ''}`}>
          <div className="neo-host-panel" aria-hidden={hostCollapsed}>
            <NeoHost target={target} runId={runId} />
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
