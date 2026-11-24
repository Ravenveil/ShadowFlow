/**
 * teamDagGeometry 纯函数测试（2026-11-07「边连接还是奇怪，删除后边还在」修复）。
 *
 *   - computeTeamDagEdgePath：逆向回边（同一带内 target 在 source 左侧）走
 *     上方 U 形回弧，不再退化成穿过节点身体的水平直线；顺向/纵向跨行仍走
 *     smoothstep（mock 断言透传）
 *   - resolveConnectDirection：连线方向 = 交接语义（拖拽方向），仅「入口手柄
 *     起手 → 出口手柄落地」的 n8n 式反向拖法调换两端
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('reactflow', () => ({
  getSmoothStepPath: vi.fn(() => ['M smoothstep', 11, 22]),
}));

import { computeTeamDagEdgePath, resolveConnectDirection } from '../projections/teamDagGeometry';

const POS = 'right' as never;

describe('computeTeamDagEdgePath — 回边回弧', () => {
  it('同一带内逆向边（驳回回炉）→ 上方 U 形回弧，不再穿节点/叠线', () => {
    // 用户真实几何：strategist 右手柄 (992,35) → reviewer 左手柄 (720,35)
    const geom = computeTeamDagEdgePath({
      sourceX: 992,
      sourceY: 35,
      sourcePosition: POS,
      targetX: 720,
      targetY: 35,
      targetPosition: POS,
    });
    expect(geom.path).not.toBe('M smoothstep');
    // 起点=source 手柄、终点=target 手柄（箭头方向 = 语义方向）
    expect(geom.path.startsWith('M 992 35')).toBe(true);
    expect(geom.path.endsWith('L 720 35')).toBe(true);
    // 圆角 Q 段成对出现（U 形四角）
    expect((geom.path.match(/Q /g) ?? []).length).toBe(4);
    // 药丸落在弧顶中点（x=两平段中点，y=行上方 64px）
    expect(geom.labelX).toBe((992 + 40 + 720 - 40) / 2);
    expect(geom.labelY).toBe(35 - 64);
  });

  it('顺向边 → 仍走 smoothstep 折线（几何透传）', () => {
    const geom = computeTeamDagEdgePath({
      sourceX: 452,
      sourceY: 35,
      sourcePosition: POS,
      targetX: 900,
      targetY: 35,
      targetPosition: POS,
    });
    expect(geom.path).toBe('M smoothstep');
    expect(geom.labelX).toBe(11);
    expect(geom.labelY).toBe(22);
  });

  it('纵向跨行边（同列堆叠，dy≥64）→ 不当回边，仍走折线', () => {
    // 同列上下堆叠的两个节点：targetX < sourceX 但这是纵向边而非回边
    const geom = computeTeamDagEdgePath({
      sourceX: 992,
      sourceY: 35,
      sourcePosition: POS,
      targetX: 900,
      targetY: 145,
      targetPosition: POS,
    });
    expect(geom.path).toBe('M smoothstep');
  });

  it('x 未明显回退（|dx|≤24）→ 不当回边', () => {
    const geom = computeTeamDagEdgePath({
      sourceX: 900,
      sourceY: 35,
      sourcePosition: POS,
      targetX: 890,
      targetY: 35,
      targetPosition: POS,
    });
    expect(geom.path).toBe('M smoothstep');
  });
});

describe('resolveConnectDirection — 连线方向 = 交接语义', () => {
  it('出口手柄 → 入口手柄：按拖拽方向（a→b）', () => {
    expect(resolveConnectDirection('a', 'b', 'out', 'in')).toEqual(['a', 'b']);
  });

  it('入口手柄起手、落到出口手柄：n8n 式反向拖法，调换为 b→a', () => {
    expect(resolveConnectDirection('a', 'b', 'in', 'out')).toEqual(['b', 'a']);
  });

  it('同类型手柄互拖（歧义）→ 保留拖拽方向', () => {
    expect(resolveConnectDirection('a', 'b', 'out', 'out')).toEqual(['a', 'b']);
    expect(resolveConnectDirection('a', 'b', 'in', 'in')).toEqual(['a', 'b']);
    expect(resolveConnectDirection('a', 'b', null, null)).toEqual(['a', 'b']);
    expect(resolveConnectDirection('a', 'b')).toEqual(['a', 'b']);
  });

  it('不再按 x 坐标翻转：右侧节点拖到左侧节点保持拖拽方向（可画回边）', () => {
    // 画布语义里 b 在 a 右边也一样：拖 a→b 就是 a→b（修复前会被翻成 b→a）
    expect(resolveConnectDirection('a', 'b', 'out', 'in')).toEqual(['a', 'b']);
  });
});
