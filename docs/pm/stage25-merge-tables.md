# 阶段 2.5 完整版 — 双向合并表（存档）

> 2026-08-16 产出。依据：.tmp/clawsgo-clone/ 三页 + assets 4 图 + .tmp/clawsgo-frames/ 28 帧全量盘点；
> ShadowFlow 侧依据 src/neo/、src/pages/、src/api/、server/src/routes/ 全量盘点。
> 合并总原则：复刻给形态（布局/交互/视觉），ShadowFlow 能力给内容；能力优先于删除。

## 全局视觉 token（复刻实测，UI5.0 对齐基准）

rail #F3F3F3 / 面板 #FDFDFD / host #FFF / hairline #ECECEA；文字四级 #0A0A0A·#52525B·#737373·#A1A1AA；
accent 近黑 #171717；完成绿 #30C093；链接 teal #0F766E；文档角块薰衣草 #7F88AD；选中行 #E9E9E7。
圆角 行10/卡14/composer 16-20/胶囊999；唯一浮层阴影 0 4px 24px rgba(0,0,0,.06)。
字号 30 hero / 19 md-h2 / 13 正文 / 12.5 列表行 / 11 副标耗时；耗时一律 tabular-nums。
hover 一律 2-5% 黑透明度极轻反馈；图标 lucide 风 stroke 1.75。

## 表 A：复刻搬入表

