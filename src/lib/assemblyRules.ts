/**
 * assemblyRules.ts — 装配期确定性 Rule（前端孪生）
 *
 * 背景：组装 agent/team 时"几个 agent / 什么角色"100% 由 LLM 读 system prompt
 * 自由发挥。用户说"帮我创建一个开发工程师agent"却得到 3 人 team(架构师/全栈/测试)。
 *
 * 第一版止血(server `lib/intent-router.ts`)只是往 prompt 追加一段
 * `SINGLE_AGENT_DIRECTIVE` —— 那还是**软约束**：LLM 不听照样 emit 3 个节点，
 * 没有东西去拦。文章原话："Rule 是软约束……无法强制流程执行。"
 *
 * 这个模块是**硬关卡**：把"roster 数量"做成一条可声明、由代码强制执行的 Rule，
 * 在 team 真正被装配(RunSessionPage 把 `<sf:node>` 落成 team)的那一刻**确定性截断**
 * 多余 agent 节点 —— 不问 LLM 同不同意。这是 Rule(声明) + Script/校验(执行) 闭环
 * 在装配期的最小落地。
 *
 * 检测正则与 server `lib/intent-router.ts:detectExplicitSingleAgent` **保持一致**
 * （前后端双份，沿用 `skillToken.ts` 同款约定）。改一处必须同步另一处。
 */

// ── 单数 agent 短语：与 server SINGLE_AGENT_PATTERNS 逐字一致 ──
const SINGLE_AGENT_PATTERNS: readonly RegExp[] = [
  /(?:一个|单个|1\s*个|一名|一位|就一个|只要一个|只.{0,3}一个)[^。！？\n]{0,10}?(?:agent|智能体|员工|助手)/i,
  /\b(?:a|one|single)\s+agent\b/i,
  /\bjust\s+one\s+agent\b/i,
];

// ── 团队意图负向守卫：命中则不强制单数 ──
const TEAM_INTENT_PATTERN = /团队|小队|一组|一队|多个|几个|多名|\bteam\b|team of/i;

/**
 * 装配期 Rule。目前只有 roster 上限一种；后续 N2 Rule Pack 落地后，
 * 这里会被 team 一等公民 Rule 列表替代/合并（见 docs/harness §4.3 N2）。
 */
export interface RosterRule {
  /** 本 team 允许的最大 agent 节点数；null = 不限制。 */
  maxAgents: number | null;
  /** 触发原因，用于审计/提示。 */
  reason: string;
  /** 命中的原文片段（调试用）。 */
  matched?: string;
}

/**
 * 从 goal 推导 roster Rule。确定性、可单测、不调用 LLM。
 * 用户明确要"一个 agent"且无团队词 → maxAgents=1。
 */
export function deriveRosterRule(goal: string): RosterRule | null {
  const g = (goal ?? '').trim();
  if (!g) return null;
  if (TEAM_INTENT_PATTERN.test(g)) return null;
  for (const re of SINGLE_AGENT_PATTERNS) {
    const m = g.match(re);
    if (m) {
      return {
        maxAgents: 1,
        reason: '用户明确要求单个 agent',
        matched: m[0],
      };
    }
  }
  return null;
}

/**
 * 按 Rule 确定性截断 agent 节点列表。保留前 maxAgents 个（含 coordinator），
 * 丢弃其余。返回保留 + 丢弃两份，便于调用方记日志 / 提示用户。
 *
 * 泛型 T 只要求有 type 字段，避免耦合 RunSession 的具体 node 类型。
 */
export function enforceRoster<T>(
  agentNodes: readonly T[],
  rule: RosterRule | null,
): { kept: T[]; dropped: T[] } {
  if (!rule || rule.maxAgents == null || agentNodes.length <= rule.maxAgents) {
    return { kept: [...agentNodes], dropped: [] };
  }
  return {
    kept: agentNodes.slice(0, rule.maxAgents),
    dropped: agentNodes.slice(rule.maxAgents),
  };
}
