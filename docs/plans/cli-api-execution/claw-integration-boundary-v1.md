# AgentGraph 与 Claw 集成边界 v1

> 日期：2026-03-30
> 状态：Draft v1
> 目的：明确 `OpenClaw / ShadowClaw` 在 AgentGraph 中的定位，以及为什么当前阶段先不实现、先回到工作流主线

---

## 1. 一句话结论

`OpenClaw / ShadowClaw` 后续应该支持被 AgentGraph 调度。

但当前阶段：

- 先**不急着实现 Claw 接入**
- 先**不为了 Claw 重构整套执行接口**
- 先把主线收回到 **WorkflowTemplate / policy matrix / stage / validation**

也就是说：

**Claw 集成是明确方向，但不是当前最优先施工项。**

---

## 2. 这次讨论里已经明确的判断

### 2.1 AgentGraph 需要能调 OpenClaw / ShadowClaw

用户的真实诉求不是：

- “重新定义一个非常复杂的 Claw 理论层”

而是：

- **AgentGraph 以后应该能直接调用 OpenClaw**
- **将来也应该能调用 ShadowClaw**

这点本质上和今天已经做通的：

- `claude`
- `codex`
- `openai`
- `anthropic`

属于同一类问题：

**编排层如何调度一个外部执行目标。**

### 2.2 Claw 不等于 CLI

这里必须分清两件事：

- `Claw`
  是被调动的对象
- `CLI`
  是一种调用方式

所以不应该把它们写成：

- `Claw = CLI`

更合理的理解是：

- `OpenClaw` 现在如果最成熟的入口是命令行，那第一阶段可以走 `CLI`
- `ShadowClaw` 以后如果更适合嵌入式调用或内部 RPC，也完全可以不走 `CLI`

因此结论是：

**CLI 只是 Claw 的一种可能接入方式，不是 Claw 的定义本体。**

### 2.3 OpenAI 不需要为了“统一”而强行走 CLI

OpenAI 这类 provider 仍然更自然地走：

- `API`

原因很简单：

- 接口稳定
- 结构化更自然
- 鉴权、限流、重试更容易

所以未来更自然的形态不是：

- “所有东西都统一走 CLI”

而是：

- `OpenAI -> API`
- `Claude/Codex/OpenClaw -> 可按各自成熟入口接入`
- `ShadowClaw -> 以后按最自然入口接入`

---

## 3. 为什么现在不急着做 Claw 集成

当前 AgentGraph 主线更缺的不是：

- 再多一个 provider

而是：

1. `WorkflowTemplate` 的治理规则
2. `policy matrix`
3. `stage / lane`
4. compile-time validation
5. 模板装配与团队复用能力

换句话说：

**现在真正限制 AG 主线继续往前走的，不是“还不能调 OpenClaw”，而是“工作流高层还不够稳”。**

所以当前优先级应该是：

1. 先把工作流模板层做稳
2. 再把 Claw 接入接进来

这会比现在就围绕 Claw 做接口大改更值。

---

## 4. 现阶段建议的最小技术态度

虽然现在不实现，但方向上先固定下面这几点：

### 4.1 AgentGraph 将来要支持 Claw provider

例如未来可能会有：

- `provider = openclaw`
- `provider = shadowclaw`

但这只是“未来兼容目标”，不是本阶段必须完工项。

### 4.2 不要把接口过早写死成“只有 CLI / API 两类世界”

短期实现里可以继续用：

```yaml
executor:
  kind: "cli"
  provider: "openclaw"
```

但设计上要记住：

这只是第一阶段的落地办法，不一定是长期最终形态。

### 4.3 先把 Claw 的讨论收敛在文档层

本阶段最合适的做法是：

- 把边界、判断、未来方向先记下来
- 不在当前迭代里继续深挖实现

这样不会打断当前工作流主线。

---

## 5. 当前建议的主线优先级

当前优先级应保持为：

1. `WorkflowTemplate policy matrix`
2. `WorkflowTemplate stage / lane`
3. compile-time validation
4. pattern library
5. scaffold / wizard

Claw 相关优先级暂时放到这些之后。

---

## 6. 一句话版结论

`OpenClaw / ShadowClaw` 后续应该成为 AgentGraph 可调度的执行目标。

但当前阶段：

- **先不急着实现**
- **先不把接口为 Claw 大改**
- **先专注工作流**

等工作流主线成熟后，再回头把 Claw 以最自然的方式接进来。
