# AgentGraph 高层 Schema 设计 v1

> 日期：2026-03-30
> 状态：Draft v1
> 目的：定义 AgentGraph 主线里的高层对象模型，让用户能够像搭积木一样定义 Agent，再编译成 workflow

---

## 1. 文档目标

这份文档回答三个问题：

1. AgentGraph 接下来应该把哪些对象正式建模出来
2. 用户怎样更自然地定义自己的 Agent
3. 这些高层对象怎样最终落到底层 `WorkflowDefinition`

当前判断是：

**Phase 1 的 runtime / CLI / API 已经能跑。**
**下一阶段的核心不是继续堆执行命令，而是补高层定义层。**

也就是：

- 先有 `Tool / Skill / Role / Agent / Template`
- 再由系统把它们编译成 `workflow nodes + edges`

---

## 2. 一句话总纲

建议正式采用下面这条总纲：

**`Tool` 是能力接入层。**
**`Skill` 是方法模板层。**
**`Role` 是职责视角层。**
**`Agent` 是装配后的执行单元。**
**`WorkflowTemplate` 是多个 Agent 的组合蓝图。**

最终关系是：

**`WorkflowTemplate -> compile -> WorkflowDefinition -> RuntimeRequest -> RunResult`**

---

## 3. 为什么要加高层 Schema

如果没有高层 schema，用户只能：

- 手写 workflow yaml
- 直接拼 prompt
- 手动挂 executor
- 自己理解节点如何连线

这会导致两个问题：

1. **表达层太低**
   用户脑子里想的是“我要一个 reviewer”，系统却要求他写 `node + edge + artifact + route condition`

2. **复用能力太弱**
   同一个“代码审查 agent”会在多个 workflow 里重复手写

所以高层 schema 的目标不是替代 runtime contract，而是：

**在 runtime contract 上面再加一层更贴近用户心智的定义层。**

---

## 4. 总体分层

建议 AgentGraph 高层对象固定成这五层：

### 4.1 ToolSpec

定义“能调用什么”

### 4.2 SkillSpec

定义“怎么做事”

### 4.3 RoleSpec

定义“以什么职责视角做事”

### 4.4 AgentSpec

定义“一个可执行的角色化 agent”

### 4.5 WorkflowTemplateSpec

定义“多个 Agent 如何装配成任务流程”

---

## 5. ToolSpec

### 5.1 定位

`ToolSpec` 是能力接入件。

它不关心“方法”，只关心：

- 这个能力是什么
- 怎么连接
- 怎么调用
- 输入输出是什么

### 5.2 类型建议

建议内置四类：

- `cli`
- `mcp`
- `api`
- `builtin`

### 5.3 最小结构

```yaml
tool_id: "github_mcp"
version: "0.1"
kind: "mcp"
name: "GitHub MCP"
description: "提供 issue / PR / repo 查询能力"
capabilities:
  - "issues.read"
  - "pull_requests.read"
  - "repos.read"
runtime:
  endpoint: "mcp://github"
  auth: "inherit"
io:
  input_schema: {}
  output_schema: {}
policy:
  trust_level: "external"
  side_effects: "read_only"
metadata: {}
```

### 5.4 不同 kind 的典型 runtime 字段

#### `cli`

```yaml
runtime:
  command: "codex"
  args: []
  cwd_policy: "inherit"
  stdin_mode: "json"
  stdout_mode: "json"
```

#### `mcp`

```yaml
runtime:
  endpoint: "mcp://github"
  server: "github"
  toolset: ["issues", "pull_requests"]
```

#### `api`

```yaml
runtime:
  provider: "openai"
  base_url: null
  auth_env: "OPENAI_API_KEY"
```

#### `builtin`

```yaml
runtime:
  builtin: "workflow.inspect"
```

### 5.5 ToolSpec 的作用

`ToolSpec` 的价值在于：

- 把 CLI / MCP / API 都收敛成统一工具对象
- 允许 Agent 在高层直接引用工具 ID
- 让权限、依赖、I/O、运行时形态可被静态检查

---

## 6. SkillSpec

### 6.1 定位

`SkillSpec` 是方法模板。

它不直接提供工具，而是定义：

- 典型步骤
- 质量标准
- 推荐工具
- fallback 规则
- 输出偏好

### 6.2 最小结构

