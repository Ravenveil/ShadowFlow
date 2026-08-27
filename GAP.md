# GAP — Neo 前端对标竞品的能力缺口

> 格式：`UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照`

| UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照（ClawsGo/Coze/Kimi/WorkBuddy 怎么做） |
|---|---|---|---|
| ~~左栏「知识库」导航行~~（已解决 2026-08-15） | 复用既有 `KnowledgePage`（Story 9.1，真实 GET /knowledge/packs）挂 `/knowledge` 路由，NeoRail 行改为 `<Link>` 跳转；遗留：该页视觉仍是旧体系样式，Neo 化归阶段 3 | — | ClawsGo home 左栏一级导航「知识库」 |
| 左栏底部邀请/说明卡（NeoRail `.neo-invite`） | 邀请协作者后端（邀请链接生成、被邀请人入职、可选算力/积分奖励）。**决策（2026-08-15 用户拍板）：保持信息卡占位，阶段 3 后再评估，不做真后端** | （暂缓）`POST /api/workspaces/{id}/invites` → `{ inviteUrl, expiresAt }` | ClawsGo 左栏底部「邀请好友得算力」卡；Coze 积分/福利条同位置 |
| ~~聊天内 RAG 引用/grounding 展示~~（已解决 2026-08-22） | `POST /api/knowledge/packs/{id}/query` 已落地（LightRAG query 透出，无命中/未配置返回空 hits）；前端 `KnowledgeCitations` 组件挂单聊消息底部。遗留：命中为合成答案单条 hit，多片段检索待扩展 adapter | `POST /api/knowledge/packs/{id}/query` → `{ hits: [{ text, source, score }] }` | Coze 回答内嵌知识库引用角标；Kimi 回答底部「参考来源」列表 |
| ~~verifier 面板（轮次打分依据）~~（已解决 2026-08-22） | `GET /api/runs/{id}/loops/{loop_id}/verdicts` 已落地（透出 IterationRecord 的 score/rationale/claims，无需新增存储）；前端 `LoopVerdicts` 面板挂 NeoHost 迭代环卡 | `GET /api/runs/{id}/loops/{loop_id}/verdicts` → `{ iteration, score, rationale, claims[] }` | ClawsGo 任务详情页展示每步检查结论；WorkBuddy 收敛过程列出验证意见 |
| ~~Loop 实时性~~（已解决 2026-08-22） | `GET /api/runs/{id}/loops/stream` SSE 已落地（snapshot 首帧 + 增量帧 + Last-Event-ID 续传）；前端 NeoRunInline/NeoHost 优先 SSE、失败回落 5s 轮询 | `GET /api/runs/{id}/loops/stream` | ClawsGo 执行过程全量 SSE 推送，无轮询 |
| ~~产物 tab 直链预览~~（已解决 2026-08-22） | artifact 节点 metadata 落 `preview_url` + `uri_scheme`（scheme 契约已在 service.py docstring 文档化：memory:// / file:// / http(s):// / writeback）；前端 ArtifactsView 按 preview_url > uri > 文件名匹配回落 | artifact 节点落 `preview_url` 字段 | Coze 产物列表点击即预览，无需猜测地址 |
| ~~「过程」tab 对 Node 侧 run~~（已解决 2026-08-22） | Node 网关自实现等价投影：`GET /api/runs/:runId/graph` 与 `/task-tree` 对 daemon run 返回 200（runBus 事件日志折叠，含重启后磁盘 hydrate）；未命中落回 Python。遗留：artifact-lineage 等其余投影对 daemon run 仍 404 | （已实现，Node 侧方案二） | — |
| ~~产物 filecard「置顶/收藏」（阶段 2.5 发现）~~（已解决 2026-08-23） | `POST /api/artifacts/{id}/pin`（toggle，独立仓 .shadowflow/artifacts/artifact_pins.json）已落地；ArtifactsView filecard 加置顶图标、置顶项排前 | `POST /api/artifacts/{id}/pin` | ClawsGo done 页 filecard 右侧有置顶/收藏图标 |
| ~~产物 filecard 副标题（阶段 2.5 发现）~~（已解决 2026-08-23） | artifact 写入时落 `metadata.summary`（首 120 字符纯文本摘要，不调 LLM）；filecard 副标题 summary 优先、缺失回落 `类型 · 状态` | （如需）artifact 节点落 `summary` 字段 | ClawsGo done 页 filecard 副标题为内容描述 |
| 完成态「后续建议区」（阶段 2.5 发现） | done.html 本身无此区块，后端 RunRecord / lineage 投影均无 suggestions 字段，未渲染 | （如需）`GET /api/runs/{id}/suggestions` | —（复刻页亦无，仅原需求提到） |

