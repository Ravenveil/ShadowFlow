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
 */
import { AgentAvatar } from '../avatar';
import type { PolicyMatrix as Matrix, PolicyState } from '../data/types';

export const POLICY_META: Record<PolicyState, { label: string; mark: string }> = {
  permit: { label: '直通', mark: '●' },
  warn: { label: '需复核', mark: '▲' },
  deny: { label: '禁止', mark: '✕' },
};

const RANK: Record<PolicyState, number> = { permit: 1, warn: 2, deny: 3 };
const CYCLE: PolicyState[] = ['permit', 'warn', 'deny'];

export interface RosterItem {
  id: string;
  name: string;
  role: string;
  /** 行头用的短名（角色缩写，2 字最佳）；缺省回落 name。 */
  short?: string;
}

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
            <th className="pm-corner" title="行 = 发起方 · 列 = 接收方">
              行→列
            </th>
            {roster.map((a) => (
              <th key={a.id} title={`${a.name} · ${a.role}`}>
                <AgentAvatar label={a.role} size={20} status={false} />
              </th>
            ))}
            <th className="pm-sum-h">最严</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((from) => {
            const worst = rowWorst(from.id);
            return (
              <tr key={from.id}>
                <th className="pm-rowhead" title={`${from.name} · ${from.role}`}>
                  <AgentAvatar label={from.role} size={18} status={false} />
                  <span className="pm-rowhead-name">{from.short ?? from.name}</span>
                </th>
                {roster.map((to) => {
                  if (from.id === to.id) return <td key={to.id} className="pm-self" />;
                  const st = cell(from.id, to.id);
                  return (
                    <td key={to.id}>
                      <button
                        type="button"
                        className={`pm-cell${st ? ` is-${st}` : ''}`}
                        onClick={() => cycle(from.id, to.id)}
                        title={
                          st
                            ? `${from.name} → ${to.name}：${POLICY_META[st].label}（点击切换）`
                            : `${from.name} → ${to.name}：未配置（点击设限）`
                        }
                        aria-label={`${from.name} to ${to.name}: ${st ?? 'none'}`}
                      >
                        {st ? POLICY_META[st].mark : '·'}
                      </button>
                    </td>
                  );
                })}
                <td className="pm-sum">
                  {worst ? (
                    <span className={`pm-chip is-${worst}`}>{POLICY_META[worst].label}</span>
                  ) : null}
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
            {POLICY_META[s].label}
          </span>
        ))}
        <span className="pm-stat-total">
          共 {counts.permit + counts.warn + counts.deny} 条已配置
        </span>
      </div>

      <div className="pm-legend">
        {CYCLE.map((s) => (
          <span key={s} className="pm-legend-item">
            <i className={`pm-legend-dot is-${s}`}>{POLICY_META[s].mark}</i>
            {POLICY_META[s].label}
          </span>
        ))}
      </div>
      <p className="pm-hint">点格子循环：直通 → 需复核 → 禁止 → 清除。限制会同步染到工作流连线。</p>

      <div className="pm-note">
        <b>这套矩阵在论文里管什么</b>
        <p>
          每个格子是「A 的产出，B 能不能直接当真」。设成「禁止」，B 就不能拿 A 的结论当证据，
          双向都受限；改动会立刻反映到工作流连线的颜色上。
        </p>
      </div>
    </div>
  );
}

export default PolicyMatrix;
