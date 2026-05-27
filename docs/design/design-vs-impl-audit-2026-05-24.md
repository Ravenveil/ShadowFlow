# Design vs Implementation Audit — run-session 左栏
Date: 2026-05-24
Auditor: Agent-Design-Audit
Mode: 只读对比，不动代码

---

## TL;DR

设计稿（`docs/design/platform-v5/run-session-v8.html`，v8 是最终目标态）已经把 run-session
左栏完整设计成「按语义切片的对话流」：thinking 折叠卡 → assistant 元信息 → rationale →
tool_call chip → tool_echo 行 → step_panel → diff_panel → msg_foot → statusline。

当前实现（`src/components/run-session/timeline/`，由 useTimeline 默认启用）**骨架已经按
v8 全套搭出来了** — Timeline / MessageRegistry / 9 个 message kind 组件 + StatusLine slot
都齐了，CSS module 也按 v8 token 写好。但**最后一公里崩在 server 端 projector**：

1. **P0 致命**：`server/src/lib/timeline-projector.ts:438-449` 的 `onText(text)` 把**每个
   text-delta**（5-15 字符的流式片段）当成一条独立的 `tool_echo` message push 进去，
   导致前端 `Timeline.map(messages)` 渲一行/一条。这就是用户截图里"消息被切成很多碎片"
   的根因。
2. **P0 致命**：parser 只 strip `<sf:*>` / `<artifact>` 标签，**不识别 Claude Code CLI
   的 `<function_calls>` / `<invoke>` XML 块**。它们整段进 `event:text` → 走 onText →
   每段 XML 变成 `tool_echo` 直接渲染原文。这就是"function_call XML 裸露"的根因。
3. **P1 视觉**：前端组件 className 和 v8 完全一致、tokens 对齐，但**没有 "tool_call chip
   先于 tool_echo 出现" 的契约执行** — projector 只在 blueprint/diff 路径上 emit tool_call，
   纯文本 tool 调用根本生不出 chip，全是裸 echo。

修复点集中在 server 端（projector + parser），前端基本不动 — 这是好消息。

---

## 设计稿目标态（来自 run-session-v8.html）

### 整体布局
v8 line 109 `.app-body { grid-template-columns: 420px 1fr; }`

```
┌──────────── doc-hd 44px ────────────┐
│  ShadowFlow · breadcrumb · meta     │
├──────────── app-bar 52px ───────────┤
│  Logo · run_id · status pill · ...  │
├──── 420px ────┬──── 1fr ────────────┤
│  pane-l       │  pane-r             │
│  ┌─pane-l-head┤  ┌─toolbar v2 46px──┤
│  │ run meta   │  │ follow-chip ·    │
│  ├─.tl ───────┤  │ tabs · file id   │
│  │ tl-item    │  ├─canvas──────────┤
│  │   user     │  │ Overview/Team/   │
│  │ tl-item    │  │ Agent/Preview    │
│  │   thinking │  │ vpane            │
│  │ tl-item    │  │                  │
│  │   assistant│  │                  │
│  │     meta   │  │                  │
│  │     ratio  │  │                  │
│  │     tool   │  │                  │
│  │     echo   │  │                  │
│  │     panel  │  │                  │
│  │     diff   │  │                  │
│  │     foot   │  │                  │
│  ├─.statusline┤  │                  │
│  ├─.composer──┤  │                  │
└────────────────┴────────────────────┘
```

### 左栏 `.tl` 流（v8 line 1569-1715）

**关键原则**：tl 是「按语义切片的对话流」，不是 raw text stream。每个 `tl-item` 是一个
**完整语义单元**，靠 `border-top` 分割。token-level 流式增长发生在 message 内部
（thinking body / diff lines / step panel substeps），**永远不该产生新的 tl-item**。

九种 tl-item 形态（按出现顺序）：

