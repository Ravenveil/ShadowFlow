# Changelog

All notable changes to ShadowFlow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased] — 2026-11-06～07

### Added — 功能登记补记（此前 PR 未登记，2026-11-06～07 已合并）
- **① 商家数据看板**：渠道获客经济性（#26）、产品贡献与定价（#28）——渠道/产品维度的钱口径
  与 `overview` 同源，合计逐字段=概览可当场对账；标价 vs 单均实收暴露退款水分。
- **③ 记忆交接 / 画像写回**：反馈自动写回队列（#19）；演示证据包——七章 Markdown 报告 +
  订单 CSV + 评委速览 + 第一单/异常样例一键复现 + 上台前就绪自检（#20、#23 补失败反馈→人工补跑）；
  记忆闭环可见性——失败原因列 + 记忆消费留痕审计（#24）。
- **记忆库 / 知识库**：多模态记忆库前端（#21）；对话框知识库接多模态记忆库，检索命中注入
  Agent 提示词（#25，同批补齐 `ensureGroupTeam` 群↔编队双向同步）。
- **协作 / 群聊**：Windows 8.3 短路径误判修复 + 测试断言纠偏（#22）；timeline-replay 补
  `hop_update` 分支（#27）；run_artifacts 多产物登记，一 run 多件产物可见（#29）。

### Fixed
- 前端构建：`d683f41` 引用未导出的 `ensureGroupTeam` 致 `vite build` 失败，由 #25 补齐实现恢复。

