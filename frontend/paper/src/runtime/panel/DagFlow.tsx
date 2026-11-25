/**
 * DagFlow — 右栏「工作流」DAG（窄栏竖排）。
 *
 * 为什么竖排：右栏只有 300 出头，横排 6 个节点必然缩成一排小方块；
 * 论文流水线本身是「串行主线 + 中段并行复核 + 末段审批门」，
 * 竖排正好把并行分支摆成左右两列。
 *
 * 布局是数据：节点自带 `layout: { x, y, w, h }`（设计坐标，画布尺寸由 canvas 给），
 * 组件不认识 n1..n6 这类 id；缺坐标的节点自动按顺序竖排。
 *
 * 策略联动：边上按「上游 owner → 下游 owner」查矩阵（双向取更严），
 * 于是策略举证里把某对设成 deny，那条连线立刻变红。
 */
import { useMemo, useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { DAG } from '@/shared/content/app';
import { IconShield } from '@/shared/ui/icons';
import type {
  DagCanvasSize,
  DagEdgeDef,
  DagNodeDef,
  PolicyMatrix,
  PolicyState,
  RosterMember,
} from '@/shared/data/types';

type RosterItem = Pick<RosterMember, 'id' | 'name' | 'role' | 'short'>;

/** 无坐标时的兜底排布（竖向单列）。 */
const AUTO = { x: 24, w: 160, h: 44, gap: 22, top: 8 };

const RANK: Record<PolicyState, number> = { permit: 1, warn: 2, deny: 3 };

type Box = { x: number; y: number; w: number; h: number };

/** 节点坐标：优先读数据里的 layout，没有就按出现顺序竖排。 */
function layoutOf(nodes: DagNodeDef[], canvas: DagCanvasSize): Map<string, Box> {
  const map = new Map<string, Box>();
  const colW = Math.min(AUTO.w, canvas.w - AUTO.x * 2);
  nodes.forEach((n, i) => {
    map.set(
      n.id,
      n.layout ?? {
        x: (canvas.w - colW) / 2,
        y: AUTO.top + i * (AUTO.h + AUTO.gap),
        w: colW,
        h: AUTO.h,
      },
    );
  });
  return map;
}

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
function edgePath(a: Box, b: Box): string {
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const y2 = b.y;
  if (Math.abs(x1 - x2) < 1) return `M${x1},${y1} L${x1},${y2}`;
  const mid = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`;
}

export function DagFlow({
  nodes,
  edges,
  canvas,
  policy,
  roster,
}: {
  nodes: DagNodeDef[];
  edges: DagEdgeDef[];
  canvas: DagCanvasSize;
  policy: PolicyMatrix;
  roster: readonly RosterItem[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const box = useMemo(() => layoutOf(nodes, canvas), [nodes, canvas]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const pairs = useMemo(() => pairPolicy(policy), [policy]);
  /** owner 是 roster id，头像与显示名统一走 roster（与策略矩阵同源）。 */
  const roleOf = useMemo(() => {
    const m = new Map(roster.map((r) => [r.id, r.role]));
    return (id: string) => m.get(id) ?? id;
  }, [roster]);

  /** 审批门节点 = 有「审批」交接进来的节点；门在入口，不在出口。 */
  const gates = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) if (e.mode === 'approve') set.add(e.to);
    return set;
  }, [edges]);

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
      {/* 画布形状跟着数据走：右栏是窄竖图，整页是宽横图，同一份节点不会被拉伸。 */}
      <div className="dag-canvas" style={{ aspectRatio: `${canvas.w} / ${canvas.h}` }}>
        <svg className="dag-edges" viewBox={`0 0 ${canvas.w} ${canvas.h}`} preserveAspectRatio="none" aria-hidden>
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
            const A = box.get(e.from);
            const B = box.get(e.to);
            if (!A || !B) return null;
            const p = edgePolicy(e);
            // 两个维度分开：形状（实/虚）讲交接方式，颜色讲策略。
            const modeCls = `is-${e.mode}`;
            return (
              <path
                key={`${e.from}-${e.to}`}
                className={`dag-edge ${modeCls}${p ? ` is-policy-${p}` : ''}`}
                d={edgePath(A, B)}
                markerEnd="url(#dag-arrow)"
              />
            );
          })}
        </svg>

        {nodes.map((n) => {
          const b = box.get(n.id);
          if (!b) return null;
          const pct = {
            left: `${(b.x / canvas.w) * 100}%`,
            top: `${(b.y / canvas.h) * 100}%`,
            width: `${(b.w / canvas.w) * 100}%`,
            height: `${(b.h / canvas.h) * 100}%`,
          };
          return (
            <button
              key={n.id}
              type="button"
              className="dag-node"
              data-status={n.status}
              data-gate={gates.has(n.id) ? 'true' : undefined}
              data-on={active === n.id ? 'true' : undefined}
              style={pct}
              onClick={() => setActive((cur) => (cur === n.id ? null : n.id))}
              title={`${n.label} · ${roleOf(n.owner)} · ${DAG.status[n.status]}${
                n.detail ? `${DAG.selSeparator}${n.detail}` : ''
              }`}
            >
              {gates.has(n.id) ? (
                <span className="dag-node-gate" title={DAG.gateNode}>
                  <IconShield size={11} />
                </span>
              ) : null}
              <AgentAvatar label={roleOf(n.owner)} size={AVATAR_SIZE.sm} status={false} />
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
            <b>{sel.label}</b>
            {DAG.selSeparator}
            {roleOf(sel.owner)}
            {DAG.selSeparator}
            {DAG.status[sel.status]}
            {sel.role && sel.role !== roleOf(sel.owner) ? `${DAG.selSeparator}${sel.role}` : ''}
            {sel.detail ? (
              <span className="dag-foot-detail">
                {DAG.lastDelivery}
                {DAG.selSeparator}
                {sel.detail}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="dag-foot-hint">{DAG.footHint(nodes.length, edges.length)}</span>
        )}
      </div>

      <div className="dag-legend">
        {(Object.keys(DAG.legendMode) as (keyof typeof DAG.legendMode)[]).map((mode) => (
          <span key={mode}>
            <i className={`dag-legend-line is-${mode}`} />
            {DAG.legendMode[mode]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default DagFlow;
