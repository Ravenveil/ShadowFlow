# BMAD Performance Baseline

Tracks `docs/architecture/orchestration-transport.md` §3 acceptance criterion
**S3 — Phase 2 性能 regression gate: BMAD wall-clock 不慢于 today ±20%**.

This file has two halves:

1. **Scheduler-overhead baseline** (this commit, measurable, runs in CI) —
   uses a stub callable with a fixed simulated LLM delay so we can detect
   accidental O(N²) blowups or queue lock contention in `workflow/scheduler.ts`
   without burning real tokens.
2. **Real-LLM wall-clock baseline** (manual, requires user) — recorded on
   demand when a refactor risks the hot path. Sample with the recipe at the
   bottom of this file and append a row to the table.

---

## 1. Scheduler-overhead baseline

Run with:
```bash
cd server && npx tsx scripts/perf-bmad-baseline.ts
```

Environment knobs:
- `PERF_RUNS` (default 20) — number of timed iterations after a 3-run warm-up
- `PERF_NODE_DELAY_MS` (default 50) — synthetic per-node LLM delay
- `GIT_COMMIT` — propagate the commit sha into the output JSON for CI logs

The script runs the BMAD-METHOD DAG with its conditional back-edge stripped
(per the known scheduler limitation; see `docs/qa/bmad-cli-e2e-recipe.md`).
4 sequential nodes (pm → arch → dev → qa).

### Recorded baseline (commit `7e9fe80`, 2026-05-25)

```json
{
  "run_count": 20,
  "per_node_delay_ms": 50,
  "node_count": 4,
  "wall_clock_ms": {
    "min": 243.9,
    "median": 246.6,
    "p95": 249.7,
    "max": 249.7
  },
  "expected_llm_floor_ms": 200,
  "scheduler_overhead_ms_median": 46.6,
  "overhead_ratio": 0.19
}
```

Interpretation:
- LLM floor = 4 nodes × 50ms = **200 ms**
- Median wall-clock = **246.6 ms**
- **Scheduler overhead = 46.6 ms** (≈ 19 % of total)
- p95 sits within 1 ms of median → run-to-run jitter is negligible

### Regression gate (S3)

If a future commit pushes `scheduler_overhead_ms_median` above **70 ms**
(≈ ±50 % of the recorded baseline) at the same run_count / per_node_delay_ms,
flag it as a regression and investigate before merging. A 20 % gate is too
tight given the GC + setTimeout jitter on the Node event loop; 50 % is
loose enough to ignore noise while catching genuine algorithmic blowups
(e.g. a quadratic in-degree recomputation).

### How to record a new baseline

When a deliberate refactor changes the expected number (e.g., sub-workflow
support is added), edit this section with:
- new JSON block
- new commit sha
- one-sentence reason for the change

---

## 2. Real-LLM wall-clock baseline (manual)

The scheduler-overhead baseline does **not** capture network latency,
provider variance, or CLI subprocess spawn cost — all dominate real runs.
Record a real number on demand using the recipe below; for now, this section
intentionally has no number, because nobody has paid for a clean cohort of
runs yet.

### Recipe

1. Apply prerequisites from `docs/qa/bmad-cli-e2e-recipe.md` §Prerequisites.
2. Pick a fixed prompt — e.g. `"/BMAD-METHOD:pm 帮我做一个 todo app"`.
3. Run the same prompt **5 times** at each picker setting and record
   wall-clock from "Send" click to the final `complete` SSE chunk. Use
   browser DevTools Network → EventStream → header timing for the start; the
   end is when the stream closes.
4. Append a row per picker to the table below.

### Recorded real-LLM baselines

| Date | Commit | Picker | Prompt | Runs | Median (s) | p95 (s) | Notes |
|---|---|---|---|---|---|---|---|
| _TBD_ | `7e9fe80` | `cli:claude` | `/BMAD-METHOD:pm 帮我做一个 todo app` | 5 | — | — | first cohort needed |
| _TBD_ | `7e9fe80` | `byok:zhipu` | (same) | 5 | — | — | AC #2 parity check |
| _TBD_ | `7e9fe80` | `byok:anthropic` | (same) | 5 | — | — | upper-bound reference |

### Regression gate (S3, real-LLM)

When a real-LLM baseline exists (first row above), the regression gate is
**median ≤ baseline × 1.2**. Provider variance dominates here — if a single
re-run differs from the baseline by more than 20 %, take a 3-run sample
before declaring a regression.

---

## Why this lives in two halves

Phase 2 doc §3 S3 says "today × 1.2", which assumes a single number is
"today's wall-clock". In practice there's a confound: real-LLM wall-clock
depends on provider state (rate limits, model latency, weekend vs weekday)
which is not under our control. Splitting overhead from wall-clock lets:

- CI catch real regressions in **our** code (scheduler overhead) on every
  push, deterministically, in < 1 s
- Manual runs catch regressions in **wall-clock** when a refactor warrants
  the cost (real LLM + tokens + 5-run cohort)

This matches the doc §3 intent without burning tokens on every commit.
