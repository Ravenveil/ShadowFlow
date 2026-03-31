# AgentGraph 高层 Schema 字段契约 v1

> 日期：2026-03-30
> 状态：Draft v1
> 目的：把 `ToolSpec / SkillSpec / RoleSpec / AgentSpec / WorkflowTemplateSpec` 收敛成可实现字段级契约

---

## 1. ToolSpec

最小字段：

```yaml
tool_id: "filesystem"
version: "0.1"
kind: "builtin"
name: "Filesystem"
description: "Read local files"
capabilities: []
runtime: {}
io:
  input_schema: {}
  output_schema: {}
policy:
  trust_level: "internal"
  side_effects: "read_only"
metadata: {}
```

字段说明：

- `tool_id`
  稳定工具 ID
- `version`
  spec 版本
- `kind`
  `cli | mcp | api | builtin`
- `runtime`
  连接与调用信息
- `capabilities`
  语义化能力标签

当前最小校验：

- `cli` 必须有 `runtime.command`
- `mcp` 必须有 `runtime.endpoint`
- `api` 必须有 `runtime.provider`
- `builtin` 必须有 `runtime.builtin`

---

## 2. SkillSpec

最小字段：

```yaml
skill_id: "code_review"
version: "0.1"
name: "Code Review"
description: "Review code risks"
intent:
  category: "review"
  triggers: []
instructions:
  system: "优先找风险"
  procedure: []
quality_bar:
  must_check: []
recommended_tools: []
output_contract:
  format: null
  sections: []
fallback:
  on_missing_context: {}
metadata: {}
```

字段说明：

- `intent`
  任务意图与触发条件
- `instructions`
  方法说明与步骤
- `quality_bar`
  质量底线
- `recommended_tools`
  推荐工具，不等于强绑定工具

---

## 3. RoleSpec

最小字段：

```yaml
role_id: "reviewer"
version: "0.1"
name: "Reviewer"
extends: null
description: "Identify risks clearly"
objectives: []
responsibilities: []
constraints: []
style:
  tone: null
  verbosity: null
  audience: null
  format_preference: null
decision_policy:
  priorities: []
  heuristics: []
  escalation_triggers: []
collaboration:
  expects: []
  handoff_outputs: []
  asks_for_help_when: []
metadata: {}
```

字段说明：

- `responsibilities`
  角色职责
- `constraints`
  角色边界
- `style`
  表达风格
- `objectives`
  角色首先追求的结果
- `decision_policy`
  角色的决策优先级、启发式和升级触发条件
- `collaboration`
  角色期望的输入、交接输出和求助触发条件

当前实现已支持：

- `extends`
  Role 可以继承另一个 Role，并在子 Role 中覆盖字段

---

## 4. AgentSpec

最小字段：

```yaml
agent_id: "pr_reviewer"
version: "0.1"
name: "PR Reviewer"
role: "reviewer"
skills: []
tools: []
prompt_template: null
node_type: "agent.execute"
executor:
  kind: "cli"
  provider: "claude"
memory:
  scope: "session"
  writeback_target: null
policy:
  autonomy: "medium"
  allow_side_effects: false
  max_steps: null
io:
  accepts: []
  produces: []
metadata: {}
```

字段说明：

- `role`
  引用 `RoleSpec.role_id`
- `skills`
  引用 `SkillSpec.skill_id`
- `tools`
  引用 `ToolSpec.tool_id`
- `prompt_template`
  可选；若为空，由 compiler 自动合成 prompt
- `node_type`
  当前默认编译成 `agent.execute`
- `executor`
  运行时执行配置
- `memory / policy / io`
  agent 的运行约束与输入输出描述

当前实现已支持：

- `extends`
  Agent 可以继承另一个 Agent，并在子 Agent 中覆盖字段

---

## 5. WorkflowTemplateSpec

最小字段：

