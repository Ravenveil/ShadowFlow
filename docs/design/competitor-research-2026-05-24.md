# Competitor UX Research — Thinking Stream / Tool Calls / Multi-Agent
Date: 2026-05-24
Author: Agent-Research-Competitors
Scope: ShadowFlow run-session sidebar redesign baseline

---

## TL;DR

1. **Thinking = collapsed card by default, expandable.** Every modern agent UI
   (Claude Code VS Code ext., Cursor 2.0, Fazm desktop, Zed Agent Panel) renders
   the model's chain-of-thought as a *collapsible block headed by a brain/cloud
   icon* with token count or "thought for N s" metadata, body hidden until
   click. The terminal CLIs are the **bad** baseline — Codex CLI drops
   intermediate steps until the end, Claude Code CLI discards thinking entirely.
   That's exactly the protocol layer ShadowFlow is sitting on top of, and why
   "function_call XML 裸露" leaks through.
2. **Tool calls = single-line chip with status + collapsed result.** Universal
   pattern: spinner→checkmark, one-line params preview, expandable result panel,
   consecutive same-type calls *grouped* ("40 actions" merged) — Fazm calls these
   "Tool Calls", ShadowFlow's design v8 has `.tl-tool` + `.tl-echo` which is the
   exact same pattern, just not wired to the CLI stream parser yet.
3. **Multi-agent = sidebar of named agent cards, each with status pill + live
   progress line.** Cursor 2.0 (8 parallel agents) and ShadowFlow v8 converge on
   this. Cursor's innovation: each agent runs in its own git worktree and the
   sidebar lets you *diff their outputs*. ShadowFlow's intent is similar (Team
   pane with policy matrix overlay) but more YAML-config-centric.
4. **The real ShadowFlow gap is *the bridge layer*, not the UI design.** v8
   already has the pattern library. What's missing is the translator that
   converts `claude-code-cli-api-client` stream-json events
   (`content_block_start type:thinking` / `tool_use`) into the
   `tl-thinking` / `tl-tool` / `tl-echo` messages the timeline already knows
   how to render. The XML leakage in current UI = translator gap, not design
   gap.

---

## ShadowFlow design intent (baseline)

Source: `/tmp/design-platform-5/run-session-v8.html` (3243 lines), plus
`agent-timeline-redesign-compare.html` (489 lines), `intent-workflow-design v1`
referenced inline.

### Layout

- **Center pane: ConversationTimeline.** Replaces v3 `.stream`. Vertically
  scrolls user-turn → thinking → assistant turn → tool calls → step panels →
  YAML diff → inline thinking → msg-foot.
  See `run-session-v8.html:1318-1437` (`.tl-*` CSS), `:1576-1707` (markup).
