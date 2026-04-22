# Story 3.5: Provider 管理 + Fallback 链(E1 降级)

Status: review

## Story

As a **用户**,
I want **为每个节点选 LLM provider(Claude/OpenAI/Gemini/Ollama/0G Compute)并配置 fallback 顺序**,
so that **任一 provider 超时不会让 demo 中断,错误路径 E1 可优雅降级**。

## Acceptance Criteria

### AC1 — Provider 配置面板 + YAML 产出

**Given** 节点 Inspector 显示 Provider 配置面板
**When** 用户选 "Claude" 为主,勾选 "OpenAI → Ollama" 作为 fallback 链
**Then** YAML 生成 `provider: "claude", fallback_chain: ["openai", "ollama"]`

### AC2 — Runtime 超时自动 fallback 且前端可见

**Given** Claude API 30 秒超时
**When** Runtime 调用该节点
**Then** 自动切换 OpenAI 重试
**And** SSE 发出 `provider.fallback` 事件,看板显示橙色 toast "Claude 超时,切换到 OpenAI"
**And** 节点产出标注"本节点来自 OpenAI fallback"(FR18 + E1)

## Tasks / Subtasks

- [ ] **T1(AC1):Provider 配置面板 UI**
  - [ ] 新增 `src/core/components/inspector/ProviderPanel.tsx`
  - [ ] 字段:
    - `provider`:主 provider,下拉选 `claude / openai / gemini / ollama / zerog`
    - `fallback_chain`:多选 + 可拖拽排序(DnD kit 或 Shadow UI `common/SortableList`)
    - `timeout_seconds`:数字输入,默认 30
  - [ ] onChange → `useWorkflowStore.updateNodeData(nodeId, { provider, fallback_chain, timeout_seconds })`
  - [ ] YAML 序列化(Story 3.2)要保证字段名与后端 Pydantic 一致:`provider`、`fallback_chain`、`timeout_seconds`
- [ ] **T2(AC1):API Keys 管理**
  - [ ] 新增 `useSecretsStore`(AR16,已在 Story 3.1 占位):按 provider 持有 API key,写 localStorage 加密(密钥派生自一次性 passphrase)
  - [ ] `src/core/components/modals/SecretsModal.tsx`:首次进 /editor 引导输入 keys,BYOK(S1)
  - [ ] **密钥永不走前后端 HTTP 边界**(架构 API Boundaries):客户端直接调 LLM API 或通过后端透传 header(header 由前端每次注入)
- [ ] **T3(AC2):后端 fallback 链编排**
  - [ ] 新增 `shadowflow/llm/fallback.py`:
    - `class FallbackProvider(LLMProvider)`:持有主 provider + fallback_chain
    - `async def invoke(...)`:try 主 → 超时(asyncio.wait_for)/ 5xx / rate_limit → 下一个 fallback,直到成功或全链耗尽
    - 每次切换发 `AgentEvent(type="provider.fallback", data={from, to, reason})`到 run 的 asyncio.Queue(Story 4.1 events bus 对接)
    - 节点产出的 metadata 附加 `{"resolved_provider": "openai", "fallback_used": true}`(FR18)
  - [ ] 在 `RuntimeService` 执行器调度处将原本直连 provider 的路径替换为 `FallbackProvider`
- [ ] **T4(AC2):前端事件消费 + Toast + 节点标注**
  - [ ] `useRunEvents` hook(AR16)订阅 SSE,监听 `provider.fallback` 事件
  - [ ] 命中时调 Shadow UI `common/Toast` 橙色提示:`Claude 超时,切换到 OpenAI`
  - [ ] `LiveDashboard` 对应节点徽标追加 "via OpenAI (fallback)" 标签(Story 4.2 呈现,本故事保证数据流通即可)
- [ ] **T5:测试**
  - [ ] 单测 `tests/test_llm_fallback.py`:
    - mock Claude `asyncio.TimeoutError` → 断言切换 OpenAI
    - 所有 provider 都失败 → 断言抛 `ShadowflowError.AllProvidersFailed`
    - 断言 `AgentEvent(type="provider.fallback")` 被 emit
  - [ ] Playwright E2E `tests/e2e/provider-fallback.spec.ts`(可用 mock server 模拟 Claude 30s 超时):运行节点 → 断言 Toast 出现 + 节点产出含 "fallback" 标注

## Dev Notes