```yaml
skill_id: "code_review"
version: "0.1"
name: "Code Review"
description: "面向代码风险审查的方法模板"
intent:
  category: "review"
  triggers:
    - "review code"
    - "find bugs"
    - "审查代码"
instructions:
  system: "优先识别 bug、风险、行为回归和测试缺口。"
  procedure:
    - "先理解目标改动"
    - "优先找高严重度问题"
    - "再评估测试覆盖"
quality_bar:
  must_check:
    - "behavior_regression"
    - "edge_cases"
    - "missing_tests"
recommended_tools:
  - "filesystem"
  - "ripgrep"
  - "github_mcp"
output_contract:
  format: "findings_first"
  sections:
    - "findings"
    - "open_questions"
    - "change_summary"
fallback:
  on_missing_context:
    action: "ask_for_diff_or_scan_repo"
metadata: {}
```

### 6.3 SkillSpec 的核心价值

有了 Skill，用户定义 Agent 时不必先思考底层 prompt 和步骤。

用户可以直接说：

- 我需要一个 `code_review` skill
- 我需要一个 `research_synthesis` skill
- 我需要一个 `release_check` skill

然后系统再推断它应该挂哪些工具。

---

## 7. RoleSpec

### 7.1 定位

`RoleSpec` 负责表达职责视角。

Role 解决的不是“怎么做”，而是：

- 这个 Agent 站在什么立场
- 它的边界是什么
- 它偏向关注什么

### 7.2 最小结构

```yaml
role_id: "reviewer"
version: "0.1"
name: "Reviewer"
description: "优先识别风险、缺口和回归"
responsibilities:
  - "风险识别"
  - "质量判断"
  - "测试缺口提示"
constraints:
  - "不要直接修改需求定义"
  - "不要跳过风险说明"
style:
  tone: "clear_and_direct"
  verbosity: "concise"
metadata: {}
```

### 7.3 为什么 Role 也要独立

因为同一个 Skill 可以被不同 Role 采用，但关注点不同。

例如：

- `code_review` skill
  - 给 `reviewer` 用时，强调 bug 和风险
  - 给 `maintainer` 用时，可能更强调长期维护性

所以 `Role` 和 `Skill` 也不应该合并。

---

## 8. AgentSpec

### 8.1 定位

`AgentSpec` 是真正给用户“搭积木”的核心对象。

它不是 node，不是 workflow，而是一个可执行 agent 的定义。

### 8.2 核心公式

建议采用下面这个定义：

**`Agent = Role + Skills + Tools + Policy + Memory + ExecutorProfile`**

### 8.3 最小结构

```yaml
agent_id: "pr_reviewer"
version: "0.1"
name: "PR Reviewer"
role: "reviewer"
skills:
  - "code_review"
tools:
  - "filesystem"
  - "ripgrep"
  - "github_mcp"
executor:
  kind: "cli"
  provider: "claude"
memory:
  scope: "session"
  writeback_target: "memory"
policy:
  autonomy: "medium"
  allow_side_effects: false
  max_steps: 8
io:
  accepts:
    - "pull_request"
    - "diff"
  produces:
    - "review_findings"
metadata: {}
```

### 8.4 AgentSpec 应该支持的两种来源

#### 方式 A：显式装配

用户手工指定：

- role
- skills
- tools
- executor

#### 方式 B：从 preset 派生

用户只写：

```yaml
extends: "builtins/pr_reviewer"
overrides:
  executor:
    provider: "codex"
```

这样更适合真正的“搭积木”体验。

---

## 9. WorkflowTemplateSpec

### 9.1 定位

`WorkflowTemplateSpec` 是多个 Agent 的组合蓝图。

这是用户真正应该直接面对的最高层对象。

### 9.2 最小结构

```yaml
template_id: "planner-coder-reviewer"
version: "0.1"
name: "Planner Coder Reviewer"
description: "适合需求实现类任务的三段式工作流"
parameters:
  goal:
    type: "string"
    required: true
  repo_path:
    type: "string"
    required: false
agents:
  - id: "planner"
    ref: "task_planner"
  - id: "coder"
    ref: "feature_coder"
  - id: "reviewer"
    ref: "pr_reviewer"
flow:
  entrypoint: "planner"
  edges:
    - from: "planner"
      to: "coder"
      type: "default"
    - from: "coder"
      to: "reviewer"
      type: "default"
    - from: "reviewer"
      to: "END"
      type: "final"
defaults:
  memory_scope: "session"
policy_matrix:
  agents: {}
stages: []
metadata: {}
```

