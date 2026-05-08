/**
 * LiveDashboard — real-time run observation panel (Story 4.2 AC1 + AC2).
 *
 * Subscribes to useRunStore with per-node selectors so only the changed node
 * re-renders. Displays a node card grid with 5-state color coding.
 */

import React, { memo } from 'react';
import { useRunStore, NodeState, NodeRunStatus } from '../../stores/useRunStore';

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

interface StatusConfig {
  bg: string;
  border: string;
  dot: string;
  label: string;
  pulse?: boolean;
  flash?: boolean;
}

// Use CSS tokens so status colors stay semantic (red/yellow/green/blue) on both day/night skins.
const STATUS_CONFIG: Record<NodeRunStatus, StatusConfig> = {
  pending:      { bg: 'var(--t-panel-2)', border: 'var(--t-border)', dot: 'var(--t-fg-4)', label: 'pending' },
  running:      { bg: 'var(--t-panel-2)', border: 'var(--t-run)',    dot: 'var(--t-run)',  label: 'running',      pulse: true },
  waiting_user: { bg: 'var(--t-panel-2)', border: 'var(--t-warn)',   dot: 'var(--t-warn)', label: 'waiting_user', pulse: true },
  succeeded:    { bg: 'var(--t-panel-2)', border: 'var(--t-ok)',     dot: 'var(--t-ok)',   label: 'succeeded' },
  failed:       { bg: 'var(--t-panel-2)', border: 'var(--t-err)',    dot: 'var(--t-err)',  label: 'failed' },
  rejected:     { bg: 'var(--t-panel-2)', border: 'var(--t-err)',    dot: 'var(--t-err)',  label: 'rejected',     flash: true },
};

// ---------------------------------------------------------------------------
// NodeCard — subscribes to exactly one node's state
// ---------------------------------------------------------------------------

interface NodeCardProps {
  nodeId: string;
}

const NodeCard = memo(({ nodeId }: NodeCardProps) => {
  const node = useRunStore((s) => s.nodes[nodeId] ?? { nodeId, status: 'pending' as NodeRunStatus, output: '', error: '', stepId: '' });
  const selectNode = useRunStore((s) => s.selectNode);
  const isSelected = useRunStore((s) => s.selectedNodeId === nodeId);
  const cfg = STATUS_CONFIG[node.status] ?? STATUS_CONFIG.pending;

  return (
    <button
      type="button"
      data-testid={`dashboard-node-${nodeId}`}
      data-status={node.status}
      aria-pressed={isSelected}
      onClick={() => selectNode(nodeId)}
      className={[
        'rounded-lg border transition-all duration-300 p-3 flex flex-col gap-1 text-left',
        'hover:ring-2 focus:outline-none focus:ring-2',
        cfg.pulse ? 'animate-pulse' : '',
        cfg.flash ? 'animate-flash' : '',
      ].join(' ')}
      style={{
        background: cfg.bg,
        borderColor: cfg.border,
        boxShadow: isSelected ? '0 0 0 2px var(--t-run)' : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: cfg.dot }}
        />
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--t-fg)' }}>{nodeId}</span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: cfg.dot }}>{cfg.label}</span>
      </div>
      {node.output && (
        <p className="text-[10px] truncate pl-4" style={{ color: 'var(--t-fg-3)' }}>{node.output}</p>
      )}
      {node.error && (
        <p className="text-[10px] truncate pl-4" style={{ color: 'var(--t-err)' }}>{node.error}</p>
      )}
    </button>
  );
});

NodeCard.displayName = 'NodeCard';

// ---------------------------------------------------------------------------
// LiveDashboard
// ---------------------------------------------------------------------------

interface LiveDashboardProps {
  className?: string;
}

export const LiveDashboard = memo(({ className = '' }: LiveDashboardProps) => {
  const runId    = useRunStore((s) => s.run_id);
  const nodeIds  = useRunStore((s) => Object.keys(s.nodes));
  const violations = useRunStore((s) => s.violations);

  if (!runId) {
    return (
      <div
        className={`flex items-center justify-center h-full text-sm ${className}`}
        style={{ color: 'var(--t-fg-4)' }}
      >
        暂无运行中的 Run
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 p-4 overflow-auto ${className}`} data-testid="live-dashboard">
      {/* Run header */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--t-fg-3)' }}>
        <span className="font-mono" style={{ color: 'var(--t-fg-2)' }}>{runId}</span>
        <span>·</span>
        <span>{nodeIds.length} 节点</span>
        {violations.length > 0 && (
          <span className="ml-auto" style={{ color: 'var(--t-err)' }}>{violations.length} 次 policy 驳回</span>
        )}
      </div>

      {/* Node cards grid */}
      {nodeIds.length === 0 ? (
        <div className="text-xs text-center py-6" style={{ color: 'var(--t-fg-4)' }}>等待节点事件...</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {nodeIds.map((id) => (
            <NodeCard key={id} nodeId={id} />
          ))}
        </div>
      )}

      {/* Policy violation log */}
      {violations.length > 0 && (
        <div
          className="mt-2 rounded-lg p-2"
          style={{ border: '1px solid var(--t-err)' }}
        >
          <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--t-err)' }}>Policy 驳回记录</p>
          {violations.slice(-5).map((v, i) => (
            <p key={i} className="text-[10px] truncate" style={{ color: 'var(--t-fg-3)' }}>
              {v.sender} → {v.receiver}: {v.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
});

LiveDashboard.displayName = 'LiveDashboard';
