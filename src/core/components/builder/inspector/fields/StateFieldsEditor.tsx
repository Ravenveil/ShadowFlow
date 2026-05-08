/**
 * StateFieldsEditor — Story 8.3b (AC5)
 *
 * 持久状态字段列表：name（字母/数字/下划线校验）+ type 下拉 + default（boolean→toggle）。
 */
import type { StateField } from '../../../../../common/types/agent-builder';

interface StateFieldsEditorProps {
  state_fields: StateField[];
  onChange: (next: StateField[]) => void;
}

const NAME_RE = /^[a-zA-Z0-9_]*$/;
const MAX_FIELDS = 20;

function emptyField(): StateField {
  return { name: '', type: 'string', default: '' };
}

export function StateFieldsEditor({ state_fields, onChange }: StateFieldsEditorProps) {
  function addField() {
    // P7: enforce max fields limit
    if (state_fields.length >= MAX_FIELDS) return;
    onChange([...state_fields, emptyField()]);
  }

  function removeField(idx: number) {
    onChange(state_fields.filter((_, i) => i !== idx));
  }

  function patchField(idx: number, patch: Partial<StateField>) {
    const updated = state_fields.map((f, i) => {
      if (i !== idx) return f;
      const next = { ...f, ...patch };
      // 当 type 切换到 boolean 时，把 default 归一化
      if (patch.type === 'boolean' && typeof next.default !== 'boolean') {
        next.default = false;
      }
      // 当 type 从 boolean 切出时，把 default 转为空字符串
      if (patch.type && patch.type !== 'boolean' && typeof f.default === 'boolean') {
        next.default = '';
      }
      return next;
    });
    onChange(updated);
  }

  return (
    <div data-testid="state-fields-editor">
      {state_fields.length === 0 && (
        <p className="mb-2 font-mono text-[10px] text-sf-fg5" data-testid="state-fields-empty">
          + 添加持久状态变量（Persona/NPC Kit 必需）
        </p>
      )}

      <div className="flex flex-col gap-2">
        {state_fields.map((field, i) => {
          const nameInvalid = field.name !== '' && !NAME_RE.test(field.name);
          return (
            <div
              key={i}
              className="rounded-[7px] border border-sf-border bg-sf-elev1 p-2"
              data-testid={`state-field-row-${i}`}
            >
              <div className="flex items-center gap-2">
                {/* name */}
                <div className="flex flex-1 flex-col">
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => patchField(i, { name: e.target.value })}
                    placeholder="变量名"
                    data-testid={`state-field-name-${i}`}
                    className={[
                      'w-full rounded-[5px] border bg-sf-elev2 px-2 py-1 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:outline-none',
                      nameInvalid
                        ? 'border-sf-reject focus:border-sf-reject'
                        : 'border-sf-border focus:border-sf-accent',
                    ].join(' ')}
                  />
                  {nameInvalid && (
                    <span
                      className="mt-0.5 font-mono text-[9px] text-sf-reject"
                      data-testid={`state-field-name-error-${i}`}
                    >
                      仅允许字母、数字、下划线
                    </span>
                  )}
                </div>

                {/* type */}
                <select
                  value={field.type}
                  onChange={(e) =>
                    patchField(i, {
                      type: e.target.value as StateField['type'],
                    })
                  }
                  data-testid={`state-field-type-${i}`}
                  className="rounded-[5px] border border-sf-border bg-sf-elev2 px-2 py-1 font-mono text-[11px] text-sf-fg1 focus:border-sf-accent focus:outline-none"
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="json">json</option>
                </select>

                {/* default */}
                {field.type === 'boolean' ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={field.default === true}
                    onClick={() => patchField(i, { default: !field.default })}
                    data-testid={`state-field-default-toggle-${i}`}
                    className={[
                      'h-5 w-9 rounded-full border transition-colors',
                      field.default === true
                        ? 'border-sf-accent bg-sf-accent'
                        : 'border-sf-border bg-sf-elev2',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'block h-3 w-3 rounded-full bg-white transition-transform mx-0.5',
                        field.default === true ? 'translate-x-4' : 'translate-x-0',
                      ].join(' ')}
                    />
                  </button>
                ) : (
                  <input
                    type="text"
                    value={String(field.default ?? '')}
                    onChange={(e) =>
                      patchField(i, {
                        // P3: parse to number when type is 'number'
                        default: field.type === 'number'
                          ? (parseFloat(e.target.value) || 0)
                          : e.target.value,
                      })
                    }
                    placeholder="默认值"
                    data-testid={`state-field-default-${i}`}
                    className="w-20 rounded-[5px] border border-sf-border bg-sf-elev2 px-2 py-1 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
                  />
                )}

                <button
                  type="button"
                  onClick={() => removeField(i)}
                  className="text-[12px] text-sf-fg5 hover:text-sf-reject"
                  aria-label={`Remove state field ${field.name}`}
                  data-testid={`state-field-remove-${i}`}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {state_fields.length < MAX_FIELDS ? (
        <button
          type="button"
          onClick={addField}
          data-testid="state-fields-add"
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-[7px] border border-dashed border-sf-border py-1.5 font-mono text-[10px] text-sf-fg4 hover:text-sf-fg2"
        >
          ＋ 添加状态变量
        </button>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-sf-fg5" data-testid="state-fields-max-msg">
          最多 {MAX_FIELDS} 个
        </p>
      )}
    </div>
  );
}
