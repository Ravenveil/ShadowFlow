# ShadowFlow

**让 AI 员工按你的方法协同工作。** 从客户需求到专业成果交付——你负责判断与决策，AI 团队负责执行。

ShadowFlow 是一个契约优先的多智能体业务协作平台：把散落的大模型能力组织成**有岗位、有上下游、有质量标准**的业务流程，并把执行过程与团队、任务、成本和交付成果关联起来。内置「董事长工作台」作为人类管理者的统一操控台——下达目标、审批关键节点、查看经营看板。

## 核心能力

- **董事长工作台**：统一的团队操控台（`/#/app`）。群聊派单、任务 DAG 流转、交接记录、人工审批卡、Agent 团队与知识库管理、数据看板，一处可见可控。
- **AI 员工团队与任务 DAG**：为每个岗位配置职责、能力与输出协议；任务沿 DAG 依次交接，员工只向总经理汇报。团队一键搭建（幂等），复用不重建。
- **人工审批门**：关键节点（品牌定稿、对外发布等）以 `approve` 边挂起，等董事长批准后流水线自动继续；拒绝则跳过并拦截下游交接。合规审核员可「驳回」打回返工（≤2 次）。
- **业务标记协议（craft-markers）**：Agent 输出中独占一行的 `[intake]` / `[post]` / `[link]` / `[order]` / `[ship]` / `[report]` 等标记，自动解析落库（商品、社媒发布、订单、快递、盈利汇报），并从聊天展示中剥离——聊天即业务操作台。
- **知识库**：对话中的产品素材（文字 / 图片 / 文档）自动入库，此后每轮对话自动检索注入相关上下文。
- **数据看板**：用量、成本、Run 成功率、每日简报、产品盈利追踪（盈利曲线、每卖 100 元去向、订单履约表），全部库内现算。
- **BYOK 模型接入**：浏览器内配置大模型提供商与密钥（MiMo 首位 + 13 家提供商），支持自定义模型、拉取远端模型列表、测试连接、默认模型与回退链；也支持 `.env` 环境变量方式。
- **mock / real 双模**：社媒发布、快递承运默认 mock 模式（确定性回执，不发外网）；签约真实账号后按同一接口切换 `real`（如小红书 OAuth2 发布链）。

## 内置演示业务线：手工艺品代销

手工艺人只负责上架商品，AI 团队负责营销、联系快递员寄出，并把订单 / 盈利 / 快递情况同步回平台。三层扁平组织：

| 层级 | 角色 | 职责 |
|---|---|---|
| 创始人（人类） | **董事长**（工作台使用者） | 业务目标 · 关键审批 · 资源授权 |
| AI 总经理 | **总经理**（`agent-shadow-secretary`） | 理解目标 · 拆解派单 · 汇总回传 |
| 市场研究部 | 市场分析师 | 用户画像 · 市场分析 |
| 品牌策划部 | 品牌策划师 | 品牌方案 · 表达规范 |
| 内容创作部 | 内容策划师 | 营销内容包（详情页 / 图文 / 短视频脚本） |
| 电商运营部 | 运营专员 | 上架清单 · 运营计划 · 盈利汇报 |
| 商务拓展部 | 商务专员 | 采购方案 · 线索记录 · 快递合作 |
| 风控审核部 | 合规审核员 | 风险清单 · 审核意见（可驳回返工） |

任务 DAG（`[build-team]` 一键搭建团队，`[dispatch]` 按岗派单）：

```
总经理 ──▶ 市场分析师 ──▶ 品牌策划师 ──[品牌定稿·审批门]──▶ 内容策划师
                                                              │
                          运营专员 ◀─[对外发布·审批门]─ 合规审核员
                              │                         ↺ 驳回返工(≤2)
                              └──▶ 商务专员（快递合作）
```

全流程演示与验证记录见 [docs/手工艺品代销-演示流程拆解.md](docs/手工艺品代销-演示流程拆解.md)。

