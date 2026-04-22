# Story 6.3: TemplatesPage 6 模板 Gallery + Quick Demo 预填

Status: ready-for-dev

## Story

As a **0G Hackathon 评委(J5)**,
I want **在模板选择页 30 秒内决定 demo 哪个模板,并且一键预填指令即可 Run**,
so that **J5 路演 0:15-0:45 阶段(选模板 → 点 Quick Demo → 进入看板)转化率高,不会卡在"评委不知道输什么指令"的尴尬**。

## Acceptance Criteria

### AC1 — 6 模板卡片 Gallery 展示

**Given** `src/pages/TemplatesPage.tsx` 作为 `/templates` 路由
**When** 评委从 LandingPage CTA "Try Live Demo" 跳转到达
**Then** 页面展示 6 张模板卡片(Grid 布局,桌面 3 列 × 2 行):
- **Solo Company**(单人公司 8 角色)
- **Academic Paper**(学术论文生产管线)
- **Newsroom**(新闻编辑部突发叙事)
- **Modern Startup**(现代创业团队)
- **Ming Cabinet**(明朝内阁三院六部制度复刻)
- **Blank**(空白模板,从零搭建)

**And** 每张卡片包含:
- **30 字以内痛点描述**(例:Solo Company = "早晨一个人要搞定 bug / 推文 / 邮件 / GDPR 评估")
- **GIF 预览**(3-5 秒 loop,展示该模板 run 起来的看板动态)
- **"Quick Demo" 预填按钮**(主 CTA,带闪光视觉强调)
- **"Custom Edit" 次按钮**(跳 `/editor/{templateId}` 但不预填指令,留给高级用户)

### AC2 — Quick Demo 一键预填 + 即刻 Run

**Given** 评委点击某模板的 "Quick Demo" 按钮
**When** 前端跳转至 `/editor/{templateId}?quickDemo=1`
**Then** EditorPage 加载对应模板 DAG
**And** **指令框自动预填**(FR39)— 每个模板对应一条样板指令:
- Solo Company: `"修登录 bug + 发 CSV 推文 + 回邮件 + 评估 GDPR"`
- Academic Paper: `"把本周实验日志编成带对比分析的 Results 章节,缺数据就问我"`
- Newsroom: `"地震突发,30 分钟内出三条差异化稿件 + 改发稿制度为双审核"`
- Modern Startup: `"PM 写 spec + 工程拆 ticket + 设计出原型 + 周五晨会汇报"`
- Ming Cabinet: `"拟一道旨意:罢免某官员,须经内阁票拟与六科给事中复核"`
- Blank: `"(此处自由输入指令,建议先从 Solo Company 体验)"`

**And** 页面右上角出现高亮 "Run" 按钮,点一下即触发 workflow run,不需要再填任何参数
**And** 若模板需要 LLM API Key 但 localStorage 没存,弹轻量配置引导(不是注册,是 BYOK 填 key)

## Tasks / Subtasks

- [ ] **T1(AC1):TemplatesPage 页面骨架**
  - [ ] 新增 `src/pages/TemplatesPage.tsx` 注册为 `/templates` 路由
  - [ ] Grid 布局:桌面 3 列 × 2 行,平板 2 列 × 3 行,手机 1 列 × 6 行
  - [ ] 顶部简短 breadcrumb:`Home > Templates`(便于评委回退)
- [ ] **T2(AC1):TemplateCard 组件**
  - [ ] `src/core/components/templates/TemplateCard.tsx` — props `{templateId, name, painPoint, gifSrc, quickDemoPrompt}`
  - [ ] 内容:名称 + 30 字痛点 + GIF(懒加载 `loading="lazy"`)+ 主次两按钮
  - [ ] Hover 效果:GIF 播放(默认首帧静止)+ 按钮高亮
  - [ ] 键盘可达:Enter 触发主按钮,`Shift+Enter` 触发次按钮
- [ ] **T3(AC1):6 个 GIF 资源生产**
  - [ ] `public/templates/gifs/solo-company.gif`(3-5s 循环,≤ 500 KB)
  - [ ] `public/templates/gifs/academic-paper.gif`
  - [ ] `public/templates/gifs/newsroom.gif`
  - [ ] `public/templates/gifs/modern-startup.gif`
  - [ ] `public/templates/gifs/ming-cabinet.gif`
  - [ ] `public/templates/gifs/blank.gif`(可用空白画布动画占位)
  - [ ] 生产流程:用实际 demo 录屏 → ffmpeg 压缩 → 回归测试加载时间
