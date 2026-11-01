# BMAD-METHOD × cli:claude — Manual E2E Recipe

**Owner**: 后端 chat-flow 团队
**Last verified**: TBD（recipe 已写，物理跑通需用户出 token + 时间）
**Coverage gap**: `docs/architecture/orchestration-transport.md` §3 Acceptance
Criteria #1（BMAD cli:claude 端到端 13 agent + artifact 落盘） and #2（BMAD
byok:zhipu 行为等价）

This recipe is the manual companion to `server/src/__tests__/bmad-dag-wiring.test.ts`.
The unit test proves the Orchestration ⊥ Transport wiring (loadTeam → runDag →
stub callable → artifacts on disk). This recipe proves the **real** CLI subprocess
streams Claude output end-to-end through the daemon's SSE pipe.

---

## Prerequisites

1. **Claude Code CLI** authenticated and on `PATH`:
   ```bash
   which claude               # → /c/Users/jy/.local/bin/claude (Windows Git-Bash)
   claude --version           # any 0.x is fine
   ```
2. **BMAD-METHOD skill installed** at `server/.shadowflow/skills/BMAD-METHOD/`
   (the daemon's `cwd` is `server/`, so its `.shadowflow/` lives there).
   If missing, install via the StartPage → SkillPack click flow (see
   `src/pages/StartPage.tsx` `handleSkillPack`).
3. **Daemon up** on port 8002, **Python backend up** on port 8000 (only
   strictly required for the proxy-fallback paths; BMAD doesn't need Python
   directly for the run-session SSE, but the front-end will banner-warn).
   ```bash
   # terminal A
   cd server && npm run dev
   # terminal B (optional but recommended)
   cd shadowflow && uvicorn api:app --reload --port 8000
   ```
4. **Empty workspace**: create a fresh per-run dir under `.shadowflow/projects/`
   so artifacts are isolated. The route handler does this automatically.

## Trigger a session

Open the front-end at `http://localhost:5173/start`, then:

1. Open the Picker dropdown → pick **cli:claude** (NOT byok:*).
2. Open the SkillPack dropdown → pick **BMAD-METHOD**.
3. Enter a prompt, e.g.:
   ```
   /BMAD-METHOD:pm 帮我做一个 todo app, 用户故事列出来
   ```
4. Send. The SSE stream should emit `<sf:agent-substep>` events one per
   member as the DAG progresses through pm → arch → dev (qa is gated by
   the back-edge — see "Known limitation" below).

## What to record

- **Screenshot 1** — the chat view immediately after send, showing the
  TeamEditor panel rendering all 4 member tiles (pm / arch / dev / qa).
  Save as `_evidence/bmad-cli-e2e/01-team-rendered.png`.
- **Screenshot 2** — mid-stream, with pm's tile filled in and arch's tile
  showing the typing indicator. Save as `02-mid-stream.png`.
- **Screenshot 3** — final state, with at least pm and arch tiles complete.
  Save as `03-completed.png`.
- **Console export** — open DevTools → Network → click the run-session
  request → copy the EventStream contents. Save as `04-sse-trace.txt`.
- **Artifact listing** — `ls -la server/.shadowflow/projects/<session-id>/`
  should show real Markdown content (not stub text). Save as `05-artifacts.txt`.

## Pass criteria

- [ ] DevTools Network → SSE stream contains at least 4 `<sf:agent-substep>`
      frames, one per member.
- [ ] At least 2 artifact files exist under the session workspace with
      non-empty real text content (length > 100 chars, not stub).
- [ ] No `error` chunks in the SSE for the forward chain.
- [ ] Browser console shows zero errors related to `cli:claude` or
      `LlmCallError`.
- [ ] The TeamEditor panel renders the per-node SSE events into the correct
      member tiles (i.e. pm output ends up in pm tile, not arch).

## Known limitation — back-edge dev↔qa

`BMAD-METHOD.team.yaml` declares `qa → dev` as a conditional back-edge with
`condition: bug_found`. The current scheduler (`workflow/scheduler.ts`)
counts all incoming edges (including conditional ones) in the initial
in-degree, so `dev` starts with in-degree 2. After `arch` finishes, dev's
in-degree drops to 1; it cannot drop again until qa runs — and qa cannot
run because it's downstream of dev. Result: **dev and qa never run**.

Status: known scheduler limitation, tracked in
`docs/architecture/orchestration-transport.md` §6 TODOS. The pragmatic
workaround is to author teams without back-edges; the long-term fix is
sub-workflow / checkpoint / resume.

For this recipe: it is acceptable to see pm + arch complete only. Mark
dev/qa as "not yet" rather than "failed" in the run report.

## Comparison run — byok:zhipu (AC #2)

Repeat the same recipe with the Picker set to `byok:zhipu` (or any other
BYOK provider you have credentials for). The artifact contents should be
**qualitatively similar** — same agent personas, similar output shape — but
not byte-identical. Phase 2 decision A3 unified both transports onto the
DAG scheduler with artifact handoff (no LLM tool_use), so the difference
between byok and cli should be transport-level only (latency, streaming
granularity), not orchestration-level.

Acceptance: the resulting artifacts on disk under both runs should
demonstrably address the same prompt with the same agent role split.
Variance in wording is expected.

## When the recipe fails

| Symptom | Likely cause | Where to look |
|---|---|---|
| `executor-unknown` SSE error | Picker sent a string the dispatcher doesn't recognise | `server/src/transport/dispatcher.ts:165` + test |
| `provider-error: no workspace / cwd` | CliCallable invoked without `workspace` field | `server/src/transport/CliCallable.ts:65` |
| Pickers' BMAD option missing | SkillPack didn't install — check `server/.shadowflow/skills/BMAD-METHOD/` exists | `src/pages/StartPage.tsx` handleSkillPack + `/api/skills/ingest` route |
| Front-end "暂无数据" banner | Python backend (port 8000) is down | `usePythonBackendStatus.ts` |
| SSE stream cuts mid-stream | Likely CLI subprocess crashed | `server/.shadowflow/projects/<id>/` for partial artifacts + daemon log |

## Post-verification checklist

After a successful real-CLI run:

- [ ] Update this file's `Last verified` date.
- [ ] Move screenshots into `_evidence/bmad-cli-e2e/` (already in `.gitignore`).
- [ ] If anything in the wiring needed manual fixing during the run, file a
      bug in this doc with the symptom + fix; the unit test should be
      extended to cover it.
