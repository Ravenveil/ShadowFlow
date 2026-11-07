# ShadowFlow 开发文档（CONTRIBUTING）

欢迎参与 ShadowFlow 开发！本文档面向协作者，是上手与日常开发的唯一入口：架构、目录结构、环境搭建、常见任务配方、测试、CI 与 PR 流程。

> 用户视角的介绍（功能演示、Docker 快速上手）见 [README.md](README.md) / [README.zh.md](README.zh.md)。
> 各层目录还有 `AGENTS.md`（给编码代理的局部约定，如 `server/src/routes/AGENTS.md`）——改哪层代码，先读哪层的 AGENTS.md。

## 项目概览

ShadowFlow 是一个 **contract-first（契约优先）的多智能体工作流平台**：AI agent 团队在人类可审阅的策略规则下协作，支持拒绝回路（rejection loops）、检查点回滚，以及对接任意 agent 运行时（Claude Code / Codex / MCP / ACP）的插件化契约。

## 架构总览

三个服务协同工作：

| 服务 | 位置 | 技术栈 | 端口 | 职责 |
|---|---|---|---|---|
| Web UI | `src/` | React 18 + Vite + Zustand + ReactFlow | 3007 | 工作流编辑器、Neo 界面体系 |
| Node 网关 | `server/` | Node + tsx + Express + better-sqlite3 | 8002 | RunSession API、技能编译、群聊 DAG、反向代理 |
| Python API | `shadowflow/` | FastAPI + Uvicorn | 8000 | 编排内核、记忆、契约校验、领域服务 |

请求链路：**Vite (3007) → 代理 `/api/*` 到 Node (8002) → 未匹配路由反向代理到 Python (8000)**。

配套组件：

- `src-tauri/` — 可选桌面端（Tauri + Rust）
- `examples/backend-poc/` — OPC OS 原型后端（早期独立验证项目，`shadowflow/services/opc_*` 的移植来源，与主链路无关，保留作参照）
- `examples/ui-kits/` — 设计稿 HTML

## 目录结构

```
ShadowFlow/
├── src/                  # 前端（React 18 + Vite，端口 3007）
│   ├── neo/              #   Neo 界面体系（NeoApp/NeoRail/NeoHost/NeoChat/Timeline + projections/）
│   ├── core/  pages/     #   核心组件与设置 / 页面（Dashboard/Knowledge/Memory/Schedules/Settings…）
│   ├── components/       #   通用组件（composer/、knowledge/、run-session/…）
│   ├── api/  store/  lib/  config/  common/  #  API 客户端 / Zustand store / 工具库 / 配置
│   └── AppRoutes.tsx     #   路由表
├── server/               # Node 网关（Express + better-sqlite3，端口 8002）
│   ├── src/routes/       #   REST 路由，每文件一个 prefix（清单见 src/routes/AGENTS.md）
│   ├── src/lib/          #   业务内核（chat-dag 群聊 DAG、skill-compiler、tool-runner、team-yaml…）
│   ├── src/storage/  src/exporters/  src/prompts/  src/workflow/  src/transport/ …  # 存储/导出/提示词/工作流/传输
│   ├── src/index.ts      #   入口：路由挂载 + /api 兜底反代 Python
│   └── Dockerfile        #   网关镜像（context 即 server/）
├── shadowflow/           # Python 包（FastAPI，端口 8000）
│   ├── server.py  api/   #   REST API（api/ 按域拆模块：agents/teams/groups/chat/memory/runs/schedules/opc…）
│   ├── core/  assembly/  #   工作流图抽象（graph/node/topology）/ 编译激活（compile/activation/learner）
│   ├── memory/           #   记忆体系（memory_bank、global_memory、session/user、layers、retrieval_profiles）
│   ├── contracts/  runtime/  protocol/  llm/  services/  #  契约 / 运行时 / 协议 / 模型 / 领域服务
│   └── mcp_server.py  mcp_servers/  #   MCP 支持
├── docker/               # Dockerfile.api / Dockerfile.web / docker-compose.yml（compose 与 CI 共用）
├── templates/            # 工作流模板（*.yaml）+ agent-packs（yaml manifest）
├── examples/             # 运行时契约示例（yaml/ts）+ backend-poc/（OPC OS 原型）+ ui-kits/（设计稿 HTML）
├── tests/                # Python 测试（pytest）
├── scripts/              # dev.mjs 统一启动器、i18n、demo/、data/training（训练脚本与数据）
├── config/               # 示例/默认配置（app.json、network.json、rules/）
├── src-tauri/            # 可选桌面端（Tauri + Rust）
├── .github/workflows/    # CI（ci.yml）
└── pyproject.toml        # Python 包定义（可选依赖组见下）
```