### Changed — 目录合并（`git mv` 保留历史）
- **backend-poc/ → examples/backend-poc/**：OPC OS 独立原型后端归入示例区
  （`shadowflow/services/opc_*` 为其移植产物，代码引用仅为注释级出处说明，无运行时依赖）。
- **ui_kits/ → examples/ui-kits/**：设计稿 HTML 归入示例区（规格引用见 ByokSection 等头注释）。
- **data/ → scripts/data/**：训练样本与消费它的 `accumulate_training_data.py` /
  `clean_activation_training_data.py` 同居 scripts/，脚本默认路径改为脚本相对定位
  （不再依赖从仓库根执行）；`data/do_result_ai_sql_agent.md` 为内部实验记录，移出仓库（本地 docs/research/）。
- **docker-compose.yml → docker/docker-compose.yml**：Docker 相关文件（Dockerfile.api /
  Dockerfile.web / compose）全部收进 docker/。compose 内 build context、env_file、volume
  均已改为相对新位置的 `..` 基准；README / README.zh / CONTRIBUTING / package.json /
  scripts/demo 中的启动命令统一为 `docker compose -f docker/docker-compose.yml up -d`。
- 根目录 tracked 文件夹收敛为：`.github .shadowflow config docker examples scripts server
  shadowflow src src-tauri templates tests`（src/server/shadowflow 三栈与工具配置文件维持原位，
  避免破坏 vite/tsc/eslint/pytest/CI 的默认发现路径）。

## [Unreleased] — 2026-11-06（仓库瘦身：解除 283 个冗余文件的跟踪）

### Removed — Repo slim-down（协作者视角的仓库减负）
- **design-refs/**（22 张界面截图 ~6.5MB）解除跟踪，保留本地；代码仅 CSS 注释引用过一次。
- **docs/ 旧文档**（29 个 2026 年 5-8 月 PM/评审/交接文档）解除跟踪——`docs/` 早已在
  .gitignore 声明不入库，本次补上了遗漏的 `git rm --cached`。
- **server/skills/BMAD-METHOD/**（222 个 vendored 第三方文件 ~4MB，含一个 544KB 的
  package-lock.json）解除跟踪；skill ingest 仍可从上游重新拉取填充 .shadowflow 缓存。
- **0G 时代残留**（AGENTS.md 已声明 0G 方向取消）：`contracts/*.sol`、
  `acp_adapter.py`、`aci_algorithm_pseudocode.md` 解除跟踪（本地移入 docs/archive/）；
  `templates/agent-packs/0g-compute-analyst/` 彻底删除并从 registry-index.yaml 移除条目。
- **GAP.md / TODOS.md** 移出仓库根目录（内部 sprint/竞品笔记，不入开源库）。
- .gitignore 补充对应规则与根目录杂项（工具误产空文件、vitest 时间戳临时文件、
  个人材料等），防止再次误提交。

## [Unreleased] — 2026-11-03（编队主机：DAG 就地编辑 + 协作策略矩阵联动）

### Changed — TeamPanel（编队 tab）交互重构
- **「编辑 DAG」就地展开**：不再切走整面板 —— TeamDagEditor 直接在
  「工作流」section 内联展开，拖拽/连线/边模式编辑就地完成，保存或取消
  后收起回只读画布（TeamDagCanvas）；roster/策略/输出 section 全程可见。
- **协作策略矩阵化**：「协作策略」从只读要点行升级为 roster × roster 三态
  矩阵 —— 格子点击循环 允许 → 警告 → 拒绝 → 清除，点「保存策略」才
  PUT /policy 持久化（有 diff 才出保存钮）；未展开时按成员显示策略染色
  chips 摘要。新增 `putTeamPolicy` 调用链路与 `buildAgentPolicyColor`
  纯函数（成员最严策略态 deny > warn）。
- **策略 ↔ 画布联动**：`TeamDagCanvas` / `TeamDagEditor` 新增
  `policyColorOf` prop，工作流节点描边按成员策略态染色（草稿即反映，
  无需保存）—— 矩阵改一格、画布立变。
- **移除「最近运行」section**（用户判定冗余，run 现场看群聊页）；连带
  清理 listGroups/listRunSessions/getRunGraph 依赖与 run 行样式、
  teamRecentRuns* i18n key。
- 测试：TeamPanel.test.tsx 重写（9 用例：内联编辑契约 + 策略矩阵循环/
  保存），TeamPanelManage 同步；全量 63 文件 495 用例回归通过。

## [Unreleased] — 2026-08-23（第四轮 · 管理面闭环 + L6 审批 + StaffDeck 三借鉴）

### Changed — Neo 侧栏与团队主机视觉收尾
- NeoRail 员工行去掉灵魂/暂停行内按钮（图标挡住名字），只留 hover 删除；
  灵魂编辑走 DM → 右侧主机「灵魂」tab，暂停/恢复在灵魂页头部状态钮。
- GroupMembersPanel 成员区改钉钉式横向头像网格（状态点保留，角色并入
  title）；「工作流」section 接入只读 DAG 画布（新 `TeamDagCanvas`，
  SfReactFlowBase + 最长路径分层，approve/conditional 边虚线分色），
  边明细收进折叠区。测试 4 新 + 2 改写。

### Added — 后端已就绪但前端无入口的功能批量接线
- **管理面闭环**：NeoRail 员工行暂停/恢复/删除、DM/群行重命名/删除、
  项目行重命名/删除（补 `patchProject/deleteProject` 客户端）；TeamPanel
  团队重命名/删除；NeoAgentSoul 暂停/恢复。删除二次确认 + 失败红条 +
  删后安全跳转；`useInboxStore` 补 `removeGroup`。测试 23 新 + 158 回归。
- **L6 审批工作流接线**：`src/api/approvals.ts`（pending/approve/reject/
  SSE events）；GroupMembersPanel 审批门升级为真实审批队列（SSE 推送 +
  轮询回落）；新增「简报」折叠区（briefboard 按天聚合）。测试 8。
- **救场**：LoopVerdicts「急停本循环」（两步确认 → POST loops/{id}/halt）；
  NeoTimeline 步骤「重跑」（`onRetryStep` prop → POST steps/:n/retry，
  full_rerun 语义）；删除遗留死函数 `fetchStepArtifact`。测试 9 新。
- **定时任务（Schedules）**：设置页新 section（列表/新建团队或 Agent 目标/
  常用频率或 cron/启停/删除/runs 展开）；后端补 `PATCH /api/schedules/{id}`
  （enabled 字段 + 停用清 next_run_time + job 丢失重建护栏）。
  测试 6 pytest + 14 vitest。
- **记忆画像**：MemoryPage 挂 MemoryProfilePanel（画像 CRUD + 统计卡 +
  手动写回 run_id）。测试 8。遗留：后端无 profiles 列表端点，前端暂用
  localStorage 记 id 回填。

### Added — StaffDeck/WorkBuddy 借鉴三项
- **层级知识检索**：`runtime/hier_index.py` 文档→章节→页面树索引
  （md 大纲建树，非结构化退化分页，持久化 .shadowflow/knowledge/）；
  query 先定位 top-3 节点再子树取 chunk，响应带 `trace` + hit 层级 `path`；
  `GET /api/knowledge/packs/{id}/index` 树浏览；引用卡面包屑 + 检索调试
  折叠区；中文查询 CJK bigram 修复。测试 13 pytest + 32 回归 + 10 vitest。
- **DAG 版本管理 + 分支**：PUT workflow 自动快照（team_workflow_versions
  小仓，append-only）；`GET .../workflow/versions`、`POST .../restore`
  （回滚前重跑 D1/D2）、`POST .../branch`（复制为新 team 变体）；
  TeamDagEditor「版本」面板。测试 9 pytest + 58 回归 + 4 vitest。
- **意图分发可视化 + 交付收口**：groups-chat 补 `intent` 事件帧
  （intent/target/reason/assignments，NeverRaising）；群聊派发卡
  （NeoDispatchCard：意图 → 派发给谁 + 理由 + 子任务明细）与交付卡
  （NeoDeliveryCard：产物清单 + 一句话总结 + 查看产物）。
  测试 6 server + 15 回归 + 10 web。

### Notes
- Python 后端以无 --reload 运行（StatReload 在本机不稳）；本轮 Python 改动
  （schedules PATCH / workflow versions / hier index / artifacts pin）已随
  第四次重启全部生效并实测 200。
- server tsc 仅剩 1 处预存错误（knowledge-vaults.test.ts，8-20 在途文件）。

## [Unreleased] — 2026-08-23（第三轮 · 群聊页团队主机融合 + 收尾缺口）

### Added — 群聊页重做（钉钉式，融合进现有主机面板）
- **DM/群聊文案分岔**：NeoGroupChat 读 `group.kind` 走 `neo.dm.*` 文案
  （空态「还没有对话」/composer「发消息，TA 就开始干活」/计数「N 位员工」），
  单聊不再显示群聊口径；zh/en locale 新增 neo.dm.* 与成员 tab 相关 key。
- **消息流钉钉气泡化**：agent 消息 = 色块头像 + 名字 + 角色 badge + 相对时间，
  用户消息右对齐，系统/事件消息居中弱化条；run 过程卡保留内嵌。
- **NeoHost 上下文感知**：非 DM 会话 → 标题「团队的主机」+ 新增「成员」tab
  （`GroupMembersPanel`：成员列表含角色 badge 与 running/idle/paused 状态点 +
  团队 DAG 摘要 chips + approve 边审批门区块，全部真实数据推导、空态不 mock）；
  DM/无会话保持「Agent 的主机」+ 灵魂 tab。`NeoHostProps.conversation` 新契约
  由 NeoApp 单点下发。测试 13 新 + neo 域 68/68。
- **A3 项目分组（GAP :22）**：`GET /api/projects?withSessions=1`（Node 侧，
  复用 conversations.project_id/group_id 互链零新表）；NeoRail「项目」分组 +
  内联新建项目行 + 会话按项目分桶，失败降级平铺。测试 3 server + 6 web。
  遗留：会话创建路径未回写 project_id（多数会话暂落默认组）。
- **RAG 多片段检索**：`lightrag_adapter.query_hits()`（优先 `aquery_data`
  结构化 chunks，老版本回落 `aquery(only_need_context=True)` 解析）；
  query 端点透出多条真实 `{text, source, score}`，adapter 不支持时回落
  单条合成答案；score 为名次归一（非余弦相似度，docstring 注明）。
  测试 34 pytest + 66 回归 + 6 vitest。
- **filecard 置顶 + 副标题（GAP :14/:15）**：`POST /api/artifacts/{id}/pin`
  （toggle，独立仓 .shadowflow/artifacts/artifact_pins.json，原子写）；
  artifact 写入落 `metadata.summary`（120 字符纯文本摘要）；ArtifactsView
  置顶排前 + summary 副标题优先。测试 9 pytest + 3 vitest。

### Notes
- 运行中 Python 服务需重载一次才能挂上 `/api/artifacts` 新路由（server.py
  include_router）；tsx watch 在本机不热重载，Node 侧改动需重启 dev:server。
- 清理过时 mock 数据：4 个 6 月 quick_hire 烟测 agent、3 个烟测 team、
  40 个垃圾 group（空 hi/孤儿 DM/6 月空测试群）已经 API 删除。

## [Unreleased] — 2026-08-22（第二轮 · 创建-运行黄金路径体验，对标 WorkBuddy/StaffDeck）

### Added — 无代码创建 agent/团队并运行的体验闭环
- **创建后引导**：run SSE 的 `team-saved` 帧前端消费——聊天流渲染
  `NeoTeamSavedCard`（团队名/成员数/「去群聊运行」CTA，复用死字符串
  `runSession.teamSaved`）；`CreateTeamModal` 创建成功进入成功态引导；
  创建 agent 成功 toast「去对话试试」。测试 21 vitest。
- **Agent 一句话生成人设**：`NeoCreateAgentModal` 加描述输入 +「生成人设」
  （`POST /api/llm/chat/completions`，GLM，前端 prompt 模板生成角色定位/
  能力/边界三段 persona），失败降级手输、不阻塞纯名称创建。测试 10 vitest。
- **T04 模板团队一键 fork**：catalog 内置 `app-t04-hydrogen-team`（6 角色
  真实中文 persona + DAG：4 direct + reviewer→verifier `approve` 审批门 +
  reviewer→strategist `conditional` 驳回回炉）；fork 落库 6 agents + team
  （写前过 D1/D2 校验，agent 记录 `source="catalog_fork"`、executor
  zhipu/glm-4.6）；catalog router 增 `/api` 别名挂载 + 启动幂等种子；
  前端 WorkspaceStrip「从模板新建」+ `ForkTeamTemplateModal`。
  测试 110 pytest + 6 vitest；已实测经网关 fork 成功。
- **群聊显式入口**：`NeoCreateGroupModal`（名称 + 选 team/agents 建群跳
  现场页）；TeamPanel 头部「发起群聊」CTA（`resolveTeamGroup` find-or-create
  幂等，跳 `/group/:gid`）。测试 21 vitest。
- **DAG 边 mode 编辑**：TeamDagEditor 边属性面板切 direct/approve（approve
  = L6 人工审批门，虚线 + 警示色），脏检查取消拦截 + 保存中禁用 + 节点名
  回退；核对结论：后端对 approve 边无额外 D1/D2 约束（归 sequential 参与
  环检测），已记入 docstring。测试 12 vitest。

### Fixed
- **proxy-fallback 空 JSON body 挂起**：express.json() 消费 body 后，旧
  proxyReq 钩子只在非空对象时重注入——`{}` body 使代理永远等 2 字节，
  前端 `forkCatalogApp`（无 workspaceId 时发 `{}`）经网关必超时。现按
  content-length/transfer-encoding + application/json 判定重注入；
  测试补 express.json 挂载 + POST `{}`/非空 body 两例，18/18 通过。

## [Unreleased] — 2026-08-22（六层能力缺口批量补齐 · 8 路并行）

### Added — GAP.md 对标缺口批量补齐（详见 GAP.md 各行「已解决 2026-08-22」标注）
- **知识库 RAG 查询（L1/L5）**：`POST /api/knowledge/packs/{id}/query`（LightRAG
  query 透出，未配置/无命中/异常均返回空 hits）；前端 `KnowledgeCitations`
  引用卡挂单聊消息底部。测试 8 pytest + 7 vitest。
- **证据层后端（L6）**：`GET /api/runs/{id}/loops/{loop_id}/verdicts`（透出
  IterationRecord 的 score/rationale/claims）、`GET /api/runs/{id}/loops/stream`
  （SSE snapshot + 增量帧 + Last-Event-ID 续传，loop 事件扇出 RunEventBus）、
  `GET /api/runs?limit=`（RunSummary 列表）、artifact-lineage 节点落
  `preview_url` + `uri_scheme`（scheme 契约文档化）。测试 16 pytest + 111 回归。
- **证据层前端（L6）**：NeoRunInline/NeoHost 的 loop 数据源改 SSE 优先 +
  5s 轮询回落；`LoopVerdicts` verifier 面板；`NeoRunHistory` 历史 runs 列表
  （NeoRail「历史」行）；`EvidencePanel`（memory-graph / training-dataset
  投影露出，B40）；ArtifactsView 按 preview_url 优先直链预览。测试 27 vitest。
- **Node 侧 run 投影（L6，GAP :13）**：`GET /api/runs/:runId/graph` 与
  `/task-tree` 由 Node 网关对 daemon run 直接返回与 Python 同形投影
  （runBus 事件日志折叠，含重启后磁盘 hydrate），未命中落回 Python。
  测试 15 vitest。
- **Team DAG 编辑 UI（L2/L3，B28）**：`TeamDagEditor`（React Flow v11）——
  节点/连线增删 + 拖拽布局，保存 = 客户端 preflight（`validateTeamWorkflowGraph`
  镜像后端 D1 规则）+ PUT workflow + PUT dag 布局；TeamPanel「编辑 DAG」入口。
  注：`/dag/validate` 仅适用 Node yaml team，未接入。测试 16 vitest。
- **团队创建与组装落库（L2）**：WorkspaceStrip「新建团队」改开
  `CreateTeamModal` 真实调 createTeam()；确诊并修复 chat-first 组装不落库——
  新增 `server/src/team-persistence.ts`，组装 complete 前经 Node→Python HTTP
  落库 agents+team（满足 D2 写时校验），成功时 SSE 插 `team-saved` 帧。
  测试 12 vitest + assembler 回归 24/24。
- **群消息 pin/reactions + 消息反馈（L1）**：确诊 pin/reactions 端点早已存在
  （GAP :26 过时），补 UI 接线 `NeoGroupMsgActions`；新增
  `POST/GET /api/messages/{id}/feedback`（独立仓 .shadowflow/feedback/，toggle
  语义）+ 单聊 `NeoMsgFeedback` 反馈行。测试 10 pytest + 32 回归。
- **工作空间文件写入/上传（L1/L5，A33）**：`POST /api/fs/write` 与
  `POST /api/fs/upload`（Node fs-browse.ts，手写极简 multipart 解析零新依赖，
  穿越 400 / 越权 403 / 超限 413 全防护）；前端工作空间 tab 加新建/上传按钮。
  测试 17 vitest + 12 回归。

### Notes
- 运行中的三服务未重启：Node 网关新路由（fs write/upload、run 投影）与
  Python 新端点待服务重载/重启后生效（各路径均已集成测试覆盖）。
- 已知遗留：`server/src/__tests__/knowledge-vaults.test.ts` 为 8-20 遗留
  在途文件（非本批次产出），server tsc 有 1 处其域报错；
  `KnowledgePage.test.tsx` 的 vault-graph-btn 失败同属该 WIP。

## [Unreleased] — 2026-08-17（阶段 3.5 · 0G 组件下线）

### Removed — 0G 方向取消，全链路拆除（ROADMAP-agentinfra 3.5；breaking）
- **Python**：`ZeroGCheckpointStore`（checkpoint 留 InMemory/SQLite）、
  `llm/zerog.py`（`ProviderType.ZERO_G` 枚举与注册）、`integrations/zerog_storage.py`
  路由、`upload_sfagent_to_zerog` + `POST /workflow/sfagent/upload` 端点（.sfagent
  离线导出/导入不动）、CLI `--store zerog` / `--bridge-url`、MCP `store` enum 的
  zerog 项与 `bridge_url` 参数、契约 `WritebackTarget` 的 `"zerog"` 通道、
  `pyproject` zerog extras 与 "0g" keyword。
- **Node/前端**：`bridge/`（KV bridge 整目录）、`@0glabs/*` 两包、`hardhat` +
  `@nomicfoundation/hardhat-ethers`（**`ethers` 保留**——`routes/auth.ts` 钱包
  签名校验仍依赖）、`vite.config.ts` 的 ZgFile node:fs stub 别名、`.0g-skills/`、
  0G deploy/broker/evidence 脚本五件、CI 的 zerog extras 安装、根 `hardhat.config.cjs`
  与 `package-lock.json` 中的 @0glabs/hardhat 锁定项（收尾补清，2026-08-18）。
- **测试**：删除 `test_zerog_{provider,store}.py`、`integrations/test_zerog_storage.py`
  及三处 zerog 用例；`test_sfagent_import_upload.py` 收缩为离线导入测试。
- **Breaking**：`--store zerog` / `bridge_url` 参数、`ProviderType.ZERO_G`、
  `WritebackTarget "zerog"`、`/workflow/sfagent/upload`、`zerog` pip extras 不复
  存在。README 双语已去 0G 段落；EXTENSION_POINTS 对应行更新。
- **护栏**：`SHADOWFLOW_BRIDGE_URL`/`ZEROG_*` 环境变量从此为无效空置（不再读取）。

## [Unreleased] — 2026-08-17（dsh 借鉴 阶段 2 · 双端统一事件命名表）

### Added — 事件命名对齐与 model-visible 对账（ROADMAP-agentinfra 阶段 2 / GAP G4+G5）
- **`docs/EVENT_NAMING.md`**：双端统一事件命名表。主表 27 个 Node wire 事件
  × 发射处 × 事实/观察归属 × Python 对应物（无对应即显式"无对应"）；反向表
  Python 14 个 durable 类型 → Node；`message` 帧 19 个 kind 子表；Node 侧
  「model-visible means logged」对账表（system prompt 与工具白名单两项登记为
  整改候选 R1/R2，信号未到不实现）。
- **`server/src/lib/__tests__/event-naming.test.ts`**：四向一致性 guard——代码
  发射点 ↔ 命名表主表（双向，防漏登也防陈旧）↔ Python `DURABLE_EVENT_TYPES`
  ↔ timeline kind。任一漂移即红。
- 登记即对齐：Node 端 runBus 无 durable 子集（整 run 快照落盘），故归属判定
  采用"事实帧/观察帧"语义二分（与既有 status_line 优先驱逐策略互证）；
  `permission_check` ↔ `permission.checked/blocked` 的语义映射入表。
- 回归：前端 vitest 147/147 零改动通过（证明确未动帧结构与事件名）；
  server tsc 零错误。EXTENSION_POINTS 事件三分法节加指针。

## [Unreleased] — 2026-08-17（dsh 借鉴 阶段 1 · Node 工具审批交互回路）

### Added — prompt 模式从软拒绝接成真人在环审批（ROADMAP-agentinfra 阶段 1 / GAP-dsh-alignment G1）
- **`server/src/lib/tool-approval.ts`**：pending 审批注册表。`request()` 立即发
  `permission_check`（decision:'pending'）帧并挂起；用户决策（approve/deny）、
  超时（默认 120s，`SF_TOOL_APPROVAL_TIMEOUT_MS` 可覆写）、中止三者任一到达即
  settle 并发决策帧——超时/中止 fail-closed=deny，对齐 Python
  `permissions.py`/`approval/service.py` 语义（同名同义，未发明第二套）。
- **`tool-runner.ts`**：`ToolRunner` 新增可选 `prompter`。`mode==='prompt'` 且有
  prompter 时走真实审批回路（approve → 执行续跑；否则 is_error tool_result）；
  无 prompter 保持 v1 软拒绝（既有调用点/单测零变化）。
- **接线（双路径）**：非团队组装分支（`assembler.ts`）与团队每节点
  （`workflow/executor.ts`，session_id 经 `runDag`→`NodeContext` 穿参）都按
  `builtinDefaultModes` 把 write-tier 工具（write_file/edit_file）升为 'prompt'
  门（`promptDefaultsForTools` 只 lift prompt，不给已列工具新增 deny）。
- **决策端点**：`GET /api/run-sessions/:id/permissions`（pending 列表）+
  `POST /api/run-sessions/:id/permissions/:requestId`（decision: approve|deny，
  跨会话 request_id 拒绝）。发射器在 `routes/run-sessions.ts` 接入私有 runBus，
  请求与决策两帧均落单调编号事件日志——重连/重启重放可见。
- **测试**：`lib/__tests__/tool-approval.test.ts`（23 用例）+
  `lib/__tests__/tool-runner-approval.test.ts`（14 用例：approve 续跑/deny 拒绝/
  v1 兼容/白名单可见性[只读 agent 看不到写工具]/RunBus 重放集成）。

## [Unreleased] — 2026-08-15（下午第二轮 · Polynoia 对标：单聊编排 → 分阶段派发 → 群聊现场）

### Added — Polynoia 式多 Agent 协作闭环（后端执行能力 + 群聊现场页）
- **WorktreeManager（`server/src/lib/worktree-manager.ts`）**：Polynoia「每 agent
  一分支一 worktree → 干完 merge --no-ff → 冲突标 needs-manual」的隔离闭环。
  `prepareWorktree`（回合起始 reset --hard + clean -fd）/ `commitWorktree`
  （agent 身份作 author，干净树零提交）/ `integrateAll`（专用 integration
  worktree 上并分支，绝不碰用户检出分支；冲突收集 `--diff-filter=U` 后 abort）。
  全防御式：非 git 仓库 / 超时 → null，绝不 throw。
- **INTENT_PARSE 编排拆解器（`server/src/lib/orchestrator-parse.ts`）**：群 DAG
  派发前用 BYOK LLM 把用户消息拆成 per-agent 子任务 prompt（严格 JSON，
  容围栏/杂文/未知 agent）；无 key / 解析失败 → 降级为原文分发，零回归。
- **群聊 team DAG 路径接线（`groups-chat.ts` runFanout）**：
  - 扇出前 `computeDagLayers` 分层 → **plan_card**（层号=并行批次，任务标题
    来自拆解结果）经 gateway run 下发；callAgent 包装层实时发 `plan_update_task`
    （running/done/failed + 耗时）。
  - callAgent 的 workspace 换成该 agent 专属 worktree；干完即 `commitWorktree`
    → **commit_record + file_diff** 证据卡（git-introspect 复用）。
  - DAG 收尾 `integrateAll` → 合并 commit_record / 多分支「回合合并结果」
    table_panel / 冲突表格卡 + 系统消息（needs-manual）。用户插话取消的回合
    不合并。串行降级路径同样注入 worktree（不发卡）。
- **群聊现场页 `/group/:groupId`（`src/neo/NeoGroupChat.tsx`）**：复用
  useGroupTimeline（B2 统一读路径 + 群 SSE + 活跃 run 订阅）+ 完整 Timeline
  渲染器——agents 干活现场的全部富内联卡（plan/commit/diff/table/preview）。
  NeoRail 新增「群聊现场」区（群列表行）；NeoChat 顶栏经 B1 互链反查加
  「群聊现场」跳转。单聊说话 → 编排拆解 → 群里看现场的全链路打通。
- **OpenCode 适配**：`cli-registry.ts` 新增 opencode 描述符（`run` 子命令 +
  stdin 消息 + plain-line 解析，检测/生成路径自动获得；本机实测已检出）；
  `provider_presets.yaml` 新增 opencode 预设（Python CliAgentExecutor 侧）。
- 端到端验证：git 仓库群 + 双 agent 团队消息 → timeline 实测含 plan_card
  （batch 1/2，done+耗时）/ 2×agent 回复 / 2×merge commit_record / 合并结果
  table；磁盘三 worktree（integration + 2 agent）+ 三分支（agent/*/…、
  sf/run/…），用户 master 检出未动。