| kind | DOM 类 | 视觉 | 流式行为 |
|------|--------|------|----------|
| user_turn | `.tl-user` | `❯ {goal}` 红色 caret + 加粗 b 标签 | 一次 push |
| thinking | `.tl-thinking` | 折叠云图标 + label + tokens + 展开 body（3 段 p） | 一次 push，body 逐 chunk append |
| assistant_meta | `.tl-meta` + `.model-pill` | `[Claude · Sonnet 4.5] · 已识别 Team 模式 · 3 个 Agent · serial` | 一次 push |
| rationale | `.tl-reason` | `RATIONALE` 紫色 + 紫色 ul 列表 | 一次 push |
| tool_call | `.tl-tool` | `● fork_template  academic-paper · @ravenveil  查看模板 ↗` | 一次 push |
| tool_echo | `.tl-echo` | `⎿ {body}` 单行说明 | 一次 push，紧跟 tool_call |
| step_panel | `.tl-panel` | 折叠 `5 个步骤 · 5.4s` + 子项列表 + 嵌套 substep | append_step / update_step 增长 |
| diff_panel | `.diff-block` | 文件头 + 行号 +- 高亮 + 末行光标 | diff_append_line 逐行 |
| msg_foot | `.msg-foot` | `● Running · 3m 42s · 4 tools · 632t · ¥0.012` | msg_foot_update 持续 |

固定 slot：

| slot | DOM 类 | 渲染位置 |
|------|--------|----------|
| status_line | `.statusline` | `.tl` 下方 / composer 上方，always-on |
| composer | `.composer` | 最底部 |

### 视觉 token（v8 line 41-54 dark）

```
--fl-accent / --accent      : #A855F7    (主色，紫)
--accent-bright             : #C084FC
--accent-tint               : rgba(168,85,247,.12)
--bg                        : #0a0a0a
--bg-elev-1..5              : #111 / #161616 / #1c1c1c / #222 / #282828
--fg-1..5                   : #f5f5f5 / #d4d4d4 / #a3a3a3 / #737373 / #525252
--border                    : rgba(255,255,255,.08)
--border-strong / -subtle   : rgba(255,255,255,.16) / rgba(255,255,255,.04)
--status-run / -ok / -warn / -err : #60a5fa / #34d399 / #fbbf24 / #f87171
--font-mono                 : 等宽，几乎所有 meta/timestamp/code 都用
```

### 字号/字距（关键差异常发地）

| element | font-size | font-family | weight | line-height |
|---------|-----------|-------------|--------|-------------|
| `.tl-user .txt` | 13.5px（继承） | sans | 500 | 1.6 |
| `.tl-thinking-head` | 10.5px | mono | 600 | — |
| `.tl-meta` | 11px | mono | — | — |
| `.tl-meta .who` | 11px | sans | 600 | letter-spacing -.005em |
| `.tl-reason` body | 12px | sans | — | 1.7 |
| `.tl-reason .pre` | 11px | mono | 600 | letter-spacing .04em |
| `.tl-tool` | 11.5px | mono | nm 600 | baseline align |
| `.tl-echo` | 11px | mono | — | 1.65 |
| `.tl-step` name | 12px | mono | — | — |
| `.tl-step .t` | 10px | mono | — | — |
| `.msg-foot` | 10.5px | mono | — | gap 7px |
| `.statusline` | 11px | sans/mono mixed | verb 600 | — |

### 颜色用法
- 紫色（accent-bright）只用在：rationale strong / model-pill brand / link / chev / em
- 蓝色（status-run）只用在：running indicator / spinner border / pulse dot
- 灰阶（fg-1..5）：fg-1 强调标题、fg-3 正文、fg-4/5 弱化辅助
- **从不**用 emoji 做语义图标（参见 .claude memory `feedback_no_system_emoji_icons`）

---

## 当前实现状态

### 1. `src/components/run-session/timeline/` 组件清单

```
Timeline.tsx              主容器，滚动 + 智能 stick-to-bottom，按 m.id 渲染
MessageRegistry.tsx       9 种 kind 的 switch dispatcher（status_line 排除在外）
types.ts                  TimelineMessage 联合类型 + applyPatch reducer（完整）
timeline.module.css       530 行，按 v8 .tl-* token 写好的 CSS module
messages/
  UserTurnMessage.tsx     20 行
  ThinkingMessage.tsx     75 行（folded/expanded + spinner）
  AssistantMeta.tsx       28 行
  RationaleMessage.tsx    24 行
  ToolCallChip.tsx        34 行
  ToolEchoLine.tsx        22 行 ← 关键：完全 raw passthrough，不做格式化
  StepPanel.tsx          140 行（折叠 + done/running/pending 过滤）
  DiffPanel.tsx           48 行
  MsgFoot.tsx             71 行
  StatusLine.tsx          33 行（slot，不在 stream 里）
```

