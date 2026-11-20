/**
 * DagFlow — 右栏「工作流」DAG（对齐旧 neo 的 TeamDagCanvas 语义，改为窄栏竖排）。
 *
 * 为什么竖排：右栏只有 300 出头，横排 6 个节点必然缩成一排小方块；
 * 论文流水线本身是「串行主线 + 中段并行复核 + 末段审批门」，
 * 竖排正好把并行分支摆成左右两列，DAG 形状不用缩也读得懂。
 *
 * 策略联动（用户要求保留）：每个节点标了承担者 owner，边上按
 * 「上游 owner → 下游 owner」查策略矩阵（双向取更严），
 * 于是策略举证里把某对设成 deny，那条连线立刻变红 —— 和旧版一致。
 *
 * 节点用 HTML 绝对定位（头像复用 AgentAvatar），边用底层 SVG 画，
 * 坐标系统一按 308×348 设计，容器按百分比缩放。
 */
import { useMemo, useState } from 'react';
import { AgentAvatar } from '../avatar';
import type { DagEdgeDef, DagNodeDef, PolicyMatrix, PolicyState } from '../data/types';
import type { RosterItem } from './PolicyMatrix';

const W = 308;
const H = 348;

/** 节点框（设计坐标；与 mock 的 n1..n6 一一对应）。 */
const BOX: Record<string, { x: number; y: number; w: number; h: number }> = {
  n1: { x: 84, y: 0, w: 140, h: 44 },
  n2: { x: 84, y: 66, w: 140, h: 44 },
  n3: { x: 84, y: 132, w: 140, h: 44 },
  n4: { x: 16, y: 206, w: 132, h: 44 },
  n5: { x: 160, y: 206, w: 132, h: 44 },
  n6: { x: 84, y: 280, w: 140, h: 44 },
};

const RANK: Record<PolicyState, number> = { permit: 1, warn: 2, deny: 3 };

/** 成员对 → 更严策略态（双向同键，与后端染色口径一致）。 */
function pairPolicy(matrix: PolicyMatrix): Map<string, PolicyState> {
  const map = new Map<string, PolicyState>();
  for (const [from, row] of Object.entries(matrix ?? {})) {
    for (const [to, st] of Object.entries(row ?? {})) {
      if (from === to) continue;
      const key = [from, to].sort().join('|');
      const prev = map.get(key);
      if (!prev || RANK[st] > RANK[prev]) map.set(key, st);
    }
  }
  return map;
}

/** 边路径：同列直上直下，跨列走三次贝塞尔。 */
function edgePath(a: DagNodeDef, b: DagNodeDef): string {
  const A = BOX[a.id];
  const B = BOX[b.id];
  if (!A || !B) return '';
  const x1 = A.x + A.w / 2;
  const y1 = A.y + A.h;
  const x2 = B.x + B.w / 2;
  const y2 = B.y;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} L${x1},${y2}`;
  const mid = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`;
}

export function DagFlow({
  nodes,
  edges,
  policy,
  roster,
}: {
  nodes: DagNodeDef[];
  edges: DagEdgeDef[];
  policy: PolicyMatrix;
  roster: readonly RosterItem[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pairs = useMemo(() => pairPolicy(policy), [policy]);
  /** owner 是 roster id，头像与显示名统一走 roster（与策略矩阵同源）。 */
  const roleOf = useMemo(() => {
    const m = new Map(roster.map((r) => [r.id, r.role]));
    return (id: string) => m.get(id) ?? id;
  }, [roster]);

  /**
   * 边染色只表达「限制」：warn / deny 才上色，permit 属于默认直通，染绿会让
   * 满屏都是绿线，反而盖掉交接方式。同一个人内部交接不染（无策略可言）。
   */
  const edgePolicy = (e: DagEdgeDef): PolicyState | null => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b || a.owner === b.owner) return null;
    const p = pairs.get([a.owner, b.owner].sort().join('|')) ?? null;
    return p === 'permit' ? null : p;
  };

  const sel = active ? byId.get(active) ?? null : null;

  return (
    <div className="dag">
      <div className="dag-canvas">
        <svg
          className="dag-edges"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <marker
              id="dag-arrow"
              viewBox="0 0 8 8"
              refX="6.5"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="context-stroke" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const p = edgePolicy(e);
            // 两个维度分开：形状（实/虚）讲交接方式，颜色讲策略。
            // 旧版是二选一，结果「审批门」一旦被策略染色就看不出是审批门了。
            const modeCls =
              e.mode === 'approve'
                ? 'is-approve'
                : e.mode === 'conditional'
                  ? 'is-conditional'
                  : 'is-direct';
            return (
              <path
                key={`${e.from}-${e.to}`}
                className={`dag-edge ${modeCls}${p ? ` is-policy-${p}` : ''}`}
                d={edgePath(a, b)}
                markerEnd="url(#dag-arrow)"
              />
            );
          })}
        </svg>

        {nodes.map((n) => {
          const box = BOX[n.id];
          if (!box) return null;
          const pct = {
            left: `${(box.x / W) * 100}%`,
            top: `${(box.y / H) * 100}%`,
            width: `${(box.w / W) * 100}%`,
            height: `${(box.h / H) * 100}%`,
          };
          return (
            <button
              key={n.id}
              type="button"
              className="dag-node"
              data-status={n.status}
              data-on={active === n.id ? 'true' : undefined}
              style={pct}
              onClick={() => setActive((cur) => (cur === n.id ? null : n.id))}
              title={`${n.label} · ${roleOf(n.owner)}`}
            >
              <AgentAvatar label={roleOf(n.owner)} size={16} status={false} />
              <span className="dag-node-text">
                <span className="dag-node-label">{n.label}</span>
                <span className="dag-node-owner">{n.role}</span>
              </span>
              <i className="dag-node-dot" aria-hidden />
            </button>
          );
        })}
      </div>

      <div className="dag-foot">
        {sel ? (
          <span className="dag-foot-sel">
            <b>{sel.label}</b> · {roleOf(sel.owner)} ·{' '}
            {sel.status === 'done' ? '已完成' : sel.status === 'running' ? '执行中' : '等待中'}
            {sel.role ? ` · ${sel.role}` : ''}
          </span>
        ) : (
          <span className="dag-foot-hint">
            {nodes.length} 节点 · {edges.length} 边 · 线型看交接方式，颜色看策略举证
          </span>
        )}
      </div>

      <div className="dag-legend">
        <span>
          <i className="dag-legend-line is-direct" />
          直接交接
        </span>
        <span>
          <i className="dag-legend-line is-conditional" />
          条件
        </span>
        <span>
          <i className="dag-legend-line is-approve" />
          审批门
        </span>
      </div>
    </div>
  );
}

export default DagFlow;