### Fixed
- **`timeline-replay.ts` 服务端 applyPatch 缺 `plan_update_task` 分支**（存量
  缺口）：群时间线 REST 重放时 plan 卡任务状态被静默丢弃、刷新后退回 pending。
- `AppRoutes.test.tsx` 两条断言过期（Neo 重构已下架 /chat、/agent-dm 路由，
  断言仍找已删除页面的 testid）→ 改为断言重定向行为 + 新增 /group 路由用例。

### Added — 前一轮（2026-08-15 上午 · Polynoia 富内联消息渲染）
- **TimelineMessage 8 种新 kind**（前后端契约同步）：plan_card / commit_record /
  file_diff / table_panel / image_panel / web_preview / artifact_card /
  verdict_card + `plan_update_task` patch；投影器配套发射器
  （timeline-projector.ts onPlanCard 等 9 个）。
- **run-sessions 路径接线**：团队组装的 node 帧 → plan_card + 实时任务状态；
  blueprint → artifact_card（html 加 web_preview）；critique → verdict_card
  （5 维评分 + lint 摘要）；**git-introspect.ts**（git log/diff 优雅降级）在
  run 收尾产出 commit_record / file_diff / 变更统计 table。
- **消息编辑（「聊天里看还能编辑」）**：PATCH /api/run-sessions/:id/messages
  （经 O3 timeline back-trace 定位会话行，edited_at 列运行时迁移）+
  AssistantText 行内编辑 UI + useRunSession.editMessage。