骨架完整，**所有 v8 出现的语义形态都有对应组件**。

### 2. RunSessionPage 接入路径

```
src/pages/RunSessionPage.tsx:1695   useTimeline = localStorage 'sf.legacyLeftPane' !== '1'
                                    // 默认 true，走新 Timeline
src/pages/RunSessionPage.tsx:2217   {useTimeline && <Timeline messages={session.messages} />}
src/pages/RunSessionPage.tsx:2224   {!useTimeline && <…legacy 1300 行…/>}   // 用户拿不到
```

**两个 UI 路径完全互斥**，默认走新路径。legacy 路径只有手动设 localStorage 才走，
用户截图基本可以确认是新路径。

### 3. useRunSession state 机

```
src/core/hooks/useRunSession.ts:204  messages: TimelineMessage[]
src/core/hooks/useRunSession.ts:644  case 'MESSAGE':  push or 替换（按 id 幂等）
src/core/hooks/useRunSession.ts:661  case 'MESSAGE_PATCH': 找到 id → applyPatch
```

reducer 完全正确，applyPatch 在 `types.ts:134-192` 把所有 op（append_step / update_step
/ thinking_append_body / diff_append_line / msg_foot_update / ...）都实现了。**前端 reducer
不是 bug 来源**。

### 4. SSE 订阅（src/api/runSessions.ts）

```
line 458  es.addEventListener('text', …)        → handlers.onText            (legacy)
line 462  es.addEventListener('thinking-chunk',…)→ handlers.onThinkingChunk  (legacy)
line 476  es.addEventListener('message', …)     → handlers.onMessage         (new)
line 477  es.addEventListener('message-patch',…)→ handlers.onMessagePatch    (new)
```

订阅两套并行（设计如此 — projector 双写）。前端 reducer 同时消费 TEXT 和 MESSAGE 事件，
但 useTimeline 路径只渲染 messages，所以 chatReply 累积白做一遍（仅副作用：tokenCount 更新）。

### 5. Server projector（关键）

```
server/src/lib/timeline-projector.ts
  onUserMessage      → push user_turn         (1次)
  onClassify         → push assistant_meta    (1次/turn)
  onAssembleStart    → push step_panel 或 append_step
  onAssembleDone     → update_step
  onAgentSubstepStart→ append_substep
  onAgentSubstepDone → update_substep
  onThinkingChunk    → 首次 push thinking + 后续 thinking_append_body  ✓ 正确
  onBlueprint        → push tool_call("edit") + push diff_panel
  onYamlLine         → diff_append_line                                  ✓ 正确
  onText(text)       → push 一条新 tool_echo（**每次都新建**）        ✗✗✗ 这是 bug
  onComplete         → close thinking + msg_foot done
```

---

## 差异清单

### P0 · 用户已抱怨的明显错位

#### P0-1 · 消息被切成 5-15 字碎片
**症状**：用户截图里每条消息只有几个字，断断续续摊一长条。

- **设计稿要求**：v8 line 1620-1631
  ```html
  <div class="tl-tool">● fork_template  academic-paper · @ravenveil  查看模板 ↗</div>
  <div class="tl-echo">⎿ 从 academic-paper.v2（@ravenveil · 1.2k★）派生…</div>
  ```
  一次完整说明配成一行 echo，绝不会出现"半行的 tool_echo"。

- **实现 bug 位置**：`server/src/lib/timeline-projector.ts:438-449`
  ```ts
  onText(text: string): ProjectorEmit {
    const out = emit();
    if (!text.trim()) return out;
    out.messages.push({                       // ← 每个 chunk 一条新消息
      id: newId('msg'),
      kind: 'tool_echo',
      turn_id: turnId,
      ts: nowMs(),
      body: text,                             // ← body 就是这一片 chunk 的原文
    });
    return out;
  }
  ```

