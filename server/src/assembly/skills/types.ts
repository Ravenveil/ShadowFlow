import type { OutputType } from '../../lib/intent-router';

/** Skill recipe = 确定性装配剧本（文章：Skill = 不现场发挥按剧本来）。与 Rule 分目录。 */
export interface AssemblyRecipe {
  id: string;
  description: string;
  match: {
    singleAgent?: boolean;       // detectExplicitSingleAgent 命中
    intents?: OutputType[];      // intent-router classifyIntent 的 outputType
    keywords?: string[];         // 兜底关键词（goal 含任一即命中）
  };
  roles: RecipeRole[];
  edges: RecipeEdge[];
}
export interface RecipeRole {
  role_id: string;
  type: 'coordinator' | 'agent';
  title: string;
  hint?: string;
}
export interface RecipeEdge { from: string; to: string }