## 系统架构

```
浏览器
  │
  ▼
前端 Vite (:8443) ──/api、/projects 代理──▶ Node 网关 (:8002)
宣传页 · 董事长工作台                          Express API 聚合 · 业务域落库
BYOK 设置页 · 数据看板                              │
                                                   ▼
                                          Python FastAPI (:8000)
                                          shadowflow 编排核心
                                          （Agent 运行时 · 任务 DAG · 知识库）
```

| 服务 | 端口 | 说明 |
|---|---|---|
| 前端 Vite | 8443 | `frontend/`，Vite 8 + React 19 + Tailwind 4 |
| Node 网关 | 8002 | `backend/node/`，Express API 聚合（tsx watch 热重载） |
| Python FastAPI | 8000 | `backend/python/`，`shadowflow.server:app`（--reload 热重载） |

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | **≥ 20.19**（推荐 22 LTS） | 前端 Vite 8 硬性要求 20.19+ 或 22.12+ |
| npm / pnpm | 随 Node 自带即可 | 前端锁文件是 `pnpm-lock.yaml`，用 npm 一样跑 |
| Python | **≥ 3.10** | FastAPI 编排核心 |
| Git | 任意近期版本 | 克隆仓库 |

Windows 上 `better-sqlite3` 原生模块编译需要 [VS Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾选「使用 C++ 的桌面开发」）。

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/Ravenveil/shadowflow-merged.git
cd shadowflow-merged
```

### 2. 安装依赖（三段，各装各的）

```bash
# ① 前端（Vite + React 19 + Tailwind 4）
cd frontend && npm install && cd ..

# ② Node 网关（Express，含 better-sqlite3 原生模块）
cd backend/node && npm install && cd ..

# ③ Python 编排核心（务必在仓库根目录建 .venv）
python -m venv .venv
# Windows 激活：  .venv\Scripts\activate     Linux/macOS 激活：  source .venv/bin/activate
pip install -e "./backend/python[server,memory]"
```

> `server` extras = FastAPI / uvicorn 等服务端全家桶；`memory` = aiosqlite / redis 持久化。
> 启动器会自动优先使用仓库根 `.venv` 里的 Python，找不到才回落到系统 `python`。
> 国内网络慢可先设镜像：`npm config set registry https://registry.npmmirror.com`、
> `pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple`。

### 3. 一键启动

```bash
npm run dev                  # 起 Python(:8000) + Node 网关(:8002) + 前端(:8443)，自动开浏览器
npm run dev -- --no-open     # 不自动开浏览器
npm run dev -- --no-python   # 只起网关 + 前端（界面能看，AI 编排不可用）
```

成功标志：控制台打印 `[dev] 全部就绪 → http://localhost:8443/`。

打开 **http://localhost:8443/#/app** 进入董事长工作台，内置「手工艺品代卖」业务线即刻可用：
与总经理对话发产品素材 → 自动入知识库 → `[build-team]` 搭建 6 部门团队 → DAG 派单执行 →
审批门拍板 → 发帖上链接 → 订单 / 快递 / 盈利自动同步看板。

### 4. 验证安装

```bash
curl http://localhost:8002/health       # Node 网关健康检查
curl http://localhost:8002/api/agents   # Agent 库（内置总经理 agent-shadow-secretary）
curl http://localhost:8000/docs         # Python FastAPI 文档页
```

> 「手工艺品代卖」6 部门团队由总经理发 `[build-team]` 时按需幂等搭建（或调用产品盈利看板的团队搭建接口），无需手动播种。

## 配置（可选）

- **大模型 Key**：不配也能启动界面。要用服务端 AI 能力，复制 `.env.example` 为 `.env`，填 `MIMO_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 任一；或者直接在前端「设置 → BYOK」页面里填（浏览器内配置，支持 13 家提供商、自定义模型与回退链）。
- **小红书真实发布**（可选）：`.env` 里配 `SP_XHS_CLIENT_ID` / `SP_XHS_CLIENT_SECRET`，走 OAuth2 授权码流程（详见 `.env.example` 内注释），账号切 `auth_mode=real` 后 `[post]` 即真发公开笔记；不配则走 mock 回执。
- **运行时数据**：后端首次启动在仓库根生成 `.shadowflow/`（会话、技能、SQLite 等，已 gitignore）。

## 分步启动（不用 dev.mjs 时）

```bash
# 1) Python FastAPI（仓库根目录，端口 8000）
python -m uvicorn shadowflow.server:app --app-dir backend/python --host 127.0.0.1 --port 8000

# 2) Node 网关（端口 8002，tsx watch 热重载）
cd backend/node && npm run dev

# 3) 前端（端口 8443，/api、/projects 已代理到 :8002）
cd frontend && npm run dev
```

## 局域网 / 公网访问

前端已配置 `host: 0.0.0.0` + `allowedHosts: true`（放行所有域名），同一局域网内直接访问 `http://<本机IP>:8443` 即可；配合 cloudflared 等隧道映射 :8443 也能直接对外（`scripts/tunnel-watchdog.mjs` 提供隧道守护）。注意：密钥管理类接口仅限本机访问，经公网访问会返回 403（预期安全行为）。

## 常见问题

| 现象 | 处理 |
|---|---|
| `端口 8000/8002/8443 已被占用` | dev.mjs 会拒绝启动，先停掉旧的 uvicorn / tsx / vite 进程再跑 |
| `better-sqlite3` / `node-gyp` 编译失败 | Windows 装 VS Build Tools（C++ 桌面开发）后 `cd backend/node && npm rebuild better-sqlite3`；macOS `xcode-select --install`；Linux `sudo apt install build-essential python3` |
| `ModuleNotFoundError: No module named 'shadowflow'` / `uvicorn: command not found` | ③ 没装或 venv 没激活，激活 `.venv` 后重跑 `pip install -e "./backend/python[server,memory]"` |
| vite 起不来 / `Unsupported engine` | Node 版本过低，升到 22 LTS |
| 页面能开但接口 404 | Node 网关(:8002) 没起来；Vite 只代理 `/api`、`/projects` |
| npm / pip install 卡死超时 | 设国内镜像后重试（见「安装依赖」注） |

更详细的从零安装与报错速查见 [INSTALL.md](INSTALL.md)。

## 目录结构

```
frontend/        前端 — Vite + React 19 + Tailwind 4（宣传页 / 董事长工作台 #/app / BYOK 设置）
backend/node/    Node 网关 — Express API 聚合（:8002）
backend/python/  Python FastAPI — shadowflow 编排核心（:8000）
templates/       工作流种子模板（*.yaml）
config/          运行配置
scripts/         演示回放 / 隧道守护等运维脚本
docs/            演示流程拆解等文档
dev.mjs          一键启动器（Python + 网关 + 前端）
```

## 依赖清单

**frontend/**：`react 19`、`react-dom 19`、`lucide-react`；开发 `vite 8`、`tailwindcss 4`、`typescript 5.7` 等。

**backend/node/**：`express`、`better-sqlite3`（原生模块）、`http-proxy-middleware`、`js-yaml`、`archiver`、`ethers`、`puppeteer-core`、`@anthropic-ai/sdk`、`openai`、`@google/generative-ai` 等；开发 `tsx`、`vitest` 等。

**backend/python/**（包名 `shadowflow`）：核心 `pydantic 2`、`pyyaml`、`httpx`；`[server]` extras = `fastapi`、`uvicorn`、`APScheduler`、`slowapi`；`[memory]` = `aiosqlite`、`redis`；另有 `[mcp]`、`[lightrag]`、`[dev]` 等可选 extras。

## License

MIT
