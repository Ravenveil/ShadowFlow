# ShadowFlow 项目交接文档 · 多智能体协作现状梳理

> 版本:2026-06-11 · 适用分支:`main`
> 阅读对象:接手 ShadowFlow 后端/全栈开发的工程师
> 关键论断后均标注 `源文件:行号`,可直接跳转核对。

---

## 1. 项目概览

**ShadowFlow 是一个面向 ACP(Agent Communication Protocol)时代的「Agent Team 协作平台」**,定位被团队内部概括为「**Agent 的 VS Code**」——做 bottom-up 的基础设施层,让普通用户用三个原语把一群 AI 员工组织起来协作,而不是做一个 top-down 的大统一应用。

三个核心产品原语:

| 原语 | 含义 | 创建动作 |
|---|---|---|
| **Agent**(员工) | `name + soul(persona)` 即上岗的 AI 员工 | 「招人」Quick Hire |
| **Team**(团队) | 一组 agent + 工作流 DAG + 治理矩阵(RACI / PolicyMatrix) | 「组建」 |
| **Chat / Group**(群聊) | 协作发生的场所;「新项目 = 新群聊」 | 建群、拉人 |

顶层还有 **Workspace**(工作区)做隔离容器:agent / team 都归属于具体 workspace,根态(ShadowFlow 容器本身)不展示 agent。

> 上手提示:产品定位、战略下注的完整背景在(本地未跟踪的)`docs/design/shadowflow-strategy-bet-v1.md` 与 `docs/design/` 下若干设计文档。注意 **`docs/` 整个被 `.gitignore` 忽略**,设计文档是本地未跟踪文件;"消失"时用 `git show <commit>:<path>` 从历史恢复,不要当成被删。

---

## 2. 技术架构总览:双后端

ShadowFlow **同时运行两个后端进程**,前端只跟 Node 说话,Node 把不归自己管的请求透明转发给 Python。

```
                    浏览器前端 (Vite dev :3007)
                              │  所有 /api/*
                              ▼
            ┌─────────────────────────────────────────┐
            │   Node Express 网关 (:8002)              │
            │   server/src/index.ts                    │
            │                                          │
            │  自己处理(挂在 proxyFallback 之前):       │
            │   /api/run-sessions  run 会话 + SSE       │
            │   /api/runs          run 记录             │
            │   /api/agents        SQLite agent(Node 侧)│
            │   /api/teams/:id/dag  team DAG(yaml)      │
            │   /api/skills /cli /acp /llm /fs ...      │
            │   /api/groups/:id/messages ← 聊天回复网关  │
            │                                          │
            │  未命中 /api/* ──► proxyFallback ─────────┼──►┐
            └─────────────────────────────────────────┘    │
                                                            ▼
                          ┌──────────────────────────────────────────┐
                          │  Python FastAPI (:8000)                   │
                          │  shadowflow/api/*.py                       │
                          │   teams / groups / inbox / workflows /     │
                          │   agents(JSON) / chat / approvals /        │
                          │   schedules / memory / acp_server / a2a    │
                          │  存储:.shadowflow/**.json(原子写 JSON 文件)│
                          └──────────────────────────────────────────┘
```

要点:

- Node 监听 **8002**,`PORT` 可覆盖;CORS 默认放行前端 `http://localhost:3007`。`server/src/index.ts:43-53`
- proxy-fallback 中间件 **挂在所有自有路由之后、404 catch-all 之前**;target = `PYTHON_BACKEND_URL ?? http://localhost:8000`。`server/src/index.ts:133`、`server/src/proxy-fallback.ts:35-46`
- Express 在转发前会 **重新注入被 `express.json()` 消费掉的请求体**,并 **回补 `/api` 前缀**(Express 把挂载前缀剥掉了)。`server/src/proxy-fallback.ts:46-59`
- **Python 没启动时**,proxy-fallback 不会返回默认的 502 socket 错误页,而是返回结构化 **503 `PYTHON_BACKEND_UNAVAILABLE`** + 启动提示;前端据此弹红色 banner。`server/src/proxy-fallback.ts:60-82`
- proxy 对 SSE 友好:`proxyTimeout: 0 / timeout: 0`,并清掉上游缓存头、加 `x-accel-buffering: no`。`server/src/proxy-fallback.ts:39-40, 83-90`

