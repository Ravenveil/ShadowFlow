# Borrowed from OpenDesign — Chat Config 架构借鉴笔记

**Date**: 2026-05-22
**Source**: D:/VScode/open-design (apps/web + apps/daemon)
**Trigger**: BMAD skill 在 GLM picker 下回退 Anthropic 的 bug 链（commit 2a4d066）

---

## TL;DR

OpenDesign 5 条 chat config 决策里只有 2 条值得 ShadowFlow 借鉴。底下的**上位原则**比表面决策更重要：

> **mode（执行模式）和 protocol（具体 provider）是正交的两个维度，不要塞进同一个字符串。**

ShadowFlow 在两处违反这个原则，一处已修，一处留作 TODO。

---

## 5 条决策对照

### 1. `mode` 二元开关 (`'daemon' | 'api'`)

| | OpenDesign | ShadowFlow |
|---|---|---|
| 数据形态 | `ExecMode = 'daemon' \| 'api'` enum | `sf.defaultExecutor = "byok:zhipu" \| "cli:claude" \| "anthropic-direct"` 字符串 |
| 解析方式 | 前端 select.value 直接拿 enum | 前端 + 后端各做 string prefix parsing |
| 类型安全 | discriminated union | 字符串裸跑 |

**关键代码**:
- OpenDesign: `apps/web/src/components/AgentPicker.tsx:30-39`
- ShadowFlow: `server/src/skill-runners/index.ts:62-93`（dispatcher 用 `exec.startsWith('cli:')` 等多分支）

**借鉴价值**: 高（理念上）  
**借鉴成本**: 高（迁移 localStorage 旧值 + 改前后端 ~10 文件）  
**结论**: 理念正确但成本高。**不急做**。新设计按此思路（不再造新 string-prefix tag）。

### 2. API 模式浏览器直调 SDK，daemon 只 CORS proxy

| | OpenDesign | ShadowFlow |
|---|---|---|
| Key 存放 | 浏览器 localStorage (`dangerouslyAllowBrowser: true`) | server `.shadowflow/byok-config.json` |
| 数据流 | Browser → 各 provider API 直连 | Browser → daemon → 各 provider |
| 多用户 | 单机单用户 | 设计上支持 Team 共享 BYOK |
| Key 暴露面 | 浏览器内存 + localStorage | 仅 daemon 进程 |

**关键代码**:
- OpenDesign: `apps/web/src/providers/anthropic.ts:28-34` (`new Anthropic({ apiKey, baseURL, dangerouslyAllowBrowser: true })`)
- ShadowFlow: `server/src/routes/run-sessions.ts:440-455`（server-side key 拼装）

**借鉴价值**: 负（与 ShadowFlow Team 方向冲突）  
**结论**: **不借鉴**。OpenDesign 是"本地工具"姿态（key 不离机），ShadowFlow 是"Team 平台"姿态（key 可团队共享、有权限矩阵）。这是产品哲学差异，不是技术债。

### 3. CLI 模式 daemon 全权 spawn，前端只发 agentId / cli_id

| | OpenDesign | ShadowFlow |
|---|---|---|
| 前端发什么 | `{ agentId, message, ... }` 无 key | `{ executor: 'cli:claude', ... }` 也无 key |
| daemon 做什么 | spawn CLI 子进程 | 同样 spawn (`skill-runners/cli.ts`) |
| CLI 认证 | CLI 自己管 (`claude login`) | 同样 |

**关键代码**:
- OpenDesign: `apps/web/src/providers/daemon.ts:222-238`
- ShadowFlow: `server/src/skill-runners/cli.ts`

**借鉴价值**: 0 — **已经一致**

### 4. Provider 路由 = enum switch 一个函数

| | OpenDesign | ShadowFlow |
|---|---|---|
| 函数 | `streamMessage(cfg, ...)` 内部 if/else | `buildApiClient(provider, ...)` |
| 形式 | `if cfg.apiProtocol === 'azure'` ... | `if provider === 'anthropic'` ... |

**关键代码**:
- OpenDesign: `apps/web/src/providers/anthropic.ts:36-66`
- ShadowFlow: `server/src/assembler.ts:487-540`

**借鉴价值**: 0 — **现状已对齐**

### 5. config 整体作为参数传，不是手工拼 overrides

| | OpenDesign | ShadowFlow（修复前） |
|---|---|---|
| 调用 | `streamMessage(config, system, history, signal, handlers)` | 三处发送点各自从 picker 读 state → 拼 body |

**关键代码**:
- OpenDesign: `apps/web/src/components/ProjectView.tsx:1574`
- ShadowFlow（已修）: `src/common/lib/pickerOverrides.ts` + `src/pages/RunSessionPage.tsx` 三处 callsite

**借鉴价值**: 高（**当下 bug 的根源**）  
**借鉴成本**: 低  
**结论**: **强烈借鉴**。commit 2a4d066 已经走第一步（抽 helper），下一步是 `useChatConfig` hook + `postFollowupMessage` wrapper，让 caller 无法漏字段。

---

## 上位原则：mode/protocol 正交

OpenDesign 的 5 条决策底下是一句话：**mode 和 protocol 是正交的两个维度，不要塞进同一个字符串。**

ShadowFlow 违反这条原则的两个地方：

