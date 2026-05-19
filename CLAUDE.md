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

## UI 保护规则

**核心原则：只能加，不能删。在保护已有设计的基础上可以自由修改和改进。**

### 允许的操作 ✅
- 新增 section、组件、功能区块
- 改进现有 UI 的样式、交互、动效
- 新增路由、props、逻辑
- 在现有页面上叠加新内容

### 禁止的操作 ❌
- 删除已有的页面 section（Hero、对比表、Feature 卡片、Proof Wall 等）
- 用简化版本替换已有的完整设计
- 把多 section 的完整页面缩减为简单占位内容
- 重写已有 UI 文件导致视觉内容变少

### 重点保护文件
- `src/pages/LandingPage.tsx` — 完整营销落地页，所有 section 必须保留
- `src/EditorPage.tsx` — 编辑器主界面
- `src/pages/TemplatesPage.tsx` — 模板选择页
- `src/index.css` — 全局设计 token 和 `sf-*` 动画类

### 前端工作流
- Claude 可以直接做 UI 改动，无需事先确认
- 大的视觉重设计可以通过 Claude Design（Pencil）出稿后实现
- 后端功能完成后，前端配套 UI 由 Claude 直接补充，不需要等待设计稿

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

## 双后端架构（必读）

ShadowFlow 同时跑两个后端：
- **Node Express** (`server/src/`, port 8002) — run-sessions、agents、SQLite
- **Python FastAPI** (`shadowflow/api/`, port 8000) — teams、groups、inbox、workflows、JSON 文件

Express 的 `proxy-fallback` 中间件把未命中的 `/api/*` 转给 Python。Python 没启时，
所有 teams/groups/chat 数据都拿 503，前端有红色 banner 提示。

**遇到 "/teams 显示无数据" / "/chat 暂无群组" 等症状先看：**
- 详细架构图 + 故障排查矩阵：`docs/architecture/dual-backend.md`
- 后端状态前端 hook：`src/core/hooks/usePythonBackendStatus.ts`
