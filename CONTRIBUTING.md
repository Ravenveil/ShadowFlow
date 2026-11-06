# ShadowFlow 开发文档（CONTRIBUTING）

欢迎参与 ShadowFlow 开发！本文档面向协作者，覆盖架构、目录结构、本地开发、测试、CI 与 PR 流程。

> 用户视角的介绍（功能演示、Docker 快速上手）见 [README.md](README.md) / [README.zh.md](README.zh.md)。

## 项目概览

ShadowFlow 是一个 **contract-first（契约优先）的多智能体工作流平台**：AI agent 团队在人类可审阅的策略规则下协作，支持拒绝回路（rejection loops）、检查点回滚，以及对接任意 agent 运行时（Claude Code / Codex / MCP / ACP）的插件化契约。

## 架构总览

三个服务协同工作：

| 服务 | 位置 | 技术栈 | 端口 | 职责 |
|---|---|---|---|---|
| Web UI | `src/` | React 18 + Vite + Zustand + ReactFlow | 3007 | 工作流编辑器、Neo 界面体系 |
| Node 网关 | `server/` | Node + tsx + Express + better-sqlite3 | 8002 | RunSession API、技能编译、群聊 DAG、反向代理 |
| Python API | `shadowflow/` | FastAPI + Uvicorn | 8000 | 编排内核、planner、记忆、契约校验 |

请求链路：**Vite (3007) → 代理 `/api/*` 到 Node (8002) → 未匹配路由反向代理到 Python (8000)**。

另有可选桌面端 `src-tauri/`（Tauri + Rust），以及一个独立的早期验证项目 `backend-poc/`（与主链路无关）。

## 目录结构

```
ShadowFlow/
├── src/                  # 前端（React 18 + Vite，端口 3007）
│   ├── neo/              #   Neo 界面体系（主界面：NeoApp/NeoRail/NeoHost/Timeline）
│   ├── core/             #   核心组件与设置
│   ├── pages/            #   页面（知识库等）
│   ├── components/       #   通用组件（knowledge/ 等）
│   ├── api/  store/  lib/#   API 客户端 / Zustand store / 工具库
│   └── AppRoutes.tsx     #   路由表
├── server/               # Node 网关（Express + better-sqlite3，端口 8002）
│   ├── src/routes/       #   REST API（agents/teams/groups/runs/memory/dashboard…）
│   ├── src/lib/          #   chat-dag（群聊 DAG/提及路由）、skill-compiler、hopStore 等
│   ├── src/exporters/    #   导出器
│   ├── src/index.ts      #   入口：挂载各路由 + Python 反向代理
│   └── Dockerfile        #   网关镜像（context 即 server/）
├── shadowflow/           # Python 包（FastAPI，端口 8000）
│   ├── server.py         #   REST API
│   ├── planner/ runtime/ #   编排与运行时
│   ├── memory/           #   经验记忆/交接/画像
│   ├── contracts/        #   契约定义与校验
│   └── mcp_server.py     #   MCP 支持
├── docker/               # Dockerfile.api / Dockerfile.web / docker-compose.yml（compose 与 CI 共用）
├── templates/            # 工作流模板 + agent-packs（yaml manifest）
├── examples/             # 高层 API 与运行时契约示例（yaml/ts）+ backend-poc（OPC OS 原型）+ ui-kits（设计稿 HTML）
├── tests/                # Python 测试（pytest）
├── scripts/              # dev.mjs 统一启动器、i18n 翻译等脚本（scripts/data/ 训练数据）
├── config/               # 示例/默认配置（yaml/json）
├── .github/workflows/    # CI（ci.yml）
└── pyproject.toml        # Python 包定义（可选依赖组见下）
```

**有意不入库的目录**（克隆后没有是正常的，别重建）：`docs/`（内部文档）、`design-refs/`（界面参考截图）、`server/skills/BMAD-METHOD/`（第三方方法论，按需由 skill ingest 拉取）、`_evidence/`、`_bmad*/`、`demo-runtime/` 等本地工作目录。完整清单见 `.gitignore`。

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
- 改 UI 时同步改对应 vitest 用例；回归基线：`npx vitest run src/neo` + `npx tsc --noEmit`。

## CI 说明

`.github/workflows/ci.yml` 在每次 push / PR 上跑 7 个 job：

| Job | 内容 |
|---|---|
| lint (eslint) | 前端 ESLint，零警告策略 |
| typecheck (server) | server 的 tsc --noEmit |
| test (backend) | vitest server project |
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

- TypeScript strict 模式；`npm run format`（prettier）；UI 文案走 `react-i18next`（en + zh 双语，`npm run i18n:extract` / `i18n:status`）
- Python：ruff 格式化，鼓励类型标注
- `scripts/*.mjs` 锁了 `eol=lf`（.gitattributes）：Windows 上 CRLF checkout 会让 vite 动态 import 含中文模板串的 .mjs 报 `Invalid or unexpected token`——遇到先查行尾

## 领域速查（改前先看）

- **Neo 前端接线模式**：新增导航页 = `src/neo/types.ts` 的 `NeoNav` union 加变体 → `NeoRail.tsx` 加导航行 → `NeoApp.tsx` 的 `SECTION_BY_NAV` / `pageView` / 中栏渲染三处 → `AppRoutes.tsx` 加 Route。不引新依赖，图表用 SVG 自绘。
- **群聊 DAG**：`server/src/lib/chat-dag/mentions.ts`（@ 提及 = 定向派活，跳过 LLM 意图拆解；中文标点算 token 终结符）。
- **hop 交接卡片**：`hopStore` 包装 SQLite 真源，播报 best-effort，绝不阻塞落库主链路。
- **审批边**：EdgeKind `'approve'` 是执行语义，别在读路径把它折叠成 sequential。
- **记忆三区并存**：memory_lessons（自动沉淀）+ memory_handoffs（交接写回）+ River Memory（手动）；设置页四分区入口。
- **协议标签正则**：匹配 `sf:` 协议时一律用 `<sf[:-]name>` 双分隔符——模型冒号常写成连字符。
- **测试里的动态 import**：`vi.mock` 拦不到模块内部 `import()`——把 IO 逻辑拆成纯函数直测 + 薄壳不测。

## 安全

- 不提交 API key、token、`.env`；`.env.example` 只放占位符
- 漏洞请走 [GitHub Security Advisories](https://github.com/Ravenveil/ShadowFlow/security/advisories) 私密报告，勿开公开 issue

## License

贡献即同意以 [MIT License](LICENSE) 授权。
