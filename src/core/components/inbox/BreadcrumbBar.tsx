import { useNavigate } from 'react-router-dom';

interface BreadcrumbBarProps {
  /** Leaf label shown after "Inbox /" */
  label: string;
}

export function BreadcrumbBar({ label }: BreadcrumbBarProps) {
  const navigate = useNavigate();

  return (
    <nav
      className="flex items-center gap-2 border-b border-white/5 bg-shadowflow-surface px-6 py-3 text-sm"
      aria-label="breadcrumb"
    >
      <button
        type="button"
        onClick={() => navigate('/')}
        className="font-medium text-shadowflow-accent hover:underline"
      >
        Inbox
      </button>
      <span className="text-white/30">/</span>
      <span className="truncate text-white/80">{label}</span>
    </nav>
  );
}
