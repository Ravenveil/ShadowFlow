/**
 * LocalCLISection — 本机 CLI 独立设置页 (Variant E design)
 *
 * Design spec: ui_kits/settings-redesign/variant-e.jsx VariantE_CLI
 * Layout: full-height panel · toolbar + 4-col installed grid + dashed uninstalled grid
 * Data: GET /api/settings/agents/detect  · PUT /api/settings/agents/selection
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// ── Brand registry ────────────────────────────────────────────────────────────

type Category = 'anthropic' | 'openai' | 'google' | 'cn' | 'other';

interface CLIMeta {
  name: string;
  monogram: string;
  tint: string;
  short: string;
  category: Category;
  docsUrl?: string;
}

const CLI_META: Record<string, CLIMeta> = {
  claude:         { name: 'Claude Code',    monogram: 'CC', tint: '#D97706', short: 'Anthropic CLI',      category: 'anthropic', docsUrl: 'https://claude.ai/code' },
  codex:          { name: 'Codex CLI',      monogram: 'CX', tint: '#10B981', short: 'OpenAI CLI',         category: 'openai'                                           },
  gemini:         { name: 'Gemini CLI',     monogram: 'Gm', tint: '#4285F4', short: 'Google CLI',         category: 'google'                                           },
  opencode:       { name: 'OpenCode',       monogram: 'OC', tint: '#22C55E', short: 'OSS · multi-model',  category: 'other'                                            },
  openclaw:       { name: 'OpenClaw',       monogram: 'OW', tint: '#F97316', short: 'Cherry · fork',      category: 'other'                                            },
  cursor:         { name: 'Cursor Agent',   monogram: 'CU', tint: '#8B5CF6', short: 'Headless cursor',    category: 'openai'                                           },
  'cursor-agent': { name: 'Cursor Agent',   monogram: 'CU', tint: '#8B5CF6', short: 'Headless cursor',    category: 'openai'                                           },
  'qwen-coder':   { name: 'Qwen Code',      monogram: 'Qw', tint: '#A855F7', short: 'Alibaba CLI',        category: 'cn'                                               },
  'gh-copilot':   { name: 'GitHub Copilot', monogram: 'GH', tint: '#0078D4', short: 'GitHub CLI',         category: 'openai'                                           },
  hermes:         { name: 'Hermes',         monogram: 'Hm', tint: '#EC4899', short: 'Multi-agent',        category: 'other'                                            },
  devin:          { name: 'Devin',          monogram: 'Dv', tint: '#6366F1', short: 'Terminal agent',     category: 'other'                                            },
  kimi:           { name: 'Kimi CLI',       monogram: 'Km', tint: '#06B6D4', short: 'Moonshot CLI',       category: 'cn'                                               },
  kiro:           { name: 'Kiro',           monogram: 'Kr', tint: '#F59E0B', short: 'AWS · spec-driven',  category: 'other'                                            },
  kilo:           { name: 'Kilo',           monogram: 'Kl', tint: '#3B82F6', short: 'Token-efficient',    category: 'other'                                            },
  vibe:           { name: 'Vibe',           monogram: 'Vb', tint: '#EC4899', short: 'Conversational',     category: 'other'                                            },
  'deepseek-tui': { name: 'DeepSeek TUI',   monogram: 'DS', tint: '#3D8BFD', short: 'DeepSeek terminal',  category: 'cn'                                               },
  qoder:          { name: 'Qoder CLI',      monogram: 'Qd', tint: '#8B5CF6', short: 'Local code agent',   category: 'cn'                                               },
  pi:             { name: 'Pi',             monogram: 'πi', tint: '#A855F7', short: 'Conversational',     category: 'other'                                            },
  aider:          { name: 'Aider',          monogram: 'Ai', tint: '#059669', short: 'Git-native agent',   category: 'other'                                            },
  cline:          { name: 'Cline',          monogram: 'Cl', tint: '#6366F1', short: 'Task automation',    category: 'other'                                            },
  'windsurf-cli': { name: 'Windsurf',       monogram: 'Ws', tint: '#06B6D4', short: 'Coding agent',       category: 'other'                                            },
};

// ── API ───────────────────────────────────────────────────────────────────────

interface AgentEntry {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
  docsUrl?: string | null;
  installHint?: string | null;
}

async function fetchAgents(): Promise<AgentEntry[]> {
  const res = await fetch(`${API_BASE}/api/settings/agents/detect`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.agents) ? j.agents : [];
}

async function fetchSelection(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/settings/agents/selection`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.selectedId === 'string' ? j.selectedId : null;
  } catch { return null; }
}

function syncSelection(id: string) {
  fetch(`${API_BASE}/api/settings/agents/selection`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedId: id }), signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CLILogo({ id, size = 32, active = false }: { id: string; size?: number; active?: boolean }) {
  const m = CLI_META[id] ?? { tint: '#71717A', monogram: id.slice(0, 2).toUpperCase() };
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.26), flexShrink: 0,
      background: `color-mix(in oklab, ${m.tint} 14%, var(--t-panel))`,
      border: `1px solid color-mix(in oklab, ${m.tint} ${active ? 60 : 35}%, transparent)`,
      color: m.tint,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: Math.round(size * 0.34),
      letterSpacing: '-0.04em', userSelect: 'none',
      boxShadow: active ? `0 0 0 1px ${m.tint}55, 0 0 12px -2px ${m.tint}66` : 'none',
    }}>
      {m.monogram}
    </div>
  );
}

function CLICardLarge({
  id, installed, version, path, active, onClick,
}: {
  id: string; installed: boolean; version?: string | null; path?: string | null;
  active: boolean; onClick: () => void;
}) {
  const m = CLI_META[id] ?? { name: id, short: '', tint: '#71717A', docsUrl: undefined };
  return (
    <div
      onClick={installed ? onClick : undefined}
      style={{
        position: 'relative', padding: '16px 18px', borderRadius: 14,
        background: active ? 'var(--t-accent-tint)' : 'var(--t-bg)',
        border: active
          ? '1px solid var(--t-accent)'
          : `1px solid ${installed ? 'var(--t-border)' : 'var(--t-border-2, var(--t-border))'}`,
        boxShadow: active ? '0 0 0 1px var(--t-accent), 0 0 18px -2px color-mix(in oklab, var(--t-accent) 45%, transparent)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 12,
        opacity: installed ? 1 : 0.55,
        cursor: installed ? 'pointer' : 'default',
        transition: 'border-color .15s, background .15s, box-shadow .15s',
      }}
    >
      {/* Logo + status chip */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <CLILogo id={id} size={44} active={active} />
        {active ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 5,
            background: 'color-mix(in oklab, var(--t-accent) 18%, transparent)',
            border: '1px solid color-mix(in oklab, var(--t-accent) 45%, transparent)',
            color: 'var(--t-accent)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t-accent)', animation: 'sf-pulse 1.4s ease-in-out infinite', display: 'inline-block' }} />
            ACTIVE
          </span>
        ) : installed ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
            background: 'var(--t-ok-tint, rgba(16,185,129,0.12))', color: 'var(--t-ok)',
            border: '1px solid color-mix(in oklab, var(--t-ok) 35%, transparent)',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          }}>已安装</span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
            background: 'var(--t-bg)', color: 'var(--t-fg-4)',
            border: '1px solid var(--t-border)',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
          }}>未检测</span>
        )}
      </div>

      {/* Name + short */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-fg)', letterSpacing: '-0.005em' }}>{m.name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-4)', marginTop: 3 }}>{m.short}</div>
      </div>

      {/* Details */}
      {installed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10, borderTop: '1px solid var(--t-border)' }}>
          {version && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-4)', width: 36, textTransform: 'uppercase' }}>VER</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-2)' }}>v{version}</span>
            </div>
          )}
          {path && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-4)', width: 36, textTransform: 'uppercase' }}>PATH</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, paddingTop: 6 }}>
          {m.docsUrl && (
            <a href={m.docsUrl} target="_blank" rel="noreferrer"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-3)', textDecoration: 'underline', cursor: 'pointer' }}
              onClick={e => e.stopPropagation()}>
              安装 ↗
            </a>
          )}
          <a style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', textDecoration: 'underline', cursor: 'pointer' }}>
            文档
          </a>
        </div>
      )}
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 9px', borderRadius: 6,
        background: active ? 'var(--t-accent-tint)' : 'var(--t-bg)',
        border: `1px solid ${active ? 'color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'var(--t-border)'}`,
        color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'background .12s, color .12s, border-color .12s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.65 }}>{count}</span>
    </button>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label, count, right }: { label: string; count: number; right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-4)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label} · {count}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
      {right && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', whiteSpace: 'nowrap' }}>{right}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'installed' | 'notinstalled' | 'anthropic' | 'openai' | 'google' | 'cn';

// Build the full grid synchronously from CLI_META so cards appear instantly
// on mount — the network scan only flips install state, never the shape.
function buildPlaceholderAgents(): AgentEntry[] {
  return Object.entries(CLI_META).map(([id, meta]) => ({
    id,
    name: meta.name,
    installed: false,
    version: null,
    path: null,
    docsUrl: meta.docsUrl ?? null,
  }));
}

export function LocalCLISection() {
  // Initial state holds every known CLI brand as "not installed" — the grid
  // renders on first paint, no skeleton wait. The detect scan below merges in
  // real install status when it returns.
  const [agents, setAgents] = useState<AgentEntry[]>(buildPlaceholderAgents);
  const [selectedId, setSelectedId] = useState<string>(() => localStorage.getItem('sf.selectedAgent') ?? 'claude');
  const [scanning, setScanning] = useState(true);  // first paint = a scan is already running
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const [list, sel] = await Promise.all([fetchAgents(), fetchSelection()]);
      const apiById = new Map(list.map(a => [a.id, a]));
      const merged: AgentEntry[] = Object.keys(CLI_META).map(id => {
        const fromApi = apiById.get(id);
        if (fromApi) return fromApi;
        return {
          id, name: CLI_META[id].name, installed: false,
          version: null, path: null, docsUrl: CLI_META[id].docsUrl ?? null,
        };
      });
      // Surface any API-only ids the local registry doesn't know about
      for (const a of list) {
        if (!CLI_META[a.id]) merged.push(a);
      }
      setAgents(merged);
      if (sel && merged.some(a => a.id === sel && a.installed)) {
        setSelectedId(sel);
        localStorage.setItem('sf.selectedAgent', sel);
      }
    } catch {
      setError('CLI 检测服务不可用，请确认后端已启动');
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSelect(id: string) {
    setSelectedId(id);
    localStorage.setItem('sf.selectedAgent', id);
    const cliIds = new Set([
      'claude','codex','gh-copilot','cursor-agent','cursor','gemini','qwen-coder',
      'cline','aider','windsurf-cli','devin','hermes','kimi','qoder','pi','kiro',
      'kilo','vibe','deepseek-tui','opencode','openclaw',
    ]);
    localStorage.setItem('sf.defaultExecutor', cliIds.has(id) ? `cli:${id}` : 'anthropic-direct');
    syncSelection(id);
  }

  // Apply filter + search
  const filtered = useMemo(() => {
    return agents.filter(a => {
      const meta = CLI_META[a.id];
      if (!meta) return filter === 'all' || filter === (a.installed ? 'installed' : 'notinstalled');
      if (search) {
        const q = search.toLowerCase();
        if (!meta.name.toLowerCase().includes(q) && !a.id.includes(q) && !meta.short.toLowerCase().includes(q)) return false;
      }
      if (filter === 'installed')    return a.installed;
      if (filter === 'notinstalled') return !a.installed;
      if (filter === 'anthropic')    return meta.category === 'anthropic';
      if (filter === 'openai')       return meta.category === 'openai';
      if (filter === 'google')       return meta.category === 'google';
      if (filter === 'cn')           return meta.category === 'cn';
      return true;
    });
  }, [agents, filter, search]);

  const installed    = filtered.filter(a => a.installed);
  const notInstalled = filtered.filter(a => !a.installed);

  const counts: Record<FilterKey, number> = {
    all:          agents.length,
    installed:    agents.filter(a => a.installed).length,
    notinstalled: agents.filter(a => !a.installed).length,
    anthropic:    agents.filter(a => CLI_META[a.id]?.category === 'anthropic').length,
    openai:       agents.filter(a => CLI_META[a.id]?.category === 'openai').length,
    google:       agents.filter(a => CLI_META[a.id]?.category === 'google').length,
    cn:           agents.filter(a => CLI_META[a.id]?.category === 'cn').length,
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',          label: '全部' },
    { key: 'installed',    label: '已安装' },
    { key: 'notinstalled', label: '未安装' },
    { key: 'anthropic',    label: 'Anthropic 系' },
    { key: 'openai',       label: 'OpenAI 系' },
    { key: 'google',       label: 'Google 系' },
    { key: 'cn',           label: '国内' },
  ];

  return (
    <div className="sf-settings-bg" style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: '1 1 0', minHeight: 400, boxSizing: 'border-box' }}>
      {/* Full-height panel */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--t-border)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--t-fg-4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginRight: 2 }}>
            显示 ·
          </span>
          {FILTERS.map(f => (
            <FilterChip
              key={f.key}
              label={f.label}
              count={counts[f.key]}
              active={filter === f.key}
              onClick={() => setFilter(f.key)}
            />
          ))}
          <div style={{ flex: 1 }} />
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
            background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9, width: 220,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索 CLI…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-2)',
              }}
            />
            {!search && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 5px', border: '1px solid var(--t-border)', borderRadius: 4, color: 'var(--t-fg-3)', background: 'var(--t-bg)' }}>/</span>
            )}
          </div>
          {/* Rescan */}
          <button
            type="button"
            onClick={() => load()}
            disabled={scanning}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--t-fg-3)',
              background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer',
              opacity: scanning ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
            {scanning ? (scanned ? '扫描中…' : '检测中…') : '重新扫描'}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
          {error ? (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'color-mix(in oklab, var(--t-reject) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--t-reject) 30%, transparent)', color: 'var(--t-reject)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {error}
            </div>
          ) : (
            <>
              {/* Installed grid */}
              {installed.length > 0 && (
                <>
                  <SectionDivider label="已安装 · Installed" count={installed.length} right="排序 · 安装状态 ↓" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 24 }}>
                    {installed.map(a => (
                      <CLICardLarge
                        key={a.id}
                        id={a.id}
                        installed
                        version={a.version}
                        path={a.path}
                        active={selectedId === a.id}
                        onClick={() => handleSelect(a.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Not-installed grid */}
              {notInstalled.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${installed.length > 0 ? '4px' : '0'} 0 12px` }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-fg-5)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      未检测到 · Not Detected · {notInstalled.length}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--t-border)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', cursor: 'pointer', whiteSpace: 'nowrap' }}>查看安装指南 ↗</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {notInstalled.map(a => {
                      const m = CLI_META[a.id] ?? { name: a.name, short: '', tint: '#71717A' };
                      return (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px',
                          border: '1px dashed var(--t-border)', borderRadius: 11, opacity: 0.62,
                        }}>
                          <CLILogo id={a.id} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>{m.short}</div>
                          </div>
                          {(a.docsUrl ?? m.docsUrl) && (
                            <a href={a.docsUrl ?? m.docsUrl} target="_blank" rel="noreferrer"
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', textDecoration: 'underline' }}>↗</a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {installed.length === 0 && notInstalled.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  没有匹配的 CLI
                </div>
              )}

              {/* Tip strip */}
              <div style={{
                marginTop: 20, padding: '12px 16px',
                background: 'var(--t-bg)', border: '1px solid var(--t-border)', borderRadius: 11,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t-fg-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v5h1"/>
                </svg>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--t-fg-3)' }}>
                  通过 npm / Homebrew 安装的 CLI 若仍显示为「未检测」，请确认其 bin 目录已加入 ShadowFlow 守护进程继承的 PATH（macOS 上 Terminal 与 GUI 应用的 PATH 可能不同）。
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', cursor: 'pointer', whiteSpace: 'nowrap' }}>QUICKSTART.md ↗</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
