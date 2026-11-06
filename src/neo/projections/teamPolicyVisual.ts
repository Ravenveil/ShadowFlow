/**
 * teamPolicyVisual — 协作策略矩阵 ↔ DAG 画布的共享染色纯函数（2026-11-06）。
 *
 * 背景：策略矩阵 matrix[from][to] 在运行时被 policy-gate 按「边的方向」
 * 逐条查询（gate(matrix, 边source.agentId, 边target.agentId)），每一格
 * 天然对应画布上的一条交接边。此前只有节点描边做了「最严态」聚合染色
 * （buildAgentPolicyColor），边线完全不反映策略 —— 矩阵和 DAG 看起来
 * 没有联动。本模块把三处重复的策略色板收敛到一处，并补上「边随策略染色」。
 *
 * 边染色语义（有意取无向对、双向取更严）：
 *   - 用户在矩阵里填格子的方向经常和 DAG 边方向相反（直觉是"这两个人之间
 *     有限制"），严格按 from→to 查表会让大部分配置不上色，联动形同虚设；
 *   - 与节点染色的既有口径一致（buildAgentPolicyColor 本就双向取更严）；
 *   - 方向的精确语义（运行时按 行→列 拦截）由矩阵 UI 的方向提示承担，
 *     染色只负责"这对成员之间有限制"的视觉信号。
 *
 * 全部为纯函数、无 reactflow 运行时依赖（仅类型引用），vitest 可直测。
 */
import type { PolicyCellState, TeamPolicyMatrix } from '../../api/teams';

/** 策略态 → 染色（矩阵格 / 节点描边 / 边线 / chips 共用，唯一真源）。 */
export const POLICY_COLOR: Record<PolicyCellState, string> = {
  permit: 'var(--t-ok, #16A34A)',
  warn: 'var(--t-warn, #D97706)',
  deny: 'var(--t-err, #DC2626)',
};

/** 严格度序（deny > warn > permit）；双向取更严时用。 */
export const POLICY_RANK: Record<PolicyCellState, number> = { deny: 3, warn: 2, permit: 1 };

/** 成员对的无向键（排序拼接，{a,b} 与 {b,a} 同键）。 */
export function policyPairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * 矩阵 → 成员对染色表（pairKey → 更严策略态；只收录显式配置的对，
 * 自环忽略，未知值忽略）。边线/节点聚合共用的查表源。
 */
export function buildPairPolicyColor(
  matrix: TeamPolicyMatrix | null | undefined,
): Map<string, PolicyCellState> {
  const map = new Map<string, PolicyCellState>();
  if (!matrix) return map;
  for (const [from, row] of Object.entries(matrix)) {
    for (const [to, state] of Object.entries(row ?? {})) {
      if (from === to) continue;
      const s = state as PolicyCellState;
      if (!(s in POLICY_RANK)) continue;
      const key = policyPairKey(from, to);
      const prev = map.get(key);
      if (!prev || POLICY_RANK[s] > POLICY_RANK[prev]) map.set(key, s);
    }
  }
  return map;
}

/** 查成员对策略态（双向同键；未配置返回 null = 不染色）。 */
export function lookupPairPolicy(
  pairColor: Map<string, PolicyCellState> | null | undefined,
  a: string,
  b: string,
): PolicyCellState | null {
  if (!pairColor || !a || !b || a === b) return null;
  return pairColor.get(policyPairKey(a, b)) ?? null;
}

/**
 * agentId → 最严策略态（deny > warn > permit；自环忽略）。
 * 2026-11-06 自 TeamPanel 迁入：节点描边染色的口径与边染色同源。
 */
export function buildAgentPolicyColor(
  matrix: TeamPolicyMatrix | null,
): Map<string, PolicyCellState> {
  const map = new Map<string, PolicyCellState>();
  if (!matrix) return map;
  for (const [from, row] of Object.entries(matrix)) {
    for (const [to, state] of Object.entries(row ?? {})) {
      if (from === to) continue;
      const s = state as PolicyCellState;
      if (!(s in POLICY_RANK)) continue;
      const prevFrom = map.get(from);
      if (!prevFrom || POLICY_RANK[s] > POLICY_RANK[prevFrom]) map.set(from, s);
      const prevTo = map.get(to);
      if (!prevTo || POLICY_RANK[s] > POLICY_RANK[prevTo]) map.set(to, s);
    }
  }
  return map;
}

/** 边视觉（className 虚线标记 + 内联描边样式）。 */
export interface EdgeVisual {
  className?: string;
  style?: { stroke?: string; strokeWidth?: number };
}

/**
 * 按 mode × 策略态生成边展示属性。
 *
 *   - 有策略 → 策略色优先（deny 加粗），approve 的虚线 className 保留
 *     （审批门语义不丢，颜色换成策略色）；
 *   - 无策略 → 沿用 mode 视觉（approve 警示虚线 / conditional 强调虚线 /
 *     direct 默认实线），行为与 2026-08 版完全一致。
 *
 * approveClass/conditionalClass 由调用方传（画布与编辑器的 CSS 类名不同）。
 */
export function edgeVisualFor(
  mode: string,
  policy: PolicyCellState | null | undefined,
  approveClass: string,
  conditionalClass?: string,
): EdgeVisual {
  if (policy && POLICY_COLOR[policy]) {
    const style = {
      stroke: POLICY_COLOR[policy],
      strokeWidth: policy === 'deny' ? 2.4 : 1.8,
    };
    return mode === 'approve' ? { className: approveClass, style } : { style };
  }
  if (mode === 'approve') {
    return { className: approveClass, style: { stroke: 'var(--t-warn, #D97706)' } };
  }
  if (mode === 'conditional' && conditionalClass) {
    return { className: conditionalClass, style: { stroke: 'var(--t-accent, #0891B2)' } };
  }
  return {};
}