- **数据流证据**：
  - `server/src/parser.ts:512` 把 LLM 流式输出的「非标签残余」一段一段 emit `event: 'text'`，
    每次 chunk 大小 = Claude SDK 每帧 delta 长度（典型 5-15 字符）。
  - `server/src/routes/run-sessions.ts:1050` 把 text 事件 1:1 forward 给 `projector.onText`。
  - 结果：1000 token 的回答 → 50-200 条独立 `tool_echo` message → Timeline.map 渲 50-200 行。

- **正确做法（v8 隐含契约）**：tool_echo 应该和 tool_call 是**1:1 配对**的语义单元，
  不是 chatReply 的载体。普通自由文本应该走**独立的新 kind**（如 `text_segment` 或
  `assistant_text`）并且**在 projector 内部 buffer 直到段落边界**（换行/句号/超时 N ms）
  才落地成一条 message + 之后的 chunk 走 `text_append` patch 在同一条上增长。

#### P0-2 · function_call XML 原文裸露
**症状**：用户截图里看到完整的 `<function_calls><invoke name="...">...</invoke></function_calls>` 文本块。

- **设计稿要求**：v8 设计里**根本没有 XML 原文出现**。tool 调用一律渲染为：
  ```html
  <div class="tl-tool">
    <span class="lead">●</span>
    <span class="nm">{tool_name}</span>
    <span class="args">{args_summary}</span>
    <a class="link">{link.label} ↗</a>
  </div>
  <div class="tl-echo"><span class="glyph">⎿</span><span class="body">{结果 1 行说明}</span></div>
  ```
  即 tool_call chip + tool_echo 一行。

- **实现 bug 位置**：`server/src/parser.ts:494-501`
  ```ts
  // 只 strip <sf:...> 标签 + <artifact>，不识别 <function_calls> / <invoke>
  buffer = buffer.replace(/<sf:([\w-]+)>([\s\S]*?)<\/sf:\1>/g, …);
  ```
  也搜过 `anthropic-block-adapter.ts` — 那里的 `tool_use` 来自 Anthropic Messages API 的
  结构化 ContentBlock，但 **Claude Code CLI 输出走的是普通 stdout**，function_call 是
  Claude 自己写在 text 流里的 XML。parser 不识别它就一路漏到 `event:'text'`，进而（参见
  P0-1 路径）每个 chunk 一条 tool_echo，**裸 XML 字符直接渲染**。

- **影响**：
  - 视觉污染：用户看到 `<invoke name="Bash">` 字面量。
  - 缺少语义：tool 调用没有 chip → 没法 deep-link、没法折叠。
  - 命中 P0-1 的碎片化：XML 被切成 `<function`、`_calls>`、`\n<invoke` 这些片段。

- **正确做法**：
  1. parser 增加 `<function_calls>` / `<invoke>` / `<parameter>` block detect（同 `<sf:*>` 处理逻辑），
     emit 结构化 `event:'function-call' data:{ name, params, raw }`。
  2. projector 增加 `onFunctionCall(data)` → push `tool_call` message + 紧跟一条 placeholder
     `tool_echo` 等 function_result 回填。
  3. 结果回写时 update tool_echo body 为「N 行 / X bytes / 摘要」。

#### P0-3 · 默认 useTimeline=true 路径下，碎片 echo 渲染没有任何缓冲/聚合
**症状**：即便 P0-1 暂时不修 server，前端理论上也可以 fallback 做客户端聚合。当前完全
没有 — Timeline.tsx:91 直接 `.map(m)` 渲染 streamMessages，0 合并。

- **位置**：`src/components/run-session/timeline/Timeline.tsx:91`
- **建议**（防御性，不替代 server 修复）：在 `useRunSession` reducer 的 `MESSAGE` 分支
  里检测「连续 N 条同 kind=tool_echo 且 turn_id 相同且 ts 间隔 < 500ms」时，合并 body
  追加到最后一条而不是 push 新条。

---

### P1 · 视觉/契约未完全对齐

#### P1-1 · ToolEchoLine 不做任何格式化，body 直接 textContent 渲染
- 位置：`src/components/run-session/timeline/messages/ToolEchoLine.tsx:19`
  ```tsx
  <span className={styles.echoBody}>{msg.body}</span>
  ```
