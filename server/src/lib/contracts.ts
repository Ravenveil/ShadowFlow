/**
 * contracts.ts — Shared types for the intent-workflow pipeline (S0-S4).
 *
 * Pinned here so every collaborator on the stream (parser.ts, step-store.ts,
 * routes/run-sessions.ts, future Stream C intent-router.ts) imports from a
 * single source of truth instead of each side maintaining its own private
 * type alias. Anything cross-cutting goes here.
 *
 * See: docs/design/intent-workflow-design-v1.md §4.2 / §4.4.
 */

/**
 * What kind of artifact a single step is contracted to produce.
 *
 *   'nodes'     — sf:node tags (agent definitions)
 *   'edges'     — sf:edge tags (workflow connections)
 *   'yaml'      — an <artifact type="yaml"> block
 *   'classify'  — an sf:classify tag (intent metadata)
 *   'none'      — no observable artifact (analysis / planning step)
 *
 * Extending: skill authors will eventually be able to declare their own
 * output_kind via SKILL.md frontmatter (Story S5.1). Until then this union
 * stays closed — `parser.ts` only validates against these five literals.
 */
export type OutputKind = 'nodes' | 'edges' | 'yaml' | 'classify' | 'none';

/**
 * On-disk record for a single step's lifecycle + payload.
 *
 * Written by `step-store.ts` to
 *   <cwd>/.shadowflow/projects/<session_id>/steps/<step_index>.json
 *
 * Read by:
 *   - retry endpoint (S4.1) — needs 0..n-1 to replay context
 *   - resume endpoint (S4.2) — needs to find the last `status: 'done'`
 *
 * NOT a database row — we accept eventually-consistent disk writes (atomic
 * .tmp+rename) and tolerate partial reads on crash recovery.
 */
export interface StepArtifact {
  session_id: string;
  /** 0-based; matches the position in the skill's step sequence. */
  step_index: number;
  step_name: string;
  output_kind: OutputKind;
  /**
   * Free-form payload. Concrete shape varies by output_kind:
   *   'nodes'    → Array<{ node_id, type, title, ... }>
   *   'edges'    → Array<{ from, to }>
   *   'yaml'     → { filename, content }
   *   'classify' → { output_type, mode, confidence, complexity }
   *   'none'     → null (or any metadata the step wants to record)
   * Kept as `unknown` so the contract stays stable when payload schemas grow.
   */
  payload: unknown;
  /** ISO timestamp. */
  started_at: string;
  /** ISO timestamp; null while running. */
  finished_at: string | null;
  status: 'running' | 'done' | 'failed';
  /** Populated when status === 'failed'. */
  error?: string;
}
