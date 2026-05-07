/**
 * Hi-Fi v2 TopBar — 50px header inside the content column.
 *
 * Recreated 1:1 from `hf-shared.jsx` HfTopBar in the design handoff bundle.
 * Pages render their own HfTopBar so they can supply per-route breadcrumbs
 * and an optional `right` slot (e.g. action buttons before the chips).
 */
import { Fragment, useState, type ReactNode } from 'react';
import { HfDot } from './HfAtoms';
import { LanguageSwitcher } from '../../core/components/common/LanguageSwitcher';
import { useTheme } from './useTheme';
import { useI18n } from '../../common/i18n';

/**
 * One-icon day/night toggle. Click flips between dark and light;
 * if user is on "system", we force the opposite of what's currently shown.
 */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { language } = useI18n();
  const [hover, setHover] = useState(false);

  const resolvedDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const next = resolvedDark ? 'light' : 'dark';
  const title =
    language === 'zh'
      ? resolvedDark
        ? '切到浅色'
        : '切到深色'
      : resolvedDark
        ? 'Switch to Light'
        : 'Switch to Dark';

  return (
    <button
      type="button"
      onClick={() => void setTheme(next)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      aria-label={title}
      style={{
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: hover ? 'var(--t-panel-2)' : 'var(--bg-elev-2)',
        color: hover ? 'var(--accent-bright)' : 'var(--fg-2)',
        cursor: 'pointer',
        transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
        flexShrink: 0,
      }}
    >
      {resolvedDark ? (
        // Sun — currently dark, click to go light
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon — currently light, click to go dark
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

interface HfTopBarProps {
  crumbs: string[];
  right?: ReactNode;
}

export function HfTopBar({ crumbs, right }: HfTopBarProps) {
  return (
    <header
      style={{
        height: 50,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 22px',
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-bg)',
      }}
    >
      <span className="hf-meta" style={{ fontSize: 11 }}>
        {crumbs.map((c, i, a) => (
          <Fragment key={`${c}-${i}`}>
            <span style={{ color: i === a.length - 1 ? 'var(--t-fg)' : 'var(--t-fg-3)' }}>
              {c}
            </span>
            {i < a.length - 1 && (
              <span style={{ margin: '0 8px', color: 'var(--t-fg-5)' }}>/</span>
            )}
          </Fragment>
        ))}
      </span>
      <div style={{ flex: 1 }} />
      {right}
      <span className="hf-chip" style={{ fontSize: 10 }}>
        <HfDot color="var(--t-ok)" pulse />
        0G TESTNET · 87ms
      </span>
      <ThemeToggle />
      <LanguageSwitcher />
    </header>
  );
}
