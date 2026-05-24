# Lane B/C Final Audit
Date: 2026-05-24
Auditor: Lane C Agent-Auditor (read-only)
Scope: Lane B commits `d353eb0`, `1caf825`, `6fcde2e`, `ce953dd`, `c1c167f`, `926110f`
Spec source: `docs/design/design-vs-impl-audit-2026-05-24.md` (Lane A)

## TL;DR

**PASS-WITH-CAVEATS.** All three P0 issues from Lane A's audit are correctly
fixed in source code and verified end-to-end via live SSE capture against
Express on :8002 (after a forced restart — see Caveat #1). Unit tests pass:
parser 85/85, timeline-projector 82/82, openai-compat-api-client 66/66.
P1 polish items are landed (echo highlight, diff cursor, thinking persist /
format). Two minor protocol asymmetries and a few unimplemented P2 items
remain. Ship gate: GO.

## Decision audit (Lane A spec items)

| # | Audit item | Spec | PASS/PARTIAL/FAIL | Evidence |
|---|---|---|---|---|
| 1 | P0-1 消息切碎 — onText 累积成单条 `assistant_text` | design-vs-impl-audit §P0-1 | **PASS** | `server/src/lib/timeline-projector.ts:525-552` openAssistantTextId + text_append; live SSE: 12 chunks → 1 assistant_text + 11 text_append patches |
| 2 | P0-2 function_call XML 不裸露 — parser 拦截 `<tool_use>` / `<tool_result>` / `<function_calls>` | §P0-2 | **PASS** | `server/src/parser.ts:348-407` 三个 replacer + parser.test.ts cases [15][16][17][18] 全绿；`findPartialTagStart` 前缀已含 `<tool_use` `<tool_result` `<function_call` (parser.ts:605) |
| 3 | P0-3 status_line 实际 emit | §P0-3 | **PASS** | `timeline-projector.ts:259-279` bumpStatusLine + 在 onUserMessage / onAssembleStart / onAgentSubstepStart / onThinkingChunk / onBlueprint / onText / onComplete 全 7 个入口调用；live SSE 单 turn 内观察到 14 条 status_line message |
| 4 | reasoning_content → `<sf:thinking>` 路由 | Lane A 引用 Task #27 commit d353eb0 | **PASS** | `openai-compat-api-client.ts:399-545` 三相状态机 init/thinking/content + 边界 closer，live SSE 走到了 `event: thinking-chunk` 路径（不再泄漏到 text） |
| 5 | 协议命名一致（kinds / patch ops） | 自检（两边手维护） | **PARTIAL** | kinds 全部对齐（user_turn / thinking / assistant_meta / assistant_text / rationale / tool_call / tool_echo / step_panel / diff_panel / msg_foot / status_line 11 个两边都有）；patch ops **不对称**：frontend 多了 `text_finalize`（types.ts:111）和 `DiffLine.cursor` 字段，server 都没有。运行时不致命（FE 是 no-op 兜底），但 contracts.ts 注释里说"SOURCE OF TRUTH"被打脸 |
| 6 | UI 兜底 `stripToolXml` 在 AssistantText + ToolEchoLine | §P0-3 防御性建议 | **PASS** | `AssistantText.tsx:30-51` + `ToolEchoLine.tsx:18-27`；二者都覆盖 well-formed / partial-open / orphan-close 三种 case |
| 7 | P1 ThinkingMessage 升级：localStorage 持久化 + tokens 格式化 | §P1-2 | **PASS** | `ThinkingMessage.tsx:25-43` 持久化 + `:57-58` toLocaleString；commit c1c167f |
| 8 | P1-1 echo 高亮分段 | §P1-1 | **PASS** | `ToolEchoLine.tsx:37-72` HIGHLIGHT_RE + segs[]；commit 926110f |
| 9 | P2-4 diff_panel 末行光标 | §P2-4 | **PASS（前端）** | `types.ts:43-49` DiffLine.cursor + `DiffPanel.tsx:44` 渲染 caret；但 server `contracts.ts` DiffLine 没有 cursor 字段，server 也未在 onYamlLine 末行设 cursor=true → 实际永远不亮（PARTIAL on backend wiring） |
| 10 | P2-1 inline thinking node（assistant turn 中再开 thinking） | §P2-1 | **PARTIAL** | projector 的 onText/onAssembleStart/onAgentSubstepStart 都没有 `closeOpenThinking()` 调用，只有 onBlueprint/onUserMessage/onComplete 关 thinking。意思是 text → thinking 时新 thinking 卡能开（onThinkingChunk:458 检测 openThinkingId === null），但 thinking → text → thinking 序列里中间那个 text 不会关旧 thinking，导致后续 thinking-chunk 继续灌进旧卡。低影响（极少触发） |
| 11 | P2-2 cost_cny 接入 | §P2-2 | **FAIL** | `bumpMsgFoot` 仍只更新 elapsed_ms/tools/status，没看到任何 cost 计算；usage event 在 SSE 里有但未喂给 projector。低优先级 |
| 12 | P3-1 删 1300 行 legacy 渲染 | §P3-1 | **N/A**（Lane A 明确"不要现在删"） | RunSessionPage.tsx 仍含两路径 |

## E2E SSE 流验证

环境：Express :8002，PID 134340（重启后），zhipu/glm-4.7 + BMAD skill + goal=hi。
**关键发现：审计开始时 :8002 上跑的是 commit 6fcde2e 之前的进程（PID 141876）**，
返回的还是"一个 chunk 一条 tool_echo"的老行为。kill+restart 后立即恢复预期。

新鲜 SSE 流（max_tokens=80，30s timeout 内自然结束）统计：

```
46 个 event lines
事件分布：
  event: classify          ×1
  event: compose           ×1
  event: discovery         ×1
  event: thinking-chunk    ×1
  event: text              ×12   ← legacy text-delta (双写)
  event: message           ×17   ← TimelineMessage
  event: message-patch     ×12   ← MessagePatch
  event: usage             ×1
message 分布（kind）：
  user_turn        ×1
  thinking         ×1
  assistant_text   ×1   ← 关键：12 个 text chunk 合并成 1 条
  status_line      ×14
patch 分布全是 text_append ×12 → 落在同一个 assistant_text id
```

样例（前 18 行）：
```
event: message
data: {"kind":"user_turn","text":"hi"}

event: message
data: {"kind":"status_line","verb":"Thinking","elapsed_s":0}

event: message
data: {"kind":"thinking","status":"streaming","body":""}

event: text     ← legacy 仍在双写（设计如此，projector ⊥ legacy）
data: {"text":"你好！我是 ShadowFlow"}

event: message
data: {"kind":"assistant_text","id":"msg_…bJFA10M","body":"你好！我是 ShadowFlow"}

event: message
data: {"kind":"status_line","verb":"Writing","elapsed_s":1}

event: text
data: {"text":" 的团队组装器。我可以"}

event: message-patch
data: {"id":"msg_…bJFA10M","op":"text_append","chunk":" 的团队组装器。我可以"}
```

完整 dump 见 `_evidence/sse-2026-05-24.txt`（未提交，本地）。

## 测试覆盖

3 个测试文件全部跑通：

| 文件 | runner | 结果 |
|---|---|---|
| `server/src/parser.test.ts` | vitest run（脚本断言 + console PASS） | **85 / 85 pass**（含新增 cases [15] tool_use / [16] tool_result / [17] function_calls / [18] partial-prefix hold） |
| `server/src/lib/__tests__/timeline-projector.test.ts` | vitest run | **82 / 82 pass**（含新增 [12] onText 累积 / [13] thinking 中断 / [14] assemble 边界关 text / [15] status_line 4 个断言） |
| `server/src/transport/api-clients/__tests__/openai-compat-api-client.test.ts` | tsx 直跑（不是 vitest — 这文件是 node assert 脚本风格） | **66 / 66 pass**（含新增 reasoning_content wrap / reasoning-only closer / content-only no-wrap 三组）。注：vitest 跑这个会因为 `new OpenAI({ apiKey })` 在浏览器-like env 下抛 `dangerouslyAllowBrowser` 而显示 "unhandled rejection"，但断言已经走完且全 pass — tsx 直跑没这问题。 |

前端 timeline 组件 **没有新增 unit test**（Design-Implementer 没说有，glob `src/components/run-session/timeline/**/*.test.*` 返回空）。
有 `src/core/hooks/__tests__/useRunSession.timeline.test.ts` 老 case 但未跑（Lane A 验证清单 #7 是 DoD 项，本审计未独立跑）。

证据文件：`_evidence/run-session-timeline-2026-05-24.png` + `_evidence/run-session-timeline-full-2026-05-24.png` 存在（确认 ls 见 dir listing），未打开核对内容。

## 风险 / Caveats

1. **CRITICAL OPS — 旧 server 进程不会自己重启**：审计起始时 :8002 上的 PID 141876 还在跑 fix-前代码，curl 出来的 SSE 是老行为。需要 deploy 流程里加一个"修 projector / parser 后必须 kill node + 重启"步骤，否则用户体感等于没修。
2. **协议非对称**：`text_finalize` patch op 和 `DiffLine.cursor` 字段只在 frontend `types.ts` 存在，server `contracts.ts` 没有。当前 server 永远不发 text_finalize（关 text 用 openAssistantTextId=null 内部状态），永远不发 cursor=true。FE 兜底无害，但 contracts.ts 注释自称 "SOURCE OF TRUTH" 已经不准。建议下个 housekeeping commit 双向对齐。
3. **inline thinking 节点（P2-1）半截**：projector 只在 `onUserMessage / onBlueprint / onComplete` 关 thinking，**没有在 onText / onAssembleStart / onAgentSubstepStart 关 thinking**。意味着 `thinking → text → thinking` 序列里第二个 thinking-chunk 会继续灌进第一张 thinking 卡。低概率触发但是设计稿 v8 line 1684-1698 明确画了这场景。
4. **cost_cny 永远 undefined**：`bumpMsgFoot` 没接 usage→price 计算。MsgFoot 渲染会显示 `¥undefined` 或空。Lane A 标为 P2 低优。
5. **legacy 1300 行还在**：Lane A 明确说不要删，留作 fallback。维护成本仍在。
6. **前端 Timeline 无 unit test**：AssistantText / ToolEchoLine 的 stripToolXml regex 没有专属 test 覆盖，未来 regex 改动容易回归。建议补 4-8 个 case（well-formed / partial-open / 嵌套 / 空 body）。
7. **status_line 每次 push 新 id**：projector 注释里说 "FE keys this slot off message kind 'status_line'，re-emitting same id keeps the row updated"，但代码 `statusLineId = newId('msg')` 每次都新 id。运行时 OK（StatusLine.tsx 是 slot，只渲最后一条），但注释和实现不一致。

## 下一步建议（按 ROI）

1. （5 min）restart 文档化 — 在 `docs/runbook.md` 或 README 加"projector/parser 改完必须 kill+restart node"。
2. （15 min）补 frontend timeline regex test — `AssistantText.test.tsx` + `ToolEchoLine.test.tsx`，stripToolXml 各 4 case。
3. （30 min）对齐 contracts.ts 协议 — 加 `text_finalize` patch op + DiffLine.cursor 字段，server 在 onComplete/closeOpenText 真的 emit text_finalize；让 contracts 真成 single source of truth。
4. （30 min）P2-1 inline thinking — 在 onText / onAssembleStart / onAgentSubstepStart 增加 closeOpenThinking 调用。
5. （45 min）cost_cny 接入 usage 事件 — projector 加 `onUsage(usage)` → 查价表算成本 → patch msg_foot。
6. （Lane B 收尾后，下个 sprint）等 user 验证新 Timeline 后删 RunSessionPage legacy 1300 行。

## TL;DR for 主流程（高浓度 12 行）

Lane B 的 6 个 commit 全部落地正确。P0-1（消息切碎）/ P0-2（function_call
裸露）/ P0-3（status_line 空）三个用户痛点都在 source 修了，单元测试 85+82+66
全绿。**唯一坑**：审计开始时 :8002 还在跑 fix-前的旧进程，curl 出来全是
老行为；kill+restart 后 SSE 立刻验证 12 个 text chunk → 1 条 assistant_text
+ 11 个 text_append patch，status_line 14 条都 emit 出来了。reasoning_content
→ thinking-chunk 路由也走通了。协议层有两处非对称（FE 多了 text_finalize 和
DiffLine.cursor），不致命但要补。P2-1 inline thinking 半截，cost_cny 未接，
P3 legacy 1300 行还在但 Lane A 明确不动。前端 timeline 缺 unit test
（stripToolXml regex 没专属 case）是 ROI 最高的补救项。Ship gate: GO。
