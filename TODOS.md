# TODOS

## v2 ConnectionResolver — parallel/barrier block topology

**Status:** ✅ Implemented (2026-04-02)

`ConnectionResolver.resolve()` now supports `strategy="capability"` with catalog
parameter for capability-dependency graph inference. Fan-out, fan-in, cycle
detection, and isolated block handling are all implemented and tested.

See: `docs/plans/spontaneous-assembly/step-b-v2-topology-inference.md`