## 阶段 2.5 完整版新增（2026-08-16）

| UI 区块 | 缺什么能力 | 建议的端点签名 | 竞品参照 |
|---|---|---|---|
| ~~rail 分组 label（项目/任务）+ 新建项目行（A3）~~（已解决 2026-08-23） | `GET /api/projects?withSessions=1` 落地（Node 侧，复用 conversations.project_id/group_id 互链，零新表）；NeoRail 加「项目」分组 + 内联新建项目行，会话/群聊按项目分桶，未归组落默认组，接口失败降级平铺。遗留：会话创建路径尚未回写 project_id（多数会话暂落默认组）、无「移入项目」UI | `GET /api/projects?withSessions=1` → `{ id, name, sessions[] }` | ClawsGo home 左栏项目/任务分组 |
| ~~工作空间文件上传/新建文件（A33）~~（已解决 2026-08-22） | `POST /api/fs/write` 与 `POST /api/fs/upload`（multipart）已落地（Node 侧 fs-browse.ts，含穿越/symlink 防护与超限守卫）；前端工作空间 tab 加「新建文件」「上传文件」按钮 | `POST /api/fs/write { path, content }`、`POST /api/fs/upload`（multipart） | ClawsGo 工作空间 tab 工具钮（a_008/b_007） |
| ~~消息 👍👎 反馈行（A44）~~（已解决 2026-08-22） | `POST/GET /api/messages/{id}/feedback` 已落地（独立仓 .shadowflow/feedback/，toggle 语义）；前端 `NeoMsgFeedback` 挂单聊 assistant 消息底部 | `POST /api/messages/{id}/feedback { rating: 1|-1 }` | ClawsGo running 态消息底部反馈行 |
| ~~Team DAG 编辑 UI（B28）~~（已解决 2026-08-22） | `TeamDagEditor`（React Flow v11）已落地：TeamPanel「编辑 DAG」入口，节点/连线增删 + 拖拽布局；保存 = 客户端 preflight 校验（镜像后端 D1 规则）+ PUT workflow + PUT dag 布局。注：`/dag/validate` 端点仅适用 Node yaml team，未接入 | （端点已存在，纯前端工程） | Coze 编排画布可拖拽编辑 |
| ~~群消息 pin / reactions（B38）~~（已解决 2026-08-22） | 确诊：Python pin/reactions 端点与前端 API 封装早已存在（本行"无端点"过时），唯一断环是 UI 接线；`NeoGroupMsgActions` 已挂群消息行（reactions chips + pin）。遗留：无 pinned 汇总栏 | `POST /api/groups/{id}/messages/{mid}/pin`、`/reactions { emoji }` | 飞书/Slack 群消息 pin |
| ~~历史 runs 视图（B39）~~（已解决 2026-08-22） | `GET /api/runs?limit=` 已落地（Python 侧 RunSummary 列表）；前端 `NeoRunHistory` 列表页挂 NeoRail「历史」导航行，行链接沿用 `/?run=<id>` | （数据已有，缺列表页：`GET /api/runs?limit=`） | WorkBuddy 历史任务列表 |
| ~~memory-graph / training-dataset 投影 UI（B40）~~（已解决 2026-08-22） | `EvidencePanel` 已挂 NeoHost「过程」tab（分段切换记忆图谱/训练数据集，懒加载 + 流式轮询） | （端点已存在，纯前端工程） | —（ShadowFlow 差异化项） |

## 竞品特有、不做（删除结论，阶段 2.5 完整版）

| 区块 | 出处 | 删除理由 |
|---|---|---|
| 顶栏算力胶囊 ✦1,500（A7） | home/a_001 | 商业化元素，无对应能力 |
| 4 宫格 caps 之 PPT/画布/密钥（A32） | a_006/a_011 | 竞品特有功能，无后端无承接 |
| md 源码视图语法高亮（A37） | b_006 | 成本/收益低，等宽深色已够 |

## 六层能力缺口批次（2026-08-22，本表外补充）

以下为同批次补齐、不属上表竞品对标行的缺口：

- **团队创建表单**：`createTeam()` 客户端函数零调用方 → WorkspaceStrip「新建团队」改为打开 `CreateTeamModal`（名称/描述/初始成员多选），真实 POST /api/teams。
- **chat-first 团队组装落库**：确诊 assembler 三条组装路径（recipe / emitCompiledTeamBlueprint / orchestrate）均不落库 team+agents（SKILL.md 声称的"节点5后落库"不存在）→ 新增 `server/src/team-persistence.ts`，组装 complete 前经 Node→Python HTTP 落库（先 agents 后 team，满足 D2 写时校验），成功时在 SSE 流插 `team-saved` 帧（前端暂无监听，i18n 死字符串 `runSession.teamSaved` 可复用）。

