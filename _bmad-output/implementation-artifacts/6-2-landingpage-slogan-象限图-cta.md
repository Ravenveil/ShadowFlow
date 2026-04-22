# Story 6.2: LandingPage — Slogan + 象限图 + CTA

Status: ready-for-dev

## Story

As a **0G Hackathon 评委(J5)首次访问 ShadowFlow 站点**,
I want **落地页 3 秒内让我理解产品核心差异化,并且点一下就能试玩**,
so that **J5 路演开场 0:00-0:15 的 15 秒落地窗口就能建立"这是链上协作团队,不是又一个聊天机器人"的正确心智**。

## Acceptance Criteria

### AC1 — 首屏三要素 2s 内渲染完成

**Given** `src/pages/LandingPage.tsx` 新增作为 `/` 路由(React Router v6)
**When** 评委首次访问 `https://demo.shadowflow.xyz/`
**Then** 首屏 ≤ 2s 完成渲染(P1),同屏可见以下三要素:
- **Slogan**(H1 大字号,≥ 36px):**"让每个人都能设计自己的 AI 协作团队,团队本身是链上资产"**
- **象限图**(SVG 或 Mermaid,AR30 四维象限 = 横轴 "单 Agent ↔ 多 Agent 协作"、纵轴 "有状态本地 ↔ 链上可传承"):ShadowFlow 独占右上"真协作团队 + 链上资产"象限,其余象限标注 ChatGPT / LangGraph / AutoGen 等对照位置
- **CTA 按钮**(主次两个):主 = "Try Live Demo(无需注册)"跳转 `/templates`;次 = "View GitHub"外链跳转仓库

**And** 首屏文案不超过一屏,滚动后才展示细节段落(避免信息过载)

### AC2 — OG meta 完整 + 移动端 view-only

**Given** LandingPage 在 `index.html` 或 `react-helmet-async` 中注入完整 OG meta
**When** 评委复制链接分享到 Twitter / Discord / 微信
**Then** 预览卡片包含:`og:title`(Slogan)+ `og:description`(30 字内一句话介绍)+ `og:image`(1200×630 品牌图,含象限图与 Slogan)+ `og:url` + `twitter:card=summary_large_image`
**And** 移动端访问 `/` 能看到完整落地页(view-only):Slogan / 象限图 / CTA 全部可见,点 "Try Live Demo" 在手机端跳到 `/templates` 但 editor 提示 "桌面端体验更佳"(不强制拦截)
**And** "Try Live Demo" 按钮**不弹注册框**,直接进 `/templates`(FR38)

## Tasks / Subtasks

- [ ] **T1(AC1):LandingPage 页面骨架**
  - [ ] 新增 `src/pages/LandingPage.tsx` 注册为 `/` 路由
  - [ ] 顶部 hero 区:Slogan(H1)+ 副标题(一句话产品介绍)+ CTA 双按钮
  - [ ] 中部:四维象限图(组件 `src/core/components/landing/QuadrantChart.tsx`)
  - [ ] 底部:三条核心能力速览卡(Runtime Contract / Policy Matrix / 0G 链上传承)
  - [ ] Vite code splitting:Landing 单独 chunk,初次进站不加载 ReactFlow / 0G SDK
- [ ] **T2(AC1):四维象限图组件**
  - [ ] `src/core/components/landing/QuadrantChart.tsx` — SVG 实现(不依赖第三方图库减体积)
  - [ ] 横轴:"单 Agent ← → 多 Agent 协作";纵轴:"有状态本地 ← → 链上可传承"
  - [ ] 四象限标注:右上 = ShadowFlow(高亮品牌色);左上 = N8N / Dify;右下 = LangGraph / AutoGen / CrewAI;左下 = ChatGPT / Cherry Studio
  - [ ] 响应式:移动端缩放适配但保持四象限可读
- [ ] **T3(AC1):CTA 按钮与路由**
  - [ ] 主按钮 "Try Live Demo(无需登录)" — `<Link to="/templates">`,**不触发任何登录/注册 modal**(FR38)
  - [ ] 次按钮 "View GitHub" — `<a target="_blank" rel="noopener">` 指向仓库 URL(从 `VITE_GITHUB_URL` 环境变量读)
  - [ ] 键盘可达:`Tab` 顺序 Slogan → 主 CTA → 次 CTA,焦点环可见(WCAG A1)
