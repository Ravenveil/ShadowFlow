import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TeamRecord } from '../../../api/teams';

interface TeamCardProps {
  team: TeamRecord;
  onDelete?: (teamId: string) => void;
}

const PALETTE = [
  { bg: 'rgba(168,85,247,.14)', border: 'rgba(168,85,247,.32)', fg: '#A855F7' },
  { bg: 'rgba(245,158,11,.14)', border: 'rgba(245,158,11,.32)', fg: '#F59E0B' },
  { bg: 'rgba(34,211,238,.14)', border: 'rgba(34,211,238,.32)', fg: '#22D3EE' },
  { bg: 'rgba(16,185,129,.14)', border: 'rgba(16,185,129,.32)', fg: '#10B981' },
  { bg: 'rgba(59,130,246,.14)', border: 'rgba(59,130,246,.32)', fg: '#3B82F6' },
  { bg: 'rgba(236,72,153,.14)', border: 'rgba(236,72,153,.32)', fg: '#EC4899' },
  { bg: 'rgba(239,68,68,.14)', border: 'rgba(239,68,68,.32)', fg: '#EF4444' },
];

function pick(name: string) {
  return PALETTE[(name.charCodeAt(0) || 0) % PALETTE.length];
}

export function TeamCard({ team, onDelete }: TeamCardProps) {
  const navigate = useNavigate();
  const { bg, border, fg } = pick(team.name);
  const initial = (team.name || '?')[0].toUpperCase();
  const memberCount = team.agent_ids.length;
  const createdDate = new Date(team.created_at).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/teams/${team.team_id}`)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/teams/${team.team_id}`)}
      className="group"
      data-testid={`team-card-${team.team_id}`}
      style={{
        position: 'relative',
        cursor: 'pointer',
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color .15s, box-shadow .15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--t-border-2)';
        el.style.boxShadow = '0 2px 14px rgba(0,0,0,.07)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--t-border)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Header row: avatar + name + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: bg, border: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: fg,
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 700, color: 'var(--t-fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {team.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-fg-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
            {memberCount} {memberCount === 1 ? 'agent' : 'agents'}
          </div>
        </div>
      </div>

      {/* Description */}
      {team.description && (
        <p style={{
          margin: 0, fontSize: 12, color: 'var(--t-fg-4)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {team.description}
        </p>
      )}

      {/* Footer: date + workspace tag */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)',
      }}>
        <span>创建于 {createdDate}</span>
        <span style={{ color: 'var(--t-fg-6)' }}>·</span>
        <span style={{
          padding: '1px 6px', borderRadius: 4, fontSize: 10,
          background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
          color: 'var(--t-fg-5)',
        }}>
          {team.workspace_id}
        </span>
      </div>

      {/* Delete — shown on hover */}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(team.team_id); }}
          className="absolute bottom-3 right-3 hidden group-hover:flex items-center gap-1"
          style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 11, border: 'none',
            color: 'var(--t-err)',
            background: 'color-mix(in oklab, var(--t-err) 10%, var(--t-panel))',
            cursor: 'pointer',
          }}
          aria-label="删除 Team"
          data-testid={`team-delete-${team.team_id}`}
        >
          <Trash2 size={11} strokeWidth={2} aria-hidden />
          删除
        </button>
      )}
    </div>
  );
}
