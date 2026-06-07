/**
 * conversations.ts — Story 15.16 — Conversation + Message CRUD over sqlite.
 *
 * A conversation belongs to exactly one project (FK CASCADE — deleting a
 * project nukes its chat history). Messages belong to exactly one
 * conversation (also CASCADE).
 *
 * listMessages returns ascending by created_at — the natural read order for
 * a chat transcript.
 */

import { randomUUID } from 'crypto';
import { getDb } from './sqlite';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ConversationRecord {
  conversation_id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  message_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  run_id: string | null;
  /**
   * O3 — optional back-trace bridge. For assistant rows written by the
   * run-session SSE stream, this is the timeline projector's assistant_text
   * message id (`msg_<session_id>_NNNN`) that produced the content, so the
   * front-end can map a timeline message → its persisted conversation row.
   * `null` for user/system rows and for any row written before O3.
   */
  timeline_message_id: string | null;
  created_at: string;
}

interface ConversationRow {
  conversation_id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  message_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  run_id: string | null;
  // O3 — may be absent on rows written before the column existed; normalized to
  // null in the mapping helper below.
  timeline_message_id: string | null;
  created_at: string;
}

/**
 * Normalize a raw SELECT * row into a MessageRecord. Defensive against legacy
 * rows / pre-O3 dbs where `timeline_message_id` may be undefined → coerce to
 * null so the typed record's contract (string | null) always holds.
 */
function toMessageRecord(row: MessageRow): MessageRecord {
  return {
    message_id: row.message_id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    run_id: row.run_id ?? null,
    timeline_message_id: row.timeline_message_id ?? null,
    created_at: row.created_at,
  };
}

// ── Conversation ────────────────────────────────────────────────────────────

export function listConversations(project_id: string): ConversationRecord[] {
  return getDb()
    .prepare(
      `SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC`,
    )
    .all(project_id) as ConversationRow[];
}

export function getConversation(id: string): ConversationRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM conversations WHERE conversation_id = ?`)
    .get(id) as ConversationRow | undefined;
  return row ?? null;
}

export function createConversation(
  project_id: string,
  title?: string,
): ConversationRecord {
  const conversation_id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO conversations
       (conversation_id, project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(conversation_id, project_id, title ?? null, now, now);

  return {
    conversation_id,
    project_id,
    title: title ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function deleteConversation(id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM conversations WHERE conversation_id = ?`)
    .run(id);
  return info.changes > 0;
}

// ── Messages ────────────────────────────────────────────────────────────────

export function listMessages(conversation_id: string): MessageRecord[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      )
      .all(conversation_id) as MessageRow[]
  ).map(toMessageRecord);
}

export interface AppendMessageInput {
  role: MessageRole;
  content: string;
  run_id?: string | null;
  /**
   * O3 — optional timeline projector assistant_text message id to back-link this
   * conversation row to its timeline message. Omit (or null) for user/system
   * rows. Back-compat: undefined is persisted as NULL.
   */
  timeline_message_id?: string | null;
}

export function appendMessage(
  conversation_id: string,
  input: AppendMessageInput,
): MessageRecord {
  const message_id = randomUUID();
  const now = new Date().toISOString();
  const db = getDb();
  // Single transaction so updated_at on conversation stays in sync.
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages
       (message_id, conversation_id, role, content, run_id, timeline_message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      message_id,
      conversation_id,
      input.role,
      input.content,
      input.run_id ?? null,
      input.timeline_message_id ?? null,
      now,
    );
    db.prepare(
      `UPDATE conversations SET updated_at = ? WHERE conversation_id = ?`,
    ).run(now, conversation_id);
  });
  tx();

  return {
    message_id,
    conversation_id,
    role: input.role,
    content: input.content,
    run_id: input.run_id ?? null,
    timeline_message_id: input.timeline_message_id ?? null,
    created_at: now,
  };
}

export function getRecentMessages(
  conversation_id: string,
  limit: number,
): MessageRecord[] {
  // last N by created_at, returned in ascending order so callers can feed
  // them straight into prompt context.
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       ) ORDER BY created_at ASC`,
    )
    .all(conversation_id, limit) as MessageRow[];
  return rows.map(toMessageRecord);
}
