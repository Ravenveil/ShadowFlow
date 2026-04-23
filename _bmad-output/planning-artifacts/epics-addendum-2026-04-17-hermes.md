---
name: epics-addendum-2026-04-17-hermes
title: Epics Addendum · Hermes MVP Story Gap Fills (CRITICAL-2/3 解决批次)
version: 0.1
created: 2026-04-17
status: proposed
parent: epics.md
trigger: _bmad-output/planning-artifacts/implementation-readiness-report-2026-04-17-hermes.md §5.2 / §5.3 / §6.3
---

# Epics Addendum · 2026-04-17 · Hermes MVP Story 增补

本文件是 [epics.md](epics.md) + [epics-addendum-2026-04-16.md](epics-addendum-2026-04-16.md) 的增量补丁，专项解决 Hermes MVP 就绪度评估(`implementation-readiness-report-2026-04-17-hermes.md`)提出的 **CRITICAL-2(ExternalMemoryBridge)** 与 **CRITICAL-3(审批卡设计)** 两项立项缺口。

**本轮增补范围(克制)**：
- **Story 2.9**(CRITICAL-2 主项)
- **Story 1.6**(2.9 前置依赖 — 河流记忆底座，T-0 决策会前标 proposed 状态)
- **审批卡 pen frame**(CRITICAL-3)由 Pencil 侧落地，本文件只登记数据契约

**本轮暂不包含**(留后续 addendum)：
- Story 0.5 Employee Management CLI
- Story 2.10 AgentCard Schema & Validator
- Story 2.11 Agent Health Check & Degradation
- Story 7.N External Member Type / Approval Card Logic(UI 实装属 Epic 7 范畴)

---

# Epic 1 补丁 · Story 1.6 · River Memory Baseline(drink/pour + Three-Gate)

**Status**: proposed(pending T-0 决策会敲定前置方案)
**Priority**: **P0(Story 2.9 硬前置)**
**Estimate**: 3-5 人日
**Epic 归属**: Epic 1 · Runtime Hardening(与 Policy Matrix 同域 — "运行时护栏")

**Goal**: 落地 `docs/plans/shadowflow-river-memory-protocol-v1.md` v1 规范的**最小可运行底座** —— 三地层 sediment 持久化 + Three-Gate 硬阈值版 + `river.drink/pour` 双 API。MVP 不训练门阈值,阈值 hardcoded,留日志基建供 V2+ 升级 LSTM 可学门。

**前置决策**(T-0 决策会需拍板选其一):
- **方案 A · 先 1.6 后 2.9**(推荐 / clean dep chain):1.6 先合并,2.9 再动工,共 8-12 人日顺序交付
- **方案 B · 2.9 内置 InMemoryRiverStub,1.6 异步补**:2.9 可立即动工,1.6 并行开发,ABC 接口 Day 1 锁死 —— 总工期不变但并发度高,集成风险略升
- **方案 C · 推迟河流,MVP 退到 read_only 模式**:1.6 整体推迟到 Phase 2,MVP 只做 drink(`river.drink` 退化为 SQLite 原样 SELECT),pour 彻底不做 —— PRD FR28/29/31 降级为 Phase 2

## Story 1.6 Acceptance Criteria(方案 A/B 选中时生效)

### AC1: `river.drink(query, scope)` API 落地

**Given** `query: str`, `scope: list[str]`(如 `["alluvium", "sandstone", "bedrock"]` 子集)
**When** 调用 `river.drink(query, scope)`
**Then** 按 scope 声明地层从 SQLite 检索相关 sediment 条目
**And** 返回 `DrinkResult(chunks: list[SedimentChunk], retrieved_at: datetime)`
**And** 默认实现用 keyword match(MVP 不做向量检索,V2+ 接 HRR)

### AC2: `river.pour(candidate, source_agent_id)` API 落地

**Given** `candidate: SedimentCandidate`(含 content / confidence / target_layer)
**When** 调用 `river.pour(candidate, source_agent_id)`
**Then** 经 **Write Gate 三重过滤**(Write Gate / Forget Gate / Read Gate,阈值硬编码)
**And** 按过滤结果返回 `PourResult(accepted | rejected | deferred, reason: str)`
**And** `accepted` 条目持久化到对应 target_layer,metadata 含 `source_agent_id`(供 BriefBoard 审计)

### AC3: 三地层 SQLite 表结构

