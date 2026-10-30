/**
 * projects.ts — GAP A3（2026-08-22）— Node 侧 /api/projects 客户端。
 *
 * Neo 左栏项目分组用：`listProjectsWithSessions()` 拉项目 + 关联会话
 * （GET /api/projects?withSessions=1，session.group_id 互链 inbox 的
 * DM/群聊 group_id），`createProject()` 支撑「新建项目」行。
 * 响应 shape 与 server storage record 一致（无 envelope，snake_case 直透）。
 */
import { getApiBase, authHeaders } from './_base';

export interface ProjectSession {
  conversation_id: string;
  project_id: string;
  title: string | null;
  /** B1 统一会话内核 — 互链 Python 群/DM 的 group_id；null = 匿名 run 会话。 */
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  project_id: string;
  name: string;
  workspace_path: string;
  skill_id: string | null;
  design_system_id: string | null;
  created_at: string;
  updated_at: string;
}

/** withSessions=1 变体：verbatim record + id 别名 + sessions[]。 */
export interface ProjectWithSessions extends ProjectRecord {
  id: string;
  sessions: ProjectSession[];
}

const base = () => getApiBase();

export async function listProjectsWithSessions(): Promise<ProjectWithSessions[]> {
  const res = await fetch(`${base()}/api/projects?withSessions=1`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`listProjectsWithSessions: ${res.status}`);
  return res.json();
}

/**
 * 新建项目。`workspace_path`（可选）= 本地文件夹绝对路径，由 NeoRail
 * 「新建项目」行的文件夹按钮经 fsPickNative 选取；JSON.stringify 自动丢弃
 * undefined，后端缺省时回落空串。
 */
export async function createProject(
  name: string,
  workspace_path?: string,
): Promise<ProjectRecord> {
  const res = await fetch(`${base()}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, workspace_path }),
  });
  if (!res.ok) throw new Error(`createProject: ${res.status}`);
  return res.json();
}

export interface ProjectPatchRequest {
  name?: string;
  workspace_path?: string;
  skill_id?: string | null;
  design_system_id?: string | null;
}

/** 管理面闭环（2026-08-23）：项目重命名等局部更新，PATCH /api/projects/:id。 */
export async function patchProject(
  projectId: string,
  patch: ProjectPatchRequest,
): Promise<ProjectRecord> {
  const res = await fetch(`${base()}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchProject: ${res.status}`);
  return res.json();
}

/** 管理面闭环（2026-08-23）：删除项目，DELETE /api/projects/:id（204）。 */
export async function deleteProject(projectId: string): Promise<void> {
  const res = await fetch(`${base()}/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error(`deleteProject: ${res.status}`);
}

/**
 * 项目产物（server/src/routes/projects.ts GET /:id/artifacts）— 该 run 产出了
 * artifact_filename 的行才返回。download_url/preview_url 为相对路径
 * （/projects/...），消费侧拼 getApiBase()。
 */
export interface ProjectArtifact {
  artifact_id: string;
  title: string;
  file_type: string;
  generated_at: string;
  download_url: string | null;
  preview_url: string | null;
  size_bytes: number | null;
  run_id: string;
}

/** 项目产物列表（NeoRail 项目 label 产物面板，2026-09-03 修复链路后启用）。 */
export async function getProjectArtifacts(projectId: string): Promise<ProjectArtifact[]> {
  const res = await fetch(
    `${base()}/api/projects/${encodeURIComponent(projectId)}/artifacts`,
    { headers: { ...authHeaders() } },
  );
  if (!res.ok) throw new Error(`getProjectArtifacts: ${res.status}`);
  return res.json();
}
