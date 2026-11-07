/**
 * 内置秘书（2026-11-06，GrokBot「主Bot派活」范式）。
 * 显示名定稿「总经理」（当日两次更名：影 → 秘书 → 总经理）。
 *
 * 后端 shadowflow/services/secretary_seed.py 启动时幂等播种固定 id 的
 * agent；前端用同一 id 渲染左栏常驻入口 + 首访自动落进与它的会话。
 * 两端字面量需保持一致（无跨端契约文件，改动时同步）。
 */
import type { NeoNav } from './types';

export const SECRETARY_AGENT_ID = 'agent-shadow-secretary';
export const SECRETARY_NAME = '总经理';
/** 首访自动进入秘书的会话（localStorage 一次性标记）。 */
export const SECRETARY_ENTERED_KEY = 'sf.secretary.entered';

/** 秘书 agent-target 单聊形态（默认落点；resolve 成功后自动升级进真会话）。 */
export function secretaryTargetNav(): NeoNav {
  return { view: 'agent-target', agentId: SECRETARY_AGENT_ID, name: SECRETARY_NAME };
}

/**
 * home 导航统一收敛到秘书单聊（2026-11-07「这个首页不要再显示了」/「希望默认
 * 是进入 agent 单聊形式」）：回首页、删会话兜底等一切 home 导航都落进秘书
 * agent-target 形态，任何过渡帧都不再是 hero 首页。其余导航原样通过。
 */
export function redirectHomeToSecretary(next: NeoNav): NeoNav {
  return next.view === 'home' ? secretaryTargetNav() : next;
}
