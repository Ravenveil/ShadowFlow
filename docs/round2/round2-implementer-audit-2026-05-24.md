# Round 2 Implementer Audit
Date: 2026-05-24
Auditor: Agent-Auditor (Round 2)
Implementer commits: `1b36b25..4768938` (6 commits, 8 files)

## TL;DR

**NEEDS-WORK with 2 caveats** — code-level DoD (1, 2, 3, 6, 7, 8, 9, 10, 11) all PASS with
solid evidence. But **DoD-4 (≥4 row types) is PARTIAL** because Implementer added
`SectionHeader` infrastructure without **wiring** it (no MessageRegistry kind dispatches to
it; the 13 row types catalog from spec section "OpenDesign UI 证据" remains unrealized).
**DoD-5 (zero bubbles) is PARTIAL** — `.reason` (rationale) still has 10px radius +
color-mix accent background, which qualifies as a "bubble" per the user's TRAE/flat-row
expectation, even though all other rows (`.user`, `.thinking`, `.tool`, `.echo`,
`.text`) are flat.

The two highest-priority follow-ups: (a) actually emit `SectionHeader` from the projector
for agent identity / "思考过程" grouping; (b) flatten `.reason`.

---

## DoD 11 条复核

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | statusline 跳数字 | **PASS** | `Timeline.tsx:88-95` reverse for-loop picks last `status_line` (spec mandates `[...messages].reverse().find(...)`, Implementer used the more efficient backward `for` — equivalent + better). `StatusLine.tsx:34-43` 1Hz `setInterval` with `[msg.id, msg.verb, msg.elapsed_s]` deps. SSE live test: 2 status_line events fired with `elapsed_s` 0 → 3, distinct ids `msg_0mpjl0jep001vtTK7S66` → `msg_0mpjl0lpm001vvBNQFXK`. FE will pick the newer one then tick the seconds. |
| 2 | thinking 可折叠 | **PASS** | `ThinkingMessage.tsx:50-53` `useState(() => readPersistedOpen(...))` + `useEffect(writePersistedOpen)`. `localStorage` prefix `sf:think:tl:`. Head button has `aria-expanded`, body gated by `open && hasBody`. chev rotation class `thinkingChevOpen` confirmed. Default folded (`defaultOpen=false`). Pre-existing implementation; spec section 3.2 expected it already wired — confirmed. |
| 3 | user retry button | **PASS** | `UserTurnMessage.tsx:40-56` renders `RotateCcw` button only when `onRetry` is set, with `disabled={resending}`, `data-testid="rs-user-turn-retry"`. CSS `timeline.module.css:721-756`: `opacity:0` default, `.user:hover .userRetry` → `opacity:1`. Mid-pass `.user { padding-right: 30px }` (line 720) and `align-self: flex-start` keep button from overlapping wrapped text — verified in commit `9cfa4f0`. Wire chain: `RunSessionPage.tsx:2218-2225` → `Timeline.tsx:153 → MessageRegistry.tsx:41-46` → `UserTurnMessage onRetry`. |
| 4 | ≥4 核心 row types | **PARTIAL** | Existing row components in `messages/` directory: `UserTurnMessage`, `ThinkingMessage`, `AssistantMeta`, `AssistantText`, `RationaleMessage`, `ToolCallChip`, `ToolEchoLine`, `StepPanel`, `DiffPanel`, `MsgFoot`, `StatusLine`. New: `SectionHeader.tsx`. That's **11 dispatched + 1 helper** ≥ 4 baseline. ⚠ But **SectionHeader is not wired to any TimelineMessage kind** — `MessageRegistry.tsx:38-67` has no `'section_header'` case. It's a generic container exposed for future use. Spec's 13 row types catalog (TRAE-style `ToolReadChip`/`ToolBashChip`/`FileDiffChip`/`AttachmentChip`/`ThoughtSummaryRow`/`ModelInlineRow`/`StatsInlineRow`) are **not added**. The baseline 4 is met if you count by count; the spec **intent** (the v8/TRAE row-type system) is **not met**. |
| 5 | 零气泡 | **PARTIAL** | grep of `border-radius` shows max relevant row-content radius is `.reason { border-radius: 10px }` with `border: 1px solid var(--accent)` + `background: color-mix(...accent 10%...)` (CSS line 236-246) — this IS a bubble per the user's "零气泡" hard constraint. Other radius hits are: `.tool pre { 6px }` (code block — acceptable mono recess), `.panel { 8px }` (step panel container — debatable), `.echo` lacks any radius (flat). `.user`, `.thinking`, `.text` lack any background/radius on the row itself — confirmed flat. Real issue: `.reason` and `.panel` are still mini-bubbles. Implementer report didn't acknowledge this. |
| 6 | append-only 不变量 | **PASS (with one well-reasoned exception)** | `grep "delete\\|splice"` in `useRunSession.ts` MESSAGE reducer → 0 hits for `splice` and 0 hits for `delete` keyword on messages array. The two `state.messages.slice(0, -1)` at lines 676 + 688 are **merges, not deletes**: they replace the last message with `{ ...last, body: last.body + incoming.body }` when same `kind`+`turn_id` + ts gap <500ms. This is a valid coalescer; the row count net delta after a merge is 0 (1 old → 1 merged, no new row appears either). Spec's "组件出现就保留" semantics holds — user never sees a row disappear; only its body grows. State.edges filter at line 568 + activeSubsteps filter at line 596 are different state slices, not `messages`. |
| 7 | top status bar | **PASS** | `TopStatusBar.tsx:58-97`: 1Hz `setInterval` while `state==='running'`, freezes on `finalElapsedMs` when done/error. `costCny` undefined → `'—'` placeholder (matches Implementer's own decision #2). Rendered in `Timeline.tsx:138-147` when `renderTopBar` true. `RunSessionPage.tsx:2220` passes `renderTopBar` + `isComplete` + `hasError`. CSS `.topBar` + `.topBarPill` + `.topBarMeta` confirmed (lines 651-709). `startedAt` derived from `messages[0].ts` (Timeline.tsx:128-130) — matches decision #3. |
| 8 | ≥3 v8 动效复刻 | **PASS** | `grep "@keyframes" timeline.module.css` → 6 keyframes: `tl-slide-in` (37), `tl-fade-in` (41), `tl-pulse` (45), `tl-cur` (762), `tl-breath` (766), `tl-shimmer` (770). v8 source has 8 (`sf-spin`, `sf-pulse`, `sf-breath`, `sf-halo`, `sf-cur`, `sf-follow-pulse`, `dm-pane-in`, `sf-shimmer`). 6 ≥ 3 baseline. Names mostly map (tl-* vs sf-*). Usages confirmed: `.thinkingGlyph` uses `sf-pulse`, `.textCaret`/`.diffCaret` uses `tl-pulse`, `.thinkingBody`/`.diffLine` uses `tl-fade-in`, `.userRetry` uses `cubic-bezier(.4,0,.2,1)` transition, `.skeleton` uses `tl-shimmer`. Only `sf-halo` (radial ping) and `dm-pane-in` (DM panel slide) missing — neither is critical to left timeline. |
| 9 | tsc clean | **PASS** | `npx tsc --noEmit` filtered to `src/components/run-session/timeline\|src/core/hooks/useRunSession` → **0 errors**. Pre-existing baseline errors elsewhere (workflowStore, EditorPage) ignored per audit scope. |
| 10 | _evidence 截图 | **PASS** | 3 PNGs present in `D:/VScode/TotalProject/ShadowFlow/_evidence/`: `round2-implementer-2026-05-24.png` (142322 B), `-after.png` (140335 B), `-retry-visible.png` (142183 B). All committed in `4768938`. |
| 11 | 实现报告 | **PASS** | Implementer task notification covers 6 self-decisions + 3 follow-ups + full file list. Documented in audit input. |

---

## 6 个自主决策评价

| # | Decision | Verdict | 理由 |
|---|---|---|---|
| 1 | TopStatusBar **在 Timeline 内**（不进 RunSessionPage header） | **可接受** | 把它绑在 Timeline 组件树上，让 Timeline 是单一 prop-driven 单元，比让 RunSessionPage 自己再算 wall-clock + state 简单。但代价是 RunSessionPage 之后想在 timeline 外再渲染 wall-clock 时（如 floating overlay）需要复制一份。**短期合理，长期可能要抽 hook**。 |
| 2 | 费用 `¥ —` placeholder | **合理** | spec 没说 server emit cost。`0.00` 看上去像"免费"误导用户，`—` 明确"未知"。`formatCost(undefined) → '—'` (`TopStatusBar.tsx:41`)。**完全 OK**。 |
| 3 | `startedAt` 从 `messages[0].ts` 推导 | **可接受** | `Timeline.tsx:128-130` 用 `messages.reduce` 取最早 ts。在 99% 场景跟 session 开始时间一致。但**有 race**: SSE 先连上但还没收到第一条 message 时，TopStatusBar 显示 `—`；首条 message 到达时跳到正确值。如果用户期待开 page 那秒就开始计时，会看到一两秒空白。**Follow-up: RunSessionPage 用 sessionRow.created_at 显式传 startedAt 更准**。 |
| 4 | coalescer `slice(0,-1)` 保留 | **合理** | 详见 DoD-6。merge != delete，append-only 不变量保留。这是用户最关心的点之一 — Implementer 在 mid-pass 明确论证过。**OK**。 |
| 5 | retry button mid-pass 修 overlap | **合理** | 用 `padding-right: 30px` + `align-self: flex-start` 保护多行换行 prompt；button 落在 row 右侧而不挤占文本。`9cfa4f0` 提交里就这一项 14 行变更，干净。**OK**。 |
| 6 | **没**重写 assistant_text 拆 TRAE 子行 | **需重看** | 这是最严重的 gap。spec section "用户原话" + 第二轮补充 + "OpenDesign UI 证据" 都明确要求"主要还是左边的那个消息"做成 TRAE 行式（`ThoughtSummary` / `ToolReadChip` / `ToolBashChip` / `FileDiffChip` / `AttachmentChip` 等 13 row types）。Implementer 的理由"server 没发 `<sf:thinking>` tag 所以拆不了"**是真实约束但不是借口**：spec section 3.5 早就标了"server tag emit 是 Round 3 candidate"。问题是 Implementer 把整个 row-style 都搁置了，连不需要 server 配合的部分（如把 `assistant_text` 在 markdown 解析层识别 `\`\`\`bash` 代码块渲染为 `ToolBashChip`-like 块，或者把 `tool_call` chip 视觉重做）都没动。**结论：用户期望"明显变像 TRAE"在本 Round 没达成**。 |

---

## 真相检查（用户最关心的点）

### "左边消息按 TRAE 风格做" → 实际做到了哪一步？

**部分做到，但不显著**。
- ✅ Flat row 基础已就位 — `.user` `.thinking` `.tool` `.echo` `.text` 都无 background / 无大圆角，符合"统一缩进 + 浅灰色"。
- ✅ `.thinking` 有 chevron 折叠 + body 缩进（21px padding-left）— 这是 TRAE `└ Thought` 风格的核心元素。
- ✅ `.echo { padding-left: 14px }` 有左侧缩进 guide。
- ⚠ 没有显式 `└` ASCII 前缀或 vertical line gutter — TRAE 截图里非常 distinctive 的"行首竖线"在 implementer CSS 里**没复刻**。
- ❌ `assistant_text` 仍然是一整段 markdown 渲染，没有按 TRAE pattern 拆成 `ToolReadChip` / `ToolBashChip` / `FileDiffChip` 三种 inline pill。
- ❌ `SectionHeader` 组件存在但没被 MessageRegistry 调度 — `Builder` / `思考过程` / `工作·xxx` agent identity 仍走旧的 AssistantMeta。
- ❌ `RationaleMessage` 仍是 10px 圆角 + accent 背景的小气泡，不是 flat row。

**视觉相似度评估：从 0/10 到 ~5/10**。比 Round 1 强，但用户截图对比仍会觉得"差很多"——尤其在 `assistant_text` 段。

### "出现就出现，不要消失" → 真的 append-only 吗？

**Yes，append-only 不变量成立**。
- reducer MESSAGE case：`state.messages` 唯一的减少操作是 `slice(0, -1)` + 同时 push merged，net delta 0。
- MESSAGE_PATCH case：`map` 不 delete，仅替换。
- ABORT case：append 一条 marker，不删既有。
- statusline 是单例 slot 例外（Timeline.tsx 主动 filter 出来单独渲染）。
- ThinkingMessage `status='done'` 不触发任何删除，组件还在 DOM 里折叠。

**Verdict: 真的 append-only。Implementer 的决策 #4 经得起审计。**

### "动效都没实现" → 现在有几个？v8 还差几个？

**复刻 6 个，v8 总共 8 个，缺 2 个（且非关键）**。
- 已复刻：`tl-slide-in`, `tl-fade-in`, `tl-pulse`, `tl-cur`, `tl-breath`, `tl-shimmer`（且实际用在了 `.thinkingGlyph` / `.textCaret` / `.diffCaret` / `.thinkingBody` / `.skeleton` / `.diffLine`）。
- 缺：`sf-halo`（radial ping，主要用于右栏 agent 高亮，左 timeline 不需要）、`dm-pane-in`（DM 面板 slide-in，跟 timeline 无关）。
- transition 也补了：`.userRetry` 用 `cubic-bezier(.4,0,.2,1)`，`.thinkingChev` `.panelChev` `.sectionChev` 都有 0.15s transform transition。

**Verdict: 动效已经达标（DoD-8）**。用户上轮抱怨"动态效果都没实现"在本轮已经覆盖。

---

## 建议

### 立即 follow-up（如有 FAIL/PARTIAL 需要补）

1. **[DoD-5 fix] Flatten `.reason`** — 移除 `border-radius: 10px` + 改成 `border-left: 2px solid var(--accent)` 风格的 accent recess，跟 `.echo` `.tool` 同一种 flat 美学。预计 5 分钟，1 个 CSS hunk。
2. **[DoD-4 partial wire] 让 SectionHeader 真的渲染** — 在 `TimelineMessage` union 里加 `kind: 'section_header'`，projector 在 agent identity / step group 边界 emit 这个 kind；MessageRegistry 分发到 `SectionHeader`。预计 30-40 分钟。BE + FE 协同。

### 短期 follow-up（Round 2.5 / Round 3）

3. **assistant_text 拆 TRAE 子行** — 用 markdown parser 把 `\`\`\`bash` / `\`\`\`python` 代码块识别为 `ToolBashChip`-like 块；用 path-regex (`[A-Z]:\\...`) 检测文件读写做成 `ToolReadChip`。**不依赖** server tag emit，纯 FE 可做。预计 2-3 小时。这是补齐用户"看上去差很多"感觉的关键。
4. **TRAE `└` 左侧 gutter** — 在 `.item` 之间加 `border-left: 1px solid var(--border-subtle)` + 缩进，视觉上跟 TRAE 截图对得上。预计 20 分钟 CSS。
5. **startedAt 显式传** — RunSessionPage 用 `sessionRow.created_at` 而不是依赖 derive。修 race condition。10 分钟。

### 长期 follow-up（Round 3+）

6. **`cost_cny` server emit** — 各 provider stream done 时累加 token cost，sum 给 daemon，emit 在 SSE `final` event。前端 `formatCost` 就有真值了。
7. **server 发 `<sf:thinking>` tag** — 让 BMAD intent path 在 LLM tool_use 阶段显式发 thinking message 而不是塞到 assistant_text。配合 LLM-level tool calling loop 一起做。
8. **status_line 累积内存优化** — 长 session 会积几百条 dummy status_line。reducer 可以在 MESSAGE 收到 status_line 时 dedup（同 turn 覆盖前一条）。Spec section 7 R4 已经登记 backlog。
