/**
 * PolicyMatrix — 右栏「策略举证」矩阵（对齐旧 neo TeamPanel 的协作策略）。
 *
 * 语义（与后端 policy-gate 同向）：行 = 发起方，列 = 接收方。
 * 一个格子回答的是「A 的产出，B 能不能直接拿去用」：
 *   permit 直通  ·  warn 需 PI 复核  ·  deny 禁止引用
 * 换到论文场景，「举证」就是这个意思 —— 谁的结论可以被谁当作证据。
 *
 * 交互沿用旧版：点格子循环 未配置 → permit → warn → deny → 未配置；
 * 行尾 chip 给出该行最严态（deny > warn > permit）的一眼摘要。
 * 未落库前只改本地草稿（父组件持有），有 diff 才出现「保存」。
 *
 * 组件只认 roster 与矩阵，不含任何具体人名/角色；文案在 `content/app.ts` 的 POLICY。
 */
import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import { POLICY } from '../content/app';
import type { PolicyMatrix as Matrix, PolicyState, RosterMember } from '../data/types';

/** 三态排序（取最严）与点击循环顺序 —— 业务语义，改这里即可调整交互。 */
const RANK: Record<PolicyState, number> = { permit: 1, warn: 2, deny: 3 };
const CYCLE: PolicyState[] = ['permit', 'warn', 'deny'];

/** 矩阵只关心这几个字段，收窄参数便于复用。 */
export type RosterItem = Pick<RosterMember, 'id' | 'name' | 'role' | 'short'>;

export function PolicyMatrix({
  roster,
  value,
  onChange,
}: {
  roster: readonly RosterItem[];
  value: Matrix;
  onChange: (next: Matrix) => void;
}) {
  const cell = (from: string, to: string): PolicyState | null =>
    (value?.[from]?.[to] as PolicyState | undefined) ?? null;

  const cycle = (from: string, to: string) => {
    const next: Matrix = { ...value };
    const row = { ...(next[from] ?? {}) };
    const cur = row[to];
    if (!cur) row[to] = 'permit';
    else {
      const after = CYCLE[CYCLE.indexOf(cur) + 1];
      if (after) row[to] = after;
      else delete row[to];
    }
    if (Object.keys(row).length === 0) delete next[from];
    else next[from] = row;
    onChange(next);
  };

  /** 行最严态（用于右侧 chip；全空返回 null）。 */
  const rowWorst = (from: string): PolicyState | null => {
    let worst: PolicyState | null = null;
    for (const o of roster) {
      if (o.id === from) continue;
      const s = cell(from, o.id);
      if (s && (!worst || RANK[s] > RANK[worst])) worst = s;
    }
    return worst;
  };

  /** 全矩阵计数（图例上方的一行摘要，让「限制了几条」一眼可见）。 */
  const counts: Record<PolicyState, number> = { permit: 0, warn: 0, deny: 0 };
  for (const [from, row] of Object.entries(value ?? {})) {
    for (const [to, st] of Object.entries(row ?? {})) {
      if (from === to) continue;
      if (st in counts) counts[st] += 1;
    }
  }

  return (
    <div className="pm">
      <table className="pm-table">
        <thead>
          <tr>
            <th className="pm-corner" title={POLICY.cornerTitle}>
              {POLICY.corner}
            </th>
            {roster.map((a) => (
              <th key={a.id} title={`${a.name} · ${a.role}`}>
                <AgentAvatar label={a.role} size={AVATAR_SIZE.md} status={false} />
              </th>
            ))}
            <th className="pm-sum-h">{POLICY.worst}</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((from) => {
            const worst = rowWorst(from.id);
            return (
              <tr key={from.id}>
                <th className="pm-rowhead" title={`${from.name} · ${from.role}`}>
                  <AgentAvatar label={from.role} size={AVATAR_SIZE.row} status={false} />
                  <span className="pm-rowhead-name">{from.short ?? from.name}</span>
                </th>
                {roster.map((to) => {
                  if (from.id === to.id) return <td key={to.id} className="pm-self" />;
                  const st = cell(from.id, to.id);
                  const meta = st ? POLICY.states[st] : null;
                  return (
                    <td key={to.id}>
                      <button
                        type="button"
                        className={`pm-cell${st ? ` is-${st}` : ''}`}
                        onClick={() => cycle(from.id, to.id)}
                        title={POLICY.cellTitle(from.name, to.name, meta?.label)}
                        aria-label={POLICY.cellAria(from.name, to.name, st)}
                      >
                        {meta ? meta.mark : '·'}
                      </button>
                    </td>
                  );
                })}
                <td className="pm-sum">
                  {worst ? <span className={`pm-chip is-${worst}`}>{POLICY.states[worst].label}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="pm-stat">
        {CYCLE.map((s) => (
          <span key={s} className={`pm-stat-item is-${s}`}>
            <b>{counts[s]}</b>
            {POLICY.states[s].label}
          </span>
        ))}
        <span className="pm-stat-total">{POLICY.total(counts.permit + counts.warn + counts.deny)}</span>
      </div>

      <div className="pm-legend">
        {CYCLE.map((s) => (
          <span key={s} className="pm-legend-item">
            <i className={`pm-legend-dot is-${s}`}>{POLICY.states[s].mark}</i>
            {POLICY.states[s].label}
          </span>
        ))}
      </div>
      <p className="pm-hint">{POLICY.hint}</p>

      <div className="pm-note">
        <b>{POLICY.noteTitle}</b>
        <p>{POLICY.noteBody}</p>
      </div>
    </div>
  );
}

export default PolicyMatrix;
