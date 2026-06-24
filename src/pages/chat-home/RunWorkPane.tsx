/**
 * RunWorkPane — 右栏「工作区」tab 薄壳。
 *
 * 保持 `RunWorkPane({ groupId })` 签名不变（其它文件的引用不需要改）。
 * 数据获取由 useWorkspaceRun 负责，展示逻辑委托给 RunOverviewView。
 * 刷新按钮由 RunOverviewView 内部渲染（通过 onReload/reloading props），
 * 位置在 Overview section-header 行右侧，与原设计保持一致。
 *
 * 如需就地展开 run（M5），在此传入 `onOpenRun` 回调。
 */
import { useWorkspaceRun } from '../../core/hooks/useWorkspaceRun';
import { RunOverviewView } from './RunOverviewView';

export function RunWorkPane({ groupId }: { groupId?: string | null }) {
  const { latest, history, loading, reload } = useWorkspaceRun(groupId);

  return (
    <RunOverviewView
      latest={latest}
      history={history}
      loading={loading}
      onReload={groupId ? reload : undefined}
      reloading={loading}
    />
  );
}
