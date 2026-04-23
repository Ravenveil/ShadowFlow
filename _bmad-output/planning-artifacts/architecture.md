---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: complete
completedAt: '2026-04-15'
inputDocuments:
  prd:
    - _bmad-output/planning-artifacts/prd.md
  brief:
    - _bmad-output/planning-artifacts/shadowflow-product-brief.md
  related_planning:
    - _bmad-output/planning-artifacts/shadowflow-integration-roadmap.md
  project_docs:
    - docs/CORE_CHARTER.md
    - docs/ARCHITECTURE.md
    - docs/RUNTIME_CONTRACT_SPEC.md
    - docs/WORKFLOW_SCHEMA.md
    - docs/CHECKPOINT_STORE_CONTRACT.md
    - docs/WRITEBACK_ADAPTER_CONTRACT.md
    - docs/SHADOW_AGENTGRAPH_RESPONSIBILITY_MATRIX.md
    - docs/ADAPTER_BOUNDARY.md
  research_and_design:
    - docs/plans/cli-api-execution/shadowflow-engine-scope-v1.md
    - docs/plans/cli-api-execution/shadowflow-engine-task-list-v1.md
    - docs/plans/cli-api-execution/shadowflow-workflow-assembly-contract-v1.md
    - docs/plans/cli-api-execution/shadowflow-shadow-cli-shadow-ui-boundary-v1.md
    - docs/plans/cli-api-execution/shadowflow-graph-projection-contract-v1.md
    - docs/plans/cli-api-execution/shadowflow-language-strategy-v1.md
    - docs/plans/academic-foundation-and-roadmap-v1.md
    - docs/plans/spontaneous-assembly/summary.md
workflowType: 'architecture'
project_name: 'ShadowFlow'
user_name: 'Jy'
date: '2026-04-15'
prd_baseline: 'v0.1 (2026-04-15)'
code_baseline: 'shadowflow v0.3.0 (Alpha) — ~19.7K Python + ~35.7K React/TS'
hackathon_deadline: '2026-05-16'
---

# ShadowFlow Architecture Decision Document

_本文档通过 bmad-create-architecture 工作流一次性构建完成。所有决策基于实际代码基线 `shadowflow v0.3.0`(Alpha)+ PRD v0.1 + 16 份 research/planning/project docs 综合推导。_

**作者**: Jy
**起草日期**: 2026-04-15
**项目**: ShadowFlow(0G Hackathon MVP + Phase 2/3 演进)
**代码基线**: pyproject.toml v0.3.0 · 19,705 行 Python + 35,728 行 React/TS · 7 个核心 runtime 对象契约已冻结
**PRD 基线**: v0.1(2026-04-15)

> ⚠️ **重要差异说明**:探索代码后发现实际规模远超 PRD 声称(PRD "~6000 行 runtime" vs 实际 ~19.7K Python),**本架构把 ShadowFlow 按"已有 Alpha 产品做架构加固 + MVP 功能层新增"处理,而非从零搭建**。任何与 PRD 预设矛盾之处,以本文档为准。

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements**(来自 PRD 41 条 FR,归为 8 个类别):

| 类别 | FR 条数 | 架构含义 |
|------|---------|---------|
| **模板设计**(FR1-FR7)| 7 | 需 YAML schema + 可视化编辑器 + Runtime 可消费模板定义;`WorkflowAssemblySpec → compile → WorkflowDefinition` 主链已在 `shadowflow/highlevel.py`(2886 行)部分实现 |
| **权限矩阵**(FR8-FR12)| 5 | 当前 runtime 契约(7 对象)**未包含 Policy Matrix**,是 MVP 必须新增的运行时一等公民;驳回穿透需要 checkpoint rollback 能力 |
| **运行执行**(FR13-FR18)| 6 | Runtime `service.py`(2991 行)已有 parallel / barrier / retry 积木;**approval_gate 是 MVP 新增项**;provider fallback 链需要在 LLM Provider Adapter 层增强 |
| **实时观察**(FR19-FR22)| 4 | 需要事件总线 + SSE/WebSocket 通道;看板是 MVP 新增前端工作 |
| **持久化与恢复**(FR23-FR26)| 4 | `CheckpointStore` 已有 3 种后端(Memory / File / ZeroG);**基本齐全,只需对接 MVP** |
| **0G 生态集成**(FR27-FR31)| 5 | `ZeroGCheckpointStore` 已存在;0G Storage 上传 / Compute 推理 / Merkle 验证是 MVP 新增功能;INFT(FR31)明确 Phase 3+ |
| **模板分享与交易**(FR32-FR35)| 4 | CID 克隆闭环 = MVP 新增;Phase 3 multi-mode marketplace 是路线图项 |
| **Agent 交互 / Demo**(FR36-FR41)| 6 | gap detection + 反向提问需要 memory_event 扩展;Demo 路演材料是非代码产物 |

**Non-Functional Requirements**(按 5 维度):

- **Performance(P1-P6)**:编辑器 ≤ 2s / DAG ≤ 1s / 首 token ≤ 3s(冷)/ 看板事件延迟 ≤ 500ms / 3 并行无竞争 / 0G 单次 IO ≤ 10s → **现有 async 执行模型可达,看板 500ms 约束决定了 SSE 优先**
- **Security(S1-S6)**:API keys 仅客户端 / trajectory sanitize / Merkle 验证 / fallback no-training / tool sandbox / INFT 加密元数据 → **MVP 最重要的是 S1 + S2,决定了"后端不持有密钥"的前后端分工**
- **Scalability(SC1-SC3)**:≤ 50 并发 / runtime 无状态 / Phase 2+ Rust 下沉 → **MVP 不做水平扩展,但架构要保留无状态属性**
- **Accessibility(A1-A2)**:WCAG 2.1 AA basic(键盘 + 语义 HTML + 对比度) → **对前端技术选型影响小,由 Tailwind 自动覆盖大部分**
- **Integration(I1-I5)**:4 LLM + 0G SDK 版本锁 + 0G Compute 95% 成功率 + Sidecar 契约 + 20+ Shadow Tauri 命令 → **决定了 MVP 必须有"可插拔 Provider Adapter"和"宿主无关契约"两条红线**
- **Reliability(R1-R3)**:resume 无丢失 / 全 provider 失败 pause / compile 非阻塞警告 → **Checkpoint 是 MVP 底座,已经有 3 种 store,难度在 UX**

**Scale & Complexity**:

- **Primary domain**: AI agent orchestration(Python runtime)+ Web app(React SPA 前端)
- **Complexity level**: **High**(多 agent 编排 + 权限治理 + 链上集成 + brownfield + 硬截止 + phase-layered)
- **Estimated architectural components**: **7 层 × ~25 组件**(Application / Gateway / Orchestration / Execution / LLM / Storage / Integration;见 Step 6 结构树)

### Technical Constraints & Dependencies

**不可改动的硬约束**(来自代码 + 0G skills + CLAUDE.md):

- `pydantic>=2.0.0` · `pyyaml>=6.0.0` · `httpx>=0.26.0`(已锁定核心三件套)
- `fastapi>=0.109.0` · `uvicorn>=0.27.0`(server 可选)
- `ethers v6` + `evmVersion: "cancun"`(0G Chain 合约硬约束)
- `@0glabs/0g-ts-sdk`(前端 TS,版本在 MVP 前锁定到 `package.json`)
- `processResponse(providerAddress, chatID, usageData)` 必调契约(0G Compute 推理)
- ZgFile 必须在 `finally` 中关闭(0G Storage 规则)
- 私钥永不硬编码,永不上链,永不写 trajectory metadata

**下游依赖的稳定性契约**:

- Runtime 7 对象 schema **字段级冻结**(PRD Technical Success 第 1 条) —— 任何破坏性改动必须走 major version bump
- CLI 和 HTTP API **同构消费同一份 WorkflowDefinition** —— 不能出现"CLI 能跑但 API 不能跑"的分叉
- Checkpoint store 三选一(Memory / File / ZeroG)**通过同一个抽象接口** —— 不能在 service.py 中条件分支

### Cross-Cutting Concerns Identified

1. **消息流与可观测性** —— 横跨 runtime / gateway / 前端看板,MVP 必须统一事件格式
2. **密钥与凭证生命周期** —— 横跨前端 localStorage / LLM Provider / 0G Storage 密钥,S1 规定**后端绝不持有**
3. **错误传播与降级** —— LLM 超时 → fallback / 0G API 失败 → mock / compile 失败 → 非阻塞警告,三种降级路径需要统一模式
4. **序列化与 Schema 版本** —— Workflow YAML / Runtime 7 对象 / 前端 Store 三处 schema 必须一一映射(Pydantic → TypeScript 类型自动生成)
5. **Phase 边界与宿主切换** —— Phase 1 独立 Web 壳 → Phase 2 Shadow Sidecar → Phase 3 INFT,**引擎代码不能耦合宿主**
6. **0G 规则合规** —— 每个触碰 0G 的模块都要遵循 `.0g-skills/CLAUDE.md` 的 ALWAYS/NEVER 列表
7. **驳回事件的运行时语义** —— `policy_matrix.reject` → `approval_gate` 触发 → `checkpoint resume` 回退,必须 end-to-end 一致

