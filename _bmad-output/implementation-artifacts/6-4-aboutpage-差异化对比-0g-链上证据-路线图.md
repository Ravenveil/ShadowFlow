# Story 6.4: AboutPage — 差异化对比 + 0G 链上证据 + 路线图

Status: ready-for-dev

## Story

As a **0G Hackathon 评委(J5)进入深度调研阶段**,
I want **底部三个一级入口快速看清差异化、0G 链上证据与路线图**,
so that **J5 路演 2:30-4:30 的"技术背书"叙事完整:不是又一个 wrapper,而是 Runtime Contract + 0G 全栈原生 + INFT 路线图三栈闭环**。

## Acceptance Criteria

### AC1 — Differentiation Section:9 条 "vs X" 可点展开 + 蓝海象限图

**Given** `src/pages/AboutPage.tsx` 新增,对应 `/about` 路由,顶部 sticky 导航包含三个锚点 `#differentiation` / `#onchain` / `#roadmap`
**When** 评委访问 `/about#differentiation`
**Then** 展示 9 条 "vs X" 对比问答(手风琴 / Accordion 可点展开折叠),**100% 可点展开**(PRD Measurable Outcomes):
- **vs ChatGPT** — "单 Agent 聊天 vs 多 Agent 协作团队 + 链上传承"
- **vs Cherry Studio** — "Chat UI 多模型切换 vs Runtime Contract 编排与权限矩阵"
- **vs N8N** — "RPA 流程自动化 vs 有状态 Agent 协作(含 Approval Gate / Barrier)"
- **vs LangGraph** — "代码级 graph 编写 vs 可视化模板编辑器 + 制度级 Policy Matrix"
- **vs AutoGen** — "对话式 agent 框架 vs 确定性 workflow + checkpoint 可回放"
- **vs CrewAI** — "Role-based 协作 vs Role + Policy + 链上传承三位一体"
- **vs Edict** — "Agent 指令分发 vs Workflow 编排 + 跨 persona CID 克隆"
- **vs AIverse** — "Agent marketplace 展示 vs INFT-ready 传承链(Phase 3)"
- **vs Dify** — "LLM 应用开发平台 vs 真人可设计协作制度的编辑器"

**And** Section 底部复用 Story 6.2 的 `QuadrantChart` 组件(四维象限图),明确标注 ShadowFlow 蓝海象限
**And** 每条对比可点标题展开详细说明(≥ 100 字),支持键盘 `Enter` 展开 / `Esc` 折叠(WCAG A1)

### AC2 — 0G On-Chain Evidence Section:真实 CID + Explorer 外链

**Given** AboutPage `#onchain` 锚点段落
**When** 评委滚动到该段落
**Then** 展示至少 1 条**真实 trajectory CID**(不是 placeholder)
**And** 每条 CID 有 "View on 0G Explorer" 外链按钮(评委点击直达 0G Explorer 对应页面,可验证数据真实存在于 0G Storage)
**And** 额外展示:Merkle Root 截图 + 归档时间戳 + 作者署名链(`author_lineage`)
**And** 至少 1 条 CID 对应 Academic Paper / Solo Company 其中一个模板(呼应 Story 5.x 的上传流程)

### AC3 — Roadmap Section:三阶段规划 + 学术背书

**Given** AboutPage `#roadmap` 锚点段落
**When** 评委滚动到该段落
**Then** 展示三阶段路线图(时间线可视化):
- **Phase 1 · MVP Done** ✅ — Runtime Contract + Policy Matrix + 6 模板 + 0G Storage/Compute(已交付,当前版本)
- **Phase 2 · Sidecar 集成** — Tauri externalBin 嵌入 Shadow 桌面;SSE → WebSocket;Sentry 接入(2026-05 下旬)
- **Phase 3 · INFT Marketplace** — 基于 CID 作者署名链铸造 INFT,模板成为可交易资产;跨 persona 克隆链上可验证
**And** 页面底部学术背书区,5 条论文链接:
- **NMN**(Neural Mass Model,Runtime Contract 启发源)
- **Voyager**(Agent 技能继承范式)
- **WorkTeam**(多 Agent 协作编排)
- **Neural Bandit**(Policy Matrix 决策理论基础)
- **PaperOrchestra**(Academic Paper 生产管线范式)

