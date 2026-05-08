/**
 * TeamCard — Story 12.2 AC1, AC4
 *
 * Shows team name, description, member count, and timestamps.
 * Clicking navigates to /teams/{team_id} for detail view.
 */
import { useNavigate } from 'react-router-dom';
import type { TeamRecord } from '../../../api/teams';

interface TeamCardProps {
  team: TeamRecord;
  onDelete?: (teamId: string) => void;
}

export function TeamCard({ team, onDelete }: TeamCardProps) {
  const navigate = useNavigate();

  function handleCardClick() {
    navigate(`/teams/${team.team_id}`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete?.(team.team_id);
  }

  const memberCount = team.agent_ids.length;
  const createdDate = new Date(team.created_at).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick()}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-sf border border-shadowflow-border bg-shadowflow-surface p-4 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
      data-testid={`team-card-${team.team_id}`}
    >
      {/* Name row */}
      <div className="flex items-center gap-2 pr-8">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm">
          👥
        </span>
        <span className="truncate text-sm font-medium text-white/90">{team.name}</span>
        <span className="ml-auto shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/40">
          {memberCount} {memberCount === 1 ? 'agent' : 'agents'}
        </span>
      </div>

      {/* Description */}
      {team.description && (
        <p className="text-xs leading-relaxed text-white/50">
          {team.description.length > 80 ? team.description.slice(0, 80) + '…' : team.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[11px] text-white/30">
        <span>创建于 {createdDate}</span>
        <span>workspace: {team.workspace_id}</span>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={handleDelete}
          className="absolute bottom-3 right-3 hidden rounded px-1.5 py-0.5 text-[11px] text-white/30 hover:bg-red-500/20 hover:text-red-400 group-hover:flex"
          aria-label="删除 Team"
          data-testid={`team-delete-${team.team_id}`}
        >
          删除
        </button>
      )}
    </div>
  );
}
