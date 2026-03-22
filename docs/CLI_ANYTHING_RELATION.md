# CLI-Anything 与 AgentGraph / Shadow 的关系

> Legacy / Concept Note
>
> 这是一份历史性的概念说明，不是当前主线入口。现在的主线请优先看 [Runtime Contract Spec](./RUNTIME_CONTRACT_SPEC.md) 和仓库根目录 README 里的 [Official Phase 1 Examples](../README.md#official-phase-1-examples)。

> 日期：2026-03-22
> 状态：Legacy notes
> 来源参考：`D:\Shadow\shadow\优秀微信公众号文章集锦\CLI-Anything.md`

---

## 这份笔记想表达什么

CLI-Anything 的重点一直不是“再做一个 CLI 壳”，而是把现有软件能力更稳定地暴露给 Agent 使用。它更像工具暴露层，而不是 AgentGraph 这样的运行时。

因此，这份笔记适合保留为概念背景，用来解释三者的分层关系：

- CLI-Anything：工具暴露层
- AgentGraph：runtime / schema / adapter 层
- Shadow：宿主与长期闭环层

---

## 现在应该怎么读它

如果你是在找当前主线实现，请直接跳到：

- [docs/RUNTIME_CONTRACT_SPEC.md](./RUNTIME_CONTRACT_SPEC.md)
- [examples/runtime-contract/docs-gap-review.yaml](../examples/runtime-contract/docs-gap-review.yaml)
- [examples/runtime-contract/parallel-synthesis.yaml](../examples/runtime-contract/parallel-synthesis.yaml)
- [examples/runtime-contract/research-review-loop.yaml](../examples/runtime-contract/research-review-loop.yaml)

如果你只是想理解这条历史线索，可以把它理解为：先有“工具如何暴露”，再有“工作流如何编排”，最后才是“宿主如何承接长期状态”。