**Given** SQLite 数据库 `.shadowflow/river.db`
**Then** 建表 `sediment_alluvium / sediment_sandstone / sediment_bedrock` 三地层,schema:
```sql
CREATE TABLE sediment_<layer> (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  trust_score REAL DEFAULT 0.5,
  retrieval_count INTEGER DEFAULT 0,
  source_agent_id TEXT,              -- FR31 BriefBoard 来源标识
  settled_at TIMESTAMP NOT NULL,
  metadata JSON
);
```

### AC4: Three-Gate 硬阈值版(MVP 不训练)

**Given** MVP 不训练门阈值
**Then** 三门按硬编码阈值实现:
- **Write Gate**:`confidence >= 0.6` AND `content.length >= 20 chars` AND `not duplicate(content)` → 通过
- **Forget Gate**:retrieve_count == 0 累计 30 天未命中 → 降级 layer / 最终删除
- **Read Gate**:`trust_score × retrieval_count_norm × query_similarity >= 0.3` → 通过

**And** 所有门决策写日志 `logs/river_gate.jsonl`(V2+ 供 LSTM 训练)

### AC5: MVP 不做 HRR,保留接口

**Given** MVP 不做向量/HRR 检索
**Then** `river.py` 定义 `MemoryProvider` ABC 含 `structural_query(probe_key, bank)` 接口
**And** 默认实现 `SqliteMemoryProvider` 该接口抛 `NotImplementedError`
**And** 留注释 "V2+ 触发 T1/T2/T3 条件后接 HRRProvider 实装"

## Story 1.6 References

- [Source: docs/plans/shadowflow-river-memory-protocol-v1.md Part II §引擎层(MemoryProvider ABC)]
- [Source: docs/plans/shadowflow-river-memory-protocol-v1.md §3.6(Three-Gate Sediment Protocol)]
- [Source: docs/plans/shadowflow-river-memory-protocol-v1.md §5.8(MVP 硬阈值版)]
- [Source: implementation-readiness-report-2026-04-17-hermes.md §5.2(CRITICAL-2 前置依赖指认)]

---

# Epic 2 补丁 · Story 2.9 · ExternalMemoryBridge(drink/pour + fence + feedback)

**Status**: ready-for-dev-pending-river-baseline(Story 1.6 合并后或方案 B InMemoryStub 就位后可动工)
**Priority**: **P0(Hermes MVP Innovation §2 核心差异化)**
**Estimate**: 5-7 人日(Epic 2 最重新增单项)
**详细 Story spec**: `_bmad-output/implementation-artifacts/2-9-externalmemorybridge-drink-pour-fence.md`

**覆盖 FR**:FR26 / FR27 / FR28 / FR29 / FR30 / FR31(6 条记忆桥接层 FR 全覆盖)
**覆盖 NFR**:NFR7(Fence 强制)、NFR13(桥超时 5s 熔断)、NFR5(BYOK 零落盘)

## Story 2.9 摘要(完整 AC / Tasks 见 impl 文档)

| AC | 内容 | FR 对应 |
|---|---|---|
| AC1 | drink 管道 — river.drink → Write Gate Read → fence 封装 → ACP context 片段 | FR26 + FR27 |
| AC2 | pour 管道 — session.update 解析 → river.pour → Write Gate 三重过滤 → 分类 | FR28 + FR31 |
| AC3 | memory_feedback 回馈 — {accepted, rejected, deferred} 下一轮 `shadowflow_envelope` 注回 | FR29 |
| AC4 | 三档 `memory_bridge.mode`(two_way / read_only / isolated)全覆盖 + reload | FR30 |
| AC5 | 超时熔断 5s + trajectory + SSE 事件 + BriefBoard 来源字段 | NFR13 + FR31 + FR40 |

## Story 2.9 前置依赖(硬依赖)

- 🔴 **Story 1.6 River Baseline**(上方登记)—— 或方案 B 的 `InMemoryRiverStub`
- 🟠 **Story 2.3 ACP Client**(AC2 依赖 session.update 路由、AC3 依赖 session.prompt 构造钩子)
- 🟡 Story 1.5 Trajectory export(AC5 事件写入)
- 🟡 Epic 5 Story 5.2 Trajectory Sanitize(AC5 敏感词扫描)

## Story 2.9 References

- [Source: prd-hermes-integration-mvp.md v0.2 §FR26-FR31]
- [Source: prd-hermes-integration-mvp.md v0.2 §Innovation §2]
- [Source: _bmad-output/implementation-artifacts/2-9-externalmemorybridge-drink-pour-fence.md(完整 AC / Tasks / Dev Notes)]

