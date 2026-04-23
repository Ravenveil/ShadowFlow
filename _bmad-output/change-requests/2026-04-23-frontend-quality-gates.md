---
name: 前端质量门 — CI 接 E2E + EditorPage smoke + tsc 严格化
created: 2026-04-23T00:00:00Z
status: proposed
driver: user
source-session: "Epic 3 完工后首次本地起 dev server 发现 RunButton `zh is not defined` — ErrorBoundary 兜底，流程未抓到"
target-artifacts: [epics.md, sprint-status.yaml, .github/workflows/ci.yml, tsconfig.json, src/__tests__/, tests/e2e/, CLAUDE.md]
recommended-next-skill: bmad-correct-course
---

# Change Request · 2026-04-23 · 前端质量门

## 背景

2026-04-23 用户首次本地起 `npm run dev` + 浏览器访问 `/editor`，页面立刻被 ErrorBoundary 兜住，报 `zh is not defined`。

根因：`src/EditorPage.tsx:173 RunButton` 函数体用了未声明的 `zh`，调用方按 `lang === 'CN'` 传参，实现者漏写 `const zh = lang === 'CN'`。一行 fix 已 apply。

**真问题不是这个 bug，是 BMad 前端流程同时存在 5 个漏洞让它畅通无阻走到 Epic 3 done：**

1. **CI 不跑 Playwright** — `tests/e2e/editor-shell.spec.ts` AC1 会 `goto('/editor')` 断言三列布局可见；如果跑了必挂。`.github/workflows/ci.yml` 只有 ruff/mypy/eslint/vitest/docker build，零 e2e。
2. **`EditorPage.tsx` 没有任何组件级 vitest** — `src/__tests__/components/` 全是子组件测试（`ApprovalGateNode`/`LiveDashboard`/`PolicyMatrixPanel` 等），整个 `EditorPage` 从没被 `render()` 过一次。
3. **tsc 放行** — `npx tsc --noEmit` 无 `Cannot find name 'zh'`。只报了 `KV` unused 和 i18n 对象类型错配两个无关项。strict 没全开 / 或全局 `declare` 污染。
4. **`bmad-dev-story` / `bmad-code-review` 的 AC 没强制"开浏览器眼看"** — CLAUDE.md 已明文规定前端 Story 必须 "start the dev server and use the feature in a browser before reporting the task as complete"，但 Dev/Review agent 的 skill 步骤没把这条机械化。
5. **`bmad-check-implementation-readiness` 没把前端 smoke 列为 gate** — `implementation-readiness-report-2026-04-17-hermes.md` 的 gating 偏后端 P/S/A/R/TS/I 指标，前端起站能不能渲染不在必过项。Epic 3 被判 ready 时其实从没验过。

## 三条补救工单

### 工单 A · CI 接 Playwright + 前端路由 smoke

**范围：**
- `.github/workflows/ci.yml` 新增 `e2e-frontend` job：在 `lint-frontend` 之后并行跑，`needs: [build-docker]` 不要（独立），跑 `npx playwright install --with-deps chromium` + `npx playwright test`
- 新增 `tests/e2e/route-smoke.spec.ts`：覆盖 `/`、`/editor`、`/templates`、`/editor/academic-paper` 四条路由
  - AC 1：`goto` 后 `expect(page.locator('#root')).not.toContainText('组件加载出错')`
  - AC 2：`page.on('pageerror')` 收集 + `consoleMessages` filter `type==='error'`，断言 0（或白名单 React Router future-flag warning）
- 现有 `editor-shell.spec.ts` AC1 一起纳入 CI（AC2 依赖 3-6，保持 skip）

**预估：** 1 天

**依赖：** 无（Epic 0 已有 Playwright 基础设施）

---

### 工单 B · 前端组件级渲染冒烟 vitest

**范围：**
- 新增 `src/__tests__/pages/EditorPage.smoke.test.tsx`：`render(<MemoryRouter initialEntries={['/editor']}><EditorPage/></MemoryRouter>)` 断言不抛 + 关键 testid 出现
- 同步补 `LandingPage.smoke`、`TemplatesPage.smoke`（每个页面一个 smoke）
- 审视 `src/__tests__/components/` 现有 15 个测试文件是否真覆盖渲染路径，列出死代码测试 → 独立 follow-up

**预估：** 半天

**依赖：** 无

---

### 工单 C · tsc 配置审计 + 一次性类型清理

**范围：**
- 调查：为什么 `RunButton` 体内裸 `zh` 没被 tsc 报 `Cannot find name 'zh'`。候选假说：
  1. `tsconfig.json` `noImplicitAny` / `strict` 未全开
  2. `types` / `skipLibCheck` 配置让某个全局 `declare var zh` 漏进来
  3. `src` 内某处 `declare global { const zh: …}`
- 收敛：启用 `strict: true`、`noUncheckedIndexedAccess`（如仍在关闭）
- 清理增量引入的 ~N 个类型错误 → 归零
- CI 里 `tsc --noEmit` 已在吗？确认并作为硬门

**预估：** 1–2 天（取决于存量错误量）

**依赖：** 无，但可能与 Docker build 里 `npx vite build` 跳过 tsc 的 deferred 项（deferred-work.md L16）合并处理

## 对产物的影响

- **epics.md**：建议新增 **Epic 8 · Frontend Quality Gates** 或并入 Epic 0（"开发者基础"语义匹配）。放哪儿由 `bmad-correct-course` 决定
- **sprint-status.yaml**：追加 `0-5-ci-playwright-e2e-gate` / `0-6-frontend-smoke-render-tests` / `0-7-tsc-strict-audit`（或 `8-1/8-2/8-3`）
- **CLAUDE.md**：前端 Story DoD 追加硬条："dev-story 完成前必须 `npm run dev` + 浏览器访问所有涉及路由 + console 零 error 截图留证"；code-review skill 同样机械强制
- **`bmad-check-implementation-readiness` skill**：在 readiness criteria 增加 `frontend_smoke_green: required`

## 优先级建议

**立刻（本 sprint 插入）：** 工单 A + B。理由：Epic 5/6/7 即将大量前端落地，再拖一轮则"第二个 `zh is not defined`"几乎必然发生。

**下一 sprint：** 工单 C。理由：存量类型错误修起来边界不清，不阻塞 hackathon 关键路径。

## 附：5-1 状态订正

`sprint-status.yaml:117` 显示 `5-1-0g-storage-前端直调-byok-密钥管理: review`（不是 `ready-for-dev`）。Code Review 这一轮就应该把"浏览器开一下"纳入 AC —— 是工单 A/B 的前哨验证场景。

## 下一步

用户确认后，建议开一个 fresh context 跑 `bmad-correct-course`，把本文作为输入，产出：
- 更新后的 `epics.md`（含 Epic 编号决定）
- 更新后的 `sprint-status.yaml`（含新 Story 编号 + 插入位置）
- Story 文件 3 份到 `_bmad-output/implementation-artifacts/`
