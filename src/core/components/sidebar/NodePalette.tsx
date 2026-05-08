import React from 'react';
import { CheckCircle2, Split, Bookmark } from '../../../common/icons/iconRegistry';
import { RotateCw, Hourglass, ArrowRight, type LucideIcon } from 'lucide-react';

export interface PaletteItem {
  id: string;
  label: string;
  meta: string;
  group: 'agent' | 'gate';
  /** Optional Lucide icon shown before {meta}. Replaces legacy unicode glyphs. */
  icon?: LucideIcon;
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
  { id: 'retry',         label: 'Retry Gate',    meta: 'double-reject', group: 'gate', icon: RotateCw },
  { id: 'approval_gate', label: 'Approval Gate', meta: 'human · policy', group: 'gate', icon: CheckCircle2 },
  { id: 'parallel',      label: 'Fan-out',        meta: 'parallel',      group: 'gate', icon: Split },
  { id: 'barrier',       label: 'Barrier',        meta: 'await all',     group: 'gate', icon: Hourglass },
  { id: 'merge',         label: 'Merge',          meta: 'join lanes',    group: 'gate', icon: ArrowRight },
  { id: 'checkpoint',    label: 'Checkpoint',     meta: 'snapshot',      group: 'gate', icon: Bookmark },
];

interface NodePaletteProps {
  agents?: PaletteItem[];
  gates?: PaletteItem[];
}

function PaletteRow({ item }: { item: PaletteItem }) {
  const IconCmp = item.icon;
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.id)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '8px 12px', cursor: 'grab', borderRadius: 6,
        background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
        margin: '0 8px 4px',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,.4)' /* fixme: token */; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--t-border)'; }}
    >
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--t-fg)' }}>{item.label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-5)' }}>
        {IconCmp ? <IconCmp size={11} strokeWidth={2} aria-hidden /> : null}
        {item.meta}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 12px 6px', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--t-fg-4)' }}>
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
