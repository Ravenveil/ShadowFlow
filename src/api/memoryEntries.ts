import { getApiBase, authHeaders } from './_base';

export type MemoryScope = 'user' | 'project' | 'session';

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface MemorySettings {
  enabled: boolean;
}

const base = () => getApiBase();

export async function listMemoryEntries(): Promise<MemoryEntry[]> {
  const res = await fetch(`${base()}/api/memory/entries`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`listMemoryEntries: ${res.status}`);
  return res.json();
}

export async function createMemoryEntry(
  data: Pick<MemoryEntry, 'scope' | 'title' | 'content'>,
): Promise<MemoryEntry> {
  const res = await fetch(`${base()}/api/memory/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`createMemoryEntry: ${res.status}`);
  return res.json();
}

export async function updateMemoryEntry(
  id: string,
  patch: Partial<Pick<MemoryEntry, 'scope' | 'title' | 'content'>>,
): Promise<MemoryEntry> {
  const res = await fetch(`${base()}/api/memory/entries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateMemoryEntry: ${res.status}`);
  return res.json();
}

export async function deleteMemoryEntry(id: string): Promise<void> {
  const res = await fetch(`${base()}/api/memory/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok && res.status !== 204) throw new Error(`deleteMemoryEntry: ${res.status}`);
}

export async function getMemorySettings(): Promise<MemorySettings> {
  const res = await fetch(`${base()}/api/memory/settings`, { headers: { ...authHeaders() } });
  if (!res.ok) return { enabled: true };
  return res.json();
}

export async function updateMemorySettings(patch: { enabled: boolean }): Promise<MemorySettings> {
  const res = await fetch(`${base()}/api/memory/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateMemorySettings: ${res.status}`);
  return res.json();
}
