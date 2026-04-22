# Story 2.9: ExternalMemoryBridge(drink/pour + fence + feedback)

Status: ready-for-dev-pending-river-baseline
Estimate: 5-7 人日（Epic 2 最重新增单项）
Created: 2026-04-17
Source: prd-hermes-integration-mvp.md v0.2 FR26-FR31 · implementation-readiness-report-2026-04-17-hermes.md §5.2 CRITICAL-2

## Story

As a **ShadowFlow gateway adapter（`gateway/hermes.py`）**,
I want **管理外部 agent 与 ShadowFlow 河流记忆之间的 drink/pour 双管道 + `<shadowflow-context>` fence 封装 + 写入反馈循环**,
so that **外部 agent 既可读取 ShadowFlow 档案馆（drink），也可提议回写沉淀（pour），并始终受 Write Gate 三重过滤与 fence 安全边界约束,不污染本地记忆,不合并两套高维表示**。

> **PRD 差异化锚点**：Innovation §2"两套记忆并存不合并"——Hermes HRR 是"工作台"、ShadowFlow 河流是"档案馆"，本 Story 是二者之间**唯一合法桥接**。

## Acceptance Criteria

### AC1: drink 管道 — river 档案馆读取 → Write Gate Read → fence 封装 → ACP context 片段

**Given** 外部 agent session 进入新一轮 `session.prompt` 构造前（gateway 钩子触发）
**And** agent-card `memory_bridge.mode ∈ {"two_way", "read_only"}` 且 `drink_from` 声明了可读地层（如 `["alluvium", "sandstone"]`）

**When** gateway 调用 `ExternalMemoryBridge.drink(query, agent_id, session_id, scope=drink_from)`

**Then** bridge 按以下流水线处理：
1. 调 `river.drink(query=query, scope=scope)`（河流记忆 v1 底座 API）
2. 结果经 **Write Gate Read 侧过滤**（trust_score × retrieval_count × context_similarity 三因子硬阈值，阈值由 river v1 底座定义）
3. 输出封装为 ACP `session.prompt` 的 `type: context` 片段：
   ```json
   {
     "type": "context",
     "fence": "shadowflow-context",
     "fence_uuid": "<uuid4 per-turn>",
     "text": "<drink result>"
   }
   ```
4. bridge 返回该 context 片段给 gateway，gateway 合入 `session.prompt` payload

**And** 每次 drink 产出一条 SSE 事件 `agent.memory_drink`（含 `agent_id / query / result_chunk_count / fence_uuid`）
**And** `memory_bridge.mode = "isolated"` 时 bridge 短路返回空 context，不调 river

### AC2: pour 管道 — ACP session.update 解析 → river.pour → Write Gate 三重过滤 → 分类回写

**Given** 外部 agent 在 session 中通过 ACP `session.update` 发送自定义 `type: "shadowflow_memory_proposal"` 消息：
```json
{
  "type": "shadowflow_memory_proposal",
  "candidates": [
    {"content": "...", "confidence": 0.82, "target_layer": "alluvium"},
    ...
  ]
}
```
**And** agent-card `memory_bridge.mode == "two_way"` 且 `pour_targets` 非空

**When** gateway 识别该 update 并路由到 `ExternalMemoryBridge.pour(candidates, agent_id, session_id)`

**Then** bridge 对每条 candidate 按顺序：
1. 调 `river.pour(candidate, source_agent_id=agent_id)`（河流 v1 底座 API）
2. river 内部 **Write Gate 三重过滤**（Write / Forget / Read 三门，阈值由 river v1 底座定义）
3. 候选分类到 `accepted | rejected | deferred` 三桶
4. 将 `source_agent_id=agent_id` 落在 sediment 候选元数据中（供 BriefBoard 显示来源）

**And** `memory_bridge.mode ∈ {"read_only", "isolated"}` 时 bridge 直接将所有 candidates 回归为 `rejected`（原因 `mode_not_writable`），不调 river
**And** 每批 pour 产出一条 SSE 事件 `agent.memory_pour`（含 `agent_id / accepted_count / rejected_count / deferred_count`）