**为什么双后端?** Python 是早期主体(teams/groups/inbox/workflows/审批等业务逻辑 + JSON 文件存储);Node 后来作为前置网关引入,因为 **本地 CLI 派生(claude/codex/opencode 等)与统一 transport 层(`CliCallable`/`AcpCallable`)只活在 Node**。于是「Node 在前、Python 在后」,既复用 Python 已有业务,又让 Node 接管需要派生子进程 / 流式 / SSE 的能力。

> 故障排查:`/teams 无数据`、`/chat 暂无群组` 类症状,90% 是 Python 后端没起(前端拿 503)。详见 `docs/architecture/dual-backend.md` 与前端 hook `src/core/hooks/usePythonBackendStatus.ts`。

---

## 3. 三原语的数据模型与存储

### 3.1 Agent(员工)

**两套 agent 存储并存,注意区分:**

1. **Python「Quick Hire」agent** — 真正承载「招人」语义的持久化 agent。
   - 存储:`.shadowflow/agents/<agent_id>.json`,原子写(tmpfile + `os.replace` + `fsync`)。`shadowflow/api/agents.py:60, 102-120`
   - `agent_id` 形如 `agent-<uuid12>`。`shadowflow/api/agents.py:377`
   - 关键字段:`shadowflow/api/agents.py:378-389`
     - `name` — 显示名
     - `soul` — **persona/灵魂**,即 system prompt(上限放宽到 8000 字,容纳 run-session 设计期生成的完整 persona)。`agents.py:212-214`
     - `workspace_id` — 归属工作区(默认 `"default"`)
     - `avatar_color` — 头像色,仅接受 `#rgb`/`#rrggbb`,手选才写,否则 `null`(前端按名字 hash 兜底)。`agents.py:206-207, 387-388`
     - `blueprint` — 完整 `AgentBlueprint`(含 `role_profiles[].persona/tools/raci/executor_*`)。`agents.py:332-369`
     - `raci` — 职责桶 → R/A/C/I 分工,组建保存时由前端 `deriveRaci` 派生传入;只接受合法档位,脏值过滤。`agents.py:223, 344-348`
     - `status` ∈ `idle|running|paused|error`(pause/resume 切换,暂停时不烧 token)。`agents.py:514, 536-552`
   - 删除 agent 会 **级联**从所有 team 的 `agent_ids` 里移除(cascade cleanup)。`agents.py:431-463`

2. **Node SQLite agent**(`server/src/storage/agents.ts` + `/api/agents` Node 路由)— run-session 侧使用的 agent 记录,SQLite 落库。两套并非完全统一,是历史技术债之一。

3. **ACP Registry**(运行期在线 agent)— `GET /api/agents/registry`,内存注册表 + 能力清单(manifest / tools / 心跳 / team_memberships),来自 `shadowflow.runtime.acp.registry`。`shadowflow/api/agents.py:36-41, 251-298`。这是「外部 ACP agent 接入」的注册侧,和上面的持久化 quick-hire agent 是两回事。

### 3.2 Team(团队)

- 存储:`.shadowflow/teams/<team_id>.json`,原子写。`shadowflow/api/teams.py:33, 78-96`;`team_id` 形如 `team-<uuid12>`。`teams.py:236`
- 关键字段:`teams.py:237-245`
  - `name` / `description` / `workspace_id`
  - `agent_ids` — 成员(去重保序)
  - `workflow` — `{nodes, edges}` 工作流 DAG(节点带 `data.agentId`,边带 `data.mode/max_retries`)。`teams.py:319-352`
  - `policy_matrix` — `matrix[sender][receiver] ∈ {permit,deny,warn}` 治理矩阵。`teams.py:360-388`
  - `validation_hooks` — **顶层**字段(与 policy/workflow 平级,非嵌套),N1/002 校验钩子。`teams.py:391-443`
- **写时校验(D1/D2)**:`PUT /workflow` 与 `create/patch` 时会:`teams.py:343-352`
  - `_reject_dag` — DAG 结构校验(无环、端点是已知节点、无自环),坏 DAG 返回 **422 `INVALID_DAG`**。`teams.py:149-161`
  - `_reject_missing_agents` — 引用了 store 里不存在的 agent → **422 `AGENT_NOT_FOUND`**。`teams.py:164-182`
  - 校验只在 **本次写入**触发,老的 legacy team 记录照常能 GET(向后兼容)。
