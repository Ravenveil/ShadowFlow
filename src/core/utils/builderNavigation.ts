/** URL construction helpers for Chat → Builder jump (Story 7.8). */

const GOAL_MAX_CHARS = 120;

/**
 * Truncate a goal string to GOAL_MAX_CHARS and URI-encode it.
 * Returns empty string if input is empty/null.
 */
export function encodeGoal(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim().slice(0, GOAL_MAX_CHARS);
  return encodeURIComponent(trimmed);
}

/**
 * Build the Builder URL for a Chat (group) context.
 * AC2: /builder?from=chat&context_type=group&context_id=<chatId>&goal=<encoded_goal>
 */
export function buildChatBuilderUrl(params: {
  chatId: string;
  goalText: string | null | undefined;
}): string {
  const goal = encodeGoal(params.goalText);
  const url = `/builder?from=chat&context_type=group&context_id=${encodeURIComponent(params.chatId)}`;
  return goal ? `${url}&goal=${goal}` : url;
}

/**
 * Build the Builder URL for an AgentDM (single-chat) context.
 * AC2: /builder?from=dm&context_type=dm&context_id=<agentId>&goal=<encoded_goal>
 */
export function buildAgentDMBuilderUrl(params: {
  agentId: string;
  agentName: string | null | undefined;
}): string {
  const goal = encodeGoal(params.agentName);
  const url = `/builder?from=dm&context_type=dm&context_id=${encodeURIComponent(params.agentId)}`;
  return goal ? `${url}&goal=${goal}` : url;
}
