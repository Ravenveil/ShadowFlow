# Round 2 Competitor Deep-Dive: 3 interactions
Date: 2026-05-24
Author: Agent-Researcher (Round 2)
Scope: 3 fine-grained interactions — thinking fold/expand, elapsed-time counter, retry/resend
Sources: WebSearch/WebFetch (GH issues + vendor docs + Fazm desktop UI breakdown) +
local CLI probes (`claude --help`, `claude --print --output-format=stream-json`,
`codex --help`, `codex exec`).

> Companion to `docs/design/competitor-research-2026-05-24.md` (Round 1). This file
> only goes deeper on the 3 micro-interactions requested by the FE Implementer.

---

## TL;DR (5 句话)

1. **Thinking 折叠 = 普遍默认折叠，进行时展开，完成后自动收起，header 必带 elapsed
   + 可选 token 数。** Cherry Studio 文档明确写 "When enabled, models that support
   thinking will automatically collapse the thinking process after it is complete"；
   Fazm/Claude Code desktop ext. 用 "brain icon + Thinking… + 折叠按钮"；TRAE 没正式
   出处但与 Nuxt UI `ChatReasoning` 组件惯例一致（"auto-opens during streaming and
   auto-closes after"）。**Codex CLI 与 raw Claude Code CLI 是反例**：要么 'none'
   不显示，要么 'experimental' 全量倾倒，社区 issue #5476/#5339/#10723 都在喊改。
2. **elapsed 计时 = 5 秒静默 + 之后秒级跳，单位升级到分钟。** Fazm 写得最清楚：
   `if elapsed >= 5` 才显示，然后 `"5s, 6s, 7s…"` 跳秒，再切到 `"1m 12s"`。
   Claude Code 自己的 spinner 也是这个模式（"Befuddling… (1m 56s · ↑ 2.3k tokens ·
   thought for 1s)"）。**前端 setInterval(1000) + base = first thinking ts 是
   公认实现策略**，后端推送只用来对齐总时长，不靠它驱动每秒跳数。
3. **retry/resend 在桌面竞品里几乎都是 message hover 工具栏里的一个 icon（不是
   inline 大按钮）**：Cherry Studio 的 regenerate 在 message bubble hover 出现，
   行为是**新 branch 保留旧回复并允许换模型**（社区吐槽 "old answer pollutes
   context" — 这是反例，应避免）；TRAE Inline Chat 是少数 "bottom-left Retry
   按钮 inline" 流派，简单粗暴只重跑当前 turn。Codex CLI / Claude Code CLI 都
   **没有原生 retry UI**（CLI 用户只能上箭头重发或 `/resume`）。
4. **失败态的 retry 和成功态的 regenerate 是两个交互**：失败时 banner/inline
   error + 大 "Retry" 按钮，触发 abort + 同 turn 重跑；成功时 hover 工具栏的小
   "regenerate" icon，触发新 branch（Cherry Studio 模式）或就地替换（ChatBox 模式，
   Cherry Studio 社区呼吁的方向）。两条路径不要混。
5. **给 ShadowFlow 最有用的 1 条**：v8 设计稿已经做了 `.tl-thinking:not(.open)`
   折叠 + `Thought for N s` header，**优先把折叠+elapsed 接通就能拿到 Cherry
   Studio + Fazm 同档体验**；retry 不急于在 hover 上加 icon，先把"失败 banner +
   Retry 按钮"做对，让 abort 走当前 SSE session 复用同一 turn id。

---

## 矩阵：4 竞品 × 3 交互