```yaml
template_id: "planner-coder-reviewer"
version: "0.1"
name: "Planner Coder Reviewer"
description: ""
parameters: {}
agents: []
flow:
  entrypoint: "planner"
  edges: []
policy_matrix:
  agents: {}
stages: []
defaults: {}
metadata: {}
```

字段说明：

- `parameters`
  模板暴露给用户填写的参数
- `agents`
  模板里的 agent 实例
- `flow`
  模板级连线
- `policy_matrix`
  模板级权限矩阵与副作用约束
- `stages`
  模板级阶段 / lane 结构
- `defaults`
  编译进 workflow 的默认项

### 5.1 TemplateParameterSpec

```yaml
goal:
  type: "string"
  required: true
  default: null
  description: "Task goal"
```

当前支持类型：

- `string`
- `number`
- `boolean`
- `json`

### 5.2 TemplateAgentSpec

```yaml
- id: "reviewer"
  ref: "pr_reviewer"
  assignment: {}
  overrides: {}
```

字段说明：

- `id`
  在模板内部的实例 ID
- `ref`
  引用 `AgentSpec.agent_id`
- `assignment`
  当前 workflow 中分配给该角色实例的具体职责
- `overrides`
  对 agent 的局部覆盖

`assignment` 当前推荐字段：

```yaml
assignment:
  focus: "只看回归风险"
  deliverable: "风险报告"
  handoff_goal: "给下游 reviewer 一个清晰结论"
  owned_topics:
    - "regression"
    - "tests"
  notes: "优先关注关键路径"
```

### 5.3 TemplateFlowSpec

```yaml
flow:
  entrypoint: "reviewer"
  edges:
    - from: "reviewer"
      to: "END"
      type: "final"
```

边类型当前与 runtime workflow 保持一致：

- `default`
- `conditional`
- `final`

### 5.4 WorkflowPolicyMatrixSpec

```yaml
policy_matrix:
  agents:
    reviewer:
      tools:
        - "filesystem"
      side_effects: "read_only"
      requires_confirmation: true
      writeback_targets: []
```

字段说明：

- `tools`
  当前模板 agent 允许使用的 tool 集
- `side_effects`
  `inherit | read_only | write | mixed`
- `requires_confirmation`
  是否需要确认
- `writeback_targets`
  当前 agent 允许写回的位置

### 5.5 WorkflowStageSpec

```yaml
stages:
  - stage_id: "review"
    name: "Review"
    lane: "quality"
    agents:
      - "reviewer"
    barrier: false
    approval_required: true
```

字段说明：

- `stage_id`
  阶段 ID
- `lane`
  泳道 / 协作线
- `agents`
  当前阶段包含的模板 agent 实例
- `barrier`
  是否作为汇合点
- `approval_required`
  是否要求审批/确认

---

## 6. 编译输出

当前 compile 输出目标是：

**canonical `WorkflowDefinition`**

编译规则：

1. `Template.agents[].ref` 展开成 `AgentSpec`
2. `AgentSpec.role / skills / tools / executor` 编译进 node `config`
3. `Template.flow` 编译成 `edges`
4. `policy_matrix` 在 compile 时做静态校验，并编译进 node `config.template_policy`
5. `stages` 编译进 node `config.template_stage`
6. `Template.defaults` 编译成 workflow `defaults`
7. `Template.parameters` 渲染进 prompt / metadata / condition 等字符串字段

---

## 7. 当前 CLI 能力

当前已支持：

```bash
agentgraph compile \
  --template docs-review-template \
  --registry-root examples/highlevel/minimal-registry \
  --var goal="Audit docs"
```

输出：

- canonical workflow JSON
- 可选 `--format yaml`
- 可选 `--output`

---

## 8. 当前阶段的收口原则

这套字段契约当前的目标不是“一次性覆盖所有未来设想”，而是：

1. 先把高层对象变成真实 schema
2. 先让模板能稳定编译成 workflow
3. 先让用户开始通过积木定义 Agent

后续再逐步补：

- registry 管理命令
- scaffold / init
- guided wizard
- template marketplace
