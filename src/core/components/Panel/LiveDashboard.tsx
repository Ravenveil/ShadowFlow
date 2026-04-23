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

const STATUS_CONFIG: Record<NodeRunStatus, StatusConfig> = {
  pending:   { bg: 'bg-gray-900',  border: 'border-gray-600', dot: 'bg-gray-400',  label: 'pending' },
  running:   { bg: 'bg-blue-950',  border: 'border-blue-500', dot: 'bg-blue-400',  label: 'running',   pulse: true },
  waiting_user: { bg: 'bg-amber-950', border: 'border-amber-500', dot: 'bg-amber-400', label: 'waiting_user', pulse: true },
  succeeded: { bg: 'bg-green-950', border: 'border-green-500',dot: 'bg-green-400', label: 'succeeded' },
  failed:    { bg: 'bg-red-950',   border: 'border-red-500',  dot: 'bg-red-400',   label: 'failed' },
  rejected:  { bg: 'bg-red-950',   border: 'border-red-600',  dot: 'bg-red-500',   label: 'rejected',  flash: true },
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
        'hover:ring-2 hover:ring-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500',
        isSelected ? 'ring-2 ring-blue-500' : '',
        cfg.bg,
        cfg.border,
        cfg.pulse ? 'animate-pulse' : '',
        cfg.flash ? 'animate-flash' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <span className="text-xs font-semibold text-zinc-100 truncate">{nodeId}</span>
        <span className={`ml-auto text-[10px] font-mono ${cfg.dot.replace('bg-', 'text-')}`}>{cfg.label}</span>
      </div>
      {node.output && (
        <p className="text-[10px] text-zinc-400 truncate pl-4">{node.output}</p>
      )}
      {node.error && (
        <p className="text-[10px] text-red-400 truncate pl-4">{node.error}</p>
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
      <div className={`flex items-center justify-center h-full text-zinc-500 text-sm ${className}`}>
        暂无运行中的 Run
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 p-4 overflow-auto ${className}`} data-testid="live-dashboard">
      {/* Run header */}
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="font-mono text-zinc-200">{runId}</span>
        <span>·</span>
        <span>{nodeIds.length} 节点</span>
        {violations.length > 0 && (
          <span className="ml-auto text-red-400">{violations.length} 次 policy 驳回</span>
        )}
      </div>

      {/* Node cards grid */}
      {nodeIds.length === 0 ? (
        <div className="text-zinc-600 text-xs text-center py-6">等待节点事件...</div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {nodeIds.map((id) => (
            <NodeCard key={id} nodeId={id} />
          ))}
        </div>
      )}

      {/* Policy violation log */}
      {violations.length > 0 && (
        <div className="mt-2 border border-red-900 rounded-lg p-2">
          <p className="text-[10px] text-red-400 font-semibold mb-1">Policy 驳回记录</p>
          {violations.slice(-5).map((v, i) => (
            <p key={i} className="text-[10px] text-zinc-400 truncate">
              {v.sender} → {v.receiver}: {v.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
});

LiveDashboard.displayName = 'LiveDashboard';
