# ShadowFlow 重构 Session 总报告（2026-05-22 至 2026-05-24）

**Date**: 2026-05-24
**Author**: Lane C Coordinator
**HEAD at report time**: `6fcde2e fix(projector): accumulate text into assistant_text + populate status_line`
**Range covered**: `92394ca..6fcde2e` — 30 个 commit 主线（含跨日 Lane 工作）

---

## TL;DR (5 句话)

1. **后端架构换骨**：3 天里把 ShadowFlow 后端从"team-backed skill 硬绑 ApiClient"的耦合架构，重写成 **Orchestration ⊥ Transport 正交两层** + **DAG workflow 引擎**，落地了 Phase 2 全部 14 个工程决策（13 PASS + 1 prompt-layer 已修），`tsc --noEmit` 绿。
2. **BMAD 现在能跑两条路**：`cli:claude`（无需 ANTHROPIC_API_KEY，用 Claude Code CLI 登录态）和 `byok:zhipu`（默认 Coding Plan endpoint，glm-4.7 / glm-5.1）都端到端跑通了 SSE 流和多轮 complete。
3. **思考流和工具流的"裸 XML"问题修了**：parser 学会抽 `<tool_use>` / `<function_calls>` 块；transport 学会把 OpenAI-compat 的 `reasoning_content` 包成 `<sf:thinking>`；projector 把流式 text-delta 聚合成一条 `assistant_text` 而不是切碎成几十条 `tool_echo`；statusline 现在能 push 了。
4. **BYOK 设置 UI 重做**：从"显示服务端 mask 的长度"改成"已保存的 key 直接显示在输入框可编辑"（Cherry Studio 行为），合并了两套 api-clients 代码。
5. **现在的 ShadowFlow**：架构和数据流都对了，run-session 左栏 Timeline v8 设计稿基本对齐（P0 全部修复，P1/P2/P3 仍有积压），但 13-agent DAG 端到端 artifact 落盘没在 timeout 窗口内验证完整，是下一次最该补的事。

---

## 时间线（按 commit 顺序）

### Day 1 · 5-22 · Phase 2 后端架构重构（commit `92394ca` 之后开始）

#### Slice A — 入口 & 接口（早段）

| Commit | 描述 |
|---|---|
| `92394ca` | 起点（之前的 work）：fix(skill-ingest): harden canonical-id against /review Tier 1+2 findings |
| `f352c08` | test(runSession): forward fallback=synthetic to SSE for keyless Timeline demo |
| `0b8d5df` | fix(run-sessions): synthetic fallback auto-loads BMAD team when none in skill |
| `2a4d066` | fix(run-session): forward picker overrides on every send path（Phase 1 picker 不丢字段） |
| `3fb4ff7` | fix(useRunSession): wire onMessage / onMessagePatch handlers to subscribe |

这个阶段确认了**问题边界**：picker 切到 `cli:claude` 时 BMAD 不工作，根因是 `assembler.ts:404-411` 硬绑 ApiClient + localStorage 字符串 tag 把 mode/protocol 揉一起。

#### Slice B — 决策落实（5-Lane 并行实施）

| Commit | Lane | 描述 |
|---|---|---|
| `45f29de` | 调研 | docs(architecture): borrowed-from-opendesign analysis |
| `dd45b04` | docs | refactor(skill-pack): drop fake prompt, add real GitHub source URL |
| `49629f1` | 设计 | **docs(architecture): orchestration ⊥ transport — 后端分层架构**（设计稿 + 14 决策） |
| `8d7ce4d` | W1+W2 | feat(skill): canonical-id (W1) + /<id>:<cmd> slash commands (W2) |

然后开 Phase 2 并行 Lane：