| 竞品 | 思考折叠 | elapsed 计时 | retry/重发 |
|---|---|---|---|
| **Cherry Studio** | 默认折叠（开关 "Automatically collapse thought content"）；streaming 时展开，完成后自动收起；header 含模型名 + 思考内容 preview | N/A（文档没明确秒级 spec，仅 "after it is complete"）；社区有 issue 要求显示 reasoning summary | hover 工具栏 regenerate icon；行为 = 新 branch 保留旧回复 + 可换模型；社区反馈"旧回复污染 context"，v2 重构中 |
| **Codex CLI** | 当前只有 'none'（不显示）/ 'experimental'（全量倾倒）两挡，**无折叠**；issue #5476 在请求"中间挡：只显示 step header"；VS Code ext. 流式渲染做对比 | **CLI 无 elapsed 指示**（issue #5339 抱怨"感觉很慢"，因为所有 thinking 一次性在最后一步前 dump）；VS Code ext. 有流式更新 | **无原生 retry UI**；用户靠上箭头 / 重输入 / `codex resume` / `codex fork` 切回历史 session |
| **Claude Code CLI** | **CLI 完全丢弃 thinking 输出**（不显示）；desktop ext. / Fazm 桌面 UI 用"brain icon + Thinking… + chevron"折叠；展开内含完整 reasoning 文本 | CLI spinner 显示 `(1m 56s · ↑ 2.3k tokens · thought for 1s)` 这种合并字符串；desktop UI 用 5 秒静默 + 秒级跳 + 升级到分钟（Fazm 实证） | **CLI 无 retry 按钮**；Esc 中断 + 重新输入 prompt；issue #6643/#16905 反映 Esc 不稳定；流式 stream-json 协议本身支持 abort，UI 层未暴露 |
| **TRAE** | 文档不明示折叠交互（side-chat 文档未提及 thinking display）；按 Nuxt UI `ChatReasoning` 惯例推断为"streaming 展开 + 完成折叠" | N/A（公开文档没有秒级 elapsed spec） | **Inline Chat: bottom-left "Retry" 按钮**（traeide.com 文档明确："click the Retry button at the bottom left of the chat box"），inline 而非 hover；Side Chat 文档未明示 retry，只列 Accept/Reject/Copy/Insert/Apply |

---

## 详细记录

### 1. Cherry Studio

#### 1.1 Thinking 折叠
- **Evidence**: Cherry Studio docs / chat page —
  `https://docs.cherry-ai.com/docs/en-us/cherry-studio/preview/chat`
  原文："When enabled, models that support thinking will automatically collapse
  the thinking process after it is complete"（开关名：*Automatically collapse
  thought content*）。
- **Evidence**: GH issue #11924 — 用户要求 reasoning summary 改成 "collapsible
  section" + "view raw response fields"，说明社区共识就是 "折叠 + 可选展开"。
- **结论**: 默认折叠，streaming 时打开，结束后自动收起。header 含模型 + 思考
  preview，不含明确秒级 elapsed（**这点比 Claude Code desktop 弱**）。

#### 1.2 elapsed 计时
- 公开文档**没有**专门 elapsed 秒级 spec。从 release note 看 v1.3.0 之后在持续
  改 thinking 显示，但没找到 "thought for X s" 这种字符串证据。
- **结论**: Cherry Studio 在 elapsed 这一项**不是好榜样**，可以忽略。

#### 1.3 Retry / Regenerate
- **Evidence**: GH discussion #2025 / issue #181 —
  原文："默认的重新生成会新增一个对话同时保留旧的回复"，触发位置在 message
  bubble hover；规则是新 branch 保留旧 reply 并允许换模型。
- **反例信号**: 用户反馈 "old answer pollutes the context"，要求像 ChatBox 那样
  "点击 `↓` 就地拿新 reply"。Cherry Studio v2 在重构这块。
- **结论**: 借鉴**位置（hover toolbar 的 icon）**，但**不要照抄行为**（不要默认
  保留旧 reply 制造 branch 污染）。

---

### 2. Codex CLI

#### 2.1 Thinking 折叠
- **本地探测**: `codex --help` 显示 `model_reasoning_summary` 配置项，确认走的是
  配置驱动 "summary detail level" 而非交互式折叠。
- **Evidence**: GH issue #5476 — 当前只有 `none` / `experimental` 两挡，前者无
  feedback，后者 "very verbose, showing all internal contents"。社区在请求中间
  挡 "只显示 step header"。
