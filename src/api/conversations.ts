/**
 * conversations.ts — Story 15.29 — Front-end client for the Conversation /
 * Message REST API (server-side endpoints owned by Story 15.16).
 *
 *   GET  /api/projects/:pid/conversations          → listConversations
 *   POST /api/projects/:pid/conversations          → createConversation
 *   GET  /api/conversations/:cid/messages          → getRecentMessages (alias)
 *
 * The 15.16 backend already orders listConversations by `updated_at DESC` and
 * listMessages by `created_at ASC`, so we can render directly without sorting.
 */

import { getApiBase, authHeaders } from './_base';

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
  created_at: string;
}

/**
 * List conversations under a project. Returned newest first (server orders by
 * updated_at DESC). Default project_id is 'default' — the home for anonymous
 * conversations auto-created by run-sessions when no explicit id is passed.
 */
export async function listConversations(
  project_id: string = 'default',
): Promise<ConversationRecord[]> {
  const resp = await fetch(
    `${getApiBase()}/api/projects/${encodeURIComponent(project_id)}/conversations`,
    { headers: { ...authHeaders() } },
  );
  if (resp.status === 404) return []; // project not found yet — empty list
  if (!resp.ok) throw new Error(`listConversations failed: ${resp.status}`);
  return resp.json();
}

/**
 * Create a new conversation under a project. Title is optional; an empty /
 * whitespace-only title is normalized to null on the server.
 */
export async function createConversation(
  project_id: string,
  title?: string,
): Promise<ConversationRecord> {
  const resp = await fetch(
    `${getApiBase()}/api/projects/${encodeURIComponent(project_id)}/conversations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title }),
    },
  );
  if (!resp.ok) throw new Error(`createConversation failed: ${resp.status}`);
  return resp.json();
}

/**
 * Read messages from a conversation, ascending by created_at. The server has
 * no `limit` query param (Story 15.16 punted it); we keep the API symmetrical
 * by accepting one and slicing client-side. For multi-turn run injection the
 * server already caps at 20 inside run-sessions.ts.
 */
export async function getRecentMessages(
  conversation_id: string,
  limit?: number,
): Promise<MessageRecord[]> {
  const resp = await fetch(
    `${getApiBase()}/api/conversations/${encodeURIComponent(conversation_id)}/messages`,
    { headers: { ...authHeaders() } },
  );
  if (!resp.ok) throw new Error(`getRecentMessages failed: ${resp.status}`);
  const all = (await resp.json()) as MessageRecord[];
  if (typeof limit === 'number' && limit > 0 && all.length > limit) {
    return all.slice(-limit);
  }
  return all;
}

/**
 * Story 15.24 — `listMessages(cid)` is the canonical client name spec'd
 * by the Story 15.24 acceptance criteria. It thin-wraps `getRecentMessages`
 * with no limit, returning every message in ascending order.
 */
export async function listMessages(
  conversation_id: string,
): Promise<MessageRecord[]> {
  return getRecentMessages(conversation_id);
}

/**
 * Story 15.24 — append a new message to an existing conversation. Spec'd in
 * the 15.24 file-list (`createMessage` client function) for completeness so
 * the front-end has a paved path to write user / assistant / system messages
 * without re-implementing the fetch each time.
 */
export async function createMessage(
  conversation_id: string,
  role: MessageRole,
  content: string,
  run_id?: string,
): Promise<MessageRecord> {
  const resp = await fetch(
    `${getApiBase()}/api/conversations/${encodeURIComponent(conversation_id)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ role, content, run_id: run_id ?? null }),
    },
  );
  if (!resp.ok) throw new Error(`createMessage failed: ${resp.status}`);
  return resp.json();
}
