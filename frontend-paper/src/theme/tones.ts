/**
 * tones.ts — 语义色调的**类型层**。
 *
 * 色值真源只有一处：`src/theme/tokens.css` 里的 `--tone-*`（三套主题各一组）。
 * 组件想上色，只允许输出 `data-tone="teal"` 这类语义标签，由 CSS 决定具体颜色 ——
 * 于是「换色」= 改 tokens.css 一行，不必回头翻组件。
 *
 * 只有 dicebear 生成头像时需要真正的 hex（SVG 里没法用 var()），
 * 那份表单独放在 `src/data/identities.ts`，并在此声明成同一套枚举。
 */
export const TONE_NAMES = [
  'accent',
  'teal',
  'violet',
  'pink',
  'blue',
  'amber',
  'green',
  'red',
  'slate',
] as const;

export type ToneName = (typeof TONE_NAMES)[number];

export function isTone(v: string | null | undefined): v is ToneName {
  return !!v && (TONE_NAMES as readonly string[]).includes(v);
}

/** 给元素挂上语义色调（消费方是 CSS：`[data-tone='x'] { background: var(--tone-x) }`）。 */
export function toneAttr(tone: ToneName | undefined): { 'data-tone'?: ToneName } {
  return tone ? { 'data-tone': tone } : {};
}
