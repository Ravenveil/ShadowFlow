# AgentGraph Tests

当前 `tests/` 目录同时包含两类测试：

- Phase 1 contract baseline
  - `test_runtime_contract.py`
  - `test_runtime_examples.py`
- legacy baseline
  - `legacy/` 目录下的历史测试文件

## 默认执行规则

默认 `pytest -q` 只运行 Phase 1 contract baseline。

原因不是历史测试没有价值，而是它们主要覆盖以下 legacy surface：

- `AgentGraph` 图对象
- `SQLiteMemory` / `RedisMemory` 直接集成
- `SwarmRouter` / 旧 topology
- 旧工作流执行模型

这些内容当前不构成 Phase 1 runtime contract 的权威验收口径。

## 如何运行 legacy tests

```bash
pytest -q --run-legacy
```

当前 legacy tests 目录为：

```text
tests/legacy/
```

这样做的目的，是让“当前 contract baseline”和“历史 API / 实现回归”在目录结构上也显式分层，而不是继续依赖文件名单维护。

## 为什么要分层

当前 AgentGraph 主线目标是：

- 固定 workflow schema
- 固定 runtime request / run result / checkpoint contract
- 固定 CLI / HTTP API 同构执行路径

因此默认测试入口必须优先反映：

- 当前主线支持什么
- 当前主线还不支持什么

而不是让历史接口与旧实现细节持续污染默认基线。