**有意不入库的目录**（克隆后没有是正常的，别重建）：`docs/`（内部设计文档）、`design-refs/`（界面参考截图）、`server/skills/BMAD-METHOD/`（第三方方法论，按需由 skill ingest 拉取）、`_local/`（本地收纳 hub——研究资料、PM 产物、设计证据、临时杂物统一放这里，`.gitignore` 已声明）、`demo-runtime/`、`_data/` 等本地运行目录。完整清单见 `.gitignore`。

## 快速开始

### 方式一：Docker（无需装环境）

```bash
git clone https://github.com/Ravenveil/ShadowFlow.git && cd ShadowFlow
cp .env.example .env          # 可选：填 API key；留空则用界面内 BYOK 输入
docker compose -f docker/docker-compose.yml up -d   # web :3000 / node :8002 / api :8000
```

镜像构建文件在 `docker/Dockerfile.api` 与 `docker/Dockerfile.web`（网关用自己的 `server/Dockerfile`）。**移动这三个文件时必须同步修改 `docker/docker-compose.yml`（build.dockerfile 两处）和 `.github/workflows/ci.yml`（两处）**，CI 会实际构建验证。

### 方式二：本地开发（改代码用这个）

```bash
# 1. JS 依赖（根 + server 两处）
npm install
cd server && npm install && cd ..

# 2. Python 后端（要完整功能才需要；Python >= 3.10）
python -m venv .venv
# Windows:
.venv\Scripts\pip install -e ".[dev]"
# macOS/Linux:
.venv/bin/pip install -e ".[dev]"
# 可选依赖组：.[server] .[memory] .[mcp] .[lightrag] .[all]

# 3. 一键启动全部三个服务
npm run dev                   # 自动就绪探测 + 打开 http://localhost:3007
npm run dev -- --no-python    # 只起网关 + 前端
```

启动器（`scripts/dev.mjs`）负责：拉起 Python(:8000) + Node(:8002) + Vite(:3007)，三个全部 HTTP 可达才开浏览器；Ctrl+C 或任一进程退出会停掉整棵进程树；端口被占用时启动前直接报错。Python 解释器探测顺序：`SF_PYTHON` 环境变量 > 根目录 `.venv` > 系统 `python`。

也可单独启动：`npm run dev:python` / `dev:server` / `dev:web`。

**API Key 约定（BYOK）**：key 粘贴在网页界面里，存浏览器 localStorage；`.env` 只作服务端兜底。**永远不要提交真实 key**（历史上泄露过一次，key 已作废，勿重蹈覆辙）。

## 三栈模块地图

改代码前先定位到正确的层，不要跨界搬运逻辑。

**前端 `src/`**：`neo/` 是主界面体系（`NeoApp` 总编排、`NeoRail` 左栏、`NeoHost` 宿主面板、`NeoChat`/`NeoGroupChat` 会话、`NeoTimeline` 过程流，`projections/` 把后端事件投影成展示模型，`secretary.ts` 内置秘书人格）；`pages/` 是路由级页面；`components/` 按域分子目录（composer/、knowledge/、run-session/…）；`api/` 是 fetch 客户端，`store/` 是 Zustand。

**Node 网关 `server/src/`**：`routes/` 只做 HTTP shape 转换；`lib/` 是业务内核——`chat-dag/`（群聊 DAG 与 @ 提及路由）、`skill-compiler/`（技能编译）、`tool-runner.ts`（工具执行）、`run-event-bus/store`（运行事件）、`team-yaml.ts`/`team-source.ts`（编队来源）、`worktree-manager.ts` 等；`storage/` 落 SQLite；`index.ts` 里路由必须挂在 `proxyFallback` 之前（未匹配的 `/api/*` 兜底转发 Python）。

**Python 包 `shadowflow/`**：`api/` 按域拆 REST 模块；`core/` 是工作流图抽象（graph/node/topology/registry）；`assembly/` 负责编译与激活（compile/activation/learner）；`memory/` 是记忆体系（memory_bank 多模态记忆库、global_memory、session/user、layers、retrieval_profiles）；`contracts/` 契约校验；`services/` 领域服务（opc_*、scheduler、secretary_seed）；`mcp_server.py` + `mcp_servers/` 对接 MCP。

## 常见任务配方

### 新增一个 REST 路由（Node 网关）

1. 在 `server/src/routes/<name>.ts` 写一个 Router，`export default router`
2. `server/src/index.ts` 加 `import` + `app.use('/api/<name>', xRouter)`，**必须挂在 `proxyFallback` 之前**
3. 路由文件只做 HTTP shape 转换（req.body → service args → res.json）；复杂业务放 `src/lib/` 或 `src/storage/`；不要在 routes 里直接读 yaml / 调 LLM SDK
4. SSE 流用 `res.write('data: ...\n\n')` 模式（参考 `run-sessions.ts`）

详见 `server/src/routes/AGENTS.md`。

### 新增一个 Neo 导航页（前端）

四步接线，不引新依赖（图表用 SVG 自绘）：

