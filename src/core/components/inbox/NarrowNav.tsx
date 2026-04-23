const NAV_ITEMS = [
  { key: 'messages', label: '消息', title: '消息', icon: 'message' },
  { key: 'templates', label: '模板', title: '模板', icon: 'templates' },
  { key: 'runs', label: '运行', title: '运行', icon: 'runs' },
  { key: 'archive', label: '归档', title: '归档', icon: 'archive' },
] as const;

function NavIcon({ kind }: { kind: (typeof NAV_ITEMS)[number]['icon'] }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.75,
  };

  switch (kind) {
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
        {NAV_ITEMS.map((item, index) => {
          const active = index === 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
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
        onClick={() => console.log('TODO: user profile')}
        className="mt-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 font-semibold text-white/80"
        aria-label="当前用户"
      >
        J
      </button>
    </nav>
  );
}