### 9.3 Template 的作用

Template 解决的是：

- 用户不想自己画所有节点
- 用户只想选择一个熟悉的模式
- 用户只想填几个参数

因此模板应该支持：

- 参数暴露
- Agent 组合
- flow 连接
- policy matrix
- stage / lane
- 默认 executor / memory / writeback

---

## 10. Compile 过程

### 10.1 高层到低层的关系

建议把 compile 过程明确为：

```text
ToolSpec / SkillSpec / RoleSpec / AgentSpec / WorkflowTemplateSpec
    ->
AgentGraph Compiler
    ->
WorkflowDefinition
    ->
RuntimeRequest
```

### 10.2 Compiler 至少要做什么

1. 把 `Template.agents[].ref` 展开成实际 Agent
2. 把 Agent 的 `role / skills / tools / executor` 转成 node config
3. 对 `policy_matrix` 做 compile-time validation
4. 把 `stages / lanes` 编译进 node config
5. 生成稳定的 `nodes`
6. 生成稳定的 `edges`
7. 注入 defaults
8. 输出 canonical `WorkflowDefinition`

### 10.3 编译后的 node 应该长什么样

例如 `AgentSpec` 编译后，目标 node 可能类似：

```yaml
- id: "reviewer"
  kind: "agent"
  type: "agent.execute"
  config:
    role: "reviewer"
    executor:
      kind: "cli"
      provider: "claude"
    agent_ref: "pr_reviewer"
    skill_refs:
      - "code_review"
    tool_refs:
      - "filesystem"
      - "github_mcp"
```

也就是说：

**高层对象不替代 runtime schema。**
**高层对象只是生成 runtime schema。**

---

## 11. 用户定义方式

建议对用户开放三种层级的入口。

### 11.1 初级用户：选模板

只需要：

- 选一个模板
- 填几个参数

例如：

```bash
agentgraph init workflow --template planner-coder-reviewer
```

### 11.2 中级用户：拼 Agent

用户自己选：

- 角色
- 方法
- 工具
- 执行器

例如：

```bash
agentgraph init agent --role reviewer --skill code_review --tool github_mcp --tool filesystem
```

### 11.3 高级用户：手写 spec

用户直接编写：

- `agent.yaml`
- `template.yaml`

再执行 compile。

---

## 12. 推荐目录结构

建议后续仓库或项目目录支持下面这种布局：

```text
agentgraph/
  roles/
  skills/
  tools/
  agents/
  templates/
  workflows/
```

更具体一点：

```text
roles/
  reviewer.yaml
  planner.yaml

skills/
  code_review.yaml
  research_synthesis.yaml

tools/
  github_mcp.yaml
  filesystem.yaml
  claude_cli.yaml

agents/
  pr_reviewer.yaml
  task_planner.yaml

templates/
  planner-coder-reviewer.yaml
  research-review-publish.yaml
```

---

## 13. Phase 2 建议实施顺序

### Step 1

先冻结 schema 概念，不急着实现全部功能。

### Step 2

先实现只读 registry：

- `ToolRegistry`
- `SkillRegistry`
- `RoleRegistry`
- `AgentRegistry`
- `TemplateRegistry`

### Step 3

实现 `compile(template -> workflow)`

### Step 4

实现 scaffold：

- `agentgraph init tool`
- `agentgraph init skill`
- `agentgraph init agent`
- `agentgraph init template`

### Step 5

再考虑 wizard / guided generation

也就是：

- 先把对象模型定清楚
- 再做引导式体验

---

## 14. 当前不做什么

为了避免再次边界膨胀，这层 schema 当前不做：

1. 不做图形编辑器
2. 不做可视化流程搭建器
3. 不做复杂市场化分发
4. 不做自动从自然语言一次性生成全部对象并直接执行
5. 不做组织级 skill marketplace

当前最重要的是：

**先把对象模型稳定下来。**

---

## 15. 最终结论

AgentGraph 接下来最重要的主线，不是继续添加零散命令，而是：

**把 Agent 正式建模为可装配对象。**

建议正式采用下面这条链：

**`ToolSpec -> SkillSpec -> RoleSpec -> AgentSpec -> WorkflowTemplateSpec -> WorkflowDefinition`**

这样一来：

- 用户定义的是“积木”
- 系统执行的是“graph”

这正好对齐你最初的核心思想：  
**人不直接手搓底层图，而是先搭高层积木，再由系统编译成可执行工作流。**
