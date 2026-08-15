import { useNavigate } from 'react-router-dom';

interface BreadcrumbBarProps {
  /** Leaf label shown after "Inbox /" */
  label: string;
}

export function BreadcrumbBar({ label }: BreadcrumbBarProps) {
  const navigate = useNavigate();

  return (
    <nav
      className="flex items-center gap-2 border-b border-[var(--t-border)] bg-shadowflow-surface px-6 py-3 text-sm"
      aria-label="breadcrumb"
    >
      <button
        type="button"
        onClick={() => navigate('/')}
        className="font-medium text-shadowflow-accent hover:underline"
      >
        Inbox
      </button>
      <span className="text-[var(--t-fg-5)]">/</span>
      <span className="truncate text-[var(--t-fg-2)]">{label}</span>
    </nav>
  );
}