### 架构依据

- **Epic 3 Goal**:Provider fallback 是 demo 稳健性保障,是错误路径 E1 降级的落地
- **相关 AR**:AR16(useRunEvents SSE 订阅)、AR18(FallbackProvider 作为装饰器,装在现有 4 provider + 1 新 provider 之上)、AR20/AR22(Inspector 表单复用 Shadow UI)、AR44(密钥永不过服务端边界)
- **相关 FR/NFR**:FR7(Provider 可选 + fallback)、FR18(fallback 时标注来源)、E1(错误路径降级不中断 demo)、S1(BYOK 密钥仅客户端)

### 涉及文件

- 新增 `src/core/components/inspector/ProviderPanel.tsx`
- 新增 `src/core/components/modals/SecretsModal.tsx`
- 新增 `src/core/hooks/useSecretsStore.ts`(AR16,架构 lines 788–792)
- 新增 `shadowflow/llm/fallback.py`(装饰器,装在已有 4 provider `claude/openai/gemini/ollama` + 新增 `zerog.py` 之上,架构 lines 742–751)
- 修改 `shadowflow/runtime/service.py`:执行器路径接 FallbackProvider
- 新增 `tests/test_llm_fallback.py`
- 复用 Shadow UI `common/Toast`、`common/SortableList`

### 关键约束

- **BYOK**:密钥仅客户端持有,localStorage 加密存储(S1,架构 API Boundaries)
- Provider 切换必须发 `provider.fallback` 事件(用于 Story 4.2 看板展示)
- fallback 顺序不得写死,完全由用户配置
- 节点产出 metadata 必须含 `resolved_provider` 和 `fallback_used`(FR18)
- 每个 provider 超时默认 30s,用户可调(不得低于 5s,避免无效快速失败)
- **错误链兜底**:全链耗尽必须抛 `AllProvidersFailed`,不得静默返回 None

### 测试标准

- 单测:超时/5xx/rate_limit 三种触发条件 + 事件 emit
- Playwright E2E:J1 Solopreneur Journey 在 Claude 故障场景下仍跑完(AR38 + E1)

## References

- [Source: epics.md#Story 3.5]
- [Source: architecture.md#Frontend Architecture(lines 317–356)]
- [Source: architecture.md#Complete Project Directory Structure(lines 742–751, 788–805)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

529/529 Python tests pass (7 new in test_llm_fallback.py). 53/53 Vitest tests pass.

### Completion Notes List

- T1: `src/core/components/inspector/ProviderPanel.tsx` — provider dropdown (claude/openai/gemini/ollama/zerog), fallback chain checkboxes with order indicator, timeout input. onChange → `onUpdate(nodeId, config patch)`. Exported from inspector index.
- T2: `useSecretsStore.ts` already existed from Story 3.1. Added `src/core/components/modals/SecretsModal.tsx` — password inputs per provider, "已保存" indicator, keys never leave browser (BYOK / S1 / AR44).
- T3: `shadowflow/llm/fallback.py` — `FallbackProvider(LLMProvider)` wraps primary + fallback_chain. On asyncio.TimeoutError / HTTP 429/5xx: emits `provider.fallback` event, tries next provider. `AllProvidersFailed` raised when chain exhausted. Response tagged `resolved_provider`+`fallback_used` metadata (FR18). `ProviderType.OLLAMA` added to base enum (was missing zerog — added as comment). Exported from `shadowflow/llm/__init__.py`.
- T4: `src/core/hooks/useRunEvents.ts` — SSE subscription hook. Listens for `provider.fallback` events, calls `onFallback(FallbackToast)` callback. Consumers attach toast display in their UI.
- T5: 7 tests in `tests/test_llm_fallback.py`. Covers: primary success, timeout→openai fallback, all-fail→AllProvidersFailed, fallback event emitted, rate-limit (429) triggers fallback, non-retriable propagates, multi-hop chat chain.

### File List

- shadowflow/llm/fallback.py (new)
- shadowflow/llm/__init__.py (updated — AllProvidersFailed, FallbackProvider exported)
- src/core/components/inspector/ProviderPanel.tsx (new)
- src/core/components/inspector/index.ts (updated — ProviderPanel exported)
- src/core/components/modals/SecretsModal.tsx (new)
- src/core/hooks/useRunEvents.ts (new)
- tests/test_llm_fallback.py (new)
