# ShadowFlow — Codex Instructions

## 架构与目录（2026-11-19 起是硬约束）

**改任何代码前先读 [documentation/ARCHITECTURE.md](documentation/ARCHITECTURE.md)。** 要点：

- 业务规则进 `backend/node/src/domains/<域>/model`；多步编排进 `use_cases`；HTTP 形状进 `routes`/`adapters`；SQL/IO 进 `infra`。
- `model` 禁止 import express / sqlite / fs / crypto —— 纯领域。
- 新增代码一律写进新结构，**禁止往已迁移的旧位置加文件**（`storage/*`、`routes/*` 里对已迁移模块只剩兼容层）。
- 别造 `utils/`、`helpers/` 这类幽灵目录；真跨域共享才上移公共层。
- 每批改动以「tsc 干净 + 全量测试零回归」为门槛，别用「测试本来就红」当解释。

## 0G direction cancelled (2026-08)

0G integration is **no longer a project direction**. The teardown completed
2026-08-17 (ROADMAP 3.5): ZeroGCheckpointStore, bridge/, @0glabs/hardhat deps,
.0g-skills/, zerog writeback channel and the sfagent upload endpoint are all
removed. Do not reintroduce any 0G component; historical mentions remain only
in docs/pm records and CHANGELOG.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
