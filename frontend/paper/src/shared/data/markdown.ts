/**
 * markdown.ts — 聊天消息 Markdown 子集解析器（纯函数、零依赖）。
 *
 * 2026-11-25 从 frontend/app/src/markdown.ts 原样迁入（逻辑一行未改）：
 * Agent 输出里的粗体/斜体/删除线/行内码/链接/裸 URL/ATX 标题、列表（含缩进
 * 嵌套）、表格、围栏代码块、引用、hr 全都要能认；段内单个换行按聊天习惯保留
 * 为 <br>（旧渲染是 pre-wrap，换行本身就是排版）。
 *
 * 输出 AST（MdBlock/MdInline），渲染层见 `runtime/chat/MarkdownText.tsx`
 * （AST → React 元素，不落 innerHTML → 天然免 XSS）。
 * 会话列表预览用 `stripMarkdown` 剥语法；链接白名单 `safeHref` 也在这里。
 *
 * 测试：`src/shared/data/markdown.test.ts`（vitest）。
 */

export type MdInline =
  | { t: "text"; v: string }
  | { t: "strong"; c: MdInline[] }
  | { t: "em"; c: MdInline[] }
  | { t: "del"; c: MdInline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: MdInline[] }
  | { t: "br" };

export type MdAlign = "left" | "center" | "right" | null;

export type MdBlock =
  | { t: "p"; c: MdInline[] }
  | { t: "h"; level: number; c: MdInline[] }
  | { t: "code"; lang: string; v: string }
  | { t: "quote"; c: MdBlock[] }
  | { t: "list"; ordered: boolean; start: number; items: MdBlock[][] }
  | { t: "table"; align: MdAlign[]; head: MdInline[][]; rows: MdInline[][][] }
  | { t: "hr" };

/** href 安全白名单：只放行 http/https/mailto（挡 javascript: 等伪协议）。 */
export function safeHref(href: string): string | null {
  const v = href.trim();
  if (/^(https?:\/\/|mailto:)/i.test(v)) return v;
  return null;
}

// ── 块级扫描 ──────────────────────────────────────────────────────────────

const RE_FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[ \t]*$/;
const RE_FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const RE_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const RE_HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const RE_QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const RE_LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;

function indentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n += 1;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

function stripUpTo(line: string, n: number): string {
  let i = 0;
  let removed = 0;
  while (i < line.length && removed < n) {
    if (line[i] === " ") removed += 1;
    else if (line[i] === "\t") removed += 4;
    else break;
    i += 1;
  }
  return line.slice(i);
}

function isBlockStart(line: string): boolean {
  return (
    RE_FENCE_OPEN.test(line) ||
    RE_HEADING.test(line) ||
    RE_HR.test(line) ||
    RE_QUOTE.test(line) ||
    RE_LIST_ITEM.test(line)
  );
}

/** 表格行拆格；无 `|` 返回 null（不算表格行）。 */
function splitTableRow(line: string): string[] | null {
  const s = line.trim();
  if (!s.includes("|")) return null;
  let body = s;
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  return body.split("|").map((c) => c.trim());
}

function isTableDelimRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function isTableStart(lines: string[], i: number): boolean {
  if (!lines[i] || !lines[i].includes("|")) return false;
  const head = splitTableRow(lines[i]);
  const delim = i + 1 < lines.length ? splitTableRow(lines[i + 1]) : null;
  return !!(head && delim && isTableDelimRow(delim));
}

export function parseMarkdown(text: string): MdBlock[] {
  return parseBlocks(text.replace(/\r\n?/g, "\n").split("\n"));
}

