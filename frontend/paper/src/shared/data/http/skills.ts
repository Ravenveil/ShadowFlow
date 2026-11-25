/**
 * skills.ts — 技能目录的 HTTP 客户端（设置里的「技能」分区分）。
 *
 * 对齐后端 routes/skills：
 *   GET    /api/skills                 全部技能（内置 + 用户灌入），自带 enabled
 *   PATCH  /api/skills/:id/enabled     开 / 关（只影响路由与召回）
 *   DELETE /api/skills/:id             删用户灌入的（内置技能后端 403 保护）
 *   POST   /api/skills/reload          重扫磁盘，热更技能表
 *
 * 组件只认这里导出的函数与类型，不写 fetch、不认路径。
 */
import { request } from '@/shared/data/http/client';

export interface SkillRecord {
  skill_id: string;
  name: string;
  description: string;
  /** 技能形态：blueprint / prototype / report…（后端枚举，前端只当标签显示）。 */
  mode: string;
  preview_type?: string;
  has_team?: boolean;
  /** builtin = 内置；其余（user / ingested）可删。 */
  source: string;
  kind: string;
  domain: string;
  enabled: boolean;
}

export const listSkills = () => request<SkillRecord[]>('/api/skills');

export const setSkillEnabled = (id: string, enabled: boolean) =>
  request<{ data: { skill_id: string; enabled: boolean } }>(
    `/api/skills/${encodeURIComponent(id)}/enabled`,
    { method: 'PATCH', body: JSON.stringify({ enabled }) },
  );

export const deleteSkill = (id: string) =>
  request<null>(`/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** 重扫技能目录：返回重载后的条数（后端只回 ok，界面自己重取列表）。 */
export const reloadSkills = () => request<unknown>('/api/skills/reload', { method: 'POST' });

/** 内置技能不可删，界面据此决定要不要出删除按钮。 */
export const isBuiltinSkill = (s: SkillRecord) => s.source === 'builtin';
