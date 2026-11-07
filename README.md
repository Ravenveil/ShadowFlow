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

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20（推荐 22 LTS） | 前端 Vite 8 + Node 网关 tsx 都跑在 Node 上 |
| pnpm | ≥ 9（推荐，`corepack enable pnpm` 即得） | 前端锁文件是 `pnpm-lock.yaml`；用 npm 装也能跑 |
| Python | ≥ 3.10 | FastAPI 编排核心；Windows/Linux/macOS 均可 |
| Git | 任意近期版本 | clone 仓库 |

## 安装教程（clone 即跑）

### 0. 克隆仓库

```bash
git clone https://github.com/Ravenveil/shadowflow-merged.git
cd shadowflow-merged
```

### 1. 安装依赖（三段，各装各的）

```bash
# ① 新前端（Vite + React 19 + Tailwind 4）
cd frontend && pnpm install && cd ..
#    没有 pnpm 就用 npm install，效果等同

# ② Node 网关（Express API 聚合）
cd backend/node && npm install && cd ..

# ③ Python 编排核心（在仓库根目录执行；推荐 venv）
python -m venv .venv
# Windows:  .venv\Scripts\activate     Linux/macOS:  source .venv/bin/activate
pip install -e "./backend/python[server,memory]"
```

> `server` extras = FastAPI/uvicorn 等服务端全家桶；`memory` = aiosqlite/redis 持久化。
> 不建 venv 直接装进系统 Python 也可以（`pip install -e "./backend/python[server,memory]"`）。
> 启动器会自动优先使用仓库根 `.venv/Scripts/python.exe`（或 `.venv/bin/python`），找不到才回落到 `python`。

### 2. 一键启动（推荐）

```bash
npm run dev                  # 起 Python(8000) + Node 网关(8002) + 新前端(8443)，自动开浏览器
npm run dev -- --no-open     # 不自动开浏览器
npm run dev -- --no-python   # 只起网关 + 前端（跳过 Python）
```

启动成功的标志：控制台打印 `[dev] 全部就绪 → http://localhost:8443/`。
打开 **http://localhost:8443/#/app** 即进入董事长工作台，内置「AI 营销公司」7 角色组织架构即刻可用。

### 3. 验证安装

```bash
curl http://localhost:8002/health     # Node 网关健康检查
curl http://localhost:8002/api/agents # 应返回 8 个内置角色（7 角色 + shadow-secretary）
curl http://localhost:8000/docs       # Python FastAPI 文档页
```

### 4. 可选配置

- **大模型 Key（可选）**：复制 `.env.example` 为 `.env`，填 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 任意一个；不填则走前端 BYOK 设置页（浏览器内填 Key）。
- **重新生成内置角色种子**：`node scripts/seed-ai-marketing-org.mjs`（幂等，覆盖生成 `.shadowflow/agents/`、`.shadowflow/teams/`）。

### 分步启动（不用 dev.mjs 时）

```bash
# 1) Python FastAPI（仓库根目录，端口 8000）
python -m uvicorn shadowflow.server:app --app-dir backend/python --host 127.0.0.1 --port 8000

# 2) Node 网关（端口 8002）
cd backend/node && npm run dev

# 3) 新前端（端口 8443，/api 已代理到 :8002）
cd frontend && pnpm dev
```

### 常见问题

| 现象 | 处理 |
|---|---|
| `端口 8xxx 已被占用` | dev.mjs 会拒绝启动，先停掉占用进程（旧的 uvicorn/tsx watch/vite）再跑 |
| `uvicorn: command not found` / 缺 fastapi | 第 1 步的 `pip install -e "./backend/python[server,memory]"` 没装或 venv 没激活 |
| `better-sqlite3` 编译失败 | Windows 需装 VS Build Tools（C++ 桌面开发工作负荷）后重装 |
| 手机/局域网/隧道域名打不开 | 已配置 `allowedHosts: true`（放行所有域名）+ `host: 0.0.0.0`，直接访问 `http://<你的IP>:8443` 即可 |
| 前端页面能开但接口 404 | 确认 Node 网关(:8002)已启动；Vite 会把 `/api`、`/projects` 代理过去 |

## 依赖清单

**frontend/**（`package.json` + `pnpm-lock.yaml`）
- 运行：`react 19`、`react-dom 19`、`lucide-react`
- 开发：`vite 8`、`@vitejs/plugin-react`、`tailwindcss 4` + `@tailwindcss/vite`、`typescript 5.7`、`oxfmt`、`@types/*`

**backend/node/**（`package.json` + `package-lock.json`）
- 运行：`express`、`http-proxy-middleware`、`cors`、`better-sqlite3`（原生模块）、`js-yaml`、`gray-matter`、`uuid`、`archiver`、`expr-eval`、`htmlparser2`、`turndown`、`ethers`、`puppeteer-core`、`@sparticuz/chromium`、`@anthropic-ai/sdk`、`openai`、`@google/generative-ai`
- 开发：`tsx`、`typescript`、`vitest`、`supertest`、`@types/*`

**backend/python/**（`pyproject.toml`，包名 `shadowflow`）
- 核心：`pydantic 2`、`pyyaml`、`httpx`
- `[server]`：`fastapi`、`uvicorn`、`APScheduler 3.x`、`slowapi`、`python-multipart`
- `[memory]`：`aiosqlite`、`redis`（可选持久化）
- 其他可选 extras：`[mcp]`、`[mcp-servers]`、`[lightrag]`、`[all]`、`[dev]`（pytest/ruff/mypy）

**运行时生成（不入库）**：`.shadowflow/`（会话、技能、设计系统、SQLite）；`.env`（可选 Key）。

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
