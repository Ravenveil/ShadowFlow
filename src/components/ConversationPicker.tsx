/**
 * ConversationPicker — Story 15.29
 *
 * Small dropdown + "+ New conversation" modal that lets the user pick which
 * Conversation a RunSession should belong to. Renders inside the
 * PreparationPanel of `/run-session` (with no :sessionId in URL).
 *
 * Selected id (or `undefined` for "start fresh") is bubbled up via `onChange`
 * and threaded into `createRunSession({ conversation_id })` by the parent.
 *
 * Design choices:
 *   - Inline strings (not i18n keys): Story 15.28 owns the i18n key landings;
 *     coordinating with that work would block this Story. Strings are short
 *     enough that the migration is a 5-line patch later.
 *   - No Suspense / SWR: the list is small, refresh-on-mount is fine, and the
 *     component already lives in a non-blocking corner of the UI.
 *   - data-testid="prep-panel-conversation-picker" wraps the root for E2E.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  listConversations,
  createConversation,
  type ConversationRecord,
} from '../api/conversations';

export interface ConversationPickerProps {
  /** Project to scope the conversation list to. Defaults to 'default'. */
  projectId?: string;
  /** Currently-selected conversation id, or undefined for "start fresh". */
  selectedId?: string;
  /** Called whenever the user picks a conversation (or "start fresh"). */
  onChange: (conversationId: string | undefined) => void;
  /** Optional disabled flag (e.g. during submit). */
  disabled?: boolean;
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--t-fg-3)',
  margin: '0 0 8px',
  fontWeight: 500,
};

const SELECT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--t-border)',
  borderRadius: 8,
  color: 'var(--t-fg)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const NEW_VALUE = '__new__';
const NONE_VALUE = '__none__';

function formatTitle(c: ConversationRecord): string {
  if (c.title && c.title.trim().length > 0) return c.title;
  // Fallback: short id + creation timestamp
  const ts = (() => {
    try {
      const d = new Date(c.created_at);
      return d.toLocaleString();
    } catch {
      return c.created_at;
    }
  })();
  return `Untitled (${ts})`;
}

export function ConversationPicker({
  projectId = 'default',
  selectedId,
  onChange,
  disabled = false,
}: ConversationPickerProps) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Load on mount + whenever projectId changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listConversations(projectId)
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const currentValue = useMemo(() => selectedId ?? NONE_VALUE, [selectedId]);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === NEW_VALUE) {
      setShowModal(true);
      return;
    }
    if (v === NONE_VALUE) {
      onChange(undefined);
      return;
    }
    onChange(v);
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const c = await createConversation(projectId, newTitle.trim() || undefined);
      setConversations((prev) => [c, ...prev]);
      onChange(c.conversation_id);
      setShowModal(false);
      setNewTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div data-testid="prep-panel-conversation-picker">
      <h3 style={LABEL_STYLE}>Conversation</h3>
      <select
        data-testid="conversation-picker-select"
        value={currentValue}
        onChange={handleSelect}
        disabled={disabled || loading}
        style={SELECT_STYLE}
      >
        <option value={NONE_VALUE}>Untitled — start fresh</option>
        {conversations.map((c) => (
          <option key={c.conversation_id} value={c.conversation_id}>
            {formatTitle(c)}
          </option>
        ))}
        <option value={NEW_VALUE}>+ New conversation</option>
      </select>
      {error && (
        <div
          role="alert"
          data-testid="conversation-picker-error"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      {showModal && (
        <div
          data-testid="conversation-picker-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => !creating && setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--t-panel)',
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              padding: 20,
              width: 360,
              maxWidth: '90vw',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, color: 'var(--t-fg)' }}>
              New conversation
            </h3>
            <input
              type="text"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
              data-testid="conversation-picker-new-title"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) handleCreate();
                if (e.key === 'Escape') setShowModal(false);
              }}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--t-border)',
                borderRadius: 6,
                color: 'var(--t-fg)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={creating}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--t-border)',
                  background: 'transparent',
                  color: 'var(--t-fg-3)',
                  fontSize: 12,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                data-testid="conversation-picker-create"
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid rgba(124,58,237,0.45)',
                  background: '#7c3aed',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConversationPicker;
