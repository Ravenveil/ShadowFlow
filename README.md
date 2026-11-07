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

## 内置：AI 营销公司组织架构 + 任务 DAG

来源：《AI营销公司_组织架构与双线路业务流程设计方案_完整版》第 4 章。
三层扁平结构 = **1 人类创始人（审批门）+ 1 AI 总经理 CEO + 6 部门核心员工**（首版每部门 1 名）：

| 角色 | 部门 | 职责 | 交付物 |
|---|---|---|---|
| 创始人（人类管理者） | — | 业务目标 · 关键审批 · 资源与权限授权 | 目标下达 / 审批授权 |
| AI 总经理 CEO | — | 理解目标 · 拆解任务 · 调度员工 · 汇总结果 | 统一派单 / 成果回传 |
| 市场分析师 | 市场研究部 | 目标用户、市场、竞品和需求分析 | 用户画像 · 市场分析 |
| 品牌策划师 | 品牌策划部 | 品牌定位、产品卖点、品牌故事 | 品牌方案 · 表达规范 |
| 内容策划师 | 内容创作部 | 商品详情页、图文、短视频脚本 | 营销内容包 |
| 运营专员 | 电商运营部 | 商品资料、上架准备、店铺运营支持 | 上架清单 · 运营计划 |
| 商务专员 | 商务拓展部 | 企业采购材料、潜在客户筛选跟进 | 采购方案 · 线索记录 |
| 合规审核员 | 风控审核部 | 内容合规、授权、品牌伦理和质量检查 | 风险清单 · 审核意见 |

任务 DAG（`ai-marketing-co`，默认内置）：

```
创始人(审批门) ──目标下达──▶ CEO ──派单──▶ 市场分析师 ──▶ 品牌策划师
                                                        │
                                              [approve 品牌定稿]
                                                        ▼
                              商务专员 ◀── 合规审核员 ◀── 内容策划师
                                          │    ↺ conditional 返工(≤2)
                                [approve 对外发布]
                                          ▼
                                      运营专员
```

- **汇报关系**：每名员工只向 AI 总经理汇报，不互相派单；任务经 Task API 传递，聊天仅作补充沟通。
- **控制点**：合规审核员可打回并阻断高风险内容（conditional 返工边，`[verdict:reject]`/「驳回」标记触发，≤2 次）；
  品牌定稿与对外发布走 `approve` 边 = 人工审批门，执行前挂起等创始人批准；资金操作由人负责。

种子文件：`.shadowflow/agents/agent-*.agent.yaml`（Node 全局 agent 库）+ `.json`（Python 运行时真源），
`.shadowflow/teams/ai-marketing-co.team.yaml` + `.json`。重跑 `node scripts/seed-ai-marketing-org.mjs` 可重新生成。

## 说明

- 新前端自带 BYOK 设置页，可直接在浏览器里配置模型提供商/密钥（内置样例数据的展示层，`/api` 通道已接好）。
- 后端首次启动会在仓库根生成 `.shadowflow/` 运行时目录（已 gitignore）。
- 需要服务端大模型能力时，在仓库根放 `.env`（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 任一，可选，参考 `.env.example`）。
- 董事长工作台入口：`http://localhost:8443/#/app`。
- License：MIT
