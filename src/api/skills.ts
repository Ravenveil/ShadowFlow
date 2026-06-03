/**
 * Skill catalog API client.
 *
 * Story 15.4: Skill 选择器 UI.
 * Backed by Story 15.1's `GET /api/skills` endpoint. When the backend is
 * unreachable (offline dev, server not started), callers fall back to
 * `LOCAL_SKILLS` so the picker still renders.
 */
import { getApiBase } from './_base';

export type SkillPreviewType = 'yaml' | 'html' | 'markdown';
export type SkillMode = 'blueprint' | 'prototype' | 'report';

export interface SkillInfo {
  skill_id: string;
  name: string;
  description: string;
  mode: SkillMode;
  preview_type: SkillPreviewType;
  /**
   * Story (Skills 管理) — server-supplied management metadata. All optional so
   * the hardcoded `LOCAL_SKILLS` fallback (which omits them) stays valid.
   *
   * - `source`        : 'builtin' (shipped, undeletable) vs 'user' (added by user)
   * - `enabled`       : whether the skill is active (toggled via setSkillEnabled)
   * - `platform`      : target platform tag (e.g. claude / generic)
   * - `scenario`      : usage scenario tag
   * - `fidelity`      : output fidelity tag (e.g. blueprint / prototype)
   * - `has_team`      : whether the skill ships a paired team blueprint
   * - `example_prompt`: a suggested prompt to demo the skill
   */
  source?: 'builtin' | 'user';
  enabled?: boolean;
  platform?: string;
  scenario?: string;
  fidelity?: string;
  has_team?: boolean;
  example_prompt?: string;
}

/**
 * Hardcoded fallback list. Mirrors the 3 built-in skills shipped by
 * Story 15.1's backend.
 */
export const LOCAL_SKILLS: SkillInfo[] = [
  {
    skill_id: 'agent-team-blueprint',
    name: 'Agent Team Blueprint',
    description:
      '根据目标生成 ShadowFlow YAML Blueprint，自动规划 Agent 角色和协作结构',
    mode: 'blueprint',
    preview_type: 'yaml',
  },
  {
    skill_id: 'web-prototype',
    name: '网页原型',
    description: '生成一个完整的响应式 HTML 网页',
    mode: 'prototype',
    preview_type: 'html',
  },
  {
    skill_id: 'report',
    name: '研究报告',
    description: '生成结构化的 Markdown 研究报告',
    mode: 'report',
    preview_type: 'markdown',
  },
];

export async function listSkills(): Promise<SkillInfo[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/skills`);
    if (!res.ok) throw new Error(`listSkills failed: ${res.status}`);
    const data = (await res.json()) as SkillInfo[];
    if (!Array.isArray(data) || data.length === 0) return LOCAL_SKILLS;
    return data;
  } catch {
    return LOCAL_SKILLS;
  }
}

/**
 * Toggle a skill's enabled state.
 *
 * `PATCH /api/skills/:id/enabled` with body `{ enabled }`. Server responds
 * `{ data: { skill_id, enabled } }` on success; we ignore the body and resolve
 * void (the caller already knows the target state). Throws on non-2xx so the
 * UI can revert an optimistic toggle.
 */
export async function setSkillEnabled(skillId: string, enabled: boolean): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/api/skills/${encodeURIComponent(skillId)}/enabled`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw new Error('setSkillEnabled failed: ' + res.status);
}

/**
 * Delete a user skill.
 *
 * `DELETE /api/skills/:id`. Built-in skills return 403; we surface the server's
 * `error.message` (e.g. "内置不可删") in the thrown Error so the UI can show a
 * meaningful reason. Falls back to the status code when the body is unreadable.
 */
export async function deleteSkill(skillId: string): Promise<void> {
  const res = await fetch(
    `${getApiBase()}/api/skills/${encodeURIComponent(skillId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    let message = `deleteSkill failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) {
        message = `deleteSkill failed: ${body.error.message}`;
      }
    } catch {
      // body not JSON / already consumed — keep status-based message
    }
    throw new Error(message);
  }
}
