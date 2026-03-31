# AgentGraph Agent 定义分层 v1

> 日期：2026-03-30
> 状态：Draft v1
> 目的：固定 AgentGraph 主线里 `Tool / Skill / Role / Agent / Template` 的分层关系，避免后续把 `CLI / MCP / Skill` 混成一个概念

---

## 1. 核心结论

当前主线下最重要的建模结论是：

**`CLI` 和 `MCP` 属于 Tool 接入层。**
**`Skill` 不属于 Tool 本体，而属于方法模板层。**

换句话说：

- `Tool` 回答的是：**能调用什么**
- `Skill` 回答的是：**怎么调用**
- `Template` 回答的是：**在某类任务里通常怎么组合**

所以：

- `CLI` 是 Tool runtime
- `MCP` 是 Tool protocol / tool source
- `Skill` 是方法模板 / 能力使用层

---

## 2. 为什么 Tool 和 Skill 不能混成一层

如果把下面这些东西全部都叫 `tool`：

- Claude CLI
- GitHub MCP
- 文件系统读写
- 代码审查方法
- 需求澄清流程

那么 schema 很快就会失去边界。

因为它们回答的问题并不一样：

### 2.1 Tool 回答的是能力接入

- 这个能力怎么调用
- 输入输出是什么
- 运行时在哪里
- 是 CLI、MCP、API 还是 builtin

### 2.2 Skill 回答的是方法与策略

- 在什么场景下调用哪些工具
- 步骤顺序是什么
- 结果怎样才算合格
- 失败时如何 fallback

### 2.3 Template 回答的是装配方式

- 这个任务通常需要哪些 Agent
- 每个 Agent 挂哪些 Skill 和 Tool
- 节点如何连接
- 用户只需要填哪些参数

因此：

**Tool 是能力接入件。**
**Skill 是方法模板。**
**Template 是组合模板。**

---

## 3. 建议的对象层级

建议把 AgentGraph 主线固定成五层：

### 3.1 Role

定义职责、视角、边界。

例如：

- `planner`
- `reviewer`
- `coder`
- `researcher`

### 3.2 Tool

定义可调用能力。

Tool 内部再分几类：

- `cli`
- `mcp`
- `api`
- `builtin`

例如：

- `claude_cli`
- `codex_cli`
- `github_mcp`
- `filesystem`
- `ripgrep`
- `browser`

### 3.3 Skill

定义方法模板。

Skill 的职责不是“提供工具”，而是“告诉 Agent 如何组织行为”。

例如：

- `code_review`
- `bug_fix`
- `spec_refinement`
- `release_check`
- `research_synthesis`

Skill 典型应包含：

- instruction
- heuristics
- procedure
- quality bar
- fallback strategy
- recommended tools

### 3.4 Agent

Agent 应定义为：

**`Agent = Role + Skills + Tools + Policy + Memory + Executor`**

也可以先收敛成最小版：

**`Agent = Role + SkillSet + ToolSet + ExecutorProfile`**

### 3.5 Workflow Template

Workflow Template 负责组合多个 Agent，形成用户可复用的蓝图。

例如：

- `single-agent-debug`
- `planner-coder-reviewer`
- `research-review-publish`

---

## 4. 为什么 Skill 必须独立建模

### 4.1 方法本身就是模板

“方法模板”本身是一个非常合理、而且必须存在的对象。

在 AgentGraph 里，这个对象就应该被命名为：

**`Skill`**

也就是说：

- 不是反对“方法模板”
- 恰恰相反，是要把“方法模板”正式建模出来
- 只是它不应该并入 Tool

### 4.2 Skill 的生命周期和 Tool 不同

Tool 往往更稳定：

- Claude CLI
- GitHub MCP
- Browser MCP

Skill 更容易被团队经验持续更新：

- 如何做 code review
- 如何拆计划
- 如何做发布前检查
- 如何做风险扫描

因此 Skill 应该能：

- 单独版本化
- 单独评测
- 单独替换
- 单独推荐

### 4.3 Skill 是“搭积木体验”的关键

如果没有 Skill，用户只能：

- 直接配 tool
- 直接写 prompt
- 直接写 workflow

这样不是搭积木，而是在手搓底层电路。

如果有 Skill，用户就可以说：

- 我要一个“代码审查”能力
- 我要一个“设计方案”能力
- 我要一个“调研总结”能力

系统再把 Skill 需要的 Tool 自动挂上去。

这才更接近真正可用的 Agent 组装体验。

---

## 5. 建议的最小定义关系

### 5.1 Tool

**原子能力**

负责：

- 接入能力
- 描述 I/O
- 描述运行时
- 描述权限与依赖

### 5.2 Skill

**方法模板**

负责：

- 行为步骤
- 方法建议
- 成功判定
- 推荐工具组合

### 5.3 Agent

**角色化执行单元**

负责：

- 用某个角色视角
- 在某些约束下
- 调用某些 Tool
- 按某些 Skill 做事

### 5.4 Workflow Template

**面向用户的可复用蓝图**

负责：

- 组合多个 Agent
- 暴露少量参数
- 生成底层 workflow

---

## 6. 对 AgentGraph 主线的直接影响

后续主线不应继续只围绕 `workflow node` 做增量补丁。

应该开始补高层 schema：

1. `ToolSpec`
2. `SkillSpec`
3. `RoleSpec`
4. `AgentSpec`
5. `WorkflowTemplateSpec`
6. `compile(template -> workflow)`

也就是说：

**用户最终最好不是手写 graph。**
**而是先定义 Agent / Template，再编译成 graph。**

---

## 7. 一句话版结论

这份文档要固定的核心判断是：

**Tool 是能力接入层。**
**Skill 是方法模板层。**
**Agent 是 Role + Skill + Tool 的组合体。**
**Template 是多个 Agent 的装配蓝图。**

这也是 AgentGraph 后续实现“像搭积木一样定义 Agent”的基础。
