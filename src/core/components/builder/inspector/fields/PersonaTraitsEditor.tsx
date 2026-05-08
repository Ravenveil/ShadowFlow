/**
 * PersonaTraitsEditor — Story 8.3b (AC4)
 *
 * key-value 对编辑器：key 带预设下拉提示，value 自由文本，× 删除行，最多 15 组。
 * 直接调用 onChange 写回 blueprint state。
 */

interface PersonaTraitsEditorProps {
  persona_traits: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

const MAX = 15;

const PRESET_KEYS = ['tone', 'style', 'language', 'formality', 'response_length', 'persona_name'];

export function PersonaTraitsEditor({ persona_traits, onChange }: PersonaTraitsEditorProps) {
  const entries = Object.entries(persona_traits);

  function addEntry() {
    if (entries.length >= MAX) return;
    // P1: use a unique temp key so multiple adds don't collapse to a single '' key
    const tempKey = `__new_${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
    onChange({ ...persona_traits, [tempKey]: '' });
  }

  function removeEntry(key: string) {
    const next = { ...persona_traits };
    delete next[key];
    onChange(next);
  }

  function patchKey(oldKey: string, newKey: string) {
    // P2: prevent silent data loss when renaming to an already-existing key
    if (newKey !== oldKey && newKey in persona_traits) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(persona_traits)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  }

  function patchValue(key: string, value: string) {
    onChange({ ...persona_traits, [key]: value });
  }

  return (
    <div data-testid="persona-traits-editor">
      {entries.length === 0 && (
        <p className="mb-2 font-mono text-[10px] text-sf-fg5" data-testid="persona-traits-empty">
          + 添加个性特征（如 tone: formal）
        </p>
      )}

      <div className="flex flex-col gap-2">
        {entries.map(([key, value], i) => (
          <div
            key={i}
            className="flex items-center gap-2"
            data-testid={`persona-trait-row-${i}`}
          >
            <input
              type="text"
              list={`persona-key-preset-${i}`}
              value={key}
              onChange={(e) => patchKey(key, e.target.value)}
              placeholder="key"
              data-testid={`persona-trait-key-${i}`}
              className="w-28 rounded-[5px] border border-sf-border bg-sf-elev1 px-2 py-1 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
            />
            <datalist id={`persona-key-preset-${i}`}>
              {PRESET_KEYS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <span className="text-sf-fg5 text-[10px]">:</span>
            <input
              type="text"
              value={value}
              onChange={(e) => patchValue(key, e.target.value)}
              placeholder="value"
              data-testid={`persona-trait-value-${i}`}
              className="flex-1 rounded-[5px] border border-sf-border bg-sf-elev1 px-2 py-1 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeEntry(key)}
              className="text-[12px] text-sf-fg5 hover:text-sf-reject"
              aria-label={`Remove trait ${key}`}
              data-testid={`persona-trait-remove-${i}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {entries.length < MAX ? (
        <button
          type="button"
          onClick={addEntry}
          data-testid="persona-traits-add"
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-[7px] border border-dashed border-sf-border py-1.5 font-mono text-[10px] text-sf-fg4 hover:text-sf-fg2"
        >
          ＋ 添加特征
        </button>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-sf-fg5" data-testid="persona-traits-max-msg">
          最多 {MAX} 组
        </p>
      )}
    </div>
  );
}