- **Neo 中栏接入完整 Timeline 渲染器**（variant="neo" = chat 观感 + 外层滚动），
  替换原纯文本渲染——12+ 种内联渲染类型直接进 Neo 聊天。
- 测试：projector 富卡 / git-introspect（真实临时 git 仓库）/ 前端 richCards
  组件 + applyPatch 共 38 例新增全绿；run-sessions 冒烟实测 plan_card×1 +
  plan_update_task×30 + artifact_card×1 帧下发。

## [Unreleased] — 2026-08-15

### Added — 一键开发启动（对标 dsh web）
- `npm run dev`（`dev:all` 为别名）→ `scripts/dev.mjs` 统一启动器：拉起 Python
  uvicorn（:8000）+ Node 网关（:8002）+ Vite（:3007），三服务 HTTP 就绪探测通过后
  自动开浏览器；启动前端口占用预检；任一进程退出/Ctrl+C 即整树收摊——Windows 下
  以 PPID 后代清点 + netstat 端口反查双兜底，不留 `uvicorn --reload` 断链孤儿；
  Python 解释器自动探测（`SF_PYTHON` > 仓库 `.venv` > 系统 `python`）。

### Added — Loop Engine v2（DAG-native，对标 deepseek-harness 调研 P1–P5 落地）
- **循环体 = 主 DAG 子图**：`control.loop` 体节点间存在边时按图遍历（条件边/回边，`config.entry`
  可指定入口）；无边时保持 v1 线性顺序（存量兼容）；`shadowflow/runtime/loop_engine.py` 从
  service.py 抽出独立引擎模块。