## Tasks / Subtasks

- [ ] **T1(AC1):AboutPage 骨架 + sticky nav**
  - [ ] 新增 `src/pages/AboutPage.tsx` 注册为 `/about` 路由
  - [ ] 顶部 sticky 导航:三个锚点按钮 `#differentiation` / `#onchain` / `#roadmap`,当前 section 高亮
  - [ ] 单页长滚动布局,平滑滚动(CSS `scroll-behavior: smooth`)
- [ ] **T2(AC1):9 条 "vs X" 对比手风琴**
  - [ ] `src/core/components/about/VsCompareAccordion.tsx` — Accordion 组件,每条一个 item
  - [ ] 数据源 `src/core/constants/vsCompareData.ts` — 9 条对比的 `{target, oneLiner, detail}` 静态数据(内容见 AC1)
  - [ ] 每条展开 ≥ 100 字详细说明,引用具体 FR / AR 支持
  - [ ] 键盘可达:`Tab` 聚焦 / `Enter` 展开 / `Esc` 折叠
  - [ ] 复用 Story 6.2 的 `QuadrantChart` 组件置于 section 底部
- [ ] **T3(AC2):0G 链上证据区**
  - [ ] `src/core/components/about/OnChainEvidence.tsx` — 读取 `src/core/constants/evidenceCids.ts`(至少 1 条真实 CID 提前 hackathon demo 前准备好)
  - [ ] 每条 CID 卡片包含:模板名 / CID 短 hash(复制按钮)/ Merkle Root / 归档时间 / author_lineage / "View on 0G Explorer" 外链按钮
  - [ ] 外链 URL:`https://explorer.0g.ai/tx/{cid}` 或 0G 文档指定的正确格式(按 `.0g-skills/patterns/NETWORK_CONFIG.md` 校验)
  - [ ] CID **必须真实可验证**,非 placeholder(AR32);提交前在 0G Explorer 手工点一遍确认可访问
- [ ] **T4(AC3):Roadmap 时间线**
  - [ ] `src/core/components/about/RoadmapTimeline.tsx` — 三阶段可视化(左右或上下时间轴)
  - [ ] Phase 1 打勾 ✅,Phase 2 / 3 用 "Next" / "Future" 标签
  - [ ] 每阶段含:里程碑名称 + 预计时间 + 核心能力 3-5 条
- [ ] **T5(AC3):学术背书区**
  - [ ] `src/core/components/about/AcademicCitations.tsx` — 5 条论文卡片
  - [ ] 每条:论文标题 + 作者 + 年份 + arXiv / DOI 外链 + 一句话"如何启发 ShadowFlow"
  - [ ] 论文清单见 AC3 底部(NMN / Voyager / WorkTeam / Neural Bandit / PaperOrchestra)
  - [ ] 链接从 `docs/plans/spontaneous-assembly/papers.md` 或 `docs/plans/academic-foundation-and-roadmap-v1.md` 引用真实 URL
- [ ] **T6(测试)**
  - [ ] 9 条 "vs X" 问答可点性冒烟:Playwright 遍历每条,断言点击后 detail 内容可见
  - [ ] 0G Explorer 外链真实性:手工 + CI smoke test 各点一次,返回 200 / Explorer 页面标题含 CID
  - [ ] Lighthouse Accessibility ≥ 90(AC1 键盘可达是硬要求)
  - [ ] 浏览器兼容:Chrome/Edge/Arc ≥ 120、Firefox ≥ 120、Safari 17+
  - [ ] README 同步更新(AR33/40):Quick Start + 6 模板说明 + 链上证据段落 + Phase 2/3 路线图;与 AboutPage 内容保持一致(避免站内站外叙事不一致)

## Dev Notes

