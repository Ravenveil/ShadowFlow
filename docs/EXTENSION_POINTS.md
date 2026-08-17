# ShadowFlow 扩展点总表（Where New Behavior Goes）

> 对标 deepseek-harness 的 "Where new behavior goes" 表。**规则：改任何扩展点必须
> 同步更新本表**——这是文档与代码不允许漂移的 guard 之一。
>
> 状态记号：✅ 已实现并有测试 · 🟡 部分实现 · ⏳ 契约已定义待实现

| 想做什么 | 机制 | 入口文件 | 状态 |
|---|---|---|---|
| 接入一个新的 CLI agent | `provider_presets.yaml` 加 preset（零代码） | `shadowflow/runtime/provider_presets.yaml` | ✅ |
| 接入一个 API 推理后端 | `ApiExecutor` provider 配置（zhipu/openai/anthropic 兼容网关） | `shadowflow/runtime/executors.py` | ✅ |
| 注册一个全新 executor kind | 继承 `BaseExecutor` → `ExecutorRegistry.register()`（自动开放 schema 校验） | `shadowflow/runtime/executors.py` + `contracts.py:register_executor_kind` | ✅ |
| 自定义循环体形态 | 循环体=主 DAG 子图：`config.subgraph` 声明节点集，图内边驱动遍历（条件边/回边） | `shadowflow/runtime/loop_engine.py` | ✅ |
| 定义一个循环模板（preset） | `register_loop_preset()` 或 `SF_LOOP_PRESETS` YAML（PDCA 只是附带示例） | `shadowflow/runtime/loop_engine.py` | ✅ |
| 在图里放 Sensor/Controller | 节点类型 `control.sensor` / `control.controller`（阈值/轨迹/LLM-as-Verifier） | `shadowflow/runtime/loop_engine.py` | ✅ |
| 配置 LLM-as-Verifier | `sensor.type=verifier` + BYOK（provider/model/api_key_env/base_url/K 采样） | `service.py:_sense_with_verifier` | ✅ |
| 给节点挂验证钩子 | `node.config.validation_hooks[]`（shell/webhook/builtin，on_fail=blocker/warn/retry 瀑布语义） | `shadowflow/runtime/hook_pipeline.py` | ✅ |
| 注册 builtin 校验器 | `register_builtin_validator(name, fn)` | `shadowflow/runtime/hook_pipeline.py` | ✅ |
| 真并发并行分支 | `control.parallel` + `config.execution="gather"`（默认交错调度保持 checkpoint 语义） | `service.py:_execute_parallel_gather` | ✅ |
| 挂起运行中的循环 | `POST /runs/{id}/loops/{loop_id}/halt`（迭代边界消费信号，支持 `*` 通配） | `service.py:request_loop_halt` + `api/runs.py` | ✅ |
| 持久化运行状态/事件 | `SF_RUNTIME_STATE_DB` SQLite（事件日志 + run/request 快照 + checkpoint） | `shadowflow/runtime/run_event_log.py` + `server.py` | ✅ |
| 读取运行的 durable 事件流 | `GET /runs/{run_id}/event-log`（append-only，重启可读） | `shadowflow/api/runs.py` | ✅ |
| 替换 checkpoint 后端 | 实现 `BaseCheckpointStore` 四方法（InMemory/SQLite/0G 已有） | `shadowflow/runtime/checkpoint_store.py` | ✅ |
| 导出 AgentTeams 代码包 | CLI `export-agentteams` / `POST /workflow/export/agentteams`（含 preset 循环展开） | `shadowflow/runtime/agentteams_package.py` | ✅ |
| 导出/上传 agent | `.sfagent` bundle：CLI `export-sfagent` / `POST /workflow/export/sfagent`（identity+skills+轨迹证据+content id） | `shadowflow/runtime/agent_bundle.py` | ✅（上传/0G CID ⏳） |
| 接入宿主写回 | `BaseWritebackAdapter`（host/docs/memory/graph/zerog 五通道） | `docs/WRITEBACK_ADAPTER_CONTRACT.md` | 🟡 |
| 接入子 agent 运行时 | `AgentExecutor` ABC（kind=cli/acp/mcp + provider 复合键注册） | `docs/AGENT_PLUGIN_CONTRACT.md` | ✅ |
| 团队级验证钩子（Node 侧） | `team.validation_hooks`（schema 与 Python 共享） | `server/src/workflow/` + `validation_hooks/schema.py` | 🟡 |
| 跨 run 记忆 | River Memory（dredge/settle，`config.memory.river` 开启） | `shadowflow/runtime/river_memory.py` | 🟡 |
| 给执行动作配权限 | `permissions: {default/rules: auto\|prompt\|block}`（node 级或 workflow defaults；prompt 复用审批 API，决策落事件日志） | `shadowflow/runtime/permissions.py` | ✅ |
| 给 Node 会话链的工具配审批 | `PermissionPolicyV2` `'prompt'` + `tool-approval` 注册表：`permission_check` 帧征询（pending）→ `POST /api/run-sessions/:id/permissions/:requestId` 决定（approve/deny）→ 续跑/拒绝；超时与中止 fail-closed=deny；请求与决策均为命名事件落 run 日志可重放 | `server/src/lib/tool-approval.ts` + `lib/tool-runner.ts` + `routes/run-sessions.ts` | ✅ |
| LSP 风格诊断收敛 | `control.sensor` + `type: diagnostics`（读 body 输出的 diagnostics 数组，issue 数 ≤ target 即收敛） | `loop_engine.py:execute_sensor_node` | ✅ |
| 循环任务账本 | 每轮迭代自动 `task.ledger` durable 事件（goal/done/current/actuated），replay 可重建 | `loop_engine.py` + `run_event_log.py` | ✅ |
| ACP 会话谱系 | `_meta.shadowflow`（run/node/agent + loopId/iteration/depth/parentLoopId，按需派生不持久化） | `acp/messages.py:NewSessionRequest` | ✅ |
| 导入 agent 包 | CLI `import-sfagent` / `POST /workflow/sfagent/import`（写入 agent store） | `agent_bundle.py` | ✅ |
| 上传 agent 包（0G CID） | `POST /workflow/sfagent/upload`（配 `SHADOWFLOW_BRIDGE_URL` 时经 0G KV bridge 上传） | `agent_bundle.py:upload_sfagent_to_zerog` | ✅ |
| 分发插件包 | `.sfplugin` zip（manifest + provider_presets/ + loop_presets.yaml），CLI `validate-plugin` 校验；apply 待格式稳定后实现 | `plugin_package.py` | 🟡 |
| 治理矩阵 | `WorkflowPolicyMatrixSpec`（编译警告 + 运行期驳回→回滚） | `shadowflow/runtime/policy_matrix.py` | ✅ |
| 0G 链上存证 | 0G Storage Merkle 归档 + KV bridge checkpoint | `ZeroGCheckpointStore` + bridge | 🟡 |

