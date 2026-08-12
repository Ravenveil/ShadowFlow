/**
 * Hi-Fi v2 TopBar — 50px header inside the content column.
 * Workspace switching is handled by WorkspaceStrip in HfLayout (universal).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Settings as HfSettingsIcon } from '../../common/icons/iconRegistry';
import { LanguageSwitcher } from '../../core/components/common/LanguageSwitcher';
import { openQuickSwitcher } from './QuickSwitcher';
import { useTheme } from './useTheme';
import { useI18n } from '../../common/i18n';

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

  // 2026-08-11: 原为 0G chainscan 外链 + "0G TESTNET" 文案；实际 ping 的是本地 /health，
  // 改为本地服务状态指示（去 0G），外链一并移除。
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={latency != null ? t('shell.networkTitle', { latency }) : 'LOCAL SERVER · connecting…'}
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
      <span>LOCAL · {latency != null ? `${latency}ms` : '…'}</span>
    </div>
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

/**
 * TopBarTools — 搜索 + 设置（2026-06-22 用户要求从侧栏移到全局顶栏，与主题/语言
 * 同处右上角）。样式对齐 ThemeToggle 的 28×28 图标按钮。
 */
function TopBarTools() {
  const { t } = useI18n();
  const btn: CSSProperties = {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: '1px solid var(--t-border)',
    background: 'var(--t-panel-2)',
    color: 'var(--t-fg-2)',
    cursor: 'pointer',
    textDecoration: 'none',
    flexShrink: 0,
  };
  return (
    <>
      <button type="button" onClick={openQuickSwitcher} title="搜索 ⌘K" aria-label="搜索" data-testid="topbar-search" style={btn}>
        <Search size={14} strokeWidth={1.9} aria-hidden />
      </button>
      <Link to="/settings" title={t('shell.navSettings')} aria-label={t('shell.navSettings')} data-testid="topbar-settings" style={btn}>
        <HfSettingsIcon size={14} />
      </Link>
    </>
  );
}

interface HfTopBarProps {
  right?: ReactNode;
  /** @deprecated 工作区选择器现在按路由自动显示（/chat 在内容区显示，其余页面在顶栏兜底）。 */
  hideWorkspace?: boolean;
}

export function HfTopBar({ right }: HfTopBarProps) {
  // 工作区/团队选择器现在唯一地住在常驻左侧栏（ChatRail，HfLayout 全站渲染）。
  // 顶栏此前在非 /chat 页兜底再渲一个，导致与侧栏的同一张「未命名团队」卡重复
  // （用户 2026-06-27 报告）。彻底移除顶栏这份，侧栏成为唯一真源。
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
      <div style={{ flex: 1 }} />
      {right}
      <NetworkLatencyChip />
      <TopBarTools />
      <ThemeToggle />
      <LanguageSwitcher />
    </header>
  );
}
