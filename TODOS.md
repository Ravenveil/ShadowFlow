# TODOS

## v2 ConnectionResolver — parallel/barrier block topology

**Status:** Deferred to v2 (filed from eng review, 2026-04-01)

In v1, `ConnectionResolver` produces a strict linear chain:
`block1 → block2 → ... → END`

This means `parallel` and `barrier` (kind=`control`) blocks are **excluded** from
the v1 linear chain. They require fan-out/fan-in topology that the v1 resolver
cannot express.

**v2 upgrade plan:**

1. Give `WorkflowBlockSpec` an `input_requirements: List[str]` field (mirror of
   `capabilities` on the output side).
2. `ConnectionResolver.resolve()` builds a capability-dependency graph:
   if block A's `capabilities` overlap with block B's `input_requirements`,
   add edge A → B.
3. This enables non-linear topologies: `parallel` fans out to N workers,
   `barrier` collects their results.
4. Entry point: `ConnectionResolver` in `shadowflow/assembly/activation.py`,
   the comment marked `# TODO(v2)`.

**Why deferred:**
v1 deterministic linear chain is sufficient for the current catalog (plan→execute,
plan→review→execute). Topology inference adds complexity only justified when
catalog grows beyond ~10 blocks or when fan-out patterns are explicitly needed.

**Reference:**
- Design doc: `C:/Users/jy/.gstack/projects/Ravenveil-AgentGraph/jy-main-design-20260401-182636.md`
- Research: `research/拓扑/README.md` (Prompt2DAG, AFlow, Survey 2603.22386)