---

# UX 补丁 · ExternalAgentApprovalCard(CRITICAL-3 — Pencil 落地)

**Status**: pending-pencil-design(本 addendum 登记数据契约;UI frame 在 Pencil `pencil-new.pen` 中落地)
**Priority**: **P0(MVP 动工前必须完成)**
**Estimate**: 0.5 人日(Pencil 静态 frame)+ Epic 7 后续 Story 做 React 实装

**源头**:PRD v0.2 FR18-FR20 审批流、协议决策(ACP 主)确定审批卡展示的是 **ACP `session.requestPermission`** 消息内容经 Policy Matrix 映射后的结构。

## 数据契约(Pencil frame 数据源参考)

**来自 ACP `session.requestPermission` 的 payload(Hermes 发来)**:
```json
{
  "jsonrpc": "2.0",
  "id": "<request_id>",
  "method": "session/requestPermission",
  "params": {
    "session_id": "...",
    "tool_name": "execute_shell",
    "tool_input": {"cmd": "rm -rf /tmp/cache"},
    "justification": "清理过期缓存以释放磁盘"
  }
}
```

**经 ShadowFlow `gateway/hermes.py` + Policy Matrix 映射后的审批卡展示数据**:
```typescript
interface ExternalAgentApprovalCardData {
  // 身份区
  agent_id: string;              // 如 "hermes-01"
  agent_avatar: string;          // agent-card 里的头像 URL
  agent_display_name: string;    // 如 "Hermes · 研究员"

  // 请求区
  tool_name: string;             // ACP tool_name
  tool_params_diff: {            // 参数 diff(与 agent 平均值对比 / 高亮可疑)
    [key: string]: {
      value: any;
      risk_level: "low" | "medium" | "high";
      risk_reason?: string;      // 如 "递归删除路径"
    };
  };
  justification: string;         // ACP params.justification
  policy_verdict: {              // Policy Matrix 评估结果
    matched_rule: string;        // 如 "external_agent.filesystem.write:require_approval"
    default: "deny" | "allow";
    whitelist_hit: boolean;
  };

  // 决策区
  actions: ["allow", "whitelist", "deny"];  // 3 按钮
  whitelist_pattern_preview?: string;       // 点 Whitelist 时预览将加入的规则
}
```

## Pencil frame 设计要求(CRITICAL-3 交付物)

frame 名:`ExternalAgentApprovalCard`(建议建在 `InboxPage` / `InboxPage_CN` 的 APPROVAL GATE 面板变体内,或独立 Approval 抽屉)

**必含视觉元素**:
1. **Agent 身份条**(avatar + display_name + agent_id 小灰字 + external 小角标 · 记忆 `project_chat_briefboard_tri_view.md` 要求内置/外部语义区分)
2. **Tool 调用签名行**(`tool_name(...)` monospace 显示 + 风险等级色胶囊)
3. **参数 diff 视图**(表格:参数名 / 值 / 风险标记;high 风险用琥珀 `#f59e0b`,medium 用紫 `#a07aff`)
4. **Justification 引文区**(agent 的自述理由 · 斜体灰字)
5. **Policy 评估行**(matched_rule 单行显示 + "默认 deny · 白名单未命中" 徽章)
6. **3 按钮决策栏**:
   - `Allow`(一次性放行 · 蓝 `#6a9eff`)
   - `Whitelist`(加白名单 + 放行 · 紫 `#a07aff` · hover 弹白名单规则预览 tooltip)
   - `Deny`(拒绝 · 中性灰,危险色留给 unsafe/destroy 等少数场景,符合 Tailwind 中性色调反馈)

**设计语言遵循**(来自 `project_pencil_design_language.md` v1):
- 深色底 `#0d1117`
- 14px 圆角
- 120px 点阵网格(参考线)
- WCAG AA 对比度 ≥ 4.5:1(Allow/Whitelist/Deny 按钮文字 vs 底色必验)

**WARNING-UX-1 必补**(report §3.4 原文):
审批卡在 pen 中未见 → 本 frame 就是填这个洞。建议 pen 里同时放中英文两个版本(对齐现有 `InboxPage` / `InboxPage_CN` 双版)。

**WARNING-UX-2 留意**(report §3.4):
BriefBoard 记忆可视化缺失是另一条独立遗漏(记忆 `project_river_memory_system.md` 记录),不在本 addendum 范围,但 Story 2.9 AC5 的 `source_agent_id` 字段是 BriefBoard 未来可视化的**数据准备**。