| # | 区块/元素 | 出处 | 交互行为 | ShadowFlow 对应能力与端点 | 处置 |
|---|---|---|---|---|---|
| A1 | rail 工作区头（渐变logo+名+套餐胶囊+切换） | home.html/a_001 | 切换工作区 | workspaceStore | 映射（去掉 Basic 套餐胶囊=商业化） |
| A2 | 主导航行（新任务/知识库/搜索） | home.html | 导航 | 已有 | 已有✅ |
| A3 | 分组 label（项目/任务）+ 新建项目行 | home.html | 折叠分组 | POST /api/projects 存在但 Neo 无项目概念 | 占位→GAP |
| A4 | Agents 折叠组 + 会话子项 + 相对时间戳「1m」 | a_019/a_020 | 折叠/选中 | useInboxStore | 映射（会话行补相对时间） |
| A5 | 邀请卡 | home/a_019 | — | 无后端（用户已拍板占位） | 已有占位✅（GAP 在案） |
| A6 | 用户卡 + 设置 gear | home/a_019 | 进设置 | auth/me | 已有✅ |
| A7 | 顶栏算力胶囊 ✦1,500 | home/a_001 | — | 无（商业化） | 删除 |
| A8 | hero 时段问候 30/500 | home | — | — | 已有✅ |
| A9 | hero 标题动词轮播 | a_003/a_004 | 自动轮播 | 纯前端 | 映射 |
| A10 | 分类 tab 胶囊组 | home | 切换模板卡 | skills category | 已有✅ |
| A11 | 模板卡无边框 + 108px 真实缩略图 | home + assets×4 | 点击预填 prompt | GET /api/skills cover_url | 已有✅（cover_url 透传已接） |
| A12 | 模板卡 hover 白卡浮起 | a_004 | hover | — | 映射（校验对齐） |
| A13 | composer 全形态（r20/浮层阴影/黑圆发送钮） | home | — | — | 已有✅ |
| A14 | 创建 Agent 模态（命名表单+提交中态） | a_002 | 创建 | POST /api/agents 真实存在 | 映射（2×2 营销特性格删除） |
| A15 | 配额上限提示卡 | a_003 | — | 无（商业化） | 删除 |
| A16 | 执行深度菜单（轻量/常规推荐/复杂/研究级） | a_007 | 切换档位 | mode Auto/Single/Team | 已有等价✅ |
| A17 | 空间 segmented 个人/团队 | a_001/a_019 | 切换 | PersonalTeamToggle | 已有✅ |
| A18 | 用户气泡右对齐灰底 r14 | running | — | — | 已有✅ |
| A19 | agent 头 ✳+名+总耗时 live 递增 | running/a_010 | — | — | 已有✅ |
| A20 | 操作折叠组「执行了 N 个操作 ⌄」计数累加 | a_008/b_002 | 折叠整组 | step_panel | 已有✅（NeoStepPanel） |
| A21 | op 行（图标+标题+chevron+耗时 tabular 右对齐） | running | 按类型决定是否可展开 | — | 已有✅ |
| A22 | op 行 running 态耗时 live 秒表递增 | a_019→a_020 | — | — | 映射 |
| A23 | op 行 running 态整行灰化（图标+标题降 fg-4） | running | — | — | 映射（校验覆盖到图标） |
| A24 | 深度思考展开（灰字段落、缩进对齐标题起点） | a_013/b_002 | chevron 折叠 | thinking kind | 已有✅ |
| A25 | 搜索行展开 → 结果列表（下划线链接+灰域名） | a_014 | 展开 | tool_call links/tool_echo | 映射（校验结果列表形态） |
| A26 | 吸底进度胶囊（spinner+当前动作+0/6+⌄） | running/a_009 | 点击展开子任务清单 | pill | 映射（补 x/y 点击展开明细） |
| A27 | 发送钮 ↔ 停止钮原位切换 | a_005 | 停止=abort | abort 端点 | 已有✅ |
| A28 | 回到底部浮钮（上滚浮现） | a_015 | 点击回底 | 纯前端 | 映射 |
| A29 | 刚提交空态（首帧前纯留白，不渲染占位行） | a_005 | — | — | 已有✅（校验） |
| A30 | 会话 composer placeholder「给 X 发消息」 | a_005 | — | — | 已有等价✅ |
| A31 | 右栏 tab 系统（可关×/+新建/面板级×） | b_001/a_015 | 切 tab 状态保留 | NeoHost tab | 已有✅（产物 tab 可关；面板折叠有；+ 维持占位） |
| A32 | 4 宫格 caps（工作空间/PPT/画布/密钥） | a_006/a_011 | 开对应 tab | 仅工作空间有 | 工作空间已有✅；PPT/画布/密钥删除（竞品特有，无后端无承接） |
| A33 | 工作空间文件树 + 工具钮（上传/新建文件/刷新） | a_008/b_007 | 文件管理 | fs list/read/raw 有；write/upload 无 | 刷新/换目录已有✅；上传/新建文件→GAP |
| A34 | 预览空态「在左侧选择文件以查看内容」 | a_008 | — | — | 已有等价✅ |
| A35 | filecard（薰衣草角块+名+副标+右操作排） | done/b_001 | 打开/刷新/下载/关闭 | artifact 端点 | 已有✅；补「复制内容」纯前端钮→映射；置顶/收藏→GAP 已登记 |
| A36 | 预览/源码切换 | done/b_005/b_006 | 互斥切换 | — | 已有✅（seg 形态） |
| A37 | 源码视图深色+行号 | b_006 | — | — | 已有✅；md 语法高亮删除（成本/收益低，等宽深色已够） |
| A38 | 大纲 210px + scroll-spy 联动 | done/b_003/b_008 | 点击定位+滚动高亮 | extractOutline | 已有✅ |
| A39 | markdown 正文（h2 19/700、ol counter、teal 链接、表格、脚注） | done | — | NeoMarkdown | 已有✅ |
| A40 | 黑色 tooltip（hover 黑底白字小胶囊） | b_005/b_006/a_009 | hover 即显 | 纯前端 | 映射（统一 tooltip 机制） |
| A41 | 右栏内容加载 spinner 骨架（header 先渲染） | b_005/b_007 | — | — | 已有✅（校验 md 加载态） |
| A42 | 完成行 sticky「已完成全部任务 6/6 ⌄」 | b_001 | 点击再展开/收起操作列表 | pill 完成态 | 已有✅（点击行为校验） |
| A43 | 聊天内嵌产物 filecard +「打开」胶囊钮 | b_001 | 右栏开产物 tab | artifact_card kind | 已有✅（形态校验） |
| A44 | 👍👎 反馈行 + 相对时间戳 | b_001 | 反馈 | 无后端 | 占位→GAP |
| A45 | PPT 5 步向导 | a_017 | — | 无（竞品特有） | 删除 |
| A46 | 密钥（环境变量）页 | a_016 | — | MCP provider env 表单在设置页承接 | 删除（能力已由设置页承接） |
| A47 | 画布空态+生成 CTA | a_012 | — | web_preview 卡部分承接 | 删除（竞品特有） |
| A48 | 右栏多 tab 并存状态保留 | a_010 | tab 来回切 | — | 已有✅（校验） |