### AC3: memory_feedback 回馈循环 — {accepted, rejected, deferred} 下一轮注回

**Given** AC2 产出分类结果 `{accepted: [...], rejected: [...], deferred: [...]}`

**When** 同一 session 下一轮 `session.prompt` 构造时

**Then** gateway 在 `shadowflow_envelope.memory_feedback` 字段注入上一轮结果（ACP payload 自定义扩展，不破坏 ACP wire）：
```json
{
  "shadowflow_envelope": {
    "memory_feedback": {
      "accepted": [{"candidate_id": "...", "settled_at_layer": "alluvium"}, ...],
      "rejected": [{"candidate_id": "...", "reason": "duplicate|low_confidence|mode_not_writable"}, ...],
      "deferred": [{"candidate_id": "...", "reason": "needs_social_signal"}, ...]
    }
  }
}
```

**And** feedback 注入是**单轮时效**（只注一轮），不在 bridge 内部持久保留
**And** 若上一轮无 pour 发生，`memory_feedback` 字段缺省（不发空对象）

### AC4: 三档 memory_bridge.mode 全覆盖 + mode 切换热生效

**Given** agent-card `memory_bridge.mode` 声明

**Then** 三档行为准确落地：
- `two_way`：drink 启用 + pour 启用（AC1 + AC2 全走）
- `read_only`：drink 启用 + pour 短路为全部 rejected（reason=mode_not_writable）
- `isolated`：drink 短路返回空 + pour 短路为全部 rejected

**And** 管理员通过 `shadowflow employee edit <agent_id>` 修改 agent-card mode 后，下一次 session 开启前 mode 切换生效（不要求热替换当前 session；切换行为通过 agent-card reload 钩子触发）

### AC5: 超时熔断 5s + BriefBoard 来源标识（FR31）+ 审计 trail

**Given** river.drink 或 river.pour 调用

**When** 任一调用超过 **5 秒**

**Then**：
- bridge 触发熔断：drink 返回空 context + warning 标记 `river_unreachable`；pour 将所有 candidates 分类为 `deferred`（reason=`river_timeout`），不丢弃
- SSE 事件 `agent.memory_bridge_circuit_break`（含 `agent_id / operation / elapsed_ms`）
- 该 session 后续同类型调用在 60 秒内直接走熔断路径（短路），60 秒后自动尝试恢复

**And** 所有 drink/pour/feedback 操作写入 trajectory.jsonl（FR40）：
```json
{
  "event": "memory_drink" | "memory_pour" | "memory_feedback",
  "agent_id": "hermes-01",
  "session_id": "...",
  "fence_uuid": "...",    // drink 专属
  "candidate_ids": [...], // pour / feedback 专属
  "result": {...}
}
```
**And** BriefBoard Sediment 视图展示 `source_agent_id` 字段（外部 agent 写入的 sediment 候选标注"来自 hermes-01"）——BriefBoard 展示层属 Story 7.N 范畴，本 Story 只保证**数据字段落地**

## Tasks / Subtasks

<!-- Sprint 1 readiness report 标注本 story 为 5-7 人日。建议 Sprint 1 按 a/b/c/d/e 五段落地：
  a) ExternalMemoryBridge 骨架 + drink 管道 + fence 包装（AC1 核心）
  b) pour 管道 + session.update 解析 + 分类桶（AC2 核心）
  c) memory_feedback 回馈循环（AC3）
  d) 三档 mode 分支 + agent-card reload（AC4）
  e) 熔断 + trajectory + SSE（AC5）
  本文件不预先拆文件,dev 按 Tasks 顺序分段 PR 即可 -->

### [AC1-a] drink 管道核心

- [ ] 新建 `shadowflow/runtime/memory_bridge/` 子模块：
  - [ ] `__init__.py`
  - [ ] `bridge.py`：`ExternalMemoryBridge` 类（drink/pour 两个 async 方法）
  - [ ] `fence.py`：`shadowflow-context` fence 构造 + UUID per-turn 生成 + 完整性校验
  - [ ] `types.py`：Pydantic models（`DrinkResult`, `PourResult`, `MemoryFeedback`, `SedimentCandidate`）
