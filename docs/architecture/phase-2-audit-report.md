# Phase 2 Audit Report

**Date**: 2026-05-22
**Auditor**: Agent-Auditor (Lane 4 — read-only)
**Commits audited**: `92394ca..HEAD` (9 commits)
**Baseline**: `docs/architecture/orchestration-transport.md` §"Phase 2 Eng Review · 决策记录"

---

## TL;DR

**PASS-WITH-CAVEATS** — 13 of 14 decisions PASS; 1 prompt-layer violation; 3 notes; 2 recommendations.

- Core architecture (Orchestration ⊥ Transport) is correctly enforced
- All 5 Callable adapters + DAG engine + dispatcher exist and wire together
- `dispatchSkillRunner` / `buildApiClient` / `runTeamBackedSkill` / `ConversationRuntime`
  class — all gone from runtime paths
- `tsc --noEmit` exits 0
- **One real violation**: `prompts/index.ts` ASSEMBLER_HEADER + `phase-1-analyze.ts` still
  tell the LLM "you have 4 tools: list_team_agents / get_skill_anchor / register_agent /
  register_edge" — the prompts lie about tool availability now that no tools[] array is
  ever passed to the model. Runtime-safe (no tool wiring), but the LLM will hallucinate
  failed tool calls until the prompts are cleaned. Doc §2 explicitly listed
  `prompts/phase-2-agent.ts` and `prompts/phase-3-team.ts` as needing the edit and those
  were cleaned, but `phase-1-analyze.ts` and the shared `ASSEMBLER_HEADER` were missed.

---

## Decision audit (14 items)

| #  | Decision                                                      | Status | Evidence                                                                                          |
|----|---------------------------------------------------------------|--------|---------------------------------------------------------------------------------------------------|
| A1 | `LlmCallable.turn()` → `AsyncGenerator<TurnChunk>`            | PASS   | `transport/LlmCallable.ts:138` interface; `workflow/types.ts:57` TurnChunk discriminated union   |
| A2 | C2a artifact-file handoff (history = [])                      | PASS   | `workflow/executor.ts:169` `history: []`; `executor.ts:204-218` writes `plannedArtifactPaths`     |
| A3 | BOTH ApiClient + CLI go daemon-led DAG + artifact handoff     | PASS   | `assembler.ts:459-464` team branch calls `runDag(teamV1, callable, projectDir, signal)`; no LLM tool_use loop remains |
| A4 | DAG: topological parallel + conditional + per-node retry      | PASS   | `workflow/scheduler.ts:155-344` Kahn layering + `Promise.all`; `scheduler.ts:251-254` `withRetry`; `scheduler.ts:292-314` conditional gating |
| A4b| `conditional` uses `expr-eval`                                | PASS   | `workflow/condition.ts:29` `import { Parser } from 'expr-eval'`; `condition.ts:34-53` configured Parser singleton with `assignment:false` / `fndef:false` |
| A5 | M2: `llm-providers/` + `skill-runners/` merged into `transport/` | PASS   | Both old dirs **GONE**; `transport/{api-clients,spawners}/` present; commit `9d06541` git-moved them |
| A6 | O1: non-team skill also uses `LlmCallable.turn()`             | PASS   | `assembler.ts:466-477` non-team branch calls `callable.turn(...)` directly; no `dispatchSkillRunner` fast-path |
| CL3/E3 | Hybrid error model (throw on call-phase, yield on stream)| PASS   | `workflow/types.ts:85-109` `LlmCallError` class with `LlmCallErrorKind` enum; `retry.ts:35-37` re-throws on exhaustion; `executor.ts:189-191` yields error chunk mid-stream |
| C1 | Single `AbortSignal` end-to-end                               | PASS   | `assembler.ts:413` `effectiveSignal`; `scheduler.ts:159` accepts signal; `executor.ts:171` forwards into `callable.turn({...signal})`; `retry.ts:63-78` cancellable sleep |
| T1 | Tests use real APIs (not mock)                                | N/A    | Audit-scope: no mock-LLM dead code in PR diff. CI key wiring is ops territory (not audited)       |
| S3 | Performance ±20% regression gate                              | N/A    | Audit-scope: doc has S3 acceptance criterion; baseline sampling is pre-merge work, not in PR     |
| CL6| 4 SkillAnchorTools replaced by daemon-emit                    | PASS (runtime) / VIOLATION (prompt) | Runtime: `skillAnchorExecutors` / `skillAnchorTools` exported but **0 non-test runtime callers** (`server/src/lib/tools/index.ts` re-exports only). Prompts: see violation below |
| prompts (SKILL.md) | BMAD/paper-review delete tool_use measurement     | PASS   | `.shadowflow/skills/bmad/SKILL.md:20-21` + `:93` explicit "removed — no longer LLM-callable"; same in `paper-review/SKILL.md:20-21` + `:91` |
| chunk routing | SSE chunk carries `node_id`                          | PASS   | `parser.ts:118` `nodeIdField()`; `parser.ts:96/245/291/325` populates node_id in chunk events; `src/core/hooks/useRunSession.ts:206-208` per-node chunk buffer keyed by node_id |