### 第三轮补充：管理面闭环 + L6 审批 + 救场 + 定时任务 + StaffDeck 借鉴（2026-08-23）

- **管理面闭环**：NeoRail 员工行（暂停/恢复/删除）、DM/群行（重命名/删除）、项目行（重命名/删除，补 `patchProject/deleteProject` 客户端）；TeamPanel 团队重命名/删除；NeoAgentSoul 暂停/恢复切换。删除全部二次确认 + 失败红条 + 删后安全跳转。
- **审批工作流真实接线**：`src/api/approvals.ts`（pending/approve/reject/SSE events）；GroupMembersPanel 审批门区块升级为真实审批队列（批准/驳回/SSE 推送/轮询回落），新增「简报」折叠区（briefboard 按天聚合产出）。
- **救场**：LoopVerdicts 加「急停本循环」（两步确认，POST loops/{id}/halt）；NeoTimeline 步骤加「重跑」（retryStep full_rerun 语义，`onRetryStep` 可选 prop）；删除遗留死函数 fetchStepArtifact。
- **定时任务**：设置页新增 Schedules section（列表/新建/启停/删除/runs 展开）；后端补 `PATCH /api/schedules/{id}`（enabled 字段 + job 重建护栏）。
- **记忆画像**：MemoryPage 挂 MemoryProfilePanel（画像 CRUD + 统计卡 + 手动写回）。遗留：后端无 profiles 列表端点，前端暂用 localStorage 记 id 逐个回填。
- **层级知识检索（借鉴 StaffDeck）**：`hier_index.py` 文档→章节→页面树索引（持久化 .shadowflow/knowledge/），query 先定位 top 节点再子树取 chunk，响应带 `trace` + 层级 `path`；GET packs/{id}/index 树浏览；引用卡显示面包屑 + 「检索调试」折叠区；中文查询 CJK bigram 修复。
- **DAG 版本管理 + 分支（借鉴 StaffDeck SOP）**：PUT workflow 自动快照（team_workflow_versions 小仓）；GET versions / POST restore（回滚前重跑 D1/D2 校验）/ POST branch（复制为新 team 变体）；TeamDagEditor 加「版本」面板。
- **意图分发 + 交付收口（WorkBuddy 式）**：groups-chat 补 `intent` 事件帧（意图/派给谁/理由/per-agent 明细，NeverRaising）；群聊消息流渲染派发卡（NeoDispatchCard）与完成时交付卡（NeoDeliveryCard：产物清单 + 一句话总结 + 查看产物跳转）。

### 第二轮：创建-运行黄金路径体验（2026-08-22，WorkBuddy/StaffDeck 对标）

- **team-saved 前端消费 + 创建后引导**：聊天流渲染「团队已保存」引导卡（`NeoTeamSavedCard`，CTA 去群聊）；CreateTeamModal 创建成功进入成功态引导（不再静默关窗）；创建 agent 成功给 toast 引导。
- **Agent 一句话生成人设**：`NeoCreateAgentModal` 加「一句话描述 → 生成人设」（走 /api/llm 代理，GLM），失败优雅降级为手输，不阻塞纯名称创建。
- **T04 模板团队一键 fork**：catalog 内置「氢能获客 Agent 团队（T04）」模板（6 角色真实中文 persona + DAG 含 approve 审批门/conditional 驳回回炉边），fork 落库 6 agents + team（D1/D2 校验）；前端 WorkspaceStrip「从模板新建」入口。已实测经网关 fork 成功。
- **群聊显式入口**：NeoRail「新建群聊」模态（名称 + 选 team/agents）；TeamPanel 头部「发起群聊」CTA（find-or-create 幂等，跳群聊现场页）。
- **DAG 边 mode 编辑**：TeamDagEditor 选中边可切 direct/approve（审批门为 T04 关键卖点），脏检查取消拦截、保存中禁用、节点 agent 名回退。
- **proxy-fallback 空 body 挂起修复（重要）**：express.json() 消费 body 后，空对象 `{}` body 不重注入导致代理挂起（前端 fork 调用正发 `{}`）——任何经网关转 Python 的 POST 空 JSON 都会超时；已修（按 content-length + content-type 判定重注入），proxy-fallback 测试 18/18。