- **Sensor/Controller 图节点化**：新节点类型 `control.sensor` / `control.controller` 可直接
  摆进循环体 DAG（verifier BYOK 语义不变）；显式节点取代引擎内嵌 C/A 阶段。
- **开放循环模板注册表**：`register_loop_preset()` / `SF_LOOP_PRESETS` YAML / 内置示例
  （pdca、ooda、generate_evaluate，均标注 example）——PDCA 从引擎形态降级为示例实例。
- **Durable RunEvent 日志（P1）**：append-only 事件流（run/node/checkpoint/loop 生命周期）
  落 SQLite（`shadowflow/runtime/run_event_log.py`），新增 `GET /runs/{id}/event-log`；
  `replay_run_summary` 证明"投影可从事件流重建"。
- **运行状态持久化**：`SqliteRunStore`/`SqliteRequestContextStore`/`SqliteCheckpointStore`
  单库（`SF_RUNTIME_STATE_DB`，默认 `.shadowflow/runtime.sqlite`）接入 server 装配——
  **进程重启后 runs 六投影不再 404**。
- **Executor kind 开放注册（P2）**：`ExecutorRegistry.register()` 自动开放 schema 校验
  （`register_executor_kind`），新 kind 不再需要改 contracts.py 白名单。
- **Validation hooks 瀑布语义（P3/N1 Python 侧）**：`shadowflow/runtime/hook_pipeline.py`
  （WaterfallPipeline + shell/webhook/builtin runner，on_fail=blocker/warn/retry），
  节点级 `config.validation_hooks[]` 内联接入执行管线。
