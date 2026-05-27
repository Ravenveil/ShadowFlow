# Orchestration ⊥ Transport — ShadowFlow 后端技术架构

**Date**: 2026-05-22（Phase 2 落地 2026-05-23 ~ 2026-05-24）
**Status**: Phase 2 已落地（commits 26bc300 → d353eb0）；Phase 3 localStorage 重构未做（hygiene 项，不阻塞功能）
**Owner**: 后端 chat-flow 团队

> **更新历史**
> - 2026-05-22 初版，描述目标架构 + Phase 2 Eng Review 决策
> - 2026-05-25 Status 校正：Phase 2 实际已实现，更新违反点与影响面章节

---

## TL;DR — 一句话

> ShadowFlow 后端必须把**编排层（Orchestration）**和**传输层（Transport）**正交分离：
> 编排不关心 LLM 怎么调用，传输不关心调用方是单轮还是多轮。

这条原则**曾**违反在两处（Phase 2 已修复，记录留作架构演化的活档）：

1. ~~**`server/src/assembler.ts:404-411`** — `runTeamBackedSkill` 硬绑 ApiClient，CLI 模式下静默回退~~
   → **已修复**（commit `d7a2671`）：`assembler.ts:425` 通过 `resolveCallable(executor, ...)` 拿到统一的 `LlmCallable`；team-backed 走 `workflow/scheduler.runDag()`，non-team 走 `callable.turn()`，两条分支都和 transport 解耦。
2. **localStorage `sf.defaultExecutor = "byok:zhipu" | "cli:claude" | ...`** — mode 和 protocol 揉成一个字符串
   → 仍未修（Phase 3 项，doc §"Phase 3" 节明确推后；不影响 BMAD cli/acp 跑通）。

Phase 2 落地后，这些产品症状的**机制根因已消除**（实际验收见 §3 Acceptance Criteria 表，部分项仍待人工/E2E 跑通签收）：
- ~~BMAD 在 picker 选 cli:claude 时不工作~~ → 架构上现在 transport-agnostic（待 §3 AC#1 E2E 签收）
- ~~Question Form / Step Artifact / DS injection 等结构化 SSE 事件在 CLI 模式下都该 broken~~ → 走 daemon-emit `<sf:agent-substep>` 路径而非 LLM tool_use
- 用户切 picker 的体验目标是"任何 picker × 任何 skill 都该跑得动"

---

## 当前架构（错的耦合）

```
┌─ team-backed skill (assembler.ts:404) ─────────────┐
│  runTeamBackedSkill                                │
│  ├ ConversationRuntime   ← 多轮 + tool_use         │
│  ├ SkillAnchorTool       ← list_team_agents 等     │
│  └ ApiClient ONLY        ← ❌ 硬绑死 HTTP API      │
└────────────────────────────────────────────────────┘

┌─ non-team skill (skill-runners/index.ts) ──────────┐
│  dispatchSkillRunner                               │
│  ├ cli:* → spawn (cli.ts)                          │
│  ├ acp:* → ACP (acp.ts)                            │
│  ├ byok:* → ApiClient (anthropic.ts)               │
│  └ anthropic-direct → 同上                          │
└────────────────────────────────────────────────────┘
```

两条路径互不知情，team-backed 不能用 cli/acp，non-team 不能享受 SkillAnchorTool。

---

## 目标架构（正交两层）

```
                  ┌─ Orchestration Layer (业务) ──────────┐
                  │  TeamRuntime    (skill.team)         │  ← 多轮 / tool_use / SkillAnchorTool
                  │  SimpleRuntime  (non-team)           │  ← 单 call / system_prompt
                  │  ConversationRuntime (chat)          │  ← 通用多轮
                  └────────────────┬─────────────────────┘
                                   │
                                   │ LlmCallable.turn(prompt, tools[], history) → { text, toolCalls[] }
                                   │
                  ┌────────────────┴─────────────────────┐
                  │  Transport Layer (LlmCallable)       │
                  │  ├ ApiClientCallable                 │  ← HTTP / SDK (anthropic / openai-compat)
                  │  ├ CliCallable (Claude Code CLI)     │  ← spawn 单轮，stdin prompt → stdout
                  │  ├ CliCallable (Codex CLI)           │  ← 同上
                  │  └ AcpCallable / McpCallable         │  ← Story 15.23 已有
                  └──────────────────────────────────────┘
```