---

## Starter Template Evaluation

### Primary Technology Domain

**已识别为 brownfield full-stack**:后端 Python 3.9+ async 服务(已有 `shadowflow` 包 v0.3.0)+ 前端 React 18 SPA(已有 `src/` 目录,ReactFlow 11 + Vite 5)。

**Starter 决策 = 不引入新 starter,锁定现有工程结构**。

### Starter Options Considered

| 选项 | 适配度 | 结论 |
|------|-------|------|
| 引入 **T3 stack**(Next.js + tRPC + Prisma) | 低 | 与现有 Python runtime 无关,且 Python server 不适合被 Next.js 替换 |
| 引入 **FastAPI 官方 cookiecutter** | 低 | 现有 `shadowflow/server.py` v0.3.0 已接入 RuntimeService,换框架会作废既有代码 |
| 引入 **Vite + React + TS 官方模板** | **已采用** | 已在 `src/` 目录生效,只需对齐工程规范 |
| 引入 **Turborepo monorepo** | 中 | Phase 2 集成 Shadow 桌面时再考虑;MVP 不做 |
| **保持现状 + 补齐工程规范** | ✅ **选定** | 最小化风险,聚焦交付 |

### Selected Foundation: **既有工程锁定 + 规范补齐**

**Rationale**:

- 代码基线 v0.3.0 已 19.7K Python + 35.7K React,**引入任何 starter 都是破坏性动作**,黑客松 4 周预算承受不起
- Python runtime 7 对象契约 + Pydantic 验证 + 3 种 checkpoint store **已经覆盖架构骨架**
- React 前端已是业界主流栈(React 18 + ReactFlow 11 + Vite 5 + Tailwind + Zustand),不存在技术债
- 真正缺的是:**标准化工程目录边界、前后端 schema 自动同步、Compose 一键启动、文档规范**

**"等效 Starter 命令"**(记录给未来新开发者):

```bash
# Python 后端(等效操作,不要真跑)
pip install -e .[all,dev]  # 安装 shadowflow 本地包 + 所有可选依赖
# 前端
cd src/../  # 回到前端 workspace root(监测 package.json 位置)
npm install                # 已有 package.json,直接安装
npm run dev                # Vite dev server
```

### Foundation-Provided Architectural Decisions

**Language & Runtime**:
- Python 3.9-3.12(已在 pyproject.toml classifier 中声明,向下兼容 3.9)
- TypeScript 5.2 + Node.js 20 LTS(前端)

**Styling Solution**:
- **Tailwind CSS**(已在前端声明)+ 原子化类名优先,不引入 CSS Modules / styled-components

**Build Tooling**:
- **Vite 5**(前端)—— 原生 ESM + 快速 HMR
- `setuptools>=61` + `pyproject.toml`(后端)—— 标准 PEP 621

**Testing Framework**:
- **pytest**(后端,已声明 `asyncio`/`legacy` markers)
- **Vitest**(前端)—— 与 Vite 原生对齐

**Code Organization**:
- 后端:`shadowflow/` 包,按 **功能领域** 分子包(`runtime` / `llm` / `assembly` / `memory` / `planner` / `protocol` / `core`)
- 前端:`src/` 下按 **功能层** 分目录(`core` / `common` / `adapter` / `api`)

**Development Experience**:
- Black(line-length 100)+ Ruff(E/F/I/N/W)+ MyPy(已声明)
- 前端:ESLint + Prettier(推断来自标准 Vite 模板,需在 MVP 前 codify)

**首个实现 Story(隐式)**:**不是"初始化项目",而是"补齐 `docker-compose.yml` 一键启动"**,因为这是评委 copy-paste 复现 MVP 的入口(PRD FR41 + Measurable Outcomes "100% 独立跑通")。

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions(阻塞实现,必须本周内定案)**:

1. Policy Matrix 运行时语义(运行中引入 approval_gate / 驳回穿透 / rollback)
2. 前端看板实时通道(SSE vs WebSocket)
3. Workflow Assembly 主链范围(哪些模板走 assembly,哪些硬编码)
4. 0G Storage 归档 payload 格式(trajectory schema + sanitize 白名单)
5. API 签约(CLI 与 HTTP 同构)

**Important Decisions(显著塑造架构)**:

6. 前后端状态协议(是前端持有完整 run state,还是后端主推送)
7. 错误降级契约(provider fallback / 0G failover / compile 警告)
8. Demo "Import by CID" 的前端对接方式(是否经过后端代理)
9. Phase 2 Sidecar 边界(哪些代码走 Rust shadowflow_client,哪些走 Python HTTP)

**Deferred Decisions(Post-MVP)**:

10. INFT 合约与 marketplace 前端(Phase 3,独立 milestone)
11. Rust 消息总线下沉(Phase 5+,性能触发)
12. 多租户与账户体系(Phase 4+)

---

### Data Architecture

**Database**: **无专用数据库**(MVP 决策)

- **Rationale**:全部状态通过 `CheckpointStore` 抽象处理,三种后端开箱即用:
  - `InMemoryCheckpointStore` —— 单进程 demo
  - `FileCheckpointStore` —— 本地持久化(默认 `.shadowflow/checkpoints/`)
  - `ZeroGCheckpointStore` —— HTTP 桥 `http://localhost:3001/kv/{key}`(0G KV)
- Redis / SQLite 作为 `[memory]` optional extras 存在,但 MVP **不使用**(避免引入第 4 种状态面)
- Phase 2+ 如需全文检索 trajectory → 引入 SQLite FTS5 或 Meilisearch(非 MVP)

**Data Modeling**:

- Pydantic v2 BaseModel(`shadowflow/runtime/contracts.py`)—— Single Source of Truth
- **7 个核心对象 schema 冻结**:`WorkflowDefinition` / `NodeDefinition` / `EdgeDefinition` / `RuntimeRequest` / `RunRecord` / `StepRecord` / `CheckpointRef` / `ArtifactRef` / `RunResult`
- 前端 TypeScript 类型 **自动从 Pydantic 生成**(工具:`datamodel-code-generator` 或 `openapi-ts`)

**Data Validation**: Pydantic `model_validator(mode="after")` —— 已在 `contracts.py` 实现图验证(parallel/barrier 强约束、entrypoint 存在、delegated workflow 递归验证)

**Migration Approach**:
- **No migrations**(无关系数据库)
- Workflow YAML 破坏性变更通过 `version` 字段 + `compatibility matrix`(`workflow.version` → `shadowflow.version`)
- Checkpoint schema 变更需要 `CheckpointStore.migrate_checkpoint()` 钩子(Phase 2 才做)

**Caching Strategy**:
- MVP 无缓存层
- Phase 2 可考虑 LLM response cache(按 prompt hash)走 Redis

---

### Authentication & Security

**Authentication Method**: **用户自带密钥 + 前端持有**(BYOK, Bring Your Own Key)

- LLM API keys:浏览器 `localStorage`(MVP)→ Tauri `tauri-plugin-stronghold`(Phase 2)
- 0G 密钥:同上,前端 TS 直接调 `@0glabs/0g-ts-sdk`
- **后端永不接触密钥**(S1 + PRD 明示)

**Authorization Patterns**: **无用户体系** —— Demo 站无登录;Policy Matrix **不是用户权限**,是 agent 间的通信治理(注意区分)

**Security Middleware**:
- CORS(FastAPI middleware)—— 仅允许 Demo 站自己的 origin + localhost
- Rate limiting —— MVP 不做;Phase 2 如担心 0G 免费额度被刷,前端 debounce + 后端 per-IP token bucket
- Request size limit —— FastAPI `max_request_body_size`(默认 + 显式声明 10 MB 上限,防 trajectory 撑爆)

**Data Encryption**:
- 传输:HTTPS 在 Demo 部署层由反向代理提供(Cloudflare / nginx)
- 静态:不加密(trajectory 可能包含用户 prompt,但 sanitize 剔除 PII 后公开 acceptable)
- INFT 元数据加密:Phase 3,用 libsodium / Lit Protocol / 自研 AES-GCM,待定

**API Security**:
- Demo 站 FastAPI `/workflow/run` 无身份验证(MVP)
- Phase 2 Sidecar 模式:FastAPI 仅绑定 `127.0.0.1`,依赖 OS 进程边界隔离
- 危险操作白名单(tool sandbox)—— MVP 手动维护 `ALLOWED_TOOLS` list,Phase 2 升级 container/wasm

**Cross-Cutting**:
- **严禁**任何日志/错误信息里出现 API key prefix、private key、session token
- **严禁**前端 network panel 里出现上述字段(只允许 metadata hash)

---

### API & Communication Patterns

**API Design Pattern**: **REST**(MVP)+ **SSE**(实时事件)

- **Rationale**:GraphQL 会增加前端 schema 工作量,MVP 不做;WebSocket 双向通道在 MVP 不必要(看板只需单向推送,控制命令走 REST)
- **7 个 REST endpoint**(MVP 冻结):