- [ ] `ExternalMemoryBridge.drink(query, agent_id, session_id, scope)`：
  - [ ] 调 `river.drink(query, scope=scope)`
  - [ ] 经 **Write Gate Read 侧过滤**（依赖 river v1 底座 API，此 AC 假设已存在 `river.gates.read_filter()`）
  - [ ] 封装 `{type: "context", fence: "shadowflow-context", fence_uuid: uuid4(), text: ...}`
  - [ ] 发 SSE `agent.memory_drink`
  - [ ] 返回 context 片段给 gateway

### [AC2-b] pour 管道 + session.update 解析

- [ ] `gateway/hermes.py` 扩展：路由 ACP `session.update`
  - [ ] 识别 `type: "shadowflow_memory_proposal"` → 调 `ExternalMemoryBridge.pour(...)`
  - [ ] 非识别 type 原样透传给现有 update 处理链
- [ ] `ExternalMemoryBridge.pour(candidates, agent_id, session_id)`：
  - [ ] 循环调 `river.pour(candidate, source_agent_id=agent_id)`
  - [ ] 按 river 返回分类 `accepted / rejected / deferred`
  - [ ] `source_agent_id` 落在 sediment 元数据（river.pour 参数传入）
  - [ ] 发 SSE `agent.memory_pour` 含三桶计数
  - [ ] 返回 `PourResult`

### [AC3-c] memory_feedback 回馈循环

- [ ] `ExternalMemoryBridge` 持有 `session_id → last_pour_result` 的**单轮缓存**（下一轮 prompt 取用即清）
- [ ] `gateway/hermes.py` 构造 `session.prompt` 前钩子：
  - [ ] 若 bridge 有 session_id 对应的 last_pour_result → 注入 `shadowflow_envelope.memory_feedback`
  - [ ] 注入后清空缓存
- [ ] 若上一轮无 pour，不注入 memory_feedback 字段（缺省）

### [AC4-d] 三档 mode 分支 + reload

- [ ] `ExternalMemoryBridge` 构造时注入 `agent_card_loader`（依赖注入，不直接读 YAML）
- [ ] drink/pour 入口按 `memory_bridge.mode` 分支：
  - [ ] `two_way` / `read_only` / `isolated` 三档走上述 AC1/AC2 路径
  - [ ] mode 不合法 → 抛 `InvalidMemoryBridgeMode`
- [ ] agent-card reload 钩子：`shadowflow employee edit <agent_id>` 后调 `agent_card_loader.reload(agent_id)`；下次 session 新开时生效（不重载当前 session）

### [AC5-e] 熔断 + trajectory + SSE + BriefBoard 字段

- [ ] 新建 `shadowflow/runtime/memory_bridge/circuit_breaker.py`：
  - [ ] 按 `(agent_id, operation ∈ {drink, pour})` 维度的 circuit breaker
  - [ ] `asyncio.wait_for(..., timeout=5.0)` → 超时计入 breaker，60s 内短路
  - [ ] 恢复时产出 `agent.memory_bridge_circuit_recover` 事件
- [ ] trajectory 事件写入（集成 Story 1.5 trajectory export）：
  - [ ] `memory_drink / memory_pour / memory_feedback` 三种事件
  - [ ] 字段含 `agent_id / session_id / fence_uuid / candidate_ids / result`
  - [ ] sanitize.py pattern 扫描确保无 API key（复用 Epic 5 Story 5.2）
- [ ] sediment metadata 字段 `source_agent_id` 确认 river v1 底座 pour API 已支持（若无 → 在 river 底座 story 加 AC）

### 测试

- [ ] `tests/test_memory_bridge_drink.py`：
  - [ ] river.drink mock 返回 → fence 封装正确 → UUID 唯一
  - [ ] Write Gate Read 过滤 mock 验证
  - [ ] `isolated` mode 短路
