import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../../../common/i18n';

type NavIconKind = 'start' | 'message' | 'templates' | 'runs' | 'archive';

function NavIcon({ kind }: { kind: NavIconKind }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.75,
  };

  switch (kind) {
    case 'start':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M5 4l14 8-14 8V4z" {...common} />
        </svg>
      );
    case 'templates':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="4" y="5" width="7" height="6" rx="1.5" {...common} />
          <rect x="13" y="5" width="7" height="6" rx="1.5" {...common} />
          <rect x="4" y="13" width="7" height="6" rx="1.5" {...common} />
          <rect x="13" y="13" width="7" height="6" rx="1.5" {...common} />
        </svg>
      );
    case 'runs':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M5 19V9" {...common} />
          <path d="M12 19V5" {...common} />
          <path d="M19 19v-7" {...common} />
        </svg>
      );
    case 'archive':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M4 7h16" {...common} />
          <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" {...common} />
          <path d="M9 11h6" {...common} />
        </svg>
      );
    case 'message':
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M6 8h12" {...common} />
          <path d="M6 12h8" {...common} />
          <path d="M12 18H7l-3 2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" {...common} />
        </svg>
      );
  }
}

export function NarrowNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const NAV_ITEMS: Array<{ key: string; label: string; title: string; icon: NavIconKind; to: string }> = [
    { key: 'start', label: t('shell.navStart'), title: t('shell.navStart'), icon: 'start', to: '/start' },
    { key: 'messages', label: t('inbox.title'), title: t('inbox.title'), icon: 'message', to: '/inbox' },
    { key: 'templates', label: t('shell.navTemplates'), title: t('shell.navTemplates'), icon: 'templates', to: '/templates' },
    { key: 'runs', label: t('common.run'), title: t('common.run'), icon: 'runs', to: '/runs' },
    { key: 'archive', label: t('common.about'), title: t('common.about'), icon: 'archive', to: '/catalog' },
  ];
  return (
    <nav
      data-testid="narrow-nav"
      className="flex w-[72px] flex-none flex-col items-center gap-6 overflow-y-auto border-r border-white/5 bg-shadowflow-surface px-3 py-4"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-sf bg-shadowflow-accent text-lg font-semibold text-slate-950">
          S
        </div>
        <span className="font-mono text-[10px] text-white/50">Solo ▾</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        {NAV_ITEMS.map((item) => {
          const active =
            location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`narrow-nav-${item.key}`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.to)}
              className={`flex h-10 w-10 items-center justify-center rounded-sf border transition ${
                active
                  ? 'border-shadowflow-accent/30 bg-shadowflow-accent/10 text-shadowflow-accent'
                  : 'border-transparent text-white/50 hover:border-white/10 hover:bg-white/5 hover:text-white/80'
              }`}
              title={item.title}
            >
              <NavIcon kind={item.icon} />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => navigate('/workspace')}
        className="mt-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 font-semibold text-white/80"
        aria-label={t('inbox.currentUser')}
      >
        J
      </button>
    </nav>
  );
}