- **RACI 与 PolicyMatrix 正交**:RACI 是 agent 的属性(谁负责/谁拍板/谁咨询/谁知会),PolicyMatrix 是团队级的「谁能把产出传给谁」矩阵。两者分别落库,经 `PUT /policy` 才在 TeamPage 可见。

### 3.3 Chat / Group(群聊)

- 存储:`.shadowflow/groups/<group_id>.json`(Python `groups.py` 持有,原子写)。
- 关键字段(从 Node 消费侧可见):`server/src/routes/groups-chat.ts:57-66`
  - `agent_ids` — 群成员 agent
  - `messages[]` — `{sender_name, sender_kind, content}`,`sender_kind ∈ user|agent|system`
  - `kind` — 群类型(群聊 / `dm` 单聊)
  - `workspace_dir` — 用户在群设置里选的 **CLI 工作目录绝对路径**(空=用默认 scratch dir)
  - `team_id` — 群绑定的 team;**有值且 team 可读 → 走 DAG 调度,否则串行降级**
- **单聊(DM)统一为 group**:2026-05-29 起单聊也是一种 `conversation(kind='dm')`,复用群聊后端,能回复 + 持久化。

---

## 4. 多智能体协作机制(本项目当前实现)

这是交接的核心章节。ShadowFlow 当前的「多 agent 协作」由 **三条相互独立的机制**承担,务必分清:

1. **装配期 roster 裁决** — 决定「建几个 agent」(组装环节,见 §4.1)
2. **群聊回复网关 + DAG 编排** — 决定「一条消息进来,哪些 agent 按什么顺序回」(运行环节,见 §4.2–4.4)
3. **run-session + RunBus** — 单个 run 会话的执行与流式重放(见 §4.5)

### 4.1 装配期 roster 裁决(前后端孪生 · 确定性 Rule)

**问题背景**:组装 agent/team 时「几个 agent、什么角色」100% 由 LLM 读 system prompt 自由发挥。用户输入「帮我创建一个开发工程师 agent」,LLM 却扩写成 3 人 team(架构师/全栈/测试)。`server/src/lib/intent-router.ts:168-180`

**解法是「Rule(声明)+ Script/校验(执行)」闭环**:

- **软约束(止血版)**:`detectExplicitSingleAgent(goal)` 检测「一个/单个 agent」且无团队词 → 往 system prompt 追加 `SINGLE_AGENT_DIRECTIVE` 硬指令。`server/src/lib/intent-router.ts:185-233`。但这仍是软约束,LLM 不听照样 emit 3 个节点。
- **硬关卡(执行版)**:`src/lib/assemblyRules.ts` 的 `deriveRosterRule(goal)` → `enforceRoster(agentNodes, rule)`,在 team 真正被装配(RunSession 把 `<sf:node>` 落成 team)那一刻 **确定性截断**多余 agent 节点,不问 LLM。`src/lib/assemblyRules.ts:47-82`

**意图分类**:`intent-router.ts` 还有一个关键词分类器,把 goal 分成 `answer/report/review/workflow × single/team`,优先级 `workflow > review > report > answer`,默认兜底 `(report, team)`。它只分类意图,**不挑 agent**,下游由 Assembler LLM 决定。`server/src/lib/intent-router.ts:110-166`

> ⚠️ **前后端孪生约束**(详见 §7):`src/lib/assemblyRules.ts` 的正则与 `server/src/lib/intent-router.ts` 的 `SINGLE_AGENT_PATTERNS` / `TEAM_INTENT_PATTERN` **必须逐字一致**,改一处必须同步另一处。`assemblyRules.ts:20-28` ↔ `intent-router.ts:185-193`

### 4.2 群聊回复网关(Node 拦截发消息)

**这是「群聊里 agent 怎么开口」的总闸。** 文件:`server/src/routes/groups-chat.ts`。

为什么存在:聊天回复原本由 Python(`chat.py` + `_chat_bridge.py`)生成,但 **Python 只能做 BYOK 直连 LLM,派生不了本地 CLI**(CLI transport 在 Node)。于是把 `POST /api/groups/:id/messages` 交给 Node,挂在 proxyFallback **之前**。`groups-chat.ts:1-27`、`server/src/index.ts:108-113`

