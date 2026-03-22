# AgentGraph 是什么产品，以及后续应该怎么推进

> 日期：2026-03-22
> 状态：Draft

---

## 1. 先说结论

AgentGraph 当前最合理的产品定义，不是一个完整的终端用户工作台，也不是一个“大而全”的 Agent 平台。

它更准确的产品状态应该是：

**一个可独立安装、可命令行调用、可 HTTP 调用、可被上层产品宿主接入的多智能体图编排运行时。**

换句话说，AgentGraph 首先应该成为：

- 一个 Python 包
- 一个 CLI 工具
- 一个本地或远程可调用的 runtime 服务

而不是一上来就做成：

- Shadow 那样的完整工作台
- 统一知识主脑
- 全场景都包进来的超级平台

---

## 2. 为什么需要这样定义

当前项目里已经同时存在很多不同层次的东西：

- 多智能体编排设想
- Python runtime 雏形
- FastAPI 服务雏形
- CLI 雏形
- 前端图形编辑器
- 记忆系统、planner、Shadow 集成叙事

如果不先把“产品到底是什么”说清楚，后续实现会不断混线：

- 有人会把它理解成前端产品
- 有人会把它理解成 AI 平台
- 有人会把它理解成 Shadow 的一个子模块
- 有人会把它理解成研究实验场

所以第一步不是继续扩功能，而是先把产品层级定下来。

---

## 3. AgentGraph 的正确产品层级

### 3.1 它是什么

AgentGraph 应该是：

- workflow schema 的定义者
- 多智能体执行图的 runtime
- agent / node / edge / router / checkpoint 的契约层
- 外部宿主与多智能体编排内核之间的 adapter 边界

### 3.2 它不是什么

AgentGraph 当前不应该被定义为：

- 最终用户直接使用的完整桌面产品
- 长期知识与图谱主脑
- Shadow 的替代品
- 机器人执行平台
- 一次性打包 UI、memory、planner、knowledge substrate、tool market 的总系统

---

## 4. 做出来以后，别人会怎么用它

做出来以后，别人对 AgentGraph 的使用方式，应该主要有三种：

### 方式 1：作为 Python 包使用

开发者在 Python 中直接调用：

```python
from agentgraph import AgentGraph
```

适合：

- 本地脚本
- 后端服务
- 自动化 pipeline

### 方式 2：作为 CLI 工具使用

开发者或 Agent 直接跑：

```bash
agentgraph run -w workflow.yaml -i "..."
```

适合：

- 命令行自动化
- CI / job runner
- Agent 工具调用

### 方式 3：作为 HTTP Runtime 使用

宿主系统通过 API 调它：

```http
POST /workflow/run
```

适合：

- Shadow 这类上层产品接入
- 远程 worker / service
- 多语言系统调用

---

## 5. AgentGraph 和 Shadow 的关系

AgentGraph 与 Shadow 的关系，不应该是“谁包含谁”的关系，而应该是分层关系。

### Shadow 更像什么

Shadow 更像：

- 产品宿主
- 用户工作台
- docs / gap / verify / writeback 的闭环承载者
- unified graph substrate 的拥有者
- 长期状态和知识沉淀的主脑

### AgentGraph 更像什么

AgentGraph 更像：

- 独立多智能体图编排 runtime
- workflow execution engine
- run / step / trace / checkpoint contract provider

### 最自然的接入方式

最自然的方式是：

`Shadow -> 提交任务与上下文 -> AgentGraph 执行 -> 返回结构化结果 -> Shadow 写回自己的系统`

也就是说：

AgentGraph 不应该成为 Shadow 的第二个主脑，而应该成为 Shadow 调用的独立编排引擎。

---

## 6. AgentGraph 和 CLI-Anything 的关系

CLI-Anything 更像“工具暴露层”。

它解决的是：

- 把真实软件能力暴露成 Agent 可用 CLI

AgentGraph 解决的是：

- 把多个工具、多个 agent、多个步骤组织成 workflow

Shadow 解决的是：

- 把 workflow 纳入用户工作台、知识系统和写回闭环

因此更自然的分层是：

`CLI-Anything -> 工具层`

`AgentGraph -> 编排层`

`Shadow -> 产品宿主层`

---

## 7. 当前最应该推进的，不是“做大”，而是“收敛”

当前阶段最重要的工作，不是让 AgentGraph 继续横向长更多设想，而是把它收敛成一个明确成立的独立 runtime。

应该优先做的事：

1. 固定产品定义
2. 固定 runtime contract
3. 统一 CLI / HTTP API / 内核执行路径
4. 形成最小可交付样例
5. 让上层宿主可以把它当黑盒调用

不应该优先做的事：

1. 把所有叙事都一起做
2. 先做大而全 UI
3. 先把 Shadow 的知识底座搬进来
4. 先扩张成 Agent 平台生态

---

## 8. 后续推进建议

### Phase 1：Runtime Contract Campaign

目标：

- 把 AgentGraph 收敛成独立可调用的编排 runtime

重点：

- canonical workflow schema
- unified run / step / trace / checkpoint contract
- CLI 与 FastAPI 同构入口
- 2-3 个稳定样例

### Phase 2：Adapter Ready

目标：

- 让上层宿主容易接入

重点：

- adapter guide
- Shadow-ready contract
- 更稳定的 artifact / checkpoint / streaming 结构

### Phase 3：Projection & Tooling

目标：

- 提升可用性，而不是改变产品本质

重点：

- 可视化编辑器与 runtime 对齐
- planner、memory adapter、tool adapter 收敛
- 示例与文档增强

---

## 9. 最终要达到的产品状态

一个成熟的 AgentGraph，应该给人这样的感觉：

- 它不是一个大而乱的概念集合
- 它是一个边界清楚的多智能体图编排引擎
- 它可以被 Python 调用
- 可以被 CLI 调用
- 可以被 HTTP 调用
- 可以被 Shadow 这类宿主系统稳定接入

真正成立之后，别人提到 AgentGraph，应该想到的是：

**“这是一个可独立运行、可集成、可编排多智能体任务图的 runtime 产品。”**

而不是：

**“这是一个什么都想做一点的 AI 大杂烩项目。”**

---

## 10. 一句话总结

AgentGraph 不是先做成工作台，而是先做成引擎。

它的第一性目标不是“包办一切”，而是：

**把多智能体任务编排这件事，收敛成一个独立、稳定、可接入的 runtime 产品。**
