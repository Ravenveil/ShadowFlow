// ============================================================================
// User-saved templates — localStorage-backed, appears alongside seed templates
// ============================================================================

import type { WorkflowNode, WorkflowEdge } from '../common/types';

const STORAGE_KEY = 'shadowflow.user_templates.v1';

export interface UserTemplate {
  alias: string;              // slug, unique
  title: string;
  description: string;
  createdAt: string;          // ISO timestamp
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  stats: { agents: number; edges: number };
}

function readAll(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeAll(list: UserTemplate[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota? ignore */ }
}

export function listUserTemplates(): UserTemplate[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getUserTemplate(alias: string): UserTemplate | undefined {
  return readAll().find(t => t.alias === alias);
}

export function saveUserTemplate(input: {
  title: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): UserTemplate {
  const all = readAll();
  const now = new Date().toISOString();
  const baseAlias = `my_${slugify(input.title || 'untitled')}`;
  let alias = baseAlias;
  let n = 1;
  while (all.some(t => t.alias === alias)) alias = `${baseAlias}_${n++}`;

  const tpl: UserTemplate = {
    alias,
    title: input.title || 'Untitled',
    description: input.description || '',
    createdAt: now,
    updatedAt: now,
    nodes: input.nodes,
    edges: input.edges,
    stats: { agents: input.nodes.length, edges: input.edges.length },
  };
  all.push(tpl);
  writeAll(all);
  return tpl;
}

export function deleteUserTemplate(alias: string): void {
  writeAll(readAll().filter(t => t.alias !== alias));
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'untitled';
}

// ──────────────────────────────────────────────────────────────────────────────
// Simple JSON import/export (stand-in for real 0G CID)
// ──────────────────────────────────────────────────────────────────────────────

export interface WorkflowJSON {
  schema: 'shadowflow-workflow/v1';
  title?: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function exportWorkflowJSON(input: { title?: string; description?: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }): string {
  const payload: WorkflowJSON = {
    schema: 'shadowflow-workflow/v1',
    title: input.title,
    description: input.description,
    nodes: input.nodes,
    edges: input.edges,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWorkflowJSON(raw: string): WorkflowJSON | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.schema === 'shadowflow-workflow/v1' || Array.isArray(parsed.nodes))) {
      return {
        schema: 'shadowflow-workflow/v1',
        title: parsed.title,
        description: parsed.description,
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    }
  } catch { /* bad json */ }
  return null;
}