- **Evidence**: GH issue #10723 — 用户在 macOS app 请求 "display reasoning
  summaries (thinking blocks)"，说明官方 macOS app 现在也不显示。
- **结论**: Codex CLI 是 **反面教材**。设计稿不要参考 CLI 当前形态。

#### 2.2 elapsed 计时
- **Evidence**: GH issue #5339 — 原文："the CLI outputs all intermediate thinking
  content after the last step, just before taking a tool action" — 用户感觉很慢
  因为**根本没 elapsed**；VS Code ext. 流式渲染做对比。
- **本地探测**: `codex exec "what is 2+2"` 输出 header 含 `session id` /
  `reasoning effort: high` / `reasoning summaries: none` 等元数据，但没有 elapsed
  显示。
- **结论**: Codex CLI 在这项**完全空白**，不可借鉴。

#### 2.3 Retry / 重发
- 子命令 `codex resume` / `codex fork` / `codex apply` 都是 session 级 retry，
  没有 message 级 retry UI。
- **结论**: Codex 在 retry 这件事的设计是 "重启会话" 而非 "重发消息"。这是
  CLI 的固有限制，不参考。

---

### 3. Claude Code CLI

#### 3.1 Thinking 折叠
- **本地探测**: `claude --print --output-format=stream-json --verbose "what is 2+2"`
  输出**只有 `assistant`/`text` 消息**，没有 `thinking` content block。raw CLI
  完全丢弃 thinking。
- **Evidence**: Fazm 桌面 UI 拆解 —
  `https://fazm.ai/t/watch-claude-code-desktop-agent-ui`
  原文："Thinking appears as a collapsible block headed by a brain icon and
  'Thinking…' label that users can expand on demand"。
- **Evidence**: Claude API extended-thinking 文档 — content_block_start
  type:`thinking` 通过 stream-json 在 SDK 层是有的，**UI 渲染由各客户端自行决定**。
- **结论**: 折叠模式的"参考实现"在 desktop ext./Fazm，不在 CLI。

#### 3.2 elapsed 计时
- **Evidence**: Fazm 文章关键 quote — "Tool calls under 5 seconds display only a
  spinner. After 5 seconds, a timer appears and increments: '5s, 6s, 7s…' then
  switches to minute format. The implementation uses: `if elapsed >= 5` to gate
  the display."
- **Evidence**: Claude Code spinner 字符串实例（GH issue 引用）—
  `"Befuddling… (1m 56s · ↑ 2.3k tokens · thought for 1s)"` — 一行字符串里
  合并了 elapsed / tokens / thinking duration，** "thought for N s" 是稳定格式**。
- **结论**: **5 秒静默 → 秒级跳 → 升级到 `Nm Ms` 是金标准**。前端 setInterval
  即可，后端只在 turn 完成时推一次总时长做对账。

#### 3.3 Retry / 重发
- **本地探测**: `claude --help` 有 `--continue` / `--resume` / `--fork-session`，
  这些是 session 级 retry。message 级 retry 在 CLI 不存在。
- **Evidence**: GH issue #6643 / #16905 / #14526 / #55328 — 一系列报 "Esc to
  interrupt 不稳定" — 间接证明 **CLI 的 retry 路径就是 Esc 中断 + 重新输入**，
  没有 retry 按钮。
- **结论**: Claude Code 桌面 ext. 倒是有 hover toolbar，但公开材料没有 retry icon
  的细节描述；Fazm 文章明确说"没描述 retry/regenerate UX"。

---

### 4. TRAE

#### 4.1 Thinking 折叠
- **Evidence**: `https://docs.trae.ai/ide/side-chat` 文档 **未提及** thinking
  display；`traeide.com/docs/how-to-use-trae-side-chat` 同样不提。
- **推断**: 按现在主流 AI IDE 通用做法（GitHub Copilot Chat、Cursor、Nuxt UI
  `ChatReasoning` 组件），TRAE 大概率也是 streaming 期间自动展开 + 完成后折叠。