| Method | Path | 职责 | 状态 |
|--------|------|------|------|
| `POST` | `/workflow/validate` | 校验 WorkflowDefinition,返回错误列表 | ✅ 已有 |
| `POST` | `/workflow/compile` | `WorkflowTemplateSpec → WorkflowDefinition`(调 `highlevel.py`)| ⬜ MVP 新增 |
| `POST` | `/workflow/run` | 启动 run,返回 `run_id` | ✅ 已有 |
| `GET`  | `/workflow/runs/{run_id}` | 查询 run 状态 + 最终 artifact | ⬜ MVP 新增 |
| `GET`  | `/workflow/runs/{run_id}/events` | **SSE 实时事件流** | ⬜ MVP 新增(Critical) |
| `POST` | `/workflow/runs/{run_id}/approval` | 提交 approval_gate 决策 | ⬜ MVP 新增 |
| `POST` | `/workflow/runs/{run_id}/policy` | 运行中更新 Policy Matrix(J3) | ⬜ MVP 新增 |

**API Documentation**:
- FastAPI 自动生成 OpenAPI 3.1 / Swagger UI(`/docs`)+ ReDoc(`/redoc`)
- 前端 TS types 用 `openapi-typescript` 自动生成,避免手工同步

**Error Handling Standard**:

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Fact-checker cannot reject legal",
    "details": { "sender": "fact_checker", "receiver": "legal" },
    "trace_id": "0xabc123..."
  }
}
```

- 所有 4xx / 5xx 都走此结构 —— **不允许**直接返回 Python 异常堆栈或 FastAPI 默认 422
- `trace_id` 是 `run_id` 或独立 UUID,用于日志关联

**Rate Limiting**: MVP 不做;Phase 2 per-IP 100 req/min(SlowAPI 或 fastapi-limiter)

**Inter-Service Communication**:
- 后端内部:纯函数调用(`service.py` → `executors.py` → `llm/*.py`),**无微服务**
- 后端 ↔ 0G KV bridge:HTTP `http://localhost:3001/kv/{key}`(已有)
- 前端 ↔ 后端:REST + SSE

---

### Frontend Architecture

**State Management**: **Zustand**(已在前端依赖)

- **Rationale**:Redux boilerplate 过重;Jotai 原子粒度更细但 ReactFlow 官方示例推 Zustand;Context API 不适合高频事件(看板 500ms 约束)
- Store 分域(单一 root store 已被 ReactFlow 官方批评):
  - `useWorkflowStore`:workflow definition 本体(节点/边/defaults)
  - `usePolicyStore`:Policy Matrix
  - `useRunStore`:当前 run 状态 + SSE 事件队列
  - `useSecretsStore`:LLM API keys + 0G 密钥(写 localStorage,读时解密)

**Component Architecture**:

- **Atomic Design Lite**: `ui/`(atoms/molecules)+ `features/`(organisms/templates)+ `pages/`(pages)
- ReactFlow 节点 = `src/core/components/Node/{BaseNode, DecisionNode, ExecutionNode, PlanningNode, ReviewNode}`(已有 5 种)—— MVP 再加 `ApprovalGateNode` 和 `BarrierNode`
- 面板 = `src/core/components/Panel/{ConfigPanel, RunPanel, TraceView}`(已有)—— MVP 加 `PolicyMatrixPanel` 和 `LiveDashboard`

**Routing Strategy**: **React Router v6** + file-based 目录组织(非 Next.js App Router)

- 核心路由:
  - `/` — Landing(Slogan + 象限图 + CTA)
  - `/templates` — 模板选择页(6 卡片)
  - `/editor/:templateId?` — 编辑器 + 看板 split-screen
  - `/runs/:runId` — 独立看板页(分享用)
  - `/import` — "Import by CID" 入口
  - `/about` — 差异化对比 / 0G 链上证据 / 路线图

**Performance Optimization**:
- `React.memo` + `useMemo` / `useCallback` 默认策略
- ReactFlow `onlyRenderVisibleElements` 开启(8 角色以内非必需,但 Phase 3 大模板会用到)
- SSE 事件按 node 分组,**只重渲染变化的节点**(用 Zustand selector 精确订阅)
- Vite code splitting:`/editor` 和 `/runs` 分独立 chunk

**Bundle Optimization**:
- Target 初始 JS bundle ≤ **400 KB gzipped**(MVP 目标,非红线)
- `@0glabs/0g-ts-sdk` 懒加载(仅 `/editor` 和 `/import` 路由加载)
- Tailwind JIT + PurgeCSS(默认配置)

---

### Infrastructure & Deployment

**Hosting Strategy**: **Docker Compose 一键部署**(MVP)

- `docker-compose.yml` 启动 2 个服务:
  - `shadowflow-api`(Python FastAPI + uvicorn,端口 `8000`)
  - `shadowflow-web`(Vite preview / nginx 静态托管,端口 `3000`)
- **可选** 3 服务:`zerog-bridge`(Node.js,端口 `3001`)—— 生产环境中通常与 `shadowflow-api` 同 host
- Demo 部署:单台 VPS(如 DigitalOcean $24 droplet)+ Cloudflare DNS + Let's Encrypt 证书 —— **不需要 K8s**
- **Phase 2** Sidecar 模式:弃用 docker-compose,改由 Tauri `externalBin` 启动 PyInstaller 打包的二进制

**CI/CD Pipeline**:
- **GitHub Actions**(已有 `.claude/` 但无 `.github/workflows/`) —— MVP 新增 `ci.yml`:
  - lint: ruff + mypy + eslint
  - test: pytest + vitest
  - build: docker build + npm build
  - release(仅 tag):push image to GHCR + upload frontend dist
- 无自动部署;Demo 站手动 `docker compose up -d`(hackathon 不值得投入更多)

**Environment Configuration**:
- `.env.example` 列出所有必要变量(`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ZEROG_BRIDGE_URL` / `CORS_ORIGINS`)
- **前端** `.env.local` 只包含 `VITE_API_BASE_URL` 和 `VITE_ZEROG_BRIDGE_URL`(构建时注入)
- **严禁** 任何 key 进 `.env.example` 的实值

**Monitoring & Logging**:
- **MVP**:FastAPI `uvicorn --log-level info` + 前端 console,无专门 APM
- **可选** 集成 OpenTelemetry —— trace_id 贯穿前端 → 后端 → 0G(Phase 2 价值大,MVP 不做)
- 错误聚合:Sentry(免费 tier 足够黑客松)—— **仅 Phase 2+**

**Scaling Strategy**:
- MVP 单实例 ≤ 50 并发(PRD SC1)
- Runtime 已无状态设计,Phase 2 通过前置 nginx 负载均衡 + 多 `shadowflow-api` 实例水平扩展
- Phase 2+ 如 LLM 推理成瓶颈:Celery + Redis 做异步 queue(放弃 SSE 实时,改 WebSocket 推送最终结果)

---

### Decision Impact Analysis

**Implementation Sequence**(顺序严格,前者阻塞后者):

1. Runtime 契约扩展:Policy Matrix 对象 + `approval_gate` 节点类型(阻塞 #2-#9)
2. SSE 事件总线:`/workflow/runs/{run_id}/events`(阻塞前端看板)
3. Compile endpoint + WorkflowTemplateSpec → WorkflowDefinition 主链(阻塞 Academic Paper)
4. 前端 Zustand store 结构 + SSE 订阅(阻塞看板 UI)
5. 0G Storage 上传/下载 + trajectory sanitize(阻塞 CID 克隆闭环)
6. PolicyMatrixPanel + 运行中改制度交互(J3 demo)
7. Fallback 链 + compile 非阻塞警告 + 差异化对比页
8. Docker Compose + README 复现指令(PRD Measurable Outcomes)
9. 6 个种子模板 YAML 定稿

**Cross-Component Dependencies**:

| 决策 | 影响 |
|------|------|
| Policy Matrix 成为一等对象 | Runtime `contracts.py` 新增第 8 个核心对象 + `service.py` 事件语义 + 前端 store + SSE 事件类型 |
| SSE(单向推送)| 前端只能发起 run 和提交 approval 走 REST;不能做"运行中取消"的实时命令,MVP 不支持取消 |
| BYOK(前端持有密钥)| `@0glabs/0g-ts-sdk` 必须在前端调,不能后端代理;后端只接收已上传的 CID |
| 无数据库 | 不支持"保存模板草稿"跨会话;MVP 靠 localStorage + 用户自己下载 YAML 兜底 |
| 单进程 MVP | WebSocket/SSE 连接数 ≤ 100,超过需 Phase 2 多实例 |

---

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified**: 12 个跨 agent 潜在冲突面,覆盖命名 / 结构 / 格式 / 通信 / 过程五大类。

---

### Naming Patterns

**Python(后端)**:
- Module / package:`snake_case`(如 `runtime.contracts`)
- Class:`PascalCase`(如 `WorkflowDefinition`、`ZeroGCheckpointStore`)
- Function / variable:`snake_case`(如 `validate_writeback_bundle`、`run_id`)
- Constants:`UPPER_SNAKE_CASE`(如 `WRITEBACK_TARGETS`)
- Test 文件:`test_*.py`(pytest 默认)
- Async 函数:不加 `async_` 前缀,但 docstring 标 `"""Async: ..."""`

**TypeScript(前端)**:
- Component:`PascalCase.tsx`(如 `BaseNode.tsx`、`PolicyMatrixPanel.tsx`)
- Hook:`useXxx.ts`(如 `useRunEvents.ts`)
- 工具函数:`camelCase.ts`(如 `compileWorkflow.ts`)
- Type / interface:`PascalCase`(如 `WorkflowDefinition`、`RunEvent`)
- 枚举:`PascalCase`,成员 `PascalCase`(如 `enum NodeKind { Agent, Node }`)
- 常量:`UPPER_SNAKE_CASE`

**API 命名**(REST endpoint):
- URL 路径 **kebab-case** +复数名词优先(如 `/workflow/runs/{run_id}/events`)
- 路径参数 **snake_case**(如 `{run_id}`,保持和 Python 后端一致)
- Query 参数 **snake_case**(如 `?after_event=123`)
- **统一全链路使用 `run_id` 而非 `runId` 或 `runID`**,前端 TS 遇到后端下发 JSON 时在 adapter 层一次性转换

**JSON 字段命名**:
- **后端下发**:`snake_case`(与 Pydantic 对应,保留原生)
- **前端内部**:`camelCase`(TS 生态默认)
- **转换点**:`src/adapter/caseConverter.ts` 单一边界,在 fetch response 后统一 snake → camel,发出 request 前 camel → snake

**Database 命名(不适用)**:MVP 无 SQL 数据库;checkpoint store 的 key 格式锁定为 `shadowflow/{run_id}/{checkpoint_id}`(已有)。

**Event 命名**(SSE / 事件总线):

`{entity}.{action}` 小写点分(如 `node.started`、`node.succeeded`、`node.rejected`、`policy.violation`、`checkpoint.saved`、`run.completed`、`run.failed`)

**严禁**:`NodeStarted`、`node_started`、`node:started` 等其他风格。

---

### Structure Patterns

**Python 包结构**(锁定):

```
shadowflow/
  runtime/          # 7 核心对象 + service + store + adapter(冻结)
  llm/              # 4 provider + base ABC
  assembly/         # activation + learner + (MVP 加)compile
  memory/           # (现状未探索,MVP 不动)
  planner/          # (现状未探索,MVP 不动)
  protocol/         # (现状未探索,MVP 不动)
  core/             # (现状未探索,MVP 不动)
  cli.py            # Click / Typer 命令入口
  highlevel.py      # WorkflowTemplateSpec → compile
  mcp_server.py     # MCP 协议(非 MVP 重点)
  server.py         # FastAPI app
```

**React 前端结构**:

```
src/
  core/
    components/
      Node/           # 5 + 2 ReactFlow 节点类型
      Panel/          # 面板组件
      Canvas/         # ReactFlow Canvas 容器
    hooks/            # useWorkflowStore / useRunEvents / ...
    types/            # 从 Pydantic 生成的 TS 类型(生成物 git commit)
  common/             # 跨领域工具
    lib/              # 纯函数
    ui/               # 原子级 UI(Button / Input / Toast)
  adapter/            # 前后端边界(case converter / SSE client / 0G SDK wrapper)
  api/                # REST 客户端 + React Query hooks
  pages/              # 路由页面
  __tests__/          # Vitest 测试(co-located *.test.ts 也允许)
```

**测试位置规则**:
- 后端:`tests/` 目录独立(pytest convention,已在 `pyproject.toml` 声明)
- 前端:Vitest 支持 **两种**,但 MVP 选 **co-located `*.test.ts(x)`**(与 Vite 原生示例一致);E2E 除外放 `tests/e2e/`

**配置文件位置**:
- Python:`pyproject.toml`(唯一源)
- 前端:`package.json` + `vite.config.ts` + `tsconfig.json` + `tailwind.config.ts`
- 统一 root:`docker-compose.yml` + `.env.example` + `.github/workflows/ci.yml` + `README.md`

**禁止**:
- 同一信息散落在 `setup.py` + `setup.cfg` + `pyproject.toml`(只留 `pyproject.toml`)
- 前端引入 Makefile(用 `package.json` scripts 即可)

---

### Format Patterns

**API Response 结构**(成功):

```json
{ "data": { ... }, "meta": { "trace_id": "uuid", "timestamp": "ISO8601" } }
```

**API Response 结构**(错误):

```json
{ "error": { "code": "STRING_CONSTANT", "message": "human readable", "details": {...}, "trace_id": "uuid" } }
```

- **错误 code 命名**:`UPPER_SNAKE_CASE`,由枚举集中管理(`shadowflow/runtime/errors.py`)
- 常量示例:`WORKFLOW_VALIDATION_FAILED`、`POLICY_VIOLATION`、`PROVIDER_TIMEOUT`、`CHECKPOINT_NOT_FOUND`、`SANITIZE_REJECTED`

**Date / Time 格式**:
- API 层全部 **ISO 8601 UTC**(`2026-04-15T07:05:32Z`,**不带毫秒**,除非专门需要)
- 后端内部 Python `datetime.now(timezone.utc)`(已在 `contracts.py` 提供 `utc_now()` 工具)
- 前端 `Date` 对象;展示层统一走 `formatDate(iso, locale)` 工具,**禁止**各组件用 `toLocaleString()` 参差不齐

**SSE 事件 payload**:

```
event: node.started
data: {"event_id":"1","run_id":"...","node_id":"...","timestamp":"...","payload":{...}}
```

- `event_id` 单调递增,前端可用 `Last-Event-ID` header 重连后补齐
- `payload` 字段形态按 event name 分(`node.*` / `policy.*` / `checkpoint.*` / `run.*`)

**Boolean 表示**: JSON 中统一 `true` / `false`;禁止 `"true"` / `1`。

**Null 处理**: Pydantic 默认过滤 `None`(配置 `model_dump(exclude_none=True)`),避免前端看到一堆 `null`。

---

### Communication Patterns

**Event System**:

- **事件总线**:`asyncio.Queue` 每 run 一个(MVP 单进程够)—— Runtime 写入,SSE endpoint 读出
- **事件分类**(命名见上 "Event 命名"):
  - `run.*` —— run 生命周期(started / completed / failed / paused)
  - `node.*` —— 单节点生命周期(started / succeeded / failed / rejected / retrying)
  - `policy.*` —— Policy Matrix 事件(violation / overridden)
  - `checkpoint.*` —— 持久化事件(saved / loaded)
  - `provider.*` —— LLM Provider 事件(fallback / timeout)
  - `assembly.*` —— 编译事件(warning / error)

**State Management**:
- Python 端:Pydantic model 是不可变结构,修改 = `model.copy(update={...})`
- React 端:Zustand `set` callback 必须返回新对象(immutable update),禁止直接 mutate state

**Action Naming**(前端 store):
- `setXxx(value)` —— 直接设置
- `updateXxx(partial)` —— 合并更新
- `xxxAsync()` / `fetchXxx()` —— 异步操作
- Side effect 都在 Action 内部处理,组件只调用 Action

---

### Process Patterns

**Error Handling Approach**:

**Python 后端**:
- 领域错误(Policy / Compile / Provider / Sanitize)继承自 `shadowflow.runtime.errors.ShadowflowError`,每个都有 `code` 属性
- FastAPI `exception_handler` 统一捕获 `ShadowflowError` → 转成标准 error response
- 未预期异常 500 + `trace_id`,**不回显 stack 到前端**
- 每个 handler 必须 `logger.exception(...)` 带 `trace_id`

**前端**:
- API 调用统一走 `src/api/client.ts`,内部捕获错误 → normalize 成 `{code, message, details}` 结构
- React 顶层 `ErrorBoundary` 兜底组件渲染错误
- 用户可见错误用 Toast 展示;技术错误(network、schema mismatch)给开发者看到 console
- SSE 连接失败 → 自动重连 3 次(指数退避)+ Toast 提示"连接中断,正在重连"

**Loading States**:
- 前端三层:
  - 局部(按钮内 spinner)—— `isPending` 从 `useMutation`
  - 页面级(整页骨架)—— Suspense + `React.lazy`
  - 看板级(SSE 未连上)—— Overlay "正在连接 run stream..."
- **禁止** `loading = true` 单一 flag 蔓延全局 —— 用 React Query / Zustand selector 粒度控制

**Retry Implementation**:
- Python:`httpx.Retry` + `tenacity`(若引入)—— max 3 次,指数退避 base=1s
- 0G Storage 上传失败:保留前端本地副本,提示用户手动重试(不自动重试耗用户 gas)
- LLM Provider 超时:走 Provider Fallback 链(不是 retry 同一个 provider)

**Authentication Flow**: N/A(无用户体系);但"密钥遗失"时:
- 前端检测 localStorage 无 key → 引导用户填写 → 保存 → 刷新
- 0G 操作失败("no key")→ 明确 Toast 提示,不 silent fail

**Validation Timing**:
- 前端:编辑器 `onChange` 防抖 300ms → Zustand store → **客户端先 Pydantic-like 验证(JS 版本)**
- 后端:**API 层 Pydantic `model_validate()` 强制**,不接受"前端已验证"的信任假设
- 双重验证是故意的 —— 前端提速反馈,后端才是 Source of Truth

---

### Enforcement Guidelines

**All AI Agents / Contributors MUST**:

1. **遵循 7 对象契约字段级冻结**:新增字段 OK(metadata dict 内),修改/删除字段需要 RFC
2. **永远在 fetch response 的 adapter 层做 snake→camel 转换**,**严禁**在组件里手写 `data.runId ?? data.run_id`
3. **所有 Pydantic model 必须有 `model_validator`**(若存在跨字段校验)
4. **所有 async function 必须覆盖超时**(`asyncio.wait_for` 或 `httpx timeout=`)—— 无超时 = PR 自动 block
5. **永远不要把 API key / private key / session token 写入日志、异常消息、trajectory、git commit**
6. **所有新 endpoint 必须在 OpenAPI 可见**(不允许 `include_in_schema=False` 除非专门的 health check)
7. **所有新 event 必须注册到 `event_types.py`**(统一常量集中管理)
8. **所有 ReactFlow 自定义节点必须继承 `BaseNode.tsx`**,不允许从零写
9. **所有 Checkpoint 读写必须走 `CheckpointStore` 抽象**,不允许绕过直接访问文件/HTTP

**Pattern Enforcement**:
- Lint 层:Ruff + ESLint 覆盖命名风格
- CI 层:一个 `scripts/check_contracts.py` 跑 schema 差异(`contracts.py` 和前端 `types/` 是否同步)
- PR 层:模板包含 "7 对象契约是否变更?(是/否,是则附 RFC)" checklist
- Doc 层:违反 pattern 的 PR 必须在 Description 标注"**Pattern Exception**"和理由

---

### Pattern Examples

**✅ 好的实例**:

```python
# shadowflow/runtime/errors.py
class PolicyViolation(ShadowflowError):
    code = "POLICY_VIOLATION"
    def __init__(self, sender: str, receiver: str):
        self.details = {"sender": sender, "receiver": receiver}
        super().__init__(f"{sender} cannot send to {receiver}")
```

```typescript
// src/adapter/caseConverter.ts
export function snakeToCamel<T>(obj: unknown): T { /* ... */ }

