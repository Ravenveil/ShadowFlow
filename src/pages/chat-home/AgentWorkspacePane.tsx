// src/pages/chat-home/AgentWorkspacePane.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RightPaneTabs, type RightPaneTabDef } from '../../components/run-session/RightPaneTabs';
import { useWorkspaceRun } from '../../core/hooks/useWorkspaceRun';
import { RunOverviewView } from './RunOverviewView';
import PreviewPanel from '../../components/run-session/PreviewPanel';
import BlueprintCanvas from '../../components/run-session/BlueprintCanvas';
import { WorkspaceFilesView } from './WorkspaceFilesView';

type WsTab = 'overview' | 'preview' | 'canvas' | 'files';

const TABS: RightPaneTabDef<WsTab>[] = [
  { key: 'overview', label: '概览' },
  { key: 'preview', label: '产物' },
  { key: 'canvas', label: '画布' },
  { key: 'files', label: '文件' }, // M3 接真实内容；此前先占位空态
];

export function AgentWorkspacePane({ groupId }: { groupId?: string | null }) {
  const [tab, setTab] = useState<WsTab>('overview');
  const navigate = useNavigate();
  const { session, latest, history, loading, reload, runCwd } = useWorkspaceRun(groupId);

  return (
    <RightPaneTabs<WsTab>
      activeTab={tab}
      onTabChange={setTab}
      tabs={TABS}
      ariaLabel="工作台内层标签"
      panels={{
        overview: (
          <RunOverviewView
            latest={latest}
            history={history}
            loading={loading}
            onReload={reload}
            reloading={loading}
            onOpenRun={(sid) => {
              // 最新 run 主卡 → 就地切到产物 tab；历史 run 行 → 跳整页
              if (latest && sid === latest.session_id) {
                setTab('preview');
              } else {
                navigate(`/run-session/${sid}`);
              }
            }}
          />
        ),
        preview: <PreviewPanel session={session} />,
        canvas: (
          <div style={{ flex: 1, minHeight: 0 }}>
            <BlueprintCanvas
              nodes={session.nodes}
              edges={session.edges}
              isComplete={session.isComplete}
            />
          </div>
        ),
        files: <WorkspaceFilesView root={runCwd} />,
      }}
    />
  );
}
