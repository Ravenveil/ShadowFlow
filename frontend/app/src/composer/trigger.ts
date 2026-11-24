/**
 * trigger.ts — `@` / `/` 触发的纯逻辑（无 React）。
 *
 *   - 触发符必须在文首或空白之后（`http://` 里的 `/` 不会弹菜单）
 *   - query = 触发符到「下一个空白」之间的连续串
 *   - 光标必须落在 query 内
 */

export type TriggerMode = "@" | "/";

export interface DetectedTrigger {
  mode: TriggerMode;
  query: string;
  start: number;
  end: number;
}

const isBlank = (ch: string) => ch === " " || ch === "\n" || ch === "\t";

export function detectTrigger(text: string, caret: number): DetectedTrigger | null {
  if (caret < 1 || caret > text.length) return null;
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (isBlank(ch)) return null;
    if (ch === "/" || ch === "@") {
      if (i > 0 && !isBlank(text[i - 1])) return null;
      let j = caret;
      while (j < text.length && !isBlank(text[j])) j += 1;
      return { mode: ch, query: text.slice(i + 1, j), start: i, end: j };
    }
    i -= 1;
  }
  return null;
}

export function replaceRange(
  text: string,
  start: number,
  end: number,
  replacement: string,
): { text: string; caret: number } {
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    caret: start + replacement.length,
  };
}

export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}
