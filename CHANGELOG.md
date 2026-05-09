# Changelog

All notable changes to ShadowFlow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.1.0] — 2026-05-09

### Added
- **RunSession pipeline** — goal-to-team-assembly with live SSE streaming (`RunSessionPage`, `useRunSession`, `src/api/runSessions.ts`)
  - POST `/api/run-sessions` creates a session and starts background assembly
  - GET `/api/run-sessions/{id}/stream` streams `classify → assemble → node/edge → blueprint → complete` events
  - Replay buffer so late-joining clients see full history
- **QuickSwitcher** (`⌘K` / `Ctrl+K`) — fuzzy navigation overlay with keyboard-driven item selection
- **FastAPI router** `shadowflow/api/run_session.py` — SSE backend with in-memory session store, mock fallback when IntentRouter unavailable
- **IntentRouter** `shadowflow/runtime/intent_router.py` — keyword-based goal classification (answer/report/review/workflow)
- **Vite proxy** — `/api` proxied to `http://localhost:8002` with SSE `cache-control: no-cache` passthrough; dev server moved to port 3007
- **Platform-aware kbd shortcut** on StartPage — shows `⌘ ⏎` on macOS and `Ctrl ⏎` on Windows/Linux

### Fixed
- Pre-existing test suite failures: 15 test files now receive `I18nProvider` context via `src/test/utils.tsx` custom render wrapper; `beforeAll` switches i18next to `zh`
- `PolicyHeatmap` color assertions updated to match CSS variable implementation
- `MessageItem` pending-approvals badge assertion updated after emoji → lucide icon migration
- `NarrowNav` label assertions updated to current i18n keys (`Inbox`, `关于`)
- `TeamPage` error text assertion updated to `/加载失败/`
- `AgentDMPage` multi-element `getByText` changed to `getAllByText`

### Security
- `goal` field capped at 2000 characters via Pydantic `Field(max_length=2000)` to prevent oversized payloads
- YAML injection in blueprint description: newlines stripped from goal text before interpolation
- Error messages sanitized — internal exception detail no longer sent to SSE clients
- `asyncio.create_task` reference stored in session dict to prevent premature GC

### Changed
- `getApiBase()` fallback changed from `http://localhost:8000` to `''` (empty string) — relative URLs are now used so Vite proxy handles routing in dev; production requires `VITE_API_BASE` or same-origin backend
- `navigator.platform` replaced with `navigator.userAgent` (platform is deprecated)
- `TICK_TOKEN` animation timer now stopped when run session completes

## [1.0.0] — initial release