- **结论**: 无法验证，标 N/A。

#### 4.2 elapsed 计时
- 公开文档无 spec。结论 N/A。

#### 4.3 Retry / 重发
- **Evidence**: `https://traeide.com/docs/how-to-use-trae-inline-chat`
  原文："if you're not satisfied with the AI's response, you can click the
  **Retry button at the bottom left** of the chat box"。
- **Evidence**: Side Chat 文档列了 Accept All / Reject All / Copy / Insert at
  Cursor / Add to New File / Apply / Add to Terminal / Run 共 8 个 action —
  **没列 Retry**，说明 Retry 只在 Inline Chat 模式里有，Side Chat 模式靠重新发
  prompt。
- **结论**: TRAE 是少数 **inline 大按钮** 派，行为简单（替换当前 turn）。
  位置（bottom-left）比 hover toolbar 直观，但占用底部空间。

---

## 综合推荐给 ShadowFlow

### 思考折叠推荐

- **形态**: **默认折叠** + **streaming 时自动展开** + **turn 结束后自动收起**。
  Header = `chevron + 脑型 icon + "Thought for {elapsed}" + 灰色 token 数`，body
  为完整 reasoning 文本（plain markdown，不带 step header — Codex 那种 step header
  方案有用但 v8 没设计稿，留 Phase 2）。
- **触发方式**: 点击整个 header（不只 chevron），双击不触发其他行为；键盘 a11y
  待补。
- **借鉴自**: Cherry Studio（默认折叠的语义）+ Fazm desktop（brain icon + 折叠
  block 视觉）+ Claude Code desktop（streaming 自动展开）。
- **v8 设计稿对齐情况**: **v8 已经做了 80%**。`run-session-v8.html:1318-1437` 的
  `.tl-thinking:not(.open) .tl-thinking-body { display:none }` + `.tl-thinking.open`
  对应 inline mid-turn 自动展开；`Thought for N s` header 也已经在。
  **缺的只是**：把 elapsed 接通真实时间 + 完成态自动从 `.open` 切回折叠。

### elapsed 计时推荐

- **频率**: 前端 `setInterval(1000)` — **1 秒一次**。再快没意义（人眼分不清），
  再慢用户会觉得"卡了"。
- **格式**: `< 5s` 不显示（只 spinner）→ `5s, 6s, 7s, ..., 59s` 秒级 → `1m 0s,
  1m 1s, ..., 59m 59s` 分钟+秒 → `1h Xm` 小时（极少触发）。
  完成态 header 显示 `Thought for {final_elapsed}`（保留最终秒数，不再跳）。
- **实现策略**: **前端 setInterval (基于 first thinking content_block_start
  timestamp)** 主导驱动。**后端只在 turn 完成时推一次 final_elapsed**，前端拿
  到时 stop interval + 用后端值覆盖（避免前后端时钟漂移）。
  - 收到 `content_block_start { type: "thinking" }` → 记 `startedAt = Date.now()`
    + start interval。
  - 收到 `content_block_stop`（thinking 那块）→ stop interval + freeze elapsed。
  - 收到 turn 完成事件含 final_elapsed → 用后端值替换前端跳出来的数字。
- **借鉴自**: Fazm 的 `if elapsed >= 5` 5 秒静默规则 + Claude Code spinner 的
  `Nm Ns` 格式。

### Retry 推荐

- **触发位置**: **分两个交互，不要混**。
  1. **失败态**（API error / network fail / abort）: assistant turn 位置直接显
     红/橙色 inline banner + 大号 `↻ Retry` 按钮，按钮在 banner 内。
  2. **成功态**（用户对结果不满意要重跑）: message bubble **hover** 时右下角出
     现工具栏（copy / branch / regenerate icon），regenerate 是 `↻` icon。