> 历史坑:此前只 `import` 未 `app.use`,发消息漏过网关落到 Python,CLI executor 永远走不通。`server/src/index.ts:111-112`

**发一条消息的处理流程**:`groups-chat.ts:376-424`

1. 经 Python 持久化用户消息,带 `X-SF-No-Dispatch: 1` 头 **让 Python 自己的回复 bridge 闭嘴**(回复归 Node 管)。`groups-chat.ts:99, 391-400`
2. 立即 `201` 返回(前端已乐观更新)。`groups-chat.ts:401`
3. **后台 fire-and-forget** 跑 `runFanout()` 生成回复;回复经 Python SSE 总线推回浏览器。`groups-chat.ts:418-422`
4. 只有 `sender_kind:'user'` 触发回复;非 user 写入原样持久化。`groups-chat.ts:408-409`

**executor 决定用什么后端回复**(默认 `anthropic-direct`):`groups-chat.ts:411-416`。executor 字符串语法见 §4.4。

### 4.3 fan-out:串行降级 vs DAG 调度

`runFanout()` 是分叉点:`groups-chat.ts:208-366`

- 读群 → 解析工作目录(`resolveChatWorkspace`,见 §4.4 安全)→ 取成员(**上限 5 个**,`MAX_FANOUT_AGENTS`)。`groups-chat.ts:43, 216-221`
- 无成员 → 落一条 `system` 提示「No agents are members」。`groups-chat.ts:222-229`
- **`shouldRunTeamDag(group)`**(即 `group.team_id` 有值)且 `loadTeamForRun` 能读到有成员的 team → 走 **DAG 拓扑调度**。`groups-chat.ts:77-79, 235-298`
- 否则 → **串行 fan-out 降级**:逐个 agent,每轮重读群历史,让后面的 agent 能看到前面的回复。`groups-chat.ts:301-365`

### 4.4 DAG 执行器(团队拓扑编排)

当群绑定了 team,多 agent 按工作流 DAG 编排执行。核心:`server/src/lib/chat-dag/run-team-dag.ts` 的 `runTeamDagFanout()`。

- **真源读取**:`loadTeamForRun(team_id)` 从 Python 的 `.shadowflow/teams/<id>.json` 读出 `{members, edges, policy_matrix}` 运行形态(`team-source.ts`)。Node 的 `.team.yaml` 只保留坐标布局,**不再是 edges/policy 的来源**。`server/src/lib/team-source.ts:1-8, 36-55`
- **拓扑分层**(`computeDagLayers`,Kahn 算法):同层无依赖可并行、层间有序。`server/src/lib/chat-dag/dag-layers.ts:22-61`
  - `conditional` 边(回归/路由,如 QA→Dev)**排除**出前向拓扑,其 rework 语义留给 Phase 3。
  - 引用非成员的幽灵边、自环 → 丢弃;排除 conditional 后仍成环的坏 DAG → 兜底追加为末层,运行期不崩。
- **逐节点执行**(`run-team-dag.ts:81-144`):
  - 同层经 `mapLimit` 有界并发(默认 5)。
  - 每个下游 agent 的输入 = 用户原始消息 + **上游产出**(`upstream`),上游按 **policy gate** 过滤。
  - **policy gate**(`policy-gate.ts:10-19`):查 `matrix[from][to]`,`deny` 拦截不传递并落 `[policy]` system 提示,`warn` 提醒但放行,缺项默认 `permit`。
  - 每节点经 `runNodeWithPolicy` 跑:**超时**(默认 120s)+ **重试**(入边 `max_retries`,缺省默认 1)+ **外部取消**。`run-team-dag.ts:116-120`
  - 结果落库经 `deps.postMessage`,产出态 `ok|error|empty|timeout|aborted`。
- **插话即取消**:每个 group 持有当前 DAG 运行的 `AbortController`;新一轮 fanout 开始时 `swapDagRun` **abort 上一轮**(用户插话即取消在跑的 DAG)。`groups-chat.ts:45-55, 285-296`

> ⚠️ Phase 2b 已落:并发上限 / 外部取消 / 节点超时 / 重试。**未落**:B2 中断恢复(run 状态落盘 + 重启续跑)、B3 完整插话续跑(当前只做「新消息→取消上一轮」最小语义)、Phase 3 conditional rework / 审核驳回。`groups-chat.ts:231-234`、`run-team-dag.ts:9`

