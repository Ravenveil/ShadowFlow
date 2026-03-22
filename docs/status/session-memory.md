# AgentGraph Session Memory

## 2026-03-22

- 主线定位：严格以 `D:\VScode\TotalProject\AgentGraph` 为唯一事实源，围绕 `Runtime Contract Campaign` 推进。
- 上一轮延续：承接了 `CORE_CHARTER`、`RUNTIME_CONTRACT_SPEC`、`WHAT_IS_AGENTGRAPH`、`agentgraph-phase1-campaign-draft` 中已经冻结的产品与契约方向。
- 上一轮完成：核心 charter 与 runtime contract 文档已经形成，但未落到共享代码路径，也没有 `docs/status` 状态闭环。
- 上一轮放弃：没有继续扩张 Shadow、memory、planner、UI 叙事，也没有补旧 `SwarmRouter`/全量 memory 历史实现，因为与 Phase 1 黑盒编排 runtime 主线不一致。
- 本轮主战役：建立独立 runtime contract 模型与共享 `RuntimeService`，并让 CLI/FastAPI 走同一条 validate/run/get_run 路径。
- 本轮关键结论：
  - AgentGraph 第一次具备与核心 docs 对齐的 `WorkflowDefinition / RuntimeRequest / RunResult / StepRecord / ArtifactRef / CheckpointRef` 代码契约。
  - `agentgraph validate`、`agentgraph run`、`POST /workflow/validate`、`POST /workflow/run`、`GET /runs/{id}` 已收敛到统一 runtime service。
  - 旧测试基线依旧严重失配，尤其是可选依赖暴露、历史接口漂移、`SwarmRouter` 缺失；该部分暂不作为本轮主线收口目标。
- 下一轮最自然接力：
  - 把 canonical workflow schema 文档补成代码对应版
  - 让示例 workflow 真正迁移到新 contract
  - 再处理旧包导出、依赖隔离、历史测试基线瘦身

## 2026-03-22 / Round 2

- 延续上一轮什么：
  - 延续 runtime contract 骨架、统一 CLI/FastAPI 入口、最小状态闭环。
- 完成上一轮哪部分：
  - 补齐了 canonical workflow schema 文档
  - 新建两份 contract-aligned 官方样例
  - 更新 README、examples README、getting-started 教程到新 contract
  - 增加样例验证测试并完成 CLI 真实执行
- 放弃上一轮哪部分：
  - 仍未处理旧 legacy 示例的全面迁移
  - 仍未清理旧全量测试基线
- 为什么：
  - 本轮唯一主战役是“官方 schema 与正式样例收敛”，先拿下独立成立标准中的权威样例，比清旧噪音更关键。
- 本轮关键结论：
  - AgentGraph 现在已经具备两份可重复执行的官方端到端样例：
    - `examples/runtime-contract/docs-gap-review.yaml`
    - `examples/runtime-contract/research-review-loop.yaml`
  - `docs/WORKFLOW_SCHEMA.md` 已成为 runtime contract 的 schema 落地文档。
  - 多步执行中原始输入未被稳定保留的问题已修复，后续节点现在可以继续读取根输入字段。
- 下一轮最自然接力：
  - 收敛 legacy 示例和 legacy 文档，把非 canonical 旧格式显式标注或迁移
  - 进一步收敛旧导出、旧测试和 optional dependency 边界
  - 再推进 checkpoint 恢复与 adapter boundary 细化

## 2026-03-22 / Round 3

- 延续上一轮什么：
  - 延续 canonical schema、官方样例、统一入口已经成形的主线成果。
- 完成上一轮哪部分：
  - 把“legacy 收敛”真正推进到权威入口与高风险 legacy 表层：
    - 新增 `docs/LEGACY_SURFACE_MAP.md`
    - 重写 `docs/api/http/README.md` 到当前 contract
    - 更新 `docs/README.md`，把 `WORKFLOW_SCHEMA` 和 legacy 边界拉进权威入口
    - 给高风险 legacy 教程和多份 legacy YAML 显式加标记
- 放弃上一轮哪部分：
  - 没有大规模迁移所有 legacy 文档
  - 没有处理旧全量测试基线