### 违反 1 — 前端 localStorage（hygiene 问题）

```ts
sf.defaultExecutor = "byok:zhipu"   // mode (byok) + protocol (zhipu) 挤在一个 string
                  | "cli:claude"    // mode (cli) + cli_id (claude) 挤在一个 string
                  | "anthropic-direct"
```

正确形态（参考 OpenDesign 的 `AppConfig`）：

```ts
type ChatConfig =
  | { mode: 'cli'; agentId: string; model?: string }
  | { mode: 'api'; protocol: ProviderId; apiKey?: string; baseUrl?: string; model: string };
```

**影响**: 中等。dispatcher 解析、picker 选择、follow-up overrides 等多处需要重构。

### 违反 2 — 后端 assembler.ts:404（真 bug）

```ts
if (skill.team) {
  const provider = opts.provider ?? 'anthropic';        // ← 只看 protocol
  const apiClient = buildApiClient(provider, ...);
  if (apiClient) {
    yield* runTeamBackedSkill(opts, ..., apiClient);    // ← executor 字段被完全吞掉
    return;                                              // ← cli:*/acp:*/mcp:* 全部失效
  }
}
const executor = opts.executor ?? skill.executor ?? 'cli:auto';  // 永远到不了
```

team-backed skill（BMAD 等）选了 `cli:claude` / `cli:codex` / `acp:*` 都静默走 Anthropic SDK。

**根因**: 这里把 mode (executor) 和 protocol (provider) 绑死成一条逻辑，没有正交处理。

**修法**（提议，未实施）：

```ts
const executor = opts.executor ?? skill.executor ?? 'cli:auto';
const isApiMode =
  !executor.startsWith('cli:') &&
  !executor.startsWith('acp:') &&
  !executor.startsWith('mcp:');

if (skill.team && isApiMode) {
  // 老路：team-backed + API mode → ApiClient + runTeamBackedSkill
  const provider = opts.provider ?? 'anthropic';
  const apiClient = buildApiClient(provider, ...);
  if (apiClient) {
    yield* runTeamBackedSkill(opts, skill, ..., apiClient);
    return;
  }
}
// 新路：cli:*/acp:*/mcp:* 即使是 team-backed 也走 dispatcher
// 需给 SkillAnchorTool 在 dispatcher 路径上做注入（小重排）
yield* dispatchSkillRunner(executor, ..., { name: skill_name, executor: skill.executor, team: skill.team });
```

**影响**: 1 个文件（`assembler.ts`），~30 行。可能需要 `runTeamBackedSkill` 接受 dispatcher-routed executor 而不是 ApiClient。

---

## 借鉴成本/价值矩阵

| 借鉴方向 | 价值 | 成本 | 当下做 | 备注 |
|---|---|---|---|---|
| #5 frontend 单一入口 (`useChatConfig` + `postFollowupMessage`) | 高 | 低 | 🟡 已批，未实施 | 防御式设计，杜绝漏调 |
| 后端 mode/protocol 正交 (修 `assembler.ts:404` 吞 executor) | 高 | 低 | 🟡 待定 | 真 bug，cli:* on BMAD 失效 |
| #1 前端 `ChatConfig` discriminated union | 中 | 高 | ❌ 不急 | hygiene + 给未来铺路，migration 痛 |
| #2 浏览器直连 SDK | 负 | 极高 | ❌ 不借 | 与 Team 共享 BYOK 设计冲突 |
| #3 daemon 拥有 CLI lifecycle | 已对齐 | — | — | 现状 |
| #4 provider enum router | 已对齐 | — | — | 现状 |

---

## ShadowFlow 比 OpenDesign 强的地方（别动）

- **多 provider BYOK**: 12 vs 5（anthropic / openai / deepseek / zhipu / google / qwen / moonshot / mistral / groq / openrouter / ollama / lmstudio / azure）
- **session/conversation 持久化**: OpenDesign 是单次 turn，ShadowFlow 跨 session 续接
- **Skill registry + team-backed 团队模板**: OpenDesign 没这层
- **fallback 兜底**: CLI 不可用 → API 自动降级；OpenDesign 没有这个机制
- **Policy Matrix + 多用户协作**: OpenDesign 是单机单用户

---

## 行动项

**短期**（不动代码）：
- 把"mode/protocol 正交"作为后续所有 chat config 改动的设计原则
- 任何新加的 chat config 字段不要塞进 string prefix tag

**中期**（独立 PR）：
- 修 `assembler.ts:404` 让 team-backed skill 尊重 `executor=cli:*/acp:*/mcp:*`
- 实施 #5 借鉴：`useChatConfig` hook + `postFollowupMessage` wrapper

**长期**（v2 chat config 设计）：
- localStorage `sf.defaultExecutor` 字符串 → `sf.chatConfig` discriminated union
- 后端 request body 加 explicit `mode` 字段
- 这两条一起做，单独做都是半截

---

## 相关 commits / files

- `2a4d066` fix(run-session): forward picker overrides on every send path
- `src/common/lib/pickerOverrides.ts` 已抽 helper
- `src/common/lib/pickerOverrides.test.ts` 已加 8 个 regression 单测
- `server/src/assembler.ts:404-411` 待修
- `server/src/skill-runners/index.ts:62-93` 现状 dispatcher，未来要重排
