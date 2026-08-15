# Skill 清单（赛题附录 B）

> 依据：`docs/architecture/loop-engine-design.md` 附录 C + `server/skills/` 实际 inventory
> 创建：2026-08-13
> 范围：ShadowFlow 核心技能清单（循环引擎 + 协作 + 治理）

---

## 模板定义

| 字段 | 说明 |
|---|---|
| 名称 | Skill 唯一标识符 |
| 类型 | 自定义/内置/MCP/ACP |
| 场景 | 适用使用场景 |
| 输入 | 输入参数/格式 |
| 输出 | 输出数据/格式 |
| 调用条件 | 何时触发此 Skill |
| 依赖 | 依赖的外部服务/其他 Skill |
| 失败处理 | 失败时的降级策略 |
| 安全边界 | 安全约束（权限/资源限制） |
| 复用价值 | 跨场景复用性 |

---

## 循环引擎核心技能

### 1. LoopConvergenceCheck（LLM-as-Verifier）

| 字段 | 值 |
|---|---|
| **名称** | `loop.verifier` |
| **类型** | 自定义 |
| **场景** | C 节点（Checker）收敛判定 |
| **输入** | - 轨迹（metric_history 最近 N 轮）<br>- setpoint（metric + op + value）<br>- 当前 measurement |
| **输出** | - verifier_score（0-1 连续分数）<br>- converged（布尔判定）<br>- reasoning（判定理由） |
| **调用条件** | - `sensor.type == "verifier"`<br>- 每轮 loop 迭代后 |
| **依赖** | - LLM provider（anthropic/openai，`SF_VERIFIER_PROVIDER` 可覆盖）<br>- API key（BYOK：`config.verifier.api_key_env` 或 `SF_VERIFIER_API_KEY_ENV`，2026-08-15 起支持） |
| **失败处理** | 降级到 `sensor.type == "threshold"` 阈值比较 |
| **安全边界** | - 单次调用 max_tokens=1024<br>- 超时 120s<br>- 不暴露内部状态给 LLM |
| **复用价值** | 高 - 可用于任何需要概率收敛判定的场景 |

**实现位置**：`shadowflow/runtime/service.py:_sense_with_verifier()`

---

### 2. CausalAttribution（因果归因）

| 字段 | 值 |
|---|---|
| **名称** | `attribution.counterfactual` |
| **类型** | 自定义 |
| **场景** | 因果分析（哪个因素导致收敛/发散）|
| **输入** | - IterationRecord 集（多轮记录）<br>- freeze_fields（冻结因子列表）|
| **输出** | - 因子贡献度（每个因子的影响分数）<br>- causally_significant（是否因果显著）|
| **调用条件** | - `config.attribution.coe == true`<br>- 可选（预算开关，默认关闭）|
| **依赖** | - checkpoint_store（用于重放）<br>- River Memory（反事实重放）|
| **失败处理** | 预算耗尽时降级到方法①（CoE 证据链）|
| **安全边界** | - 重放最多 3 个因子<br>- 不修改真实数据 |
| **复用价值** | 中 - 适用于需要根因分析的复杂系统 |

**实现位置**：`shadowflow/runtime/service.py:attribute_factor()`

---

### 3. PolicyGate（审批门禁）

| 字段 | 值 |
|---|---|
| **名称** | `policy.gate` |
| **类型** | 内置 |
| **场景** | 审批/驳回决策点 |
| **输入** | - output（节点输出）<br>- policy_matrix（治理矩阵）<br>- 当前 run 上下文 |
| **输出** | - allow（通过）<br>- warn（警告但继续）<br>- reject（驳回） |
| **调用条件** | - 节点配置 `policy_gate: true`<br>- 中断恢复（reject_loop_iteration） |
| **依赖** | - Policy Matrix（YAML 定义）<br>- checkpoint_store（拒绝时回滚） |
| **失败处理** | - reject → handoff + rollback<br>- 无法回滚时 halt 并告警 |
| **安全边界** | - 仅 Human 可设置 deny 级别<br>- 拒绝记录审计日志 |
| **复用价值** | 高 - 适用于所有需人工审批的场景 |

**实现位置**：`shadowflow/runtime/service.py:_reject_locked()`

---

### 4. SkillDistiller（SEED 自进化）

