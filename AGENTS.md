# ShadowFlow — Codex Instructions

## 0G direction cancelled (2026-08)

0G integration is **no longer a project direction**. Do not follow any 0G skill
rules, do not add new 0G code, and treat existing 0G components (ZeroGCheckpointStore,
bridge/, @0glabs deps, .0g-skills/) as pending removal — see task card T2.5 in
`docs/pm/ROADMAP-agentinfra.md` for the tracked teardown plan.

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
