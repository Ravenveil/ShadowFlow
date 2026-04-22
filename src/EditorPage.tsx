import React, { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { WorkflowCanvas, type SfEdgeType } from './core/components/Canvas/WorkflowCanvas';
import { ReactFlowProvider, useReactFlow } from 'reactflow';
import { I18nProvider, useI18n } from './common/i18n';
import { useWorkflow } from './core/stores/workflowStore';
import { useNodeRegistry } from './core/stores/nodeRegistryStore';
import type { WorkflowNode } from './common/types';
import { PRESETS, materializePreset } from './templates/presets';
import { saveUserTemplate, parseWorkflowJSON, exportWorkflowJSON, getUserTemplate } from './templates/userTemplates';
import { runDemo } from './runtime/demoRunner';
import { useYamlSync } from './core/hooks/useYamlSync';
import { useYamlEditorStore } from './core/hooks/useYamlEditorStore';
import { parseWorkflowYaml } from './core/lib/yamlSerializer';
import { ApprovalGateForm } from './core/components/inspector/ApprovalGateForm';
import { ProviderPanel } from './core/components/inspector/ProviderPanel';
import { SecretsModal } from './core/components/modals/SecretsModal';

const YamlEditor = lazy(() =>
  import('./core/components/editor/YamlEditor').then((m) => ({ default: m.YamlEditor })),
);

// ── palette data — id must match nodeRegistryStore ────────────────────────────
const PALETTE_AGENTS = [
  { id: 'planner',    t: 'Planner',    m: 'claude · plan' },
  { id: 'writer',     t: 'Writer',     m: '0g · gpt-oss' },
  { id: 'researcher', t: 'Researcher', m: 'claude · research' },
  { id: 'critic',     t: 'Critic',     m: 'claude · review' },
  { id: 'advisor',    t: 'Advisor',    m: '0g · verify' },
  { id: 'editor',     t: 'Editor',     m: 'claude · polish' },
];
const PALETTE_GATES = [
  { id: 'retry_gate',    t: 'Retry Gate',    m: '↻ double-reject' },
  { id: 'approval_gate', t: 'Approval Gate', m: '✓ human · policy' },
  { id: 'parallel',      t: 'Fan-out',       m: '⚑ parallel' },
  { id: 'barrier',       t: 'Barrier',       m: '⊞ await all' },
  { id: 'merge',         t: 'Merge',         m: '→ join lanes' },
  { id: 'checkpoint',    t: 'Checkpoint',    m: '◆ snapshot' },
];

const CHECKPOINTS = [
  { label: 'cp · plan.done',     pct:  8, kind: 'ok' },
  { label: 'cp · research.done', pct: 22, kind: 'ok' },
  { label: 'cp · draft.v1',      pct: 40, kind: 'ok' },
  { label: '✗ reject.v1',        pct: 55, kind: 'reject' },
  { label: 'cp · draft.v2',      pct: 68, kind: 'ok' },
  { label: '↻ retry.2',          pct: 82, kind: 'warn' },
];

// ── CSS variables shorthand ───────────────────────────────────────────────────
const V = {
  panel:      'var(--skin-panel)',
  bg:         'var(--bg)',
  elev1:      'var(--bg-elev-1)',
  elev2:      'var(--bg-elev-2)',
  border:     'var(--border)',
  borderSub:  'var(--border-subtle)',
  fg0:        'var(--fg-0)',
  fg1:        'var(--fg-1)',
  fg2:        'var(--fg-2)',
  fg3:        'var(--fg-3)',
  fg4:        'var(--fg-4)',
  fg5:        'var(--fg-5)',
  accent:     'var(--accent)',
  accentBr:   'var(--accent-bright)',
  accentTint: 'var(--accent-tint)',
  ok:         'var(--status-ok)',
  okTint:     'var(--status-ok-tint)',
  warn:       'var(--status-warn)',
  reject:     'var(--status-reject)',
  run:        'var(--status-run)',
  mono:       'var(--font-mono)',
  sans:       'var(--font-sans)',
};

// ── helpers ───────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: V.mono, fontSize: 9.5, fontWeight: 700,
      letterSpacing: '.12em', textTransform: 'uppercase' as const, color: V.fg4 }}>
      {children}
    </span>
  );
}

function Chip({ children, accent, run }: { children: React.ReactNode; accent?: boolean; run?: boolean }) {
  return (
    <span style={{
      fontFamily: V.mono, fontSize: 10.5, fontWeight: 600,
      padding: '3px 8px', borderRadius: 6,
      background: accent ? V.accentTint : run ? 'var(--status-run-tint)' : V.elev2,
      color: accent ? V.accentBr : run ? V.run : V.fg3,
      border: `1px solid ${accent ? 'rgba(168,85,247,.35)' : run ? 'rgba(59,130,246,.35)' : V.border}`,
    }}>
      {children}
    </span>
  );
}

// ── Shared goal + run state (module scope so topbar button + goal bar agree) ──
type FinalState = { final: string; outputs: { nodeId: string; output: string }[] } | null;
const goalState: { goal: string; subs: Set<(g: string) => void> } = { goal: '', subs: new Set() };
const finalState: { value: FinalState; subs: Set<(v: FinalState) => void> } = { value: null, subs: new Set() };

function useGoal(): [string, (g: string) => void] {
  const [v, setV] = useState(goalState.goal);
  useEffect(() => {
    const fn = (g: string) => setV(g);
    goalState.subs.add(fn);
    return () => { goalState.subs.delete(fn); };
  }, []);
  const set = (g: string) => { goalState.goal = g; goalState.subs.forEach(fn => fn(g)); };
  return [v, set];
}

function useFinal(): [FinalState, (v: FinalState) => void] {
  const [v, setV] = useState<FinalState>(finalState.value);
  useEffect(() => {
    const fn = (x: FinalState) => setV(x);
    finalState.subs.add(fn);
    return () => { finalState.subs.delete(fn); };
  }, []);
  const set = (x: FinalState) => { finalState.value = x; finalState.subs.forEach(fn => fn(x)); };
  return [v, set];
}

// Run controller shared between topbar button and goal bar
function useRunController() {
  const { isRunning, startRun, stopRun, setRunProgress, nodes, edges, updateNode } = useWorkflow();
  const [goal] = useGoal();
  const [, setFinal] = useFinal();
  const cancelRef = React.useRef<(() => void) | null>(null);

  const start = () => {
    if (isRunning || nodes.length === 0) return;
    setFinal(null);
    // reset all node statuses & outputs
    nodes.forEach(n => updateNode(n.id, { data: { ...n.data, status: 'idle' } as typeof n.data }));
    startRun();

    cancelRef.current = runDemo({
      goal: goal || '(no goal provided)',
      nodes, edges,
      events: {
        onNodeStart: (nodeId) => {
          const n = nodes.find(x => x.id === nodeId);
          if (n) updateNode(nodeId, { data: { ...n.data, status: 'running' } as typeof n.data });
        },
        onNodeDone: (nodeId, output) => {
          const n = nodes.find(x => x.id === nodeId);
          if (n) {
            updateNode(nodeId, { data: { ...n.data, status: 'success', lastOutput: output } as typeof n.data & { lastOutput: string } });
          }
        },
        onProgress: (p) => setRunProgress(p),
        onFinal: (final, outputs) => {
          setFinal({ final, outputs });
          stopRun();
        },
        onError: () => stopRun(),
      },
    });
  };

  const stop = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    stopRun();
  };

  return { isRunning, start, stop };
}

function RunButton({ lang }: { lang: string }) {
  const { isRunning, start, stop } = useRunController();
  const label = isRunning
    ? (zh ? '■ 停止' : '■ Stop')
    : (zh ? '▶ 运行' : '▶ Run');

  return (
    <button
      onClick={() => isRunning ? stop() : start()}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: V.sans, fontSize: 13, fontWeight: 600,
        color: isRunning ? '#fff' : 'var(--accent-ink)',
        background: isRunning ? V.reject : V.accent,
        border: 'none', borderRadius: 8, padding: '6px 16px',
        cursor: 'pointer', transition: 'background 120ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = isRunning ? '#dc2626' : 'var(--accent-bright)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = isRunning ? V.reject : V.accent; }}>
      {label}
    </button>
  );
}

