# AgentGraph

A lightweight multi-agent orchestration runtime for contract-first workflows.

[![PyPI](https://img.shields.io/pypi/v/agentgraph)](https://pypi.org/project/agentgraph/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-latest-brightgreen.svg)](docs/)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)

## What AgentGraph Is

AgentGraph 当前阶段的正式定位是：

- 一个独立的 runtime / schema / adapter 项目
- 一个可被 CLI 与 HTTP API 调用的多智能体编排运行时
- 一个对外输出结构化 `run / step / trace / artifact / checkpoint` 结果的黑盒引擎

详细边界见：

- [Core Charter](docs/CORE_CHARTER.md)
- [Runtime Contract Spec](docs/RUNTIME_CONTRACT_SPEC.md)
- [Workflow Schema](docs/WORKFLOW_SCHEMA.md)

## Features

- Contract-first workflow schema
- Unified CLI and HTTP runtime entrypoints
- Structured `run -> steps -> final_output -> trace -> artifacts -> checkpoints`
- Canonical YAML / JSON workflow definition
- Basic parallel fan-out + barrier join
- Reference writeback adapter stubs for `docs / memory / graph`
- Minimal checkpoint store contract with in-memory reference implementation
- Phase 1 examples aligned with runtime contract

## Installation

### From Source

```bash
git clone https://github.com/your-org/agentgraph.git
cd agentgraph
pip install -e .[dev]
```

## Quick Start

### 1. Create a Workflow

```yaml
workflow_id: "docs-gap-review"
version: "0.1"
name: "Docs Gap Review"
entrypoint: "planner"
nodes:
  - id: "planner"
    kind: "agent"
    type: "planning.analyze"
    config:
      role: "planner"
      prompt: "Analyze documentation gaps."
      message_template: "[planner] analyzed documentation gaps."
      emit:
        gap_count: 2
  - id: "reviewer"
    kind: "agent"
    type: "review.summarize"
    config:
      role: "reviewer"
      prompt: "Summarize the review notes."
      message_template: "[reviewer] produced review notes."
edges:
  - from: "planner"
    to: "reviewer"
    type: "conditional"
    condition: "result.gap_count > 0"
  - from: "reviewer"
    to: "END"
    type: "final"
defaults: {}
metadata: {}
```

### 2. Validate

```bash
agentgraph validate -w workflow.yaml
```

### 3. Run

```bash
agentgraph run -w workflow.yaml -i "{\"goal\":\"Analyze docs gaps\"}"
```

### 4. Serve HTTP API

```bash
agentgraph serve --port 8000
```

核心端点：

- `POST /workflow/validate`
- `POST /workflow/run`
- `GET /runs/{id}`

## Official Phase 1 Examples

- [docs-gap-review](examples/runtime-contract/docs-gap-review.yaml)
- [parallel-synthesis](examples/runtime-contract/parallel-synthesis.yaml)
- [research-review-loop](examples/runtime-contract/research-review-loop.yaml)

运行示例：

```bash
agentgraph validate -w examples/runtime-contract/docs-gap-review.yaml
agentgraph run -w examples/runtime-contract/docs-gap-review.yaml -i "{\"goal\":\"Analyze docs gaps\"}"
```

## Phase 1 Focus

当前主线聚焦于：

- runtime contract
- canonical workflow schema
- unified CLI / HTTP entrypoints
- step / artifact / checkpoint result model
- writeback adapter reference implementation
- checkpoint store minimal contract
- basic parallel / barrier control flow
- 至少两个可重复执行的端到端样例

## Current Non-Goals

当前阶段明确不做：

- Shadow 全量集成
- 统一知识图谱 substrate
- 固定形态工作台
- 并行扩张 planner / memory / UI / runtime 成巨型平台

## Roadmap

### Phase 1

- [x] Unified runtime contract skeleton
- [x] CLI / HTTP shared entrypoint
- [x] Contract-aligned workflow schema document
- [x] Parallel fan-out + barrier baseline
- [x] Three contract-aligned official examples
- [ ] Example migration cleanup
- [ ] Checkpoint recovery refinement
- [ ] Legacy interface/test baseline cleanup