### CL6 Prompt-layer Violation (only real violation)

| Location | Symptom |
|----------|---------|
| `server/src/prompts/index.ts:41-93` | `ASSEMBLER_HEADER` tells LLM "你可以使用以下 4 个工具" and lists `list_team_agents` / `get_skill_anchor` / `register_agent` / `register_edge` with usage examples. **This prompt is still shipped to the LLM** via `skills.ts:92` → `AGENT_TEAM_BLUEPRINT_PROMPT = composeMultiTurnPrompt()`. |
| `server/src/prompts/phase-1-analyze.ts:18, 38, 45` | Output discipline still says "ToolUse `list_team_agents({skill_id})` ——一次就够" and "如果 `list_team_agents` 返回的成员组合明显与 goal 不沾边..." |
| `server/src/prompts/AGENTS.md:7, 11` | Module docs describe the tools as live |

**Why runtime-safe**: the team-backed path now goes through `runDag` (no LLM tool_use), and the non-team path calls `callable.turn(...)` with no `tools` field. The LLM will issue tool_use blocks that nothing answers — Anthropic will return `stop_reason: tool_use` and the call ends.

**Why still a violation**: doc §2 explicitly listed prompt cleanup as in-scope work for Phase 2 (`prompts/phase-2-agent.ts` ← 删 tool_use 词汇, prompts/phase-3-team.ts ← 同上). Phase 2 and Phase 3 prompts were edited; Phase 1 + ASSEMBLER_HEADER were skipped. This causes LLM behavioural drift (hallucinated tool calls, broken `<sf:thinking>` framing) in any flow that goes through `composeMultiTurnPrompt()`.

---

## Orthogonality contract audit

### Orchestration → Transport

**PASS**. Grep `capabilities\.supportsToolUse|callable\.capabilities` against `server/src/assembler.ts` + `server/src/workflow/` → **0 hits**. Orchestration never branches on transport capabilities. `LlmCallable.ts:37-40` documents this explicitly: *"Orchestration MUST NOT branch on capabilities."*

### Transport → Orchestration

**PASS (with documented caveat)**. `workflow/` is **not** imported as a value by `transport/*.ts` except for `LlmCallError` (a value-class) + `TurnChunk` / `LlmCallErrorKind` (types). Per `LlmCallable.ts:46-58`:

> "`TurnChunk` and `LlmCallError` are owned by `workflow/types.ts` (Phase 2 decisions A1 / CL3 / E3). This file re-exports them so callers that only import the Transport contract still see one stable surface."

Imports observed in `transport/`:
- `LlmCallable.ts:44, 52, 58` — type-only re-export
- `dispatcher.ts:19` — runtime `LlmCallError` (value class, not orchestration logic)
- `CliCallable.ts:22`, `AcpCallable.ts:24`, `McpCallable.ts:24`, `ApiClientCallable.ts:43`, `spawner-bridge.ts:32` — same pattern: value-import `LlmCallError`, type-import everything else

The runtime dependency is purely on the data-carrier class (`LlmCallError`) — it carries no orchestration knowledge. No orchestration code, condition evaluation, retry policy, or scheduler logic is reachable from `transport/`.

### Channel exclusivity (only LlmCallable bridges layers)

**PASS**. Grep `from ['"]\.\.+/transport` inside `workflow/`:
- `workflow/scheduler.ts:52` — `import type { LlmCallable } from '../transport/LlmCallable';`
- `workflow/executor.ts:48` — same

Both are `import type`, used only at the type level. The factory boundary (`transport/dispatcher.ts::resolveCallable`) is the only runtime touch-point and it is called from `assembler.ts`, NOT from `workflow/*`. Contract upheld.