// ── Goal bar (renders above the scrubber) ────────────────────────────────────
function GoalBar() {
  const [goal, setGoal] = useGoal();
  const { isRunning, start, stop } = useRunController();
  const { language } = useI18n();
  const zh = language === 'zh';
  const hint = zh ? '输入你的目标，例：为一人公司做本周增长 bet' : 'Type your goal — e.g. "pick this week\'s growth bet for a solo company"';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: V.elev1, borderTop: `1px solid ${V.borderSub}`, borderBottom: `1px solid ${V.borderSub}` }}>
      <span style={{ fontFamily: V.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: V.fg4, flexShrink: 0 }}>
        {zh ? '目标' : 'Goal'}
      </span>
      <input
        value={goal} onChange={e => setGoal(e.target.value)}
        placeholder={hint}
        disabled={isRunning}
        onKeyDown={e => { if (e.key === 'Enter' && !isRunning && goal.trim()) start(); }}
        style={{
          flex: 1, height: 30, background: V.panel, border: `1px solid ${V.border}`,
          borderRadius: 7, padding: '0 12px', color: V.fg1, fontFamily: V.sans, fontSize: 13,
          outline: 'none', opacity: isRunning ? .6 : 1,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = V.accent; }}
        onBlur={e  => { e.currentTarget.style.borderColor = V.border; }}
      />
      <button
        onClick={() => isRunning ? stop() : (goal.trim() && start())}
        disabled={!isRunning && !goal.trim()}
        style={{
          height: 30, padding: '0 14px', fontFamily: V.sans, fontSize: 12, fontWeight: 600,
          color: isRunning ? '#fff' : 'var(--accent-ink)',
          background: isRunning ? V.reject : V.accent,
          border: 'none', borderRadius: 7,
          cursor: (!isRunning && !goal.trim()) ? 'not-allowed' : 'pointer',
          opacity: (!isRunning && !goal.trim()) ? .45 : 1,
          flexShrink: 0,
        }}>
        {isRunning ? (zh ? '■ 停止' : '■ Stop') : (zh ? '▶ 运行' : '▶ Run')}
      </button>
    </div>
  );
}

// ── Final output modal (shown when a run completes) ──────────────────────────
function FinalOutputToast() {
  const { language } = useI18n();
  const zh = language === 'zh';
  const [final, setFinal] = useFinal();
  if (!final) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, width: 480, maxHeight: '70vh',
      background: V.panel, border: `1px solid rgba(168,85,247,.4)`, borderRadius: 12,
      boxShadow: '0 20px 60px -20px rgba(0,0,0,.8)', zIndex: 80,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${V.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: V.ok }} />
        <span style={{ fontFamily: V.sans, fontWeight: 700, fontSize: 13, color: V.fg0, flex: 1 }}>
          {zh ? '运行完成' : 'Run complete'}
        </span>
        <span style={{ fontFamily: V.mono, fontSize: 10, color: V.fg5 }}>{final.outputs.length} {zh ? '步' : 'steps'}</span>
        <button onClick={() => setFinal(null)} style={{ fontSize: 18, color: V.fg4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '12px 16px', overflow: 'auto', flex: 1, fontFamily: V.mono, fontSize: 11, color: V.fg2, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
        {final.final}
      </div>
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${V.borderSub}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => navigator.clipboard?.writeText(final.final)}
          style={btnGhost}>
          {zh ? '复制' : 'Copy'}
        </button>
        <button onClick={() => setFinal(null)} style={btnPrimary}>
          {zh ? '关闭' : 'Close'}
        </button>
      </div>
    </div>
  );
}

