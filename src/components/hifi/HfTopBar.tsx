/**
 * Hi-Fi v2 TopBar — 50px header inside the content column.
 * Workspace switching is handled by WorkspaceStrip in HfLayout (universal).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { LanguageSwitcher } from '../../core/components/common/LanguageSwitcher';
import { useTheme } from './useTheme';
import { useI18n } from '../../common/i18n';
import { WorkspaceSelector } from '../workspace/WorkspaceStrip';

function tierColor(latency: number): string {
  if (latency < 100) return 'var(--t-ok)';
  if (latency <= 200) return 'var(--t-warn)';
  return 'var(--t-err)';
}

function NetworkLatencyChip() {
  const { t } = useI18n();
  const [latency, setLatency] = useState<number | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const ping = async () => {
      const start = Date.now();
      try {
        await fetch('/health', { method: 'GET', cache: 'no-store' });
        setLatency(Date.now() - start);
      } catch {
        setLatency(null);
      }
    };
    ping();
    const id = window.setInterval(ping, 10_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <a
      href="https://chainscan-newton.0g.ai"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={latency != null ? t('shell.networkTitle', { latency }) : '0G TESTNET · connecting…'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: hover ? 'var(--t-panel)' : 'var(--t-panel-2)',
        border: '1px solid var(--t-border)',
        color: 'var(--t-fg-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        marginRight: 12,
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: latency != null ? tierColor(latency) : 'var(--t-fg-3)',
          animation: 'hf-pulse 1.4s ease-in-out infinite',
        }}
      />
      <span>0G TESTNET · {latency != null ? `${latency}ms` : '…'}</span>
    </a>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [hover, setHover] = useState(false);

  const resolvedDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const next = resolvedDark ? 'light' : 'dark';
  const title = resolvedDark ? t('shell.switchToLight') : t('shell.switchToDark');

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
        border: '1px solid var(--t-border)',
        background: hover ? 'var(--t-panel-2)' : 'var(--t-panel-2)',
        color: hover ? 'var(--t-accent-bright)' : 'var(--t-fg-2)',
        cursor: 'pointer',
        transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
        flexShrink: 0,
      }}
    >
      {resolvedDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

interface HfTopBarProps {
  right?: ReactNode;
  /** @deprecated Workspace switching is now handled globally by WorkspaceStrip in HfLayout. */
  hideWorkspace?: boolean;
}

export function HfTopBar({ right, hideWorkspace }: HfTopBarProps) {
  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 22px 0 8px',
        borderBottom: '1px solid var(--t-border)',
        background: 'var(--t-panel)',
      }}
    >
      {!hideWorkspace && <WorkspaceSelector />}
      <div style={{ flex: 1 }} />
      {right}
      <NetworkLatencyChip />
      <ThemeToggle />
      <LanguageSwitcher />
    </header>
  );
}
