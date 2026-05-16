/**
 * CodeBlockToolbar.tsx
 *
 * A reusable, framework-light wrapper for rendering fenced code blocks with
 * a Cherry-Studio-style header row:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ yaml                              [Copy] [Wrap] [#] [⌄]  │  ← 28px toolbar
 *   ├──────────────────────────────────────────────────────────┤
 *   │  1  agents:                                              │
 *   │  2    - id: planner                                      │  ← body
 *   │  …                                                       │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Why it exists:
 *   The project renders code in several places (assistant chat reply,
 *   blueprint YAML preview, rationale cards). Each one used a raw <pre>
 *   with slightly different styling and zero affordances. This component
 *   unifies the surface and adds the four utility toggles users expect
 *   from any modern AI-chat code block.
 *
 * No new deps — uses lucide-react (already installed) and design tokens
 * (`--t-bg-2`, `--t-panel-2`, `--t-border`, `--t-fg-3`, `--t-fg-4`, etc.).
 *
 * Per CLAUDE.md "UI 禁用系统 emoji 字符做图标" — all icons are
 * single-color lucide-react line glyphs, never raw emoji.
 *
 * Accessibility:
 *   - Each toolbar button has aria-label + title; copied state announces
 *     "Copied" by swapping the icon to Check for ~1.2s.
 *   - Folded body is hidden visually but the chevron is keyboard-focusable.
 *
 * TS strict: all props typed; no implicit any.
 */

