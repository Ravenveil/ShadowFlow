# Step B：v2 ConnectionResolver 拓扑推断设计

> 日期：2026-04-02
> 状态：✅ 已实现
> 前置：Phase 1（ActivationSelector + ConnectionResolver v1）✅

---

## 要解决的核心问题

从"固定线性链"升级到"根据 block 的输入输出能力自动推断连接拓扑"。

```
v1（现在）：plan → execute → END    ← 永远是线性链，不管 block 是什么

v2（目标）：
    plan ──→ execute ──→ END                  ← 简单情况还是线性

    plan ─┬→ execute ──┐
          └→ review ───┴→ barrier → END       ← 能推断出 fan-out/fan-in
```

---

## 任务 1：WorkflowBlockSpec 加 `input_requirements: List[str]`

跟 `capabilities`（输出能力）对称，声明 block 需要什么输入能力才能运行：

```python
# plan: 不需要前置输入，能产出 planning
plan:     capabilities=["planning", "task_decomposition"]
          input_requirements=[]                              # 起点

# execute: 需要 planning 才能跑
execute:  capabilities=["execution", "action"]
          input_requirements=["planning"]                    # 依赖 plan

# review: 需要 execution 结果才能审查
review:   capabilities=["review", "quality_check"]
          input_requirements=["execution"]                   # 依赖 execute

# barrier: 需要多个分支结果
barrier:  capabilities=["synchronization", "fan_in"]
          input_requirements=["execution", "review"]         # 汇聚多个
```

实现位置：`shadowflow/highlevel.py` → `WorkflowBlockSpec` 类，在 `capabilities` 字段后面加。

---

## 任务 2：更新 8 个内置 block 的 `input_requirements`

| block | capabilities（输出） | input_requirements（输入） | 说明 |
|-------|---------------------|--------------------------|------|
| plan | planning, task_decomposition | （空，可做起点） | 规划不需要前置 |
| review | review, quality_check | execution 或 planning | 审查需要有东西可审 |
| execute | execution, action | planning | 执行需要有计划 |
| parallel | parallelism, fan_out | （任何输入） | 分发节点 |
| barrier | synchronization, fan_in | parallelism | 汇聚需要先有分发 |
| delegate | delegation, sub_workflow | planning | 委托需要有任务定义 |
| artifact | artifact_emit, persistence | execution | 输出产物需要有执行结果 |
| checkpoint | checkpoint_write, state_persistence | execution | 保存状态需要有执行状态 |

实现位置：`shadowflow/highlevel.py` → `build_builtin_block_catalog()`

---

## 任务 3：ConnectionResolver v2 核心算法

```
输入：candidates（被选中的 block 列表） + catalog（完整 block 定义）
输出：edges（DAG 连接关系，List[WorkflowAssemblyLinkSpec]）

算法：
1. 对每个 candidate block，查其 input_requirements
2. 对每个 input_requirement，找 candidates 里哪个 block 的 capabilities 能满足
3. 满足 → 加边 provider → consumer
4. 没有 input_requirements 的 block → 入口点（不需要上游边）
5. 没有下游消费者的 block → 连到 END
6. 检测环（不应该有），验证连通性
```

### 推断示例 1：线性（plan + execute + review）

```
plan.capabilities = [planning]          plan.input_requirements = []
execute.capabilities = [execution]      execute.input_requirements = [planning]
review.capabilities = [review]          review.input_requirements = [execution]

推断结果：
  plan → execute  （execute 需要 planning，plan 提供 planning）
  execute → review（review 需要 execution，execute 提供 execution）
  review → END    （review 没有下游消费者）
```

### 推断示例 2：fan-out + fan-in（plan + execute + review + barrier）

```
plan.capabilities = [planning]              plan.input_requirements = []
execute.capabilities = [execution]          execute.input_requirements = [planning]
review.capabilities = [review]              review.input_requirements = [planning]
barrier.capabilities = [synchronization]    barrier.input_requirements = [execution, review]

推断结果：
  plan → execute    （execute 需要 planning）
  plan → review     （review 也需要 planning）   ← fan-out
  execute → barrier （barrier 需要 execution）
  review → barrier  （barrier 需要 review）      ← fan-in
  barrier → END
```

### 推断示例 3：含 artifact 的链

```
plan → execute → artifact → END

推断：
  execute 需要 planning → plan 提供 → plan→execute
  artifact 需要 execution → execute 提供 → execute→artifact
  artifact 没有下游 → artifact→END
```

实现位置：`shadowflow/assembly/activation.py` → `ConnectionResolver` 类

接口设计：
```python
class ConnectionResolver:
    def resolve(
        self,
        candidates: List[CatalogActivationCandidate],
        catalog: Dict[str, WorkflowBlockSpec] | None = None,  # v2 新增参数
        strategy: Literal["linear", "capability"] = "linear", # v2 新增参数
    ) -> List[WorkflowAssemblyLinkSpec]:
        if strategy == "linear" or catalog is None:
            return self._resolve_linear(candidates)       # v1 行为
        return self._resolve_capability(candidates, catalog)  # v2 新行为
```