- 设计稿 v8 line 1630 里 body 含 `<span class="add">...</span>` 这种内嵌强调（绿色
  add / 红色 del）。当前实现没有任何子语法。
- 影响：即使 P0-1 修了，echo 也只是一坨纯文本，没有"diff stat 高亮 / 文件名加粗 / 数字
  monospace"。
- 建议：body 改成 `{segments: Array<{kind:'text'|'add'|'del'|'file'|'num', text:string}>}`，
  ToolEchoLine 按 segment 类型挂 class。

#### P1-2 · ThinkCard.tsx 是旧 ThinkingMessage 的并行实现，造成两套 thinking 卡
- 位置：`src/components/run-session/ThinkCard.tsx`（350 行）vs
  `src/components/run-session/timeline/messages/ThinkingMessage.tsx`（75 行）
- 现状：ThinkCard 只在 `!useTimeline` 的 legacy 路径用，Timeline 路径用 ThinkingMessage。
  当前默认走 ThinkingMessage。
- 风险：legacy 路径仍存活，未来 dev 改一个忘改另一个会很快漂移。**ThinkCard 已经做了
  state persistence（localStorage `sf:think:<sid>:<key>:expanded`）但 ThinkingMessage
  没有。** ThinkingMessage 还缺：
  - 持久化展开状态（每次刷新 thinking 全部折叠）
  - liveThinkMs 实时显示
  - tokens 数 toLocaleString 格式化
- 设计稿 v8 line 1584-1589 明确显示折叠头里有「Thought for **0.8s**」+「**632** tokens」
  + 「收敛 3 条候选 → Team 模式」三段。当前 ThinkingMessage 只有 `label + tokens + preview`。
- 建议：ThinkCard 的成熟特性 port 到 ThinkingMessage，删掉 ThinkCard 文件。

#### P1-3 · `tl-meta .who` 字体 / `.model-pill` 配色没验证
- v8 line 1602: `<span class="model-pill"><span class="brand">Claude</span><span class="sep">·</span><span class="ver">Sonnet 4.5</span></span>`
  brand 颜色是 `var(--accent-bright)`（紫），ver 颜色是 `var(--fg-3)`（中灰）。
- 实现 `AssistantMeta.tsx:17-21` 用了 modelBrand / modelVer className — 但**没看实际
  CSS module 里这两个类有没有写**（timeline.module.css 只读了前 80 行）。
- 行动项：让 Lane B 实施时确认 `.modelBrand { color: var(--accent-bright); }` 已落地。

#### P1-4 · `tl-item` 之间的 border-top 分割是关键视觉特征
- v8 line 1322-1323: `.tl-item + .tl-item { border-top:1px solid var(--border-subtle); }`
- 实现 `timeline.module.css:35` 已经实现。**但 P0-1 一旦让一个语义被切成 50 条 tool_echo，
  border-top 会变成 50 条横线，视觉上极度混乱**。即 P0-1 不修，此处永远歪。

#### P1-5 · sec-label 完全缺失
- v8 line 1610 / 1621 / 1634 用 `.sec-label` 把 assistant 回答内的不同子段（主线结论 /
  挑选蓝图 / 配置进度）分组，是关键的"语义切块"视觉。
- 实现：**没有任何对应的 message kind**。Timeline 里 rationale / tool_call / step_panel
  作为 tl-item 平铺，缺少"这是一个子段标题"的视觉提示。
- 建议：新增 `kind: 'sec_label'` 或者让 server projector 在 rationale / tool_call /
  step_panel 之前补一条 `sec_label` message（包含 title + count）。低优先级（不影响功能）。

---

### P2 · 设计稿有但实现完全没的功能

#### P2-1 · `.tl-thinking.open` 内嵌于 assistant turn 中
v8 line 1684-1698 演示了「inline thinking 节点」— assistant 已经在配置工具，但插一个
"思考中 · 选定第 3 个工具" 的展开的小卡（marker `style="margin-top:10px"`）。