- 为什么：
  - 这轮唯一主战役是先把“什么是权威入口、什么是 legacy”说清，否则后续实现仍会被旧文档反复带偏。
- 本轮关键结论：
  - AgentGraph 当前已经有显式的 legacy surface map，可以区分 canonical contract 与历史探索内容。
  - HTTP API 权威文档已不再宣称认证、workflow CRUD、streaming 等当前未实现能力。
  - 高风险 legacy workflow 示例已显式标记，降低被误认为官方主线示例的风险。
- 下一轮最自然接力：
  - 继续处理 legacy 测试基线与旧导出边界
  - 将高价值 legacy 示例逐步迁移到 canonical contract
  - 再推进 checkpoint 恢复和 adapter boundary

## 2026-03-22 / Round 4

- 延续上一轮什么：
  - 延续 legacy 边界显式化、权威入口与历史入口分离的主线。
- 完成上一轮哪部分：
  - 把 legacy 测试基线和导入边界推进到可运行主线基线：
    - `tests/conftest.py` 现在默认只收集 Phase 1 contract 基线测试
    - `pytest -q` 默认回到 `test_runtime_contract.py + test_runtime_examples.py`
    - `agentgraph.memory` 包级入口继续做 optional import 隔离
    - 高风险 Python API 文档入口已改成 legacy notice / 主线指引
- 放弃上一轮哪部分：
  - 没有继续修所有 legacy 测试本身
  - 没有把旧 graph API 完整重构为当前 contract
- 为什么：
  - 这轮唯一主战役是“先把主线基线稳定跑通”，而不是在一轮里吞掉所有历史兼容负担。
- 本轮关键结论：
  - 默认 `pytest -q` 现在直接回到 Phase 1 contract baseline，并通过。
  - 当前主线测试与 legacy 测试已经形成显式分层：如需跑旧测试，必须显式使用 `--run-legacy`。
  - 这显著降低了后续每轮推进被历史测试噪音打断的固定成本。
- 团队化执行结论：
  - 已通过并行子代理同时盘点测试基线、导出边界和 legacy 入口面。
  - 压缩 3-4 周到约 1 周的关键，不是“单次运行更久”，而是持续并行拆解并清掉高杠杆阻塞面。
- 下一轮最自然接力：
  - legacy 测试逐组迁移或显式归档
  - 旧顶层导出继续收薄
  - checkpoint 恢复模型与 adapter boundary 开始进入实现层

## 2026-03-22 / Round 5

- 延续上一轮什么：
  - 延续 checkpoint 恢复模型、adapter boundary、contract-only 测试基线已经完成并通过验证的主线成果。
- 完成上一轮哪部分：
  - 把 AgentGraph 从“上层仓库中的一个目录”推进为“独立 Git 仓库 + 自己的主线分支”：
    - 在 `D:\VScode\TotalProject\AgentGraph` 初始化独立仓库
    - 新增 `.gitignore`，排除缓存、构建产物、依赖目录和 Windows 特殊文件 `nul.okm`
    - 将默认分支切换为 `main`
    - 重新验证 `pytest -q`
    - 重新验证 CLI `validate`
    - 重新验证 HTTP `run -> checkpoint -> resume` 闭环
- 放弃上一轮哪部分：
  - 没有继续扩展新的 runtime 能力
  - 没有处理 remaining legacy 示例与 legacy 测试迁移
- 为什么：
  - 当前用户目标是把已经验证通过的主线成果真正落到 AgentGraph 自己的主线仓库；先完成仓库边界和提交动作，比继续扩展实现更关键。
- 本轮关键结论：
  - `D:\VScode\TotalProject\AgentGraph` 现在已经是独立 Git 仓库，不再依赖上层 `D:\VScode\TotalProject`。
  - 主线分支已统一为 `main`。
  - 提交前验证口径已经重新确认：
    - `pytest -q` -> `5 passed`
    - `python -m agentgraph.cli validate -w examples\runtime-contract\research-review-loop.yaml` -> `valid=true`
    - FastAPI `run -> checkpoint -> resume` smoke -> `resume-smoke-ok`
- 下一轮最自然接力：
  - 在新的独立仓库主线上继续推进 legacy 迁移与 adapter boundary 收口
  - 如需对外协作，可继续补远程仓库与 release 基线
