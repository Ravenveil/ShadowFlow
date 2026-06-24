/**
 * RunWorkPane — 右栏「工作区」tab 薄壳。
 *
 * 保持 `RunWorkPane({ groupId })` 签名不变（其它文件的引用不需要改）。
 * 数据获取由 useWorkspaceRun 负责，展示逻辑委托给 RunOverviewView。
 *
 * 如需就地展开 run（M5），在此传入 `onOpenRun` 回调。
 */
import { RefreshCw } from 'lucide-react';
import { useWorkspaceRun } from '../../core/hooks/useWorkspaceRun';
import { RunOverviewView } from './RunOverviewView';

export function RunWorkPane({ groupId }: { groupId?: string | null }) {
  const { latest, history, loading, reload } = useWorkspaceRun(groupId);

  return (
    <div>
      {groupId && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 0 4px' }}>
          <button
            type="button" aria-label="刷新" title="刷新"
            className="sf-wp-refresh"
            onClick={reload}
          >
            <RefreshCw size={12} strokeWidth={2} aria-hidden className={loading ? 'sf-spin' : undefined} />
          </button>
        </div>
      )}
      <RunOverviewView latest={latest} history={history} loading={loading} />
    </div>
  );
}
