/**
 * settings/primitives.tsx — 设置页的通用控件。
 *
 * 只有「长什么样」，没有一句文案：标题、说明、选项名都由调用方（分区组件）
 * 从 content/settings.ts 取好再传进来。样式在 styles/settings.css 的 .st-* 段。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

/** 一行设置：左侧标题 + 说明，右侧控件。 */
export function Row({
  label,
  note,
  children,
  stacked,
}: {
  label: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  /** 控件换到下一行（输入框、分段控件这种宽的）。 */
  stacked?: boolean;
}) {
  return (
    <div className="st-row" data-stacked={stacked ? 'true' : undefined}>
      <div className="st-row-main">
        <span className="st-row-label">{label}</span>
        {note ? <span className="st-row-note">{note}</span> : null}
      </div>
      {children ? <div className="st-row-ctrl">{children}</div> : null}
    </div>
  );
}

/** 开关。无障碍上用 role=switch + aria-checked。 */
export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      className="st-switch"
      data-on={on ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <i />
    </button>
  );
}

/** 分段控件：选项少、要一眼看全时用（密度、日期格式）。 */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-active={value === o.value ? 'true' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 下拉：选项多时用（引用样式、时区）。 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <span className="st-select">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <i aria-hidden="true" />
    </span>
  );
}

/** 单行输入。 */
export function Field({
  value,
  onChange,
  onBlur,
  placeholder,
  label,
  type = 'text',
  mono,
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  mono?: boolean;
}) {
  return (
    <input
      className="st-input"
      data-mono={mono ? 'true' : undefined}
      aria-label={label}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  );
}

/** 用量条（知识 / 记忆容量）。 */
export function Meter({ used, cap, tone }: { used: number; cap: number; tone?: string }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <span className="st-meter" data-tone={tone} data-full={pct >= 85 ? 'true' : undefined}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

/** 状态徽标。`state` 只是语义，颜色由 CSS 决定。 */
export function Tag({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'mute' | 'accent';
  children: ReactNode;
}) {
  return (
    <span className="st-tag" data-tone={tone}>
      {children}
    </span>
  );
}

/** 分区内的分组标题。 */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st-group">
      <h3 className="st-group-title">{title}</h3>
      {children}
    </section>
  );
}

/** 带色块的小图标（连接器 / 供应商 / 记忆分区共用）。 */
export function Tile({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className="st-tile" data-tone={tone}>
      {children}
    </span>
  );
}

/** 勾选标记（连接器授权态、模型默认项）。 */
export function Tick() {
  return (
    <i className="st-tick">
      <Check size={10} strokeWidth={3} />
    </i>
  );
}

/** 一次性提示（保存完 / 重扫完）：返回 [当前提示, 触发函数]，到点自动消失。 */
export function useFlash(ms = 1800): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const flash = useCallback(
    (next: string) => {
      setText(next);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setText(null), ms);
    },
    [ms],
  );
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return [text, flash];
}
