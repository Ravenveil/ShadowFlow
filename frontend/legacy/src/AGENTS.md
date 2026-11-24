# src/

React + TypeScript 前端（Vite，dev port 3007）。SSE 消费端 + 7 个 page-level routes + 组件库。

## 启动

```bash
npm run dev      # vite dev server
npm run build    # 生产构建
```

## 子目录

- `pages/` — 顶层路由组件（StartPage, RunSessionPage, ChatPage, BuilderPage 等）
- `components/` — 可复用 UI 组件
  - `run-session/` — v3 stacked AgentDetail + Step / Skill / Preview 系列
  - `composer/` — `/` + `@` inline command menu
  - `hifi/` — 通用 Hi-Fi 容器组件（HfLayout, HfTopBar 等）
- `core/` — 状态 hook / 路由 hook
  - `hooks/useRunSession.ts` — SSE 状态机 reducer，前端唯一 SSE 数据源
  - `hooks/useFollowMode.ts` — 步骤 → tab 自动跟随 + substep → anchor scroll
- `api/` — fetch 封装 + EventSource 包装
  - `runSessions.ts` — SSE listener + 类型 `NodeEvent` / `EdgeEvent` / 等等
  - `agents.ts` / `skills.ts` / `teams.ts` 等 — REST 客户端
- `common/` — 国际化 / 类型 / 工具函数

## 跨边界规则

- 不直接 import server/src 代码（共享类型通过手抄维护，没有 monorepo）
- 所有数据流：SSE event → useRunSession dispatch → state → 组件 render
- 不要在前端 mock / 补 placeholder（plan-eng-review S0/D11 决议「前端不要 mock，必须后端真实 SSE 传入」）
- 缺帧 = 后端 bug，**暴露**不掩盖

## 关键文件

- `pages/RunSessionPage.tsx` — 主跑动页面，左侧 chat stream + 右侧 4 tab（Overview / Team / Agent / Preview）
- `core/hooks/useRunSession.ts` — 反映后端所有 SSE 帧的 reducer
- `components/run-session/SkillSection.tsx` (S6.7+S10) — v3 stacked 单 section，cached/generated/loading/pending pill
- `components/run-session/AgentDetail.tsx` (S6.7) — 4 SkillSection 组合 + Identity card
- `components/run-session/StepList.tsx` (S6.8) — 左侧 step + substep 树
- `components/composer/CommandMenu.tsx` — `/` + `@` 触发的 inline 菜单

## 不要碰

- `dist/` — vite 构建产物
- `node_modules/`
