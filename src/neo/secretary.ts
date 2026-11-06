/**
 * 内置秘书「影」（2026-11-06，GrokBot「主Bot派活」范式）。
 *
 * 后端 shadowflow/services/secretary_seed.py 启动时幂等播种固定 id 的
 * agent；前端用同一 id 渲染左栏常驻入口 + 首访自动落进与影的会话。
 * 两端字面量需保持一致（无跨端契约文件，改动时同步）。
 */
export const SECRETARY_AGENT_ID = 'agent-shadow-secretary';
export const SECRETARY_NAME = '影';
/** 首访自动进入影的会话（localStorage 一次性标记）。 */
export const SECRETARY_ENTERED_KEY = 'sf.secretary.entered';
