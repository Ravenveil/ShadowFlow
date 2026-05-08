/**
 * Story 7.8 — "Create Agent" jump button used in Chat and AgentDM headers.
 *
 * Disabled when VITE_BUILDER_ENABLED !== "true" (Builder story 8.1 not yet live).
 * Shows a tooltip explaining the pending status in that case.
 */
import { useNavigate } from 'react-router-dom';

interface CreateAgentButtonProps {
  label: string;
  builderUrl: string;
}

const BUILDER_ENABLED = import.meta.env.VITE_BUILDER_ENABLED === 'true';

export function CreateAgentButton({ label, builderUrl }: CreateAgentButtonProps) {
  const navigate = useNavigate();

  if (!BUILDER_ENABLED) {
    return (
      <div className="relative group">
        <button
          type="button"
          disabled
          aria-label={label}
          className="cursor-not-allowed rounded-sf border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/30 transition-colors"
        >
          {label}
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-48 rounded-sf bg-shadowflow-surface px-3 py-2 text-xs text-white/60 opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100"
        >
          Builder 即将可用
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => navigate(builderUrl)}
      className="rounded-sf border border-shadowflow-accent/40 bg-shadowflow-accent/10 px-3 py-1.5 font-mono text-xs text-shadowflow-accent transition-colors hover:bg-shadowflow-accent/20"
    >
      {label}
    </button>
  );
}
