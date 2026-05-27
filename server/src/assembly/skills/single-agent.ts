import type { AssemblyRecipe } from './types';

/** 用户明确要"一个 agent" → 单节点（coordinator 兼执行者），无边。 */
export const SINGLE_AGENT_RECIPE: AssemblyRecipe = {
  id: 'single-agent',
  description: '单个 agent：用户明确要一个 agent 时，只建一个、兼协调与执行',
  match: { singleAgent: true },
  roles: [
    { role_id: 'coordinator', type: 'coordinator', title: '助手', hint: '按用户 goal 担任单一执行者' },
  ],
  edges: [],
};
