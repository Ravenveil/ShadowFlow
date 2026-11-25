/**
 * lead-agent.ts — 内置「主控」agent 的 Node 侧幂等播种（2026-11-20）。
 *
 * 背景：主控（display 名「主控」，id `agent-shadow-secretary` 沿用旧值以兼容
 * 前端 lib/secretary.ts 与既有会话记录）原本只由 Python
 * `services/secretary_seed.py` 启动时播种。单后端模式（SF_BACKEND_MODE=single）
 * 不启 Python → 播种不到 → 前端首访落进的「主控会话」指向一个不存在的 agent，
 * 「群里跟主控对话、主控带角色」这件事从根上不成立。
 *
 * 因此这里在 Node 侧补一份播种，与 index.ts 的 catalog 模板播种同构：
 * 启动时幂等执行，失败不阻断启动（播种坏了不能让服务起不来）。
 *
 * 与 Python 那份的差异（有意为之）：
 *   - Python soul 写死「手工艺品代卖」业务（品牌策划师/商品文案师/…）；
 *   - 这里改成业务无关的论文平台主控（接需求 → 拆活 → @角色派活 → 汇总），
 *     论文团队的角色由 templates/academic-paper.yaml 的 agent_roster 提供。
 */

import { createAgent, listAgents } from './infra-persistence';

/** 与前端 lib/secretary.ts 的 SECRETARY_AGENT_ID 必须同值（无跨端契约文件）。 */
export const LEAD_AGENT_ID = 'agent-shadow-secretary';

/** 用户可见的显示名。2026-11-20 由「总经理」改为「主控」（论文平台语义）。 */
export const LEAD_AGENT_NAME = '主控';

/** 播种落库的 workspace：未指定用户的默认工作区。 */
const LEAD_AGENT_WORKSPACE = 'default';

/**
 * 主控 soul。首行会被当 role 摘要（teams-model.roleFromSoul），所以第一行必须
 * 是可直接展示的身份描述，不能是空行或装饰。
 */
export const LEAD_AGENT_SOUL = [
  '论文平台主控：接需求、拆任务、把活派给团队角色、汇总产出',
  '',
  '你是这个工作台的「主控」。用户只跟你说话，你把事办成：',
  '1. 先确认目标——要写什么论文、投什么会/刊、现在手上有哪些材料、死线是什么。',
  '2. 拆活：把目标拆成可独立交付的任务，每个任务有明确产出物（文件形式）。',
  '3. 派活：用 @角色名 点名派给团队里的对应角色；没点名的任务不要群发。',
  '4. 汇总：任务回来后你负责整合成一份完整交付，主动指出缺口和风险。',
  '5. 不确定的事先问，不要编造文献、数据、实验结论。',
  '',
  '团队角色（按需调用，不要为了显得忙而全部叫一遍）：',
  '- 文献侦察：找相关论文、核对引用真实性、整理综述脉络。',
  '- 方法设计：把研究问题变成可执行的实验/分析方案。',
  '- 实验执行：跑代码、出图表、记录参数与结果。',
  '- 写作主笔：按章节成稿，保持术语和叙述一致。',
  '- 审稿润色：以审稿人视角挑问题，再改表达。',
].join('\n');

export interface EnsureLeadAgentResult {
  /** 本次是否真的写入了新记录（false = 早已存在或写入失败）。 */
  created: boolean;
  agentId: string;
}

/**
 * 幂等播种主控 agent。已存在（同 id）则直接返回。
 *
 * 不抛错：sqlite 不可用等异常只记一行到 stderr，启动流程继续。
 */
export function ensureLeadAgent(): EnsureLeadAgentResult {
  const failSoft = (e: unknown): EnsureLeadAgentResult => {
    console.error(`[lead-agent] seed failed: ${(e as Error)?.message ?? String(e)}`);
    return { created: false, agentId: LEAD_AGENT_ID };
  };

  try {
    const existing = listAgents().find((a) => a.agent_id === LEAD_AGENT_ID);
    if (existing) return { created: false, agentId: LEAD_AGENT_ID };

    createAgent(LEAD_AGENT_NAME, LEAD_AGENT_SOUL, LEAD_AGENT_WORKSPACE, {
      agentId: LEAD_AGENT_ID,
      source: 'catalog',
    });
    return { created: true, agentId: LEAD_AGENT_ID };
  } catch (e) {
    return failSoft(e);
  }
}
