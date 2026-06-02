/**
 * CommandMenu — Claude-Code / Codex style inline popover for slash and
 * mention triggers inside a textarea composer.
 *
 *   Type `/<q>` → list of system commands matching `<q>`
 *   Type `@<q>` → list of mentionable resources (skills, agents) matching `<q>`
 *
 * Selection inserts a token back into the composer and closes the menu.
 * Esc closes without insertion. Up/Down navigates, Enter / Tab selects.
 *
 * The component is purely presentational + manages its own selectedIndex.
 * Trigger detection (when to open / what query to show) is the consumer's
 * responsibility — see StartPage for the textarea-onChange / caret detection
 * logic.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Slash } from 'lucide-react';

export type CommandMode = '@' | '/';

export interface CommandMenuItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Optional hint shown at the right edge of the row (e.g. shortcut). */
  hint?: string;
  /**
   * Optional rich node shown at the right edge (takes precedence over `hint`).
   * Used by `@` skill rows to surface compile status (已编译 / 编译中 / 降级 /
   * 未编译) inline — folds the old standalone SkillDropdown overlay into this
   * single menu so there's no second dark popover.
   */
  badge?: React.ReactNode;
  /** When true, the row is rendered dim + non-selectable. */
  disabled?: boolean;
}

export interface CommandMenuProps {
  open: boolean;
  mode: CommandMode;
  /** Query text after the trigger char (without the trigger itself). */
  query: string;
  /** All candidate items; filtering by `query` happens here. */
  items: CommandMenuItem[];
  /** Called when the user picks (Enter / Tab / click). */
  onSelect: (item: CommandMenuItem) => void;
  onClose: () => void;
}

function fuzzyMatch(query: string, item: CommandMenuItem): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.id.toLowerCase().includes(q) ||
    item.title.toLowerCase().includes(q) ||
    (item.subtitle ?? '').toLowerCase().includes(q)
  );
}

export const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  mode,
  query,
  items,
  onSelect,
  onClose,
}) => {
  const filtered = useMemo(
    () => items.filter((it) => !it.disabled && fuzzyMatch(query, it)),
    [items, query],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Clamp selection when filtered shrinks below the cursor.
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(0);
  }, [filtered.length, selectedIndex]);

  // Reset cursor each time the menu opens or the mode changes.
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open, mode]);

  // Keyboard glue — consumers must forward keydown via the exported helper.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length === 0) return;
        e.preventDefault();
        onSelect(filtered[selectedIndex]);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, selectedIndex, onSelect, onClose]);

  // Scroll active row into view when arrow keys move it past the viewport.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLDivElement>(
      `[data-cmd-row="${selectedIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex]);

  if (!open) return null;

  const HeaderIcon = mode === '@' ? AtSign : Slash;
  const headerLabel = mode === '@' ? 'mention' : 'command';
  const placeholder = mode === '@' ? '搜索 Skill / Agent…' : '搜索命令…';

  return (
    <div
      data-component="command-menu"
      data-mode={mode}
      role="listbox"
      style={{
        // 2026-05-20 — anchor BELOW the textarea, not above. StartPage's
        // composer sits near the page top, so opening upward overflowed the
        // hero heading. Opening downward also matches the conventional
        // autocomplete direction users expect.
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        maxWidth: 460,
        maxHeight: 320,
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 10,
        boxShadow: '0 14px 36px -10px rgba(0,0,0,.35)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--t-border)',
          background: 'var(--t-panel-2)',
          fontSize: 11,
          color: 'var(--t-fg-4)',
        }}
      >
        <HeaderIcon size={12} strokeWidth={2.2} />
        <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
          {headerLabel}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--t-fg-5)' }}>
          {query ? `"${query}"` : placeholder}
        </span>
      </div>
      <div
        ref={listRef}
        style={{ overflowY: 'auto', flex: 1, padding: 4 }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '12px',
              fontSize: 12,
              color: 'var(--t-fg-5)',
              textAlign: 'center',
            }}
          >
            没有匹配项。{mode === '@' ? '试试 @paper-review 或 @bmad' : '试试 /help'}
          </div>
        ) : (
          filtered.map((item, i) => {
            const active = i === selectedIndex;
            return (
              <div
                key={item.id}
                data-cmd-row={i}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseDown={(e) => {
                  // Prevent textarea blur before onClick fires.
                  e.preventDefault();
                }}
                onClick={() => onSelect(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  borderRadius: 7,
                  background: active ? 'var(--t-accent-tint)' : 'transparent',
                  border: active
                    ? '1px solid var(--t-accent)'
                    : '1px solid transparent',
                  cursor: 'pointer',
                  minHeight: 32,
                }}
              >
                {item.icon && (
                  <span
                    style={{
                      flexShrink: 0,
                      width: 18,
                      height: 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
                    }}
                  >
                    {item.icon}
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--t-fg)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 10.5,
                        color: 'var(--t-fg-4)',
                        marginTop: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.subtitle}
                    </span>
                  )}
                </span>
                {item.badge ? (
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                    {item.badge}
                  </span>
                ) : (
                  item.hint && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: 'var(--t-fg-5)',
                        flexShrink: 0,
                      }}
                    >
                      {item.hint}
                    </span>
                  )
                )}
              </div>
            );
          })
        )}
      </div>
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--t-border)',
          background: 'var(--t-panel-2)',
          fontSize: 9.5,
          color: 'var(--t-fg-5)',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          gap: 14,
        }}
      >
        <span>↑↓ 导航</span>
        <span>↵ 选择</span>
        <span>esc 关闭</span>
      </div>
    </div>
  );
};

/**
 * Helper — given a textarea value + caret position, detect whether the
 * caret is positioned right after an active `/` or `@` trigger.
 *
 * Returns null when no trigger is active. Otherwise returns the mode +
 * query + the slice positions so the consumer can replace the trigger
 * with the chosen item's token.
 *
 * Rules (kept terse to mirror what users intuit from Claude Code):
 *   - Trigger char must be at the very start of the textarea OR preceded
 *     by whitespace. So writing "see @docs" triggers, but "abc@def" does NOT.
 *   - Query is the contiguous non-whitespace chars after the trigger up
 *     to the caret. Spaces inside the query close the menu.
 *   - Caret must be inside (or right at the end of) the query.
 */
export interface DetectedTrigger {
  mode: CommandMode;
  query: string;
  /** char index of the trigger ('/' or '@') */
  start: number;
  /** char index right after the query — equal to caret if caret is at the end */
  end: number;
}

export function detectTrigger(text: string, caret: number): DetectedTrigger | null {
  if (caret < 1 || caret > text.length) return null;
  // Walk backwards from the caret to find a `/` or `@`, abort on whitespace.
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    if (ch === '/' || ch === '@') {
      // The char before the trigger must be whitespace OR start-of-text.
      if (i > 0) {
        const prev = text[i - 1];
        if (prev !== ' ' && prev !== '\n' && prev !== '\t') return null;
      }
      // Anything after the caret that's a non-whitespace char extends the
      // query token — include it so the menu filters correctly when the
      // caret is in the middle of a word.
      let j = caret;
      while (j < text.length && text[j] !== ' ' && text[j] !== '\n' && text[j] !== '\t') j += 1;
      const fullQuery = text.slice(i + 1, j);
      return { mode: ch as CommandMode, query: fullQuery, start: i, end: j };
    }
    i -= 1;
  }
  return null;
}

export default CommandMenu;
