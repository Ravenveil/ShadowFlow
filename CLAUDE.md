# ShadowFlow — Claude Code Instructions

## 0G Agent Skills

This project targets the 0G decentralized AI operating system (Storage / Compute /
Chain / Cross-layer). The 0G Foundation's official agent skills are installed under
`.0g-skills/` and provide 15 skills with ALWAYS/NEVER rules for correct SDK usage.

@.0g-skills/CLAUDE.md

When working on 0G integration code, follow the critical rules in `.0g-skills/CLAUDE.md`
(ethers v6, `evmVersion: "cancun"`, `processResponse()` after every compute inference,
ZgFile close-in-finally, etc.) and load the relevant `SKILL.md` from
`.0g-skills/skills/{category}/{skill}/SKILL.md`.

Orchestration rules and activation triggers live in `.0g-skills/AGENTS.md`.

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
