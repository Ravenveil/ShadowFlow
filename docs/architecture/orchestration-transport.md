# Orchestration ⊥ Transport — ShadowFlow 后端技术架构

**Date**: 2026-05-22
**Status**: 设计目标（Phase 1 落地中，Phase 2/3 未实现）
**Owner**: 后端 chat-flow 团队

---

## TL;DR — 一句话

> ShadowFlow 后端必须把**编排层（Orchestration）**和**传输层（Transport）**正交分离：
> 编排不关心 LLM 怎么调用，传输不关心调用方是单轮还是多轮。

这条原则违反在两处：

1. **`server/src/assembler.ts:404-411`** — `runTeamBackedSkill` 硬绑 ApiClient，CLI 模式下静默回退
2. **localStorage `sf.defaultExecutor = "byok:zhipu" | "cli:claude" | ...`** — mode 和 protocol 揉成一个字符串

两个违反点导致的产品症状：
- BMAD 在 picker 选 cli:claude 时不工作
- Question Form / Step Artifact / DS injection 等结构化 SSE 事件在 CLI 模式下都该 broken
- 用户切 picker 的体验是"为什么 BMAD 在 BYOK 下能跑，CLI 下就不行"

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
