/**
 * projects.ts — Story 15.24 — Front-end client for the Project REST API
 * (server-side endpoints owned by Story 15.16).
 *
 *   GET    /api/projects             → listProjects
 *   POST   /api/projects             → createProject
 *   GET    /api/projects/:id         → getProject
 *   PATCH  /api/projects/:id         → updateProject
 *   DELETE /api/projects/:id         → deleteProject
 *
 * The 15.16 storage row already orders listProjects by `updated_at DESC`, so
 * the UI can render the array directly without re-sorting.
 *
 * Note: the canonical schema field is `skill_id` (NOT `default_skill`) — the
 * 15.24 spec mentioned `default_skill` for prose readability, but the actual
 * DB column + REST contract uses `skill_id` and `design_system_id`. We surface
 * the real names so the rest of the front-end can stay aligned with server
 * types from `server/src/storage/projects.ts`.
 */

import { getApiBase, authHeaders } from './_base';

export interface ProjectRecord {
  project_id: string;
  name: string;
  workspace_path: string;
  skill_id: string | null;
  design_system_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const resp = await fetch(`${getApiBase()}/api/projects`, {
    headers: { ...authHeaders() },
  });
  if (!resp.ok) throw new Error(`listProjects failed: ${resp.status}`);
  return resp.json();
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectRecord> {
  const resp = await fetch(`${getApiBase()}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`createProject failed: ${resp.status}`);
  return resp.json();
}

export async function getProject(pid: string): Promise<ProjectRecord> {
  const resp = await fetch(
    `${getApiBase()}/api/projects/${encodeURIComponent(pid)}`,
    { headers: { ...authHeaders() } },
  );
  if (!resp.ok) throw new Error(`getProject failed: ${resp.status}`);
  return resp.json();
}

export async function updateProject(
  pid: string,
  patch: UpdateProjectInput,
): Promise<ProjectRecord> {
  const resp = await fetch(
    `${getApiBase()}/api/projects/${encodeURIComponent(pid)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(patch),
    },
  );
  if (!resp.ok) throw new Error(`updateProject failed: ${resp.status}`);
  return resp.json();
}

export async function deleteProject(pid: string): Promise<void> {
  const resp = await fetch(
    `${getApiBase()}/api/projects/${encodeURIComponent(pid)}`,
    {
      method: 'DELETE',
      headers: { ...authHeaders() },
    },
  );
  // 204 No Content is the success path; both 200 and 204 are tolerated.
  if (!resp.ok && resp.status !== 204) {
    throw new Error(`deleteProject failed: ${resp.status}`);
  }
}