// src/api/client.ts
const response = await fetch(url);
const json = await response.json();
return snakeToCamel<RunResult>(json.data);
```

**❌ 反模式**:

```python
# 反模式:自发明错误格式
raise Exception(f"Policy violation: {sender} -> {receiver}")  # ❌
```

```typescript
// 反模式:组件里处理 snake_case
function RunCard({ run }) {
  return <div>{run.runId ?? run.run_id}</div>;  // ❌ 两种命名同时存在
}
```

```python
# 反模式:直接读文件跳过 CheckpointStore
with open(f".shadowflow/checkpoints/{run_id}.json") as f:  # ❌
    state = json.load(f)
```

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
ShadowFlow/
├── README.md                                    # 评委 copy-paste 复现入口
├── LICENSE
├── pyproject.toml                               # Python 唯一包配置
├── package.json                                 # 前端 npm 工作区
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── docker-compose.yml                           # ⭐ MVP 新增:一键启动
├── Dockerfile.api                               # ⭐ MVP 新增
├── Dockerfile.web                               # ⭐ MVP 新增
├── .env.example                                 # ⭐ MVP 新增:密钥模板
├── .gitignore
├── .dockerignore                                # ⭐ MVP 新增
├── CLAUDE.md                                    # 项目根指令(已有)
├── AGENTS.md                                    # 已有
│
├── .github/
│   └── workflows/
│       └── ci.yml                               # ⭐ MVP 新增:lint + test + build
│
├── .0g-skills/                                  # 0G 官方 skills(已有 15 个)
│   └── skills/{storage,compute,chain,cross-layer}/
│
├── shadowflow/                                  # Python 后端包(已有 19.7K 行)
│   ├── __init__.py
│   ├── cli.py                                   # shadowflow CLI 入口(已有)
│   ├── server.py                                # FastAPI app(已有,MVP 增 endpoint)
│   ├── highlevel.py                             # TemplateCompiler(已有 2886 行)
│   ├── mcp_server.py                            # MCP 协议(已有,非 MVP)
│   │
│   ├── runtime/                                 # 核心 runtime(契约冻结)
│   │   ├── __init__.py
│   │   ├── contracts.py                         # 7 核心对象(已有)
│   │   ├── service.py                           # RuntimeService(已有 2991 行)
│   │   ├── executors.py                         # 执行器调度(已有)
│   │   ├── checkpoint_store.py                  # 3 种 store 已有
│   │   ├── host_adapter.py                      # WritebackAdapter 基类(已有)
│   │   ├── markdown_adapter.py                  # Markdown 实现(已有)
│   │   ├── official_examples.py                 # 官方示例(已有)
│   │   ├── training_cleaning.py                 # (已有 untracked)
│   │   ├── policy_matrix.py                     # ⭐ MVP 新增:Policy Matrix 对象
│   │   ├── events.py                            # ⭐ MVP 新增:事件总线 + event_types 常量
│   │   ├── errors.py                            # ⭐ MVP 新增:ShadowflowError 体系
│   │   └── sanitize.py                          # ⭐ MVP 新增:上传前 PII 扫描
│   │
│   ├── llm/                                     # LLM Provider(已有 4 个)
│   │   ├── __init__.py
│   │   ├── base.py                              # LLMProvider ABC(已有)
│   │   ├── claude.py                            # (已有)
│   │   ├── openai.py                            # (已有)
│   │   ├── gemini.py                            # (已有)
│   │   ├── ollama.py                            # (已有)
│   │   ├── zerog.py                             # ⭐ MVP 新增:0G Compute 作为第 5 provider
│   │   └── fallback.py                          # ⭐ MVP 新增:fallback 链编排
│   │
│   ├── assembly/                                # Workflow Assembly(已有 activation/learner)
│   │   ├── __init__.py
│   │   ├── activation.py                        # (已有)
│   │   ├── learner.py                           # (已有)
│   │   └── compile.py                           # ⭐ MVP 新增:WorkflowTemplateSpec 编译主链
│   │
│   ├── integrations/                            # ⭐ MVP 新增:外部服务集成
│   │   ├── __init__.py
│   │   ├── zerog_storage.py                     # ⭐ 0G Storage 后端代理(若前端不直调的 fallback)
│   │   └── zerog_bridge_client.py               # ⭐ ZeroGCheckpointStore 抽离出的 HTTP 客户端
│   │
│   ├── memory/                                  # (已有,MVP 不动)
│   ├── planner/                                 # (已有,MVP 不动)
│   ├── protocol/                                # (已有,MVP 不动)
│   └── core/                                    # (已有,MVP 不动)
│
├── src/                                         # React 前端(已有 35.7K 行)
│   ├── main.tsx                                 # (已有)
│   ├── App.tsx                                  # (已有)
│   ├── index.css
│   ├── index.ts
│   │
│   ├── core/
│   │   ├── components/
│   │   │   ├── Canvas/                          # ReactFlow Canvas(已有)
│   │   │   ├── Node/                            # 5 种节点类型(已有)
│   │   │   │   ├── BaseNode.tsx                 # (已有)
│   │   │   │   ├── ApprovalGateNode.tsx         # ⭐ MVP 新增
│   │   │   │   ├── BarrierNode.tsx              # ⭐ MVP 新增
│   │   │   │   └── ...
│   │   │   ├── Panel/                           # 配置面板(已有)
│   │   │   │   ├── PolicyMatrixPanel.tsx        # ⭐ MVP 新增(核心)
│   │   │   │   ├── LiveDashboard.tsx            # ⭐ MVP 新增(看板)
│   │   │   │   └── TraceView.tsx                # (已有)
│   │   │   └── Layout/
│   │   ├── hooks/
│   │   │   ├── useWorkflowStore.ts              # ⭐ MVP 统一 store
│   │   │   ├── usePolicyStore.ts                # ⭐ MVP 新增
│   │   │   ├── useRunStore.ts                   # ⭐ MVP 新增
│   │   │   ├── useSecretsStore.ts               # ⭐ MVP 新增(localStorage 加密)
│   │   │   └── useRunEvents.ts                  # ⭐ MVP 新增(SSE 订阅)
│   │   └── types/
│   │       ├── workflow.ts                      # ⭐ 从 Pydantic 生成
│   │       ├── events.ts                        # ⭐ SSE event union
│   │       └── index.ts
│   │
│   ├── common/
│   │   ├── lib/                                 # 工作流工具(已有)
│   │   └── ui/                                  # 原子级 UI
│   │
│   ├── adapter/                                 # 前后端边界
│   │   ├── caseConverter.ts                     # ⭐ MVP 统一 snake↔camel
│   │   ├── sseClient.ts                         # ⭐ MVP 新增(Last-Event-ID 重连)
│   │   └── zerogStorage.ts                      # ⭐ MVP 新增(封装 @0glabs/0g-ts-sdk)
│   │
│   ├── api/
│   │   ├── client.ts                            # ⭐ MVP 重构:统一错误处理
│   │   ├── workflowApi.ts
│   │   └── runApi.ts
│   │
│   ├── pages/                                   # ⭐ MVP 新增路由页
│   │   ├── LandingPage.tsx
│   │   ├── TemplatesPage.tsx
│   │   ├── EditorPage.tsx
│   │   ├── RunPage.tsx
│   │   ├── ImportPage.tsx
│   │   └── AboutPage.tsx
│   │
│   ├── __tests__/                               # 已有
│   └── test/                                    # Vitest 配置
│
├── templates/                                   # ⭐ MVP 新增:6 个种子模板 YAML
│   ├── solo-company.yaml
│   ├── academic-paper.yaml                      # ⭐ 走 WorkflowAssembly 主链
│   ├── newsroom.yaml
│   ├── modern-startup.yaml
│   ├── ming-cabinet.yaml
│   └── blank.yaml
│
├── examples/                                    # 已有 59 个示例 YAML
│
├── tests/                                       # Python 测试(已有 27 文件)
│   ├── conftest.py
│   ├── legacy/                                  # (已有)
│   ├── test_contracts.py
│   ├── test_service.py
│   ├── test_checkpoint_store.py
│   ├── test_policy_matrix.py                    # ⭐ MVP 新增
│   ├── test_sanitize.py                         # ⭐ MVP 新增
│   ├── test_events_bus.py                       # ⭐ MVP 新增
│   └── e2e/                                     # ⭐ MVP 新增(Playwright)
│       └── test_demo_flow.py
│
├── scripts/                                     # (已有 2 个 + MVP 新增)
│   ├── benchmark_training_accumulation.py       # (已有)
│   ├── clean_activation_training_data.py        # (已有)
│   ├── generate_ts_types.py                     # ⭐ MVP 新增:Pydantic → TS
│   └── check_contracts.py                       # ⭐ MVP 新增:CI 用
│
├── docs/                                        # (已有大量文档)
│   ├── README.md
│   ├── ARCHITECTURE.md                          # (已有,应该 deprecate 指向本文档)
│   ├── RUNTIME_CONTRACT_SPEC.md                 # (已有)
│   ├── WORKFLOW_SCHEMA.md                       # (已有)
│   ├── CHECKPOINT_STORE_CONTRACT.md             # (已有)
│   ├── WRITEBACK_ADAPTER_CONTRACT.md            # (已有)
│   └── plans/                                   # 研究与设计文档
│
└── _bmad-output/
    └── planning-artifacts/
        ├── prd.md                               # 本架构的依赖
        ├── architecture.md                      # ← 本文档
        └── ...
```

