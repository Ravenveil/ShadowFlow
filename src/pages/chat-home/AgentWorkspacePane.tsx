// src/pages/chat-home/AgentWorkspacePane.tsx
import { useState } from 'react';
import { RightPaneTabs, type RightPaneTabDef } from '../../components/run-session/RightPaneTabs';
import { useWorkspaceRun } from '../../core/hooks/useWorkspaceRun';
import { RunOverviewView } from './RunOverviewView';
import PreviewPanel from '../../components/run-session/PreviewPanel';
import BlueprintCanvas from '../../components/run-session/BlueprintCanvas';

type WsTab = 'overview' | 'preview' | 'canvas' | 'files';

const TABS: RightPaneTabDef<WsTab>[] = [
  { key: 'overview', label: '概览' },
  { key: 'preview', label: '产物' },
  { key: 'canvas', label: '画布' },
  { key: 'files', label: '文件' }, // M3 接真实内容；此前先占位空态
];

export function AgentWorkspacePane({ groupId }: { groupId?: string | null }) {
  const [tab, setTab] = useState<WsTab>('overview');
  const { session, latest, history, loading, reload } = useWorkspaceRun(groupId);

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
        files: (
          <div
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--t-fg-4)',
              fontSize: 12,
            }}
          >
            文件视图（M3）
          </div>
        ),
      }}
    />
  );
}
