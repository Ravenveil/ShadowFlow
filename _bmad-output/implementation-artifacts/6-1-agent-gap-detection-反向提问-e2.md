# Story 6.1: Agent Gap Detection + 反向提问(E2)

Status: ready-for-dev

## Story

As a **学者林筱(E2 边界场景用户)**,
I want **SectionAgent 发现实验日志缺 baseline 数据时,弹窗问我三个选项而不是瞎填**,
so that **ShadowFlow 体现"宁可提问不瞎编"的工程美德,路演时成为区分度最高的细节亮点**。

## Acceptance Criteria

### AC1 — `agent.gap_detected` 事件契约扩展与触发

**Given** `shadowflow/runtime/events.py` 扩展 `agent.gap_detected` 事件类型
**When** Agent 在执行 `section.generate` 节点时检测到输入不完整(例如引用的数据 ID 在实验日志中不存在 / baseline 数值缺失 / 引用的 figure 编号在 assets 里找不到)
**Then** 发出 `agent.gap_detected` 事件,payload 结构为 `{run_id, node_id, gap_type: "missing_data" | "broken_ref" | "incomplete_log", description: <自然语言说明>, choices: [{id: "A", label: "补充数据", action: "pause"}, {id: "B", label: "从论文移除此对比", action: "drop"}, {id: "C", label: "注释为 'will be updated'", action: "annotate"}]}`
**And** Runtime 暂停该节点(state = `waiting_user`),不进入下游依赖节点
**And** SSE `/workflow/runs/{run_id}/events` 推送该事件到前端(走 Epic 4 已建立的事件总线)

### AC2 — 前端弹窗展示与用户决策回写

**Given** 前端 `useRunStore` 订阅 SSE 流,收到 `agent.gap_detected` 事件
**When** 弹窗展示 `description` 与三个选项按钮(键盘 1/2/3 快捷键可选)
**Then** 用户点击后前端调用 `POST /workflow/runs/{run_id}/gap_response`,body 为 `{node_id, gap_choice: "A" | "B" | "C", user_input?: <可选补充数据>}`
**And** 后端 Runtime 根据 choice 写入节点 context,解除暂停状态
**And** Runtime **cascade 更新依赖下游**(FR37):选 B 则移除此章节对该对比的引用并重新运行 `section.generate`;选 C 则在生成的 section 中插入 `[TODO: will be updated]` 占位符;选 A 并提供 `user_input` 则合并后继续

## Tasks / Subtasks

- [ ] **T1(AC1):runtime 事件契约扩展**
  - [ ] `shadowflow/runtime/events.py` — 新增 `AgentGapDetected` Pydantic 模型 + `GAP_DETECTED = "agent.gap_detected"` 常量
  - [ ] `shadowflow/runtime/agents/section_agent.py`(或等价执行器)— 在生成前调用 `detect_gap(inputs)`,若返回非空则 `emit("agent.gap_detected", ...)` 并 `await wait_for_gap_response(node_id)`
  - [ ] `shadowflow/runtime/service.py` — 节点状态机新增 `waiting_user` 状态,调度器跳过此状态节点(不视为阻塞整个 run)
- [ ] **T2(AC1):gap detection 启发式**
  - [ ] `shadowflow/runtime/agents/gap_detector.py` — 实现三类检测:`missing_data`(引用的 data_id 不在 experiment_log 里)/ `broken_ref`(figure/table 编号无定义)/ `incomplete_log`(baseline 字段为空)
  - [ ] 返回 `{gap_type, description, choices}` 或 `None`
- [ ] **T3(AC2):新增 `POST /workflow/runs/{run_id}/gap_response` endpoint**
  - [ ] `shadowflow/api/routes/runs.py` — 新增路由,body 校验 `GapResponseRequest`
  - [ ] 写入 runtime 的 `waiting_user` future;非 `waiting_user` 节点返回 409
  - [ ] cascade 重新入队依赖下游节点(复用 Epic 5 FR37 的 cascade 逻辑)