---

## Implementation quality

| Check | Result |
|-------|--------|
| `dispatchSkillRunner` runtime callers | **0 non-test callers**. Definition lives at `transport/spawners/index.ts:31` (legacy, retained for spawner-internal use). Test references only in `transport/spawners/cli.test.ts`. |
| `buildApiClient` residue | Removed from `assembler.ts`. Resurrected inside `transport/ApiClientCallable.ts:75-127` as a **private helper** (different scope — encapsulated provider switch, not an orchestration concern). PASS. |
| `runTeamBackedSkill` residue | Gone. Only mentioned in `assembler.ts:18-19` docstring as "removed". PASS. |
| `class ConversationRuntime` residue | Gone. `lib/conversation-runtime.ts` retains ONLY `addUsage()` + type aliases; class deleted in commit `6905478`. PASS. |
| Stale comment: `openai-compat-api-client.ts:89` | **STILL PRESENT** — `// azure is deliberately omitted — see assembler.buildApiClient docstring`. `assembler.buildApiClient` no longer exists. Lane 3 known issue; pointer should be retargeted to `transport/ApiClientCallable.ts:75`. |
| `parser-agent-smoke.ts:3` stale comment | References `AGENT_TEAM_BLUEPRINT_PROMPT` (still exists in `skills.ts:92`, OK). Not stale. |

---

## Commit hygiene

| Commit | Note |
|--------|------|
| `26bc300` Iface | Clean — only `LlmCallable.ts` + `dispatcher.ts` skeleton |
| `4a4f05d` Prompts + parser bundled | **Known parallel-Lane side-effect**: title is "refactor(prompts)" but diff includes `parser.ts` + `parser.test.ts` (40 + 117 lines). Concurrent Lane 1 work landed here. Not blocking; do not roll back. |
| `919407e` Workflow DAG engine | Clean — adds 6 new files only |
| `0b43bd1` Placeholder migration | Clean — type relocation from transport → workflow/types |
| `9d06541` M2 dir consolidation | Clean — pure `git mv` plus 7 line tweaks for import-path fixups |
| `3eff882` 5 Callable + dispatcher factory | Clean — new files only |
| `ea8185b` Frontend chunk routing | Clean — `src/api/runSessions.ts` + `useRunSession.ts` |
| `d7a2671` Assembler rewrite | Clean — single-file 300-line reduction (no collateral) |
| `6905478` Cleanup | Clean — bulk delete of dead code (ConversationRuntime, skill-anchor-executor.ts, related tests) |

---

## Type check

```
cd server && npx tsc --noEmit
EXIT=0
```

---

## Recommendations (not blocking, for follow-up session)

1. **Clean Phase-1 prompt + ASSEMBLER_HEADER** (CL6 prompt violation). Either:
   - Delete the "4 tools catalog" header + remove the `ToolUse list_team_agents` instruction from `phase-1-analyze.ts` (recommended), OR
   - Re-introduce a no-op tool registration that responds with "tool no longer available, the daemon emits this for you" so the LLM has a soft landing
2. **Fix stale pointer**: `server/src/lib/api-clients/openai-compat-api-client.ts:89` should reference `transport/ApiClientCallable.ts:75` instead of the now-deleted `assembler.buildApiClient`
3. **Spawner-bridge taxonomy gap (note)**: `transport/spawner-bridge.ts:12-28` admits it forwards SSE wire-strings as `text-delta` chunks rather than translating into proper `TurnChunk` discriminants. CliCallable / AcpCallable / McpCallable therefore never yield typed `tool-use` / `usage` chunks; everything is `text-delta`. This is deliberate (lossy on chunk taxonomy, lossless on SSE wire) and front-end-compatible, but it means the DAG observer cannot reliably count usage chunks per node. Slate for Phase 2.5 when a metrics surface is needed.
4. **`agent-team-blueprint` skill fallback path**: `assembler.ts:372` still uses `SKILLS['agent-team-blueprint']` as a default skill — combined with #1 means a bare-skill request goes straight into the lying prompt. Consider gating on whether the skill is team-backed or simple and selecting the appropriate prompt.
5. **Test debt (out of audit scope)**: 41 grep-noise lines in `skill-anchors.test.ts` exercise the now-orphan executors. Decide whether to keep them as "schema-fidelity" tests or delete with the executors when CL6 is fully retired.
