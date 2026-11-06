<details open>
<summary><b>English</b> · <a href="#中文版">中文</a></summary>

# ShadowFlow — VSCode for Agent Teams

**Contract-first multi-agent workflow platform · Rejection loops · One-command Docker setup**

[![CI](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)

---

## Problem Statement

Building with AI agents today means writing brittle orchestration code from scratch, with no way to enforce compliance policies, review outputs before they execute, or roll back when an agent goes off-script. **ShadowFlow** is a contract-first multi-agent workflow platform where teams of AI agents collaborate under human-reviewable policy rules — with rejection loops, checkpoint rollback and a plug-in contract for any agent runtime (Claude Code, Codex, MCP, ACP).

---

---

## Quick Start (Docker — ~10 min)

### Prerequisites

| Dependency | Min Version | Notes |
|---|---|---|
| Docker Desktop | 20.10+ | Windows: enable "Use WSL 2 based engine" |
| Git | 2.x+ | |
| API Key (optional) | — | Anthropic / OpenAI / Gemini — any one; leave blank to use BYOK in-browser input |

> **No Python or Node.js install needed** — all dependencies are packaged inside Docker images.

### Run

```bash
git clone https://github.com/Ravenveil/ShadowFlow.git && cd ShadowFlow
cp .env.example .env          # optional: add API key; leave blank for BYOK
docker compose -f docker/docker-compose.yml up -d
```

Open **http://localhost:3000** — you should see the ShadowFlow workflow editor.

> Keys in `.env` are used only as backend provider fallback and are never logged or uploaded (NFR S1).

---

## 5-Minute Demo

Experience the full rejection loop with the **Solo Company** template.

### Step 1 — Pick a template

From the home page click **▶ Quick Demo · 60s** (or navigate to **Templates**), find **Solo Company** (multi-role company collaboration), click **▶ Fork & open**.

### Step 2 — Submit a task

In the workflow editor input area type:

```
Write a compliance-approved weekly tweet
```

Click **Run**.

### Step 3 — Compliance officer triggers rejection

A red toast appears in the Live Dashboard:

```
policy.violation — ComplianceOfficer rejected the draft: sensitive content detected, returning to content officer for revision
```

The `content_draft` node turns red and triggers a `checkpoint rollback`.

### Step 4 — Content officer retries and passes

The system automatically reschedules the content officer node. The revised draft passes policy checks, the node turns green:

```
node.succeeded — content_draft (retry #1) ✓
```

---

## Architecture Overview

```
Browser
  └── React + ReactFlow (Workflow Editor + Live Dashboard)
        ↕ REST + SSE
Backend (FastAPI + Node.js)
  ├── Runtime Engine  →  TaskRecord / RunRecord / StepRecord / Artifact / Checkpoint
  ├── Agent Executors →  CLI (Claude Code / Codex / ShadowSoul) | API | MCP | ACP
  ├── Policy Matrix   →  compile-time validation + runtime reject → handoff + rollback
  └── Provider Layer  →  Claude / OpenAI / Gemini / Ollama (fallback chain)
        ↕ BYOK
```

**Two backends, one API surface:**
- **Python FastAPI** (port 8000) — runtime engine, agents, teams, approvals, policy matrix
- **Node Express** (port 8002) — Skill Studio: CLI auto-discovery, ACP/MCP broker, artifact preview
- **Vite** (port 3007) — frontend; proxies `/api/*` to Node 8002; Node reverse-proxies everything else to Python 8000

---

## How to Plug Your Agent

Full contract: [docs/AGENT_PLUGIN_CONTRACT.md](docs/AGENT_PLUGIN_CONTRACT.md)

ShadowFlow supports four integration channels: `api` (HTTP inference), `cli` (subprocess), `mcp` (single MCP tool call), `acp` (ACP session + approval flow).

Two steps to integrate:
1. Add a preset to `shadowflow/runtime/provider_presets.yaml`
2. Declare `provider: <your-agent>` in your workflow YAML

**Built-in presets:** Hermes (ACP), OpenClaw (CLI), ShadowSoul (ACP+CLI dual path), Claude / OpenAI / Gemini / Ollama (api).

---

## Traction

- Active development since March 2026 — 13 epics shipped: runtime engine, agent executor, policy matrix multi-agent team coordination
- Core runtime contract (7+1 objects) validated with 80+ backend tests
- Docker one-command setup verified on macOS and Windows (WSL 2)

---

## Troubleshooting

### Docker won't start

```bash
# macOS / Linux
lsof -i :8000 && lsof -i :3000

# Windows
netstat -an | findstr "8000 3000"
```

Kill the conflicting process then re-run `docker compose -f docker/docker-compose.yml up -d`.

### No logs / blank screen

```bash
docker compose -f docker/docker-compose.yml logs shadowflow-api
docker compose -f docker/docker-compose.yml logs shadowflow-web
```

Common causes: frontend build failure or port already in use.

### Windows path issues

Docker Desktop → Settings → General → **"Use the WSL 2 based engine"** must be checked.

## Development

### Quick start

```bash
npm run dev
```

Single-command dev, `dsh web` style: starts Python uvicorn (:8000) + Node gateway (:8002) + Vite (:3007), waits until all three are HTTP-ready, then opens the browser at http://localhost:3007. Port conflicts are detected before launch; Ctrl+C (or any child process dying) stops the whole tree — descendants included, no orphaned `uvicorn --reload` workers. `npm run dev:all` is an alias; `dev:python` / `dev:server` / `dev:web` still work for starting parts individually. The launcher auto-detects the Python interpreter (`SF_PYTHON` > repo `.venv` > `python`).

### Tests

```bash
pytest -m "not requires_api_key" --tb=short   # backend
npm run test:run                               # frontend
python scripts/check_contracts.py             # type drift
```

### Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

[MIT](LICENSE) © Ravenveil

---

## Phase 2–3 Roadmap

### Phase 2 — Deep Integration
- **Tauri Sidecar**: desktop app (macOS / Windows), offline-capable
- **River Memory System**: main-stream / tributary / water-gate memory protocol, cross-run semantic persistence

### Phase 3 — Value Network
- **INFT Minting**: mint high-quality trajectories as NFTs — on-chain evidence of agent capability
- **ACP Marketplace**: Agent Plugin Contract marketplace for third-party one-click integration
- **Fleet Management**: multi-project, multi-agent observability and policy governance

</details>

---

<details id="中文版">
<summary><a href="#top">English</a> · <b>中文</b></summary>

# ShadowFlow — Agent Team 的 VSCode

**Contract-first 多智能体编排平台 · 带驳回闭环 · 一键 Docker 本地跑通**

[![CI](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)

---

## 问题痛点

今天的 AI Agent 开发充斥着重复的编排样板代码——没有统一的合规策略执行、无法驳回并回滚失控的 Agent 输出、更没有可审计的链上轨迹。**ShadowFlow** 是一个 contract-first 多智能体工作流平台：AI Agent 团队在人工可审查的 Policy Matrix 下协作，具备驳回闭环、checkpoint 回滚、以及对任何 Agent 运行时（Claude Code、Codex、MCP、ACP）的插件化接入合约。

---