- **行为**:
  - 失败 retry: **abort 当前 SSE channel → 同 turn id 重发**（不开新 turn，
    保留 user message，只换掉 assistant 那一块）。
  - 成功 regenerate: **开新 branch**（保留旧 reply 作为 sibling，UI 上可切换），
    避免 Cherry Studio "旧回复污染 context" 的反例。
- **UX 细节**:
  - 失败 retry 按钮**不需要 confirmation**（用户明显是出错才点）。
  - 成功 regenerate 按钮**也不需要 confirmation**（branch 是无损操作，可回滚）。
  - **不清空 attachment**（user 消息的附件保留在 user turn 里，retry 只重跑
    assistant 那块，不动 user 那块）。
  - Attached file 如果是大文件，retry 时复用同一 file_id，**不重新上传**。
- **借鉴自**: TRAE Inline Chat 的"失败态 bottom-left Retry"思路 + Cherry Studio
  的"成功态 hover regenerate" 位置 + ChatBox 社区呼吁的"就地替换或开 branch
  让用户选" 行为。

---

## 给 FE Implementer 的 1-2 条最实用建议

1. **优先攻 elapsed 计时这一项**——v8 折叠 markup 已经在，**只欠真实秒数驱动**。
   实现路径就是上面的 `setInterval(1000)` + base = `content_block_start
   (type:thinking)` ts。**不要等后端推送 elapsed**——后端只用来对账最终值。
   这是 4 小时之内可以让 UI 从"静态稿"变成"和 Claude Code 桌面同档"的最高 ROI
   改动。

2. **失败态 Retry 和成功态 Regenerate 分开做**，先做失败态。失败态只是 banner +
   按钮 + 复用 turn id（SDK 层 abort + 重发），UI 没歧义；成功态涉及 branch
   切换器，**先放到 Phase 2**，避免重蹈 Cherry Studio "v1 branch 设计被吐槽
   要重构" 的覆辙。

---

## Sources

- Cherry Studio chat docs: https://docs.cherry-ai.com/docs/en-us/cherry-studio/preview/chat
- Cherry Studio regenerate discussion: https://github.com/CherryHQ/cherry-studio/discussions/2025
- Cherry Studio reasoning summary issue #11924: https://github.com/CherryHQ/cherry-studio/issues/11924
- Cherry Studio disable thinking issue #11839: https://github.com/CherryHQ/cherry-studio/issues/11839
- Codex CLI intermediate thinking display issue #5476: https://github.com/openai/codex/issues/5476
- Codex CLI streaming thinking issue #5339: https://github.com/openai/codex/issues/5339
- Codex macOS app reasoning summaries issue #10723: https://github.com/openai/codex/issues/10723
- Codex reasoning config: https://deepwiki.com/feiskyer/codex-settings/8.3-reasoning-configuration
- Claude Code desktop UI breakdown (Fazm): https://fazm.ai/t/watch-claude-code-desktop-agent-ui
- Claude Code Esc to interrupt bugs: https://github.com/anthropics/claude-code/issues/6643, /16905, /14526
- Claude API streaming + content blocks: https://platform.claude.com/docs/en/build-with-claude/streaming
- TRAE Inline Chat retry: https://traeide.com/docs/how-to-use-trae-inline-chat
- TRAE Side Chat actions: https://traeide.com/docs/how-to-use-trae-side-chat
- TRAE official docs (side-chat): https://docs.trae.ai/ide/side-chat
- Nuxt UI ChatReasoning component reference: https://ui.nuxt.com/docs/components/chat-reasoning
- GitHub Copilot Chat auto-collapse issue: https://github.com/microsoft/vscode/issues/292119
- Local CLI probes (this session):
  - `claude --print --output-format=stream-json "what is 2+2"` → only emits `assistant`/`text` blocks, **no `thinking` block** in raw CLI output
  - `codex exec "what is 2+2"` header → contains `reasoning effort: high`, `reasoning summaries: none`, no elapsed/spinner
  - `claude --help` → has `--continue` / `--resume` / `--fork-session` but **no per-message retry flag**
