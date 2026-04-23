# ShadowSoul Runtime SPIKE — Decision Record

## Context

Story 2.5 requires ShadowFlow to integrate the ShadowSoul agent (from the Shadow/shadow-soul-cli Rust project).
The Shadow project exposes ShadowSoul via a `shadow` binary.

## Decision: ACP-first, CLI fallback

### Option 1 — ACP (chosen as primary)
`shadow acp serve` starts a JSON-RPC 2.0 server on stdio (LSP-style).
ShadowFlow's `AcpAgentExecutor` (Story 2.3) speaks this protocol directly.
Template declaration: `executor: {kind: "acp", provider: "shadowsoul"}`.
Auto-registered in `ExecutorRegistry` as `("acp", "shadowsoul")` with
command `["shadow", "acp", "serve"]`.

**Status:** Supported today — requires `shadow` binary in PATH.

### Option 2 — CLI fallback
`shadow run --id {id} --input {stdin}` runs a one-shot JSONL-tail execution.
Template declaration: `executor: {kind: "cli", provider: "shadowsoul"}`.
Preset defined in `provider_presets.yaml`.

**Status:** Supported today via `CliAgentExecutor` — requires `shadow` binary.

## Binary Discovery & Degradation

`shadowflow/runtime/health.py` → `check_shadowsoul_binary()` calls `shutil.which("shadow")`.

On server startup, `_check_agent_binaries()` runs for all three agents
(shadowsoul, hermes, openclaw) and logs warnings for missing binaries.

`/health` endpoint returns:
```json
{
  "status": "healthy",
  "agents": {
    "shadowsoul": {"ok": false, "binary": "shadow", "error": "not found"},
    "hermes":     {"ok": true,  "path": "/usr/bin/hermes", "version": "0.2.1"},
    "openclaw":   {"ok": false, "binary": "openclaw", "error": "not found"}
  }
}
```

## Fallback Behaviour

When `shadow` binary is absent at dispatch time, `CliAgentExecutor.dispatch()` returns
an `AgentHandle(status="degraded")` instead of raising.
`stream_events()` emits `agent.degraded` with `fallback_chain: ["api:claude"]`.

This keeps Demo workflows running even on machines without `shadow` installed.
The UI can detect `agent.degraded` events and display a warning badge.

## Outcome

No Rust compilation work required for MVP.
Full integration test (Solo Company template with real `shadow` binary) deferred to Sprint 1 end.