| 字段 | 值 |
|---|---|
| **名称** | `seed.distiller` |
| **类型** | 自定义 |
| **场景** | A 节点（Adjuster）技能沉淀 |
| **输入** | - 迭代轨迹（LoopRecord.iterations）<br>- 成功模式标识（converged=true 的轮次）|
| **输出** | - 可复用技能（YAML manifest）<br>- 沉淀到 River Memory |
| **调用条件** | - `controller.type == "memory_nudge"`<br>- loop 收敛后 |
| **依赖** | - River Memory（沉淀层）<br>- 文件系统（技能存储） |
| **失败处理** | 失败跳过沉淀，不影响主流程 |
| **安全边界** | - 不沉淀敏感信息<br>- 沉淀技能需人工审核后启用 |
| **复用价值** | 高 - 跨项目技能共享 |

**实现位置**：`shadowflow/runtime/river_memory.py:settle()`

---

## 协作执行技能

### 5. AgentTeamsDispatch

| 字段 | 值 |
|---|---|
| **名称** | `agentteams.dispatch` |
| **类型** | 内置 |
| **场景** | 多 Agent 并行协作 |
| **输入** | - goal（任务描述）<br>- team_spec（workers + skills）<br>- provider（hermes/openclaw） |
| **输出** | - matrix_room（协作房间 ID）<br>- dispatched_event（事件 ID）<br>- team_cr（Team CR YAML） |
| **调用条件** | - `executor.kind == "agentteams"`<br>- dry_run=false |
| **依赖** | - AgentTeams controller（K8s）<br>- Matrix Homeserver<br>- Higress（LLM 网关） |
| **失败处理** | - dry_run=true 返回确定性计划<br>- 无后端时 RuntimeError |
| **安全边界** | - 不暴露内部凭证<br>- 房间隔离（每个 goal 独立房间） |
| **复用价值** | 高 - AgentTeams 标准协作接口 |

**实现位置**：`shadowflow/runtime/executors.py:AgentTeamsExecutor`

---

### 6. MatrixEventBridge

| 字段 | 值 |
|---|---|
| **名称** | `matrix.bridge` |
| **类型** | 内置 |
| **场景** | Matrix 事件流 → AgentEvent 转换 |
| **输入** | - Matrix 房间事件<br>- room_id |
| **输出** | - agent.teams.decomposed（任务拆解）<br>- agent.step（执行步骤）<br>- agent.artifact（产物） |
| **调用条件** | - AgentTeamsExecutor.stream_events()<br>- Sensor 订阅 |
| **依赖** | - Matrix Client（httpx）<br>- 事件解析器 |
| **失败处理** | - 连接失败时 emit agent.failed |
| **安全边界** | - 仅读权限<br>- 不修改 Matrix 状态 |
| **复用价值** | 中 - Matrix 特定，其他总线需适配 |

**实现位置**：`shadowflow/runtime/agentteams_bridge.py:MatrixClient`

---

## 记忆与重放技能

### 7. RiverMemoryDrink

| 字段 | 值 |
|---|---|
| **名称** | `river.drink` |
| **类型** | 内置 |
| **场景** | 跨迭代记忆召回 |
| **输入** | - type（召回类型：recent/success/failed）<br>- filter（过滤条件） |
| **输出** | - RiverChunk 列表（历史 IterationRecord） |
| **调用条件** | - `config.memory.river == true`<br>- loop 入口（每轮 drink） |
| **依赖** | - River Memory（主流/沉淀层） |
| **失败处理** | - 返回空列表，不影响主流程 |
| **安全边界** | - 仅召回当前 run_id 的数据<br>- 不跨 workspace 访问 |
| **复用价值** | 高 - 通用的跨轮次记忆机制 |

**实现位置**：`shadowflow/runtime/river_memory.py:drink()`

---

### 8. RiverMemorySettle

| 字段 | 值 |
|---|---|
| **名称** | `river.settle` |
| **类型** | 内置 |
| **场景** | 成功模式沉淀 |
| **输入** | - chunk（RiverChunk：模式+元数据）<br>- pattern（沉淀模式标识） |
| **输出** | - settled_count（沉淀条目数） |
| **调用条件** | - loop 收敛后<br>- A 节点调用 |
| **依赖** | - River Memory（沉淀层） |
| **失败处理** | - 记录警告，不影响主流程 |
| **安全边界** | - 不覆盖已存在模式<br>- 沉淀大小限制（单次 < 1MB） |
| **复用价值** | 高 - SEED 机制核心 |

**实现位置**：`shadowflow/runtime/river_memory.py:settle()`

---

### 9. CheckpointReplay

