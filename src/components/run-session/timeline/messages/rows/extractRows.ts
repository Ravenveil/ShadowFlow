/**
 * extractRows — turn an `assistant_text.body` markdown blob into a typed
 * list of timeline sub-rows (Round 2.5).
 *
 * Why this exists: the server's BMAD intent path does NOT emit dedicated
 * `tool_call` / `tool_echo` / `diff_panel` TimelineMessage kinds for the
 * LLM's inline tool references — it just pipes raw markdown text. Round 2
 * Auditor flagged this gap: TRAE / OpenDesign show the left timeline FULL
 * of inline chips (` ```bash`, ` ```python`, file diffs, etc.) and we
 * weren't rendering any of that structure.
 *
 * Strategy: pure FE markdown parser. No server change. Scan body once,
 * carve out fenced code blocks + single-line `$ command` lines, and
 * preserve everything else as flat text. Each carved unit becomes a typed
 * Row that MessageRegistry's children renderers can dispatch.
 *
 * Spec ref: docs/round2/round2-spec-2026-05-24.md, section "OpenDesign UI
 * 证据" + "TRAE 第二张截图证据" (row type catalog).
 */

export type Row =
  /** Fenced ` ```bash` block — render as ToolBashChip-like `$ cmd [output]`. */
  | { kind: 'bash-chip'; label?: string; cmd: string; body: string }
  /** Other fenced code blocks (python / typescript / json / etc.). */
  | { kind: 'code-chip'; lang: string; body: string }
  /** Single-line `$ command` (not in a fence) — compact bash chip. */
  | { kind: 'bash-inline'; cmd: string }
  /** Markdown `## heading` line — renders as SectionHeader standalone divider. */
  | { kind: 'section-header'; title: string }
  /** Free-form prose paragraph. */
  | { kind: 'text'; body: string };

/**
 * Languages we treat as "bash-style" (rendered with `$` prefix + terminal
 * styling rather than a generic code block).
 */
const BASH_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'cmd', 'powershell', 'ps', 'ps1']);

/**
 * Pattern matching a fenced code block: ` ```{lang}\n{body}\n``` `. We use
 * a non-greedy capture so consecutive blocks don't merge. The opening fence
 * may carry an optional language tag (and we tolerate inline `info-string`
 * extras like ` ```bash title="Run server" `).
 *
 * NOTE: this is intentionally simple. We don't try to handle nested fences
 * or tilde-delimited fences — markdown in LLM output uses backticks.
 */
const FENCED_BLOCK_RE = /```([^\s`\n]*)([^\n]*)\n([\s\S]*?)```/g;

/**
 * Pattern matching a single line that starts with `$ ` (with optional
 * leading whitespace). Used to catch inline shell-like instructions that
 * weren't wrapped in a fence. We only match `$ ` (dollar + space) to avoid
 * false-positives on jQuery / regex / etc.
 */
const DOLLAR_LINE_RE = /^[ \t]*\$ (.+)$/gm;

/**
 * Markdown ATX-style heading line: `## Title`. We match levels 2 and 3 so
 * the LLM's natural section breaks (`## 步骤一`, `### 分析`) become visible
 * section dividers. Level 1 (`# Title`) is rare in inline replies and we
 * don't want to grab the user's emphasized first line.
 */
