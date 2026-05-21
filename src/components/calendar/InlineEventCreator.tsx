/**
 * InlineEventCreator — Notion Calendar / Linear-style in-cell event quick add.
 *
 * Renders a compact <input> that lives directly inside a calendar day cell
 * (month view), a time-slot (week view) or an agenda day rail. Typing `@`
 * opens the existing CommandMenu (mode='@') populated with the workspace's
 * agents. Picking an agent inserts ` @<name> ` into the input and remembers
 * which agent_id was chosen — so even if the user later edits the visible
 * `@<name>` text, the submit still resolves to the right agent.
 *
 * On Enter:
 *   - Trim the title (with the @-mention sliced out).
 *   - POST /api/schedules with start_at=ISO, agent_id=picked or null,
 *     cron_expression=null, duration_min=30.
 *
 * ESC cancels; clicking outside cancels.
 *
 * Design (CLAUDE.md "只能加" + "禁 emoji"):
 *   - lucide-react icons only
 *   - var(--t-*) / var(--cal-*) tokens
 *   - height ~28px (fits inside a month cell row); week/agenda variants stretch
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  CommandMenu,
  detectTrigger,
  type CommandMenuItem,
} from '../composer/CommandMenu';
import { listAgents, type AgentRecord } from '../../api/agents';
import { createSchedule, ScheduleApiError } from '../../api/schedules';
import { useI18n } from '../../common/i18n';

export interface InlineEventCreatorProps {
  /** When the new event should fire (start_at). Derived from the clicked cell/slot. */
  startAt: Date;
  /** Group the event lives under. */
  groupId: string;
  /** Used to scope agent listing. */
  workspaceId?: string;
  /** Called after a successful POST so the calendar can refresh. */
  onCreated: () => void;
  /** ESC, click-outside, or "×" button. */
  onCancel: () => void;
  /**
   * Layout variant. month/agenda render an inline-block row; week renders
   * absolute-positioned at the time slot — caller wraps positioning, this
   * component only adapts internal padding/borders.
   */
  variant?: 'month' | 'week' | 'agenda';
}

function agentsToMenuItems(agents: AgentRecord[]): CommandMenuItem[] {
  return agents.map((a) => ({
    id: a.agent_id,
    title: a.name,
    subtitle: a.soul || undefined,
    hint: a.status !== 'idle' ? a.status : undefined,
  }));
}

