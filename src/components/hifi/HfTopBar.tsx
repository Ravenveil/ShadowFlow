/**
 * Hi-Fi v2 TopBar — 50px header inside the content column.
 *
 * Recreated 1:1 from `hf-shared.jsx` HfTopBar in the design handoff bundle.
 * Pages render their own HfTopBar so they can supply an optional `right` slot
 * (e.g. action buttons before the chips).
 *
 * The single visible breadcrumb segment is the WorkspaceCrumb — a clickable
 * chip that opens a workspace switcher dropdown. All path segments
 * (`ShadowFlow / Teams / Chat / default …`) were removed because the sidebar
 * NAV rail already highlights the current page type and the sidebar brand bar
 * already shows the product name.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { LanguageSwitcher } from '../../core/components/common/LanguageSwitcher';
import { useTheme } from './useTheme';
import { useI18n } from '../../common/i18n';
import {
  selectCurrentWorkspace,
  useWorkspaceStore,
} from '../../store/workspaceStore';
import { CreateWorkspaceModal } from '../workspace/CreateWorkspaceModal';

/**
 * Pick a status color tier based on observed latency.
 * < 100ms ok, 100-200ms warn, > 200ms err.
 */
function tierColor(latency: number): string {
  if (latency < 100) return 'var(--t-ok)';
  if (latency <= 200) return 'var(--t-warn)';
  return 'var(--t-err)';
}

/**
 * Always-on chip showing 0G testnet connectivity + last ping latency.
 * Mock data for now — jitters ±20ms every 5s within 70-110ms range.
 * Click opens the 0G testnet block explorer in a new tab.
 */
function NetworkLatencyChip() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  // TODO: replace with real GET /api/health.latency once endpoint exists
  const [latency, setLatency] = useState(87);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLatency(() => {
        const next = 70 + Math.floor(Math.random() * 41); // 70..110
        return next;
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <a
      href="https://chainscan-newton.0g.ai"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={T(
        `已连接 0G 测试网 · 最近 ping ${latency}ms · 点击打开链状态`,
        `Connected to 0G testnet · last ping ${latency}ms · click to open status`,
      )}
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
          background: tierColor(latency),
          animation: 'hf-pulse 1.4s ease-in-out infinite',
        }}
      />
      <span>0G TESTNET · {latency}ms</span>
    </a>
  );
}

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
        border: '1px solid var(--t-border)',
        background: hover ? 'var(--t-panel-2)' : 'var(--t-panel-2)',
        color: hover ? 'var(--t-accent-bright)' : 'var(--t-fg-2)',
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

/**
 * WorkspaceCrumb — single-segment breadcrumb that doubles as a workspace
 * switcher. 14×14 avatar + name + ▾, click toggles a dropdown listing all
 * workspaces with agent/team counts and a footer to create a new one.
 */
function WorkspaceCrumb() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const current = useWorkspaceStore(selectCurrentWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentId = useWorkspaceStore((s) => s.currentId);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load workspace list once if empty.
  useEffect(() => {
    if (workspaces.length === 0) {
      fetchWorkspaces().catch(() => {
        /* offline / no backend — fall back to static design text */
      });
    }
  }, [workspaces.length, fetchWorkspaces]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const name = current?.name ?? T('论文实验室', 'Paper Lab');

  const agentLabel = T('员工', 'agents');
  const teamLabel = T('团队', 'teams');

  function handleSwitch(id: string) {
    switchTo(id);
    setOpen(false);
  }
  function handleCreate() {
    setOpen(false);
    setShowCreate(true);
  }

  const chipBg = open
    ? 'var(--t-accent-tint)'
    : hover
      ? 'var(--t-panel-2)'
      : 'transparent';
  const chipColor = open ? 'var(--t-accent)' : 'var(--t-fg)';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={T('切换工作区', 'Switch workspace')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          borderRadius: 6,
          border: 'none',
          background: chipBg,
          color: chipColor,
          cursor: 'pointer',
          transition: 'background 120ms ease, color 120ms ease',
          outline: 'none',
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1,
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontSize: 9,
            color: 'var(--t-fg-5)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={T('工作区列表', 'Workspace list')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 240,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: 4,
            zIndex: 30,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {workspaces.length === 0 && (
            <div
              className="hf-meta"
              style={{ padding: '8px 10px', fontSize: 10, color: 'var(--t-fg-4)' }}
            >
              {T('暂无工作区', 'No workspaces yet')}
            </div>
          )}
          {workspaces.map((w) => {
            const isActive = w.workspace_id === currentId;
            const initial = Array.from(w.name)[0] ?? '?';
            return (
              <div
                key={w.workspace_id}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => handleSwitch(w.workspace_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSwitch(w.workspace_id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isActive ? 'var(--t-accent-tint)' : 'transparent',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--t-panel-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: w.color || 'var(--t-accent)',
                    color: 'var(--t-accent-ink)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      color: 'var(--t-fg)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {w.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'var(--t-fg-4)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {w.agent_count} {agentLabel} · {w.team_count} {teamLabel}
                  </div>
                </div>
                {isActive && (
                  <span
                    aria-label={T('当前', 'Active')}
                    style={{ color: 'var(--t-accent)', fontSize: 12, flexShrink: 0 }}
                  >
                    ✓
                  </span>
                )}
              </div>
            );
          })}
          <div
            style={{
              height: 1,
              background: 'var(--t-border)',
              margin: '4px 4px',
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onClick={handleCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCreate();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--t-accent)',
              fontSize: 12,
              fontWeight: 600,
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'var(--t-accent-tint)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
            <span>{T('新建工作区', 'New workspace')}</span>
          </div>
          <div
            style={{
              padding: '6px 10px 4px',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--t-fg-5)',
              letterSpacing: '0.04em',
              textAlign: 'right',
            }}
          >
            {T('⌘⇧O 切换', '⌘⇧O switch')}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={(ws) => {
            void fetchWorkspaces();
            switchTo(ws.workspace_id);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

interface HfTopBarProps {
  right?: ReactNode;
  /**
   * Pages that don't operate inside a single-workspace context (e.g. the
   * Start page is cross-workspace by definition) pass `hideWorkspace` so the
   * crumb-style switcher disappears entirely.
   */
  hideWorkspace?: boolean;
}

export function HfTopBar({ right, hideWorkspace = false }: HfTopBarProps) {
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
      {!hideWorkspace && <WorkspaceCrumb />}
      <div style={{ flex: 1 }} />
      {right}
      <NetworkLatencyChip />
      <ThemeToggle />
      <LanguageSwitcher />
    </header>
  );
}
