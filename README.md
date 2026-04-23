# ShadowFlow — Agent Team 的 VSCode

**Contract-first 多智能体编排平台 · 带驳回闭环 · 一键 Docker 本地跑通**

[![CI](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)
[![0G Ecosystem](https://img.shields.io/badge/0G-Storage%20%2B%20Compute-6C47FF.svg)](https://0g.ai)

> **ShadowFlow 的核心赌注**：ACP（Agent Communication Protocol）是下一个 LSP——就像 Language Server Protocol 统一了 IDE 与语言工具链，ACP 将统一 Agent 与协作平台。ShadowFlow 是这个基础设施层的第一个实现。
>
> 架构象限图：[docs/design/shadowflow-strategy-bet-v1.md](docs/design/shadowflow-strategy-bet-v1.md)

---

## Prerequisites

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Docker Desktop | 20.10+ | Windows 用户请开启 "Use WSL 2 based engine" |
| Git | 2.x+ | 克隆仓库 |
| API Key（可选） | — | Anthropic / OpenAI / Gemini 任选其一；不填则走浏览器内 BYOK 输入 |

> **不需要** Python / Node.js 安装——所有依赖均已打包进 Docker 镜像。

---

## Quick Start

```bash
git clone https://github.com/Ravenveil/ShadowFlow.git && cd ShadowFlow
cp .env.example .env          # 可选：填入 API Key；不填走 BYOK（Windows cmd: copy .env.example .env）
docker compose up -d
```

访问 **http://localhost:3000** — 看到 ShadowFlow 工作流编辑器即成功。

> **提示**：`.env` 中的 key 仅供后端 provider fallback 使用，不会上传或记录到日志（NFR S1）。

---

## 5-Minute Demo

用 **Solo Company** 模板体验双驳回戏剧全流程。

### Step 1 — 选模板

首页点击 **▶ Quick Demo · 60s**（或导航栏 **Templates**），在模板库中找到 **Solo Company**（独立公司多角色协作模板），点击 **▶ Fork & open** 进入编辑器。

### Step 2 — 下发任务

工作流画布打开后，在输入区填写指令：

```
写一条符合公司合规要求的周报 tweet
```

点击 **Run** 发起执行。

### Step 3 — 合规官触发驳回

Live Dashboard 右侧出现红色 Toast：

```
policy.violation — ComplianceOfficer 拒绝本次草稿：含敏感词汇，退回内容官重写
```

节点图中 `content_draft` 节点变红，触发 `checkpoint rollback`。

### Step 4 — 内容官重跑并通过

系统自动重新调度内容官节点，本次生成合规草稿，节点变绿，看板显示：

```
node.succeeded — content_draft (retry #1) ✓
```

> **0G 归档**（Epic 5 完成后可用）：运行结束后可将 trajectory 归档至 0G Storage，获得 CID 和链上验证链接。当前版本尚未集成此功能。

---

## Troubleshooting

### Docker 起不来

```bash
# 检查端口冲突（macOS / Linux）
lsof -i :8000    # API 端口
lsof -i :3000    # Web 端口

# 检查端口冲突（Windows）
netstat -an | findstr "8000 3000"
```

停用占用进程后重新 `docker compose up -d`。

### 容器无日志 / 白屏

```bash
docker compose logs shadowflow-api   # 查 API 错误
docker compose logs shadowflow-web   # 查前端构建错误
```

常见原因：前端构建失败（查看 `shadowflow-web` 容器日志）或端口被占用。

### Windows 路径问题

确保 Docker Desktop → Settings → General → **"Use the WSL 2 based engine"** 已勾选。
WSL 2 路径格式：`/mnt/d/...`（不要使用 `D:\...`）。

### 0G TS SDK 在 Windows 不稳定

已知风险（中等概率）：0G TS SDK 在 Windows 环境下可能有 WebSocket/WASM 兼容性问题。

**临时方案**：
1. 在 macOS / Linux 机器上运行演示
2. 或等待 Epic 5 完成后端代理模式支持

---

## Architecture Overview

```
Browser
  └── React + ReactFlow (Workflow Editor + Live Dashboard)
        ↕ REST + SSE
Backend (FastAPI)
  ├── Runtime Engine  →  TaskRecord / RunRecord / StepRecord / Artifact / Checkpoint
  ├── Agent Executors →  CLI (Claude / Codex / ShadowSoul) | API | MCP | ACP
  ├── Policy Matrix   →  compile-time validation + runtime reject → handoff + rollback
  └── Provider Layer  →  Claude / OpenAI / Gemini / Ollama / 0G Compute (fallback chain)
        ↕ BYOK
0G Network
  ├── 0G Storage      →  trajectory archive (Merkle-verified)
  └── 0G Compute      →  LLM inference (Provider #5)
```

完整架构文档：[_bmad-output/planning-artifacts/architecture.md](_bmad-output/planning-artifacts/architecture.md)

运行时契约（7+1 核心对象）：[docs/RUNTIME_CONTRACT_SPEC.md](docs/RUNTIME_CONTRACT_SPEC.md)

---

## How to Plug Your Agent

ShadowFlow 支持四种接入通道：`api`（HTTP 推理）、`cli`（子进程）、`mcp`（MCP tool 单次调用）、`acp`（ACP session + 审批流）。

接入只需两步：① 在 `shadowflow/runtime/provider_presets.yaml` 添加 preset；② 在工作流 YAML 中声明 `provider: <your-agent>`。

完整接入指南（ABC 契约 / YAML 样板 / worked example / 健康检查）：

**[docs/AGENT_PLUGIN_CONTRACT.md](docs/AGENT_PLUGIN_CONTRACT.md)**

> 已内置预设：Hermes（ACP）、OpenClaw（CLI）、ShadowSoul（ACP+CLI 双路径）、Claude / OpenAI / Gemini / Ollama（api）。

---

## Phase 2–3 Roadmap

### Phase 2 — 深度集成

- **Tauri Sidecar**：打包为桌面应用（macOS / Windows），离线可用
- **Shadow 集成**：接入 Shadow 智能体生态，自动发现并注册 Agent 能力
- **River Memory 系统**：主流/支流/水闸记忆协议，跨 run 持久化语义记忆

### Phase 3 — 价值网络

- **INFT 铸造**：将高质量 trajectory 铸造为 NFT，建立 Agent 能力链上证据
- **ACP Marketplace**：Agent Plugin Contract 市集，第三方 Agent 一键接入
- **Fleet Management**：多项目、多 Agent 舰队级观测与策略治理

---

## Development

### TypeScript Type Generation

Frontend TypeScript interfaces are auto-generated from the Pydantic runtime contracts.
**After modifying `shadowflow/runtime/contracts.py`**, regenerate and commit the types:

```bash
python scripts/generate_ts_types.py
git add src/core/types/workflow.ts
git commit -m "chore: regenerate TS types from contracts.py"
```

The CI `lint-backend` job runs `python scripts/check_contracts.py` and will **fail** if
`src/core/types/workflow.ts` is out of sync with `contracts.py`.

### Running Tests

```bash
# Backend tests (exclude API key tests)
pytest -m "not requires_api_key" --tb=short

# Frontend tests
npm run test:run

# Type drift check
python scripts/check_contracts.py
```

### Git Workflow

- Branches: `epic/{name}` per epic (not per issue)
- Commit format: `Issue #{number}: {description}`
- PRs: must pass CI (lint + test + docker + type-drift + secret-scan)