- 实现 projector `onThinkingChunk` 在 `openThinkingId === null` 时才 push 新 thinking。
  设计稿要求**在已有 assistant turn 内**还能起新 thinking 节点。
- 当前逻辑会把整个 turn 的所有 thinking-chunk 串到第一个 thinking 卡里，导致 inline 思考
  完全丢失。
- 建议：projector 加一个 `closeOpenThinking()` 触发点 — 当 onText/onBlueprint 之后再
  来 thinking-chunk，应该开新卡。

#### P2-2 · msg_foot 的 cost_cny 货币
- v8 line 1711: `<span class="num">¥<b>0.012</b></span>` 显示成本。
- types.ts:91 `cost_cny?: number` 已有字段，server projector 没看到任何地方 update 这个
  字段。MsgFoot 渲染会输出 `undefined` / 0。
- 建议：projector 在 `bumpMsgFoot` 调用点接上 LLM 计费数据（usage × 价格表）。低优先级。

#### P2-3 · statusline 始终在 `.tl` 下面、composer 上面
- v8 line 1717-1730 把 statusline 放在 stream 容器外、composer 上方，是 always-on 底部
  胶水带。
- 实现 `Timeline.tsx:97` 已经按这个布局 render `<StatusLine />`：
  ```tsx
  {renderStatusLine && statusLineMsg && <StatusLine msg={statusLineMsg} />}
  ```
- 但**server projector 从来不 emit status_line 类型的 message**（看遍 timeline-projector.ts
  没有 `kind: 'status_line'` 出现）。结果：statusLineMsg 永远是 undefined，UI 下方一直
  空着。
- 建议：projector 加 emit `kind: 'status_line'` — 在 onAssembleStart / onThinkingChunk 等
  时机 push/replace 一条 id 固定的 status_line message，verb 字段反映当前主活动
  （"Thinking" / "Configuring" / "Writing"）。

#### P2-4 · diff_panel 末行 `<span class="cur">` 光标
- v8 line 1680: `<div class="diff-line add cur">` — 正在追加的行尾有闪烁光标。
- 实现 `DiffPanel.tsx` 我没读，但 `types.ts:42-46` `DiffLine` 没有 `cursor: boolean` 字段，
  应该是没有实现。低优先级。

---

### P3 · 实现有但设计稿没要的（应该删的）

#### P3-1 · `useTimeline` 之外的 1300 行 legacy 渲染（RunSessionPage.tsx:2224-3549）
- 这是 pre-S6.10 的旧实现，被 `!useTimeline` 包住。当前用户默认走不到。
- 留着的代价：维护负担（修 bug 容易只修一边）、`session.chatReply` / `session.thinkingMessage`
  这些 state 仍在被 reducer 更新（白做计算）。
- 建议：等用户验证新 Timeline 稳定后整段删掉。**不要现在删** — P0 修完之前 legacy 是 fallback。

#### P3-2 · `ThinkCard.tsx`（见 P1-2，重复关联，但单独列出便于 Lane B 注意）
- 删除前提：把它的 localStorage 持久化、liveThinkMs、tokens 格式化 port 给 ThinkingMessage。

#### P3-3 · `chatReply` 在 useTimeline 路径下被白计算
- `useRunSession.ts:622-643` 仍把每个 TEXT delta 累计到 `state.chatReply`。
- useTimeline 路径下没人读这个字段（除了 tokenCount 副作用）。
- 建议：reducer 加 `if (useTimeline) return state` 的快速短路。低优先级。

---

## 给 Lane B 实施 agent 的清单

按文件分组。**优先级 P0 先做，否则视觉永远歪。**

### `server/src/lib/timeline-projector.ts`（P0 主战场）

