/**
 * HandoffRulesEditor — Story 8.3b (AC3)
 *
 * 结构化 handoff 规则列表：trigger 文本 + target_role 下拉（动态来自 blueprint roles）。
 * target_role 下拉选项实时联动：从外部传入的 availableRoles 派生。
 */
import type { HandoffRule } from '../../../../../common/types/agent-builder';

interface HandoffRulesEditorProps {
  handoff_rules: HandoffRule[];
  /** 当前 blueprint 中所有角色，用于 target_role 下拉 */
  availableRoles: { role_id: string; name: string }[];
  onChange: (next: HandoffRule[]) => void;
}

const MAX = 10;

function emptyRule(): HandoffRule {
  return { trigger: '', target_role: '' };
}

export function HandoffRulesEditor({
  handoff_rules,
  availableRoles,
  onChange,
}: HandoffRulesEditorProps) {
  function addRule() {
    if (handoff_rules.length >= MAX) return;
    onChange([...handoff_rules, emptyRule()]);
  }

  function removeRule(idx: number) {
    onChange(handoff_rules.filter((_, i) => i !== idx));
  }

  function patchRule(idx: number, patch: Partial<HandoffRule>) {
    onChange(handoff_rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div data-testid="handoff-rules-editor">
      {handoff_rules.length === 0 && (
        <p className="mb-2 font-mono text-[10px] text-sf-fg5" data-testid="handoff-rules-empty">
          + 添加显式 Handoff 触发条件
        </p>
      )}

      <div className="flex flex-col gap-2">
        {handoff_rules.map((rule, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-[7px] border border-sf-border bg-sf-elev1 p-2"
            data-testid={`handoff-rule-row-${i}`}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <input
                type="text"
                value={rule.trigger}
                onChange={(e) => patchRule(i, { trigger: e.target.value })}
                placeholder="触发条件，如：需要代码执行时"
                data-testid={`handoff-trigger-${i}`}
                className="w-full rounded-[5px] border border-sf-border bg-sf-elev2 px-2 py-1 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
              />
              <select
                value={rule.target_role}
                onChange={(e) => patchRule(i, { target_role: e.target.value })}
                data-testid={`handoff-target-role-${i}`}
                className="w-full rounded-[5px] border border-sf-border bg-sf-elev2 px-2 py-1 font-mono text-[11px] text-sf-fg1 focus:border-sf-accent focus:outline-none"
              >
                <option value="">— 选择目标角色 —</option>
                {availableRoles.map((r) => (
                  <option key={r.role_id} value={r.role_id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => removeRule(i)}
              className="mt-0.5 text-[12px] text-sf-fg5 hover:text-sf-reject"
              aria-label={`Remove handoff rule ${i}`}
              data-testid={`handoff-rule-remove-${i}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {handoff_rules.length < MAX ? (
        <button
          type="button"
          onClick={addRule}
          data-testid="handoff-rules-add"
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-[7px] border border-dashed border-sf-border py-1.5 font-mono text-[10px] text-sf-fg4 hover:text-sf-fg2"
        >
          ＋ 添加规则
        </button>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-sf-fg5" data-testid="handoff-rules-max-msg">
          最多 {MAX} 条
        </p>
      )}
    </div>
  );
}