**契约**:
- Orchestration **不知道**底下 LLM call 怎么发出去
- Transport **不知道**调用方是 team-backed 还是 simple
- 两层通过 `LlmCallable` 接口通信

---

## 关键工程约束（先看清楚，再设计）

### 约束 1 · CLI 子进程**不能**作为 host tool_use worker

调研结论（详见 `docs/architecture/borrowed-from-opendesign.md` §5）：

- `server/src/skill-runners/cli.ts:101-110` — daemon `child.stdin.end(fullPrompt)` 写完就关 stdin，没回写通道
- `server/src/cli-registry.ts:69-74` — Claude Code CLI 启动参数没有 `--tools` / `--allow-custom-tools` flag
- `server/src/llm-providers/claude-code-cli-api-client.ts:83-91` 明确注释："the CLI doesn't currently expose a per-spawn `--tools` flag to inject arbitrary custom tools"
- OpenDesign 同源（`apps/daemon/src/runtimes/invocation.ts` `execAgentFile`），他们用独立 MCP server 解耦，而不是 spawn 多轮

**对架构的含义**:
- `CliCallable.turn()` 永远是单轮 prompt-in / text-out
- `tools[]` 参数在 CliCallable 路径上**必须降级**为系统提示文本（"You have these tools: ..."）而不是真的注入

### 约束 2 · ShadowFlow team-backed 当前依赖 LLM tool_use

`runTeamBackedSkill` 在 `assembler.ts:563+` 让 LLM 调 4 个 SkillAnchorTool（`list_team_agents` / `get_skill_anchor` / `register_agent` / `register_edge`），LLM 调用后 daemon 接住 → emit `<sf:agent-substep>` SSE 事件给前端。

这套机制在 ApiClient (Anthropic native tool_use) 上能跑，在 CliCallable 上跑不了。

**对架构的含义**:
- team-backed skill 在 CliCallable transport 下，必须用**daemon 代码直接 emit**替代 LLM tool_use
- 即 "C2a 实现"：daemon 不问 LLM，直接按 `team.yaml` 把 agent 全部 emit
- 不需要 "C2b 智能缩子集"——当前 BMAD/paper-review 两个 team skill 都是固定全角

---

## 迁移路径（Phase 1 / 2 / 3）

### Phase 1 — 今天的状态（已完成）

```
┌─ assembler.ts ──────────────────────────────────────┐
│  if (skill.team) {                                  │
│    if (opts.provider matches OpenAiCompat /         │
│        anthropic / google)                          │
│      → buildApiClient + runTeamBackedSkill          │
│        (HTTP API 路径，✓ 工作)                       │
│  } else {                                            │
│    → dispatchSkillRunner (cli/acp/byok 都工作)       │
│  }                                                   │
└─────────────────────────────────────────────────────┘
```

**能力矩阵**:

| Skill 类型 \ Picker | byok:* | anthropic-direct | cli:* | acp:* |
|---|---|---|---|---|
| team-backed (BMAD) | ✅ | ✅ | ❌ 静默回退 | ❌ 静默回退 |
| simple (web-prototype) | ✅ | ✅ | ✅ | ✅ |

Phase 1 修复（commit `2a4d066` `pickerOverrides`）保证了第 1 行 byok:* 列的 picker 切换不会丢字段。但 cli/acp 仍 broken。

### Phase 2 — 引入 LlmCallable（中期，需独立 PR）

新文件 `server/src/transport/LlmCallable.ts`：

```ts
export interface LlmCallable {
  /** 单轮 turn。tools[] 由实现自行决定是真注入还是降级到 system prompt。*/
  turn(input: {
    system: string;
    prompt: string;
    history: ConversationMessage[];
    tools?: ToolSpec[];
    signal?: AbortSignal;
  }): AsyncGenerator<TurnChunk>;

  /** Transport capability flag — 让 Orchestration 知道下面能不能跑 tool_use 多轮 */
  readonly capabilities: {
    supportsToolUse: boolean;       // false for CliCallable
    supportsMultiTurn: boolean;     // false for CliCallable single-spawn
    supportsStreamingDelta: boolean;
  };
}
```

两个实现：

```
ApiClientCallable          { supportsToolUse: true,  supportsMultiTurn: true,  delta: true }
CliCallable (Claude Code)  { supportsToolUse: false, supportsMultiTurn: false, delta: true (stream-json) }
CliCallable (Codex)        { supportsToolUse: false, supportsMultiTurn: false, delta: false (plain) }
AcpCallable                { supportsToolUse: true,  supportsMultiTurn: true,  delta: true }
McpCallable                { supportsToolUse: true,  supportsMultiTurn: false, delta: false }
```