```
[P0] line 438-449 `onText(text)`:
  - 当前每个 chunk push 一条新 tool_echo。改为：
    1. 添加 projector 内部 `openTextMsgId: string | null` + `textBuf: string` 状态。
    2. 首个 onText 调用 push 一条新 kind（建议新增 `kind: 'assistant_text'`，types.ts
       同步），id 存到 openTextMsgId。
    3. 后续 onText chunk → emit patch `{ id: openTextMsgId, op: 'text_append', chunk }`。
    4. 在 onClassify / onAssembleStart / onBlueprint / onComplete 时
       `closeOpenText()` → 把 openTextMsgId 清掉，下次 onText 重新起一条新 message。
  - **不要复用 tool_echo** — tool_echo 必须留给 tool 调用的结果说明。

[P0] 新增 `onFunctionCall(data: { name, params, raw })`:
  - push 一条 `kind: 'tool_call'` message
  - 紧跟 push 一条空的 `kind: 'tool_echo'` 占位，id 记下来等结果
  - 新增 `onFunctionResult(data)` → 更新刚才那条 tool_echo 的 body
  - 这两个方法需要在 routes/run-sessions.ts 的 SSE switch 里加分支调用

[P1] line 376-398 `onThinkingChunk`:
  - 增加：在 onText/onBlueprint 之后再次收到 thinking-chunk 时，自动 closeOpenThinking()
    并新开一条 thinking（实现 P2-1 inline thinking node）

[P2] 新增 emit `kind: 'status_line'`:
  - 在 onAssembleStart / onThinkingChunk / onText 调用时 push 或 patch（id 固定 'statusline_v1'）
    一条 status_line message，verb 字段反映当前活动
  - onComplete 时 emit 一条 verb='Done', tools_running=0 的 final patch

[P1] cost_cny 字段填充:
  - bumpMsgFoot 调用点接入 token usage × 价格表（参考 server/src/lib/anthropic-block-adapter.ts）
```

### `server/src/parser.ts`（P0 主战场）

```
[P0] line 488-501 标签 strip 段:
  - 当前只识别 <sf:*> 和 <artifact>。增加：
    1. <function_calls>...</function_calls> 整块捕获
       → emit `event: 'function-call-group', data: { calls: [...] }`
    2. <invoke name="X"><parameter name="Y">...</parameter></invoke> 捕获
       → emit `event: 'function-call', data: { name: X, params: { Y: ... } }`
  - 参考已有的 unknown-tag handler（line 494-501）的写法
  - findPartialTagStart（line 527-546）需要把 `<function_calls` / `<invoke` 加进 known
    前缀，否则跨 chunk 流式时仍会泄漏

[P0] line 503-514 兜底 text emit:
  - 这里是 text-delta 的来源，碎片化的根因之一。短期不动这里（让 projector 端聚合），
    但留 TODO：未来 parser 自己做行级 buffer（遇到 \n 或 . 才 emit）
```

### `server/src/routes/run-sessions.ts`

```
[P0] line 1048-1052 event 分发:
  - 在 onText 调用之后增加：
    } else if (event === 'function-call' && data && typeof data === 'object') {
      flushProjector(projector.onFunctionCall(data as ...));
    } else if (event === 'function-call-result' && data && typeof data === 'object') {
      flushProjector(projector.onFunctionResult(data as ...));
```

### `src/components/run-session/timeline/types.ts`

```
[P0] line 22 MessageKind union:
  - 添加 'assistant_text'
  - （可选）'sec_label' 用于 P1-5

[P0] line 48 TimelineMessage union:
  - 添加：(TimelineMessageBase & { kind: 'assistant_text'; body: string })

[P0] line 100 MessagePatch union:
  - 添加：| { id: string; op: 'text_append'; chunk: string }

[P0] line 134 applyPatch:
  - 添加 case 'text_append': 处理 assistant_text body 累加
```

### `src/components/run-session/timeline/messages/` (NEW FILE)

```
[P0] AssistantText.tsx (新建):
  - 类似 ToolEchoLine 但渲染纯文本气泡，支持 code fence parsing
  - 复用 src/pages/RunSessionPage.tsx 内已有的 parseCodeFences 工具
  - 末尾 streaming 时挂闪烁 caret（同 RunSessionPage.tsx:2356-2367）
  - 样式参考 v8 .tl-echo 的 .body 但放宽宽度

[P0] FunctionCallCard.tsx (可选新建，或复用 ToolCallChip):
  - 接收 `kind: 'tool_call'` + name + args_summary + optional link
  - 已有 ToolCallChip 满足，但要确认 args 渲染支持 multi-line params
```

### `src/components/run-session/timeline/MessageRegistry.tsx`