### Architectural Boundaries

**API Boundaries**(前端 ↔ 后端):

- 唯一 HTTP 契约:`/workflow/*` 7 个 endpoint + `/workflow/runs/{id}/events` SSE
- 单一 response envelope:`{data, meta}` 成功 / `{error}` 失败
- **前端从不调用后端私有函数**;所有后端能力通过 REST 暴露或不暴露(不存在"前端直接 import Python")
- 密钥永不走这条边界(前端自持)

**Component Boundaries**(后端内部):

- `runtime/` = 编排核心,只依赖 `llm/` 和 `assembly/`,**不**依赖 `server.py` 或 `cli.py`
- `server.py` + `cli.py` = 薄壳,只调用 `runtime.RuntimeService.run()` 等公共方法,**不**持有业务逻辑
- `llm/base.py` = Provider ABC,**不**持有具体实现;具体 provider 在 `llm/{claude,openai,...}.py`
- `assembly/compile.py` = WorkflowTemplateSpec → WorkflowDefinition,**不**执行 run(只负责 schema 转换)
- `integrations/zerog_*.py` = 0G 集成,**不**直接被 `runtime/` 导入;通过 `CheckpointStore` 或 `Adapter` 注入

**Service Boundaries**(后端 ↔ 外部):

- 后端 → 0G KV Bridge:HTTP `:3001`(已有)
- 后端 → LLM API:httpx 直连(已有 4 provider)
- 前端 → 0G Storage/Compute:`@0glabs/0g-ts-sdk` 直连(BYOK,后端不经手)
- 前端 → Semantic Scholar(Phase 2):前端直调(MVP mock 就地实现)

