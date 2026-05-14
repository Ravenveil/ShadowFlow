<p align="right">
  <a href="README.md">English</a> | <strong>中文</strong>
</p>

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
cp .env.example .env          # 可选：填入 API Key；不填走 BYOK（Windows: copy .env.example .env）
docker compose up -d
```

打开 **http://localhost:3000**，看到 ShadowFlow 工作流编辑器即成功。

> `.env` 中的 Key 仅供后端 provider fallback，不会上传或记录到日志（NFR S1）。

---

## 5 分钟演示

用 **Solo Company** 模板体验双驳回戏剧全流程。

### Step 1 — 选模板

首页点击 **▶ Quick Demo · 60s**（或导航栏 **Templates**），在模板库中找到 **Solo Company**（独立公司多角色协作模板），点击 **▶ Fork & open** 进入编辑器。

### Step 2 — 下发任务

在工作流画布输入区填写指令：

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

> **0G 归档**：运行结束后点击运行详情面板里的归档按钮，可将完整轨迹上传至 0G Storage，获得 Merkle 验证 CID。

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
        ↕ BYOK
0G 网络
  ├── 0G Storage  →  trajectory 存档（Merkle 验证）
  ├── 0G Compute  →  LLM 推理（Provider #5：DeepSeek / Qwen / Gemma）
  └── 0G Chain    →  钱包身份认证 + 链上 ID
```

**两个后端，一个 API 入口：**
- **Python FastAPI**（port 8000）— 运行时引擎、Agent、Team、审批、Policy Matrix
- **Node Express**（port 8002）— Skill Studio：CLI 自动发现、ACP/MCP broker、Artifact 预览
- **Vite**（port 3007）— 前端，所有 `/api/*` 代理到 Node 8002；Node 8002 反向代理其余请求到 Python 8000

---

## 接入你的 Agent

ShadowFlow 支持四种接入通道：`api`（HTTP 推理）、`cli`（子进程）、`mcp`（MCP tool 单次调用）、`acp`（ACP session + 审批流）。

两步接入：
1. 在 `shadowflow/runtime/provider_presets.yaml` 添加 preset
2. 在工作流 YAML 中声明 `provider: <your-agent>`

**已内置预设：** Hermes（ACP）、OpenClaw（CLI）、ShadowSoul（ACP+CLI 双路径）、Claude / OpenAI / Gemini / Ollama（api）、0G Compute（api via broker）

---

## 牵引力

- 自 2026 年 3 月持续开发，13 个 Epic 已交付：运行时引擎、Agent 执行器、Policy Matrix、0G 集成、多 Agent 团队协作
- 核心运行时契约（7+1 对象）经 80+ 后端测试验证
- Docker 一键启动已在 macOS 和 Windows（WSL 2）验证通过

---

## 故障排除

### Docker 起不来

```bash
# 检查端口冲突（macOS / Linux）
lsof -i :8000
lsof -i :3000

# Windows
netstat -an | findstr "8000 3000"
```

停用占用进程后重新 `docker compose up -d`。

### 容器无日志 / 白屏

```bash
docker compose logs shadowflow-api   # 查 API 错误
docker compose logs shadowflow-web   # 查前端构建错误
```

常见原因：前端构建失败或端口被占用。

### Windows 路径问题

确保 Docker Desktop → Settings → General → **"Use the WSL 2 based engine"** 已勾选。

### 0G TS SDK 在 Windows 不稳定

已知风险：0G TS SDK 在 Windows 原生环境可能有 WebSocket/WASM 兼容问题。

**临时方案：** 在 macOS / Linux 机器上运行，或设置 `ZEROG_FRONTEND_DIRECT=false` 使用后端代理模式。

---

## 开发者指南

### 一键启动（推荐）

```bash
npm run dev:all
```

并行运行 Python uvicorn + Node Skill Studio + Vite，日志按颜色区分（PY/NODE/WEB），Ctrl+C 一次停止全部。

分别启动：

```bash
npm run dev:python   # Python FastAPI on :8000
npm run dev:server   # Node Skill Studio on :8002
npm run dev:web      # Vite on :3007
```

### 运行测试

```bash
# 后端测试（跳过需要 API Key 的用例）
pytest -m "not requires_api_key" --tb=short

# 前端测试
npm run test:run

# 类型漂移检查
python scripts/check_contracts.py
```

---

## Phase 2–3 路线图

### Phase 2 — 深度集成

- **Tauri Sidecar**：打包为桌面应用（macOS / Windows），离线可用
- **River Memory 系统**：主流 / 支流 / 水闸记忆协议，跨 run 持久化语义记忆
- **0G Storage 后端代理**：受限环境下的服务器端 trajectory 上传

### Phase 3 — 价值网络

- **INFT 铸造**：将高质量 trajectory 铸造为 NFT，建立 Agent 能力链上证据
- **ACP Marketplace**：Agent Plugin Contract 市集，第三方 Agent 一键接入
- **Fleet Management**：多项目、多 Agent 舰队级观测与策略治理