```
[P0] line 30 switch:
  - 添加 case 'assistant_text': return <AssistantText msg={msg} />
  - （可选）case 'sec_label': return <SecLabel msg={msg} />
```

### `src/components/run-session/timeline/messages/ToolEchoLine.tsx`

```
[P1] line 19 body 渲染:
  - msg.body 改成 segments[] 接受结构化高亮（add/del/file/num）
  - 或保守做法：保留 string，但加 simple regex 把 `+N` `-N` `file.yml` 这种 pattern 包成
    <span class="add">/<span class="file">
```

### `src/components/run-session/timeline/messages/ThinkingMessage.tsx`

```
[P1] 整体升级（port 自 src/components/run-session/ThinkCard.tsx）:
  - 加 localStorage 持久化（sessionId + stepKey props）
  - 加 liveThinkMs 实时显示（streaming 时上调用方传 elapsedMs）
  - tokens 格式化 toLocaleString
  - body 段落分割改成 v8 的 3-段时间戳格式（如果 server 能提供 stream 切片）
```

### `src/components/run-session/ThinkCard.tsx`

```
[P3] 删除 — 但必须先把上面 ThinkingMessage 升级完成
```

### `src/core/hooks/useRunSession.ts`

```
[P0 防御性] line 644-659 case 'MESSAGE':
  - 在 push 新 message 前增加聚合检查：
    if (state.messages.length > 0) {
      const last = state.messages[state.messages.length - 1];
      if (last.kind === incoming.kind &&
          last.kind === 'assistant_text' &&        // 仅对纯文本聚合
          last.turn_id === incoming.turn_id &&
          incoming.ts - last.ts < 500) {
        // 合并 body 到 last
        return { ...state, messages: [...rest, { ...last, body: last.body + incoming.body }] };
      }
    }
  - 注意：projector 修复后这里基本不会触发，但是 fallback 安全网

[P3 低优] line 622-643 case 'TEXT':
  - useTimeline 路径下 chatReply 是死代码，加 short-circuit
```

### `src/pages/RunSessionPage.tsx`

```
[P3] line 2224-3549 整段 legacy:
  - **不要现在删** — P0 验证生效后再删（约 1300 行净减）
```

---

## 验证清单（Lane B 改完后跑）

1. 启动 dev server，打开 run-session 页面发一个会触发 function_calls 的指令
2. **零** `<function_calls>` / `<invoke>` 字面量出现在 DOM
3. assistant 自然语言回复呈现为**一个连续气泡**而不是多行碎片
4. 切 dark/light 主题，所有颜色 token 正确翻转
5. Console 无 React warning（特别 key 重复）
6. localStorage `sf.legacyLeftPane=1` 切换到 legacy 路径仍能正常工作（fallback 完好）
7. tsc + vitest 全绿（`useRunSession.timeline.test.ts` 现有 case 不被破坏）
8. 浏览器手工打 token-stream 慢速场景（throttle 到 1 char/100ms），无明显闪烁/抖动

---

## 文件路径汇总（绝对路径）

- 设计稿目标态：`D:/VScode/TotalProject/ShadowFlow/docs/design/platform-v5/run-session-v8.html`
- 前端组件：`D:/VScode/TotalProject/ShadowFlow/src/components/run-session/timeline/`
- 前端 CSS：`D:/VScode/TotalProject/ShadowFlow/src/components/run-session/timeline/timeline.module.css`
- 前端 reducer：`D:/VScode/TotalProject/ShadowFlow/src/core/hooks/useRunSession.ts`
- 前端 SSE 订阅：`D:/VScode/TotalProject/ShadowFlow/src/api/runSessions.ts`
- 前端入口页：`D:/VScode/TotalProject/ShadowFlow/src/pages/RunSessionPage.tsx`
- 服务端 projector（P0 主战场）：`D:/VScode/TotalProject/ShadowFlow/server/src/lib/timeline-projector.ts`
- 服务端 parser（P0 主战场）：`D:/VScode/TotalProject/ShadowFlow/server/src/parser.ts`
- 服务端 SSE 路由：`D:/VScode/TotalProject/ShadowFlow/server/src/routes/run-sessions.ts`

---

End of audit.