| 字段 | 值 |
|---|---|
| **名称** | `checkpoint.replay` |
| **类型** | 内置 |
| **场景** | 中断恢复 / 反事实重放 |
| **输入** | - checkpoint_id（恢复点）<br>- loop_node_id（目标 loop）<br>- target_iteration（目标迭代） |
| **输出** | - 新 run_id（重放后） |
| **调用条件** | - resume() 调用<br>- reject_loop_iteration（迭代级拒绝） |
| **依赖** | - checkpoint_store |
| **失败处理** | - checkpoint 不存在时 ValueError |
| **安全边界** | - 仅恢复当前 user 的 run<br>- 不跨 workspace 恢复 |
| **复用价值** | 高 - 核心恢复机制 |

**实现位置**：`shadowflow/runtime/service.py:reject_loop_iteration()`

---

## 工具调用技能

### 10. ToolCaller

| 字段 | 值 |
|---|---|
| **名称** | `tool.caller` |
| **类型** | 内置 |
| **场景** | 代码执行 / 文件操作 / 信息检索 |
| **输入** | - tool_name（工具标识）<br>- args（工具参数） |
| **输出** | - tool_result（工具返回） |
| **调用条件** | - Agent 请求工具调用<br>- LLM 输出 tool_call |
| **依赖** | - tool-runner（11 个内置工具）<br>- 文件系统（workspace_dir） |
| **失败处理** | - 工具不存在 / 参数错误 → agent.failed |
| **安全边界** | - 工作区隔离（workspace_dir）<br>- 敏感操作需审批 |
| **复用价值** | 高 - 工具生态入口 |

**实现位置**：`shadowflow/lib/tool-runner.py`

---

### 11. KnowledgeRetrieve（RAG 检索）

| 字段 | 值 |
|---|---|
| **名称** | `knowledge.retrieve` |
| **类型** | 内置 |
| **场景** | knowledge-grounded 生成（agent/loop 执行流内检索 KnowledgePack）|
| **输入** | - pack_id（KnowledgePack 标识）<br>- query（检索问题，或 payload.prompt）<br>- mode（naive/local/global/hybrid）|
| **输出** | - answer（检索答案）<br>- contexts（上下文列表，可 writeback 给下游 LLM 节点）|
| **调用条件** | - 节点 `executor.kind == "rag"` |
| **依赖** | - LightRAG（LIGHTRAG_ENABLED=true 时）<br>- KnowledgePack 索引 |
| **失败处理** | - LIGHTRAG 未启用 → 降级空上下文（required=true 才硬失败）|
| **安全边界** | - 仅检索当前 workspace 的 KnowledgePack<br>- 查询失败不阻塞主流程（默认）|
| **复用价值** | 高 - 任何 agent 流的 RAG 接入点 |

**实现位置**：`shadowflow/runtime/executors.py:RagExecutor`（2026-08-15 新增）

---

### 12. AgentTeamsPackageExport（代码包导出）

| 字段 | 值 |
|---|---|
| **名称** | `agentteams.export` |
| **类型** | 内置 |
| **场景** | 复赛必交「可执行代码包」离线导出（无需集群）|
| **输入** | - workflow（WorkflowDefinition DAG）<br>- out（目录或 .zip 路径）|
| **输出** | - team-cr.yaml（与 live 派发一致的 Team CR）<br>- workflow.json / manifest.json / run.sh / README.md |
| **调用条件** | - CLI `shadowflow export-agentteams <wf.json>`<br>- HTTP `POST /workflow/export/agentteams` |
| **依赖** | - 无外部依赖（确定性翻译）|
| **失败处理** | - DAG 校验失败 → ValueError（400）|
| **安全边界** | - 导出内容不含凭证<br>- CR schema 集中在 render_team_cr 一处易跟进官方 CRD |
| **复用价值** | 高 - 离线交付 = live spec，一份材料两用 |

**实现位置**：`shadowflow/runtime/agentteams_package.py`（2026-08-15 新增）

---

## Skill 统计

| 类别 | 数量 |
|---|---|
| 循环引擎核心 | 4 |
| 协作执行 | 3 |
| 记忆与重放 | 3 |
| 工具调用 | 1 |
| 知识检索 | 1 |
| **总计** | **12** |

---

## 参考索引

- 设计文档：`docs/architecture/loop-engine-design.md` 附录 C
- 技能实现：`shadowflow/runtime/` + `server/skills/`
- 工具清单：`shadowflow/lib/tool-runner.py`
