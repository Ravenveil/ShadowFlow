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
