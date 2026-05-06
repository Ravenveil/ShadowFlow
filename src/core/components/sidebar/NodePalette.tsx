import React from 'react';

export interface PaletteItem {
  id: string;
  label: string;
  meta: string;
  group: 'agent' | 'gate';
}

const DEFAULT_AGENTS: PaletteItem[] = [
  { id: 'planner',    label: 'Planner',    meta: 'claude · plan',     group: 'agent' },
  { id: 'writer',     label: 'Writer',     meta: '0g · gpt-oss',      group: 'agent' },
  { id: 'researcher', label: 'Researcher', meta: 'claude · research',  group: 'agent' },
  { id: 'critic',     label: 'Critic',     meta: 'claude · review',    group: 'agent' },
  { id: 'advisor',    label: 'Advisor',    meta: '0g · verify',        group: 'agent' },
  { id: 'editor',     label: 'Editor',     meta: 'claude · polish',    group: 'agent' },
];

const DEFAULT_GATES: PaletteItem[] = [
  { id: 'retry',         label: 'Retry Gate',    meta: '↻ double-reject', group: 'gate' },
  { id: 'approval_gate', label: 'Approval Gate', meta: '✓ human · policy', group: 'gate' },
  { id: 'parallel',      label: 'Fan-out',        meta: '⚑ parallel',      group: 'gate' },
  { id: 'barrier',       label: 'Barrier',        meta: '⊞ await all',     group: 'gate' },
  { id: 'merge',         label: 'Merge',          meta: '→ join lanes',    group: 'gate' },
  { id: 'checkpoint',    label: 'Checkpoint',     meta: '◆ snapshot',      group: 'gate' },
];

interface NodePaletteProps {
  agents?: PaletteItem[];
  gates?: PaletteItem[];
}

function PaletteRow({ item }: { item: PaletteItem }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.id)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '8px 12px', cursor: 'grab', borderRadius: 6,
        background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
        margin: '0 8px 4px',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,.4)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--fg-1)' }}>{item.label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-5)' }}>{item.meta}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 12px 6px', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>
      {children}
    </div>
  );
}

export function NodePalette({ agents = DEFAULT_AGENTS, gates = DEFAULT_GATES }: NodePaletteProps) {
  return (
    <div style={{ paddingTop: 8 }}>
      <SectionLabel>Agents</SectionLabel>
      {agents.map((a) => <PaletteRow key={a.id} item={a} />)}
      <SectionLabel>Gates</SectionLabel>
      {gates.map((g) => <PaletteRow key={g.id} item={g} />)}
    </div>
  );
}
