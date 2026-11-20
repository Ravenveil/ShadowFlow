/**
 * 内置主控（2026-11-06，GrokBot「主Bot派活」范式）。
 * 显示名沿革：影 → 秘书 → 总经理（2026-11-06）→ 主控（2026-11-20，论文平台）。
 *
 * 播种在两处，都必须保持同一 id：
 *   - backend/node/src/storage/lead-agent.ts —— 单后端模式（不启 Python）的
 *     播种真源，soul 面向论文平台（接需求 → 拆活 → @角色派活 → 汇总）；
 *   - backend/python/shadowflow/services/secretary_seed.py —— 双后端模式仍在
 *     播种，但 soul 写死「手工艺品代卖」业务，属遗留，后续统一到 Node 那份。
 * 前端用同一 id 渲染左栏常驻入口 + 首访自动落进与它的会话。
 */
import type { NeoNav } from './types';

export const SECRETARY_AGENT_ID = 'agent-shadow-secretary';
/** 用户可见名。会话里所有「跟谁说话」的默认指向都是它。 */
export const SECRETARY_NAME = '主控';
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