## 落地 Artifact（2026-04-17 完成）

**Pencil 文件**：`docs/design/shadowflow-ui-2026-04-16-v2.pen`（活动 pen 文件,已替换早期 workspaceStorage UUID 路径）

**Frame 节点 ID 清单**（供前端 Story 7.N 实装直接引用）:

| Frame | 节点 ID | 位置 (x,y) | 尺寸 | 说明 |
|---|---|---|---|---|
| ExternalAgentApprovalCard | `s70VM` | (0, 12940) | 720×460 | EN 版 · 完整 11 段视觉元素 |
| ExternalAgentApprovalCard_CN | `KjgM7` | (800, 12940) | 720×460 | CN 版 · C() 复制 + descendants 覆写中文 |

**卡内主要子节点**（EN 版 · CN 版结构对称 id 不同）:

| Section | 子 frame/text ID(EN) | 内容/用途 |
|---|---|---|
| TopStrip | `zTBDy` | 琥珀警告条 "⚠ APPROVAL GATE · external agent · decision required · 00:42 / 05:00" |
| Avatar | `lJOrF` | 紫色圆 44×44 + "H" 首字母 |
| ExternalPill | `Q6FNO` | 右上紫色 "EXTERNAL" 胶囊 |
| ToolSignature | `dIi8p` | 紫色 monospace "execute_shell(cmd, cwd)" |
| RiskPill | `5w8ki` | 琥珀 "HIGH RISK" 胶囊 |
| ParamRowCmd | `emuOI` | cmd 参数行(含红色 "recursive delete" RiskTag `6nUe7`) |
| ParamRowCwd | `6Fl64` | cwd 参数行 |
| JustificationText | `Jc8O8` | 斜体引文(agent 申辩理由) |
| DenyBadge | `cgjKV` | 红色 "default: deny" 徽章 |
| WhitelistBadge | `Uve94` | 灰色 "whitelist: miss" 徽章 |
| MatchedRule | `arNV4` | 紫色 monospace 规则路径 |
| BtnAllow | `bDYgh` | 蓝色主要按钮 "✓ Allow ⌘A" |
| BtnWhitelist | `6Stwx` | 紫色次按钮 "☆ Whitelist ⌘W" |
| BtnDeny | `lVD5s` | 中性灰按钮 "✗ Deny ⌘D" |

**设计评审预览 PNG**:`docs/design/ExternalAgentApprovalCard_CN_preview.png`（CN 版 1440×918 高分辨率导出 · 作为 T-0 决策会可引用视觉证据）

**前端实装约定**(Story 7.N External Agent Approval Card):
- 读取 `s70VM`(EN) / `KjgM7`(CN) 内所有 text 节点 content 与 fill 作为 React 组件文案 / 配色源
- 布局用 React flex 重写即可(pen 内用 layout:none + 绝对坐标,是设计稿惯例,前端实装应改 flex)
- 3 按钮 onClick → 调 `POST /workflow/runs/{id}/approvals/{req_id}`,payload 含 `decision ∈ {"allow", "whitelist", "deny"}` + 可选 `whitelist_pattern`

## UX 补丁 References

- [Source: prd-hermes-integration-mvp.md v0.2 §FR18-FR20 审批流]
- [Source: prd-hermes-integration-mvp.md v0.2 §Protocol Adapter Design(ACP session.requestPermission → permissionResult)]
- [Source: project_pencil_design_language.md(设计语言 v1)]
- [Source: project_chat_briefboard_tri_view.md(Inbox APPROVAL GATE 面板语义)]
- [Source: implementation-readiness-report-2026-04-17-hermes.md §5.3 CRITICAL-3 / §3.4 WARNING-UX-1]

---

# T-0 决策会议题(本 addendum 触发)

本 addendum 落地需要 **1 小时 T-0 决策会**,解决下列事项:

1. **Story 1.6 前置方案拍板**(A/B/C 三选一) — 影响 Hermes MVP 工期与并发度
2. **Story 2.9 动工时机**:立即(方案 B)vs 1.6 合并后(方案 A)
3. **本 addendum 其他 proposed Story 批准**(2.10 / 2.11 / 0.5 / 7.N 下一 addendum 处理,本次不展开)

# Document History

- **v0.1** · 2026-04-17 · 首次发布 —— 解决 CRITICAL-2(Story 2.9 立项 + Story 1.6 前置登记) + CRITICAL-3(审批卡 Pencil frame 数据契约)
