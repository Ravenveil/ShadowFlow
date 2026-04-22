# Story 2.5: ShadowSoul Rust Binary 接入

Status: review

## Story

As a **ShadowFlow 用户**,
I want **在模板中声明 `provider: shadowsoul` 即可调用自家 Rust 版 ShadowSoul agent**,
so that **Demo 能演示 ShadowFlow 同时编排 Hermes + ShadowSoul + OpenClaw 三家**。

## Acceptance Criteria

### AC1: ShadowSoul binary 双通道接入(ACP 优先,CLI 兜底)

**Given** Shadow 项目 `shadow-soul` crate 可独立编译产出 `shadow` binary
**When** 在 ShadowFlow 部署环境中 `shadow --version` 能跑通
**Then** 模板声明 `executor: {kind: "acp", command: "shadow acp serve"}` 或 `{kind: "cli", provider: "shadowsoul"}` 均可接入
**And** ShadowSoul preset 使用 S.C.O.R.E. system prompt + ReAct 循环(从 Shadow 项目沿用)

### AC2: binary 缺失时健康检查降级,不硬 crash

**Given** `shadow` binary 不在 PATH
**When** ShadowFlow 启动
**Then** 启动 health check 警告 `ShadowSoul unavailable, {模板} 的该 agent 将回退到 Claude`,不硬 crash

## Tasks / Subtasks

- [ ] **[AC1]** 从 Shadow 项目(`D:\VScode\TotalProject\Shadow\`)提取独立 CLI binary:
  - [ ] 阅读 `src-tauri/src/main.rs:63-66` 确认 3 个 Tauri command:`shadowsoul_get_doc_loop_contract` / `shadowsoul_start_dialog` / `shadowsoul_execute_cli`
  - [ ] 评估 ShadowSoul 是否可脱离 Tauri runtime 独立运行(查 `shadow-core` crate 依赖)
  - [ ] **三选一**(根据可行性,按优先级):
    1. **最优**:ShadowSoul 已实现 ACP server → 直接走 Story 2.3 的 `kind: "acp"` + `command: "shadow acp serve"`(无需新代码)
    2. **次优**:从 `shadow-core` 抽独立 binary `shadow-soul-cli`(Rust 编译,~1-2 天),走 `kind: "cli"` + JSONL 尾追
    3. **降级**:直接 spawn 现有 binary(若已存在),stdout 文本流
  - [ ] 产出 `docs/SHADOWSOUL_RUNTIME_SPIKE.md` 记录决策过程
- [ ] **[AC1]** 在 `shadowflow/runtime/provider_presets.yaml` 的 `shadowsoul` preset 完善(Story 2.2 已占位):
  - [ ] `command` / `args_template` 按 SPIKE 决策填写
  - [ ] `workspace_template`:`~/.shadowsoul/agents/{id}`
  - [ ] `parse_format`:`jsonl-tail`(若走 CLI 路径)
  - [ ] system prompt / ReAct 循环**不在 preset 内**,由 binary 内部加载(Shadow 项目已内置)
- [ ] **[AC1]** 若走 ACP 路径:Story 2.3 的 `AcpAgentExecutor` 已支持 `command: "shadow acp serve"`,本 story 只需在 `ExecutorRegistry` 确认 `(kind="acp", provider="shadowsoul")` 注册即可
- [ ] **[AC2]** 新建 `shadowflow/runtime/health.py`(若 MVP 未建则新增):
  - [ ] `check_shadowsoul_binary() → HealthResult(ok: bool, path: str|None, version: str|None)`:调 `shutil.which("shadow")` + `shadow --version` 超时 3s
  - [ ] 启动时 `server.py` 的 startup hook 里调用一次,不 ok 则 `logger.warning(...)` + 记录到 `/health` endpoint 响应
  - [ ] 在编译模板时若 agent 用到 ShadowSoul 但 health 不 ok,注入 `fallback_chain = ["api:claude"]`(若模板未显式指定)并在事件流发 `agent.degraded`
  - [ ] **不硬 crash**,只降级 + 警告
- [ ] **[AC2]** `/health` endpoint 响应新增 `agents: {shadowsoul: {...}, hermes: {...}, openclaw: {...}}` 字段(Story 2.8 的文档里也要写清楚)
- [ ] **测试**:
  - [ ] `tests/test_health_shadowsoul.py`:`shutil.which` mock 返回 None → health.ok == False
  - [ ] `tests/test_shadowsoul_fallback.py`:binary 缺失时,模板编译注入 fallback,runtime 跑时走 Claude
  - [ ] **集成**:Sprint 1 末在有 `shadow` binary 的环境跑通一次 Demo 模板(Solo Company)

## Dev Notes

### 架构依据
- **Epic 2 Goal**:Demo 演示 ShadowFlow 同时编排 Hermes + OpenClaw + ShadowSoul 三家 agent,差异化护城河第二条
- **AR 编号**:AR57(ShadowSoul Agent,MVP 薄壳版)
- **相关 FR/NFR**:FR42、I1、S5;**Demo 叙事**:自家标杆 agent

### 涉及文件
- 扩展:`shadowflow/runtime/provider_presets.yaml`(`shadowsoul` preset 完善)
- 新增:`shadowflow/runtime/health.py`(健康检查 + 降级链注入)
- 扩展:`shadowflow/server.py`(startup hook + `/health` endpoint)
- 新增:`docs/SHADOWSOUL_RUNTIME_SPIKE.md`(决策记录)
- 新增测试:`tests/test_health_shadowsoul.py` / `test_shadowsoul_fallback.py`
- 可能新增:`Shadow/shadow-soul-cli/` 独立 binary(Rust 侧工作,取决于 SPIKE)

### 关键约束
- **前置依赖**:Story 2.7(Hermes `claw` SPIKE)**必须先完成**,用以决议 ShadowSoul / ShadowClaw 命名(当前文件沿用 "ShadowSoul",若 SPIKE 决定改名,本 story 需同步改 preset key)
- **前置依赖**:Story 2.1(ABC)+ Story 2.2(CLI preset)+ Story 2.3(ACP client)必须先 merge
- **实现策略:不用 Python 重写**,直接复用 Shadow 项目的 Rust 版 ShadowSoul(PRD 明确:S.C.O.R.E. system prompt + ReAct 循环已内置)
- **图谱统一入口推迟 Phase 2**(需 Shadow 桌面集成),MVP 只做 agent 接入
- 若 Shadow 项目的 ShadowSoul 绑定 Tauri runtime,SPIKE 必须评估脱离 Tauri 的工作量(~1-2 天 vs. 砍项)
- **ACP 路径优先**(与 Hermes 同通道,最统一);CLI 路径兜底
- health check 不硬 crash,**降级是一等公民**:PRD 要求不让 binary 缺失阻塞 Demo

### 测试标准
- **健康检查测试**:binary 存在 / 不存在两种状态,`/health` 响应符合预期
- **降级测试**:模板用 ShadowSoul → binary 缺失 → 自动回退 Claude 且事件流发 `agent.degraded`
- **集成测试**:Sprint 1 末在装有 `shadow` binary 的环境跑一次 Solo Company 模板,至少一个节点用 ShadowSoul

## References

- [Source: epics.md#Story 2.5]
- [Source: epics.md#AR57 ShadowSoul Agent(MVP 薄壳版)]
- [Source: Shadow 项目 `src-tauri/src/main.rs:63-66`(3 个 Tauri command)]
- [Source: Shadow PRD(S.C.O.R.E. system prompt + ReAct 循环)]
- [Source: epics.md#Story 2.7(命名 SPIKE 前置依赖)]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