- **control.parallel 真并发（GOAI M2）**：`config.execution="gather"` 时所有分支
  asyncio.gather 并发执行、单分支失败不拖垮兄弟分支；默认保持交错调度（checkpoint 语义优先）。
- **Live loop halt（GOAI）**：`POST /runs/{id}/loops/{loop_id}/halt` 从 placeholder 变为
  真实信号（迭代边界消费，`*` 通配挂起整 run 下一个循环）。
- **.sfagent bundle（GOAI M9）**：`agent_bundle.py` + CLI `export-sfagent` +
  `POST /workflow/export/sfagent`——identity（附录A）+ skills（附录B）+ 轨迹证据 +
  确定性 sha256 content id；上传/0G CID 为后续项。
- **文档工程（P4）**：新增 `docs/EXTENSION_POINTS.md` 扩展点总表（改扩展点必须更新）；
  `docs/DESIGN.md` 标注 SUPERSEDED；`loop-engine-design.md` 增补 §8。

### Added — 前期积压（2026-05-09 → 2026-08-15 摘要，详见 git log）
- Loop Engine v1（PDCA 分形/watch/Sensor-Controller/迭代级 reject/SEED-lite/River）与
  runs 六投影端点（8/13）；Neo UI chat-first 重构（8/13）；AgentTeams 离线代码包导出 +
  K 采样 Verifier + knowledge-grounded demo（8/15）；Verifier BYOK 化 + 智谱 GLM 通道 +
  真实 LLM 端到端收敛验证（8/15，`docs/competition/run-evidence/`）。

