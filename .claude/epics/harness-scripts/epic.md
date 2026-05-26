---
name: harness-scripts
status: open
created: 2026-05-26T14:20:03Z
updated: 2026-05-26T14:20:03Z
prd: harness-6dim-survey-and-river-memory
priority: P0
progress: 0%
source_doc: docs/harness/harness-6dim-survey-and-river-memory.md §2.2 Q5 + §4 B1
---

# Epic: Harness Dimension — Scripts（Team Validation Hook）

## 维度定位

**文章 6 维之一**：Scripts — *"Is the job done"* / *Gatekeeping and validation*

> "一个真正成熟的 Harness 最终会越来越依赖脚本，越来越少地依赖 Prompt。
> 从'我觉得我做完了'到'脚本通过了，所以我完成了'。" —— 文章 §1.5

## 平台缺口（用户视角）

用户问："我团队跑完一个 turn，我想加一个客观判断'这次产出到底合不合格'，怎么挂？"
**ShadowFlow 当前回答**：……没有这个挂载点。turn 结束 = parser 看到 `<sf:complete>` = LLM 自己说完了。

**评分**：平台原语 🔴 / 用户可用度 🔴 — **6 维里最大的缺口**。

## 战略意义

> **L1 → L2 唯一钥匙**。
> 没有这一块，用户在 ShadowFlow 上搭出的任何 team 都跨不过文章 Level 1
> （仅约束，靠肉眼审）。Scripts 是给 team 装上"客观裁判"——L2 反馈回路的入口。

## Success Criteria

- [ ] 用户能在 team 设置 UI 上挂载 1-N 个 validation hook（shell / webhook / builtin）
- [ ] turn 完成时强制跑 hook，全部通过才标 done；任意 fail → retry 或 blocker
- [ ] 提供 4-6 个内置 validator 种子（tsc / pytest / lint / chrome console error）
- [ ] e2e 验证：用户故意写错代码 → turn 自动 retry → 用户修 → 通过

## 后端模块责任

**新建模块**：`shadowflow/runtime/validation_hooks/` —
含 hook schema、执行引擎、内置 validator registry、telemetry。

**触点**：
- `shadowflow/api/teams.py` — 加 hooks CRUD endpoints
- `shadowflow/runtime/turn_executor.py`（或对应 run-session 主循环）— turn 结束钩入校验
- `src/components/team-settings/` — 新增 "校验脚本" tab

## Tasks Created

- [ ] 001.md - Team Validation Hook 设计文档（契约 + 触发时机 + 失败行为）
- [ ] 002.md - Hook 数据模型 + Teams API 扩展
- [ ] 003.md - Runtime 执行点接入
- [ ] 004.md - 内置 validator 种子库（tsc/pytest/lint/chrome-console）
- [ ] 005.md - UI 配置面板 + e2e 浏览器验证

Total tasks: 5
Parallel tasks: 2 (004, 005 在 001-003 完成后可并行)
Sequential tasks: 3 (001 → 002 → 003)
Estimated total effort: 3-4 周
