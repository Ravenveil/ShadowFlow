/**
 * permission-policy.ts — per-tool allow/deny gate for ConversationRuntime.
 *
 * S3 (skill-team-conversion-design-v1.md §5; D6 in §6) — TypeScript port of
 * `claw-code-reference rust/crates/runtime/src/permissions.rs`, intentionally
 * stripped to **allow/deny only**. The Rust upstream supports a third
 * `'prompt'` mode that escalates to an interactive prompter; we decided to
 * defer that to v3 because:
 *
 *   1. UX for interactive approval is non-trivial inside an SSE pipeline
 *      (would need a dedicated approval frame + client round-trip).
 *   2. Today's MVP uses static allowed-tools lists from SKILL.md frontmatter
 *      — every authorization is deterministic, no human-in-the-loop needed.
 *   3. Easier to evolve allow/deny → allow/deny/prompt later than to rip out
 *      a half-baked prompter, so we ship the smaller surface first.
 *
 * The class is intentionally synchronous: no async, no prompter callback, no
 * I/O. ConversationRuntime (S5) calls authorize() in the same tick as it sees
 * a tool_use block from the LLM.
 *
 * Static factory `fromAllowedTools(['bash', ...])` builds the canonical
 * "deny-by-default + listed tools allowed" policy that maps directly to
 * Anthropic SKILL.md `allowed-tools: [...]` frontmatter.
 */

export type PermissionMode = 'allow' | 'deny';

/** authorize() return shape — { allow: true } or { deny: reason }. */
export type PermissionOutcome = { allow: true } | { deny: string };

export class PermissionPolicy {
  /**
   * @param defaultMode  fallback applied when toolModes has no entry for the
   *                     requested tool name.
   * @param toolModes    per-tool override map. Stored by reference; callers
   *                     should treat it as owned by the policy after construction.
   */
  constructor(
    private readonly defaultMode: PermissionMode,
    private readonly toolModes: Map<string, PermissionMode> = new Map(),
  ) {}

  /**
   * Resolve the effective mode for one tool. Override beats default; missing
   * override falls through to defaultMode.
   */
  modeFor(toolName: string): PermissionMode {
    const m = this.toolModes.get(toolName);
    return m ?? this.defaultMode;
  }

  /**
   * Decide whether the runtime may invoke `toolName`. Synchronous: D6 means
   * we never block on an external prompter, so the answer is always immediate.
   * Deny reason is suitable for echoing back into the LLM's `tool_result`
   * block with `is_error: true`.
   *
   * @param _input  serialized tool input (currently unused; v3 placeholder).
   *                Prefixed with underscore to mark it as reserved for the
   *                future `'prompt'` mode where the prompter needs to see
   *                concrete input before approving. Keeping the slot in the
   *                signature now means call sites won't churn when v3 lands.
   */
  authorize(toolName: string, _input?: string): PermissionOutcome {
    if (this.modeFor(toolName) === 'allow') return { allow: true };
    return { deny: `tool '${toolName}' denied by permission policy` };
  }

  /**
   * Canonical MVP factory: deny everything except the explicitly listed tools.
   * Maps directly to Anthropic SKILL.md `allowed-tools: [Bash, Read, Edit]`
   * frontmatter — pass the parsed list straight in.
   *
   * Empty list → deny-everything policy (useful for "no tools" skills).
   *
   * **Case sensitivity contract**: matching is exact. Callers are responsible
   * for passing tool names byte-identical to whatever `authorize()` will see
   * at runtime (which is the literal frontmatter `allowed-tools` entry, e.g.
   * `Bash` not `bash`). We deliberately do not normalize case here — SKILL.md
   * frontmatter is the source of truth and silent case-folding would mask
   * authoring typos.
   */
  static fromAllowedTools(allowedTools: readonly string[]): PermissionPolicy {
    return new PermissionPolicy(
      'deny',
      new Map(allowedTools.map((t) => [t, 'allow' as const])),
    );
  }
}
