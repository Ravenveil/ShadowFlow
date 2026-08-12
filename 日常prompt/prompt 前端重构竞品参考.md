 /goal 组建智能体团队，去进行前后端的改造。不开分支，
  在main进行。其中一个agent负责检查。进行多轮，直到agen
  t的使用体验接近hermes：https://github.com/fathah/hermes-desktop
  能够在右侧侧边栏打开项目文件，在这个选中的工作区中工作
  前端效果接近clawsgo："D:\Users\jy\Videos\badicam\claws   go任务完成.mp4""D:\Users\jy\Videos\badicam\clawsgo.mp4   "
目前的想法是有三栏。左边选agent或者切换到团队、中间聊天、右侧看项目文件等

团队：                                                                                    ─────────────────────

clawsgo：
![tmpA1B7.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5CtmpA1B7.png)
![tmpD82A.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5CtmpD82A.png)
hermes：
![tmp8E9A.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp8E9A.png)
![tmpA0D8.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5CtmpA0D8.png)
![tmpD416.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5CtmpD416.png)
cherry：
![tmp921.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp921.png)以及coze：
![tmp7FC3.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp7FC3.png)
![tmp41E.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp41E.png)
![tmp19C7.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp19C7.png)

---

# 竞品参考分析（补充 · 2026-06-24）

> Claude 基于以上截图 + clawsgo 两段录屏 + hermes-desktop 仓库 README 整理。
> 目标：为 ShadowFlow **三栏重构** 提供可落地对标。重点对标 **clawsgo（前端观感）** + **hermes（Agent 体验）**。
> 用户最新指令：**自主跑 ≥5 轮、中途不问**；**缺失的组件要补齐**；**动画要跟上**。

## 0. 目标布局：三栏（用户构想 = 四竞品共识）

```
┌────────────────┬──────────────────────────┬────────────────────────┐
│ 左栏 Agent/团队   │ 中栏 聊天 / 任务执行          │ 右栏 项目文件 / 工作区       │
├────────────────┼──────────────────────────┼────────────────────────┤
│ · 选单 Agent      │ · 消息流(markdown/代码高亮)   │ · 项目文件树(可点开文件)      │
│ · 切换到团队       │ · 实时工具调用进度            │ · 选中文件→在工作区中编辑/查看 │
│ · 会话历史/搜索    │ · 底部 composer(技能/模型/附件)│ · 实时预览(网页/PPT/画布)     │
│ · 新建对话        │ · slash 命令 + token 用量     │ · 工作区 tab 切换 + 折叠      │
└────────────────┴──────────────────────────┴────────────────────────┘
```
左右栏可折叠；纯对话时中栏全宽（hermes 式 = 干净单 agent，已是现状方向）。
**右栏 = 项目文件树 + 选中工作区**（hermes 右=文件树 / coze 右=预览 / clawsgo 右=Agent工作区），是本次重构的核心新增。

## 1. clawsgo（前端观感 · 主对标）

- 左 导航（新任务/文件/搜索/Agents：创建Agent·我的第一个Agent，底部用户+套餐）｜ 中 hero+composer+模板 tab（学术/论文写作/商业/营销/编程/技术文档/设计/办公/深度调研）｜ 右「Agent 的主机」工作区（工作空间/PPT/画布/密钥磁贴，产物边跑边长出来、可预览）。
- 运行态：左步骤列表（名+进度+耗时+状态点）+ **工具调用展开（搜索词→结果→可点链接）**；右产物实时构建。
- 创建 Agent：品牌弹窗「你的常驻数字伙伴」+ 4 能力磁贴。
- 调性：纯白、软蓝 #1890FF / 绿、线性图标、大留白、**动效统一**（hover/弹窗淡入缩放/加载/标签切换平滑）。
- **取经**：模板墙、右工作区产物化、工具调用可视化、创建 Agent 仪式、**工作区/标签切换动效**。

## 2. hermes-desktop（Agent 体验 · 主对标）

- Electron+Vite+TS 桌面；本地优先、隐私、可观测。
- **布局（tmp8E9A/A0D8/D416）= 三栏**：左 **会话栏**（新建对话/生成式工具/团队助手/产物 + 关注内容：ShadowFlow 会话…）｜ 中 聊天/工作区（idle = "HERMES AGENT" splash + "Ask a question, paste an error, or point me at a repo. I can read code, run tests, and help you ship."）｜ 右 **项目文件树**（.obsidian/code-review-graph/config/data/docs/scripts/server/shadowflow/src/templates/tools/README.md/AGENTS.md/CLAUDE.md…）。
- 底部 composer：模型选择（GLM/Claude）+ **effort 档位（High…）** + 发送；slash 命令。
- 招牌：22 slash 命令、流式聊天 + **实时工具进度** + **底部 token 用量**、会话**全文搜索**、首次运行向导、SOUL.md 人格、多 Profile、cron、消息网关。
- **取经**：**右栏项目文件树（点开文件→工作区）**、左栏会话/团队双视图、底部 token 计数、slash 命令、会话全文搜索、effort 档位、首次运行向导。

## 3. cherry（极简聊天基线）

- 左 助手列表（助手/话题双 tab + 搜索）｜ 中 聊天（markdown/表格/引用/代码块）｜ 浅色极简、留白足。
- 底部 composer：工具图标 + 回车发送。
- **取经**：左栏「助手/话题」双 tab、干净 markdown 排版、克制浅色（勿过度装饰）。