// ── Modal + shared input/button styles (used by topbar dialogs) ──────────────
const modalInput: React.CSSProperties = {
  width: '100%', background: V.elev1, border: `1px solid ${V.border}`, borderRadius: 6,
  padding: '8px 10px', fontFamily: V.sans, fontSize: 13, color: V.fg1, outline: 'none',
  marginTop: 4,
};
const btnPrimary: React.CSSProperties = {
  height: 32, padding: '0 16px', fontFamily: V.sans, fontSize: 13, fontWeight: 600,
  color: 'var(--accent-ink)', background: V.accent, border: 'none', borderRadius: 7, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  height: 32, padding: '0 14px', fontFamily: V.sans, fontSize: 13, fontWeight: 500,
  color: V.fg2, background: 'transparent', border: `1px solid ${V.border}`, borderRadius: 7, cursor: 'pointer',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 440, maxWidth: 'calc(100vw - 32px)', background: V.panel, border: `1px solid ${V.border}`, borderRadius: 12, padding: 20, boxShadow: '0 20px 60px -20px rgba(0,0,0,.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontFamily: V.sans, fontSize: 16, fontWeight: 700, color: V.fg0 }}>{title}</h3>
          <button onClick={onClose} style={{ fontSize: 18, color: V.fg4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6, background: 'transparent', border: `1px solid ${V.border}`,
      color: V.fg3, cursor: 'pointer', flexShrink: 0,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = V.elev2; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
      {children}
    </button>
  );
}

// ── Left Sidebar ──────────────────────────────────────────────────────────────
function LeftSidebar() {
  const [tab, setTab] = useState<'Nodes' | 'Templates' | 'Runs'>('Nodes');
  const [query, setQuery] = useState('');

  const tabs = ['Nodes', 'Templates', 'Runs'] as const;

  const filteredAgents = PALETTE_AGENTS.filter(n => matchQuery(n, query));
  const filteredGates  = PALETTE_GATES.filter(n => matchQuery(n, query));
  const noMatch = query && filteredAgents.length === 0 && filteredGates.length === 0;

  return (
    <aside style={{ background: V.panel, borderRight: `1px solid ${V.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${V.borderSub}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* tabs */}
        <div style={{ display: 'flex', gap: 2, background: V.elev1, borderRadius: 8, padding: 3 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, height: 24, fontFamily: V.mono, fontSize: 10.5, fontWeight: 600, borderRadius: 5,
              background: tab === t ? V.elev2 : 'transparent',
              color: tab === t ? V.fg1 : V.fg4,
              border: 'none', cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
        {/* search — only meaningful on Nodes tab */}
        {tab === 'Nodes' && (
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: V.fg4 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search nodes…" style={{
              width: '100%', height: 28, paddingLeft: 26, paddingRight: 28,
              background: V.elev1, border: `1px solid ${V.border}`, borderRadius: 6,
              fontFamily: V.mono, fontSize: 11, color: V.fg2, outline: 'none',
            }} />
            {query && (
              <button onClick={() => setQuery('')}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: V.fg4, cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: 1 }}>×</button>
            )}
          </div>
        )}
      </div>

      {/* palette / content */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 12 }}>
        {tab === 'Nodes' && (
          <>
            {filteredAgents.length > 0 && <PaletteSection label="Agents" nodes={filteredAgents} />}
            {filteredGates.length > 0 && <PaletteSection label="Gates · Routing" nodes={filteredGates as typeof PALETTE_AGENTS} />}
            {noMatch && (
              <div style={{ padding: '32px 18px', textAlign: 'center', fontFamily: V.mono, fontSize: 11, color: V.fg5 }}>
                No nodes match "{query}"
              </div>
            )}
          </>
        )}
        {tab === 'Templates' && <SidebarTemplatesList />}
        {tab === 'Runs' && <SidebarRunsList />}
      </div>

      {/* footer */}
      <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: `1px solid ${V.borderSub}`, display: 'flex', justifyContent: 'space-between', fontFamily: V.mono, fontSize: 9.5, color: V.fg4 }}>
        <span>v0.4.2-hack</span>
        <span>⌘K · shortcuts</span>
      </div>
    </aside>
  );
}

function matchQuery(n: { id: string; t: string; m: string }, q: string): boolean {
  if (!q) return true;
  const haystack = `${n.id} ${n.t} ${n.m}`.toLowerCase();
  return haystack.includes(q.toLowerCase());
}

function SidebarTemplatesList() {
  const [userTpls, setUserTpls] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shadowflow.user_templates.v1') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    const refresh = () => {
      try { setUserTpls(JSON.parse(localStorage.getItem('shadowflow.user_templates.v1') || '[]')); } catch { /* ignore */ }
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const seedList = Object.values(PRESETS);

  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: V.fg4, marginBottom: 8 }}>Seed</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {seedList.map(tpl => (
          <div key={tpl.alias} style={{ padding: '7px 8px', borderRadius: 6, background: V.elev1, border: `1px solid ${V.border}`, fontFamily: V.mono, fontSize: 11 }}>
            <div style={{ color: V.fg2, fontWeight: 600 }}>{tpl.title.en}</div>
            <div style={{ color: V.fg5, fontSize: 9.5, marginTop: 2 }}>{tpl.stats.agents} agents · {tpl.stats.edges} edges</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: V.fg4, marginBottom: 8 }}>Mine</div>
      {userTpls.length === 0 ? (
        <div style={{ fontFamily: V.mono, fontSize: 10.5, color: V.fg5, padding: '6px 2px' }}>empty — save current canvas to add</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {userTpls.map((tpl: { alias: string; title: string; stats: { agents: number; edges: number } }) => (
            <div key={tpl.alias} style={{ padding: '7px 8px', borderRadius: 6, background: V.accentTint, border: `1px solid rgba(168,85,247,.3)`, fontFamily: V.mono, fontSize: 11 }}>
              <div style={{ color: V.accentBr, fontWeight: 600 }}>{tpl.title}</div>
              <div style={{ color: V.fg5, fontSize: 9.5, marginTop: 2 }}>{tpl.stats.agents} · {tpl.stats.edges}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarRunsList() {
  const { history, historyIndex } = useWorkflow();
  const recent = history.slice().reverse().slice(0, 20);

  return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: V.fg4, marginBottom: 8 }}>Recent actions · {history.length}</div>
      {recent.length === 0 ? (
        <div style={{ fontFamily: V.mono, fontSize: 10.5, color: V.fg5, padding: '6px 2px' }}>no history yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {recent.map((h, i) => {
            const absoluteIdx = history.length - 1 - i;
            const isCurrent = absoluteIdx === historyIndex;
            return (
              <div key={i} style={{
                padding: '6px 8px', borderRadius: 5,
                background: isCurrent ? V.accentTint : V.elev1,
                border: `1px solid ${isCurrent ? 'rgba(168,85,247,.35)' : V.border}`,
                fontFamily: V.mono, fontSize: 10.5,
                color: isCurrent ? V.accentBr : V.fg3,
              }}>
                <div>{h.description || 'change'}</div>
                {h.timestamp && <div style={{ fontSize: 9, color: V.fg5, marginTop: 1 }}>{new Date(h.timestamp).toLocaleTimeString()}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaletteSection({ label, nodes }: { label: string; nodes: { id: string; t: string; m: string }[] }) {
  return (
    <>
      <div style={{ padding: '10px 14px 4px' }}><Label>{label}</Label></div>
      <div style={{ padding: '0 8px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {nodes.map(n => (
          <PaletteNode key={n.id} id={n.id} t={n.t} m={n.m} />
        ))}
      </div>
    </>
  );
}

function PaletteNode({ id, t, m }: { id: string; t: string; m: string }) {
  const [hov, setHov] = useState(false);
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <div draggable onDragStart={onDragStart}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: '7px 8px', borderRadius: 8,
        background: hov ? V.elev2 : V.elev1,
        border: `1px solid ${hov ? V.accent : V.border}`,
        cursor: 'grab', transition: 'all .15s',
      }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: V.fg2 }}>{t}</div>
      <div style={{ fontFamily: V.mono, fontSize: 9, color: V.fg4, marginTop: 2 }}>{m}</div>
    </div>
  );
}

// Edge style options — matches ReactFlow built-in edge types
const EDGE_STYLES: { v: SfEdgeType; label: string; glyph: string; hint: string }[] = [
  { v: 'default',    label: 'Curve',    glyph: '⌒', hint: 'bezier (n8n-style)' },
  { v: 'smoothstep', label: 'Ortho',    glyph: '⌐', hint: 'right-angle routing' },
  { v: 'straight',   label: 'Straight', glyph: '—', hint: 'direct line' },
];

function EdgeStylePicker({ edgeType, setEdgeType }: { edgeType: SfEdgeType; setEdgeType: (v: SfEdgeType) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const current = EDGE_STYLES.find(s => s.v === edgeType) ?? EDGE_STYLES[0];
  const { language } = useI18n();
  const btnLabel      = language === 'zh' ? '线条'   : 'Edges';
  const sectionLabel  = language === 'zh' ? '线条样式' : 'Edge Style';

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Edge style"
        style={{
          height: 28, padding: '0 10px', fontFamily: V.mono, fontSize: 11, fontWeight: 600, borderRadius: 6,
          background: open ? V.accentTint : V.elev1,
          color: open ? V.accentBr : V.fg2,
          border: `1px solid ${open ? 'rgba(168,85,247,.4)' : V.border}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{current.glyph}</span>
        <span>{btnLabel}</span>
        <span style={{ color: V.fg5, fontSize: 10 }}>·</span>
        <span style={{ fontSize: 10, color: V.fg4 }}>{current.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ marginLeft: 2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 200, zIndex: 40,
          background: V.panel, border: `1px solid ${V.border}`, borderRadius: 8,
          boxShadow: '0 10px 30px -10px rgba(0,0,0,.6)', padding: 4,
        }}>
          <div style={{ padding: '6px 10px 4px', fontFamily: V.mono, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: V.fg5 }}>
            {sectionLabel}
          </div>
          {EDGE_STYLES.map(s => {
            const active = edgeType === s.v;
            return (
              <button key={s.v}
                onClick={() => { setEdgeType(s.v); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 5,
                  background: active ? V.accentTint : 'transparent',
                  color: active ? V.accentBr : V.fg2,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = V.elev2; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{s.glyph}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: V.mono, fontSize: 11, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontFamily: V.mono, fontSize: 9.5, color: V.fg5, marginTop: 1 }}>{s.hint}</div>
                </div>
                {active && <span style={{ fontSize: 11, color: V.accent }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Center: toolbar + canvas + scrubber ───────────────────────────────────────
function CenterPane() {
  const [canvasTab, setCanvasTab]   = useState<'Canvas' | 'Team' | 'Matrix'>('Canvas');
  const [edgeType,  setEdgeType]    = useState<SfEdgeType>('default');
  const [zoom, setZoom]             = useState(100);
  const cvTabs = ['Canvas', 'Team', 'Matrix'] as const;

  const { nodes, edges } = useWorkflow();
  const rf = useReactFlow();

  // Track viewport zoom for the % label
  useEffect(() => {
    const tick = () => {
      const v = rf.getViewport?.();
      if (v) setZoom(Math.round(v.zoom * 100));
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [rf]);

  // Count gates (retry_gate / approval_gate) for live chip
  const gateCount = nodes.filter(n => n.data.nodeType?.endsWith('_gate')).length;
  const agentCount = nodes.filter(n => !n.data.nodeType?.endsWith('_gate') && n.data.nodeType !== 'checkpoint' && n.data.nodeType !== 'parallel' && n.data.nodeType !== 'barrier' && n.data.nodeType !== 'merge').length;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      {/* canvas toolbar */}
      <div style={{ height: 40, borderBottom: `1px solid ${V.border}`, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, background: V.panel, flexShrink: 0 }}>
        <Chip>● agents · {agentCount}</Chip>
        <Chip>→ edges · {edges.length}</Chip>
        {gateCount > 0 && <Chip>↻ gates · {gateCount}</Chip>}
        <div style={{ flex: 1 }} />

        <EdgeStylePicker edgeType={edgeType} setEdgeType={setEdgeType} />

        <div style={{ width: 1, height: 20, background: V.border, margin: '0 4px' }} />

        {/* canvas view tabs */}
        <div style={{ display: 'flex', gap: 2, background: V.elev1, borderRadius: 8, padding: 3 }}>
          {cvTabs.map(t => (
            <button key={t} onClick={() => setCanvasTab(t)} style={{
              height: 24, padding: '0 10px', fontFamily: V.mono, fontSize: 10.5, fontWeight: 600, borderRadius: 5,
              background: canvasTab === t ? V.elev2 : 'transparent',
              color: canvasTab === t ? V.fg1 : V.fg4,
              border: 'none', cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
        <IconBtn title="Zoom out" onClick={() => rf.zoomOut?.({ duration: 180 })}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
        </IconBtn>
        <Chip>{zoom}%</Chip>
        <IconBtn title="Zoom in" onClick={() => rf.zoomIn?.({ duration: 180 })}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5v14"/></svg>
        </IconBtn>
        <IconBtn title="Fit view" onClick={() => rf.fitView?.({ padding: 0.2, duration: 260 })}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h7v2H5v5H3zm18 0v7h-2V5h-5V3zM3 21v-7h2v5h5v2zm18 0h-7v-2h5v-5h2z"/></svg>
        </IconBtn>
      </div>

      {/* canvas / team / matrix */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: V.bg }}>
        <div style={{ position: 'absolute', inset: 0, display: canvasTab === 'Canvas' ? 'block' : 'none' }}>
          <WorkflowCanvas edgeType={edgeType} withProvider={false} />
        </div>
        {canvasTab === 'Team'   && <TeamView />}
        {canvasTab === 'Matrix' && <MatrixStub />}
      </div>

      {/* goal bar */}
      <GoalBar />

      {/* scrubber */}
      <Scrubber />
    </section>
  );
}

function TeamView() {
  const { nodes } = useWorkflow();
  if (nodes.length === 0) {
    return <div style={{ padding: 48, textAlign: 'center', color: V.fg5, fontFamily: V.mono, fontSize: 12 }}>No agents on canvas.</div>;
  }
  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {nodes.map(n => {
          const d = n.data;
          const name = typeof d.name === 'string' ? d.name : (d.name as Record<string,string>)?.en ?? 'Node';
          const desc = typeof d.description === 'string' ? d.description : (d.description as Record<string,string>)?.en ?? '';
          const model = (d.config as Record<string, unknown>)?.model as string | undefined;
          return (
            <div key={n.id} style={{ padding: '14px 16px', borderRadius: 12, background: V.panel, border: `1px solid ${V.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${d.color || V.accent}22`, border: `1.5px solid ${d.color || V.accent}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  {d.icon || '⚙'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: V.fg0 }}>{name}</div>
                  <div style={{ fontFamily: V.mono, fontSize: 10, color: V.fg5 }}>{d.nodeType}</div>
                </div>
              </div>
              {desc && <div style={{ fontSize: 12, color: V.fg4, lineHeight: 1.5, marginBottom: 8 }}>{desc}</div>}
              {model && <div style={{ fontFamily: V.mono, fontSize: 10, color: V.accentBr }}>model · {model}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatrixStub() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: V.fg4, fontFamily: V.mono, fontSize: 12 }}>
      Full policy matrix lives in the right panel →
      <br/><span style={{ color: V.fg5, fontSize: 10 }}>(INSPECTOR / MATRIX / RUN LOG)</span>
    </div>
  );
}

function Scrubber() {
  const { undo, redo, historyIndex, history, nodes, edges, isRunning, runProgress } = useWorkflow();
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const doExport = () => {
    const json = exportWorkflowJSON({ nodes, edges });
    navigator.clipboard?.writeText(json).catch(() => {/* ignore */});
  };

  const scrubBtn = (label: string, onClick: () => void, disabled?: boolean) => (
    <button key={label} onClick={onClick} disabled={disabled}
      style={{
        fontFamily: V.mono, fontSize: 10,
        color: disabled ? V.fg5 : V.fg3,
        padding: '3px 8px', borderRadius: 5,
        border: `1px solid ${V.border}`, background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .5 : 1,
      }}>
      {label}
    </button>
  );

  return (
    <div style={{ height: 110, background: V.panel, borderTop: `1px solid ${V.border}`, padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Label>Checkpoint Scrubber</Label>
          <Chip>history · {history.length}</Chip>
          {isRunning ? (
            <span style={{ fontFamily: V.mono, fontSize: 9.5, fontWeight: 700, color: V.run, padding: '2px 7px', borderRadius: 999, background: 'var(--status-run-tint)', border: `1px solid rgba(59,130,246,.35)` }}>● LIVE</span>
          ) : (
            <span style={{ fontFamily: V.mono, fontSize: 9.5, fontWeight: 700, color: V.fg5, padding: '2px 7px', borderRadius: 999, background: V.elev2, border: `1px solid ${V.border}` }}>○ idle</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {scrubBtn('⏮ rewind',     () => canUndo && undo(), !canUndo)}
          {scrubBtn('▶ resume',     () => canRedo && redo(), !canRedo)}
          {scrubBtn('⎘ export',     doExport)}
        </div>
      </div>

      {/* track */}
      <div style={{ position: 'relative', height: 32, background: V.elev1, border: `1px solid ${V.border}`, borderRadius: 6 }}>
        {/* ticks */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 8px' }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 8, borderRight: i < 11 ? `1px solid ${V.border}` : undefined, opacity: .5 }} />
          ))}
        </div>
        {/* checkpoints */}
        {CHECKPOINTS.map(cp => (
          <div key={cp.label} style={{ position: 'absolute', top: 0, bottom: 0, left: `${cp.pct}%`, width: 2, background: cp.kind === 'reject' ? V.reject : cp.kind === 'warn' ? V.warn : V.ok }}>
            <div style={{ position: 'absolute', top: -16, transform: 'translateX(-50%)', fontFamily: V.mono, fontSize: 8.5, color: cp.kind === 'reject' ? V.reject : cp.kind === 'warn' ? V.warn : V.fg3, whiteSpace: 'nowrap' }}>{cp.label}</div>
          </div>
        ))}
        {/* cursor */}
        <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${isRunning ? runProgress : 82}%`, width: 2, background: V.accent, boxShadow: '0 0 0 1px var(--accent), 0 0 8px -2px rgba(168,85,247,.6)', transition: 'left 120ms linear' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: V.mono, fontSize: 9.5, color: V.fg4 }}>t = 00:08:52 · checkpoint cp_08_49 · <span style={{ color: V.accentBr }}>cursor here</span> · 6 checkpoints · 3 forks saved</span>
        <span style={{ fontFamily: V.mono, fontSize: 9.5, color: V.fg4 }}>tokens 3.1k · $0.142 · avg SSE 87ms</span>
      </div>
    </div>
  );
}

// ── Right Inspector ───────────────────────────────────────────────────────────
function RightInspector() {
  const [tab, setTab] = useState<'Inspector' | 'Matrix' | 'Run log' | 'YAML'>('Inspector');
  const tabs = ['Inspector', 'Matrix', 'Run log', 'YAML'] as const;
  const { nodes, selectedNodeIds, updateNode } = useWorkflow();

  // P1-α fix: do NOT call useYamlSync() here — YamlSyncBridge already mounts it.
  // Calling it twice creates two Direction A + Direction B effect instances, causing
  // double setWorkflow per keystroke and doubling saveToHistory entries.
  // Instead, derive validateNow locally from the store + serializer.
  const { yamlText, setYamlError } = useYamlEditorStore();
  const validateNow = useCallback((): string | null => {
    const result = parseWorkflowYaml(yamlText);
    if (!result.ok) { setYamlError(result.error); return result.error; }
    setYamlError(null);
    return null;
  }, [yamlText, setYamlError]);

  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find(n => n.id === selectedNodeIds[0])
    : undefined;

  return (
    <aside style={{ background: V.panel, borderLeft: `1px solid ${V.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${V.border}`, flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, height: 40, fontFamily: V.mono, fontSize: 9.5, fontWeight: 700,
            letterSpacing: '.08em', textTransform: 'uppercase' as const,
            color: tab === t ? V.fg1 : V.fg4, background: 'transparent', border: 'none',
            borderBottom: tab === t ? `2px solid ${V.accent}` : '2px solid transparent',
            cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: tab === 'YAML' ? 'hidden' : 'auto' }}>
        {tab === 'Inspector' && <InspectorTab node={selectedNode} updateNode={updateNode} />}
        {tab === 'Matrix' && <MatrixTab />}
        {tab === 'Run log' && <RunLogTab />}
        {tab === 'YAML' && (
          <Suspense fallback={
            <div style={{ padding: 24, fontFamily: V.mono, fontSize: 11, color: V.fg5 }}>
              Loading editor…
            </div>
          }>
            <YamlEditor height="100%" onBlur={validateNow} />
          </Suspense>
        )}
      </div>
    </aside>
  );
}

function InspectorSection({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid var(--border-subtle)`, ...style }}>
      {children}
    </div>
  );
}

function SectionHdr({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Label>{left}</Label>
      {right && <span style={{ fontFamily: V.mono, fontSize: 10, color: V.fg4 }}>{right}</span>}
    </div>
  );
}

function KV({ k, v, vColor }: { k: string; v: string; vColor?: string }) {
  return (
    <>
      <span style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: V.fg4 }}>{k}</span>
      <span style={{ fontFamily: V.mono, fontSize: 11, color: vColor || V.fg1 }}>{v}</span>
    </>
  );
}

function CfgInput({ label, value, onChange, type = 'text', step, readOnly, style: styleProp }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; step?: number; readOnly?: boolean; style?: React.CSSProperties;
}) {
  return (
    <>
      <span style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: V.fg4, paddingTop: 4 }}>{label}</span>
      <input
        type={type} step={step} value={value} readOnly={readOnly}
        onChange={e => onChange(e.target.value)}
        style={styleProp ?? {
          width: '100%', height: 26, background: V.elev1, border: `1px solid ${V.border}`,
          borderRadius: 5, fontFamily: V.mono, fontSize: 11, color: V.fg1,
          padding: '0 8px', outline: 'none',
        }}
        onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = V.accent; }}
        onBlur={e => { if (!readOnly) e.currentTarget.style.borderColor = V.border; }}
      />
    </>
  );
}

function CfgSelect({ label, value, options, onChange }: {
  label: string; value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <>
      <span style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: V.fg4, paddingTop: 4 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', height: 26, background: V.elev1, border: `1px solid ${V.border}`,
        borderRadius: 5, fontFamily: V.mono, fontSize: 11, color: V.fg1,
        padding: '0 6px', outline: 'none', cursor: 'pointer',
      }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </>
  );
}

const STATUS_CHIP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  idle:    { label: '○ idle',      color: 'var(--fg-4)',       bg: 'var(--bg-elev-2)',          border: 'var(--border)' },
  running: { label: '● streaming', color: 'var(--status-run)', bg: 'var(--status-run-tint)',    border: 'rgba(59,130,246,.35)' },
  success: { label: '✓ done',      color: 'var(--status-ok)',  bg: 'var(--status-ok-tint)',     border: 'rgba(16,185,129,.35)' },
  error:   { label: '✗ error',     color: 'var(--status-reject)', bg: 'var(--status-reject-tint)', border: 'rgba(239,68,68,.35)' },
  warning: { label: '↻ retrying',  color: 'var(--status-warn)', bg: 'var(--status-warn-tint)',  border: 'rgba(245,158,11,.35)' },
};

// Draft state type for config editing
type CfgDraft = { model: string; temperature: string; maxTokens: string; policy: string; retryLimit: string; systemPrompt: string };

function toDraft(cfg: Record<string, unknown>): CfgDraft {
  return {
    model:        String(cfg.model        ?? 'claude-sonnet-4'),
    temperature:  String(cfg.temperature  ?? 0.2),
    maxTokens:    String(cfg.maxTokens    ?? 8192),
    policy:       String(cfg.policy       ?? 'none'),
    retryLimit:   String(cfg.retryLimit   ?? 3),
    systemPrompt: String(cfg.systemPrompt ?? ''),
  };
}

function InspectorTab({ node, updateNode }: {
  node: WorkflowNode | undefined;
  updateNode: (id: string, updates: Partial<WorkflowNode>) => void;
}) {
  // P2-δ fix: pull nodes/edges so ApprovalGateForm can receive roles + downstreamIds
  const { nodes: allNodes, edges: allEdges } = useWorkflow();

  // Roles = display labels of all agent-category nodes in the current workflow
  const agentRoles = useMemo(() =>
    allNodes
      .filter(n => n.data.category === 'agent')
      .map(n => {
        const name = n.data.name;
        return typeof name === 'string' ? name : (name as Record<string, string>)?.en ?? n.id;
      }),
    [allNodes],
  );

  // Downstream ids = target node ids connected by outgoing edges from the selected node
  const downstreamIds = useMemo(() => {
    if (!node) return [];
    return allEdges.filter(e => e.source === node.id).map(e => e.target);
  }, [node?.id, allEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CfgDraft>({ model: '', temperature: '', maxTokens: '', policy: 'none', retryLimit: '3', systemPrompt: '' });
  const [editName, setEditName] = useState('');

  // Sync draft when node selection changes
  useEffect(() => {
    if (!node) { setEditing(false); return; }
    const cfg = node.data.config || {};
    setDraft(toDraft(cfg));
    const n = node.data.name;
    setEditName(typeof n === 'string' ? n : (n as Record<string, string>)?.['en'] ?? 'Node');
    setEditing(false);
  }, [node?.id]);

  const handleSave = () => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...node.data,
        name: editName,
        config: {
          ...node.data.config,
          model:        draft.model,
          temperature:  parseFloat(draft.temperature) || 0,
          maxTokens:    parseInt(draft.maxTokens) || 4096,
          policy:       draft.policy,
          retryLimit:   parseInt(draft.retryLimit) || 0,
          systemPrompt: draft.systemPrompt,
        },
      },
    });
    setEditing(false);
  };

  const handleDiscard = () => {
    if (!node) return;
    const cfg = node.data.config || {};
    setDraft(toDraft(cfg));
    const n = node.data.name;
    setEditName(typeof n === 'string' ? n : (n as Record<string, string>)?.['en'] ?? 'Node');
    setEditing(false);
  };

  // No selection placeholder
  if (!node) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: V.elev2, border: `1px solid ${V.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: V.fg5 }}>○</div>
        <div style={{ fontFamily: V.mono, fontSize: 11, color: V.fg5 }}>Select a node to inspect</div>
        <div style={{ fontFamily: V.mono, fontSize: 10, color: V.fg5, opacity: .6 }}>Click any node on the canvas</div>
      </div>
    );
  }

  // P2-δ fix: approval_gate nodes get a dedicated config form (AC2)
  if (node.data.nodeType === 'approval_gate') {
    return (
      <ApprovalGateForm
        node={node}
        roles={agentRoles}
        downstreamIds={downstreamIds}
        onUpdate={(id, config) =>
          updateNode(id, { data: { ...node.data, config } })
        }
      />
    );
  }

  const d = node.data;
  const nameDisplay = typeof d.name === 'string' ? d.name : (d.name as Record<string, string>)?.['en'] ?? 'Node';
  const desc = typeof d.description === 'string' ? d.description : (d.description as Record<string, string>)?.['en'] ?? '';
  const nodeColor = d.color || '#A855F7';
  const status = d.status || 'idle';
  const statusChip = STATUS_CHIP[status] ?? STATUS_CHIP.idle;

  const fieldStyle: React.CSSProperties = {
    width: '100%', height: 26, background: editing ? V.elev1 : 'transparent',
    border: editing ? `1px solid ${V.border}` : '1px solid transparent',
    borderRadius: 5, fontFamily: V.mono, fontSize: 11, color: editing ? V.fg1 : V.fg2,
    padding: '0 8px', outline: 'none', transition: 'all .15s',
    cursor: editing ? 'text' : 'default',
  };

  return (
    <>
      {/* Node header */}
      <InspectorSection>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${nodeColor}22`, border: `1.5px solid ${nodeColor}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {d.icon || '⚙'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ width: '100%', background: V.elev1, border: `1px solid ${V.accent}`, outline: 'none', borderRadius: 5, fontSize: 14, fontWeight: 700, color: V.fg0, fontFamily: V.sans, padding: '2px 6px' }} />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 700, color: V.fg0 }}>{nameDisplay}</div>
            )}
            <div style={{ fontFamily: V.mono, fontSize: 10, color: V.fg5, marginTop: 2 }}>
              {d.nodeType} · <span style={{ color: V.fg5 }}>{node.id.slice(0, 18)}</span>
            </div>
          </div>
          <span style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, flexShrink: 0, background: statusChip.bg, color: statusChip.color, border: `1px solid ${statusChip.border}` }}>
            {statusChip.label}
          </span>
        </div>
        {desc && (
          <div style={{ fontSize: 12, color: V.fg4, marginTop: 10, lineHeight: 1.55 }}>{desc}</div>
        )}
      </InspectorSection>

      {/* Model · Config */}
      <InspectorSection>
        <SectionHdr left="Model · Config" right={
          !editing
            ? <button onClick={() => setEditing(true)} style={{ fontFamily: V.mono, fontSize: 10, color: V.accentBr, padding: '2px 8px', borderRadius: 5, border: `1px solid rgba(168,85,247,.4)`, background: V.accentTint, cursor: 'pointer' }}>Edit</button>
            : <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={handleDiscard} style={{ fontFamily: V.mono, fontSize: 10, color: V.fg4, padding: '2px 8px', borderRadius: 5, border: `1px solid ${V.border}`, background: 'transparent', cursor: 'pointer' }}>Discard</button>
                <button onClick={handleSave} style={{ fontFamily: V.mono, fontSize: 10, color: '#fff', padding: '2px 8px', borderRadius: 5, border: 'none', background: V.accent, cursor: 'pointer', fontWeight: 700 }}>Save</button>
              </div>
        } />
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px 10px', alignItems: 'center' }}>
          <CfgInput label="Model"   value={draft.model}       onChange={v => setDraft(p => ({ ...p, model: v }))}       readOnly={!editing} style={fieldStyle} />
          <CfgInput label="Temp"    value={draft.temperature} onChange={v => setDraft(p => ({ ...p, temperature: v }))} readOnly={!editing} style={fieldStyle} type="number" step={0.1} />
          <CfgInput label="Max Tok" value={draft.maxTokens}   onChange={v => setDraft(p => ({ ...p, maxTokens: v }))}   readOnly={!editing} style={fieldStyle} type="number" />
          {editing ? (
            <CfgSelect label="Policy" value={draft.policy} onChange={v => setDraft(p => ({ ...p, policy: v }))} options={[
              { v: 'none',    l: 'none' },
              { v: 'strict',  l: 'Matrix · strict' },
              { v: 'lenient', l: 'Matrix · lenient' },
            ]} />
          ) : (
            <>
              <span style={{ fontFamily: V.mono, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: V.fg4 }}>Policy</span>
              <span style={{ fontFamily: V.mono, fontSize: 11, color: draft.policy !== 'none' ? V.accentBr : V.fg3 }}>
                {draft.policy === 'none' ? 'none' : `Matrix · ${draft.policy}`}
              </span>
            </>
          )}
          <CfgInput label="Retry" value={draft.retryLimit} onChange={v => setDraft(p => ({ ...p, retryLimit: v }))} readOnly={!editing} style={fieldStyle} type="number" />
        </div>
      </InspectorSection>

      {/* System Prompt */}
      <InspectorSection>
        <SectionHdr left="System Prompt" />
        <textarea
          readOnly={!editing}
          value={draft.systemPrompt}
          onChange={e => setDraft(p => ({ ...p, systemPrompt: e.target.value }))}
          placeholder={editing ? 'Enter system prompt…' : '(empty — click Edit to set)'}
          style={{
            width: '100%', minHeight: 88, background: V.elev1, border: `1px solid ${editing ? V.border : V.borderSub}`,
            borderRadius: 6, fontFamily: V.mono, fontSize: 11, color: V.fg3, lineHeight: 1.6,
            padding: '8px 10px', outline: 'none', resize: editing ? 'vertical' : 'none', cursor: editing ? 'text' : 'default',
          }}
          onFocus={e => { if (editing) e.currentTarget.style.borderColor = V.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = editing ? V.border : V.borderSub; }}
        />
      </InspectorSection>

      {/* Provider · Fallback — P2-α fix: ProviderPanel wired for all agent nodes (AC1) */}
      <InspectorSection>
        <SectionHdr left="Provider · Fallback" />
        <ProviderPanel
          node={node}
          onUpdate={(id, patch) =>
            updateNode(id, { data: { ...node.data, ...patch } })
          }
        />
      </InspectorSection>

      {/* Last Output */}
      {(d as { lastOutput?: string }).lastOutput && (
        <InspectorSection>
          <SectionHdr left="Last Output" right={<span style={{ fontFamily: V.mono, fontSize: 9.5, color: V.ok }}>● latest</span>} />
          <div style={{ fontFamily: V.mono, fontSize: 11, color: V.fg2, lineHeight: 1.55, background: V.elev1, borderRadius: 6, padding: '10px 12px', border: `1px solid ${V.border}`, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
            {(d as { lastOutput?: string }).lastOutput}
          </div>
        </InspectorSection>
      )}

      {/* I/O ports */}
      <InspectorSection>
        <SectionHdr left="I/O Ports" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(d.inputs || []).map(inp => (
            <div key={inp.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: V.mono, fontSize: 9, color: V.fg5 }}>←</span>
              <span style={{ fontFamily: V.mono, fontSize: 10, color: V.fg3 }}>{inp.name}</span>
              <span style={{ fontFamily: V.mono, fontSize: 9, color: V.fg5, marginLeft: 'auto' }}>{inp.type}</span>
              {inp.required && <span style={{ fontFamily: V.mono, fontSize: 8, color: V.warn, background: 'var(--status-warn-tint)', padding: '1px 4px', borderRadius: 3 }}>req</span>}
            </div>
          ))}
          {(d.outputs || []).map(out => (
            <div key={out.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: V.mono, fontSize: 9, color: nodeColor }}>→</span>
              <span style={{ fontFamily: V.mono, fontSize: 10, color: V.fg3 }}>{out.name}</span>
              <span style={{ fontFamily: V.mono, fontSize: 9, color: V.fg5, marginLeft: 'auto' }}>{out.type}</span>
            </div>
          ))}
          {(d.inputs || []).length === 0 && (d.outputs || []).length === 0 && (
            <span style={{ fontFamily: V.mono, fontSize: 10, color: V.fg5 }}>no ports defined</span>
          )}
        </div>
      </InspectorSection>
    </>
  );
}

const MATRIX_AGENTS = ['Planner', 'Writer', 'Researcher', 'Critic', 'Advisor', 'Editor'];

// Default policy matrix (read-only defaults; user edits override them)
const DEFAULT_MATRIX: Record<string, string> = {
  'Writer-Critic': 'allow', 'Writer-Advisor': 'gate', 'Writer-Editor': 'deny',
  'Researcher-Writer': 'allow', 'Critic-Advisor': 'allow', 'Advisor-Writer': 'allow',
  'Advisor-Editor': 'allow', 'Editor-Planner': 'deny',
};

// Click cycle order: none → allow → gate → deny → none
const CYCLE: Record<string, string> = { '': 'allow', allow: 'gate', gate: 'deny', deny: '' };

type MatrixRules = Record<string, string>;

function MatrixTab() {
  const [saved, setSaved]     = useState<MatrixRules>(DEFAULT_MATRIX);
  const [draft, setDraft]     = useState<MatrixRules>(DEFAULT_MATRIX);
  const [editing, setEditing] = useState(false);

  const activeMatrix = editing ? draft : saved;
  const getRule = (from: string, to: string) => {
    if (from === to) return 'self';
    return activeMatrix[`${from}-${to}`] || '';
  };

  const cycleCell = (from: string, to: string) => {
    if (!editing || from === to) return;
    const key = `${from}-${to}`;
    const cur = draft[key] || '';
    const next = CYCLE[cur] ?? '';
    setDraft(p => {
      const c = { ...p };
      if (next === '') delete c[key]; else c[key] = next;
      return c;
    });
  };

  const handleEdit    = () => { setDraft({ ...saved }); setEditing(true); };
  const handleDiscard = () => { setDraft({ ...saved }); setEditing(false); };
  const handleSave    = () => { setSaved({ ...draft }); setEditing(false); };
  const handleReset   = () => { setDraft({ ...DEFAULT_MATRIX }); };

  const isDirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);
  const diffFromDefault = JSON.stringify(activeMatrix) !== JSON.stringify(DEFAULT_MATRIX);

  return (
    <div style={{ padding: '14px 14px' }}>
      <SectionHdr left="Full Policy Matrix" right={
        !editing
          ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: V.mono, fontSize: 9.5, color: diffFromDefault ? V.accentBr : V.fg5 }}>
                {diffFromDefault ? 'custom · 6×6' : 'default · 6×6'}
              </span>
              <button onClick={handleEdit} style={{ fontFamily: V.mono, fontSize: 10, color: V.accentBr, padding: '2px 8px', borderRadius: 5, border: `1px solid rgba(168,85,247,.4)`, background: V.accentTint, cursor: 'pointer' }}>Edit</button>
            </div>
          : <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={handleReset}   style={{ fontFamily: V.mono, fontSize: 10, color: V.fg4, padding: '2px 8px', borderRadius: 5, border: `1px solid ${V.border}`, background: 'transparent', cursor: 'pointer' }}>Reset</button>
              <button onClick={handleDiscard} style={{ fontFamily: V.mono, fontSize: 10, color: V.fg4, padding: '2px 8px', borderRadius: 5, border: `1px solid ${V.border}`, background: 'transparent', cursor: 'pointer' }}>Discard</button>
              <button onClick={handleSave}    disabled={!isDirty} style={{ fontFamily: V.mono, fontSize: 10, color: isDirty ? '#fff' : V.fg5, padding: '2px 8px', borderRadius: 5, border: 'none', background: isDirty ? V.accent : V.elev2, cursor: isDirty ? 'pointer' : 'not-allowed', fontWeight: 700 }}>Save</button>
            </div>
      } />

      {editing && (
        <div style={{ marginBottom: 10, padding: '6px 8px', borderRadius: 5, background: V.accentTint, border: `1px solid rgba(168,85,247,.3)`, fontFamily: V.mono, fontSize: 9.5, color: V.accentBr }}>
          ✎ click a cell to cycle: · → ✓ → ⊞ → ✗ → ·
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 2, fontFamily: V.mono, fontSize: 9.5 }}>
          <thead>
            <tr>
              <th style={{ padding: 4, background: 'transparent' }} />
              {MATRIX_AGENTS.map(a => (
                <th key={a} style={{ padding: '4px 6px', textAlign: 'center', background: V.elev2, border: `1px solid ${V.border}`, borderRadius: 4, color: V.fg3, fontWeight: 700, fontSize: 9 }}>{a.slice(0, 4)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_AGENTS.map(from => (
              <tr key={from}>
                <th style={{ padding: '4px 6px', background: V.elev2, border: `1px solid ${V.border}`, borderRadius: 4, color: V.fg3, fontWeight: 700, fontSize: 9, textAlign: 'right' }}>{from.slice(0, 4)}</th>
                {MATRIX_AGENTS.map(to => {
                  const rule = getRule(from, to);
                  const clickable = editing && from !== to;
                  const defaultRule = DEFAULT_MATRIX[`${from}-${to}`] || '';
                  const wasEdited = editing && (draft[`${from}-${to}`] || '') !== defaultRule;
                  return (
                    <td key={to}
                      onClick={() => cycleCell(from, to)}
                      style={{
                        padding: '4px 5px', textAlign: 'center', borderRadius: 4,
                        border: `1px solid ${wasEdited ? 'rgba(168,85,247,.5)' : V.border}`,
                        background: rule === 'allow' ? 'var(--status-ok-tint)' : rule === 'deny' ? 'var(--status-reject-tint)' : rule === 'gate' ? V.accentTint : rule === 'self' ? V.elev2 : V.elev1,
                        color: rule === 'allow' ? V.ok : rule === 'deny' ? V.reject : rule === 'gate' ? V.accentBr : V.fg5,
                        fontSize: 9.5,
                        cursor: clickable ? 'pointer' : 'default',
                        transition: 'transform 80ms',
                      }}
                      onMouseEnter={e => { if (clickable) e.currentTarget.style.transform = 'scale(1.12)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      {rule === 'allow' ? '✓' : rule === 'deny' ? '✗' : rule === 'gate' ? '⊞' : rule === 'self' ? '—' : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
        {[
          { color: V.ok,       label: '✓ allow' },
          { color: V.reject,   label: '✗ deny' },
          { color: V.accentBr, label: '⊞ gate (human)' },
          { color: V.fg4,      label: '· no rule' },
        ].map(({ color, label }) => (
          <span key={label} style={{ fontFamily: V.mono, fontSize: 9.5, color }}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function RunLogTab() {
  const entries = [
    { ts: '08:49:01', type: 'ok',  msg: 'Planner · succeeded · cp_plan.done' },
    { ts: '08:51:14', type: 'ok',  msg: 'LitReviewer · 12 sources · cp_research' },
    { ts: '08:51:22', type: 'ok',  msg: 'DataScout · 3 datasets · cp_research' },
    { ts: '08:53:40', type: 'run', msg: 'SectionWriter · streaming · r2/3' },
    { ts: '08:52:11', type: 'rej', msg: 'Advisor REJECT · missing baseline Zhang(2021)' },
    { ts: '08:52:11', type: 'warn',msg: '↻ retry_gate 2/3 · rollback cp_draft_v2' },
  ];
  const color = (t: string) => t === 'ok' ? V.ok : t === 'rej' ? V.reject : t === 'warn' ? V.warn : V.run;
  return (
    <div style={{ padding: '12px 14px' }}>
      <SectionHdr left="Run Log" right="run_08_49" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 8px', borderRadius: 6, background: V.elev1, border: `1px solid ${V.border}` }}>
            <span style={{ fontFamily: V.mono, fontSize: 9.5, color: V.fg5, flexShrink: 0, paddingTop: 1 }}>{e.ts}</span>
            <span style={{ fontFamily: V.mono, fontSize: 10.5, color: color(e.type), lineHeight: 1.4 }}>{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top Bar ───────────────────────────────────────────────────────────────────
function EditorTopBar({ onBack, lang, onToggleLang, templateTitle }: { onBack: () => void; lang: string; onToggleLang: () => void; templateTitle?: string }) {
  const zh = lang === 'CN';
  const { nodes, edges, setNodes, addEdge, clearCanvas } = useWorkflow();
  const [saveOpen, setSaveOpen]       = useState(false);
  const [importOpen, setImportOpen]   = useState(false);
  const [saveName,   setSaveName]     = useState(templateTitle || '');
  const [saveDesc,   setSaveDesc]     = useState('');
  const [importText, setImportText]   = useState('');
  const [importErr,  setImportErr]    = useState<string | null>(null);
  const [dirty,      setDirty]        = useState(false);
  const [flashOk,    setFlashOk]      = useState<string | null>(null);
  // P2-β fix: SecretsModal visibility
  const [showSecrets, setShowSecrets] = useState(false);

  // Mark as dirty when user modifies anything after the initial template load
  const initialCountRef = React.useRef({ n: nodes.length, e: edges.length });
  useEffect(() => {
    initialCountRef.current = { n: nodes.length, e: edges.length };
    setDirty(false);
  }, [templateTitle]);
  useEffect(() => {
    if (nodes.length !== initialCountRef.current.n || edges.length !== initialCountRef.current.e) {
      setDirty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  useEffect(() => { setSaveName(templateTitle || ''); }, [templateTitle]);

  const doSave = () => {
    if (!saveName.trim()) return;
    saveUserTemplate({ title: saveName.trim(), description: saveDesc.trim(), nodes, edges });
    setSaveOpen(false);
    setDirty(false);
    setFlashOk(zh ? '已保存到"我的模板"' : 'Saved to My Templates');
    setTimeout(() => setFlashOk(null), 2200);
  };

  const doImport = () => {
    const parsed = parseWorkflowJSON(importText);
    if (!parsed) { setImportErr(zh ? 'JSON 格式无效' : 'Invalid workflow JSON'); return; }
    clearCanvas();
    if (parsed.nodes.length) setNodes(parsed.nodes);
    parsed.edges.forEach(addEdge);
    setImportOpen(false);
    setImportText(''); setImportErr(null);
    setFlashOk(zh ? '导入成功' : 'Imported');
    setTimeout(() => setFlashOk(null), 2200);
  };

  const doExport = () => {
    const json = exportWorkflowJSON({ title: templateTitle, nodes, edges });
    navigator.clipboard?.writeText(json).then(() => {
      setFlashOk(zh ? '已复制到剪贴板' : 'Copied to clipboard');
      setTimeout(() => setFlashOk(null), 2200);
    }).catch(() => {/* ignore */});
  };

  return (
    <div style={{ height: 44, background: V.panel, borderBottom: `1px solid ${V.border}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', flexShrink: 0, zIndex: 50, position: 'relative' }}>
      {/* logo + back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
        <button onClick={onBack} style={{ fontFamily: V.mono, fontSize: 11, color: V.fg4, background: 'transparent', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: 5 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg2; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = V.fg4; }}>
          ← back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: V.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: V.sans, fontWeight: 900, fontSize: 14, color: 'var(--accent-ink)', letterSpacing: '-.03em' }}>S</div>
          <span style={{ fontFamily: V.sans, fontWeight: 700, fontSize: 14, color: V.fg1, letterSpacing: '-.02em' }}>ShadowFlow</span>
        </div>
      </div>

      {/* breadcrumb */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: V.mono, fontSize: 11, color: V.fg4 }}>
        <span>{zh ? '模板' : 'Templates'}</span>
        <span style={{ color: V.fg5 }}>/</span>
        <span style={{ color: V.fg2, fontWeight: 600 }}>{templateTitle || 'Untitled'}</span>
        {dirty && <span title={zh ? '未保存' : 'unsaved changes'} style={{ width: 6, height: 6, borderRadius: '50%', background: V.warn, boxShadow: `0 0 6px ${V.warn}` }} />}
      </nav>

      {/* flash toast */}
      {flashOk && (
        <span style={{ marginLeft: 12, fontFamily: V.mono, fontSize: 11, color: V.ok, background: 'var(--status-ok-tint)', padding: '3px 8px', borderRadius: 5, border: `1px solid rgba(16,185,129,.35)` }}>
          ✓ {flashOk}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {/* right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Chip accent>⊞ Policy Matrix · strict</Chip>
        <Chip accent>⑂ fork: main</Chip>

        <button onClick={() => setSaveOpen(true)}
          title={zh ? '保存为我的模板' : 'Save as my template'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: V.mono, fontSize: 11, color: dirty ? V.accentBr : V.fg3, background: dirty ? V.accentTint : 'transparent', border: `1px solid ${dirty ? 'rgba(168,85,247,.4)' : V.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          {zh ? '保存' : 'Save'}
        </button>

        <button onClick={doExport}
          title={zh ? '导出 JSON 到剪贴板' : 'Export JSON to clipboard'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: V.mono, fontSize: 11, color: V.fg3, background: 'transparent', border: `1px solid ${V.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v10m0 0-4-4m4 4 4-4M4 20h16"/></svg>
          {zh ? '导出' : 'Export'}
        </button>

        <button onClick={() => setImportOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: V.mono, fontSize: 11, color: V.fg3, background: 'transparent', border: `1px solid ${V.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10m0 0 4 4m-4-4-4 4M4 4h16"/></svg>
          Import CID
        </button>
        <button onClick={onToggleLang}
          title={lang === 'EN' ? 'Switch to Chinese' : '切换到英文'}
          style={{ fontFamily: V.mono, fontSize: 11, fontWeight: 600, color: V.fg2, background: V.elev1, border: `1px solid ${V.border}`, borderRadius: 6, padding: '4px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ padding: '2px 6px', borderRadius: 4, background: lang === 'EN' ? V.accentTint : 'transparent', color: lang === 'EN' ? V.accentBr : V.fg4 }}>EN</span>
          <span style={{ padding: '2px 6px', borderRadius: 4, background: zh ? V.accentTint : 'transparent', color: zh ? V.accentBr : V.fg4 }}>中</span>
        </button>
        {/* P2-β fix: BYOK keys modal trigger (S1/AR44 — keys never leave browser) */}
        <button onClick={() => setShowSecrets(true)}
          title={zh ? 'API 密钥管理 (BYOK)' : 'API Keys (BYOK)'}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: V.mono, fontSize: 11, color: V.fg3, background: 'transparent', border: `1px solid ${V.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
          🔑 {zh ? '密钥' : 'Keys'}
        </button>
        <IconBtn title="Settings">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </IconBtn>
        <RunButton lang={lang} />
      </div>

      {/* Save-as-template modal */}
      {saveOpen && (
        <Modal onClose={() => setSaveOpen(false)} title={zh ? '保存为我的模板' : 'Save as My Template'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label>{zh ? '名称' : 'Name'}</Label>
              <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)}
                placeholder={zh ? '例：学术论文 v2' : 'e.g. Academic Paper v2'}
                style={modalInput} />
            </div>
            <div>
              <Label>{zh ? '描述（可选）' : 'Description (optional)'}</Label>
              <textarea value={saveDesc} onChange={e => setSaveDesc(e.target.value)}
                placeholder={zh ? '简短说明团队用途' : 'Short description of this team'}
                style={{ ...modalInput, height: 70, resize: 'vertical' }} />
            </div>
            <div style={{ fontFamily: V.mono, fontSize: 10.5, color: V.fg4, padding: '8px 10px', borderRadius: 6, background: V.elev1, border: `1px solid ${V.borderSub}` }}>
              {nodes.length} {zh ? '个节点' : 'nodes'} · {edges.length} {zh ? '条连线' : 'edges'}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setSaveOpen(false)} style={btnGhost}>{zh ? '取消' : 'Cancel'}</button>
              <button onClick={doSave} disabled={!saveName.trim()} style={{ ...btnPrimary, opacity: saveName.trim() ? 1 : .5, cursor: saveName.trim() ? 'pointer' : 'not-allowed' }}>
                {zh ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* SecretsModal — P2-β fix: BYOK key management (S1/AR44) */}
      {showSecrets && (
        <SecretsModal open={showSecrets} onClose={() => setShowSecrets(false)} />
      )}

      {/* Import modal */}
      {importOpen && (
        <Modal onClose={() => { setImportOpen(false); setImportErr(null); }} title={zh ? '从 CID / JSON 导入' : 'Import from CID / JSON'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: V.mono, fontSize: 11, color: V.fg4, lineHeight: 1.55 }}>
              {zh
                ? '粘贴 0G CID 或工作流 JSON（schema: shadowflow-workflow/v1）。'
                : 'Paste a 0G CID or a workflow JSON (schema: shadowflow-workflow/v1).'}
            </div>
            <textarea autoFocus value={importText}
              onChange={e => { setImportText(e.target.value); setImportErr(null); }}
              placeholder={`cid://bafy…\n\nor:\n{ "schema": "shadowflow-workflow/v1", "nodes": [...], "edges": [...] }`}
              style={{ ...modalInput, height: 180, resize: 'vertical', fontFamily: V.mono, fontSize: 11 }} />
            {importErr && (
              <div style={{ fontFamily: V.mono, fontSize: 11, color: V.reject, background: 'var(--status-reject-tint)', padding: '6px 10px', borderRadius: 5, border: `1px solid rgba(239,68,68,.35)` }}>
                ✗ {importErr}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => { setImportOpen(false); setImportErr(null); }} style={btnGhost}>{zh ? '取消' : 'Cancel'}</button>
              <button onClick={doImport} disabled={!importText.trim()} style={{ ...btnPrimary, opacity: importText.trim() ? 1 : .5, cursor: importText.trim() ? 'pointer' : 'not-allowed' }}>
                {zh ? '导入' : 'Import'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Main EditorPage ───────────────────────────────────────────────────────────
function TemplateLoader({ templateAlias }: { templateAlias: string }) {
  const { setNodes, addEdge, clearCanvas } = useWorkflow();
  const nodeRegistry = useNodeRegistry();

  // One-shot load whenever the alias changes
  useEffect(() => {
    clearCanvas();

    // Seed preset?
    const preset = PRESETS[templateAlias];
    if (preset) {
      if (!preset.nodes.length) return; // blank
      try {
        const { nodes, edges } = materializePreset(preset, nodeRegistry);
        setNodes(nodes);
        edges.forEach(addEdge);
      } catch (e) { console.error('Failed to load seed preset:', e); }
      return;
    }

    // User template?
    const user = getUserTemplate(templateAlias);
    if (user) {
      if (user.nodes.length) setNodes(user.nodes);
      user.edges.forEach(addEdge);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateAlias]);

  return null;
}

export default function EditorPage({
  onBack, lang, onToggleLang, templateAlias = 'blank',
}: {
  onBack: () => void;
  lang: string;
  onToggleLang: () => void;
  templateAlias?: string;
}) {
  const zh = lang === 'CN';
  const preset    = PRESETS[templateAlias];
  const userTpl   = !preset ? getUserTemplate(templateAlias) : undefined;
  const templateTitle = preset
    ? preset.title[zh ? 'zh' : 'en']
    : userTpl?.title ?? PRESETS.blank.title[zh ? 'zh' : 'en'];

  return (
    <I18nProvider language={zh ? 'zh' : 'en'}>
      <ReactFlowProvider>
        <TemplateLoader templateAlias={templateAlias} />
        <YamlSyncBridge />
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: V.bg }}>
          <EditorTopBar onBack={onBack} lang={lang} onToggleLang={onToggleLang} templateTitle={templateTitle} />
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '296px 1fr 336px', minHeight: 0 }}>
            <LeftSidebar />
            <CenterPane />
            <RightInspector />
          </div>
          <FinalOutputToast />
        </div>
      </ReactFlowProvider>
    </I18nProvider>
  );
}

function YamlSyncBridge() {
  useYamlSync();
  return null;
}
