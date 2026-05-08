/**
 * CapabilitiesEditor — Story 8.3b (AC2)
 *
 * pill/tag 列表：回车添加 capability，× 删除，最多 20 条。
 * 直接写回父组件的 onChange 回调（不持有草稿 state，由 RoleProfilePanel 管理）。
 */
import { useState, KeyboardEvent } from 'react';

interface CapabilitiesEditorProps {
  capabilities: string[];
  onChange: (next: string[]) => void;
}

const MAX = 20;

export function CapabilitiesEditor({ capabilities, onChange }: CapabilitiesEditorProps) {
  const [input, setInput] = useState('');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (capabilities.length >= MAX) return;
    onChange([...capabilities, trimmed]);
    setInput('');
  }

  function remove(idx: number) {
    onChange(capabilities.filter((_, i) => i !== idx));
  }

  return (
    <div data-testid="capabilities-editor">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {capabilities.map((cap, i) => (
          <span
            key={`${cap}-${i}`}
            className="flex items-center gap-1 rounded-[5px] border border-sf-accent/50 bg-sf-accent-tint px-2 py-0.5 font-mono text-[11px] text-sf-accent-bright"
            data-testid={`capability-pill-${i}`}
          >
            {cap}
            <button
              type="button"
              onClick={() => remove(i)}
              className="ml-0.5 text-sf-fg4 hover:text-sf-reject"
              aria-label={`Remove capability ${cap}`}
              data-testid={`capability-remove-${i}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {capabilities.length >= MAX ? (
        <p className="font-mono text-[10px] text-sf-fg5" data-testid="capabilities-max-msg">
          最多 {MAX} 条
        </p>
      ) : (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入描述，回车添加"
          data-testid="capabilities-input"
          className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-2.5 py-1.5 font-mono text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
        />
      )}

      {/* P6: show empty hint only when both capabilities list and input are empty */}
      {capabilities.length === 0 && input === '' && (
        <p className="mt-1.5 font-mono text-[10px] text-sf-fg5" data-testid="capabilities-empty">
          + 描述该角色的能力（如"撰写研究报告"）
        </p>
      )}
    </div>
  );
}
