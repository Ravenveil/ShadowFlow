/**
 * AppearanceSection — Settings: Theme selector
 *
 * Provides three theme options: dark / light / system.
 * Theme is now driven by the Hi-Fi v2 useTheme hook, which:
 *   - reads/writes GET/PUT /api/settings/appearance
 *   - installs `data-theme="night"|"day"` on documentElement
 *   - flips Hi-Fi v2 token system Night ↔ Day in one attribute toggle
 *
 * Each theme card renders in its OWN literal colors (hardcoded hex),
 * NOT via `var(--t-*)` tokens — because users need to see what each
 * theme will look like before applying. Selected card gets a purple
 * accent ring + ✓ mark.
 */
import React from 'react';
import { useTheme, type ThemePref } from '../../../components/hifi/useTheme';
import { useI18n } from '../../../common/i18n';

// ----------------------------------------------------------------------------
// i18n keys — exported so a follow-up agent can wire these into locales.ts
// without re-reading this file. For now we use inline ternaries so the
// component works immediately without depending on locale partials shipping.
// ----------------------------------------------------------------------------
export const APPEARANCE_I18N_KEYS = {
  header: 'appearance.header',
  subtitle: 'appearance.subtitle',
  modeLabel: 'appearance.modeLabel',
  themeDark: 'appearance.theme.dark',
  themeLight: 'appearance.theme.light',
  themeSystem: 'appearance.theme.system',
  selected: 'appearance.selected',
  note: 'appearance.note',
} as const;

// ----------------------------------------------------------------------------
// Literal preview palette — DO NOT swap these for var(--t-*).
// These are the actual canvas/text colors each theme will render in.
// ----------------------------------------------------------------------------
const PREVIEW = {
  dark:  { bg: '#0A0A0A', fg: '#FAFAFA', meta: '#A1A1AA', border: '#27272A' },
  light: { bg: '#FAFAF7', fg: '#0A0A0A', meta: '#52525B', border: '#E4E2D8' },
} as const;

const ACCENT = '#A855F7';
const ACCENT_TINT = 'rgba(168, 85, 247, 0.14)';

function IconMoon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function IconSun({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function IconMonitor({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

type ThemeOption = ThemePref;

// ----------------------------------------------------------------------------
// Card backgrounds: each card paints itself in the literal colors of the
// theme it represents, so users can see what they're about to switch to.
// system = top half dark / bottom half light split.
// ----------------------------------------------------------------------------
function cardSurface(id: ThemeOption): React.CSSProperties {
  if (id === 'dark') {
    return { background: PREVIEW.dark.bg, color: PREVIEW.dark.fg };
  }
  if (id === 'light') {
    return { background: PREVIEW.light.bg, color: PREVIEW.light.fg };
  }
  // system — diagonal split: top-left dark, bottom-right light
  return {
    background: `linear-gradient(135deg, ${PREVIEW.dark.bg} 0%, ${PREVIEW.dark.bg} 49%, ${PREVIEW.light.bg} 51%, ${PREVIEW.light.bg} 100%)`,
    color: PREVIEW.dark.fg,
  };
}

function iconColor(id: ThemeOption, selected: boolean): string {
  if (selected) return ACCENT;
  if (id === 'light') return PREVIEW.light.fg;
  return PREVIEW.dark.fg;
}

function metaColor(id: ThemeOption): string {
  // For the system card, meta sits on the dark portion (top), use dark-meta
  if (id === 'light') return PREVIEW.light.meta;
  return PREVIEW.dark.meta;
}

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { language } = useI18n();
  const current: ThemeOption = theme;
  const isZh = language === 'zh';

  // Inline-ternary i18n — see APPEARANCE_I18N_KEYS for the eventual locale keys.
  const tx = {
    header: isZh ? '外观' : 'Appearance',
    subtitle: isZh ? '选择界面颜色主题。' : 'Choose your interface color theme.',
    modeLabel: isZh ? '颜色模式' : 'Color Mode',
    themeDark: isZh ? '深色' : 'Dark',
    themeLight: isZh ? '浅色' : 'Light',
    themeSystem: isZh ? '跟随系统' : 'System',
    selected: isZh ? '已选' : 'Selected',
    note: isZh
      ? 'Hi-Fi v2 设计系统使用 var(--t-*) token；浅色主题在新页（Start / Chat / Teams / Agents / Templates / Settings）已完整生效，旧页仍以深色为主。'
      : 'The Hi-Fi v2 design system uses var(--t-*) tokens; the light theme is fully wired across new pages (Start / Chat / Teams / Agents / Templates / Settings), while legacy pages still default to dark.',
  };

  const themes: Array<{ id: ThemeOption; label: string }> = [
    { id: 'dark',   label: tx.themeDark   },
    { id: 'light',  label: tx.themeLight  },
    { id: 'system', label: tx.themeSystem },
  ];

  function handleSelect(next: ThemeOption) {
    void setTheme(next);
  }

  function renderIcon(id: ThemeOption, selected: boolean) {
    const c = iconColor(id, selected);
    if (id === 'dark')  return <IconMoon color={c} />;
    if (id === 'light') return <IconSun color={c} />;
    return <IconMonitor color={c} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{tx.header}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">{tx.subtitle}</p>
      </div>

      {/* Theme selector */}
      <div>
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
          {tx.modeLabel}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ id, label }) => {
            const selected = current === id;
            const surface = cardSurface(id);
            const baseBorder =
              id === 'light' ? PREVIEW.light.border : PREVIEW.dark.border;

            const style: React.CSSProperties = {
              ...surface,
              border: selected
                ? `1px solid ${ACCENT}`
                : `1px solid ${baseBorder}`,
              boxShadow: selected
                ? `0 0 0 3px ${ACCENT_TINT}, 0 6px 16px rgba(0,0,0,0.35)`
                : '0 1px 2px rgba(0,0,0,0.25)',
              transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
            };

            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelect(id)}
                className="group relative flex flex-col items-center gap-2.5 rounded-[12px] px-4 py-5 hover:-translate-y-0.5"
                style={style}
              >
                {/* selection check pill */}
                {selected && (
                  <span
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: ACCENT, color: '#fff' }}
                    aria-hidden
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}

                {renderIcon(id, selected)}

                {/* title — 14px / 700 */}
                <span
                  className="text-[14px] font-bold leading-none"
                  style={{ color: id === 'light' ? PREVIEW.light.fg : PREVIEW.dark.fg }}
                >
                  {label}
                </span>

                {/* meta — 11px / 500 */}
                <span
                  className="font-mono text-[11px] font-medium leading-none"
                  style={{ color: selected ? ACCENT : metaColor(id) }}
                >
                  {selected ? `✓ ${tx.selected}` : id === 'system' ? 'auto' : id}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Info note */}
      <p className="text-[11px] text-sf-fg5">
        {tx.note}
      </p>
    </div>
  );
}
