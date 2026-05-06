# AI 代码助手示例

> Legacy / Concept Note
>
> 这是一份历史性的概念示例，不是当前 AgentGraph 的主线集成入口。当前请优先查看 [Runtime Contract Spec](../../docs/RUNTIME_CONTRACT_SPEC.md) 和 [Official Phase 1 Examples](../../README.md#official-phase-1-examples)。

## 这份示例保留了什么

这个目录保留的是“河流式记忆”概念演示，主要想说明：

- 节点之间如何传递上下文
- 成功模式如何沉淀为可复用知识
- 检查点如何支持恢复

它适合用来理解早期思路，但不应被当作当前主线实现说明。

## 对应的主线入口

如果你要看当前可执行的 contract-first 示例，请直接看：

- `../../docs/RUNTIME_CONTRACT_SPEC.md`
- `../runtime-contract/docs-gap-review.yaml`
- `../runtime-contract/parallel-synthesis.yaml`
- `../runtime-contract/research-review-loop.yaml`

## 历史备注

如果你只是想保留这份概念页的阅读路径，可以把它理解成“记忆流转”的设计草图，而不是一个完整的产品级工作流说明。