function parseBlocks(lines: string[]): MdBlock[] {
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 围栏代码块
    const fence = RE_FENCE_OPEN.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const minLen = fence[1].length;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length) {
        const close = RE_FENCE_CLOSE.exec(lines[i]);
        if (close && close[1][0] === marker && close[1].length >= minLen) {
          i += 1;
          break;
        }
        buf.push(lines[i]);
        i += 1;
      }
      out.push({ t: "code", lang: fence[2] || "", v: buf.join("\n") });
      continue;
    }

    // ATX 标题
    const h = RE_HEADING.exec(line);
    if (h) {
      out.push({ t: "h", level: h[1].length, c: parseInline(h[2]) });
      i += 1;
      continue;
    }

    // hr
    if (RE_HR.test(line)) {
      out.push({ t: "hr" });
      i += 1;
      continue;
    }

    // 引用（> 前缀递归）
    if (RE_QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const m = RE_QUOTE.exec(lines[i]);
        if (m) {
          buf.push(m[1]);
          i += 1;
        } else if (lines[i].trim() && !isBlockStart(lines[i]) && !isTableStart(lines, i)) {
          buf.push(lines[i]); // 懒续行
          i += 1;
        } else break;
      }
      out.push({ t: "quote", c: parseBlocks(buf) });
      continue;
    }

    // 表格（本行含 | 且下一行是分隔行）
    if (isTableStart(lines, i)) {
      const headCells = splitTableRow(lines[i])!;
      const delimCells = splitTableRow(lines[i + 1])!;
      const align: MdAlign[] = delimCells.map((c) =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null,
      );
      const head = headCells.map(parseInline);
      i += 2;
      const rows: MdInline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitTableRow(lines[i]);
        if (!cells) break;
        const fixed: string[] = [];
        for (let c = 0; c < head.length; c += 1) fixed.push(cells[c] ?? "");
        rows.push(fixed.map(parseInline));
        i += 1;
      }
      out.push({ t: "table", align, head, rows });
      continue;
    }

    // 列表（同缩进项 + 深缩进子内容并入项内递归）
    if (RE_LIST_ITEM.test(line)) {
      const { block, next } = parseListBlock(lines, i);
      out.push(block);
      i = next;
      continue;
    }

    // 段落：空行/新块起点/表格起点收口；段内单换行 → br
    const buf: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (!cur.trim()) break;
      if (buf.length > 0 && (isBlockStart(cur) || isTableStart(lines, i))) break;
      buf.push(cur);
      i += 1;
    }
    out.push({ t: "p", c: parseInline(buf.join("\n")) });
  }
  return out;
}

function parseListBlock(lines: string[], start: number): { block: MdBlock; next: number } {
  const first = RE_LIST_ITEM.exec(lines[start])!;
  const baseIndent = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const drafts: { contentIndent: number; lines: string[] }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = RE_LIST_ITEM.exec(line);
    if (m && indentOf(m[1]) === baseIndent) {
      drafts.push({ contentIndent: baseIndent + m[2].length + m[3].length, lines: [m[4]] });
      i += 1;
      continue;
    }
    const cur = drafts[drafts.length - 1];
    if (!line.trim()) {
      // 空行：后文仍在列表内（更深列表项或缩进续行）→ 作段落分隔保留
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j += 1;
      const nm = j < lines.length ? RE_LIST_ITEM.exec(lines[j]) : null;
      const stillIn =
        j < lines.length && ((nm && indentOf(nm[1]) >= baseIndent) || (!nm && indentOf(lines[j]) > baseIndent));
      if (!stillIn) break;
      cur.lines.push("");
      i = j;
      continue;
    }
    const ind = indentOf(line);
    if (m) {
      if (ind > baseIndent) {
        cur.lines.push(line); // 嵌套列表项并入项内
        i += 1;
        continue;
      }
      break; // 更浅缩进的列表项 → 交回外层
    }
    if (ind > baseIndent) {
      cur.lines.push(line); // 缩进续行/嵌套块
      i += 1;
      continue;
    }
    // 聊天风格收口：不带缩进的续行不并入列表项（CommonMark 懒续行会把
    // 「**小结**」这类行吞进上一项）——一行一条，收口回段落保持原排版
    break;
  }
  const items = drafts.map((d) => {
    const rest = d.lines.slice(1).map((l) => (l.trim() ? stripUpTo(l, d.contentIndent) : ""));
    return parseBlocks([d.lines[0], ...rest]);
  });
  return { block: { t: "list", ordered, start: startNum, items }, next: i };
}