1. `src/neo/types.ts`：`NeoNav` union 加变体
2. `src/neo/NeoRail.tsx`：加导航行
3. `src/neo/NeoApp.tsx`：`SECTION_BY_NAV` / `pageView` / 中栏渲染三处接线
4. `src/AppRoutes.tsx`：加 Route

### 新增 UI 文案

文案走 `react-i18next`（en + zh 双语）：`npm run i18n:extract` 抽取、`npm run i18n:status` 查缺。改 UI 必须同步改对应 vitest 用例。

### 新增跨栈功能（记忆 / 看板类）

参考「经验记忆」既有链路：落库（SQLite 表）→ Node 路由暴露 `/api/...` → 前端 `src/api/` 加客户端 → Neo/页面加入口。行为开关放 `settings` 表（如 `memory.autoLearn`），成本类数据另附单价配置（如 `llm.priceTable`）。

## 测试

```bash
# 前端（web project）
npx vitest run src/               # 或 npm run test:run
npx tsc --noEmit -p tsconfig.json

# Node 网关（server project）——必须在仓库根目录跑！
npx vitest run --project=server
# ⚠️ 勿 cd server && npx vitest run：会误入 web project 且 REPO_ROOT 解析错

# Python
pytest tests/
ruff check shadowflow/ && mypy shadowflow/   # mypy 为 advisory
```

已知注意事项：

- `src/pages/KnowledgePage.test.tsx` 的「图谱切换」用例是**存量 flaky**：全量跑偶尔超时挂掉，隔离跑稳定通过。CI 上遇到它挂了，先隔离复跑再排查。
- server 存量失败（干净树可复现，勿误归因到自己的改动）：`prompt-assembly.test.ts` 等少量用例。
- 测试里 `vi.mock` 拦不到模块内部的动态 `import()`——把 IO 逻辑拆成纯函数直测 + 薄壳不测。

## CI 说明

`.github/workflows/ci.yml` 在每次 push / PR 上跑 7 个 job：

| Job | 内容 |
|---|---|
| lint (eslint) | 前端 ESLint，零警告策略 |
| typecheck (server) | server 的 tsc --noEmit |
| test (backend) | vitest (backend/node src/__tests__) |
| test (frontend) | vitest web project |
| e2e (frontend smoke) | Playwright 冒烟 |
| build-docker | 构建验证 docker/ 下两个镜像（不推送） |
| secret-scan | 密钥扫描 |

## 分支与 PR 流程

**main 分支有保护规则：必须走 PR，且需要 1 个 approving review + code owner（@Ravenveil）批准**（`.github/CODEOWNERS` 全量声明）。协作者之间互批不算数，直推 main 会被拒——这是刻意设计，请走 PR。

1. 从 `main` 拉分支，命名：`feat/...`、`fix/...`、`perf/...`
2. 提交信息用 [Conventional Commits](https://www.conventionalcommits.org/)：
   ```
   feat(gateway): add run-session streaming endpoint
   fix(ui): prevent canvas double-zoom on trackpad
   ```
3. CI 全绿 + owner approve 后合入（squash 为主）
4. 行为变更时同步更新 README / CHANGELOG

本地已合入的分支请及时删（远端同样）；判断一个 squash 合入的分支是否可删：`git cherry origin/main origin/<branch>` 无 `+` 行即等价。

## 代码风格

- TypeScript strict 模式；`npm run format`（prettier）；UI 文案走 `react-i18next`（en + zh 双语）
- Python：ruff 格式化，鼓励类型标注
- `scripts/*.mjs` 锁了 `eol=lf`（.gitattributes）：Windows 上 CRLF checkout 会让 vite 动态 import 含中文模板串的 .mjs 报 `Invalid or unexpected token`——遇到先查行尾

## 领域速查（改前先看）

- **Neo 前端接线**：见上文「新增一个 Neo 导航页」四步。
- **群聊 DAG**：`backend/node/src/lib/chat-dag/mentions.ts`（@ 提及 = 定向派活，跳过 LLM 意图拆解；中文标点算 token 终结符）。
- **hop 交接卡片**：`hopStore` 包装 SQLite 真源，播报 best-effort，绝不阻塞落库主链路。
- **审批边**：EdgeKind `'approve'` 是执行语义，别在读路径把它折叠成 sequential。
- **记忆三区并存**：memory_lessons（自动沉淀）+ memory_handoffs（交接写回）+ River Memory（手动）；设置页四分区入口。
- **协议标签正则**：匹配 `sf:` 协议时一律用 `<sf[:-]name>` 双分隔符——模型冒号常写成连字符。
- **Python 反代兜底**：`/api/*` 未被 Node 路由匹配才落到 Python；新增 Node 路由务必挂在 `proxyFallback` 之前，否则永远收不到流量。

## 安全

- 不提交 API key、token、`.env`；`.env.example` 只放占位符
- 漏洞请走 [GitHub Security Advisories](https://github.com/Ravenveil/ShadowFlow/security/advisories) 私密报告，勿开公开 issue

## License

贡献即同意以 [MIT License](LICENSE) 授权。