### 4.5 run-session + RunBus(单 run 执行与流式)

与群聊 fan-out 正交的另一条链路:`/api/run-sessions`(`server/src/routes/run-sessions.ts`)处理「单个 run 会话」的执行 + SSE 流式。核心抽象是 **RunBus**(`server/src/lib/run-event-bus.ts`),仿 OpenDesign `runs.ts`:

- **run = 持久实体**:单调编号、带缓冲的事件日志 + 一组可挂/可卸的 SSE 视图。**执行跑一次**,SSE 连接是可重连的「视图」,按游标(`?after`/`Last-Event-ID`)从某处重放。`run-event-bus.ts:1-22`
- 解决两个老问题:重连不再重跑整条 pipeline(stable monotonic id,重放同一批事件,不重复不重跑);N 个重连共享 1 次 LLM 执行,而非 N 次。`run-event-bus.ts:11-19`
- `claimStart(id)` 单次启动守卫:第一个调用者拿 true 去跑,重连者拿 false 只挂载。`run-event-bus.ts:160, 349-354`
- **抗重启**(O2/O4):可注入 `RunPersistence` 把 run 快照落盘;重启后 hydrate,崩溃中断的 run 追加一条合成 terminal error 帧 + 标 `canceled` + `started:true`,只读重放不重跑。`run-event-bus.ts:39-73, 265-344`
- 优雅关闭:`SIGTERM/SIGINT` 取消所有 active run,派生的 CLI/ACP 子进程随之 SIGTERM→SIGKILL,不留孤儿不烧 token。`server/src/index.ts:226-243`、`run-event-bus.ts:460-478`

### 4.6 通信 / 持久化 / 广播

- **持久化单写者**:所有群消息写入都 **委托 Python**(不直接写 JSON),让原子写、schema、路径校验、单写者不变量集中在一个进程。`groups-chat.ts:24-27, 92-109`
- **SSE 广播**:Python 侧 `_group_events.py` 是 **按 `group_id` 分桶的进程内 pub/sub**。后台任务产出的 agent 回复经 `publish_group_event` 推给该群所有订阅者,浏览器实时收到,无需轮询。`shadowflow/api/_group_events.py:43-78`
  - 事件形如 `{type: "agent.message"|"system.notice"|"agent.typing", data}`。`_group_events.py:20-23`
  - **进程内 only**:多 worker 部署下跨进程不可达(与 approval/workflow SSE 总线同款限制),单 uvicorn 进程 MVP 可接受。`_group_events.py:9-18`
  - 满队列丢弃(best-effort,不阻塞 publisher);最后一个订阅者退订时自清桶。`_group_events.py:39-74`
- **CLI 原始 SSE 解析**:CLI/ACP/MCP 经 spawner-bridge 把每个 SSE 事件原样当 `text-delta` 转发(线缆无损);消费侧 `sseWireToText` 只从 `event: text` 块抽 `data.text`(剔除 `raw`/`usage`/`complete`)。BYOK 已是干净文本,原样透传。`groups-chat.ts:126-156`

---

## 5. 关键文件清单

### Node Express(`server/src/`)