## 4. coze（扣子编程 · 三栏+实时预览范本）

- 首屏（tmp7FC3）：左 图标 rail ｜ 中 hero「从想法到实现」+ 4 大卡（网页/移动/小程序/技能）｜ 底部 composer（技能(23)+Auto 模型+麦克风）｜ 左下 token 余额。
- **工作态（tmp41E）= 三栏教科书**：左 会话/项目 ｜ 中 **文件树+代码视图+底部「一句话修改」聊天** ｜ 右 **实时预览**（真实运行的游戏，顶部 预览/代码 切换 + 响应式/刷新）。
- 多 Agent（tmp19C7）：左 Agent rail（产品/写作 Agent…）｜ 中 **群聊式多 Agent 对话**（角色逐条发言）｜ 右 移动端预览。← 对应「切换到团队」。
- **取经**：右栏**实时预览 + 预览/代码切换**、中栏「文件树+代码+聊天」一体、**群聊式多 Agent 协作视图**、底部 token 余额。

## 5. 横向对比

| 维度 | clawsgo | hermes | cherry | coze | ShadowFlow |
|---|---|---|---|---|---|
| 左栏 | 导航+Agents | 会话+团队 | 助手/话题 | 会话/Agent | → Agent/团队选择切换 |
| 中栏 | hero+composer | 聊天(repo) | 聊天 | 文件+代码+聊天 | 聊天+run-session |
| 右栏 | Agent工作区 | **项目文件树** | — | **实时预览** | RightPaneTabs |
| 工具调用 | ✓强 | ✓ | 弱 | ✓ | ✓ R1已加 |
| token计数 | 余额 | ✓底部 | 有 | ✓余额 | 缺中栏底部 |
| 模板墙 | ✓ | — | — | ✓ | ✓ R1已加 |
| 创建Agent仪式 | ✓ | 向导 | — | — | ✓ R1已加 |
| 多Agent团队视图 | — | Agents | — | ✓群聊式 | Blueprint，缺群聊式 |
| 实时预览 | 产物 | — | — | ✓✓ | PreviewPanel雏形 |
| 文件树工作区 | 文件 | ✓✓ | — | ✓ | **缺** |
| 切换动效 | ✓✓ | ✓ | 一般 | ✓ | R1有sf-*层，待落地 |

## 6. 缺失组件清单（要新建的 —— 用户重点）

按「缺的组件要补、动画要跟上」逐项，**重点对标 clawsgo+hermes**：

1. **三栏 AppShell**（新）：`ThreeColumnShell` —— 左/中/右栏 + 可折叠分隔条 + 列宽记忆(localStorage) + 折叠/展开动画。
2. **左栏 AgentTeamRail**（新）：单 Agent 列表 + 「切换到团队」段 + 会话历史 + 搜索 + 新建对话；选中高亮 + 切换滑动指示（clawsgo/cherry）。
3. **右栏 ProjectFileTree**（新 · hermes 核心）：项目文件树（懒加载/展开折叠/图标/搜索），**点击文件→在中/右工作区打开**。后端需文件列举+读取 API（Express 已有目录浏览雏形，见近期 commit「文件tab打开项目文件夹」）。
4. **WorkspaceTabs / FileViewer**（新 · coze）：选中文件在工作区打开，**预览/代码 切换**，多文件 tab，关闭/切换动画；网页类产物**实时预览 iframe**。
5. **工作区切换动效**（clawsgo 招牌）：工作空间/文件/预览 tab 之间平滑过渡（滑动下划线 + 内容淡入/横滑），复用 R1 的 sf-anim-* / sf-bar。
6. **GroupChatTeamView**（新 · coze）：团队态群聊式多 Agent 视图，角色头像+逐条发言+打字态，区别于 BlueprintCanvas 的图视图。
7. **ComposerTokenMeter**（新 · hermes/coze）：中栏底部实时 token 用量/余额条（sf-bar）。
8. **SlashCommandMenu 扩展**（hermes）：补齐 slash 命令体系（/new /clear /web /code…）与提示浮层。
9. **SessionSearch**（hermes）：会话全文搜索（左栏）。
10. **动画统一**：所有新组件接入 R1 的 sf-anim-fade/slide-up/scale-in/pulse、sf-hoverable/press/focus-ring、sf-bar、sf-empty、sf-scroll；clawsgo 级 hover/弹窗/加载/切换一致性。

## 7. 进度

- **R1 已落 main**：工具调用可视化 / 右侧工作区面板升级 / 创建Agent+模板墙 / 全局 sf-* 动效层。
- **R2 进行中**：roster 接线 / 多 agent 工具调用 / 创建Agent自动起跑 / 模板高亮 / sf-* 采纳 / 紫→蓝配色收敛。
- **R3+ 计划（自主 ≥5 轮）**：三栏 AppShell + 左栏 AgentTeamRail + **右栏 ProjectFileTree → 工作区打开文件** + WorkspaceTabs/实时预览 + 工作区切换动效 + 群聊式团队视图 + 底部 token 条 + slash/搜索；每轮 reviewer 跑 tsc + 对标 clawsgo/hermes 打分，循环至收敛。