## 事件三分法（P3）

> **双端统一事件命名表**：Node run-session 链 27 个 wire 事件 × Python 对应物
> （含事实/观察归属判定、durable/live 映射、`message` kind 子表、model-visible
> 对账）见 `docs/EVENT_NAMING.md`；一致性由
> `server/src/lib/__tests__/event-naming.test.ts` 四向对账 guard（阶段 2，2026-08-17）。

- **Durable 事件**（`run_event_log.py:DURABLE_EVENT_TYPES`）：必须挺过重启的事实——run/node 生命周期、checkpoint、循环迭代。全部落 SQLite，`/runs/{id}/event-log` 可读，投影可重放。
- **Live 事件**（`RunEventBus` → SSE）：进行中观察（NODE_STARTED/NODE_RETRIED…），内存即可。
- **瀑布钩子**（`hook_pipeline.py`）：校验/拦截语义——监听者必须放行（pass）、改写（transform）或拒绝（`HookRejected`）。

## 不变式（invariants）

1. **Model-visible means logged**：凡进入 LLM 请求/投影输出的内容必须可从 durable 事件流重建（`replay_run_summary` 即证明）。
2. **LoopRecord.iteration_count == len(iterations)**（契约注释已声明，运行时同批写入）。
3. **默认调度不破坏 checkpoint 语义**：parallel 真并发必须 opt-in（`execution="gather"`）。