const HEADING_LINE_RE = /^[ \t]*(#{2,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm;

/**
 * Push a `text` row from `body[start..end]`, trimming leading/trailing
 * blank lines so chip/text/chip sequences don't end up with empty paragraphs.
 * No-op when the slice is whitespace-only.
 */
function pushText(rows: Row[], body: string, start: number, end: number): void {
  if (start >= end) return;
  const slice = body.slice(start, end);
  // Collapse multiple trailing/leading newlines; keep internal structure.
  const trimmed = slice.replace(/^\n+/, '').replace(/\n+$/, '');
  if (!trimmed.trim()) return;
  rows.push({ kind: 'text', body: trimmed });
}

/**
 * Main entry. Returns an empty array iff `body` is empty / whitespace.
 *
 * Algorithm:
 *   1. Find all fenced code blocks (` ```bash` etc.) in document order.
 *   2. For each gap between fenced blocks, scan for single-line `$ cmd`
 *      patterns and split text/bash-inline at those.
 *   3. Emit rows in original document order.
 */
export function extractRows(body: string): Row[] {
  if (!body || !body.trim()) return [];

  const rows: Row[] = [];
  // Track where we are in the source string — gaps between fences are
  // handed off to the prose/dollar-line scanner.
  let cursor = 0;

  // Use exec() in a loop so we can capture match.index for slicing the
  // surrounding text. Reset lastIndex per call (safety).
  FENCED_BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCED_BLOCK_RE.exec(body)) !== null) {
    const blockStart = m.index;
    const blockEnd = m.index + m[0].length;
    const langRaw = (m[1] ?? '').trim().toLowerCase();
    const info = (m[2] ?? '').trim();
    const blockBody = m[3] ?? '';

    // First, drain any prose between cursor and this fence.
    scanProseRange(rows, body, cursor, blockStart);

    if (BASH_LANGS.has(langRaw)) {
      // Bash-style fenced block. Extract a label from the info string if
      // present (e.g. ` ```bash title="Run server" ` → "Run server"), else
      // fall back to the first non-empty line of the body as the displayed
      // command summary.
      const labelMatch = info.match(/title\s*=\s*"([^"]+)"/i);
      const label = labelMatch ? labelMatch[1] : undefined;
      // The "cmd" is the first non-empty body line; full body is the
      // expanded `[output]` content.
      const firstLine = blockBody.split('\n').find((l) => l.trim()) ?? '';
      rows.push({
        kind: 'bash-chip',
        label,
        cmd: firstLine.trim(),
        body: blockBody.replace(/\n+$/, ''),
      });
    } else {
      // Generic code block. Empty `lang` is fine — we render with a neutral
      // header.
      rows.push({
        kind: 'code-chip',
        lang: langRaw || 'text',
        body: blockBody.replace(/\n+$/, ''),
      });
    }

    cursor = blockEnd;
  }

  // Drain the tail.
  scanProseRange(rows, body, cursor, body.length);

  return rows;
}

/**
 * Scan a prose range for line-level structural tokens (`## heading`,
 * `$ cmd`), splitting it into ordered rows. Anything left over becomes
 * `text` rows.
 *
 * We do two passes:
 *   1. Collect all match positions from heading + dollar regexes.
 *   2. Sort by index, walk in order, emit text gaps + matched rows.
 *
 * This keeps document order regardless of which pattern comes first.
 * Outside this range we already handled fenced blocks, so backticks
 * here are inline code (rendered as-is by TextRow).
 */
function scanProseRange(rows: Row[], body: string, start: number, end: number): void {
  if (start >= end) return;
  const slice = body.slice(start, end);
  if (!slice.trim()) return;

  // Collect all line-level matches.
  type Tok = { start: number; end: number; row: Row };
  const toks: Tok[] = [];

  HEADING_LINE_RE.lastIndex = 0;
  let hm: RegExpExecArray | null;
  while ((hm = HEADING_LINE_RE.exec(slice)) !== null) {
    toks.push({
      start: hm.index,
      end: hm.index + hm[0].length,
      row: { kind: 'section-header', title: (hm[2] ?? '').trim() },
    });
  }

  DOLLAR_LINE_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DOLLAR_LINE_RE.exec(slice)) !== null) {
    toks.push({
      start: dm.index,
      end: dm.index + dm[0].length,
      row: { kind: 'bash-inline', cmd: (dm[1] ?? '').trim() },
    });
  }

  if (toks.length === 0) {
    // No structural tokens — whole slice is one text row.
    pushText(rows, slice, 0, slice.length);
    return;
  }

  // Walk in document order, emitting text gaps + structural rows.
  toks.sort((a, b) => a.start - b.start);
  let lastEnd = 0;
  for (const t of toks) {
    if (t.start > lastEnd) pushText(rows, slice, lastEnd, t.start);
    rows.push(t.row);
    lastEnd = t.end;
  }
  if (lastEnd < slice.length) pushText(rows, slice, lastEnd, slice.length);
}
