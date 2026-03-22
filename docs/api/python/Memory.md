# Python API: Memory (Legacy)

> Legacy API Notice
>
> 本页描述的是 AgentGraph 早期 memory backend 设计草稿。
> 当前 Phase 1 主线**不**以 `SQLiteMemory` / `RedisMemory` 作为权威 public contract。
>
> 当前主线请优先参考：
>
> - [Runtime Contract Spec](../../RUNTIME_CONTRACT_SPEC.md)
> - [Adapter Boundary](../../ADAPTER_BOUNDARY.md)

## 当前阶段的正确理解

当前 Phase 1 runtime 只承诺：

- `RuntimeRequest.memory_scope`
- `RunResult.checkpoints`
- 宿主通过 contract 消费运行结果

当前阶段**未承诺**：

- 某个固定数据库后端
- 某个固定 memory backend API
- 某个固定持久化布局

## 为什么这页是 legacy

历史 memory 文档会把以下内容说成主要 public surface：

- `SQLiteMemory`
- `RedisMemory`
- `scope`
- `save_state/load_state`
- 导出、导入、批处理等 backend 细节

这些内容更像历史实现面，而不是当前 canonical runtime contract。

## 当前结论

- memory backend 仍可作为历史实现或未来扩展方向保留
- 但对外集成不应依赖本页中的 memory API 草稿
- 如果宿主需要集成，应先围绕 runtime request / run result / checkpoint 设计调用边界
