# AgentGraph CLI 安装与使用

这份文档面向两类人：

- 想在本地直接把 AgentGraph CLI 跑起来的人
- 想验证 Claude CLI / Codex CLI / OpenAI / Anthropic 接入是否通的人

## 1. 当前推荐安装方式

当前阶段推荐使用源码安装，而不是直接从 PyPI 安装。

原因：

- 本项目当前权威分发方式是源码安装
- `agentgraph` 这个 PyPI 名称已被其他项目占用，不对应当前仓库

推荐步骤：

```bash
git clone <your-repo-url>
cd agentgraph
python -m venv .venv
.venv\Scripts\activate
pip install -U pip
pip install -e .[dev]
```

安装完成后验证：

```bash
agentgraph --help
python -m agentgraph.cli --help
pytest
```

## 2. CLI 基础用法

校验工作流：

```bash
agentgraph validate -w examples/runtime-contract/docs-gap-review.yaml
```

运行工作流：

```bash
agentgraph run -w examples/runtime-contract/docs-gap-review.yaml -i "{\"goal\":\"Analyze docs gaps\"}"
```

启用 markdown writeback：

```bash
agentgraph run -w examples/runtime-contract/cli-generic-local.yaml -i "{\"goal\":\"local smoke\"}" --writeback markdown --writeback-root ./agentgraph-runtime
```

说明：

- `run --writeback markdown`、`chat`、`runs`、`checkpoints`、`sessions`、`resume` 都会使用同一个持久化 runtime root
- 可通过 `--writeback-root` 或 `--root` 显式指定
- 也可以通过环境变量 `AGENTGRAPH_RUNTIME_ROOT` 统一覆盖默认值

启动 HTTP 服务：

```bash
agentgraph serve --port 8000
```

导出 workflow 图结构：

```bash
agentgraph graph -w examples/runtime-contract/docs-gap-review.yaml
```

从高层模板编译 workflow：

```bash
agentgraph compile --template docs-review-template --registry-root examples/highlevel/minimal-registry --var goal="Audit docs"
agentgraph compile --template docs-review-template --registry-root examples/highlevel/minimal-registry --var goal="Audit docs" --summary json
```

查看和生成高层 spec：

```bash
agentgraph presets list
agentgraph patterns list
agentgraph role-presets list
agentgraph registry counts --registry-root examples/highlevel/minimal-registry
agentgraph registry list --registry-root examples/highlevel/minimal-registry --kind templates
agentgraph registry export --registry-root examples/highlevel/minimal-registry --output-root ./exported-registry
agentgraph registry import --registry-root ./my-registry --source-root ./exported-registry
agentgraph registry import --registry-root ./my-registry --preset single-reviewer --workflow-id docs_review_pack
agentgraph init tool --registry-root ./my-registry --id filesystem --kind builtin
agentgraph init role --registry-root ./my-registry --id reviewer
agentgraph init role --registry-root ./my-registry --id strict_reviewer --preset reviewer
agentgraph init skill --registry-root ./my-registry --id docs_review
agentgraph init agent --registry-root ./my-registry --id docs_reviewer --role reviewer --skill docs_review --tool filesystem
agentgraph init template --registry-root ./my-registry --id docs_review_template --agent-ref docs_reviewer --agent-node-id reviewer
agentgraph init workflow --registry-root ./my-registry --id docs_review_pack --pattern single-reviewer --goal "Audit docs"
agentgraph scaffold --registry-root ./my-registry --pattern planner-coder-reviewer --workflow-id feature_lane --goal "Ship a safe feature plan"
agentgraph init workflow --registry-root ./my-registry --id research_lane --task-kind research --goal "Collect evidence and package a final summary"
agentgraph init workflow --registry-root ./my-registry --id feature_lane --preset planner-coder-reviewer --goal "Ship a safe feature plan" --assign planner.focus="Only define execution milestones" --assign reviewer.owned_topics="regression,tests"
```

内置 preset 当前有：

- `single-reviewer`
- `planner-coder-reviewer`
- `research-review-publish`

同一组内置模板也可视为第一版 workflow pattern library：

- `agentgraph patterns list`

内置 role archetype 当前有：

- `planner`
- `coder`
- `reviewer`
- `researcher`
- `publisher`
- `qa`

固定角色指派当前支持两种方式：

1. `--assign node.field=value`
   例如：
   `--assign planner.focus="Only define execution milestones"`
2. `--assignments-json`
   例如：