export function InlineEventCreator({
  startAt,
  groupId,
  workspaceId,
  onCreated,
  onCancel,
  variant = 'month',
}: InlineEventCreatorProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [caret, setCaret] = useState(0);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [pickedAgentId, setPickedAgentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load agents once when the creator mounts.
  useEffect(() => {
    let alive = true;
    listAgents(workspaceId)
      .then((list) => { if (alive) setAgents(list); })
      .catch(() => { /* silent — picker degrades to no agents */ });
    return () => { alive = false; };
  }, [workspaceId]);

  // Auto-focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click-outside → cancel (only when not submitting).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (submitting) return;
      const node = containerRef.current;
      if (node && !node.contains(e.target as Node)) onCancel();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onCancel, submitting]);

  // @-mention detection at the current caret position.
  const trigger = useMemo(() => detectTrigger(title, caret), [title, caret]);
  const menuOpen = trigger?.mode === '@';

  const menuItems = useMemo(() => agentsToMenuItems(agents), [agents]);

  function handlePickAgent(item: CommandMenuItem) {
    if (!trigger || trigger.mode !== '@') return;
    // Replace "@<query>" slice with "@<agent.name> " and remember id.
    const before = title.slice(0, trigger.start);
    const after = title.slice(trigger.end);
    const inserted = `@${item.title} `;
    const next = `${before}${inserted}${after}`;
    setTitle(next);
    setPickedAgentId(item.id);
    // Move caret to right after the inserted name.
    const newCaret = before.length + inserted.length;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCaret, newCaret);
        setCaret(newCaret);
      }
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    // Strip the @<name> token so task_description is the actual task text.
    const desc = title.replace(/(^|\s)@\S+(\s|$)/g, ' ').trim();
    if (!desc) {
      setError(t('calendar.inlineErrorEmptyTitle'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createSchedule({
        group_id: groupId,
        start_at: startAt.toISOString(),
        cron_expression: null,
        agent_id: pickedAgentId,
        task_description: desc,
        duration_min: 30,
      });
      onCreated();
    } catch (e) {
      if (e instanceof ScheduleApiError) {
        setError(t('calendar.inlineErrorHttp', { status: e.status }));
      } else {
        setError(e instanceof Error ? e.message : t('calendar.inlineErrorGeneric'));
      }
      setSubmitting(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // CommandMenu hijacks Enter/Tab/ESC/arrows when its menu is open.
    if (menuOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  }

  const isCompact = variant === 'month';
  const placeholder = pickedAgentId
    ? t('calendar.inlinePlaceholderPicked')
    : t('calendar.inlinePlaceholderEmpty');

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        // Notion Calendar style: the box reads as a deeper, more saturated
        // slot inside the cell — not a floating popover. The cell sets
        // display:flex column on its content, so `flex:1` here makes the
        // creator claim the remaining cell height (below the date header,
        // above the events list).
        flex: isCompact ? 1 : undefined,
        minHeight: isCompact ? 80 : variant === 'week' ? 60 : 56,
        padding: '8px 10px',
        background: 'color-mix(in oklab, var(--t-fg) 6%, var(--t-bg))',
        border: '1px solid var(--t-border)',
        borderRadius: 8,
        boxShadow:
          'inset 0 0 0 1px color-mix(in oklab, var(--t-fg) 4%, transparent)',
        // A subtle 2px accent stripe on the left signals "this is a new event
        // taking shape" without screaming.
        borderLeft: '2px solid var(--t-accent)',
        zIndex: 30,
      }}
    >
      <input
        ref={inputRef}
        value={title}
        placeholder={placeholder}
        disabled={submitting}
        onChange={(e) => {
          setTitle(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onClick={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
        onKeyDown={handleKey}
        style={{
          flex: 1,
          minWidth: 0,
          padding: 0,
          fontSize: 11.5,
          fontWeight: 600,
          lineHeight: 1.4,
          color: 'var(--cal-fg0, var(--t-fg))',
          background: 'transparent',
          border: 'none',
          outline: 'none',
        }}
      />
      {/* footer row: hint on the left, cancel button on the right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          marginTop: 'auto',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--t-fg-5)',
            letterSpacing: '.05em',
          }}
        >
          {submitting
            ? t('calendar.inlineCreating')
            : pickedAgentId
            ? t('calendar.inlineHintWithAgent')
            : t('calendar.inlineHintEmpty')}
        </span>
        {submitting ? (
          <Loader2
            size={12}
            strokeWidth={2}
            style={{ animation: 'cal-spin 1s linear infinite', color: 'var(--t-accent)' }}
          />
        ) : (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('common.cancel')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              padding: 0,
              background: 'transparent',
              border: 'none',
              color: 'var(--t-fg-4)',
              cursor: 'pointer',
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>
      {/* Error banner (inline below the input) */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            padding: '4px 8px',
            background: 'color-mix(in oklab, var(--t-err, #ef4444) 14%, var(--t-panel))',
            border: '1px solid color-mix(in oklab, var(--t-err, #ef4444) 40%, transparent)',
            borderRadius: 5,
            color: 'var(--t-err, #ef4444)',
            fontSize: 10.5,
            whiteSpace: 'nowrap',
            zIndex: 35,
          }}
        >
          {error}
        </div>
      )}
      {/* @-mention popover */}
      <CommandMenu
        open={menuOpen}
        mode={trigger?.mode ?? '@'}
        query={trigger?.query ?? ''}
        items={menuItems}
        onSelect={handlePickAgent}
        onClose={() => {
          // Move caret past the trigger so detectTrigger returns null.
          if (inputRef.current && trigger) {
            inputRef.current.setSelectionRange(trigger.end, trigger.end);
            setCaret(trigger.end);
          }
        }}
      />
    </div>
  );
}

export default InlineEventCreator;