import { useMemo, useRef, useState, useCallback } from 'react';
import {
  Copy,
  Check,
  WrapText,
  Hash,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CodeBlockToolbarProps {
  /** Raw source code string. Required. */
  code: string;
  /** Optional language hint, e.g. 'yaml', 'ts', 'python'. Rendered as the
   *  left-hand label on the toolbar. */
  lang?: string;
  /** If true, the body starts collapsed to a short preview with a fade-out
   *  mask. User can expand via the chevron. Default: false. */
  defaultCollapsed?: boolean;
  /** If true, line numbers are shown by default. The toggle button still
   *  works either way. Default: false. */
  showLineNumbers?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional max-height (px) for the body in expanded state. Defaults to
   *  unconstrained (natural code height). */
  maxBodyHeight?: number;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const TOOLBAR_HEIGHT = 28;
const COLLAPSED_HEIGHT = 80;
const COPY_FEEDBACK_MS = 1200;

// ---------------------------------------------------------------------------
// Tiny icon-button helper. Pure function, no state — fine to inline-style.
// ---------------------------------------------------------------------------

interface ToolbarBtnProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolbarBtn({ label, active, onClick, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        background: active ? 'var(--t-accent-tint)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        color: active ? 'var(--t-accent-bright)' : 'var(--t-fg-4)',
        cursor: 'pointer',
        padding: 0,
        lineHeight: 0,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CodeBlockToolbar({
  code,
  lang,
  defaultCollapsed = false,
  showLineNumbers = false,
  className,
  maxBodyHeight,
}: CodeBlockToolbarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);
  const [wrap, setWrap] = useState<boolean>(true);
  const [numbered, setNumbered] = useState<boolean>(showLineNumbers);
  const [copied, setCopied] = useState<boolean>(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = useMemo<string[]>(() => code.split('\n'), [code]);
  const lineCount = lines.length;
  const padWidth = useMemo<number>(() => String(lineCount).length, [lineCount]);

  const handleCopy = useCallback(() => {
    // navigator.clipboard is available in all targeted browsers (Vite dev
    // server runs over localhost which is a secure context). Fall back to
    // a no-op if it's missing — copy is best-effort, not load-bearing.
    const clip = (typeof navigator !== 'undefined' && navigator.clipboard)
      ? navigator.clipboard
      : null;
    if (!clip) return;
    void clip.writeText(code).then(() => {
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    }).catch(() => {
      // Silent failure — copy is non-critical.
    });
  }, [code]);

  // Body inline style — collapsed adds a fixed height + fade mask.
  // All colors via design tokens (var(--t-*)). No hardcoded fallbacks —
  // those silently override day-mode and produce a dark block on a light
  // page. The tokens are always defined; trust them.
  const bodyStyle: React.CSSProperties = {
    margin: 0,
    padding: numbered ? '8px 12px 8px 0' : '8px 12px',
    background: 'var(--t-panel)',
    color: 'var(--t-fg)',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 12,
    lineHeight: 1.55,
    overflow: 'auto',
    whiteSpace: wrap ? 'pre-wrap' : 'pre',
    wordBreak: wrap ? 'break-word' : 'normal',
    maxHeight: collapsed
      ? COLLAPSED_HEIGHT
      : (typeof maxBodyHeight === 'number' ? maxBodyHeight : undefined),
    position: 'relative',
  };

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--t-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--t-panel)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: TOOLBAR_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          background: 'var(--t-panel-2)',
          borderBottom: '1px solid var(--t-border)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 10,
            textTransform: 'lowercase',
            letterSpacing: '.04em',
            color: 'var(--t-fg-4)',
            userSelect: 'none',
          }}
        >
          {lang || 'text'}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <ToolbarBtn
            label={copied ? 'Copied' : 'Copy code'}
            onClick={handleCopy}
            active={copied}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </ToolbarBtn>
          <ToolbarBtn
            label={wrap ? 'Disable soft wrap' : 'Enable soft wrap'}
            onClick={() => setWrap(v => !v)}
            active={wrap}
          >
            <WrapText size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            label={numbered ? 'Hide line numbers' : 'Show line numbers'}
            onClick={() => setNumbered(v => !v)}
            active={numbered}
          >
            <Hash size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            label={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed(v => !v)}
            active={false}
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </ToolbarBtn>
        </div>
      </div>

      {/* Body */}
      <pre style={bodyStyle}>
        {numbered ? (
          <code style={{ display: 'block' }}>
            {lines.map((line, i) => (
              <span
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  minHeight: '1.55em',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: `${padWidth + 2}ch`,
                    paddingRight: 8,
                    marginRight: 8,
                    textAlign: 'right',
                    color: 'var(--t-fg-5)',
                    borderRight: '1px solid var(--t-border)',
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{line || ' '}</span>
              </span>
            ))}
          </code>
        ) : (
          <code>{code}</code>
        )}

        {/* Fade-out mask when collapsed — purely cosmetic, no semantic value. */}
        {collapsed && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 28,
              background:
                'linear-gradient(to bottom, transparent, var(--t-panel))',
              pointerEvents: 'none',
            }}
          />
        )}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fence parser — used by chat-reply renderers that receive plain markdown
// strings rather than a parsed AST.
//
// Splits a string into an ordered list of segments, where each segment is
// either { kind: 'text', value } or { kind: 'code', lang, value }.
//
// Recognised fences:
//   ```lang
//   …
//   ```
//
// Edge cases handled:
//   - Unterminated fence at end-of-stream (streaming SSE) → treat trailing
//     ``` as opening an in-progress code block, value = whatever followed.
//   - Tilde fences (~~~) are NOT supported; rare in LLM output.
//   - Indented code blocks (4-space) are NOT recognised; LLMs almost
//     always emit backtick fences.
// ---------------------------------------------------------------------------

export type CodeFenceSegment =
  | { kind: 'text'; value: string }
  | { kind: 'code'; lang: string | undefined; value: string };

export function parseCodeFences(input: string): CodeFenceSegment[] {
  const segments: CodeFenceSegment[] = [];
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(input)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ kind: 'text', value: input.slice(lastIndex, m.index) });
    }
    const langRaw = (m[1] ?? '').trim();
    segments.push({
      kind: 'code',
      lang: langRaw.length > 0 ? langRaw : undefined,
      value: m[2] ?? '',
    });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < input.length) {
    segments.push({ kind: 'text', value: input.slice(lastIndex) });
  }
  return segments;
}