`runTeamBackedSkill` 改成接 `LlmCallable` 而不是 `ApiClient`：

```ts
async function* runTeamBackedSkill(
  opts, skill, prompt, projectDir,
  callable: LlmCallable,   // ← 接抽象，不再 ApiClient
) {
  if (callable.capabilities.supportsToolUse) {
    // 走原 ConversationRuntime + SkillAnchorTool 路径
  } else {
    // 走 C2a fallback：daemon 直接 emit
    yield* emitTeamBlueprintFromYaml(skill.team);
    // 然后每个 agent 做一次单轮 LLM call 收集输出
    for (const agent of skill.team.agents) {
      yield* callable.turn({ system: composeAgentPrompt(agent), prompt, history: [] });
    }
  }
}
```

**Phase 2 能力矩阵**:

| Skill 类型 \ Picker | byok:* | anthropic-direct | cli:* | acp:* |
|---|---|---|---|---|
| team-backed (BMAD) | ✅ ApiClient | ✅ ApiClient | ✅ C2a fallback | ✅ ApiClient |
| simple (web-prototype) | ✅ | ✅ | ✅ | ✅ |

### Phase 3 — Discriminated Union localStorage（长期）

localStorage 的字符串 tag 改为 discriminated union：

```ts
type ChatConfig =
  | { mode: 'cli'; cliId: string; model?: string }
  | { mode: 'api'; protocol: ProviderId; apiKey?: string; baseUrl?: string; model: string }
  | { mode: 'acp'; target: string };
```

前端 picker / picker overrides / server 路由全部跟着改。这步是 hygiene 改进，不解决 Phase 2 之外任何新症状，留作未来 PR。

---

## 影响面 — 不止 BMAD

按 mode/protocol 正交原则，ShadowFlow **所有依赖结构化 SSE 事件的 skill** 在 cli:* / acp:* 上今天都该 broken，没爆只是因为没人测：

| Skill 特性 | SSE 事件 | 前端消费者 | CLI 下当前状态 |
|---|---|---|---|
| BMAD team-backed | `<sf:agent-substep>` | TeamEditor | ❌ 静默回退 Anthropic |
| Question Form | `<sf:question-form>` | QuestionFormModal | ❌ 同 |
| Step artifact | `<sf:step output_kind="...">` | StepArtifactDrawer | ❌ 同 |
| Design system multi-turn | DS injection 链 | 内联 | ❌ 同 |

Phase 2 落地后，**这四条全部解决**，因为 LlmCallable 的 supportsToolUse 标志会引导每个 Runtime 走正确的 fallback 路径。

---

## 与 OpenDesign 的对比（再次校准）

| 维度 | OpenDesign | ShadowFlow Phase 2 目标 |
|---|---|---|
| Mode/Protocol 字段 | `mode: 'daemon' \| 'api'` enum | 同样想要（Phase 3） |
| Transport 抽象 | 隐式（`streamMessage(cfg)` 内部 if/else） | 显式 `LlmCallable` 接口 |
| Orchestration 层 | **无**（只有单轮 streamMessage） | 多个 Runtime（Team / Simple / Conversation） |
| CLI tool_use | 不做（认知一致） | 不做（C2a fallback） |
| 团队协作概念 | 无 | BMAD-style team-backed |

ShadowFlow 在 Orchestration 层比 OpenDesign 重，这是 ShadowFlow 的产品差异（"Agent Team 的 VSCode"），不是技术债。Transport 层应该和 OpenDesign 一样轻、清晰、enum-driven。

---

## 不在本 doc 范围

- localStorage 数据结构迁移细节（Phase 3 自己的 design doc）
- ACP / MCP 已有实现细节（见 `server/src/skill-runners/{acp,mcp}.ts`）
- 团队 yaml schema 演化（参考 `server/src/lib/team-yaml.ts`）
- 真 BMAD-METHOD 仓库的 commands/skills 子目录加载（参考 `docs/architecture/skill-pack-install.md` 待写）

---

## 相关 commits / files

