# UI 5.0 重构总结 — 全站对标 clawsgo / WorkBuddy / Codex（ui5.0）

> 日期：2026-08-14 · 方式：9 工位 agent swarm 并行重构 + 基线对拍验证 · 验证：vite build 通过、全量 vitest 994 过 / 26 失败（26 个失败经 HEAD worktree 对拍确认全部为基线遗留，零新增）

## 设计方向

延续 UI4.0 的 clawsgo 实测 DNA 并全站贯彻：纯白底 + `#f5f5f5` 灰阶 + `#e5e5e5` 边框、文字 `#0a0a0a`/`#737373`、主按钮近黑 `#171717`、accent 蓝 `#1447e6` 克制使用、圆角 10/14/18/26、Inter Variable 字体、动效 120–280ms ease-out/spring。**紫色（#A855F7/#A78BFA/#7c3aed 等）全站清零**。

## 分工与落地（9 工位）

| 工位 | 范围 | 关键产出 |
|---|---|---|
| 设计基座 | `index.css`、`tailwind.config.ts`、`index.html` | `/* ===== UI5.0 ===== */` 层：day 令牌二次校准（纯白底/neutral 灰/蓝 glow）、Inter Variable 引入、sf.* 紫令牌→蓝 |
| 应用外壳 | `hifi/*` + 全局 modal/picker | 新建 `ui5shell.css`（`.ui50-overlay/pop/modal/menu/pri/ibtn`），弹层统一淡入缩放+软阴影+遮罩微模糊，折叠动画 spring 化 |
| 聊天主页 | `ChatHomePage` + `pages/chat-home/*` | 新建 `ui50-chat-home.css`：侧栏选中态灰底黑字（蓝只留指示条）、composer 胶囊化、模板卡 hover 中性浮起 |
| 会话 Composer | `chat-fb/*`、`chat/*`、`composer/*`、AgentDMPage | `chatFB.module.css` UI5.0 块：工具调用卡族（查询词→结果→可点链接）、代码块圆角+CodeBlockToolbar、typing dots、hover 工具条毛玻璃 |
| 执行会话 | `RunSessionPage` + `run-session/*` | 14 处去紫、SkillSection 6 态 pill 重校准（tint 底+30% 描边）、Blueprint 节点蓝化、「开始执行」走近黑主按钮 |
| 页面批A | Agents/Teams/Inbox/Runs | 新建 `ui5-pages.module.css`（`.priBtn/.overlayIn/.drawerIn/.rowHover`）、状态 chip 中性化（彩色只留状态点）、RunsPage 暗色硬编码全令牌化 |
| 页面批B | Projects/Calendar/Memory/Knowledge/Evals/Settings/Start | 页面标题统一 17px/700 + 描述 13px、卡片 12px+hover 微浮起、主按钮统一 `sf-btn-primary` |
| 页面批C | Landing/About/Workspace | Landing 21 处 rgba 紫→蓝、大标题去渐变改纯色 accent、`layout-ui5.css` 令牌化 |
| 紫色清零 | `core/components/**` + 常量文件 | 26 文件紫→蓝、35 文件暗色硬编码（white/*、rgba(255,255,255)）→ `--t-*` 令牌，day 主题可读性修复 |

## 备份与回退

- 开工前备份：`_handoff_tmp/src-backup-pre-ui5/`（整个 src 快照）、`_handoff_tmp/index.css.bak-pre-ui5`、`_handoff_tmp/tailwind.config.ts.bak-pre-ui5`、`_handoff_tmp/pre-ui5-uncommitted.patch`（当时未提交改动）
- CSS 全部 append-only 标记块（`/* ===== UI5.0 ===== */`），视觉回退 = 删块/删新 CSS 文件 + 移除对应 import

## 验证

- `npm run build`：通过（8.74s）
- 全量 `vitest run`：994 过 / 26 失败 —— 用 git worktree 对 HEAD 基线跑同一批失败文件，失败数完全一致（26），**UI5.0 零新增红**
- 各工位 scoped vitest 全绿（chat-home 24、chat-fb 55、run-session 88、批A 45、core 419 等）
- 实机截图走查（dev :3007）：/chat（团队+个人）、/agents、/projects、/calendar、/settings、/ 落地页、night 主题——均符合 clawsgo DNA；「加载失败/Failed to fetch」为后端未启动的预期空态（不 mock 原则）

## 遗留（下一轮）

- 基线遗留 26 红：skill-studio-entries（卡片已移除需产品决策）、ChatPage.test jsdom scrollTo polyfill、ApiKeySettings/GenerationSettings 数据层与断言脱节、AppRoutes/CatalogPage/PolicyMatrixPanel/RoleProfilePanel/zerogStorage
- `HfSidebar.tsx` 实为死代码（线上导航是 `ChatRailChrome`），本轮回保值精修，可考虑退役
- composer 内模型选择器与 DM 头部选择器胶囊语言可再统一
- `core/components/settings/*` legacy section 与 `RegressionReportPanel` 可再精修
- RunSessionPage 实机走查需起后端 + 真实 session