| 路径 | 职责 | 注意事项 |
|---|---|---|
| `index.ts` | 入口:挂 12 个自有路由 + proxyFallback + 静态 artifacts;启动期热加载 skills/design-systems、暖 CLI/ACP 探测 | 自有路由必须挂在 proxyFallback **之前** |
| `proxy-fallback.ts` | 未命中 `/api/*` 转 Python;回补 body+前缀;Python 挂了返回 503 | SSE 友好(timeout 0) |
| `routes/groups-chat.ts` | **聊天回复网关**:拦 `POST /api/groups/:id/messages`,跑 fan-out / DAG 生成 agent 回复 | fan-out 上限 5;插话取消 |
| `lib/chat-dag/run-team-dag.ts` | DAG 执行器编排核心(分层 + 并发 + gate + 超时/重试/取消) | Phase 2b;conditional/恢复未落 |
| `lib/chat-dag/dag-layers.ts` | Kahn 拓扑分层 | conditional 边排除 |
| `lib/chat-dag/policy-gate.ts` | `matrix[from][to]` → permit/deny/warn 查表 | 缺项默认 permit |
| `lib/team-source.ts` | team 单一真源读取层(Python JSON → run shape) | edges/policy 真源是 Python JSON,非 yaml |
| `lib/intent-router.ts` | 意图关键词分类 + 显式单 agent 检测(**后端孪生**) | 与 `src/lib/assemblyRules.ts` 同步 |
| `lib/run-event-bus.ts` | **RunBus**:run 事件日志 + SSE 视图 + 抗重启 hydrate | 执行/SSE 解耦 |
| `routes/run-sessions.ts` | run 会话执行 + `/stream` SSE | 配合 RunBus |
| `transport/dispatcher.ts` | executor 字符串 → `LlmCallable` 工厂(cli/acp/mcp/byok/anthropic-direct) | 统一 transport 入口 |
| `transport/CliCallable.ts` / `AcpCallable.ts` / `McpCallable.ts` / `ApiClientCallable.ts` | 四种具体 callable | 只有 Node 能派生 CLI |
| `transport/byokKey.ts` | BYOK key 解析 | 见 §8 双 key 技术债 |
| `storage/agents.ts` / `storage/sqlite.ts` | Node 侧 SQLite agent / run 存储 | 与 Python agent 两套 |
| `routes/cli.ts` / `acp.ts` / `cli-detector.ts` / `acp-detector.ts` | 本地 CLI / 远程 ACP·MCP 自动发现 | 启动期暖缓存 |

### Python FastAPI(`shadowflow/api/`)

| 路径 | 职责 | 注意事项 |
|---|---|---|
| `groups.py` | 群 / 单聊 CRUD + 消息持久化(`.shadowflow/groups/*.json`) | 单写者;Node 委托它落库 |
| `_group_events.py` | 群 SSE 事件总线(按 group_id 分桶 pub/sub) | 进程内 only |
| `_chat_bridge.py` | Python 侧回复 bridge(已被 Node 网关用 `X-SF-No-Dispatch` 旁路) | BYOK 直连,派生不了 CLI |
| `chat.py` | `POST /api/chat/completions` BYOK 直连(zhipu/openai/claude/ollama/deepseek) | 默认 provider zhipu |
| `teams.py` | Team CRUD + workflow/policy/validation-hooks + chat 编辑;写时 DAG/agent 校验 | 422 INVALID_DAG / AGENT_NOT_FOUND |
| `agents.py` | Quick Hire agent(`.shadowflow/agents/*.json`)+ ACP Registry + chat 编辑 | soul/raci/avatar_color;删 agent 级联清 team |
| `team_validation.py` | DAG 结构 / agent 存在性校验逻辑 | 被 teams.py 调用 |
| `workspaces.py` | 工作区 | 取消默认 workspace(A 方案) |
| `inbox.py` / `approvals.py` / `schedules.py` / `memory.py` | 收件箱 / 审批 / 定时 / 河流记忆 | |
| `acp_server.py` / `a2a_bridge.py` | ACP 服务端 / A2A 桥 | 外部协议接入 |

### 前端(`src/`)

| 路径 | 职责 |
|---|---|
| `src/lib/assemblyRules.ts` | 装配期 roster Rule(**前端孪生**) |
| `src/core/hooks/usePythonBackendStatus.ts` | Python 后端健康探测 → 红 banner |
| `src/core/components/inbox/MessageList.tsx` | 消息列表(Inbox 入口) |
| `src/api/groupApi.ts` | 群聊前端 API client |
| `src/pages/` | LandingPage / EditorPage / TemplatesPage / ChatPage 等(受 UI 保护规则约束,只能加不能删) |
| `src/lib/agentAvatar.ts` | 头像色注册表(按显示名取色,真源是后端 `avatar_color`) |

---

## 6. 数据流全链路:一条群聊消息的旅程