- [ ] `tests/test_memory_bridge_pour.py`：
  - [ ] session.update 解析 + candidates 路由
  - [ ] river.pour mock 分类结果 → 三桶正确
  - [ ] `read_only` + `isolated` mode 全部 rejected
- [ ] `tests/test_memory_bridge_feedback.py`：
  - [ ] 单轮缓存 → 下一轮注入 → 清空
  - [ ] 无 pour 时不注入
- [ ] `tests/test_memory_bridge_circuit_breaker.py`：
  - [ ] 5s 超时 → deferred / empty + warning
  - [ ] 60s 内短路
  - [ ] 60s 后自动恢复
- [ ] **集成**：Sprint 1 末在 Hermes v0.9.0 实机跑通 J2（研究员场景）drink/pour/feedback 三管道串行
- [ ] **E2E**：配合 Story 2.3 ACP Client 实装,跑 J2 完整剧本:prompt → drink → Hermes 推理 → memory_proposal → pour → next prompt → memory_feedback

## Dev Notes

### 架构依据

- **Epic 2 Goal**: ACP 作为 agent 接入核心协议；本 Story 是 ACP session 内部的 **ShadowFlow 扩展字段桥**（`type: context` / `type: shadowflow_memory_proposal` / `shadowflow_envelope.memory_feedback`）
- **AR 编号**: 无单列 AR；本 Story 实现 PRD §Innovation §2（两套记忆并存 + fence 桥接）
- **相关 FR**: FR26 / FR27 / FR28 / FR29 / FR30 / FR31（全部 6 条 drink/pour 桥接 FR）
- **相关 NFR**: NFR7（Fence 强制 + UUID per-turn + 完整性校验）、NFR13（记忆桥超时 5s 熔断）、Security NFR5（BYOK key 永不落 trajectory）

### 涉及文件

- **新增**:
  - `shadowflow/runtime/memory_bridge/__init__.py`
  - `shadowflow/runtime/memory_bridge/bridge.py`（`ExternalMemoryBridge`）
  - `shadowflow/runtime/memory_bridge/fence.py`（fence 构造 + UUID + 校验）
  - `shadowflow/runtime/memory_bridge/circuit_breaker.py`
  - `shadowflow/runtime/memory_bridge/types.py`（Pydantic models）
- **扩展**:
  - `shadowflow/runtime/gateway/hermes.py`（Story 2.3 产物）：session.update 路由 + session.prompt 前钩子
  - `shadowflow/runtime/contracts.py`：若需扩展 `AgentEvent.type` 枚举（memory_drink / memory_pour / memory_feedback / memory_bridge_circuit_break / memory_bridge_circuit_recover）
- **依赖**（关键前置,见下方 "关键约束"）:
  - 河流记忆 v1 底座 `river.drink/pour` + Write Gate Read/Write 三重过滤
  - Story 2.3 ACP Client(session.update 路由、session.prompt 构造钩子)
  - Story 1.5 Trajectory export(记忆事件写入)
  - Epic 5 Story 5.2 sanitize(trajectory 敏感词扫描)
- **新增测试**:
  - `tests/test_memory_bridge_drink.py`
  - `tests/test_memory_bridge_pour.py`
  - `tests/test_memory_bridge_feedback.py`
  - `tests/test_memory_bridge_circuit_breaker.py`

### 关键约束 / 前置依赖

🔴 **前置阻塞 — 河流记忆 v1 底座 Story 未立项**：

readiness report §5.2 已标注:本 Story 依赖的 `river.drink(query, scope)` / `river.pour(candidate, source_agent_id)` / Write Gate 三重过滤 在当前 `epics.md` + `epics-addendum-2026-04-16.md` 中**完全无覆盖**。设计只在 `docs/plans/shadowflow-river-memory-protocol-v1.md`(2012 行规范)中存在,代码未落。

**三条合法推进路径**:

1. **优先方案 · 先立 River v1 底座 Story**(推荐):新增 **Story 1.6 River Memory Baseline**(Epic 1 范畴,3-5 人日),实现:
   - `river.drink(query, scope)` / `river.pour(candidate, source_agent_id)` 两个 API
   - Sediment 三地层(alluvium/sandstone/bedrock)最小持久化(SQLite)
   - Write Gate 三门硬阈值版(MVP 不训练,阈值 hardcoded)
   - 本 Story 2.9 在 1.6 合并后动工
