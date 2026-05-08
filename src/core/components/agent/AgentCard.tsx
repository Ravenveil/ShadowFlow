/**
 * AgentCard — Story 12.1 AC3
 *
 * Displays agent name, soul preview (60 chars), status badge, and tool icons.
 * Clicking the card navigates to /builder?agent_id=... for detail view.
 */
import { useNavigate } from 'react-router-dom';
import type { AgentRecord } from '../../../api/agents';

const TOOL_LABELS: Record<string, string> = {
  'shadowflow-shell': 'shell',
  'shadowflow-fs': 'fs',
  'shadowflow-web': 'web',
};

interface AgentCardProps {
  agent: AgentRecord;
  onDelete?: (agentId: string) => void;
  onExport?: (agent: AgentRecord) => void;
}

function StatusBadge({ status }: { status: AgentRecord['status'] }) {
  const colorMap: Record<string, string> = {
    idle: 'bg-emerald-500/15 text-emerald-400',
    running: 'bg-blue-500/15 text-blue-400',
    error: 'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-mono ${colorMap[status] ?? colorMap.idle}`}>
      {status}
    </span>
  );
}

export function AgentCard({ agent, onDelete, onExport }: AgentCardProps) {
  const navigate = useNavigate();
  const soulPreview = agent.soul.length > 60 ? agent.soul.slice(0, 60) + '…' : agent.soul;
  const toolsRaw = agent.blueprint?.role_profiles;
  const tools: string[] = (
    Array.isArray(toolsRaw) ? (toolsRaw[0] as { tools?: string[] } | undefined)?.tools : undefined
  ) ?? [];
  const isFromCatalog = agent.source === 'catalog';

  function handleCardClick() {
    navigate(`/builder?agent_id=${agent.agent_id}`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete?.(agent.agent_id);
  }

  function handleExport(e: React.MouseEvent) {
    e.stopPropagation();
    onExport?.(agent);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => e.key === 'Enter' && handleCardClick()}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-sf border border-shadowflow-border bg-shadowflow-surface p-4 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
      data-testid={`agent-card-${agent.agent_id}`}
    >
      {/* Source badge */}
      {isFromCatalog && (
        <span className="absolute right-3 top-3 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-mono text-indigo-300">
          catalog
        </span>
      )}

      {/* Name row */}
      <div className="flex items-center gap-2 pr-8">
        <span className="h-7 w-7 shrink-0 rounded-full bg-white/10 text-center text-sm leading-7">
          {agent.name.charAt(0).toUpperCase()}
        </span>
        <span className="truncate text-sm font-medium text-white/90">{agent.name}</span>
        <StatusBadge status={agent.status} />
      </div>

      {/* Soul preview */}
      <p className="text-xs leading-relaxed text-white/50">{soulPreview}</p>

      {/* Tool chips */}
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tools.map((t) => (
            <span
              key={t}
              className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40"
            >
              {TOOL_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons (visible on hover) */}
      <div className="absolute bottom-3 right-3 hidden items-center gap-1 group-hover:flex">
        {onExport && (
          <button
            onClick={handleExport}
            className="rounded px-1.5 py-0.5 text-[11px] text-white/30 hover:bg-white/10 hover:text-white/60"
            aria-label="导出蓝图"
          >
            导出
          </button>
        )}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="rounded px-1.5 py-0.5 text-[11px] text-white/30 hover:bg-red-500/20 hover:text-red-400"
            aria-label="删除 Agent"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}

export default AgentCard;