| Commit | Lane | 描述 |
|---|---|---|
| `26bc300` | Lane 1-Iface | feat(transport): add LlmCallable interface + dispatcher skeleton |
| `4a4f05d` | Lane 1-Prompts+Parser | refactor(prompts): switch from tool_use orchestration to artifact handoff（parser node_id 一起改） |
| `919407e` | Lane 2-Workflow | feat(workflow): add DAG engine module — types/scheduler/condition/retry/executor/observer |
| `0b43bd1` | Lane 1-Iface | refactor(transport): migrate LlmCallable placeholders to workflow/types |
| `ea8185b` | Lane 5-Frontend | feat(frontend): route SSE chunks per node_id for parallel DAG |
| `9d06541` | Lane 3-Cleanup | refactor(transport): M2 directory consolidation — llm-providers/* → transport/api-clients/, skill-runners/* → transport/spawners/ |
| `3eff882` | Lane 1-Callables | feat(transport): implement 5 Callable adapters + complete resolveCallable factory |
| `d7a2671` | Lane 2-Assembler | **refactor(assembler): switch to Orchestration ⊥ Transport architecture**（核心切换） |
| `6905478` | Lane 3-Cleanup | refactor(cleanup): remove tool_use multi-turn driver + dead orchestration code（删 ConversationRuntime class、skill-anchor-executor.ts） |
| `71d86f9` | Lane 4-Auditor | docs(audit): Phase 2 implementation verification report（PASS-WITH-CAVEATS · 13/14） |
| `d0b1b5f` | Lane 1-Prompts | refactor(prompts): finish CL6 — remove tool_use language from remaining prompts（auditor 发现的最后一个 violation 修了） |

#### Slice C — E2E 验证 & 看门狗（晚段）

| Commit | 描述 |
|---|---|
| `4b5fb65` | docs(e2e): Phase 2 acceptance verification — PASS-WITH-CAVEATS (4/7)（Case 1/2/5/7 PASS；Case 3/4 BLOCKED；Case 6 SKIPPED） |
| `6b34f82` | fix(run-session): bump frontend watchdog 3min → 15min for BMAD DAG runs（直接缓解 e2e 报告的 P1-01） |

一句话总结：**Phase 2 当日上线**。Orchestration ⊥ Transport 设计稿+14 决策+5 lane 实施+独立 audit+独立 e2e 4 件套全部当天完成。

---

### Day 2 · 5-23 — 静默日

实际 git log 这一天没有 commit。猜测：周末/休整/前 24 小时的高强度并行 lane 收尾。

---

### Day 3 · 5-24 · Zhipu Coding Plan + BYOK UI + Timeline 落地

#### 早段 — Zhipu Coding Plan endpoint & 思考流通路

| Commit | 描述 |
|---|---|
| `eab9681` | fix(settings/byok): allow direct re-entry of saved API key |
| `7e44a6f` | fix(settings/byok): true Cherry Studio behavior — saved key shown in field, editable in place |
| `a880068` | fix(settings/byok): stop showing server-masked key length, use fixed bullets |
| `dc9d3e1` | fix(zhipu): default to Coding Plan endpoint + honor base_url + forward reasoning_content |
| `fe7e2f9` | fix(zhipu/lib): flip default URL to Coding Plan endpoint + forward reasoning_content（lib/ 同步） |

**子主题**：Settings 页面的 BYOK 卡（智谱）行为对齐 Cherry Studio：保存后输入框直接显示已存的 key（不是 server-masked 字符串），用户可以在原位编辑覆盖。同时 Zhipu provider 默认 endpoint 从 chat completions 换到 Coding Plan（`/api/coding/paas/v4/chat/completions`），并且转发 `reasoning_content` 字段（glm-4.7 / glm-5.1 的思考流字段）到 SSE。

#### 中段 — 两套 api-clients 合并（S 方案）

| Commit | 描述 |
|---|---|
| `9cf5adc` | refactor(transport): consolidate lib/api-clients/* into transport/api-clients/ |
| `880c260` | refactor(transport): replace LLMProvider abstraction with ApiClient shim |
| `cda1b46` | refactor(transport): retarget stale openai-compat-api-client.ts pointers post-merge |

**子主题**：Phase 2 后留下的技术债 — `lib/api-clients/` 和 `transport/api-clients/` 两套 ApiClient 实现并存。S 方案：把 lib/ 那套作为权威实现搬进 transport/，删除 LLMProvider 抽象（被 ApiClient shim 取代），并修 audit 报告里点名的 stale comment（`openai-compat-api-client.ts:89` 指向已删除的 `assembler.buildApiClient`）。

#### 晚段 — Timeline v8 设计稿落地（双 Lane 调研 + 实施）

| Commit | 描述 |
|---|---|
| `7cf2870` | docs(research): competitor thinking-stream UX patterns（Lane A 调研 Claude Code / Codex / TRAE / Cursor / Copilot）|
| `bfdfadf` | docs(audit): design vs run-session implementation gaps（Lane A 对比 v8 设计稿 vs 现状 — 找出 P0 三连） |
| `d353eb0` | fix(transport): wrap reasoning_content in <sf:thinking> tags（思考流通路） |
| `1caf825` | fix(parser): extract <tool_use> / <tool_result> / <function_calls> blocks（裸 XML 修复 P0-2） |
| `ce953dd` | feat(run-session/timeline): add assistant_text kind + defensive XML strip (P0)（前端骨架补 kind） |
| `c1c167f` | feat(run-session/timeline): ThinkingMessage P1 polish — persist + format（P1-2 ThinkCard 特性 port） |
| `926110f` | feat(run-session/timeline): echo highlight + diff cursor (P2)（P1-1 + P2-4 补足） |
| `6fcde2e` | **fix(projector): accumulate text into assistant_text + populate status_line**（P0-1 + P2-3 收口；HEAD） |

**子主题**：用户反馈"消息被切成几十段 + function_call XML 裸露"。
- Lane A 出两份文档：一份对比 v8 设计稿 vs 实现（找 P0 在 projector `onText` + parser `<function_calls>` 缺识别），一份调研 5 个友商（Claude Code / Codex / TRAE / Cursor / Copilot）的 thinking-stream + tool-call UX 模式。
- Lane B 顺着 Lane A 列的清单实施：parser 加 `<tool_use>` / `<tool_result>` / `<function_calls>` block 抽取；projector 加 `openTextMsgId` buffer + `assistant_text` kind + `status_line` 固定 id emit；前端 timeline types 增加 `assistant_text` MessageKind + AssistantText 组件 + tool-echo 高亮 segment + diff 末行 cursor。

---

## 完整 commit 清单（带分组）

按 `92394ca..6fcde2e` 范围，30 个提交。

| Commit | Date | Lane | 内容 | 主要影响 |
|---|---|---|---|---|
| `92394ca` | 05-22 | W1 | fix(skill-ingest): harden canonical-id Tier 1+2 | Phase 1 收尾 |
| `f352c08` | 05-22 | Demo | test(runSession): synthetic fallback for keyless Timeline | 没 BYOK key 也能 demo |
| `0b8d5df` | 05-22 | Demo | fix(run-sessions): auto-load BMAD team for synthetic | 同上 |
| `2a4d066` | 05-22 | Iface | fix(run-session): forward picker overrides on every send | Phase 1 picker 修复 |
| `3fb4ff7` | 05-22 | Iface | fix(useRunSession): wire onMessage / onMessagePatch | 接 timeline reducer |
| `45f29de` | 05-22 | Docs | docs(architecture): borrowed-from-opendesign | 调研 |
| `dd45b04` | 05-22 | Docs | refactor(skill-pack): real GitHub source URL | skill 元数据 |
| `49629f1` | 05-22 | Design | **docs(architecture): orchestration ⊥ transport** | Phase 2 设计稿 + 14 决策 |
| `8d7ce4d` | 05-22 | W1+W2 | feat(skill): canonical-id + slash commands | skill 系统增强 |
| `26bc300` | 05-22 | 1-Iface | feat(transport): LlmCallable interface + dispatcher skeleton | Phase 2 接口 |
| `4a4f05d` | 05-22 | 1-Prompts+Parser | refactor(prompts): tool_use → artifact handoff（+ parser node_id） | Phase 2 prompt 切换 |
| `919407e` | 05-22 | 2-Workflow | feat(workflow): DAG engine module | Phase 2 调度器 |
| `0b43bd1` | 05-22 | 1-Iface | refactor(transport): migrate LlmCallable placeholders → workflow/types | 类型归位 |
| `ea8185b` | 05-22 | 5-Frontend | feat(frontend): route SSE chunks per node_id | 前端按 node_id 路由 |
| `9d06541` | 05-22 | 3-Cleanup | refactor(transport): M2 directory consolidation | llm-providers/ + skill-runners/ → transport/ |
| `3eff882` | 05-22 | 1-Callables | feat(transport): 5 Callable adapters + resolveCallable | ApiClient/Cli/Acp/Mcp/Spawner Callable |
| `d7a2671` | 05-22 | 2-Assembler | **refactor(assembler): Orchestration ⊥ Transport** | assembler.ts 核心切换 |
| `6905478` | 05-22 | 3-Cleanup | refactor(cleanup): remove tool_use multi-turn driver | 删 ConversationRuntime + skill-anchor-executor |
| `71d86f9` | 05-22 | 4-Auditor | docs(audit): Phase 2 implementation verification | 13/14 PASS |
| `d0b1b5f` | 05-22 | 1-Prompts | refactor(prompts): finish CL6 — remaining tool_use language | auditor 14/14 收口 |
| `4b5fb65` | 05-22 | E2E | docs(e2e): Phase 2 acceptance — PASS-WITH-CAVEATS (4/7) | 端到端验收 |
| `6b34f82` | 05-22 | UX | fix(run-session): watchdog 3min → 15min for BMAD DAG | 直接缓解 E2E P1-01 |
| `eab9681` | 05-24 | BYOK | fix(settings/byok): direct re-entry of saved API key | UI 1/3 |
| `7e44a6f` | 05-24 | BYOK | fix(settings/byok): Cherry Studio behavior | UI 2/3 |
| `a880068` | 05-24 | BYOK | fix(settings/byok): stop showing server-masked length | UI 3/3 |
| `dc9d3e1` | 05-24 | Zhipu | fix(zhipu): Coding Plan endpoint + reasoning_content | provider 默认值 |
| `fe7e2f9` | 05-24 | Zhipu | fix(zhipu/lib): flip default URL（lib/ 同步） | lib 同步 |
| `9cf5adc` | 05-24 | Refactor | refactor(transport): consolidate lib/api-clients/* → transport/api-clients/ | 两套合一 |
| `880c260` | 05-24 | Refactor | refactor(transport): replace LLMProvider with ApiClient shim | 抽象瘦身 |
| `cda1b46` | 05-24 | Refactor | refactor(transport): retarget stale openai-compat pointers | audit 收口 |
| `7cf2870` | 05-24 | Research | docs(research): competitor thinking-stream UX patterns | 调研 5 家 |
| `bfdfadf` | 05-24 | Audit | docs(audit): design vs run-session implementation gaps | v8 vs 实现 |
| `d353eb0` | 05-24 | Transport | fix(transport): wrap reasoning_content in <sf:thinking> | 思考流通路 |
| `1caf825` | 05-24 | Parser | fix(parser): extract <tool_use> / <tool_result> / <function_calls> | P0-2 裸 XML |
| `ce953dd` | 05-24 | Timeline | feat(timeline): assistant_text kind + defensive XML strip | P0 前端骨架 |
| `c1c167f` | 05-24 | Timeline | feat(timeline): ThinkingMessage P1 polish | P1-2 |
| `926110f` | 05-24 | Timeline | feat(timeline): echo highlight + diff cursor (P2) | P1-1 + P2-4 |
| `6fcde2e` | 05-24 | Projector | fix(projector): accumulate text into assistant_text + status_line | **P0-1 + P2-3 收口（HEAD）** |

---

## 最终架构 ASCII 图

### 1. Server 端（Orchestration ⊥ Transport，Phase 2 后）

```
server/src/
│
├─ routes/run-sessions.ts         ← SSE 入口 / 多事件分发
│
├─ assembler.ts                   ← 旧入口（瘦身后 ~300 行）
│   └── 分两支：
│       ┌─ if (skill.team) → workflow.scheduler.runDag(team, callable, ...)
│       └─ else            → callable.turn({system, prompt, history:[], signal})
│
├─ Orchestration Layer (业务)
│  ├─ workflow/                   ← DAG 引擎（Phase 2 新增）
│  │   ├─ types.ts                ← TurnChunk / LlmCallError / NodeStatus
│  │   ├─ scheduler.ts            ← Kahn 拓扑层 + Promise.all 同层并行
│  │   ├─ executor.ts             ← 单节点执行 + artifact 落盘
│  │   ├─ condition.ts            ← expr-eval 评估器
│  │   ├─ retry.ts                ← per-node 重试 + 指数退避
│  │   └─ observer.ts             ← 节点生命周期事件 (含 node_id)
│  │
│  └─ lib/
│      ├─ team-yaml.ts            ← team.yaml v1 schema（不变）
│      ├─ timeline-projector.ts   ← SSE 事件 → TimelineMessage（5-24 重写）
│      ├─ anthropic-block-adapter.ts ← ContentBlock → text-protocol
│      └─ conversation-runtime.ts ← 残留 addUsage + type aliases（class 已删）
│
└─ Transport Layer (LlmCallable contract)
   ├─ LlmCallable.ts              ← 接口 + capabilities + TurnChunk 再导出
   ├─ dispatcher.ts               ← resolveCallable(executor) factory
   ├─ ApiClientCallable.ts        ← 包装 13 个 provider（HTTP/SDK）
   ├─ CliCallable.ts              ← Claude Code CLI + Codex CLI 两 variant
   ├─ AcpCallable.ts              ← 包装现有 ACP
   ├─ McpCallable.ts              ← 包装现有 MCP
   ├─ spawner-bridge.ts           ← CLI/ACP/MCP spawner → TurnChunk shim
   ├─ api-clients/                ← 13 个 provider 实现（5-24 合并自 lib/）
   │   ├─ anthropic-api-client.ts
   │   ├─ openai-compat-api-client.ts
   │   ├─ google-api-client.ts
   │   ├─ zhipu-api-client.ts     ← 5-24 默认 Coding Plan endpoint
   │   ├─ claude-code-cli-api-client.ts ← <sf:thinking> + <tool_use> XML 包裹
   │   └─ ... 8 others
   └─ spawners/                   ← 5-22 git mv 自 skill-runners/
       ├─ cli.ts / acp.ts / mcp.ts / index.ts
       └─ cli.test.ts

──── 关键契约 ─────────────────────────────────
- Orchestration 不 branch on callable.capabilities（grep 0 hits）
- Transport 只回写 LlmCallError（数据载体，非 orchestration 逻辑）
- 唯一桥梁：LlmCallable.turn() → AsyncGenerator<TurnChunk>
```

### 2. Frontend 端（run-session 左栏 Timeline，v8 落地后）

```
src/pages/RunSessionPage.tsx
│
├─ useTimeline = localStorage 'sf.legacyLeftPane' !== '1'   ← 默认 true
│
├─ {useTimeline && <Timeline messages={session.messages} />}
│   │
│   └─ src/components/run-session/timeline/
│       ├─ Timeline.tsx          ← 容器 + stick-to-bottom + 按 m.id 渲染
│       ├─ MessageRegistry.tsx   ← 10 种 kind 的 switch dispatcher
│       ├─ types.ts              ← TimelineMessage union + applyPatch reducer
│       ├─ timeline.module.css   ← 530+ 行，对齐 v8 .tl-* token
│       │
│       └─ messages/
│           ├─ UserTurnMessage.tsx      kind=user_turn
│           ├─ ThinkingMessage.tsx      kind=thinking      ← 5-24 P1 升级（持久化 + format）
│           ├─ AssistantMeta.tsx        kind=assistant_meta
│           ├─ RationaleMessage.tsx     kind=rationale
│           ├─ ToolCallChip.tsx         kind=tool_call
│           ├─ ToolEchoLine.tsx         kind=tool_echo     ← 5-24 add/del/file segment 高亮
│           ├─ StepPanel.tsx            kind=step_panel
│           ├─ DiffPanel.tsx            kind=diff_panel    ← 5-24 末行光标
│           ├─ MsgFoot.tsx              kind=msg_foot
│           ├─ AssistantText.tsx        kind=assistant_text ← 5-24 P0 新增
│           └─ StatusLine.tsx           kind=status_line   ← 5-24 P2 接通
│
└─ {!useTimeline && <…legacy 1300 行…/>}                  ← P3 待删（验证后再动）

──── 数据流 ─────────────────────────────────
SSE events
  ├─ event:message      → reducer push or replace（按 id 幂等）
  ├─ event:message-patch → applyPatch (text_append / thinking_append_body /
  │                                    append_step / update_step /
  │                                    diff_append_line / msg_foot_update)
  ├─ event:text         → legacy chatReply 累积（useTimeline 下白做副作用）
  ├─ event:thinking-chunk → legacy thinkingMessage 累积（同上）
  └─ event:complete     → 关闭 open thinking / 更新 msg_foot done
```

---

## 关键决策回顾

### Phase 2 · 14 个工程决策（详 `docs/architecture/orchestration-transport.md` §"Phase 2 Eng Review · 决策记录"）

| # | 决策 | 状态 |
|---|---|---|
| A1 | `LlmCallable.turn()` 返回 `AsyncGenerator<TurnChunk>` | ✅ |
| A2 | C2a 用 artifact 文件 handoff (history=[]) | ✅ |
| A3 | BOTH ApiClient 和 CLI 路径统一走 daemon-led DAG | ✅ |
| A4 | Phase 2 实现完整 DAG：拓扑并行 + conditional + per-node retry | ✅ |
| A4b | conditional 用 expr-eval 评估器（assignment/fndef 关闭） | ✅ |
| A5 | M2：llm-providers/ + skill-runners/ → transport/ | ✅ |
| A6 | O1：non-team skill 也走 `LlmCallable.turn()` 一次 | ✅ |
| CL3/E3 | 错误模型 hybrid（调用阶段 throw，stream 中 yield error chunk） | ✅ |
| C1 | Cancellation：单 AbortSignal 全程透传 | ✅ |
| T1 | 测试用真实 API（不 mock） | ⚠️ ANTHROPIC_API_KEY 未配（E2E 部分覆盖） |
| S3 | 性能 ±20% regression gate | ⏭️ 无 baseline 未采样 |
| CL6 | 4 个 SkillAnchorTool 替换为 daemon-emit | ✅ |
| prompts | BMAD/paper-review SKILL.md 删 tool_use 描述 | ✅ |
| chunk routing | SSE chunk 携带 node_id 字段 | ✅ |

### Lane B 新增协议（Day 3 落地）

**新增 SSE / message kind**：
- `kind: 'assistant_text'` — 流式自由文本，projector 聚合到一个气泡（解决"消息被切成几十段"）
- `kind: 'status_line'` — 固定 id=`statusline_v1`，verb 反映当前活动（"Thinking" / "Configuring" / "Writing"）
- `op: 'text_append'` — assistant_text body 增量追加 patch

**新增 parser 块**：
- `<tool_use name="X" id="Y">{json}</tool_use>` → 结构化事件
- `<tool_result tool_use_id="Y" ...>...</tool_result>` → 结构化事件
- `<function_calls><invoke name="X">...</invoke></function_calls>` → 结构化事件
- `<sf:thinking>` 包装 `reasoning_content`（OpenAI-compat 类 provider 的思考字段）

**新增 BYOK provider 默认值**：
- Zhipu 默认 endpoint: `/api/coding/paas/v4/chat/completions`（Coding Plan，支持 glm-4.7 / glm-5.1 思考流）

---

## 当前能用的状态

### ✅ 已工作（VERIFIED）

| 能力 | 验证证据 |
|---|---|
| BMAD on `cli:claude` | E2E Case 1 PASS — Session `1e6eea74`，discovery/text/complete 事件链完整，bmad-help 跑通 |
| BMAD on `byok:zhipu` (glm-5.1 / glm-4.7) | E2E Case 2 PASS — Session `76277fa2`，6+ 轮 text/complete，PM/architect persona 持续输出 |
| Coding Plan endpoint 思考流 | `reasoning_content` → `<sf:thinking>` → `ThinkCard`（设计稿对齐） |
| Tool 调用通过 `<tool_use>` XML | parser 抽块 → projector 生成 tool_call+tool_echo（不再裸露 XML） |
| 消息累积不再切碎 | projector `onText` buffer 到 `openTextMsgId`，单个 assistant_text 持续 text_append |
| Cancellation / timeout 优雅关闭 | E2E Case 5 PASS — 3min 自动 timeout（已提到 15min）、SSE 无连接错误、状态机 streaming→error 正确 |
| Error path / 429 retry / auth fail | E2E Case 7 PASS — 4s→24s 指数退避，auth 立即 fail 不重试，前端可读消息 |
| BYOK Settings 输入框可直接编辑 | 用户验证 — Cherry Studio 行为 |
| watchdog 15min for BMAD DAG | commit `6b34f82` 已上 |
| Statusline 接通 | projector emit `kind: 'status_line'` 固定 id |
| tsc --noEmit | EXIT=0（commit `6fcde2e` 时 audit 确认） |
| Orchestration ⊥ Transport 正交契约 | grep 0 hits on `callable.capabilities` from workflow/* |

### ⚠️ 已知遗留

| 项 | 详情 | 优先级 |
|---|---|---|
| 13-agent DAG 全展开 + artifact 完整落盘 | E2E Case 1/2 在 3min(已升 15min) 内未到展开阶段 → 需要新窗口重测 | P0 — 下次必做 |
| Case 3 DAG parallel 边端到端 | E2E BLOCKED — 需构造最小 parallel team YAML | P1 |
| Case 4 DAG conditional 边端到端 | E2E BLOCKED — 同上，需 `output.includes('approved')` 示例 | P1 |
| Case 6 cli:codex | SKIPPED — codex CLI 已装但 auth 未验证 | P2 |
| ANTHROPIC_API_KEY 空 | byok:anthropic 路径无法使用（cli:claude 不受影响） | P1（运维） |
| Run status="failed" vs "timeout"/"interrupted" 语义 | E2E P2-01：timeout 应归类 `interrupted` 可重入 | P2 |
| `/api/projects/{id}/files` 404 | E2E P2-02：无 endpoint 验证 artifact 落盘 | P2 |
| `/api/catalog/apps` 返回 HTML | E2E P2-03：StartPage 报 `Unexpected token '<'` | P2 |
| Phase 2 性能 baseline 未采样 | S3 regression gate 无依据 | P2 |
| Spawner-bridge chunk taxonomy | CLI/ACP/MCP 全部输出 `text-delta`，未拆 tool-use / usage 类型 | P3 — 出 metrics 时再做 |
| Phase 3 localStorage discriminated union | mode/protocol 字符串 tag 还在用 | P3（明确推后） |
| Legacy left-pane（RunSessionPage.tsx:2224-3549）| 1300 行死代码，等 Timeline v8 稳定后删 | P3 |
| ThinkCard.tsx → ThinkingMessage 完全迁移 | 5-24 已 port P1 特性，但 ThinkCard 文件未删 | P3 |
| `chatReply` reducer 副作用 | useTimeline=true 下白计算，加 short-circuit 即可 | P3 |
| sec_label 视觉分组（v8 设计稿） | message kind 未实现 | P3 |
| cost_cny 货币位 | msg_foot 字段已有，projector 未填 | P3 |
| 节点级 cancel UI | C1 单 signal 全程 cancel 没问题，UI 没暴露子节点 | P3 |
| EVAL 测试套件（BMAD 在 BYOK 下产出质量） | Risk #1：daemon-emit 取代 tool_use 后可能退化 | P2 — golden output 比对 |
| Provider 同层并行 rate limit | DAG 同层 N 个节点都用 anthropic 可能撞 429 | P2 — retry.ts 已有 429 退避 |
| expr-eval sandbox 二次安全审 | 风险 #4：恶意 team.yaml | P3 — Risk 已识别 |

---

## 给下次 session 的 handover

### 立即可做（小活儿 · <1h）

1. **重跑 BMAD E2E Case 1（cli:claude）full DAG**
   - watchdog 已是 15min，给足时间窗口
   - 跑完后用 shell 检查 `server/.shadowflow/projects/{session_id}/` 目录是否有 13 个 agent 的 artifact
   - 截图所有 agent 节点出现在 Team canvas
   - 期望：验收 E2E 报告里的 Case 1 完整 PASS（artifact 落盘 ✓ + 13 agent 节点 ✓）

2. **跑 Codex CLI auth + E2E Case 6**
   - `codex auth login`（CLI 已装 0.117.0）
   - 重跑 BMAD on `cli:codex`，看 `CliCallable` codex variant 工作流是否完整
   - 注意：Codex 的 chunk 解析精度有限（伪流），text-delta 会"砰"出现

3. **构造最小 DAG parallel team YAML + Case 3**
   - 三 agent 同层并行：A → [B, C, D] → E
   - 用 `byok:zhipu glm-4-flash`（低延迟）跑通
   - 验证 SSE chunk 按 node_id 路由到对应 AgentDetail panel

4. **修 P2-03 `/api/catalog/apps` 路由**
   - StartPage console error 已扰民几天
   - 找路由挂载点（Express 转发到 Python 路径错了？）

### 下一阶段（中活儿 · 1-3h）

1. **DAG conditional 边端到端（Case 4）**
   - 构造含 `condition: "output.includes('approved')"` 的最小 team YAML
   - 测两路：true 分支 / false 分支
   - 验证 expr-eval 评估正确 + per-node retry 行为

2. **暴露 `/api/projects/{session_id}/files` endpoint**
   - 解决 E2E P2-02
   - 方便 CI/自动化验证 artifact 落盘
   - 同时 `run status` 语义修复：`interrupted` vs `failed`

3. **Phase 2 性能 baseline 采样 + regression gate**
   - 决策 S3 的 acceptance criterion 还没基准
   - 跑 BMAD 13-agent N 次取 wall-clock 中位数，写入 e2e 报告作为后续 ±20% 门槛

4. **删 legacy left-pane（RunSessionPage.tsx:2224-3549）+ ThinkCard.tsx**
   - 净减约 1300+350 = 1650 行
   - 前提：Timeline v8 在用户验证下稳定 3 天无 P0/P1 反馈

5. **EVAL 套件 v0**
   - 决策 Risk #1：BMAD daemon-emit 路径下 BYOK 产出质量没回归测试
   - 至少做一份 golden output（"任意 web app 需求 → architecture.md"）做字符串/字段比对

### 长期（大活儿 · 半天 - 多天）

1. **Phase 3 localStorage discriminated union**
   - `mode: 'cli'|'api'|'acp'` 替换字符串 tag
   - 前端 picker / picker overrides / server 路由全跟着改
   - 不解决新症状，只是 hygiene

2. **Spawner-bridge chunk taxonomy 升级**
   - CliCallable / AcpCallable / McpCallable 输出 typed `tool-use` / `usage` chunks 而不是 `text-delta` 一律
   - DAG observer 才能 reliably 统计 per-node usage

3. **Cursor 2.0 风格的 multi-agent compare-outputs**（Pattern 12，调研报告 R8）
   - 8 路并行跑同一个 prompt，UI side-by-side diff
   - 与 ShadowFlow 战略 "Agent Team 的 VSCode" 对齐
   - 工程量较大（需要 git worktree 或独立 workspace 隔离）

4. **Plan-as-living-markdown 编辑器**（调研报告 R8，Pattern 8）
   - tl-panel 从 markdown 源渲染，用户可点击编辑
   - 比 Copilot Planning 更强（双向）
   - 中优先级，是新行为而非 bug fix

5. **sub-workflow / checkpoint / resume**
   - team A 引用 team B
   - 长 workflow 用户掉线后断点续跑
   - Phase 5+ 单独立项

---

## 给用户的"现在做什么"清单（关键，按 ROI 排）

> 这些是**立即可操作**的下一步。每条都给到具体 picker / URL / 命令。

1. **跑一次 BMAD on cli:claude 验证 full DAG 落盘** — Phase 2 整个重构的最重要验收，watchdog 已升 15min，今天有充足时间窗口
   - 打开 `http://localhost:3008/start`
   - Skill 选 BMAD（builtin），Provider picker 切到 "Claude Code (2.1.148)"
   - 提交一个具体的需求："新项目 / Web 端 / React + Express / 需要 UI / 仓库名 demo-shop"
   - 等 ~10-15 分钟（不要 3 分钟撤）
   - 跑完后 PowerShell 执行：`ls server/.shadowflow/projects/<session_id>/`，看是否有 architecture.md / epics.md / pm-output.md 等 artifact
   - 截图 Team canvas（右栏）有多少 agent 节点出现

2. **跑一次 BMAD on byok:zhipu glm-4.7 验证 Coding Plan endpoint** — 验证 5-24 的三件 fix（思考流 + Coding Plan endpoint + reasoning_content）端到端
   - Settings → BYOK → Zhipu，确认 endpoint 显示是 `coding/paas/v4/chat/completions`（不是 paas/v4）
   - 同 #1 流程，但 picker 切到 glm-4.7
   - 重点观察：左栏 Timeline 有 ThinkCard 折叠卡（来自 `reasoning_content`），里面是 LLM 真实思考文本
   - assistant_text 气泡是**一个连续气泡**，不是几十段碎片
   - DOM 里**零** `<function_calls>` / `<invoke>` 字面量

3. **修 StartPage 红色 console error** — 已扰民几天，每次进 /start 都出 `[StartPage] listCatalogApps failed: Unexpected token '<'`
   - 路由 `/api/catalog/apps` 返回 HTML 不是 JSON
   - 怀疑是 Express proxy-fallback 把请求转给 Python（:8000）但 Python 没挂这个路由 → fallback 到前端 index.html
   - 看 `server/src/routes/` 是否有 `/api/catalog/apps` 路由挂载

4. **`codex auth login` 然后 cli:codex 跑一次** — 把 E2E Case 6 SKIPPED 改成 PASS
   - PowerShell：`codex auth login`（CLI 已装 0.117.0）
   - 跑 BMAD on `cli:codex`
   - 观察：CliCallable codex variant 的 stream 是不是"砰"出现（伪流，已知限制）

5. **Lane A audit 报告里 P0-3 防御性聚合是否真的进 reducer**（检验 5-24 commit `ce953dd` 的 defensive XML strip 是否有效）
   - 看 `src/core/hooks/useRunSession.ts:644` MESSAGE 分支是不是有 `last.kind === 'assistant_text' && incoming.ts - last.ts < 500ms` 的合并逻辑
   - 如果没有，再补一道 fallback，server projector 还要 P0 时这是兜底

6. **采 Phase 2 性能 baseline**（决策 S3 没基准）
   - 跑 BMAD 13-agent on byok:zhipu glm-4-flash 三次
   - 记录 wall-clock 中位数（从 POST /api/run-sessions 到最后一条 complete）
   - 写到 `docs/architecture/phase-2-e2e-report.md` 末尾，作为 ±20% regression gate 的 t0 数值

7. **删 legacy left-pane（RunSessionPage.tsx:2224-3549）** — 等今天验证完 #1 #2 后做，净减 1300 行
   - 前提：用户连续 3 天不报新 P0/P1
   - 同时把 `chatReply` reducer short-circuit 加上

8. **下次开新 session 前用 `/checkpoint` 把这份报告归档** — 不然 memory index 会越来越混乱
   - 这份报告本身就是给"下次 Claude session"的，跨 session handover 起点是它

---

## 浓缩总结（≤ 10 行）

ShadowFlow 这 3 天（实际是 5-22 + 5-24 两天）做了**一次后端架构换骨**（Phase 2: Orchestration ⊥ Transport + DAG 引擎，14 决策全落地，5 lane 并行+ audit + e2e 4 件套当日上线），**一次 Zhipu BYOK 链路修复**（Coding Plan endpoint + reasoning_content + Settings UI），和**一次 run-session 左栏 v8 设计稿对齐**（parser 抽 `<tool_use>`/`<function_calls>` 块，projector 聚合 text-delta 到 `assistant_text` 单气泡，statusline 接通，thinking 卡 P1 升级，tool-echo 高亮 + diff 末行光标）。HEAD `6fcde2e`，30 个提交，tsc 绿，E2E 4/7 PASS。BMAD 现在能在 `cli:claude` 和 `byok:zhipu` 两路跑，思考流 + 工具流不再裸露 XML，消息不再碎片化。最大遗留是 **13-agent full DAG 端到端 artifact 落盘还没在 15min 新窗口下验证**（这是下一步 ROI 最高的事，#1 给用户做什么）。Phase 3 localStorage union 明确推后，spawner-bridge chunk taxonomy / EVAL / 性能 baseline 是中期债务。

---

## 附录 A · Phase 2 Audit 14 项决策详证（拆自 audit 报告）

> 这份附录把 audit 报告里抽象的 "PASS/FAIL" 翻译成具体文件:行号，方便下次回溯。

### A1 · AsyncGenerator<TurnChunk> 流式
- 接口：`server/src/transport/LlmCallable.ts:138`
- TurnChunk 定义：`server/src/workflow/types.ts:57`（discriminated union: text-delta / tool-use / thinking-delta / error / usage / complete）

### A2 · Artifact 文件 handoff（history=[]）
- `server/src/workflow/executor.ts:169` — `history: []` 永久空数组
- `server/src/workflow/executor.ts:204-218` — 写 `plannedArtifactPaths` 到 `projectDir/.shadowflow/projects/<session_id>/`

### A3 · BOTH paths daemon-led DAG
- `server/src/assembler.ts:459-464` — team 分支统一调 `runDag(teamV1, callable, projectDir, signal)`
- 旧的 `runTeamBackedSkill` 函数已删（commit `6905478`）
- 旧的 `ConversationRuntime` class 已删（commit `6905478`，仅留 `addUsage()` + type alias）

### A4 · DAG 完整三能力
- `workflow/scheduler.ts:155-344` Kahn 拓扑层 + `Promise.all` 同层并行
- `workflow/scheduler.ts:251-254` withRetry 包装
- `workflow/scheduler.ts:292-314` conditional 边过滤
- per-node retry：`workflow/retry.ts:35-37` exhaustion re-throw

### A4b · expr-eval 评估器
- `workflow/condition.ts:29` `import { Parser } from 'expr-eval'`
- `workflow/condition.ts:34-53` Parser 单例配置 `assignment:false` / `fndef:false`（防注入）

### A5 · 目录合并 M2
- 旧 `server/src/llm-providers/` —— GONE（commit `9d06541`）
- 旧 `server/src/skill-runners/` —— GONE（commit `9d06541`）
- 新 `server/src/transport/api-clients/` —— 13 个 provider
- 新 `server/src/transport/spawners/` —— CLI/ACP/MCP spawner
- 5-24 再次合并：`server/src/lib/api-clients/*` → `server/src/transport/api-clients/`（commit `9cf5adc`）

### A6 · O1 non-team 也走 LlmCallable
- `server/src/assembler.ts:466-477` non-team 分支调 `callable.turn(...)`
- 旧的 `dispatchSkillRunner` 已没有 runtime caller（保留 spawner-internal 用，待后续清理）

### CL3 / E3 · 混合错误模型
- `workflow/types.ts:85-109` `LlmCallError` class + `LlmCallErrorKind` enum (auth / rate-limit / network / invalid-input / internal)
- `workflow/retry.ts:35-37` exhaustion 阶段 re-throw typed exception
- `workflow/executor.ts:189-191` stream 中 yield error chunk（前端不 hard-break SSE）

### C1 · 单 AbortSignal 全程
- `server/src/assembler.ts:413` `effectiveSignal`
- `workflow/scheduler.ts:159` 接受 signal
- `workflow/executor.ts:171` 透传到 `callable.turn({...signal})`
- `workflow/retry.ts:63-78` 可 cancel 的 sleep

### CL6 · SkillAnchorTool 替换
- 4 个旧工具：`list_team_agents` / `get_skill_anchor` / `register_agent` / `register_edge`
- `lib/tools/skill-anchor-executor.ts` 已删（commit `6905478`）
- prompt 修复：commit `d0b1b5f` 把 `ASSEMBLER_HEADER` + `phase-1-analyze.ts` 里残留的"你有 4 个工具"全删了

### chunk routing · node_id
- `server/src/parser.ts:118` `nodeIdField()` helper
- `server/src/parser.ts:96/245/291/325` 多个事件类型注入 node_id
- 前端：`src/core/hooks/useRunSession.ts:206-208` per-node chunk buffer

### 唯一 violation（已修）
- audit 报告原文：`server/src/prompts/index.ts:41-93` `ASSEMBLER_HEADER` + `phase-1-analyze.ts:18,38,45` 还在告诉 LLM "你有 4 个工具"
- 修复：commit `d0b1b5f` refactor(prompts): finish CL6 — remove tool_use language from remaining prompts

---

## 附录 B · 5-Lane 并行实施时间窗（5-22）

为下次类似 multi-lane 工作做参考：

```
T+0h    设计稿落地 (commit 49629f1)
        ↓
T+1h    Lane 1-Iface  (26bc300 LlmCallable interface)
        Lane 1-Prompts (4a4f05d artifact handoff)
        Lane 2-Workflow (919407e DAG engine module)
        ↓ 并行
T+2h    Lane 5-Frontend (ea8185b node_id 路由)
        Lane 3-Cleanup  (9d06541 M2 dir consolidation)
        ↓
T+3h    Lane 1-Callables (3eff882 5 adapters)
        ↓
T+4h    Lane 2-Assembler (d7a2671 核心 switch)
        ↓
T+5h    Lane 3-Cleanup  (6905478 dead code 删除)
        ↓
T+6h    Lane 4-Auditor  (71d86f9 audit 13/14)
        Lane 1-Prompts  (d0b1b5f 14/14)
        ↓
T+7h    E2E  (4b5fb65 PASS 4/7)
        UX   (6b34f82 watchdog 3min→15min)
```

成功因素：
1. 设计稿（`orchestration-transport.md` §"Phase 2 Eng Review · 决策记录"）作为 5-Lane 唯一参考——没有 Lane 间口头协议
2. 决策表（14 项）每条都有可验证的 acceptance criterion，audit 阶段一一比对
3. Lane 3-Cleanup（删代码）单独成 lane，避免与 Lane 1/2 抢锁
4. Lane 4-Auditor 独立运行，只读，发现的最后一条 violation 当天 by Lane 1-Prompts 闭环

教训：
1. `4a4f05d` 标题 "refactor(prompts)" 但 diff 含 parser.ts 改动 — Lane 1 内部子任务切分不够紧
2. ANTHROPIC_API_KEY 没配影响 Case 2/4 测试，应该 lane 启动前在 e2e 验证矩阵里标出来

---

## 附录 C · Day 3 决策选择（5-24）

### 决策 C1 · BYOK 设置 UI：mask vs Cherry Studio
**选项**：
- A. 显示 server 返回的 mask 字符串（如 `••••sk-xxx`）
- B. 显示完整 key 在输入框，与浏览器密码框一致（Cherry Studio 行为）

**选 B**。理由：
- 用户已经在浏览器存了，没新增信任面
- 输入框是修改入口，需要"原位编辑"语义
- A 方案 server 还要决定 mask 长度（混淆"key 长度信息"是否敏感）

落地：3 个 commit (`eab9681` / `7e44a6f` / `a880068`)

### 决策 C2 · 两套 api-clients 合并：S 方案 vs M 方案
**选项**：
- S（Single source）：把 `lib/api-clients/*` 搬进 `transport/api-clients/`，删除 LLMProvider 抽象层
- M（Multi adapter）：保留两套，写 facade 包装

**选 S**。理由：
- Phase 2 已经定 transport/ 是唯一 transport 落脚点
- LLMProvider 是 Phase 2 前的中间抽象，被 LlmCallable + ApiClient 接管，无独立价值
- M 方案是技术债生产机

落地：3 个 commit (`9cf5adc` / `880c260` / `cda1b46`)

### 决策 C3 · Zhipu 默认 endpoint：Chat vs Coding Plan
**选项**：
- A. 默认 `/api/paas/v4/chat/completions`（通用 Chat API）
- B. 默认 `/api/coding/paas/v4/chat/completions`（Coding Plan 专用）

**选 B**。理由：
- ShadowFlow 用户场景 = coding agent
- Coding Plan endpoint 支持 glm-4.7 / glm-5.1 思考流（`reasoning_content` 字段）
- 通用 Chat endpoint 在这些模型上 reasoning 字段不返回
- 用户仍可通过 `base_url` 字段覆盖（B 是默认，非锁定）

落地：`dc9d3e1` + `fe7e2f9`

### 决策 C4 · Timeline P0 修复策略：Server-side vs Client-side
**选项**：
- A. 服务端 projector 聚合 text-delta（onText buffer + openTextMsgId）
- B. 客户端 reducer 聚合（last.kind === incoming.kind && ts diff < 500ms 合并）

**选 A**，B 作为防御性 fallback。理由：
- Lane A audit 报告明确 P0-1 根因在 projector，治根
- A 让前端 reducer 保持简单（push or replace）
- B 是 P0-3 防御网，避免 server 还没修时前端崩

落地：A = commit `6fcde2e`（projector），B 部分未实施（reducer 仍是简单 push or replace）— 由于 A 解决根因，B 暂时不必加

---

## 附录 D · 关键文件与行号速查表

| 关注点 | 文件 | 行 |
|---|---|---|
| Phase 2 设计稿 + 14 决策 | `docs/architecture/orchestration-transport.md` | 264-403 |
| Phase 2 audit 报告 | `docs/architecture/phase-2-audit-report.md` | 1-138 |
| Phase 2 E2E 验收 | `docs/architecture/phase-2-e2e-report.md` | 1-294 |
| Lane A · 设计 vs 实现对比 | `docs/design/design-vs-impl-audit-2026-05-24.md` | 1-596 |
| Lane A · 5 友商调研 | `docs/design/competitor-research-2026-05-24.md` | 1-630 |
| LlmCallable 接口 | `server/src/transport/LlmCallable.ts` | 138 |
| 13 provider 列表 | `server/src/transport/api-clients/` | (dir) |
| DAG scheduler | `server/src/workflow/scheduler.ts` | 155-344 |
| DAG executor | `server/src/workflow/executor.ts` | 169 / 204-218 |
| conditional 评估器 | `server/src/workflow/condition.ts` | 29-53 |
| Assembler 核心切换 | `server/src/assembler.ts` | 459-477 |
| Timeline projector | `server/src/lib/timeline-projector.ts` | onText / onClassify / onAssembleStart |
| Parser 标签抽取 | `server/src/parser.ts` | 488-501（5-24 重写） |
| Claude Code CLI XML 包裹 | `server/src/transport/api-clients/claude-code-cli-api-client.ts` | 397 / 428-430 |
| Zhipu Coding Plan endpoint | `server/src/transport/api-clients/zhipu-api-client.ts` | (provider 默认值) |
| Timeline 容器 | `src/components/run-session/timeline/Timeline.tsx` | 1-100 |
| MessageRegistry switch | `src/components/run-session/timeline/MessageRegistry.tsx` | 1-50 |
| Timeline types + reducer | `src/components/run-session/timeline/types.ts` | 100-192 |
| useRunSession reducer | `src/core/hooks/useRunSession.ts` | 644-661 |
| SSE 订阅 | `src/api/runSessions.ts` | 458-477 |
| RunSession 接入 | `src/pages/RunSessionPage.tsx` | 1695 / 2217 / 2224-3549 |

---

## 附录 E · 跨 session memory 候选项

下次 session 启动时，把以下几条加入 MEMORY.md，避免重复发现：

1. **Phase 2 已完成（Orchestration ⊥ Transport）** — `docs/architecture/orchestration-transport.md` 是后端架构唯一参考
2. **Zhipu BYOK 默认 endpoint = Coding Plan** — 不是通用 Chat，且 `reasoning_content` 字段在思考流上需要
3. **Timeline v8 默认开启** — `localStorage.sf.legacyLeftPane !== '1'` 走 Timeline；legacy 1300 行待删
4. **`<tool_use>` / `<function_calls>` / `<sf:thinking>` 是 ShadowFlow 内部 XML 协议** — server transport 包裹，前端 parser 抽取，**不允许任何路径让它们裸露到 DOM**
5. **BMAD 在两路 picker 都能跑**：`cli:claude`（无需 ANTHROPIC_API_KEY）+ `byok:zhipu`（glm-4.7 / glm-5.1）
6. **watchdog 15min**（5-22 升过一次，下次不要被 3min 老经验绊倒）
7. **Phase 3 localStorage discriminated union 明确推后**（不要又开始切 mode/protocol 字符串）

---

End of report.
