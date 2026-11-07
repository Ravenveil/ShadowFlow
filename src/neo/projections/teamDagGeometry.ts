/**
 * teamDagGeometry — DAG 编辑器边几何/连线方向纯函数（2026-11-07
 * 「边连接还是奇怪，删除后边还在」修复）。
 *
 * 背景（真实数据复盘）：「送审 strategist→reviewer + 驳回回炉
 * reviewer→strategist」这种互逆边对里，逆着 x 方向的那条走
 * getSmoothStepPath 会退化成一条**穿过节点身体的水平直线**，与顺向边完全
 * 画在同一条线上 —— 两颗「×」删边药丸同点堆叠，点掉上面那条下面还留着
 * （用户看到的「删除后边还在」），连线观感也莫名其妙。
 *
 * 修复：
 *   - computeTeamDagEdgePath：回边（target 在 source 左侧、同一行带内）
 *     改走上方 U 形回弧（圆角 14，与 smoothstep 观感一致），从节点列上方
 *     跨过，与顺向边彻底分开；顺向 / 纵向跨行边仍走 smoothstep 折线。
 *   - resolveConnectDirection：连线方向 = 交接语义（source 产出交给
 *     target），不再按画布 x 坐标强行翻转 —— 翻转让「驳回回炉」这类回边
 *     永远画不对（拖出来的方向被静默改写或丢弃）。n8n 式手柄归一：从
 *     出口手柄拖到入口手柄按拖拽方向；从入口手柄起手、落到出口手柄 =
 *     用户在画反向边，两端调换。
 *
 * 纯函数（仅 getSmoothStepPath 一个 reactflow 运行时依赖，可 mock 直测）。
 */
import { getSmoothStepPath, type Position } from 'reactflow';

export interface EdgePathGeom {
  path: string;
  labelX: number;
  labelY: number;
}

/** 回边判定阈值：x 须明显回退，y 须在同一行带内（跨行的纵向边仍走折线）。 */
const BACK_EDGE_MIN_DX = 24;
const BACK_EDGE_MAX_DY = 64;
const ARC_R = 14;
const ARC_GAP = 40;
const ARC_RISE = 64;

/**
 * 边路径几何：
 *   - 回边（targetX 明显小于 sourceX 且 |dy| 小）→ 上方 U 形回弧
 *   - 其余（顺向 / 纵向跨行）→ getSmoothStepPath 圆角折线
 * 药丸（label）位置取路径中段：回弧取弧顶中点，折线取 smoothstep 中点。
 */
export function computeTeamDagEdgePath(props: {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
}): EdgePathGeom {
  const { sourceX, sourceY, targetX, targetY } = props;
  const isBackEdge =
    targetX < sourceX - BACK_EDGE_MIN_DX && Math.abs(targetY - sourceY) < BACK_EDGE_MAX_DY;
  if (!isBackEdge) {
    const [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: 14 });
    return { path, labelX, labelY };
  }
  // U 形回弧：右出 → 上抬 → 左跨 → 下落 → 右进（终点从 target 左侧入线，
  // 与 targetPosition=Left 的手柄朝向一致，箭头方向即语义方向）
  const top = Math.min(sourceY, targetY) - ARC_RISE;
  const x1 = sourceX + ARC_GAP;
  const x2 = targetX - ARC_GAP;
  const r = ARC_R;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${x1 - r} ${sourceY}`,
    `Q ${x1} ${sourceY} ${x1} ${sourceY - r}`,
    `L ${x1} ${top + r}`,
    `Q ${x1} ${top} ${x1 - r} ${top}`,
    `L ${x2 + r} ${top}`,
    `Q ${x2} ${top} ${x2} ${top + r}`,
    `L ${x2} ${targetY - r}`,
    `Q ${x2} ${targetY} ${x2 + r} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(' ');
  return { path, labelX: (x1 + x2) / 2, labelY: top };
}

/**
 * 连线方向语义：边的方向 = 交接语义（source 把产出交给 target）。
 * 默认按拖拽方向（起点 = source）；只有「从入口手柄起手、落到出口手柄」
 * 这一种 n8n 式反向拖法才调换两端（用户在画「B → A」）。
 * 同类型手柄互拖（out→out / in→in）方向歧义，按拖拽方向保留。
 */
export function resolveConnectDirection(
  source: string,
  target: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): [string, string] {
  if (sourceHandle === 'in' && targetHandle === 'out') return [target, source];
  return [source, target];
}