- [ ] **T4(AC2):OG meta 注入**
  - [ ] 安装 `react-helmet-async`(若未有)
  - [ ] LandingPage 组件内注入 `og:title` / `og:description` / `og:image` / `og:url` / `twitter:card`
  - [ ] `public/og-image.png` — 1200×630 品牌图(含 Slogan + 象限图预览,预先设计)
  - [ ] 在 Twitter Card Validator / Discord 实际分享两处验证预览生效
- [ ] **T5(AC2):移动端 view-only 适配**
  - [ ] Tailwind 响应式断点:`md:` 及以下仅展示(不禁用 CTA)
  - [ ] 编辑器页面若在 mobile 访问,顶部 banner 提示 "桌面端体验更佳"
- [ ] **T6(测试)**
  - [ ] Lighthouse Performance ≥ 90(首屏 ≤ 2s 自动验证)
  - [ ] Lighthouse Accessibility ≥ 90(WCAG AA basic)
  - [ ] Playwright:访问 `/` → 断言 Slogan / 象限图 SVG / 两个 CTA 可见,点 "Try Live Demo" 跳 `/templates` 不出注册框
  - [ ] 浏览器兼容冒烟:Chrome 120 / Edge 120 / Firefox 120 / Safari 17+ 各过一遍首屏渲染

## Dev Notes

### 架构依据
- **Epic 6 Goal**:前 5 个 Epic 的能力织成完整 5 分钟评委叙事,LandingPage 是评委 0:00-0:15 落地的第一接触面,决定后续 4:45 的认知框架。
- **相关 AR**:AR30(四维象限差异化图)、AR33(README 与落地页统一叙事)、AR40(路演叙事金线)
- **相关 FR**:FR38(Try Demo 无需登录)、FR40(底部三入口对比)
- **相关 NFR**:P1(首屏 ≤ 2s)、A1(WCAG 2.1 AA basic)、SC1(50 并发稳定)

### 涉及文件
- 前端页面:`src/pages/LandingPage.tsx`(`/` 路由)
- 组件:`src/core/components/landing/QuadrantChart.tsx`(AR30 四维象限 SVG)
- 静态资源:`public/og-image.png`(1200×630,含 Slogan 与象限图预览)
- 配置:`index.html`(OG meta fallback)+ `VITE_GITHUB_URL` 环境变量
- 依赖:`react-helmet-async`(OG meta 动态注入)

### 关键约束
- **Slogan 文本逐字固定**:**"让每个人都能设计自己的 AI 协作团队,团队本身是链上资产"** —— 这是 AR40 路演金线的锚点,任何改动需先更新 PRD 与路演脚本。
- **首屏 ≤ 2s**(P1):象限图走 SVG 不走图片以降低 LCP;ReactFlow 与 0G SDK 不得出现在 Landing chunk 中。
- **Try Demo 无需登录**(FR38):CTA 不弹注册 / 不跳登录页 / 不 gate 任何功能。评委一旦遇到登录框会立即退出。
- **OG meta 完整**(FR40 / AR40):Twitter Card Validator 预览必须漂亮;未验证通过不得合并。
- **WCAG 2.1 AA basic**(A1):色差 ≥ 4.5:1、键盘可达、语义 HTML(`<h1>`/`<nav>`/`<main>`)、Skip link 可选。
- **四维象限图**独立文件 + 可独立打开(便于 AboutPage 6.4 复用同一组件)
- **移动端不禁用**:评委可能先在手机上扫分享链接,view-only 不能阻断 CTA 流动性。

### 测试标准
- Lighthouse Performance ≥ 90,Accessibility ≥ 90(Story 6.4 的 AboutPage 同标准)
- Playwright E2E 覆盖 J5 评委 5 分钟叙事开场 15 秒:Landing → 主 CTA → Templates 页出现
- 浏览器兼容性冒烟:Chrome/Edge/Arc ≥ 120、Firefox ≥ 120、Safari 17+(PRD Browser Matrix)
- OG meta 真实分享测试:在 Twitter Card Validator + Discord 一次复制链接发送验证

## References

- [Source: epics.md#Story 6.2]
- [Source: prd.md#Web App Specific Requirements](浏览器矩阵 / 响应式 / WCAG / OG meta)
- [Source: prd.md#FR38](Try Demo 无需登录)
- [Source: architecture.md#Frontend Architecture](Routing Strategy `/`)
- [Source: _bmad-output/planning-artifacts/shadowflow-product-brief.md#J5 评委 5 分钟]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
