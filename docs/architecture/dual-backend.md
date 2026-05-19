# Dual-Backend Architecture

ShadowFlow runs **two backends concurrently**. This is not historical drift —
it's by design. New contributors and Claude/agent sessions hit this split
often, so read this before debugging "why doesn't `/teams` show anything".

## Topology

```
┌───────────────────────┐
│  Vite dev server      │  :3007
│  (front-end)          │
└──────────┬────────────┘
           │  /api/* (proxy)
           ▼
┌───────────────────────┐
│  Node Express         │  :8002
│  server/src/index.ts  │
│                       │
│  Owned routes:        │
│   /api/run-sessions   │
│   /api/runs           │
│   /api/agents         │
│   /api/conversations  │
│   /api/projects       │
│   /api/memory-entries │
│   /api/llm            │
│   /api/auth           │
│   /api/artifacts      │
│   /api/skills         │
│   /api/settings       │
│   /api/design-systems │
│                       │
│  Storage: SQLite      │
│  (.shadowflow/app.sqlite)
└──────────┬────────────┘
           │  unmatched /api/* → proxy-fallback
           ▼
┌───────────────────────┐
│  Python FastAPI       │  :8000
│  shadowflow/api/*     │
│                       │
│  Owned routes:        │
│   /api/teams          │
│   /api/teams/{id}/workflow
│   /api/teams/{id}/policy
│   /api/groups         │
│   /api/groups/{id}/messages
│   /api/inbox          │  (workspace-driven)
│   /api/templates      │
│   /api/templates/{id}/inbox  (legacy)
│   /api/workspaces     │
│                       │
│  Storage: JSON files  │
│  (.shadowflow/teams/  │
│   .shadowflow/groups/ │
│   .shadowflow/workspaces/)
└───────────────────────┘
```

## Route ownership decision matrix

| Concern | Owner | Why |
|---|---|---|
| Run-session streaming (SSE) | Express | TypeScript parser + SSE plumbing more mature in Node |
| Agent CRUD + SQLite app data | Express | Single source of truth, fast indexed lookups |
| Team / Group / Policy / Workflow | Python | File-backed, easy to inspect/version, Story 12 + 7 was Python-first |
| LLM provider routing + BYOK | Express | Already done in Express; Python doesn't need it |
| Inbox aggregation | Python | Lives near its data (teams + groups JSON) |

## The proxy-fallback middleware

`server/src/proxy-fallback.ts` is the glue. It's mounted AFTER all 12 native
Express routers and BEFORE the 404 catch-all. Any `/api/*` request that
didn't match a native router gets forwarded to `PYTHON_BACKEND_URL`
(default `http://localhost:8000`).

**Key behaviour**:
- Returns HTTP **503** with `{ error: { code: 'PYTHON_BACKEND_UNAVAILABLE', message, hint } }` when Python is unreachable, instead of http-proxy-middleware's default opaque 502 socket-error page
- SSE-friendly (clears `cache-control` + `x-accel-buffering` on event-stream responses)
- WebSocket-capable for future Python WS endpoints
- Re-injects `express.json()`-parsed body so Python receives the actual payload

## Front-end status surfacing

When Python is down, `src/api/teams.ts` and `src/api/groupApi.ts` detect
the 503+code combo and call `markPythonDown(detail)` from
`src/core/hooks/usePythonBackendStatus.ts`. The
`<PythonBackendBanner />` component renders a red bar with the start
command — currently mounted on `/teams`, `/chat`, `/run-session`.

## How to start the two backends

```bash
# Terminal 1 — Node Express
cd server && bun run dev    # or: npm run dev    (listens on :8002)

# Terminal 2 — Python FastAPI
python -m uvicorn shadowflow.server:app --port 8000 --reload
```

Override the Python URL if needed:

```bash
PYTHON_BACKEND_URL=http://localhost:8001 bun run dev    # for Express
```

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `/teams` shows "还没有团队" with no banner | Python down AND banner not yet probed | wait ~20s for the poll, or hit the "重试" button |
| `/chat` shows "暂无群组" but Python is up | groups created in another workspace | check the workspace switcher; or run-session auto-save didn't pass workspace_id (Step 2 of data-vertical plan) |
| `createTeam` succeeds but `/teams` empty | Old team JSON has no `workspace_id` field | `_list_teams` treats legacy records as wildcard so they show in any workspace — verify the file at `.shadowflow/teams/team-*.json` |
| HTTP 503 with `PYTHON_BACKEND_UNAVAILABLE` on every call | Python not running | start uvicorn as above |
| HTTP 502 instead of 503 | proxy-fallback misconfigured or non-`/api` path | check `server/src/proxy-fallback.ts` mount order in `index.ts` |
| Front-end can't reach Express at all | Vite proxy target mismatch | check `vite.config.ts` `proxy['/api'].target` |

## Storage paths

Everything Python writes lives under `.shadowflow/`:

```
.shadowflow/
├── teams/                  # Team records (JSON per file)
│   └── team-{uuid}.json    # { team_id, name, workspace_id, agent_ids, ... }
├── groups/                 # Chat groups (JSON per file, includes messages array)
│   └── {uuid}.json         # { group_id, team_id, workspace_id, messages: [...] }
├── workspaces/             # Workspace records
│   └── ws-{uuid}.json
├── agents/                 # Agent state (Express owns, sometimes Python touches)
├── projects/               # Run artifacts (Express)
└── app.sqlite              # Express's SQLite — agents, runs, conversations
```

`.shadowflow/` is **gitignored** — these are local user data.

## End-to-end data flow

For the canonical `start → run-session → /teams → /chat` flow:

1. User clicks a Skill Pack on `/start` → `POST /api/run-sessions` (Express)
2. Server streams SSE blueprint nodes → front-end renders in BlueprintCanvas
3. `session.isComplete = true` → auto-save useEffect fires in `RunSessionPage.tsx:3679`
4. `quickCreateAgent(...)` × N → Express SQLite (`/api/agents`)
5. `createTeam({...workspace_id, agent_ids})` → Python (`/api/teams` via proxy-fallback) → JSON file
6. `createGroup({...workspace_id, team_id, agent_ids})` → Python (`/api/groups`) → JSON file
7. UI shows "Team 已保存 ✓" chip + toast with "查看 Team →" button
8. `/teams` page calls `listTeams(currentWorkspaceId)` → sees the new team
9. `/chat` page calls `fetchWorkspaceInbox(currentWorkspaceId)` → sees the new group
10. User sends message → `postGroupMessage(groupId, text)` → Python appends to group JSON
11. Page reload → `fetchRecentMessages(groupId)` → messages still there

If ANY of steps 5/6/9/10/11 silently fail, check whether Python is running.

## See also

- `server/src/proxy-fallback.ts` — proxy implementation
- `server/src/index.ts` — router mount order
- `src/core/hooks/usePythonBackendStatus.ts` — front-end status hook
- `src/components/PythonBackendBanner.tsx` — UI banner
- `shadowflow/api/teams.py` — Python teams routes
- `shadowflow/api/groups.py` — Python groups routes
- `shadowflow/api/inbox.py` — Python inbox aggregator