**Data Boundaries**:

- **Pydantic 是 Single Source of Truth**:Python 模型 → `scripts/generate_ts_types.py` → TS 类型
- Checkpoint key 格式锁定:`shadowflow/{run_id}/{checkpoint_id}`
- Trajectory 上传格式:见下 Integration → 0G Storage Payload

---

### Requirements to Structure Mapping

**Feature/Epic Mapping**:

| 能力(MVP 10 项)| 前端位置 | 后端位置 | 测试位置 |
|----------------|---------|---------|---------|
| #1 Workflow runtime(已有)| —— | `shadowflow/runtime/service.py` | `tests/test_service.py` |
| #2 模板编辑器 | `src/pages/EditorPage.tsx` + `src/core/components/Canvas/` | `/workflow/validate` + `/workflow/compile` | `src/__tests__/editor.test.tsx` |
| #3 权限矩阵可视化 | `src/core/components/Panel/PolicyMatrixPanel.tsx` + `src/core/hooks/usePolicyStore.ts` | `shadowflow/runtime/policy_matrix.py` + `contracts.py` 扩展 | `tests/test_policy_matrix.py` |
| #4 实时看板 | `src/core/components/Panel/LiveDashboard.tsx` + `src/core/hooks/useRunEvents.ts` + `src/adapter/sseClient.ts` | `/workflow/runs/{id}/events`(SSE)+ `runtime/events.py` | `tests/test_events_bus.py` + e2e |
| #5 6 个种子模板 | `src/pages/TemplatesPage.tsx` | `templates/*.yaml` | 手工校验 |
| #6 0G Storage trajectory | `src/adapter/zerogStorage.ts` + `src/pages/ImportPage.tsx` | `runtime/sanitize.py`(上传前过滤)| `tests/test_sanitize.py` |
| #7 0G Compute 推理 | —— | `shadowflow/llm/zerog.py` + `llm/fallback.py` | `tests/test_llm_fallback.py` |
| #8 现场改制度交互 | `src/core/components/Panel/PolicyMatrixPanel.tsx` + `/workflow/runs/{id}/policy` POST | `runtime/service.py` 扩展 `update_policy()` | e2e 测 J3 |
| #9 CID 克隆闭环 | `src/pages/ImportPage.tsx` + `src/adapter/zerogStorage.ts` | 无后端介入(前端直调 0G)| e2e 测 J4 |
| #10 WorkflowAssembly 主链 | `/workflow/compile` 客户端调用 | `shadowflow/assembly/compile.py` + `highlevel.py` 整合 | `tests/test_assembly.py` |

**Cross-Cutting Concerns 映射**:

- **消息总线与 SSE**: `shadowflow/runtime/events.py` + `src/adapter/sseClient.ts`
- **密钥管理**: `src/core/hooks/useSecretsStore.ts`(前端)+ CI 扫描(`scripts/check_contracts.py` 里加 regex 检查)
- **错误降级**: `shadowflow/runtime/errors.py` + `src/api/client.ts`
- **Schema 版本**: `shadowflow/runtime/contracts.py` `version` 字段 + `scripts/generate_ts_types.py`
- **Phase 边界**: `shadowflow/server.py` 的 `bind_host` 配置(`0.0.0.0` for Web / `127.0.0.1` for Sidecar)
- **0G 合规**: `shadowflow/integrations/zerog_*.py` + `.0g-skills/` 检查清单
- **驳回运行时语义**: `runtime/policy_matrix.py` + `runtime/service.py` + `checkpoint_store.py` 协作

---

### Integration Points

**Internal Communication**:

```
┌──────────────────────────────────────────────┐
│  React SPA (src/)                            │
│   ├─ Zustand stores  ←──  SSE events (/events)│
│   └─ REST fetch     ──→   FastAPI endpoints  │
└───────────────┬──────────────────────────────┘
                │ HTTP :8000
                ↓
┌──────────────────────────────────────────────┐
│  FastAPI (shadowflow/server.py)              │
│   └─ RuntimeService.run()                    │
│       ├─ executors → llm/* (4+1 providers)   │
│       ├─ policy_matrix validate & reject     │
│       ├─ events bus (asyncio.Queue)          │
│       └─ checkpoint_store.save/load          │
└───────────────┬──────────────────────────────┘
                │
                ↓
┌──────────────────────────────────────────────┐
│  CheckpointStore 3 backends                   │
│   ├─ InMemory (dev)                          │
│   ├─ File (.shadowflow/checkpoints/)         │
│   └─ ZeroG (HTTP bridge :3001 → 0G KV)       │
└──────────────────────────────────────────────┘
```

**External Integrations**:

| 外部 | 方向 | 客户端 | 频率 | 降级路径 |
|-----|------|-------|------|---------|
| 0G Storage | 前端 → 直连 | `@0glabs/0g-ts-sdk`(TS)| 每次归档 / 克隆 | 失败 Toast + 本地 YAML 下载兜底 |
| 0G Compute | 后端 → HTTP | OpenAI SDK(`base_url` 改)| 每次推理(可选)| Fallback 到 Claude/OpenAI/Gemini/Ollama |
| 0G KV Bridge | 后端 → HTTP | `httpx`(已有)| 每次 checkpoint | 降级到 `FileCheckpointStore` |
| Claude API | 后端 → HTTP | Anthropic SDK(已有)| 每次推理 | Fallback 链 |
| OpenAI API | 后端 → HTTP | OpenAI SDK(已有)| 每次推理 | Fallback 链 |
| Gemini API | 后端 → HTTP | Google SDK(已有)| 每次推理 | Fallback 链 |
| Ollama(本地)| 后端 → HTTP | `httpx`(已有)| 每次推理(可选)| 最后兜底,失败则整体 pause |
| Semantic Scholar | 前端 → 直连 | fetch | 每次文献综述 | MVP mock;Phase 2 真 API |