## 表 B：ShadowFlow 保留表

| # | 能力 | 现状位置 | 价值 | 新壳承接位置 | 状态 |
|---|---|---|---|---|---|
| B1 | 群聊现场（统一时间线+富卡+说话即派活） | NeoGroupChat /group/:groupId | 差异化五样之一，竞品无 | /group/:groupId + 单聊顶栏跳转 | 重做（用户指定：实现质量不行，按新壳形态重做：消息时间戳/日分隔/成员露出/视觉打磨，复用 NeoTimeline） |
| B2 | Loop 引擎 verifier 收敛视角 | NeoRunInline 徽标行 + NeoHost Loop tab | 差异化五样之一 | 已接✅ | 保留原实现 |
| B3 | LoopEnginePage 看板（/loop-engine） | src/pages/LoopEnginePage.tsx | 跨 run 的循环总览+终止 | rail 用户卡 Loop 入口 | 重做（旧深色 Tailwind 风→Neo 化；修点卡跳 /runs/:id 死链→/?run=） |
| B4 | runs 投影 graph + task-tree | ProcessView（过程 tab） | 差异化五样之一 | 已接✅ | 保留原实现 |
| B5 | runs 投影 artifact-lineage + checkpoint-lineage | ArtifactsView（产物 tab） | 差异化五样之一 | 已接✅ | 保留原实现 |
| B6 | 编队 roster + workflow DAG + policy + per-node 输出 | TeamPanel（编队 tab） | 差异化五样之一 | 已接✅ | 保留原实现 |
| B7 | worktree 隔离协作闭环（plan_card/commit_record/table_panel 合并结果） | NeoTimeline 富卡 + 群聊现场 | 差异化五样之一，竞品无 | 群聊现场 + 单聊跳转 | 保留原实现（B1 重做时保持富卡渲染） |
| B8 | i18n 中英双语 | useI18n + locales/{en,zh}.json | 全壳覆盖 | — | Neo 化补强（neo.* defaultValue 兜底 key 全量入库） |
| B9 | 知识库（Pack CRUD/轮询/reindex/Memory 统计条） | KnowledgePage /knowledge | Story 9.1 核心 | rail 知识库行 | 保留原实现（2.5 已 Neo 化） |
| B10 | 知识包挂载 | NeoComposer KNOWLEDGE chip | 挂载进 run | 已接✅ | 保留原实现 |
| B11 | 模型选择/BYOK（CLI+API 双组） | NeoModelPicker + 设置 ByokSection | 执行核心 | composer | 保留原实现 |
| B12 | Skill 导入（URL 识别/装并用/picker） | NeoComposer 内 | 差异化能力 | composer | 保留原实现 |
| B13 | @ 提及 / / 斜杠命令（含编译徽章） | NeoCommandMenu | 效率核心 | composer | 保留原实现 |
| B14 | 会话列表/未读/搜索 | NeoRail 会话区 | 导航核心 | 已接✅ | 保留原实现（A4 补相对时间） |
| B15 | 消息行内编辑（PATCH 持久化） | NeoTimeline NeoAssistantText | Polynoia 对齐 | 已接✅ | 保留原实现 |
| B16 | 消息复制（assistant_text） | 无 | 基础操作 | NeoTimeline | 映射（新增 hover 复制钮，纯前端） |
| B17 | CLI 工作目录选择 | NeoDirPicker | 执行核心 | composer | 保留原实现 |
| B18 | 三栏壳/折叠记忆 | NeoApp + neo.css | 布局骨架 | — | 保留原实现 |
| B19 | 右栏工作空间（文件树/搜索/预览/下载） | NeoHost workspace tab | 主机核心 | 已接✅ | 保留原实现 |
| B20 | 产物预览（大纲 scroll-spy/iframe/导出 PDF/MD/ZIP） | NeoArtifactPreview | 主机核心 | 已接✅ | 保留原实现 |
| B21 | run 会话生命周期（多轮接力/abort/retry/回放） | useRunSession + runSessions.ts | 执行核心 | 已接✅ | 保留原实现 |
| B22 | 错误卡 6 桶分类 + 重试/中止 | NeoChat neo-error-card | 韧性核心 | 已接✅ | 保留原实现 |
| B23 | 中断标记 + 底部 pill | NeoRunInline | 状态核心 | 已接✅ | 保留原实现 |
| B24 | 空态首页（hero+模板画廊） | NeoChat + StartGallery | 入口 | 已接✅ | 保留原实现（A9/A12 增强） |
| B25 | 个人/团队切换 | PersonalTeamToggle | 空间核心 | rail | 保留原实现 |
| B26 | 认证（钱包/guest）+ 用户卡 | AuthContext + NeoRail 用户卡 | 账户 | rail | 保留原实现 |
| B27 | Agent CRUD 端点 | api/agents.ts | 建 agent 能力存在但 Neo 无入口 | rail 新建入口+模态 | 重做入口（接 A14） |
| B28 | Team DAG 编辑端点（PUT dag/validate） | api/teams.ts | 编排编辑 | 无 UI | 占位→GAP（大功能，待评审） |
| B29 | Skills 管理面板（catalog/enable/delete） | SettingsPage SkillsCatalogTab | 管理 | 设置页 | 保留原实现（设置页 Neo 化留阶段 3） |
| B30 | 设置总壳 17 section | SettingsPage /settings | 配置中枢 | rail gear | 保留原实现（Hi-Fi 壳，Neo 化留阶段 3） |
| B31 | MCP 工具提供商 | SettingsPage ToolProvidersTab | 扩展 | 设置页 | 保留原实现 |
| B32 | 记忆（River Memory profiles/writeback/条目） | 设置 MemorySection + 统计条 | 记忆体系 | 设置页+知识库 | 保留原实现 |
| B33 | 本地 CLI 探测管理 | LocalCLISection | 执行底座 | 设置页+picker | 保留原实现 |
| B34 | ACP 远端 agent 探测 | AcpAgentsPanel | 扩展 | 设置页 | 保留原实现 |
| B35 | 导出（PDF/MD/ZIP） | api/export.ts | 交付 | 产物预览 | 保留原实现 |
| B36 | Python 后端宕机横幅 | usePythonBackendStatus/PythonBackendBanner（旧组件） | 韧性提示 | NeoApp 顶部 | Neo 化（重写为 Neo 横幅挂载新壳，不 import 旧渲染组件） |
| B37 | PagePeekOverlay（iframe 弹层） | pages/chat-home/PagePeekOverlay.tsx | 源路由已 redirect，实际不可用 | — | 删除（死代码） |
| B38 | 群消息 pin/reactions 端点 | server groups 路由 | 群协作增强 | 群聊现场 | 占位→GAP |
| B39 | 历史 runs 视图 | 无（/runs 已下架，两处死链） | 回溯 | — | 占位→GAP（B3 先修死链） |
| B40 | memory-graph / training-dataset 投影 UI | api/runs.ts 已封装 | 投影完整性 | 无 UI | 占位→GAP |

## 冲突处理记录

- A32「密钥」删除 vs 设置页 MCP env 表单 → 能力已由 B31 承接，维持删除（不冲突）。
- A44 👍👎 反馈删除倾向 vs 无对应能力 → 非能力冲突，进 GAP 占位。
- A37 md 语法高亮删除 vs B20 产物预览能力 → 预览能力不依赖语法高亮，维持删除。
- B37 PagePeekOverlay 删除：无能力损失（路由已下架）。
- 其余无「删除 vs 能力保留」冲突。
