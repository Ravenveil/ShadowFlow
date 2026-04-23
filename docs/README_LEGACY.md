# ShadowFlow — Legacy README (归档)

> 本文件是 2026-04-21 Story 0.4 重写 README 前的旧版内容归档，保留供历史参考。

---

# ShadowFlow

A lightweight multi-agent orchestration runtime for contract-first workflows.

[![CI](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/Ravenveil/ShadowFlow/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-latest-brightgreen.svg)](docs/)
[![Python](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/)

## What ShadowFlow Is

ShadowFlow 当前阶段的正式定位是：

- 一个独立的 runtime / schema / adapter 项目
- 一个可被 CLI 与 HTTP API 调用的多智能体编排运行时
- 一个对外输出结构化 `run / step / trace / artifact / checkpoint` 结果的黑盒引擎

详细边界见：

- [Core Charter](docs/CORE_CHARTER.md)
- [Runtime Contract Spec](docs/RUNTIME_CONTRACT_SPEC.md)
- [Workflow Schema](docs/WORKFLOW_SCHEMA.md)
- [CLI 安装与使用](docs/CLI_INSTALL_AND_USAGE.md)

## Features

- Contract-first workflow schema
- Unified CLI and HTTP runtime entrypoints
- Structured `run -> steps -> final_output -> trace -> artifacts -> checkpoints`
- Canonical YAML / JSON workflow definition
- Basic parallel fan-out + barrier join
- Unified executor layer for `CLI` and `API`
- Built-in provider adapters for `Codex CLI`, `Claude CLI`, `OpenAI Responses API`, and `Anthropic Messages API`
- Markdown writeback backend for `runs / artifacts / checkpoints`
- Reference writeback adapter stubs for `docs / memory / graph`
- Minimal checkpoint store contract with in-memory reference implementation
- Phase 1 examples aligned with runtime contract
- High-level `Tool / Skill / Role / Agent / WorkflowTemplate` schema with template compiler

## Installation

当前阶段推荐使用源码安装。
`agentgraph` 这个 PyPI 名称已被其他项目占用，因此本项目暂未以该名字公开发布到 PyPI。

### From Source

```bash
git clone https://github.com/your-org/agentgraph.git
cd agentgraph
pip install -e .[dev]
```

安装完成后可验证：

```bash
agentgraph --help
python -m shadowflow.cli --help
```

更完整的前置条件、CLI provider、API key、writeback 说明见：

- [CLI 安装与使用](docs/CLI_INSTALL_AND_USAGE.md)

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

### 4. Export Workflow Graph

```bash
agentgraph graph -w workflow.yaml
```

### 5. Compile a High-Level Template

```bash
agentgraph compile --template docs-review-template --registry-root examples/highlevel/minimal-registry --var goal="Audit docs"
```

### 6. Serve HTTP API

```bash
agentgraph serve --port 8000
```

## Official Phase 1 Examples

- [docs-gap-review](examples/runtime-contract/docs-gap-review.yaml)
- [parallel-synthesis](examples/runtime-contract/parallel-synthesis.yaml)
- [research-review-loop](examples/runtime-contract/research-review-loop.yaml)

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

## Development

### TypeScript Type Generation

Frontend TypeScript interfaces are auto-generated from the Pydantic runtime contracts.
**After modifying `shadowflow/runtime/contracts.py`**, regenerate and commit the types:

```bash
python scripts/generate_ts_types.py
git add src/core/types/workflow.ts
git commit -m "chore: regenerate TS types from contracts.py"
```

The CI `lint-backend` job runs `python scripts/check_contracts.py` and will **fail** if
`src/core/types/workflow.ts` is out of sync with `contracts.py`.