- [ ] **T4(AC2):Quick Demo 预填指令映射**
  - [ ] `src/core/constants/quickDemoPrompts.ts` — 6 个模板 id → 预填 prompt 字符串映射(内容见 AC2)
  - [ ] EditorPage 读取 `?quickDemo=1` 查询参数,若存在则从映射取 prompt 注入指令框
  - [ ] 点 "Run" 按钮直接触发已有的 `POST /workflow/runs` 流程(Epic 4 已交付)
- [ ] **T5(AC2):BYOK 配置引导**
  - [ ] 若 `useSecretsStore` 无 LLM key,弹轻量 modal(不是登录框,标题 "自带 Key 上路")
  - [ ] 引导文本:"ShadowFlow 不存你的 key,仅在本地 localStorage;评委 demo 可用我们 pre-baked 的临时 key(扫二维码获取)"
  - [ ] 快捷"用演示 Key"按钮(预埋环境变量 `VITE_DEMO_LLM_KEY`,hackathon 专用)
- [ ] **T6(测试)**
  - [ ] Playwright:`/templates` → 6 卡片可见 → Solo Company Quick Demo → `/editor/solo-company?quickDemo=1` → 指令框预填文本断言 → Run 按钮可点
  - [ ] 每个 GIF 首次加载 ≤ 500 KB(Lighthouse Total Blocking Time ≤ 300ms)
  - [ ] Lighthouse Accessibility ≥ 90
  - [ ] 浏览器兼容:Chrome/Edge/Arc ≥ 120、Firefox ≥ 120、Safari 17+ 各过一遍

## Dev Notes

### 架构依据
- **Epic 6 Goal**:前 5 个 Epic 的能力织成完整 5 分钟评委叙事;TemplatesPage 是 J5 路演 0:15-0:45 的关键转化阶段,决定评委下一步看的是 Academic Paper 还是 Solo Company 的 demo。
- **相关 AR**:AR31(6 模板 Gallery 是 pitch 层资产而非功能资产)、AR40(路演叙事金线)
- **相关 FR**:FR38(无需登录即可试玩)、FR39(Quick Demo 预填降低门槛)
- **相关 NFR**:P1(首屏 ≤ 2s)、A1(WCAG AA basic)

### 涉及文件
- 前端页面:`src/pages/TemplatesPage.tsx`(`/templates` 路由)
- 组件:`src/core/components/templates/TemplateCard.tsx`
- 常量:`src/core/constants/quickDemoPrompts.ts`(6 条预填指令)
- 静态资源:`public/templates/gifs/*.gif`(6 份 GIF 预览)
- 已有复用:`useSecretsStore`(BYOK)、`POST /workflow/runs`(Epic 4)

### 关键约束
- **Quick Demo 必须预填具体指令**(FR39):按钮点击不能只是跳转到空编辑器,必须预填可直接 Run 的完整指令。每个模板一份样板指令,文本见 AC2,写入 `quickDemoPrompts.ts` 常量文件。
- **GIF 懒加载 + 体积控制**:6 个 GIF 共 ≤ 3 MB,首屏只加载可视区内的 2-3 个(IntersectionObserver)。
- **30 字痛点描述是 pitch 层设计**(AR31):评委阅读速度 500 字/分钟,30 字 = 3.6 秒决策,刚好匹配 30 秒选模板窗口。
- **无需登录**(FR38):Quick Demo 不应触发登录,BYOK 弹窗仅在模板确实需要 LLM 调用时才出现,且明确说明 "不存你的 key"。
- **演示 Key 兜底**:hackathon 现场评委不会带 API key,必须提供 `VITE_DEMO_LLM_KEY` 快捷入口(rate-limited,代码内写明不可商用)。
- **Ming Cabinet 模板**是评委辨识度最高的模板(中国古代制度复刻展示 Policy Matrix 能力),GIF 必须重点展现票拟-披红-科给事中三轮流程。

### 测试标准
- Playwright E2E 覆盖 J5 评委 5 分钟叙事的 0:15-0:45 阶段:Landing → Templates(30s 决策)→ Quick Demo → Editor 预填 → Run
- Lighthouse Performance ≥ 90(GIF 不拖后腿)
- Lighthouse Accessibility ≥ 90
- 浏览器兼容性冒烟:Chrome/Edge/Arc ≥ 120、Firefox ≥ 120、Safari 17+(PRD Browser Matrix)
- 每个模板的 Quick Demo 都手工跑一次,确认预填指令能真的触发完整 run(不止是字符串注入)

## References

- [Source: epics.md#Story 6.3]
- [Source: prd.md#FR39](Quick Demo 预填指令)
- [Source: prd.md#FR38](无需登录)
- [Source: architecture.md#Frontend Architecture](Routing `/templates`)
- [Source: _bmad-output/planning-artifacts/shadowflow-product-brief.md#6 模板清单]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