- `2a4d066` fix(run-session): forward picker overrides on every send path
- `dd45b04` refactor(skill-pack): drop fake prompt, add real GitHub source URL
- `server/src/assembler.ts:404-411` 待改（Phase 2 入口点）
- `server/src/skill-runners/index.ts:31-162` dispatcher，未来要让 LlmCallable 接管
- `server/src/skill-ingest/canonical-id.ts` Phase 1 仍要落地（W1）
- `docs/architecture/borrowed-from-opendesign.md` 调研出处
- `docs/architecture/dual-backend.md` Express/Python 双后端拓扑

---

## 待解决问题（不阻塞 doc）

1. **CliCallable history 处理**：CLI 子进程是 stateless 单轮，多轮 history 怎么注入？合并到 system prompt？目前没定。
2. **C2a 下的 SSE 事件顺序**：daemon 直接 emit `<sf:agent-substep>` 时，per-agent 单轮 LLM call 还在跑——事件流的 interleaving 怎么排？需要时序图，留给 Phase 2 design doc。
3. **Codex CLI streaming format**：Codex 输出不像 Claude Code 是 stream-json，delta 解析要单独适配（已有 `server/src/parsers/cli-streams/codex-stream-json.ts`，但精度有限）。

---

## Phase 2 Eng Review · 决策记录（2026-05-22）

> 走 `/plan-eng-review`，14 轮 AUQ 把 Phase 2 的范围、抽象、错误模型、测试政策、性能 SLO 全部锁定。本节是 Phase 2 实施的**契约**。

### 1. 决策表

| 编号 | 决策 | 含义 |
|---|---|---|
| **A1** | `LlmCallable.turn()` 返回 `AsyncGenerator<TurnChunk>` 统一流式 | Codex CLI 路径作为单 chunk yield（伪流）；前端打字机效果保住 |
| **A2** | C2a 用 artifact 文件 handoff（非 message log） | agent 间通信走文件系统，不依赖多轮 history；CLI 子进程的文件能力天然契合 |
| **A3** | **统一 BOTH** ApiClient 和 CLI 路径用 daemon-led DAG + artifact handoff | 废 `runTeamBackedSkill` 内的 LLM tool_use 多轮路径。BMAD 在 BYOK 行为变为与 CLI 一致 |
| **A4** | Phase 2 实现完整 DAG：拓扑并行 + conditional 边 + per-node retry | `team.yaml` 三种 edge kind 都生效。SSE chunk 加 `node_id` 字段（parser.ts 改造） |
| **A4b** | conditional 评估器用 `expr-eval` JS 表达式（GH Actions/n8n/LangGraph 主流） | 需要 sandbox 安全 review；`workflow/condition.ts` 内部抽象成 `evaluate(condition, ctx) => boolean` |
| **A5** | M2 目录重组：`llm-providers/` 和 `skill-runners/` 全部并入 `transport/` | `skill-runners/index.ts` 瘦身为 `transport/dispatcher.ts` 单一 factory |
| **A6** | O1 统一路径：non-team skill 也走 `LlmCallable.turn()` 一次 | 所有 skill 通过 transport 抽象。`dispatchSkillRunner` 改名为 `resolveCallable()` |
| **CL3 / E3** | 错误传播混合：调用阶段 throw typed exception，stream 中 yield error chunk | `LlmCallError` 类型 + `retry.ts` 在 throw 上 retry；前端在 error chunk 上展示不 hard-break SSE |
| **C1** | Cancellation：单 AbortSignal 全程透传 entry → scheduler → callable.turn() → 底层 | UI 节点级 cancel 是未来功能，接口不破坏 |
| **T1** | 测试用真实 API（不 mock） | CI 需 ANTHROPIC/OPENAI/ZHIPU/Claude Code CLI/Codex CLI auth；预算需单独评估 |
| **S3** | 性能 regression gate：BMAD 13-agent wall-clock 不慢于 today ±20% | E2E 测试含 perf 基线；实施前先采样 today 平均 |

### 2. Phase 2 文件清单（~20 文件）

**新增（transport/）** ：
```
transport/LlmCallable.ts                ← 接口 + TurnChunk 类型 + capabilities
transport/ApiClientCallable.ts          ← 包装 13 个 provider 的 ApiClient
transport/CliCallable.ts                ← Claude Code CLI + Codex CLI 两 variant
transport/AcpCallable.ts                ← 包装现有 ACP
transport/McpCallable.ts                ← 包装现有 MCP
transport/dispatcher.ts                 ← resolveCallable(executor) factory（替代 skill-runners/index.ts）
```