```
① 用户在 ChatPage 输入框发消息
        │ POST /api/groups/<gid>/messages  {content, sender_kind:'user', executor, model}
        ▼
② Node groups-chat.ts 拦截(挂在 proxyFallback 前)
        │ pyPostMessage(..., noDispatch:true)  ── 带 X-SF-No-Dispatch
        ▼
③ Python groups.py 原子写用户消息进 .shadowflow/groups/<gid>.json
        │  Node 收到 201 → 立即回前端(乐观更新已就位)
        ▼
④ Node 后台 runFanout()  (fire-and-forget)
        │  读群 → 解析 workspace cwd → 取成员(≤5)
        ├─ group.team_id 有值且 team 可读 ──► runTeamDagFanout()
        │        分层 → 同层并发 → 每节点: gate 过滤上游 → runNodeWithPolicy(超时/重试/取消) → turn()
        └─ 否则 ──► 串行 fan-out:逐 agent,每轮重读历史
        │
        │  每个 agent: resolveCallable(executor).turn({system:soul, prompt, history, signal, model})
        │     executor=cli:claude → 派生 CLI(cwd=workspace);byok:zhipu → 直连;anthropic-direct → Anthropic SDK
        │     sseWireToText() 抽干净文本
        ▼
⑤ Node pyPostMessage(reply, sender_kind:'agent')  ── 经 Python 落库
        ▼
⑥ Python groups.py 写入 agent 回复 + publish_group_event(gid, {type:'agent.message', data})
        ▼
⑦ _group_events.py 推给该群所有 SSE 订阅者
        │  (浏览器经 proxyFallback 转发的 GET /api/groups/<gid>/events 长连)
        ▼
⑧ ChatPage 收到 SSE → 渲染 agent 气泡
```

关键正交点:**执行后端的选择(executor)**与**编排方式(DAG vs 串行)**互相独立——任意 executor 都能跑在任意编排下;**持久化永远经 Python**,**回复生成永远在 Node**。

---

## 7. 前后端孪生 / 同步约束

改动以下成对文件时,**必须在同一个 commit 里同步两端**,否则前后端对同一 goal 得出不同裁决,截断逻辑失效:

| 前端孪生 | 后端孪生 | 同步内容 |
|---|---|---|
| `src/lib/assemblyRules.ts` | `server/src/lib/intent-router.ts` | `SINGLE_AGENT_PATTERNS` / `TEAM_INTENT_PATTERN` 正则,逐字一致 |

规则(出自 `.claude/rules/assembly-rules-sync.md`):

1. 改任意一端的正则/守卫 → 立即同步另一端,同一 commit 提交两个文件。
2. 同步后跑单测:`npx vitest run src/lib/__tests__/assemblyRules.test.ts`(11 个必须全绿)。
3. 跑 `npx tsc --noEmit` 不得引入新报错。
4. commit 描述格式:`fix/feat(assembly): <改了什么> — 前后端孪生同步`。

其它「概念双源」(改一端记得想另一端):

- **team 真源**:edges/policy 真源是 Python `.shadowflow/teams/<id>.json`;Node `.team.yaml` 只剩坐标。改 team 结构语义先看 `team-source.ts` 的映射。`team-source.ts:36-55`
- **fan-out 上限**:Node `MAX_FANOUT_AGENTS=5` 要与 Python `_chat_bridge._MAX_FANOUT_AGENTS` 对齐。`groups-chat.ts:42-43`
- **意图分类器**:`intent-router.ts` 是 `shadowflow/runtime/intent_router.py` 的 1:1 TS 移植(关键词表、优先级、置信度、复杂度都对齐)。`intent-router.ts:1-12`

---

## 8. 已知技术债与坑

1. **BYOK 两套 key 存储未统一**(技术债)。`sf_secrets` vs `_base KEY_STORAGE` 两套存储,配 key 的 UI 与 chat 读取不一致会导致 401。当前只做了「兼容读取」,统一另开一轮。涉及 `transport/byokKey.ts`、`resolveProviderKey`。
2. **agent 两套存储**:Python Quick Hire JSON agent 与 Node SQLite agent 并存,曾导致 quick-hire 没传 `workspace_id` 致刷新后不见 / team `agent_ids` 引用的 agent 两后端都 404(悬空 agent)。新建 agent 强制选 workspace(取消默认 workspace 的 A 方案)修了根因。`agents.py:215, 401-413`
3. **测试必须隔离数据目录**(高频坑)。后端 pytest 用 `TestClient` 时 **必须 monkeypatch `_GROUPS_DIR`/`_AGENTS_DIR`/`_TEAMS_DIR` 到 `tmp_path`**,否则会把 `Test Group`/`Group A` 等测试数据写进真实 `.shadowflow`,污染 dev app(曾产生 41 个垃圾会话)。`agents.py:431-436` 的级联清理已特意跟随 `_AGENTS_DIR` 以便测试隔离时一起隔离。见 `.claude/rules`(测试数据隔离)。
4. **CLI + bypassPermissions + cwd-in-repo 是危险组合**。chat 的 CLI 工作目录默认挪到 **仓库外** scratch dir(`~/.shadowflow-chat/chat-workspaces/<gid>`),避免 `claude` 跟着 git root 读到整个 ShadowFlow 代码库。用户可在群设置用 DirPicker 显式选目录。`permission-mode 不能动,cwd 才是安全杠杆`。`groups-chat.ts:158-189`
5. **SSE 进程内限制**:`_group_events.py` 与 RunBus 都是进程内 pub/sub,多 worker 部署跨进程不可达,目前是单进程 MVP 假设。
6. **DAG 执行器缺口**:中断恢复(重启续跑)、完整插话续跑、conditional rework / 审核驳回(Phase 3 治理链)均未落,都需先 brainstorm 再做。
7. **Edit 后必 tsc 绿再 commit**:历史上连环带病提交过 4 次;改 Node TS 后跑 `npx tsc --noEmit`。改 `groups.py` 后 Python dev server 需重启才生效。
8. **`docs/` 被 gitignore**:设计/规划文档本地未跟踪,本交接文档若要随仓库走需 `git add -f`。