**Data Flow**(J1 完整闭环):

1. 用户在 EditorPage 下达 NL 指令 → Zustand 更新 `useRunStore.instruction`
2. 前端 `POST /workflow/compile` → 后端 `highlevel.TemplateCompiler.compile()` → 返回 `WorkflowDefinition`
3. 前端 `POST /workflow/run` with `{definition, instruction, secrets_digest}` → 后端 `run_id`
4. 前端 `EventSource('/workflow/runs/{id}/events')` 订阅 SSE
5. 后端 `RuntimeService.run()` 异步执行 → 事件写 `asyncio.Queue`
6. SSE endpoint 读 Queue → `event: node.started / node.succeeded / policy.violation / ...`
7. 前端 `useRunEvents` 分发到 `useRunStore` → LiveDashboard 重渲染对应节点
8. Policy Matrix 驳回触发 → 后端发 `policy.violation` + `checkpoint.saved` + `node.retrying`
9. 最终 `run.completed` → 前端请求 `/workflow/runs/{id}` 拿 artifact
10. 用户点"归档 0G"→ 前端直调 `@0glabs/0g-ts-sdk` 上传 trajectory → 得到 CID

---

### File Organization Patterns

**Configuration Files**(root 集中):

- `pyproject.toml` —— Python 唯一包配置
- `package.json` / `vite.config.ts` / `tsconfig.json` / `tailwind.config.ts` —— 前端
- `docker-compose.yml` / `Dockerfile.api` / `Dockerfile.web` —— 容器
- `.env.example` —— 密钥模板(不带实值)
- `.github/workflows/ci.yml` —— CI 唯一 pipeline

**Source Organization**:
- Python:按 **领域子包**(`runtime` / `llm` / `assembly` / ...)
- 前端:按 **层 + 功能**(`core/components/Node/*` / `adapter/sseClient`)

**Test Organization**:
- 后端:`tests/` 独立目录,镜像 `shadowflow/` 结构
- 前端:`*.test.ts(x)` co-located + `src/__tests__/` 集中 integration
- E2E:`tests/e2e/`(Playwright)—— 跑 5 条 Journey 的自动化验证

**Asset Organization**:
- 静态资源:`public/`(前端 Vite 默认)
- 模板 YAML:`templates/`(root 级,CLI 和前端都引用)
- 文档图:`docs/assets/`

---

### Development Workflow Integration

**Development Server**:

```bash
# Terminal 1 — Python 后端(热更)
uvicorn shadowflow.server:app --reload --port 8000

# Terminal 2 — 前端(Vite HMR)
npm run dev  # http://localhost:5173

# Terminal 3(可选)— 0G KV Bridge(Node.js)
cd .0g-skills/bridge && npm start  # :3001
```

**Build Process**:

```bash
# 后端
python -m build  # 产物 dist/shadowflow-0.x.x-py3-none-any.whl

# 前端
npm run build   # 产物 dist/ (static files)

# 容器
docker compose build
docker compose up -d
```

**Deployment**:

- MVP:Docker Compose + 单 VPS + Cloudflare DNS;评委可跑 `git clone && docker compose up`
- Phase 2:Tauri Sidecar(弃用 compose,改用 PyInstaller 打包的二进制 + Rust `shadowflow_client.rs`)
- Phase 3:合约部署走 Hardhat(`.0g-skills/skills/chain/deploy-contract/`)

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility**:

- Python 3.9+ / Pydantic 2 / FastAPI 0.109+ / httpx 0.26+ 是稳定组合(已在生产使用)
- React 18 / ReactFlow 11 / Vite 5 / Zustand / Tailwind **已在当前代码运行**,无未验证假设
- SSE 是 FastAPI 一等公民(`StreamingResponse` + `text/event-stream`);Zustand 对高频更新友好;组合已被多个开源项目(如 Langfuse、FiftyOne)验证
- Docker Compose 与容器化 FastAPI/Vite 标准组合,零风险
- 0G Storage(前端直调)+ 0G KV(后端走 HTTP bridge)的分工符合 S1(密钥前端持有)

**Pattern Consistency**:

- 命名规范(snake↔camel 转换在 adapter)与既有代码一致(contracts.py 已用 snake_case)
- 错误格式 `{code, message, details, trace_id}` 与 FastAPI exception_handler 天然对齐
- Event 命名 `entity.action` 在 SSE 格式下渲染直观

**Structure Alignment**:

- 项目结构树 **复用 90% 既有目录**,新增项都是空位补齐(`policy_matrix.py` / `events.py` / `integrations/` / `templates/`)—— 不存在结构冲突
- `runtime/` 职责边界与现有 `contracts.py` + `service.py` 一致
- 前端层次结构(core/common/adapter/api/pages)与 `src/` 现状兼容

---

### Requirements Coverage Validation ✅

**Functional Requirements(FR1-FR41)覆盖**:

| FR 类别 | 覆盖机制 | 状态 |
|--------|---------|------|
| FR1-FR7 模板设计 | `templates/` + `highlevel.py` + `assembly/compile.py` + EditorPage | ✅ 全部有归属 |
| FR8-FR12 权限矩阵 | `runtime/policy_matrix.py` + `PolicyMatrixPanel` + `/workflow/runs/{id}/policy` | ✅ 全部有归属(新增) |
| FR13-FR18 运行执行 | `runtime/service.py`(已有)+ `llm/fallback.py`(新增)+ `approval_gate` 节点类型 | ✅ 已有 80% |
| FR19-FR22 实时观察 | `runtime/events.py` + SSE endpoint + `LiveDashboard` | ✅ MVP 新增覆盖 |
| FR23-FR26 持久化 | `CheckpointStore`(3 backend,已有)+ trajectory export | ✅ 已有 |
| FR27-FR31 0G 集成 | `src/adapter/zerogStorage.ts` + `llm/zerog.py` + FR31 明确 Phase 3 | ✅ MVP 覆盖 27-30 |
| FR32-FR35 分享交易 | `src/pages/ImportPage.tsx` + 署名链 metadata;FR35 Phase 3 | ✅ MVP 覆盖 32-34 |
| FR36-FR37 Agent 交互 | `runtime/events.py` 扩展 gap_detected event | ✅(设计中) |
| FR38-FR41 Demo | `LandingPage` + `AboutPage` + `README` | ✅ 前端 + 文档产物 |

**Non-Functional Requirements 覆盖**:

| NFR | 架构支持 | 验证点 |
|-----|---------|--------|
| P1-P6 性能 | SSE 推送 < 500ms / Vite HMR / code splitting / async httpx | 需在 MVP-Ready 前压测 |
| S1-S6 安全 | BYOK + sanitize + Merkle 验证 + no-training fallback + tool 白名单 | S6 Phase 3 |
| SC1-SC3 扩展 | 单实例 50 并发 + 无状态设计 + Rust 下沉留后路 | SC1 压测 |
| A1-A2 可达性 | Tailwind 对比度 + 键盘导航(ReactFlow 默认支持)| 需 Lighthouse 审 |
| I1-I5 集成 | 4+1 Provider + 0G SDK 锁版本 + Sidecar 契约 + Tauri 命令 | I3 95% 成功率 Phase 1 压测 |
| R1-R3 可靠 | 3 种 checkpoint + pause 机制 + 非阻塞警告 | 端到端测 |

---

### Implementation Readiness Validation ✅

**Decision Completeness**:

- ✅ 所有 Critical 决策(5 项)已定案,附 Rationale
- ✅ 技术版本已锁定(Python 3.9+ / React 18 / Vite 5 / Pydantic 2 / FastAPI 0.109+)
- ✅ 模式(pattern)对所有潜在冲突面都有明确规则
- ⚠️ Phase 3 INFT 加密方案(S6)**故意留白** —— 非 MVP 阻塞项

**Structure Completeness**:

- ✅ 项目树完整,每个新增文件标 "⭐ MVP 新增"
- ✅ Epic/能力到文件的映射表完整
- ✅ 内外部通信路径画清
- ⚠️ `shadowflow/memory` / `planner` / `protocol` / `core` 四个既有子包**未做深度探索**;MVP 假设不动,Phase 2 再梳理

**Pattern Completeness**:

- ✅ 命名冲突(snake/camel / SSE event / endpoint)全覆盖
- ✅ 错误处理 end-to-end 一致(Pydantic error → HTTP envelope → 前端 Toast)
- ✅ Loading / Retry / Validation 三种 process 模式齐备

---

### Gap Analysis Results

**Critical Gaps(必须在下一个 step / story 前补齐)**:

