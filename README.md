<details open>
<summary><b>English</b> · <a href="#中文版">中文</a></summary>

# ShadowFlow — VSCode for Agent Teams

**Contract-first multi-agent workflow platform · Rejection loops · One-command Docker setup**

[![CI](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)
[![0G Ecosystem](https://img.shields.io/badge/0G-Storage%20%2B%20Compute%20%2B%20Chain-6C47FF.svg)](https://0g.ai)

---

## Problem Statement

Building with AI agents today means writing brittle orchestration code from scratch, with no way to enforce compliance policies, review outputs before they execute, or roll back when an agent goes off-script. **ShadowFlow** is a contract-first multi-agent workflow platform where teams of AI agents collaborate under human-reviewable policy rules — with rejection loops, checkpoint rollback, 0G-backed audit trails, and a plug-in contract for any agent runtime (Claude Code, Codex, MCP, ACP).

---

## 0G Stack

| 0G Component | Usage in ShadowFlow |
|---|---|
| **0G Compute** | Provider #5 in the LLM fallback chain — routes inference to DeepSeek V3.1 / Qwen / Gemma via the 0G Compute Network broker SDK. Automatic `processResponse()` fee settlement after every inference call. |
| **0G Storage** | Workflow trajectory archive — completed runs are uploaded to 0G Storage as Merkle-verified immutable audit logs. Frontend BYOK mode (browser uploads directly via 0G JS SDK) and backend proxy mode (`ZEROG_FRONTEND_DIRECT=false`). |
| **0G Chain** | Wallet-based authentication — users connect their 0G Chain wallet; workspace identity and run ownership are tied to the on-chain address. |

> **Contracts**: ShadowFlow does not deploy custom smart contracts. It uses 0G's native ledger and wallet infrastructure directly.

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
docker compose up -d
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

> **0G Archive**: after a run completes, click the archive button in the run detail panel to upload the full trajectory to 0G Storage and receive a Merkle-verified CID.

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
  └── Provider Layer  →  Claude / OpenAI / Gemini / Ollama / 0G Compute (fallback chain)
        ↕ BYOK
0G Network
  ├── 0G Storage  →  trajectory archive (Merkle-verified)
  ├── 0G Compute  →  LLM inference (Provider #5 — DeepSeek / Qwen / Gemma)
  └── 0G Chain    →  wallet auth + on-chain identity
```

**Two backends, one API surface:**
- **Python FastAPI** (port 8000) — runtime engine, agents, teams, approvals, policy matrix
- **Node Express** (port 8002) — Skill Studio: CLI auto-discovery, ACP/MCP broker, artifact preview
- **Vite** (port 3007) — frontend; proxies `/api/*` to Node 8002; Node reverse-proxies everything else to Python 8000

---

## How to Plug Your Agent

ShadowFlow supports four integration channels: `api` (HTTP inference), `cli` (subprocess), `mcp` (single MCP tool call), `acp` (ACP session + approval flow).

Two steps to integrate:
1. Add a preset to `shadowflow/runtime/provider_presets.yaml`
2. Declare `provider: <your-agent>` in your workflow YAML

**Built-in presets:** Hermes (ACP), OpenClaw (CLI), ShadowSoul (ACP+CLI dual path), Claude / OpenAI / Gemini / Ollama (api), 0G Compute (api via broker).

---

## Traction

- Active development since March 2026 — 13 epics shipped: runtime engine, agent executor, policy matrix, 0G integration, multi-agent team coordination
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

Kill the conflicting process then re-run `docker compose up -d`.

### No logs / blank screen

```bash
docker compose logs shadowflow-api
docker compose logs shadowflow-web
```

Common causes: frontend build failure or port already in use.

### Windows path issues

Docker Desktop → Settings → General → **"Use the WSL 2 based engine"** must be checked.

### 0G TS SDK instability on Windows

Known risk: the 0G TS SDK may have WebSocket/WASM compatibility issues on Windows native.

**Workaround:** run the demo on macOS / Linux, or use backend proxy mode (`ZEROG_FRONTEND_DIRECT=false`).

---

## Development

### Quick start

```bash
npm run dev:all
```

Runs Python uvicorn + Node Skill Studio + Vite in parallel with colored logs (PY/NODE/WEB). Ctrl+C stops all three.

### Tests

```bash
pytest -m "not requires_api_key" --tb=short   # backend
npm run test:run                               # frontend
python scripts/check_contracts.py             # type drift
```

---

## Phase 2–3 Roadmap

### Phase 2 — Deep Integration
- **Tauri Sidecar**: desktop app (macOS / Windows), offline-capable
- **River Memory System**: main-stream / tributary / water-gate memory protocol, cross-run semantic persistence
- **0G Storage backend proxy**: server-side trajectory upload for restricted environments

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
[![0G 生态](https://img.shields.io/badge/0G-Storage%20%2B%20Compute%20%2B%20Chain-6C47FF.svg)](https://0g.ai)

---

## 问题痛点

今天的 AI Agent 开发充斥着重复的编排样板代码——没有统一的合规策略执行、无法驳回并回滚失控的 Agent 输出、更没有可审计的链上轨迹。**ShadowFlow** 是一个 contract-first 多智能体工作流平台：AI Agent 团队在人工可审查的 Policy Matrix 下协作，具备驳回闭环、checkpoint 回滚、0G 可验证存档，以及对任何 Agent 运行时（Claude Code、Codex、MCP、ACP）的插件化接入合约。

---

## 0G 技术栈

| 0G 组件 | ShadowFlow 中的用途 |
|---|---|
| **0G Compute** | Provider #5 接入去中心化 LLM 推理网络（DeepSeek V3.1 / Qwen / Gemma）；每次推理后自动调用 `processResponse()` 完成费用结算。 |
| **0G Storage** | 工作流运行轨迹（trajectory）存档至 0G Storage，获得 Merkle 验证的不可篡改审计日志。支持浏览器 BYOK 直传模式（0G JS SDK）和后端代理模式（`ZEROG_FRONTEND_DIRECT=false`）。 |
| **0G Chain** | 钱包身份认证——用户以 0G Chain 钱包地址登录，工作区与运行记录绑定链上身份。 |

> **合约地址**：ShadowFlow 不部署自定义智能合约，直接使用 0G 原生账本与钱包基础设施。

---

## 快速开始（Docker，约 10 分钟）

### 环境依赖

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Docker Desktop | 20.10+ | Windows 用户请开启 "Use WSL 2 based engine" |
| Git | 2.x+ | 克隆仓库 |
| API Key（可选） | — | Anthropic / OpenAI / Gemini 任选其一；不填走 BYOK 浏览器内输入 |

> **无需** 安装 Python 或 Node.js——所有依赖已打包进 Docker 镜像。

### 运行

```bash
git clone https://github.com/Ravenveil/ShadowFlow.git && cd ShadowFlow
cp .env.example .env          # 可选：填入 API Key；不填走 BYOK
docker compose up -d
```

打开 **http://localhost:3000**，看到 ShadowFlow 工作流编辑器即成功。

---

## 5 分钟演示

用 **Solo Company** 模板体验双驳回戏剧全流程。

### Step 1 — 选模板

首页点击 **▶ Quick Demo · 60s**，找到 **Solo Company**，点击 **▶ Fork & open** 进入编辑器。

### Step 2 — 下发任务

```
写一条符合公司合规要求的周报 tweet
```

点击 **Run** 发起执行。

### Step 3 — 合规官触发驳回

```
policy.violation — ComplianceOfficer 拒绝本次草稿：含敏感词汇，退回内容官重写
```

`content_draft` 节点变红，触发 `checkpoint rollback`。

### Step 4 — 内容官重跑并通过

```
node.succeeded — content_draft (retry #1) ✓
```

> **0G 归档**：运行结束后点击归档按钮，将完整轨迹上传至 0G Storage，获得 Merkle 验证 CID。

---

## 架构概览

```
浏览器
  └── React + ReactFlow（工作流编辑器 + 实时看板）
        ↕ REST + SSE
后端（FastAPI + Node.js）
  ├── Runtime Engine  →  TaskRecord / RunRecord / StepRecord / Artifact / Checkpoint
  ├── Agent Executors →  CLI (Claude Code / Codex / ShadowSoul) | API | MCP | ACP
  ├── Policy Matrix   →  编译期验证 + 运行期驳回 → handoff + rollback
  └── Provider Layer  →  Claude / OpenAI / Gemini / Ollama / 0G Compute（fallback chain）
0G 网络
  ├── 0G Storage  →  trajectory 存档（Merkle 验证）
  ├── 0G Compute  →  LLM 推理（DeepSeek / Qwen / Gemma）
  └── 0G Chain    →  钱包身份认证 + 链上 ID
```

---

## 接入你的 Agent

两步接入：
1. 在 `shadowflow/runtime/provider_presets.yaml` 添加 preset
2. 在工作流 YAML 中声明 `provider: <your-agent>`

---

## 牵引力

- 自 2026 年 3 月持续开发，13 个 Epic 已交付
- 核心运行时契约（7+1 对象）经 80+ 后端测试验证
- Docker 一键启动已在 macOS 和 Windows（WSL 2）验证通过

---

## 故障排除

```bash
docker compose logs shadowflow-api   # API 错误
docker compose logs shadowflow-web   # 前端构建错误
```

Windows 用户确保 Docker Desktop 开启 **"Use the WSL 2 based engine"**。

---

## 开发者指南

```bash
npm run dev:all   # 一键启动全部服务
```

```bash
pytest -m "not requires_api_key" --tb=short   # 后端测试
npm run test:run                               # 前端测试
```

---

## Phase 2–3 路线图

- **Tauri Sidecar**：桌面应用，离线可用
- **River Memory 系统**：跨 run 持久化语义记忆
- **INFT 铸造**：高质量 trajectory 铸造为 NFT
- **ACP Marketplace**：第三方 Agent 一键接入

</details>