向后兼容：不传 catalog 或 strategy="linear" 时行为跟 v1 一样。

---

## 任务 4：fan-out / fan-in 处理规则

- **fan-out**：一个 block 的 capabilities 被多个下游 block 的 input_requirements 引用
  - 结果：一对多边（provider → consumer1, provider → consumer2）
  - 不需要显式 parallel node（v2 用隐式 fan-out）

- **fan-in**：一个 block 的 input_requirements 需要多个上游 block 的 capabilities
  - 结果：多对一边（provider1 → consumer, provider2 → consumer）
  - barrier block 天然做 fan-in（input_requirements 列多个 capability）

- **parallel block 的角色**：
  - v2 中 parallel 是可选的显式 fan-out 标记
  - 没有 parallel 时，fan-out 是隐式的（一个 block 同时连多个下游）
  - 有 parallel 时，parallel 做显式分发控制

---

## 任务 5：边界情况处理

### 歧义：两个 block 都能满足同一个 input_requirement

```
场景：execute 需要 [planning]
      plan 提供 [planning, task_decomposition]
      delegate 也提供 [delegation, sub_workflow]  ← 不提供 planning，不冲突

真正的冲突场景：
      blockA 提供 [planning]
      blockB 也提供 [planning]
      execute 需要 [planning]
```

解决方案：都连上（多对一 fan-in）。如果只想要一个，由 ActivationSelector 在选择阶段控制（贪心覆盖已经倾向于选更少的 block）。

### 孤立 block：被选中但跟其他 block 没有依赖关系

```
场景：选了 plan + checkpoint，但 checkpoint 的 input_requirements 里没有 planning
```

解决方案：
- 如果 block 的 input_requirements 完全无法被其他候选满足 → warning，仍然加入但标记为 `isolated`
- 孤立 block 直接连到 END（独立执行路径）

### 环检测

```
理论上 input_requirements 不应该产生环（A 需要 B 的输出，B 也需要 A 的输出）
但需要检测并拒绝，复用 WorkflowAssemblySpec 已有的 DFS 环检测逻辑
```

---

## 工作量估算

| 任务 | 行数 | 复杂度 |
|------|------|--------|
| WorkflowBlockSpec 加 `input_requirements` 字段 | ~5 | 低 |
| 更新 8 个 builtin block 的 input_requirements | ~30 | 低 |
| ConnectionResolver v2 capability 推断算法 | ~80 | 中 |
| fan-out / fan-in 测试用例 | ~120 | 中 |
| 边界情况处理（歧义、孤立、环） | ~40 | 中 |
| **合计** | **~275** | **中** |

---

## 测试计划

1. `WorkflowBlockSpec.input_requirements` 字段存在且默认 `[]`
2. 8 个 builtin block 都有 `input_requirements`
3. v2 线性推断：plan + execute → plan→execute→END
4. v2 线性推断：plan + execute + review → plan→execute→review→END
5. v2 fan-out：plan + execute + review（review 也接受 planning） → plan→execute, plan→review, execute→END, review→END
6. v2 fan-in：plan + execute + review + barrier → plan→execute, plan→review, execute→barrier, review→barrier, barrier→END
7. v2 含 artifact：plan + execute + artifact → plan→execute→artifact→END
8. 孤立 block 处理：被选中但无依赖 → 独立连到 END
9. 环检测：构造人工环 → 报错
10. 向后兼容：strategy="linear" 行为不变
11. catalog=None 时 fallback 到 v1 线性链
12. CLI `assemble --goal --compile` 默认仍用 v1（不破坏现有行为）

---

## 与其他模块的关系

```
ActivationSelector（选哪些 block）
        ↓
ConnectionResolver v2（怎么连）  ← 本任务
        ↓
WorkflowAssemblySpec（装配清单）
        ↓
AssemblyCompiler（编译成 WorkflowDefinition）  ← 已有，不需要改
        ↓
RuntimeService（执行）  ← 已有，不需要改
```

ConnectionResolver v2 是纯上游改动，下游的 AssemblyCompiler 和 RuntimeService 不受影响——它们只看 `WorkflowAssemblySpec` 的 blocks + links，不关心 links 是怎么生成的。

---

## 与 Phase 3 (RL) 的关系

v2 拓扑推断给 RL 提供了更大的动作空间：
- v1：RL 只能学"选哪些 block"（拓扑固定为线性）
- v2：RL 可以学"选哪些 block" + "怎么设置 input_requirements 的优先级"
- v3（远期）：RL 直接学拓扑结构（Policy Gradient on DAG generation）

`ActivationBandit`（Phase 3 Step 1）不需要修改——它只管选 block，连接由 ConnectionResolver 处理。但 Phase 3 Step 2（Policy Gradient）需要 v2 拓扑才有意义。