| 缺口 | 影响 | 补齐动作 |
|------|------|---------|
| Policy Matrix 运行时完整语义未冻结 | 阻塞 #3 #8 的 story 拆分 | Epic 0 · Sprint 1 内决定"是否回滚未开始节点" |
| `approval_gate` 节点类型未定义 | 阻塞 Academic Paper J2 驳回链 | 在 `contracts.py` 扩展 Literal 类型 |
| `run.update_policy()` 的 re-compile 语义 | 阻塞 J3 现场改制度 | 决定"改矩阵后已跑完节点是否保留 output" |

**Important Gaps(影响交付质量,但有 workaround)**:

- Pydantic → TS 类型自动生成脚本未跑通:暂时手动维护,Sprint 1 末补 `generate_ts_types.py`
- Sentry / OpenTelemetry 缺席:MVP 靠 console log 兜底
- Provider fallback 失败全链路后的 "pause 到 UI" 交互未设计:Sprint 2 Edge case

**Nice-to-Have Gaps**:

- LLM response 缓存(Redis):Phase 2
- E2E 测试覆盖 5 条 Journey + 3 条 Edge:MVP 至少覆盖 J1 + J2 + J3,其余 Phase 2
- trajectory 高级查询(谁驳回了谁,按时间聚合):Phase 2

---

### Validation Issues Addressed

| 类别 | 发现 | 处理 |
|------|------|------|
| **Scale mismatch** | PRD 声称 ~6K runtime,实际 19.7K | 架构基于真实代码定 decision,不被 PRD 估算误导 |
| **PixiJS / d3-force 假设** | PRD "搬 Shadow 的 PixiJS+d3-force 零改动" 现实中前端只有 ReactFlow | 改为 ReactFlow 原生实现 LiveDashboard(已有画布,加一套只读节点 + 事件动画层);PixiJS 留 Phase 2 选项 |
| **PolicyMatrix 在 runtime 缺席** | 既有 `contracts.py` 无 Policy Matrix 字段 | 明确 MVP 新增第 8 个核心对象 + runtime/policy_matrix.py |
| **Memory/planner/protocol 子包黑盒** | 未能深度探索 | 标为 "MVP 不动",Phase 2 专门 Sprint 梳理 |
| **INFT 不在 MVP** | PRD 明确 Phase 3 | 架构仅保留 `metadata.author_lineage` 字段,不引入合约交互代码 |

---

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] 41 条 FR 分 8 类,每类映射到具体组件
- [x] NFR 5 维度(P/S/SC/A/I)+ R 可靠性覆盖
- [x] 技术约束(0G skills / Pydantic / Ethers)已列
- [x] 7 跨切 concern(消息流 / 密钥 / 错误 / schema / phase / 0G 合规 / 驳回)已映射

**✅ Architectural Decisions**
- [x] 5 Critical + 4 Important + 3 Deferred 决策全部有 Rationale
- [x] 技术版本锁定(Pydantic 2 / FastAPI 0.109+ / React 18 / Vite 5)
- [x] Data / Auth / API / Frontend / Infra 五大类覆盖
- [x] 性能考虑(SSE / code splitting / memo)

**✅ Implementation Patterns**
- [x] 命名(Python / TS / API / JSON / Event)
- [x] 结构(后端包 / 前端目录 / 测试位置 / 配置)
- [x] 格式(response envelope / error / date / SSE)
- [x] 通信(事件命名 / state / action)
- [x] 过程(error / loading / retry / validation)

**✅ Project Structure**
- [x] 完整目录树,标注已有 vs MVP 新增
- [x] 组件边界 + 服务边界 + 数据边界
- [x] 10 个 MVP 能力全部映射到文件
- [x] 内外部通信 + data flow 完整

---

### Architecture Readiness Assessment

**Overall Status**: ✅ **READY FOR IMPLEMENTATION**

**Confidence Level**: **High** — 90% 基于既有生产代码的扩展,10% 是 MVP 新增(Policy Matrix / SSE / 前端看板)风险可控

**Key Strengths**:

1. **Brownfield 基线扎实** —— 19.7K Python + 35.7K React 已在 Alpha 阶段,契约冻结
2. **宿主无关性天生** —— RuntimeService 与 server.py / cli.py 解耦,Phase 2 Sidecar 切换只换宿主壳
3. **可插拔 Provider Adapter** —— 4+1 LLM 统一 ABC,0G Compute 作为第 5 provider 零侵入接入
4. **Checkpoint 多后端** —— Memory / File / 0G KV 已就位,MVP 无 DB 仍可跑 resume
5. **前后端 schema 单源** —— Pydantic → TS 工具链保证零漂移
6. **降级路径明确** —— Fallback 链 / sanitize / 非阻塞警告三条 resilience 护栏
7. **phase-layered 演进路径** —— MVP / Phase 2 Sidecar / Phase 3 INFT 三层清晰,每层是前一层的增量

**Areas for Future Enhancement**:

1. `shadowflow/memory` / `planner` / `protocol` / `core` 子包深度梳理(Phase 2)
2. OpenTelemetry 端到端 trace(Phase 2)
3. WebSocket 双向通道 + "取消运行"(Phase 2)
4. Rust 消息总线与高并发下沉(Phase 5+)
5. INFT Lazy Minting + Escrow 前端与合约(Phase 3)
6. 多租户与 Workspace 概念(Phase 4)

---

### Implementation Handoff

**AI Agent / Contributor Guidelines**:

1. **本文档是唯一架构事实**,与 `docs/ARCHITECTURE.md`(v0.1.0,2026-03-10)冲突时以本文档为准;`docs/ARCHITECTURE.md` 将在 MVP 后被本文档继承
2. **7 对象契约字段级冻结**,任何修改走 RFC + 更新 `contracts.py` + `scripts/generate_ts_types.py` 重跑
3. **命名规范**(snake / camel / PascalCase / UPPER_SNAKE)**ruff 和 eslint 强制**,PR 不过 lint 不合并
4. **所有新增 endpoint 进 OpenAPI;所有新增 event 进 `events.py` 常量**
5. **前端永不手写 `run_id` / `runId` 并用**;统一 adapter 层转换
6. **密钥永不写日志、trajectory、git**;CI grep 检查
7. **违反 pattern 的 PR 必须在 description 标注 "Pattern Exception" + 理由**

**First Implementation Priority**(Story #0,阻塞其他):

```bash
# Sprint 0 · Kickoff(1-2 天)
1. docker-compose.yml + Dockerfile.api + Dockerfile.web + .env.example
2. .github/workflows/ci.yml(lint + test + build,不自动部署)
3. scripts/generate_ts_types.py(跑通 contracts.py → src/core/types/workflow.ts)
4. scripts/check_contracts.py(CI 用,确保 schema 同步)
5. README.md "Quick Start"(`git clone && docker compose up` 即可跑)
```

**Subsequent Implementation Sequence**(见 Core Architectural Decisions → Implementation Sequence 的 9 步)

---

## Completion Summary

🎉 **恭喜 Jy!ShadowFlow 架构文档 v1.0 完成。**

本次一次性完成 8 个 step:

| Step | 产出 | 基于 |
|------|-----|------|
| 1. Init | 文档初始化,frontmatter 登记 16 份输入 | PRD v0.1 + 8 project docs + 8 research docs |
| 2. Context | 41 FR + 6 NFR 类映射到架构面 + 7 跨切 concern | 真实代码探索(19.7K Python / 35.7K React) |
| 3. Starter | 不引入新 starter,锁定现有工程 | Brownfield 决策 |
| 4. Decisions | 5 Critical + 4 Important + 3 Deferred,Data/Auth/API/FE/Infra 五类 | SSE / BYOK / Docker Compose / 无 DB / Pydantic 单源 |
| 5. Patterns | 命名 / 结构 / 格式 / 通信 / 过程 五类 12 冲突面规则化 | snake↔camel adapter / error envelope / event 命名 |
| 6. Structure | 完整项目树 + 10 MVP 能力到文件映射 + data flow | 既有代码 90% 复用 + ⭐ 标注新增 |
| 7. Validation | Coherence / Coverage / Readiness 三维通过 + Gap 列 | Critical / Important / Nice-to-have 三档 |
| 8. Complete | 本节 | —— |

**核心价值**:

- 任何 AI agent 读完本文档都能写出**风格一致、契约兼容**的代码
- 与 PRD 的估算差异(代码量、PixiJS)已**明确指出**,不留认知陷阱
- MVP 关键路径清晰(Story #0 到 #9),可直接进入 `bmad-create-epics-and-stories`

---

## Document History

- **2026-04-15 · v1.0**:Initial architecture created through `bmad-create-architecture` workflow,一次性完成 8 个 step。基线:PRD v0.1 + 16 份 input docs + 代码探索(`shadowflow v0.3.0` Alpha,19.7K Python + 35.7K React)。关键决策:**不引入新 starter / 保留 7 对象契约 / Policy Matrix 作为 MVP 新增第 8 个核心对象 / SSE 推送看板事件 / BYOK 前端持密钥 / Docker Compose 部署 / ReactFlow 替代 PRD 原计划的 PixiJS**。
- 后续版本:待 `bmad-create-epics-and-stories` / `bmad-check-implementation-readiness` / Sprint 0 完成后驱动更新。
