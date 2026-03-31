# AgentGraph 的 gstack 启发 v1

> 日期：2026-03-30
> 状态：Draft
> 来源对照：`D:\知识库\shadow\优秀微信公众号文章集锦\gstack.md`

---

## 1. 结论

我们现在讨论的，和 `gstack.md` 里描述的核心思想，基本是同一类东西。

共同点在于：

1. 都不是把 agent 当成“随便问一句的大模型”
2. 都强调“角色化”的工作方式
3. 都强调“方法/技能”对输出质量的决定作用
4. 都希望用户不要直接面对底层实现细节
5. 都希望通过引导式流程，让用户更容易得到结构化方案

但 AgentGraph 不会直接复刻 gstack。

AgentGraph 要走的是：

`角色/方法/工具/Agent/模板 -> compile -> workflow -> runtime`

也就是说，gstack 更像“角色化工作入口”，而 AgentGraph 要成为“角色化工作入口背后的编排系统”。

---

## 2. gstack 真正值得借的东西

基于 `gstack.md`，最值得借的不是某个具体命令，而是下面三层逻辑。

### 2.1 角色优先，而不是提示词优先

gstack 的关键判断是：

- 不要靠不同程度的 prompt 期待稳定输出
- 要给 agent 一个明确角色、明确职责、明确约束

这对 AgentGraph 的启发是：

- `RoleSpec` 必须是一级对象
- Agent 不是 prompt
- Agent 应该先有职责边界，再有实现方式

---

### 2.2 Skill 是“思考/做事方式”的载体

gstack 把 slash command 当成一种技能化工作模式。

对 AgentGraph 来说，这说明：

- Skill 不应该只是 prompt 片段
- Skill 应该承载方法、步骤、优先级、检查项、失败回退
- Skill 应该独立于 Tool 建模

因此我们之前定的这句是正确的：

- `Tool` 回答“能用什么”
- `Skill` 回答“怎么用”

---

### 2.3 用户入口应该是引导，而不是图

gstack 的好用，本质上不是“它有六个命令”，而是：

- 它先帮用户进入正确工作模式
- 它减少了用户直接面对底层复杂度的负担

对 AgentGraph 的启发是：

- 用户不应该先写 workflow graph
- 用户应该先选任务类型、角色和方法
- 系统再帮助用户生成 Agent 与模板

所以 AG 的更合理入口应该是：

1. Preset
2. Wizard
3. Advanced

而不是默认让用户从 YAML graph 开始。

---

## 3. gstack 不该直接照搬的地方

### 3.1 不要把 slash command 本身当成核心数据模型

gstack 在 Claude Code 里天然适合用 slash command 承接角色。

但 AgentGraph 的核心不是命令集合，而是：

- typed schema
- registry
- compile
- runtime

所以 slash command 可以成为入口，但不能成为底层主模型。

---

### 3.2 不要把系统退化成一堆 Markdown prompt 文件

gstack 的强项是轻量、可装即用。

但 AgentGraph 要承担的是：

- 可验证
- 可版本化
- 可编译
- 可执行
- 可追踪

因此我们不能只停留在“角色 markdown + 技能 markdown”的层面，必须继续收口到：

- `ToolSpec`
- `SkillSpec`
- `RoleSpec`
- `AgentSpec`
- `WorkflowTemplateSpec`

---

### 3.3 不要把所有体验都塞进 AgentGraph CLI

gstack 的使用形态比较偏用户工作台。

但 AgentGraph 已经明确边界：

- `AgentGraph CLI` 是开发者/运维/编排 CLI
- `Shadow CLI` 才是用户工作台 CLI

所以 gstack 的“用户入口体验”值得借，但承接这一层体验的更合适位置，依然是 Shadow。

---

## 4. 这对 AG 主线意味着什么

AgentGraph 的下一阶段，不该继续围绕“再补几个 runtime 命令”打转，而是该转向：

1. 让用户更容易定义 Agent
2. 让用户更容易生成模板
3. 让系统把高层定义编译成 workflow

因此主线应该收敛成三件事：

### 4.1 定义层

继续强化并稳定：

- `ToolSpec`
- `SkillSpec`
- `RoleSpec`
- `AgentSpec`
- `WorkflowTemplateSpec`

---

### 4.2 装配层

让用户像搭积木一样完成：

- 选角色
- 选方法
- 选工具
- 选执行器
- 选记忆策略

然后生成 Agent 与模板。

---

### 4.3 引导层

增加 Wizard / Scaffold，让用户通过问题引导来生成高层 spec，而不是手写底层 workflow。

这层应该问的是：

1. 你想完成什么任务
2. 这是单 Agent 还是多 Agent
3. 需要哪些工具来源
4. 需要哪些方法模式
5. 是否需要记忆写回
6. 最终产物是什么

---

## 5. 推荐的产品入口模型

### 5.1 Preset 模式

给出内置模板，例如：

- `single-reviewer`
- `planner-coder-reviewer`
- `research-review-publish`

适合快速开始。

---

### 5.2 Wizard 模式

通过问答生成：

- `ToolSpec`
- `SkillSpec`
- `AgentSpec`
- `WorkflowTemplateSpec`

再编译成 workflow。

这是最值得优先建设的入口。

---

### 5.3 Advanced 模式

允许高级用户直接编辑：

- `tools/*.yaml`
- `skills/*.yaml`
- `roles/*.yaml`
- `agents/*.yaml`
- `templates/*.yaml`

适合团队定制和版本化管理。

---

## 6. 当前最建议优先做的事情

如果按价值排序，下一阶段最值得做的是：

1. `init workflow` 或 `scaffold` 入口
2. 一版 Wizard 问答流
3. 内置 preset/template 库
4. registry import/export
5. compile 结果的可解释摘要

不建议优先做的是：

1. 重 UI
2. 图形编辑器
3. 再造一个 Claude Code 式工作台 CLI
4. 过早做复杂 market / hub

---

## 7. 最终判断

gstack 对 AgentGraph 的最大价值，不是代码复用，而是产品逻辑启发：

1. 先定义角色
2. 再定义方法
3. 再选择工具
4. 最后生成流程

因此 AG 的真正用户入口不应是底层 graph，而应是：

`Preset / Wizard / Advanced Spec`

这条路线和我们现在已经形成的高层对象模型完全一致，应该继续沿着这条路推进。