**新增（workflow/）** ：
```
workflow/scheduler.ts                   ← 拓扑并行 DAG runner（Kahn 算法 + Promise.all 同层）
workflow/executor.ts                    ← 节点执行（artifact 写盘 + workspace 传递 + SSE 事件）
workflow/condition.ts                   ← expr-eval evaluator
workflow/retry.ts                       ← per-node max_retries + exponential backoff
workflow/observer.ts                    ← node 生命周期事件（含 node_id）
workflow/types.ts                       ← RunResult / NodeStatus / TurnChunk (import TeamDefV1，不重复定义)
```

**移动（git mv，diff 主要是路径）** ：
```
llm-providers/*                  → transport/api-clients/
skill-runners/cli.ts             → transport/cli-spawner.ts
skill-runners/acp.ts             → transport/acp-spawner.ts
skill-runners/mcp.ts             → transport/mcp-spawner.ts
skill-runners/cli.test.ts        → transport/cli-callable.test.ts（同时改写视角）
```

**修改** ：
```
assembler.ts                            ← team-backed 分支换为 workflow.scheduler.run()；non-team 分支换为 callable.turn()
parser.ts                                ← SSE chunk events 加 node_id 字段
prompts/phase-2-agent.ts                 ← 删 tool_use 词汇，改 artifact handoff 描述
prompts/phase-3-team.ts                  ← 同上
.shadowflow/skills/bmad/SKILL.md         ← 删 4 SkillAnchorTool 引用
.shadowflow/skills/paper-review/SKILL.md ← 同上
src/api/runSessions.ts                   ← chunk events 按 node_id 路由
src/core/hooks/useRunSession.ts          ← per-node buffer
lib/conversation-runtime.ts              ← 废 LLM tool_use 路径或大幅瘦身
```

**删除（条件：grep 后无 skill 使用）** ：
```
lib/tools/skill-anchor-executor.ts      ← daemon-emit 取代 LLM 调用
（skill-anchors.ts 保留 schema 定义，未来 skill 可显式启用）
```

### 3. Acceptance Criteria

- [ ] BMAD 在 `cli:claude` picker 下端到端跑通 13 agent，产出 artifact 落盘
- [ ] BMAD 在 `byok:zhipu` picker 下行为与今天等价（容忍 daemon-emit vs tool_use 的 `<sf:agent-substep>` 来源差异，artifact 内容一致）
- [ ] `team.yaml` parallel 边触发并发 LLM call，SSE chunk 按 node_id 在 UI 正确分发
- [ ] `team.yaml` conditional 边 `output.includes("approved")` 评估正确
- [ ] 用户 mid-stream Cancel：CLI 子进程在 1s 内 SIGTERM；HTTP 在 SDK abort 内完成
- [ ] Phase 2 性能 ≤ today × 1.2（regression gate）
- [ ] E2E 真 API 测试 main push 跑（PR 测试 mock 也可，但 main 必须 T1）
- [ ] doc ASCII 图全部更新（本 doc + `borrowed-from-opendesign.md` §5 加注 "已实施"）

### 4. NOT in scope（明确推后）

- **Phase 3 · localStorage discriminated union**：原 doc line 191-202 已写，仍推后
- **节点级 cancel**：UI 层未来加，当前 C1 单 signal 全程 cancel
- **Conditional 升级到自实现 mini-DSL**：第一版 expr-eval 够用
- **sub-workflow / checkpoint / resume**：DAG 引擎演化方向，Phase 5+ 单独立项
- **分布式执行**：worker pool / 跨机调度，超出 Phase 2
- **Provider 行为差异统一**：13 个 provider 的 stream 格式归一在 `transport/api-clients/` 内部，本 plan 不深挖

### 5. What already exists（不重复造）

- `team.yaml v1` schema 已有 `EdgeKind = 'sequential' | 'parallel' | 'conditional'`、`max_retries`、`timeout_per_step_ms`、`condition`、`dag_layout` —— Phase 2 调度器**直接消费**，不重定义
- `artifactCallback`（`assembler.ts:586-589`）已经写盘到 `projectDir/.shadowflow/projects/<session_id>/` —— Phase 2 复用，传递为 workspace
- `<sf:agent-substep node_id="..." substep="..."/>` 协议已有 node_id（`parser.ts:286`） —— 前端 `src/api/runSessions.ts:448` 已按 node_id 路由，DAG 并发只是让事件流"多发起来"
- 15 个 ApiClient 已实现（`assembler.ts:487-541`）—— Phase 2 仅包装为 ApiClientCallable
- ACP / MCP runner 已实现（`skill-runners/{acp,mcp}.ts`，Story 15.23）—— Phase 2 仅包装

