# AgentGraph Integration Note

> Legacy Integration Note
>
> 本页只保留历史背景与集成决策脉络，不再作为当前主线的集成权威文档。
> 如果你要按现在的 Phase 1 主线做开发，请优先阅读下面这些文档：
>
> - [CORE_CHARTER](./CORE_CHARTER.md)
> - [RUNTIME_CONTRACT_SPEC](./RUNTIME_CONTRACT_SPEC.md)
> - [WORKFLOW_SCHEMA](./WORKFLOW_SCHEMA.md)
> - [ADAPTER_BOUNDARY](./ADAPTER_BOUNDARY.md)
> - [HTTP API README](./api/http/README.md)

## 这页是什么

这是一份历史集成说明，记录 AgentGraph 早期如何被看待、如何被拆分、以及为什么后来主线收敛到了 runtime contract / schema / adapter boundary 上。

它的作用是帮助读者理解“为什么会有这些文档”，而不是告诉读者“现在应该照着哪份旧集成方案实现”。

## 当前结论

AgentGraph 现在应被理解为一个独立的 runtime / schema / adapter 项目，而不是一份围绕旧集成叙事展开的大而全方案。

当前主线已经明确收敛到：

- 核心定位与治理原则，见 [CORE_CHARTER](./CORE_CHARTER.md)
- 统一运行时契约，见 [RUNTIME_CONTRACT_SPEC](./RUNTIME_CONTRACT_SPEC.md)
- canonical workflow schema，见 [WORKFLOW_SCHEMA](./WORKFLOW_SCHEMA.md)
- 外部宿主如何把 AgentGraph 当黑盒调用，见 [ADAPTER_BOUNDARY](./ADAPTER_BOUNDARY.md)
- HTTP 入口与当前已支持端点，见 [HTTP API README](./api/http/README.md)

## 历史背景保留

早期这份文档试图同时说明以下内容：

- AgentGraph 与 Shadow 的集成关系
- 独立项目 + API / CLI 调用的方向
- HTTP API、subprocess、目录结构、部署方式
- 阶段划分、监控、日志、示例代码和实现草案

这些内容对理解项目演化过程仍有参考价值，但其中大量细节已经属于旧叙事或旧实现，不再适合作为主线参考。

## 已折叠的旧内容

为了避免误导当前主线，本页不再保留下列可直接照抄的实现段落：

- 旧的 Rust / Python 代码样例
- 旧的 API 请求与响应实现草稿
- 旧的目录树与项目结构建议
- 旧的部署脚本与 docker-compose 示例
- 旧的监控、日志、metrics 实现草案
- 旧的阶段计划和集成步骤分解

如果需要这些信息，只能把它们当作历史材料阅读，而不能当作当前 contract 或 current implementation 的依据。

## 读法建议

1. 先看 [CORE_CHARTER](./CORE_CHARTER.md)，确认 AgentGraph 现在是什么、边界是什么。
2. 再看 [RUNTIME_CONTRACT_SPEC](./RUNTIME_CONTRACT_SPEC.md)，确认 runtime 请求与结果长什么样。
3. 再看 [WORKFLOW_SCHEMA](./WORKFLOW_SCHEMA.md)，确认 workflow 的 canonical 结构。
4. 再看 [ADAPTER_BOUNDARY](./ADAPTER_BOUNDARY.md)，确认宿主如何接入。
5. 最后看 [HTTP API README](./api/http/README.md)，确认当前 HTTP 入口。

## 结论

这份文档的职责已经从“集成方案主文档”退回为“历史集成注记”。

以后凡是涉及当前主线实现、对外契约、schema 或 HTTP 入口的内容，都应优先写入上面列出的权威文档，而不是继续扩写这里的旧集成叙事。