```bash
agentgraph init workflow --registry-root ./my-registry --id feature_lane --preset planner-coder-reviewer --goal "Ship a safe feature plan" --assignments-json "{\"planner\":{\"focus\":\"Only define execution milestones\"},\"reviewer\":{\"owned_topics\":[\"regression\",\"tests\"]}}"
```

当前推荐字段有：

- `focus`
- `deliverable`
- `handoff_goal`
- `owned_topics`
- `notes`

工作流治理层当前还支持：

- `policy_matrix`
- `stages / lanes`
- compile-time validation
- `task-kind -> pattern` 推荐入口

单轮 chat：

```bash
agentgraph chat --kind cli --provider claude --parse claude-json --message "请用一句中文介绍 AgentGraph"
```

如果你要用 generic CLI 且参数里包含 `-c` 这类短横线前缀，推荐用 `--args-json`：

```bash
agentgraph chat --kind cli --provider generic --command python --args-json "[\"-c\", \"print('hello')\"]" --stdin-mode none --parse text --message "ignored"
```

运行记录与会话查询：

```bash
agentgraph runs list
agentgraph runs get --run-id <run_id>
agentgraph runs graph --run-id <run_id>
agentgraph checkpoints get --checkpoint-id <checkpoint_id>
agentgraph sessions list
agentgraph sessions get --session-id <session_id>
agentgraph resume --run-id <run_id> --checkpoint-id <checkpoint_id>
```

## 3. Provider 前置条件

### Generic CLI

不依赖特定模型，只要目标命令本机可执行即可。

示例：

- [cli-generic-local.yaml](/D:/VScode/TotalProject/AgentGraph/examples/runtime-contract/cli-generic-local.yaml)

### Claude CLI

需要：

- 本机已安装 `claude`
- 当前终端环境可直接运行 `claude`
- Claude CLI 已完成登录或鉴权

示例：

- [cli-claude-execution.yaml](/D:/VScode/TotalProject/AgentGraph/examples/runtime-contract/cli-claude-execution.yaml)

### Codex CLI

需要：

- 本机已安装 `codex`
- 当前终端环境可直接运行 `codex`
- Codex CLI 已完成登录或鉴权

示例：

- [cli-agent-execution.yaml](/D:/VScode/TotalProject/AgentGraph/examples/runtime-contract/cli-agent-execution.yaml)

注意：

- 某些外部 MCP 或插件告警可能会出现在 stderr 中
- 只要 CLI 退出码为 0，AgentGraph 仍会保留 stderr 并继续收敛结构化结果

### OpenAI API

需要环境变量：

```bash
set OPENAI_API_KEY=your_key
```

示例：

- [api-agent-execution.yaml](/D:/VScode/TotalProject/AgentGraph/examples/runtime-contract/api-agent-execution.yaml)

### Anthropic API

需要环境变量：

```bash
set ANTHROPIC_API_KEY=your_key
```

示例：

- [api-anthropic-execution.yaml](/D:/VScode/TotalProject/AgentGraph/examples/runtime-contract/api-anthropic-execution.yaml)

## 4. 输出行为

运行结果统一输出：

- `run`
- `steps`
- `final_output`
- `trace`
- `artifacts`
- `checkpoints`

HTTP API 还额外提供：

- workflow graph 导出
- run 列表
- run graph 导出
- chat session 创建、查看、发消息

如果启用 `--writeback markdown`，还会在目标目录下写出：

- `runs/`
- `host/` / `docs/` / `memory/` / `graph/`
- `checkpoint-store/`
- `requests/`
- `chat/sessions/`

## 5. 建议的本地 smoke 顺序

建议按下面顺序验证：

1. `python -m agentgraph.cli --help`
2. `agentgraph validate -w examples/runtime-contract/cli-generic-local.yaml`
3. `agentgraph run -w examples/runtime-contract/cli-generic-local.yaml -i "{\"goal\":\"smoke\"}"`
4. `agentgraph run -w examples/runtime-contract/cli-generic-local.yaml -i "{\"goal\":\"smoke\"}" --writeback markdown --writeback-root ./agentgraph-runtime`
5. `agentgraph runs list --root ./agentgraph-runtime`
6. 再根据本机条件验证 Claude CLI / Codex CLI / API executor

## 6. 自动化 smoke 脚本

仓库里提供了一个 Windows PowerShell 安装 smoke 脚本：

- [smoke-install.ps1](/D:/VScode/TotalProject/AgentGraph/scripts/smoke-install.ps1)

它会：

- 创建临时虚拟环境
- 安装当前仓库
- 验证 `agentgraph --help`
- 运行一个最小 `validate`
- 运行一个最小 `run`