### 架构依据
- **Epic 6 Goal**:前 5 个 Epic 的能力织成完整 5 分钟评委叙事;AboutPage 是 J5 路演 2:30-4:30 "技术背书"阶段的内容支撑,决定评委是否相信 ShadowFlow 不是又一个 LLM wrapper。
- **相关 AR**:AR31(9 条 vs X 问答)、AR32(真实可验证 CID)、AR33(README 与站点统一叙事)、AR40(路演叙事金线)
- **相关 FR**:FR40(底部三入口对比页面)
- **相关 NFR**:A1(WCAG AA basic)、P1(首屏 ≤ 2s)

### 涉及文件
- 前端页面:`src/pages/AboutPage.tsx`(`/about` 路由)
- 组件:
  - `src/core/components/about/VsCompareAccordion.tsx`
  - `src/core/components/about/OnChainEvidence.tsx`
  - `src/core/components/about/RoadmapTimeline.tsx`
  - `src/core/components/about/AcademicCitations.tsx`
  - 复用 `src/core/components/landing/QuadrantChart.tsx`(Story 6.2)
- 常量:
  - `src/core/constants/vsCompareData.ts`(9 条对比数据)
  - `src/core/constants/evidenceCids.ts`(真实 CID 列表)
  - `src/core/constants/academicPapers.ts`(5 条论文)
- 文档:`README.md` 同步(AR33/40)

### 关键约束
- **9 条 "vs X" 问答 100% 可点展开**(PRD Measurable Outcomes):这是硬指标,CI smoke test 必须覆盖每一条的展开交互,否则不得合并。
- **0G Explorer 外链必须真实可验证**(AR32):禁止 placeholder CID;提交 PR 前手工 + CI 各验证一次 Explorer 链接 200 返回。评委一旦点到 404 会直接判定"链上集成是假的",整个路演崩盘。
- **对标清单固定 9 个**:**ChatGPT / Cherry / N8N / LangGraph / AutoGen / CrewAI / Edict / AIverse / Dify** —— 顺序与命名以 AC1 为准,变更须同步 AR31 与路演脚本。
- **Roadmap 三阶段固定**:Phase 1 MVP ✅ / Phase 2 Sidecar / Phase 3 INFT Marketplace —— 三阶段顺序与标签固定,AR40 路演金线依赖此。
- **5 条学术背书**:NMN / Voyager / WorkTeam / Neural Bandit / PaperOrchestra —— 固定 5 条,每条需真实论文链接(arXiv 或 DOI),不得用 placeholder。
- **WCAG 2.1 AA basic**(A1):Accordion 必须键盘可达(Tab/Enter/Esc),色差 ≥ 4.5:1,语义标签 `<section>` / `<h2>` / `<button aria-expanded>`。
- **Lighthouse Accessibility ≥ 90**(Sprint-1 backlog 但本 Story 建议 AC 加):本页是 WCAG 合规展示橱窗,不能低于 90。
- **README 同步更新**(AR33/40):站内 AboutPage 与站外 README 叙事一致,评委从 GitHub README 跳到站点,语境不能跳断。

### 测试标准
- Playwright E2E 覆盖 J5 评委 5 分钟叙事 2:30-4:30:Editor → 底部入口 → AboutPage → 手工展开 3 条 vs X → 点击 Explorer 外链返回 200
- 9 条 "vs X" 问答可点性冒烟(遍历全部 9 条)
- 0G Explorer 外链 200 响应冒烟(CI 每日跑一次,CID 失效即告警)
- Lighthouse Accessibility ≥ 90(全页)
- 浏览器兼容:Chrome/Edge/Arc ≥ 120、Firefox ≥ 120、Safari 17+
- README diff 检查:PR 若改动 AboutPage 内容但未同步 README,CI 提醒(非强制 fail)

## References

- [Source: epics.md#Story 6.4]
- [Source: prd.md#FR40](底部三入口对比页面)
- [Source: prd.md#Web App Specific Requirements](WCAG / OG meta)
- [Source: architecture.md#Frontend Architecture](Routing `/about`)
- [Source: _bmad-output/planning-artifacts/shadowflow-product-brief.md#差异化对比]
- [Source: docs/plans/academic-foundation-and-roadmap-v1.md](5 条论文引用)

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