### Added — 第二轮（2026-08-15 下午，调研采纳清单落地）
- **权限三分法（采纳#3）**：`shadowflow/runtime/permissions.py` — auto/prompt/block 三态；
  node 级 `config.permissions` 或 workflow `defaults.permissions`；prompt 复用审批注册表
  （/api/approvals 可批准/驳回），全部决策落 durable 事件（permission.checked/blocked）。
- **ACP `_meta.shadowflow` 谱系（采纳#2）**：session/new 的保留 `_meta` 扩展 run/node/agent +
  loopId/iteration/depth/parentLoopId（循环体内派发时注入），Hermes provenance 惯例。
- **Task ledger 事件化（采纳#4）**：循环每轮自动 `task.ledger` durable 事件
  （goal/target/done/current/actuated），`replay_run_summary` 重建账本视图。
- **diagnostics 传感器（采纳#1）**：`control.sensor` 新 type=diagnostics（LSP 风格证据源），
  统计 body 输出的 diagnostics 数组（可 include=errors），issue ≤ target 即收敛。
- **M9 收尾**：`.sfagent` import（CLI `import-sfagent` + `POST /workflow/sfagent/import` 写入
  agent store）与 upload（`POST /workflow/sfagent/upload`，配 SHADOWFLOW_BRIDGE_URL 时经
  0G KV bridge 上传返回 CID，否则本地 sha256 content id）。
