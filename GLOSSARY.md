# ShadowFlow 词汇表（GLOSSARY）

> 架构评审（2026-11-24）起建立。深化 module 命名先查这里；新概念定案后加进来。
> 架构词汇（module / interface / depth / seam / adapter / leverage / locality）
> 语义见 mattpocock/skills `codebase-design`；本表只收**领域词汇**。

## 平台与角色

- **ShadowFlow**：人 + AI agent 协作的作业平台；agent 以群聊/单聊承接任务。
- **主控（董事长）**：agent id `agent-shadow-secretary`，全局调度与任务拆解。
- **单聊（DM）**：人与单个 agent 的会话；由 `resolveDm` 找或建。
- **群聊**：多 agent 会话，主控按 DAG 编排回合（fanout）。
- **编队**：成员 + 工作流 + 策略举证，右栏一个 pane 三节。

## 会话与执行

- **回合（Turn）**：一次用户输入触发的 agent 执行单元；编排逻辑属
  群聊回合 use_case（候选 1 落地后），不属于 route。
- **DAG**：一次编队执行的计划图（节点 = agent 任务，边 = 交接）；纯模型在
  `domains/collaboration/dag-draft-model.ts`。
- ** hops（交接）**：agent 之间的任务传递记录；右栏「执行」步骤的数据源。
- **策略举证（Policy Matrix）**：成员 × 成员的三态矩阵（permit/warn/deny），
  双向取更严；染色到 DAG 连线。

## 产物

- **产物（Artifacts）**：会话工作目录里的交付文件；前端经
  `listArtifacts / readArtifact / artifactRawUrl` 三件套访问（Candidate 4 修复后
  已接到 Shell → AgentPanel）。
- **ARC Run**：一次 AutoResearchClaw 管线执行（23 stages / 8 phases）；在
  ShadowFlow 里对应一条论文专家团群聊会话。
- **ARC Gate**：ARC 管线中需人批准的阶段（5 / 9 / 20）；对应既有审批门。
- **ARC Deliverables**：ARC 产物约定目录（paper.tex / references.bib /
  verification_report.json / charts/）；产物 tab 的置顶识别目标。

## 前端 seam

- **WorkspaceSource**：paper 前端唯一数据入口 interface（mock / http 两个
  adapter）；组件只认它，`check-conventions.mjs` 机检违反。
- **data/http**：paper 前端唯一允许 fetch 与 `/api` 字面量的层；路由表在
  `client.ts` 的 ROUTES。