- [ ] **T4(AC2):前端弹窗组件**
  - [ ] `src/core/components/modals/GapDetectedModal.tsx` — 展示 description + 三按钮 + 键盘快捷键
  - [ ] `src/core/stores/useRunStore.ts` — 订阅 `agent.gap_detected`,将待处理 gap 入栈
  - [ ] `src/core/api/runs.ts` — 封装 `postGapResponse(runId, payload)`
  - [ ] 回写成功后清栈,看板恢复节点运行态可视
- [ ] **T5(测试)**
  - [ ] `tests/test_events_bus.py` 扩展 —— 构造缺 baseline 的 Academic Paper 输入,断言 `agent.gap_detected` 事件载荷
  - [ ] `tests/test_gap_response.py` —— 三选项各跑一次,断言下游 cascade 行为符合预期
  - [ ] Playwright 冒烟:J2 PhD 旅程走到 gap 弹窗 → 选 C → section 插入 `[TODO: will be updated]`

## Dev Notes

### 架构依据
- **Epic 6 Goal**:前 5 个 Epic 的能力织成完整 5 分钟评委叙事;Agent Gap Detection 是"宁可提问不瞎填"的细节亮点,对应 E2 边界场景,是 J5 路演差异化的关键证据。
- **相关 AR**:AR6(RuntimeContract 事件扩展)、AR15(SSE 事件总线作为人机协作通道)
- **相关 FR**:FR36(主动提问不瞎填)、FR37(cascade 更新下游)
- **相关 NFR**:P3(SSE 事件 UI ≤ 500ms)、SC1(50 并发下仍稳定)

### 涉及文件
- 后端:
  - `shadowflow/runtime/events.py` 扩展 `agent.gap_detected` 事件
  - `shadowflow/runtime/agents/section_agent.py` + 新增 `gap_detector.py`
  - `shadowflow/runtime/service.py` 节点状态机新增 `waiting_user`
  - `shadowflow/api/routes/runs.py` 新增 `POST /workflow/runs/{run_id}/gap_response`
- 前端:
  - `src/core/components/modals/GapDetectedModal.tsx`
  - `src/core/stores/useRunStore.ts` 扩展
  - `src/core/api/runs.ts` 新增 `postGapResponse`
- 测试:`tests/test_events_bus.py`(扩展)、`tests/test_gap_response.py`(新)

### 关键约束
- **cascade 更新依赖下游(FR37)**:不能只更新当前节点,必须遍历 workflow 定义的依赖图,把受影响的下游 section 节点重新入队重跑。这是与普通"暂停/恢复"最大的区别。
- **三选项是硬契约**:A(补数据)/ B(移除对比)/ C(注释待更新)。前端按钮顺序、后端 choice id 必须一一对应,否则评委演示脚本会错位。
- **不瞎填是 E2 核心卖点**:检测逻辑宁可过度敏感(false positive)也不能漏报(false negative)—— 漏报意味着 Agent 生成了虚假的 baseline 数字,是 Academic Paper 场景红线。
- **暂停不阻塞整个 run**:`waiting_user` 节点不算失败,其他独立分支应继续运行,只有依赖链条被阻塞。
- **SSE 事件 UI ≤ 500ms**(P3):弹窗必须在事件到达后半秒内可见,否则评委会误以为 run 卡死。

### 测试标准
- 单元测试覆盖三种 gap_type 的检测启发式与三种 choice 的 cascade 行为
- `tests/test_events_bus.py` 扩展 `agent.gap_detected` 事件结构断言
- Playwright E2E 覆盖 J2 PhD 旅程从触发 gap 弹窗 → 回写 → section 产出带占位符的完整路径
- 路演前手工走一次完整 demo:E2 场景在 5 分钟脚本的第 3:30 位置弹窗,选 B 或 C 不应拉长整体时长超过 30s

## References

- [Source: epics.md#Story 6.1]
- [Source: prd.md#FR36](FR36 主动提问不瞎填)
- [Source: prd.md#FR37](FR37 cascade 更新下游)
- [Source: architecture.md#Runtime Contract]
- [Source: _bmad-output/planning-artifacts/shadowflow-product-brief.md#E2 边界场景]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