---

## 9. 本地开发与启动

**两个后端 + 前端都要起:**

```powershell
# 1) Python FastAPI :8000(teams/groups/inbox/...)
python -m uvicorn shadowflow.server:app --port 8000
#   或 docker-compose up shadowflow-api

# 2) Node Express 网关 :8002(run-sessions/agents/聊天网关 + 转发)
#    在 server/ 下按 package.json 脚本启动(dev / build+start)

# 3) 前端 Vite :3007
#    npm run dev(根 package.json)
```

健康检查:`GET http://localhost:8002/health`(含 `anthropic_key_configured`)。`server/src/index.ts:66-75`

**关键环境变量**:
- `PORT`(Node,默认 8002)、`PYTHON_BACKEND_URL`(默认 `http://localhost:8000`)、`FRONTEND_ORIGIN`(默认 `http://localhost:3007`)
- `ANTHROPIC_API_KEY`(有则 server-key 模式,无则 BYOK)
- `SHADOWFLOW_CHAT_DIR`(chat CLI scratch 根,默认 `~/.shadowflow-chat`)
- 中国区直连 `api.anthropic.com` 会 403,**spawn 的 claude 子进程需带 `HTTPS_PROXY=http://127.0.0.1:7897`**(本机代理)。

**前端 Story DoD**:前端类改动标 done 前必须起 dev server + 浏览器访问所有路由 + console 零 error;tsc/vitest 绿不算数(曾因 `/editor` `zh is not defined` 翻车)。

---

## 10. 接手者上手路径

**想搞懂「群聊里 agent 怎么回话」** → 从 `server/src/routes/groups-chat.ts` 读起,顺着 `runFanout` → `runTeamDagFanout`(`lib/chat-dag/`)→ `resolveCallable`(`transport/dispatcher.ts`)。

**想搞懂「team 怎么组装 / 治理」** → `shadowflow/api/teams.py`(数据 + 写时校验)+ `server/src/lib/team-source.ts`(运行形态)+ `lib/chat-dag/policy-gate.ts`(治理执行)。

**想改 roster 裁决** → `src/lib/assemblyRules.ts` 与 `server/src/lib/intent-router.ts`(**两端同步** + 跑孪生单测)。

**想搞懂 run 会话流式** → `server/src/lib/run-event-bus.ts`(RunBus)+ `routes/run-sessions.ts`。

**改一个功能要碰哪些文件(经验法则)**:
- 聊天行为 → Node `groups-chat.ts`(+ 可能 `chat-dag/*`)
- 数据模型/持久化 → 对应 Python `*.py`(改完 **重启 Python**)
- 新 executor/transport → `transport/dispatcher.ts` + 新 `*Callable.ts`
- 装配规则 → 前后端孪生两端 + 单测

**铁律**:做完立即 `git commit`(不等用户催);Node 改动先 `tsc --noEmit` 绿;Python 改动重启 dev server;前端改动浏览器亲验。

---

*本文档基于 2026-06-11 `main` 分支真实代码核实编写。所有 `路径:行号` 引用以该时点为准,后续重构后行号可能漂移,以函数/符号名为准定位。*