// ── 行内扫描 ──────────────────────────────────────────────────────────────
// 捕获组：1-2 围栏码 / 3 删除线 / 4-5 粗体 / 6-7 斜体 / 8-9 链接 / 10 裸 URL。
// 递归解析子内容（粗体里可嵌斜体等）；每次调用新建 RegExp（递归安全）。

function parseInline(text: string): MdInline[] {
  const re =
    /(`+)([\s\S]*?)\1|~~(?=\S)([\s\S]*?\S)~~|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__|(?<![A-Za-z0-9*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![A-Za-z0-9*])|(?<![A-Za-z0-9_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![A-Za-z0-9_])|\[([^\]\n]+)\]\(([^()\s]+)\)|((?:https?:\/\/|mailto:)[^\s<>()]+)/g;
  const out: MdInline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...splitText(text.slice(last, m.index)));
    if (m[1] !== undefined) {
      out.push({ t: "code", v: m[2] });
    } else if (m[3] !== undefined) {
      out.push({ t: "del", c: parseInline(m[3]) });
    } else if (m[4] !== undefined || m[5] !== undefined) {
      out.push({ t: "strong", c: parseInline((m[4] ?? m[5]) as string) });
    } else if (m[6] !== undefined || m[7] !== undefined) {
      out.push({ t: "em", c: parseInline((m[6] ?? m[7]) as string) });
    } else if (m[8] !== undefined) {
      out.push({ t: "link", href: m[9], c: parseInline(m[8]) });
    } else {
      // 裸 URL：尾随标点剥回正文
      const raw = m[10];
      const trimmed = raw.replace(/[.,;:!?\u3002\uff0c\uff1b\uff1a\uff01\uff1f\u3001\]\)\u3011\u300d"']+$/, "");
      out.push({ t: "link", href: trimmed, c: [{ t: "text", v: trimmed }] });
      if (trimmed.length < raw.length) out.push({ t: "text", v: raw.slice(trimmed.length) });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...splitText(text.slice(last)));
  return out;
}

/** 段内单换行按聊天习惯保留为 br（旧渲染 pre-wrap 的换行语义）。 */
function splitText(s: string): MdInline[] {
  const parts = s.split("\n");
  const out: MdInline[] = [];
  parts.forEach((p, idx) => {
    if (idx > 0) out.push({ t: "br" });
    if (p) out.push({ t: "text", v: p });
  });
  return out;
}

// ── 纯文本（会话列表预览用） ─────────────────────────────────────────────

function inlineToPlain(c: MdInline[]): string {
  return c
    .map((x) => {
      switch (x.t) {
        case "text":
        case "code":
          return x.v;
        case "br":
          return " ";
        default:
          return inlineToPlain(x.c);
      }
    })
    .join("");
}

function blocksToPlain(bs: MdBlock[]): string {
  return bs
    .map((b): string => {
      switch (b.t) {
        case "p":
        case "h":
          return inlineToPlain(b.c);
        case "code":
          return b.v;
        case "quote":
          return blocksToPlain(b.c);
        case "list":
          return b.items.map((it) => blocksToPlain(it)).join(" ");
        case "table":
          return [b.head, ...b.rows].map((r) => r.map(inlineToPlain).join(" ")).join(" ");
        case "hr":
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

/** 剥掉 Markdown 语法取纯文本（会话列表预览/摘要用）。 */
export function stripMarkdown(text: string): string {
  return blocksToPlain(parseMarkdown(text));
}

/** 一段带说话人的正文，用于把一轮对话拼成可复制的 Markdown。 */
export interface MdSpeakerLine {
  label: string;
  text: string;
}

/**
 * 把一轮对话（用户 + 助手）拼成 Markdown 文本供「复制为 Markdown」使用。
 * 角色标签由调用方传入（文案在 app.ts），正文原样保留（本身已是 Markdown）。
 */
export function speakerLinesToMarkdown(lines: MdSpeakerLine[]): string {
  return lines
    .filter((l) => l.text && l.text.trim())
    .map((l) => `**${l.label}**\n\n${l.text.trim()}`)
    .join('\n\n---\n\n');
}