- **Bottom: statusline** — always-on Codex/Claude Code-style ("Configuring … N
  tools used"). `:1708`.
- **Right pane: team-canvas with floating Policy Matrix.** PM is a mini RACI
  grid pinned top-right. `.pm-mini` `:738-770`.
- **Per-agent detail in `.ag-panel.d-mode`** — slim 5-tab strip (Identity /
  Persona / Model / Tools / Memory) with one unified pane below.
  `:766-1057`.

### Block vocabulary in v8

| Block class | Purpose | Visual signature |
|---|---|---|
| `.tl-user` | User input | `❯` caret + plain text |
| `.tl-thinking` | Pre-answer or inline reasoning | Cloud icon + "Thought for N s" + token count + chevron, body folded |
| `.tl-meta` | Assistant turn header | Model pill (Claude · Sonnet 4.5) + dot + "已识别 Team 模式" |
| `.sec-label` + `.tl-reason` | "RATIONALE" block | Pre-label + accent recess + bullet list |
| `.tl-tool` | Tool invocation chip | `●` lead + tool name + grey args + optional `查看模板 ↗` link |
| `.tl-echo` | Tool result preview | `⎿` glyph + body, additive (green) / deletive (red) coloring |
| `.tl-panel` | Multi-step progress | Header (chev + count + elapsed) + nested `.tl-step` + `.tl-substep` |
| `.diff-block` | File edit YAML diff | Gutter + `+`/`−` marks + add/del coloring + current-line cursor |
| `.msg-foot` | Per-turn summary | Pulse dot + "Running" + duration + tools count + tokens + ¥cost |
| `.statusline` | Always-on bottom bar | Brain glyph + verb ("Configuring") + meter |

### Key intent points

- **Thinking is folded by default** (`.tl-thinking:not(.open) .tl-thinking-body
  { display:none }`), but the *inline mid-turn* variant ships with class `open`
  (line 1701) — i.e. **pre-answer thinking collapsed, in-progress thinking
  expanded** so the user sees the stream while it runs.
- **Tool call shape: chip + echo pair.** `.tl-tool` is one short line ("fork_template
  academic-paper · @ravenveil"), `.tl-echo` is the result blurb. The pair
  reads "I called X. Here's what came back." Multiple calls stack vertically.
- **Step panel for orchestrated work.** When the LLM emits a "configuring N
  things" plan, render as `.tl-panel` with checkbox-style child steps. This is
  the **YC office-hours/Linear timeline** influence (see `compare.html:218
  ref · linear.app / trigger.dev`).
- **Per-turn msg-foot** is the visual punctuation. Without it, turns smear
  together. v8 makes this *mandatory*.
- **Dark/light parity built in** — `.frame-dark` accent `#A855F7`, `.frame-light`
  accent `#d97757` (Claude orange). Already token-driven.

---

## 1. Claude Code CLI

### Source of truth

Live capture from this machine: `claude --print --output-format=stream-json
--verbose`. Full sample at
`C:\Users\jy\.claude\projects\D--VScode-TotalProject-ShadowFlow\094cbafa-ec47-48ac-86b5-9ad0674ca486\tool-results\bmk6j5a3c.txt`.

### A. Thinking

**Wire format.** Server-Sent JSONL:
```json
{"type":"assistant","message":{"content":[{
  "type":"thinking",
  "thinking":"...prose...",
  "signature":"<opaque base64>"
}]}}
```

Stream events split into `content_block_start` (kind: `thinking`),
`content_block_delta` (`thinking_delta` with `thinking` field), `content_block_stop`.

**CLI rendering.** GitHub issue
[#36006](https://github.com/anthropics/claude-code/issues/36006) — extended
thinking is **invisible by default** in the CLI. Tokens are discarded before
render. Regression
[#13564](https://github.com/anthropics/claude-code/issues/13564) explicitly
calls out "thinking indicator and collapsed blocks not displayed in UI".

**VS Code extension rendering** (what users actually see and want):
- Collapsed block with brain icon
- Click to expand
- `Ctrl+O` toggles all blocks in session
- One *signature* per block (Anthropic anti-extraction)

### B. Tool calls

**Wire format:**
```json
{"type":"assistant","message":{"content":[{
  "type":"tool_use",
  "id":"toolu_01LdsDMpfzpyNzhU1iLjqfm5",
  "name":"Bash",
  "input":{"command":"ls","description":"List files in current directory"}
}]}}
```

Followed by:
```json
{"type":"user","message":{"content":[{
  "type":"tool_result",
  "tool_use_id":"toolu_...",
  "content":"...stdout...",
  "is_error":false
}]}}
```

**CLI rendering.** In terminal: tool name + first ~80 chars of input on one
line, output rendered as code block, exit status implicit. Successive Bash
calls stack as separate blocks (no grouping).

**Third-party desktop wrappers** (Fazm, Zed, hikari-desktop, Claude Code Side
Panel) render as **status-indicator card**: spinner→✓, one-line preview,
elapsed counter after 5 s.

### C. Multi-agent

Claude Code CLI itself runs a single agent loop. Sub-agents (Task tool) appear
as nested `tool_use` with `name:"Task"` and `parent_tool_use_id` chaining.
Terminal renders them flat; desktop wrappers indent or threaded.

### D. Long output

Terminal: raw scroll. VS Code ext: code blocks get language-aware highlighting,
collapse threshold ~50 lines. Hikari/Fazm: virtualized list, "show more" cutoff.

### E. Font / visual

- Terminal: terminal font (whatever user has), color = ANSI palette.
- Anthropic brand orange `#d97757` for accents in their official UIs.
- Thinking blocks in VS Code ext: italic? — actually rendered same weight, just
  in a bordered card with brain icon. The icon does the work.

### Evidence

- Sample stream JSON: `bmk6j5a3c.txt` (cited above)
- ShadowFlow already parses it: `server/src/transport/api-clients/claude-code-cli-api-client.ts:62-90` (block protocol comments), `:397` (`<sf:thinking step="extended" origin="cli">` wrap), `:428-430` (`<tool_use name="..." id="...">…</tool_use>` wrap)
- [GitHub #36006](https://github.com/anthropics/claude-code/issues/36006) — collapsed thinking request
- [GitHub #36462](https://github.com/anthropics/claude-code/issues/36462) — terminal collapsible sections
- [Fazm desktop article](https://fazm.ai/t/watch-claude-code-desktop-agent-ui) — "seven streamed block types"

---

## 2. OpenAI Codex CLI

### A. Thinking

**Display modes** ([GitHub openai/codex#5476](https://github.com/openai/codex/issues/5476)):
- `none` — no reasoning shown
- `auto` (default) — only after last reasoning step, dumped just before the
  next tool call → **users perceive lag**
- `experimental` — full verbose, "overwhelming"

**Bug** ([#5339](https://github.com/openai/codex/issues/5339)): the VS Code
extension streams each reasoning block as it lands; the CLI batches them. So
CLI ≠ extension UX even from the same vendor.

### B. Tool calls

`--json` flag → JSONL with event types: `thread.started`, `turn.started`,
`turn.completed`, `turn.failed`, `item.*` (agent messages, reasoning, command
executions, file changes, MCP tool calls, web searches, plan updates), `error`.

Interactive TUI:
- Syntax-highlighted **diffs** for file mods
- Markdown code blocks for terminal output
- "Action transcript" — reviewable, rollback-able list
- Approval gate per shell command

### C. Multi-agent / Multi-step

- **Plan updates** (`item.plan_update`) — explicit plan items, evolves
- **Subagent parallelization** (opt-in, expensive)
- **Queue** — Tab to queue follow-up input; Enter mid-execution to inject new
  instructions

### D. Long output

Stream to stderr, final answer to stdout. Diffs syntax-highlighted; large
shell output truncated with "show more".

### E. Font / visual

Terminal-native. Plan = bulleted markdown box. Diffs = unified format with
green/red. No real "card" pattern in CLI itself.

### Evidence

- [Codex CLI features](https://developers.openai.com/codex/cli/features)
- [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive) — `--json` event taxonomy
- [openai/codex#5476](https://github.com/openai/codex/issues/5476) — display modes
- [openai/codex#5339](https://github.com/openai/codex/issues/5339) — streaming gap

---

## 3. TRAE (ByteDance)

### Architecture

VS Code fork. Agent = "SOLO Builder" — multi-step planning + scaffold execution.
MCP-native (Figma, web search, etc.). Multi-model (Claude 3.7 Sonnet, GPT-4o,
DeepSeek R1, Gemini 2.5 Pro) without BYOK keys.

### A. Thinking

Treated as **"structured thinking"** — a tool of its own. Agent toolkit
explicitly includes `structured_thinking` alongside `file_edit` / `bash_exec`
([trae-agent on GitHub](https://github.com/bytedance/trae-agent)). So thinking
is rendered like any other tool call — discrete cards, not invisible inner
monologue.

### B. Tool calls

Standard VS Code chat pane convention: collapsible per-tool card with name,
params, result. Approval gating for destructive ops (terminal).

### C. Multi-agent

SOLO mode is *one autonomous agent* that may invoke sub-tools. Not parallel
fleets like Cursor 2.0. Plan-track visible in side panel.

### D-E

Inherits VS Code look. No distinctive visual contribution.

### Evidence

- [bytedance/trae-agent README](https://github.com/bytedance/trae-agent)
- [Trae IDE review (DigitalOcean)](https://www.digitalocean.com/community/tutorials/trae-free-ai-code-editor)

### Takeaway for ShadowFlow

Thinking-as-tool is interesting but **conflicts** with ShadowFlow v8's
intent — v8 treats thinking as a *first-class block type* with its own visual
identity (cloud icon, accent color). Don't merge thinking and tool cards.

---

## 4. Cursor 2.0 / Composer

Shipped Oct 29 2025.

### A. Thinking

Per [cursor.com/blog/2-0](https://cursor.com/blog/2-0): "Agent View lets
developers watch reasoning unfold live." Each specialized sub-agent
(Architect / Planner / Implementation) shows its thinking inline in the
sidebar.

Not collapsed by default — Cursor's bet is that *seeing the thinking* sells the
intelligence. (ShadowFlow v8 makes the opposite call: collapsed by default,
*except* for the currently-streaming inline thinking.)

### B. Tool calls

- **"Context pills"** show what files / code regions each agent is touching
- Real-time progress strings: "searching codebase", "editing files"
- Diffs presented in a *unified review* across multiple files (not file-at-a-time)

### C. Multi-agent — THE distinguishing feature

- **Up to 8 agents in parallel** on the same prompt
- Each runs in its own **git worktree** or remote machine — no file conflicts
- **Right-side sidebar = list of agent cards**. Each card:
  - Agent name (user-assigned)
  - Status: running / completed / waiting
  - Progress indicator (spinner / checkmark)
  - Current action one-liner
  - Output log on expand
- **Compare outputs side-by-side** to pick the winner

### D. Long output

Unified diff view across files; reduces "cognitive overhead" of file-jumping.
In-editor browser tool for testing UI changes.

### E. Font / visual

Cursor's standard dark UI; no public detailed spec. Inferred from screenshots:
sans-serif body, monospace for tool args, accent on active agent's card.

### Evidence

- [Cursor 2.0 blog](https://cursor.com/blog/2-0)
- [Cursor changelog 2.0](https://cursor.com/changelog/2-0)
- [Parallel Agent Mode guide (Medium)](https://medium.com/towards-data-engineering/parallel-ai-agents-in-cursor-2-0-a-practical-guide-e808f89cffb9)
- [Neura blog: Mastering parallel mode](https://blog.meetneura.ai/parallel-agent-mode/)

---

## 5. GitHub Copilot Workspace / Agent Mode

### A. Thinking

"You can see its reasoning, decision-making process, and the tools it uses"
([GitHub blog](https://github.blog/ai-and-ml/github-copilot/agent-mode-101-all-about-github-copilots-powerful-mode/)).
Rendered inline in the chat pane as text, not as a distinct collapsed block.

### B. Tool calls

- Every tool invocation transparently shown in UI
- **Terminal tool requires explicit approval** (consent gate)
- Per-edit "Undo Last Edit" affordance in view title bar

### C. Multi-step plan (Planning feature, Oct 2025 preview)

**Two-format plan:**
- **Markdown plan** — user-facing, updates visibly in editor as steps complete
- **JSON plan** — machine-readable, evolves behind the scenes as steps
  reorder/adapt
- Progress tracked step-by-step; build / test outcomes monitored; loop until
  green

### D. Long output

VS Code native — collapsible code blocks, language-aware highlighting,
problems-panel integration.

### E. Font / visual

VS Code default theme. No distinctive visual identity beyond standard Copilot
chat panel.

### Evidence

- [VS Code agent mode intro](https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode)
- [GitHub blog: agent mode 101](https://github.blog/ai-and-ml/github-copilot/agent-mode-101-all-about-github-copilots-powerful-mode/)
- [VS Magazine: Planning feature preview](https://visualstudiomagazine.com/articles/2025/10/23/hands-on-with-new-visual-studio-copilot-planning-feature-preview.aspx) — *behind paywall*

### Takeaway for ShadowFlow

The **markdown plan that visibly updates** is a strong pattern — exactly what
ShadowFlow's `.tl-panel` + `.tl-step` already does. The dual-format (md for
humans, json for machines) is a good architectural mirror.

---

## Pattern Library

12 patterns distilled, ordered by ROI for ShadowFlow.

### Pattern 1 — Thinking card: collapsed-by-default, inline-streaming-open

- **Folded form** when finished: `[brain] Thought for 0.8s · 632 tokens · ›`
- **Open form** while streaming: brain pulses, body visible, accent border
- One sentence summary (`preview`) on the head so you don't *have* to expand
- Used by: Claude VS Code ext, Fazm, Zed, ShadowFlow v8
- **Status in SF v8: ✅ designed (`.tl-thinking`), ❌ not wired to CLI stream**

### Pattern 2 — Tool chip + result echo pair

- One-line chip: `● tool_name  args_preview          link↗`
- Echo line: `⎿ result blurb` (or expandable result panel)
- Successive same-tool calls grouped ("40 actions" → collapsible parent)
- Used by: ShadowFlow v8, Fazm, GitHub Copilot
- **Status in SF v8: ✅ designed (`.tl-tool` + `.tl-echo`), ❌ leaking as XML**

### Pattern 3 — Status pill on every turn (msg-foot)

- Pulse dot + `Running` / `Done` / `Failed`
- Duration · tools count · tokens · cost
- Visual punctuation — turns don't smear
- Used by: ShadowFlow v8, partial in Codex CLI
- **Status: ✅ designed, ❌ may be missing on real run-sessions**

### Pattern 4 — Always-on statusline at the bottom

- Codex/Claude Code style "what is it doing right now"
- Brain glyph + verb (`Configuring`, `Reading`, `Editing`)
- Survives between turns
- Used by: Codex CLI, Claude Code CLI, ShadowFlow v8
- **Status: ✅ designed, ❌ unclear if wired**

### Pattern 5 — Step panel for orchestrated multi-step work

- Header with chevron + N steps + elapsed
- Nested `.tl-step` (done / run / pending) + `.tl-substep`
- Markdown-renderable in plain text too (Copilot Planning style)
- Used by: ShadowFlow v8, GitHub Copilot, Linear timeline
- **Status: ✅ designed**

### Pattern 6 — File-edit diff as first-class block

- `.diff-block` with gutter + `+`/`−` + add/del coloring
- Cursor-line indicator while streaming
- Stats badge: `+18 −0`
- Used by: ShadowFlow v8, Codex CLI, Cursor 2.0, Copilot
- **Status: ✅ designed**

### Pattern 7 — Multi-agent sidebar of named cards

- Per-agent: name + status pill + current-action line + expand→log
- Cursor 2.0's killer feature; ShadowFlow's team pane is the analogue
- ShadowFlow goes further: floating Policy Matrix (RACI) over the canvas
- Used by: Cursor 2.0, ShadowFlow v8 team-canvas + `.pm-mini`
- **Status: ✅ designed**

### Pattern 8 — Plan as living markdown (Copilot)

- Render the agent's plan as actual markdown checklist that mutates as steps
  complete
- Lets user *read* and even *edit* the plan
- Used by: GitHub Copilot Planning, Codex CLI plan-update events
- **Status: ⚠️ partial — `.tl-panel` is close but not editable markdown**

### Pattern 9 — Approval gates inline (Observer Card)

- Card with `Approve` / `Dismiss` buttons baked into the conversation
- One-tap decision, then renders as immutable history with chosen action
- Used by: Fazm (Observer Card), Copilot terminal approval, ShadowFlow's
  ExternalAgentApprovalCard
- **Status: ✅ ExternalAgentApprovalCard exists, but not part of timeline kit**

### Pattern 10 — System event card (recovery / hang / interrupt)

- Colored-border card (blue=info, orange=warn, gray=user-interrupt)
- Six discrete subtypes in Fazm
- "Show details" toggle
- Used by: Fazm, partially Claude Code CLI
- **Status: ❌ not in v8**

### Pattern 11 — Consecutive-block grouping ("40 actions")

- When N tool calls in a row, collapse into one parent row
- Expand to see individual calls
- Critical for agents that do hundreds of file reads
- Used by: Fazm desktop UI
- **Status: ❌ not in v8 (each tool call is its own row)**

### Pattern 12 — Compare-outputs view for parallel agents

- Cursor 2.0's "8 agents, pick the winner"
- Side-by-side or tabbed diff between agent outputs
- Used by: Cursor 2.0 only
- **Status: ❌ not in v8; lower ROI for ShadowFlow (different positioning)**

---

## ShadowFlow current implementation vs Pattern Library

| Pattern | Designed in v8? | Wired in code? | Visible to user? | Gap |
|---|---|---|---|---|
| 1. Thinking card | YES `.tl-thinking` + `ThinkingMessage.tsx` | partial | `<sf:thinking>` wrap reaches client (`claude-code-cli-api-client.ts:397`) but **upstream parser may not strip it back into a `kind:'thinking'` message** | **Translator: stream-json → timeline message** |
| 2. Tool chip + echo | YES `.tl-tool` + `ToolCallChip.tsx` | partial | Server wraps as `<tool_use name="..." id="...">…</tool_use>` (`:428-430`) but timeline likely shows raw XML | **Same translator** |
| 3. msg-foot status | YES `.msg-foot` + `MsgFoot.tsx` | unclear | usage event fires (`stop_reason: tool_use` / `end_turn`) — needs to convert into msg-foot data | Wire usage events → MsgFoot props |
| 4. Statusline | YES `.statusline` + `StatusLine.tsx` | unclear | Needs current-verb derivation | Verb-from-event mapper |
| 5. Step panel | YES `.tl-panel` + `StepPanel.tsx` | unclear | Needs `tl-panel` message-kind in `MessageRegistry` | **Add `kind:'step_panel'` message type** |
| 6. Diff block | YES `.diff-block` + `DiffPanel.tsx` | unclear | Wire file-edit tool calls (`Edit`, `Write`) to render diffs | Tool-result→diff renderer |
| 7. Multi-agent sidebar | YES team-canvas + `.pm-mini` | partial | Likely needs per-agent timeline streams | Per-agent message stream |
| 8. Plan as living markdown | partial (step panel ≠ md) | NO | — | Plan editor component |
| 9. Approval gates | YES `ExternalAgentApprovalCard` exists | YES but separate | Bring into TimelineMessage kit | Register as `kind:'approval'` |
| 10. System events | NO | NO | — | New `kind:'system_event'` |
| 11. Group consecutive tools | NO | NO | Critical for `find` / `read` heavy agents | `MessageRegistry` collapser |
| 12. Compare outputs | NO | NO | — | (skip — out of positioning) |

### The bridge layer — root cause of "function_call XML 裸露"

Real source: `server/src/transport/api-clients/claude-code-cli-api-client.ts:428-430`:

```ts
} else if (b.kind === 'tool_use') {
  const inputStr = JSON.stringify(b.input ?? {}, null, 2);
  out.push(`<tool_use name="${b.name}" id="${b.id}">\n${inputStr}\n</tool_use>`);
```

The server is **deliberately** wrapping Claude Code stream events in pseudo-XML
because the downstream `parser.ts` is text-protocol only (line 40 comment:
"text-protocol skills but cannot drive the v2 runtime"). The XML *is* the
ShadowFlow internal protocol. **The frontend timeline must learn to parse
`<sf:thinking>` and `<tool_use>` tags and dispatch to `ThinkingMessage` /
`ToolCallChip`** — not show them as raw text.

---

## Recommendations (ranked by ROI)

### R1. Wire the stream-json → TimelineMessage translator. (highest ROI)

The design is done, the components exist, the data is on the wire. The single
biggest fix is one parser pass:

- `<sf:thinking step="extended" origin="cli">…</sf:thinking>` →
  `{kind:'thinking', label:'Thinking', body:'…', status:'streaming'|'done'}`
- `<tool_use name="X" id="Y">JSON</tool_use>` →
  `{kind:'tool_call', name:'X', args_summary:firstLineOf(JSON)}`
- Following `<tool_result tool_use_id="Y" name="X" is_error="false">…</tool_result>` →
  `{kind:'tool_echo', body:'…', parent:'X'}`

Lane B's clean-up assignment. Lives in `src/components/run-session/timeline/`
parser, not in the server.

### R2. Make incremental thinking *stream into an open card*, not chunk per chunk.

Today the worry is "each chunk = new line". Solution: when a `thinking_delta`
arrives, **append** to the open `ThinkingMessage.body` (don't create a new
message). Use `ThinkingMessage` `defaultOpen={true}` when `status==='streaming'`,
then on `thinking_finalize` flip to `defaultOpen={false}` (folded once done).

This is the v8 design intent (`.tl-thinking.open` for inline, plain
`.tl-thinking` for pre-answer), just not implemented yet.

### R3. Group consecutive tool calls (Pattern 11).

Claude Code agents do 20+ Read/Bash in a row. Currently each becomes its own
`.tl-tool` row, which buries the actual narrative. Add a `MessageRegistry`
collapser: if last N messages are all `kind:'tool_call'` with same `name`,
render as one `Grouped { name, count, latestArgs, expandable }` block. Fazm's
"40 actions" pattern.

### R4. Add `kind:'system_event'` for interrupts / hangs / recoveries.

Today when CLI process dies or user hits ESC, the timeline goes silent. Add a
gray-bordered card with icon + verb. Six subtypes per Fazm:
`sessionRecovered`, `sessionRecoveryEmpty`, `toolHangCanceled`,
`taskHangCanceled`, `userInterrupted`, `processCrashed`.

### R5. Wire usage → `MsgFoot` props at end of turn.

`{"type":"result","duration_ms":25942,"total_cost_usd":0.32,"usage":{...}}` is
the signal. Map to `{ status:'done', durationMs, toolCount,
inputTokens+outputTokens, costUsd }`. Render `MsgFoot` on
`stop_reason:'end_turn'`.

### R6. Statusline verb-mapper.

Listen for last in-flight event:
- `tool_use:name=Read` → "Reading {file}"
- `tool_use:name=Edit/Write` → "Editing {file}"
- `tool_use:name=Bash` → "Running {first-word-of-command}"
- `thinking_delta` → "Thinking…"
- idle → blank

Maps to existing `.statusline .verb` slot.

### R7. (lower priority) Bring `ExternalAgentApprovalCard` into the TimelineMessage kit.

It already exists per the memory index (`ExternalAgentApprovalCard_CN_preview.png`).
Register as `kind:'approval_request'` so it lives in the conversation stream
rather than as a separate modal.

### R8. (lower priority) Plan editor (Copilot dual-format).

Render `.tl-panel` from a markdown source that the user can also click to
edit. Decisions like "skip step 4" can mutate the agent's queue. Mid-priority
since it's a new behaviour, not a bug-fix.

---

## Direct CSS / file pointers for Lane B

- v8 design tokens: `/tmp/design-platform-5/run-session-v8.html:42-69` (dark) and `:71-89` (light)
- Thinking CSS: `:1411-1437` — copy verbatim
- Tool chip + echo CSS: search `.tl-tool` and `.tl-echo` from `:1387` onward
- Step panel CSS: search `.tl-panel`, `.tl-step`, `.tl-substep`
- Diff block CSS: search `.diff-block`
- msg-foot CSS: search `.msg-foot`
- Statusline CSS: search `.statusline`
- ShadowFlow current components: `D:/VScode/TotalProject/ShadowFlow/src/components/run-session/timeline/messages/*.tsx`
- ShadowFlow CLI client (the XML emitter): `D:/VScode/TotalProject/ShadowFlow/server/src/transport/api-clients/claude-code-cli-api-client.ts:428-435`

---

## Sources

- [Claude Code CLI #36006 — collapsed thinking](https://github.com/anthropics/claude-code/issues/36006)
- [Claude Code CLI #36462 — collapsible sections](https://github.com/anthropics/claude-code/issues/36462)
- [Claude Code CLI #13564 — thinking display regression](https://github.com/anthropics/claude-code/issues/13564)
- [Fazm desktop — seven block types](https://fazm.ai/t/watch-claude-code-desktop-agent-ui)
- [Anthropic extended-thinking docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- [Codex CLI features](https://developers.openai.com/codex/cli/features)
- [Codex non-interactive JSON events](https://developers.openai.com/codex/noninteractive)
- [openai/codex#5339 — thinking streaming](https://github.com/openai/codex/issues/5339)
- [openai/codex#5476 — display modes](https://github.com/openai/codex/issues/5476)
- [Cursor 2.0 blog](https://cursor.com/blog/2-0)
- [Cursor 2.0 changelog](https://cursor.com/changelog/2-0)
- [Cursor Composer RL blog](https://cursor.com/blog/composer)
- [Cursor 2.0 parallel agents (Medium)](https://medium.com/towards-data-engineering/parallel-ai-agents-in-cursor-2-0-a-practical-guide-e808f89cffb9)
- [Cursor parallel agent mode (Neura)](https://blog.meetneura.ai/parallel-agent-mode/)
- [Cursor 2.0 review (Cometapi)](https://www.cometapi.com/cursor-2-0-what-changed-and-why-it-matters/)
- [GitHub Copilot agent mode intro](https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode)
- [GitHub Copilot agent mode 101](https://github.blog/ai-and-ml/github-copilot/agent-mode-101-all-about-github-copilots-powerful-mode/)
- [Copilot Workspace project](https://githubnext.com/projects/copilot-workspace/)
- [VS Magazine: Copilot Planning preview](https://visualstudiomagazine.com/articles/2025/10/23/hands-on-with-new-visual-studio-copilot-planning-feature-preview.aspx)
- [bytedance/trae-agent GitHub](https://github.com/bytedance/trae-agent)
- [Trae IDE intro (DigitalOcean)](https://www.digitalocean.com/community/tutorials/trae-free-ai-code-editor)
- Live capture: `C:\Users\jy\.claude\projects\D--VScode-TotalProject-ShadowFlow\094cbafa-ec47-48ac-86b5-9ad0674ca486\tool-results\bmk6j5a3c.txt`