- **`.sfplugin` 插件包格式 v1（采纳#5）**：manifest + provider_presets/ + loop_presets.yaml；
  `validate-plugin` CLI 校验器（apply 待格式稳定）。
- **PDCA 显式 DAG demo**：`examples/runtime-contract/pdca-dag-demo.json` —— plan/do/check/act
  全部是图节点（check=control.sensor、act=control.controller），body_mode=dag 两轮收敛。

### Fixed — 存量测试清理（60 个失败全清零，套件 36f/20e → 0f/0e 于相关簇）
- 生产 bug：`SqliteRunStore.list_runs` 返回 dict 但调用方按对象访问 → `GET /runs` 500（改回
  RunSummary 契约 + 补列迁移）；`GET /runs/{id}/graph` 误调 export_workflow_graph 且套
  envelope → 改为 export_run_graph 扁平结构（对齐 src/api/runs.ts 契约），其余 5 个投影端点
  同步去 envelope。
- 测试侧：a2a_bridge 导入顺序污染（fixture monkeypatch 模块常量）；teams API 两文件缺
  agent store seed（照抄 test_teams_api 模式）+ 工作流负载引用不存在的节点/非成员 agent；
  workspaces 断言已移除的 AC6 自动建默认工作区旧行为；builder 空串被 Pydantic min_length
  先拦（断言改原生格式）；README 双语重写丢失 AGENT_PLUGIN_CONTRACT 链接（补回）。

### Fixed
- `_sense` verifier 分支返回未 await 协程的 live 路径 bug（2026-08-15，随 zhipu 通道提交）。

## [1.1.0] — 2026-05-09

### Added
- **RunSession pipeline** — goal-to-team-assembly with live SSE streaming (`RunSessionPage`, `useRunSession`, `src/api/runSessions.ts`)
  - POST `/api/run-sessions` creates a session and starts background assembly
  - GET `/api/run-sessions/{id}/stream` streams `classify → assemble → node/edge → blueprint → complete` events
  - Replay buffer so late-joining clients see full history
- **QuickSwitcher** (`⌘K` / `Ctrl+K`) — fuzzy navigation overlay with keyboard-driven item selection
- **FastAPI router** `shadowflow/api/run_session.py` — SSE backend with in-memory session store, mock fallback when IntentRouter unavailable
- **IntentRouter** `shadowflow/runtime/intent_router.py` — keyword-based goal classification (answer/report/review/workflow)
- **Vite proxy** — `/api` proxied to `http://localhost:8002` with SSE `cache-control: no-cache` passthrough; dev server moved to port 3007
- **Platform-aware kbd shortcut** on StartPage — shows `⌘ ⏎` on macOS and `Ctrl ⏎` on Windows/Linux

### Fixed
- Pre-existing test suite failures: 15 test files now receive `I18nProvider` context via `src/test/utils.tsx` custom render wrapper; `beforeAll` switches i18next to `zh`
- `PolicyHeatmap` color assertions updated to match CSS variable implementation
- `MessageItem` pending-approvals badge assertion updated after emoji → lucide icon migration
- `NarrowNav` label assertions updated to current i18n keys (`Inbox`, `关于`)
- `TeamPage` error text assertion updated to `/加载失败/`
- `AgentDMPage` multi-element `getByText` changed to `getAllByText`

### Security
- `goal` field capped at 2000 characters via Pydantic `Field(max_length=2000)` to prevent oversized payloads
- YAML injection in blueprint description: newlines stripped from goal text before interpolation
- Error messages sanitized — internal exception detail no longer sent to SSE clients
- `asyncio.create_task` reference stored in session dict to prevent premature GC

### Changed
- `getApiBase()` fallback changed from `http://localhost:8000` to `''` (empty string) — relative URLs are now used so Vite proxy handles routing in dev; production requires `VITE_API_BASE` or same-origin backend
- `navigator.platform` replaced with `navigator.userAgent` (platform is deprecated)
- `TICK_TOKEN` animation timer now stopped when run session completes

## [1.0.0] — initial release
