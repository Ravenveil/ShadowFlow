# ShadowFlow · 合并仓库 —— 新前端 × 旧后端

把 **新前端**（产品宣传页 + 董事长工作台 + BYOK 设置页）和 **旧后端**（ShadowFlow Node 网关 + Python FastAPI 编排核心）合并进同一个可运行仓库，方便预览、评审与二次开发。

> 产品背景：**ShadowFlow — VSCode for Agent Teams**，契约优先的多智能体工作流平台（拒绝环、检查点回滚、任意 Agent 运行时插件契约）。

## 内容来源

| 部分 | 来源 | 版本 |
|---|---|---|
| 新前端 `frontend/` | [Ravenveil/shadowflow-frontend](https://github.com/Ravenveil/shadowflow-frontend) | `df14f98`（与 Figma Make 线上逐字节对齐） |
| 旧后端 `backend/` | [Ravenveil/ShadowFlow](https://github.com/Ravenveil/ShadowFlow) | `backend/node` + `backend/python`（Node 网关 + FastAPI） |

前端版本包含：设置页 BYOK 全功能（MiMo 首位 + 13 家提供商、API 密钥管理、Base URL、自定义模型、拉取远端模型、测试连接、默认模型/回退链）、CEO 主控改名「董事长」。

## 目录结构

```
frontend/        新前端 — Vite + React 19 + Tailwind 4（宣传页 / + 董事长工作台 #/app）
backend/node/    旧后端 · Node 网关 — Express API 聚合（:8002）
backend/python/  旧后端 · Python FastAPI — shadowflow 编排核心（:8000）
templates/       工作流种子模板（*.yaml）
config/          运行配置
dev.mjs          一键启动器（后端 + 前端）
```

## 端口约定

| 服务 | 端口 | 说明 |
|---|---|---|
| 新前端 Vite | 8443 | `frontend/`；`/api`、`/projects` 已代理到 :8002 |
| Node 网关 | 8002 | `backend/node/`，Express API 聚合 |
| Python FastAPI | 8000 | `backend/python/`，`shadowflow.server:app` |

## 快速开始

### 一键启动（推荐）

```bash
npm run dev                  # 起 Python(8000) + Node 网关(8002) + 新前端(8443)，自动开浏览器
npm run dev -- --no-python   # 只起网关 + 前端
npm run dev -- --no-open     # 不自动开浏览器
```

### 分步启动

```bash
# 1) 新前端（仓库约定 pnpm-lock.yaml，推荐 pnpm；npm 亦可）
cd frontend && pnpm install && pnpm dev      # http://localhost:8443

# 2) Node 网关
cd backend/node && npm install && npm run dev # http://localhost:8002

# 3) Python FastAPI（需 Python 3.10+，在仓库根目录执行）
cd backend/python && pip install -e .         # 或 uv sync
cd ../.. && python -m uvicorn shadowflow.server:app --app-dir backend/python --host 127.0.0.1 --port 8000
```

## 说明

- 新前端自带 BYOK 设置页，可直接在浏览器里配置模型提供商/密钥（内置样例数据的展示层，`/api` 通道已接好）。
- 后端首次启动会在仓库根生成 `.shadowflow/` 运行时目录（已 gitignore）。
- 需要服务端大模型能力时，在仓库根放 `.env`（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 任一，可选，参考 `.env.example`）。
- 董事长工作台入口：`http://localhost:8443/#/app`。
- License：MIT
