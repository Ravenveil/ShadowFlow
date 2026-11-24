/**
 * PolicyMatrix — 右栏「策略举证」矩阵（搬自 frontend-paper）。
 *
 * 行 = 发起方，列 = 接收方；点格子循环 未配置 → 直通 → 需复核 → 禁止。
 * 组件只认成员与矩阵，文案在 content/panel.ts。
 */

import { PANEL } from "../content/panel";

export type PolicyState = "permit" | "warn" | "deny";
export type PolicyMatrixValue = Record<string, Record<string, PolicyState>>;

export interface PolicyMember {
  id: string;
  name: string;
  short?: string;
}

const RANK: Record<PolicyState, number> = { permit: 1, warn: 2, deny: 3 };
const CYCLE: PolicyState[] = ["permit", "warn", "deny"];

function initialsOf(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function PolicyMatrix({
  members,
  value,
  onChange,
}: {
  members: readonly PolicyMember[];
  value: PolicyMatrixValue;
  onChange: (next: PolicyMatrixValue) => void;
}) {
  const cell = (from: string, to: string): PolicyState | null => value?.[from]?.[to] ?? null;

  const cycle = (from: string, to: string) => {
    const next: PolicyMatrixValue = { ...value };
    const row = { ...(next[from] ?? {}) };
    const cur = row[to];
    if (!cur) row[to] = "permit";
    else {
      const after = CYCLE[CYCLE.indexOf(cur) + 1];
      if (after) row[to] = after;
      else delete row[to];
    }
    if (Object.keys(row).length === 0) delete next[from];
    else next[from] = row;
    onChange(next);
  };

  const rowWorst = (from: string): PolicyState | null => {
    let worst: PolicyState | null = null;
    for (const member of members) {
      if (member.id === from) continue;
      const state = cell(from, member.id);
      if (state && (!worst || RANK[state] > RANK[worst])) worst = state;
    }
    return worst;
  };

  const counts: Record<PolicyState, number> = { permit: 0, warn: 0, deny: 0 };
  for (const [from, row] of Object.entries(value ?? {})) {
    for (const [to, state] of Object.entries(row ?? {})) {
      if (from !== to && state in counts) counts[state] += 1;
    }
  }

  return (
    <div className="pm">
      <table className="pm-table">
        <thead>
          <tr>
            <th className="pm-corner">{PANEL.policyCorner}</th>
            {members.map((m) => (
              <th key={m.id} title={`${m.name}`}>
                <span className="pm-face">{initialsOf(m.name)}</span>
              </th>
            ))}
            <th className="pm-sum-h">{PANEL.policyWorst}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((from) => {
            const worst = rowWorst(from.id);
            return (
              <tr key={from.id}>
                <th className="pm-rowhead" title={from.name}>
                  <span className="pm-face">{from.short ?? initialsOf(from.name)}</span>
                  <span className="pm-rowhead-name">{from.short ?? from.name}</span>
                </th>
                {members.map((to) => {
                  if (from.id === to.id) return <td key={to.id} className="pm-self" />;
                  const state = cell(from.id, to.id);
                  return (
                    <td key={to.id}>
                      <button
                        type="button"
                        className={`pm-cell${state ? ` is-${state}` : ""}`}
                        onClick={() => cycle(from.id, to.id)}
                        title={state ? PANEL.policyStates[state].label : PANEL.policyUnset}
                      >
                        {state ? PANEL.policyStates[state].mark : "·"}
                      </button>
                    </td>
                  );
                })}
                <td className="pm-sum">
                  {worst ? (
                    <span className={`pm-chip is-${worst}`}>{PANEL.policyStates[worst].label}</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="pm-stat">
        {CYCLE.map((state) => (
          <span key={state} className={`pm-stat-item is-${state}`}>
            <b>{counts[state]}</b>
            {PANEL.policyStates[state].label}
          </span>
        ))}
        <span className="pm-stat-total">
          {PANEL.policyTotal(counts.permit + counts.warn + counts.deny)}
        </span>
      </div>
    </div>
  );
}