2. **兜底方案 · bridge 内置 stub + 后续替换**:Story 2.9 内先实现一个 `InMemoryRiverStub`(dict-based 简单存取,无 Write Gate,fence 仍做),让 gateway 能端到端跑 J2 剧本;River v1 底座完成后替换 stub 为真实 API(无架构改动,仅依赖注入点切换)
3. **并行方案**:Story 1.6 与 Story 2.9 同时开发,约定 ABC 接口在 Day 1 锁定,各自按 ABC 实装

**本 Story 默认按方案 1**(clean dep chain)。若 T-0 决策会决定采用方案 2/3,在 Tasks a-e 前加"**Task 0: InMemoryRiverStub**"(0.5 人日)。

### 其他约束

- **Fence 强制**(NFR7):drink 返回的 context 片段必须含 `fence: "shadowflow-context"` + `fence_uuid`(UUID4 per-turn);Write Gate Read 侧在**注入 session.prompt 前**做完整性校验;fence_uuid 与本轮 session_id 绑定,跨 turn 不复用
- **BYOK 零落盘**(Security NFR5):drink 结果中若含 BYOK 相关字段(不应该,但防御性),trajectory 写入前过 sanitize.py;agent_id 可以落盘,API key 不可
- **熔断粒度**:按 `(agent_id, operation)` 维度;不按 session 维度(同一 agent 多 session 共享熔断状态)
- **session.update 识别**:gateway 用 `type` 字段判别;`type` 不是 ACP 标准枚举之一但不破坏 ACP wire(ACP 允许 payload 扩展);gateway 在 ACP client 注册自定义 update handler
- **mode 切换不热替换**:读过 agent-card 的 session 保持原 mode 跑完,避免 session 内行为跳变;reload 后新开 session 用新 mode
- **`source_agent_id` 在 sediment metadata 层**(非 Bridge 层):BriefBoard 查询 sediment 时由 river v1 底座保证元数据返回;Bridge 只在 pour 入参传递 `source_agent_id`

### 测试标准

- **契约测试**:`ExternalMemoryBridge` 三方法(drink/pour/feedback 注入钩子)签名锁死
- **mode 三档覆盖**:`two_way` / `read_only` / `isolated` 各一条 happy path 测试
- **fence 安全测试**:fence_uuid 唯一性 / 篡改检测 / 跨 turn 防复用
- **熔断时序测试**:超时 / 60s 短路 / 恢复三段时序
- **trajectory 完整性**:drink/pour/feedback 三类事件字段完备 + sanitize 过敏感词(注入假 API key 验证被清除)
- **E2E**:J2 研究员剧本(PDF + 档案 drink + 推理 + pour proposal + next turn feedback)全链路 < 5s(NFR1 p50 ≤ 3s 宽限,因含 river IO)

## References

- [Source: prd-hermes-integration-mvp.md v0.2 §Functional Requirements §记忆桥接层 FR26-FR31]
- [Source: prd-hermes-integration-mvp.md v0.2 §Innovation §2 两套记忆并存 + fence 桥接]
- [Source: prd-hermes-integration-mvp.md v0.2 §Protocol Adapter Design §b/c(session.prompt type:context / session.update shadowflow_memory_proposal)]
- [Source: implementation-readiness-report-2026-04-17-hermes.md §5.2 CRITICAL-2 ExternalMemoryBridge 全无 story]
- [Source: docs/plans/shadowflow-river-memory-protocol-v1.md(河流协议 v1 — 底座 Story 依据)]
- [Source: epics-addendum-2026-04-17-hermes.md §Story 2.9(登记入口)]
- [Source: Story 2.3(ACP Client — session.update / session.prompt 路由依赖)]
- [Source: Story 1.5(Trajectory export — 记忆事件写入依赖)]
- [Source: Epic 5 Story 5.2(Trajectory Sanitize — 敏感词扫描依赖)]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
