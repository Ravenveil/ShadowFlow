# ShadowFlow — Codex Instructions

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