### 6. TODOS（Phase 2 之外）

| TODO | 触发条件 |
|---|---|
| 节点级 cancel UI + scheduler 子 signal 派生 | UI 需求出现时 |
| Conditional evaluator 升级 mini-DSL 或 LangGraph-style typed expressions | expr-eval 安全性/表达力撞瓶颈时 |
| sub-workflow 组合（team A 引用 team B） | 第二个复杂 team-skill 出现时 |
| Phase 3 discriminated union localStorage 重构 | Phase 2 稳定后单独 PR |
| Checkpoint / resume（断点续跑） | 长 workflow 用户撞掉线场景时 |
| Codex stream 解析精度优化（`parsers/cli-streams/codex-stream-json.ts`） | 用户在 Codex 路径下抱怨"打字机效果断断续续"时 |
| **scheduler 反边支持**：conditional 边作为反边（如 BMAD `qa → dev`）时，downstream 永远卡 in-degree=1 死锁。证据：`bmad-dag-wiring.test.ts` 第二个 case。当前规避：team 作者别写反边。长期方案与 sub-workflow / checkpoint-resume 一起做。 | 第二个想用 BMAD-style 反馈循环的 team 出现时 |

### 7. Risk / Failure modes

| 风险 | 触发条件 | 缓解 |
|---|---|---|
| BMAD 在 BYOK 下产出质量退化 | daemon-emit 取代 tool_use 后，LLM 在 "我是 agent X，读 brief.md 写 architecture.md" prompt 下产出不如 tool_use 路径下 | EVAL 测试套件：golden output 比对 |
| CLI 子进程 OOM / hang | 长 prompt + 大 history 灌进 system prompt | per-node `timeout_per_step_ms` + AbortSignal SIGTERM |
| Provider rate limit 在并行层撞墙 | DAG 同层 N 个节点都用 anthropic | retry.ts 识别 429 + retry-after，未来加 token-bucket 限流 |
| expr-eval sandbox 逃逸 | 恶意 team.yaml | expr-eval 不支持 `Function`/`eval` 字面量，但仍需安全 review；`condition` 字段只接受 team.yaml owner 的输入（不接受运行时用户输入） |
| 真 API CI 抽风导致 main red | Anthropic / OpenAI 抽风时 nightly job 失败 | nightly 失败不阻塞 PR；连续 3 次失败才告警 |

### 8. Open question 答复

回应原 doc 的 3 个"待解决问题"：

| 原 question | Phase 2 答复 |
|---|---|
| #1 CliCallable history 处理 | 不存在了——artifact handoff 取代 history。CliCallable.turn() 接受 history 字段为兼容性预留，但 ShadowFlow 内部 history: [] |
| #2 C2a SSE 事件顺序 | 拓扑并行下交织：每个 chunk 带 node_id，前端按 id 分发到对应 AgentDetail panel |
| #3 Codex CLI streaming | 接受为限制：CliCallable for Codex 把整段输出当 single text-delta chunk yield；用户体验上 Codex 路径"打字机效果"会"砰"出来 |

### 9. Completion summary

- Step 0 Scope Challenge：scope 从原 doc 描述（"5 个 Callable + 一个 if 改造"）扩展为 **Transport 层 + DAG 引擎平台能力**（用户战略调整：从 BMAD-shaped 到通用 platform）
- Architecture Review：6 个核心决策（A1-A6）+ 2 个 CL（CL3 错误模型 / C1 cancel）+ 6 项 CL 实施清单
- Code Quality Review：2 个 trade-off 决策（错误模型、cancel 粒度）+ 6 项实施前 grep
- Test Review：40+ GAP 已列；测试政策 T1 真实 API
- Performance Review：S3 regression gate 作为 acceptance criteria
- 实施前 grep 任务：
  - `list_team_agents | register_agent` —— 验证 4 个 SkillAnchorTool 是否还有 skill 显式使用
  - `dispatchSkillRunner` —— 验证 5 处调用点全部迁移
  - `ApiClient` 类型引用 —— 验证 runTeamBackedSkill 签名变更影响
