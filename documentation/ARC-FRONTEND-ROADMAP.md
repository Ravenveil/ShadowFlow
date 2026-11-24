# ARC 前端工作台与架构深化路线图

> 2026-11-24 架构评审（mattpocock/skills@improve-codebase-architecture）的落地文档。
> 评审报告（HTML，含 before/after 图）：`%TEMP%\architecture-review-20261124T1040.html`。
> 本文档回答两件事：① 架构深化候选 1–6 的执行步骤与顺序；② 让
> [AutoResearchClaw](https://github.com/aiming-lab/AutoResearchClaw)（ARC）在 paper
> 前端真正可观测、可检查、可干预的前端工作台方案。
>
> **2026-11-24（第二批）落地「管线页」**：后端新增 `domains/research/` 四件套
> （ARC run 观测面，`/api/arc/*`，扫 checkpoint / stage-XX / decision.json /
> pipeline_summary / deliverables），前端 paper 右栏新增「管线」tab——
> 23 阶段按 8 相位分组的时间线 + 审批门徽标 + 阶段产物预览 + 引用核验清单 +
> 质量门裁决 + refine/pivot 决策史 + 终稿（PDF 原生预览）。运行中每 10s 轮询。
> 用本机 `~/AutoResearchClaw/artifacts` 三个真实 run 端到端验证：列表/详情/
> 引用核验 13/13、质量门 6/10、终稿 PDF 直链、目录穿越防护全过。

---

## 一、目标（用户原话的工程翻译）

1. ARC 是后端引擎，但目前"看不到每条管道的结果"——需要一个现代前端把它的
   管线、中间产物、终稿展示出来。
2. 类似 VS Code 打开文件夹：产物要能以文件树浏览、点开预览。
3. 约束：前后端分层清楚、数据模型够用、链路可解释、部署复杂度可控。
4. 风格对齐 OpenBot / multica：可观测的 run、审批门、人机协作。

**关键事实：后端已经接通 ARC**（`catalog-builtin.ts` 内置论文专家团一键入口、
`groups-chat.ts` 驱动群聊 DAG、CLI 描述符四开关 `bare_prompt/env_defaults/
long_running/no_worktree` 支持管线型 CLI）。缺的不是引擎，是**观测面**。

## 二、ARC 原生给我们的挂点（不用改 ARC 就能用）

| ARC 原生能力 | ShadowFlow 对应 |
|---|---|
| 23 stages / 8 phases（固定编号与名称） | 群聊 DAG 的节点 + 右栏「工作流」页 |
| 3 个审批门（Stage 5/9/20，暂停等批准） | `groups-chat.ts` 已有 pendingApprovals + 审批端点 |
| HITL CLI：`attach/status/approve/reject/guide` | 已有 remote-exec + 会话消息通道，可直接包一层 |
| WebSocket adapter（官方 web dashboard 通道） | paper 的 `data/http/events.ts` SSE 的升级候选 |
| 产物结构 `artifacts/rc-<ts>/deliverables/`（paper.tex / references.bib / verification_report.json / charts/ / experiment runs/） | 会话工作目录 → 右栏「产物」tab（fs-browse 已有 /api/fs/list?include=files） |
| `verification_report.json`（引用核验报告） | 「链路可解释」的直接数据源 |
| cost budget 阈值（50%/80%/100%） | 右栏「执行」用量条 |

## 三、数据模型（够用就好，四个概念）

```
Run      = 一次 ARC 管线执行        ←→ 一条群聊会话（groups 表已有）
Stage    = 管线阶段（1–23，8 相位）  ←→ DAG 节点（dag-draft-model 已有）
Gate     = 需要人批准的阶段          ←→ approvals 域（已有审批端点）
Artifact = 阶段产出文件             ←→ /api/fs/*（fs-browse 已有）
```

前端只加一个 module：`data/http/arc.ts`（或并入现有 mappers），把
`groups + hops + fs + approvals` 四路数据投影成 `{run, stages[], gates[], artifacts}`。
组件只认 `WorkspaceSource`，不认 ARC 的线格式 —— 分层清楚就守在这条规则上。

## 四、OpenBot / multica / 开源选型（问题的直接回答）

- **VS Code 开源吗？** 开源的是 **Code - OSS（MIT）**；微软发行的 VS Code 是在其上
  加品牌与遥测的 product build。纯开源发行版：**VSCodium**；浏览器版：**code-server**
  （把 VS Code 跑在服务端，浏览器打开——最接近"打开文件夹看产物"的现成方案）。
- **论文/文档展示的开源仓库**：
  - **pdf.js**（Mozilla，MIT）：终稿 PDF 预览的事实标准，产物 tab 的 `.pdf` 直接用它。
  - **dream-num/univer**（Apache-2.0）：在线 Excel/Word/PPT SDK——适合展示
    `experiment runs/` 的结构化数据表和交付文档，但引入成本高，列为 M3 可选。
  - ARC 官方 `docs/showcase/SHOWCASE.md`（8 篇样例论文）可做冷启动的演示内容源。
- **从 OpenBot / multica 各取一观念**（不搬架构，只搬观念）：
  - multica 的 **execution log**（每次工具调用可回放）→ 我们的 hops + 产物文件引用。
  - OpenBot 的 **approvals/audit**（策略在 API 层执行并留痕）→ 我们已有的审批门，
    前端把 gate 状态显示在 DAG 节点上即可。

## 五、架构深化候选 1–6：执行步骤

> 全部来自 2026-11-24 评审。门槛：每批 `npx tsc --noEmit && npx vitest run` +
> `node scripts/arch-check.mjs` 零回归；提交带 pathspec 一批一主题。

### ✅ 候选 2 —— 删除 src-tauri（已完成 2026-11-24）
`git rm -r src-tauri`（≈2,685 行，编译不过、三前端 0 调用、deletion test 通过），
同步清掉 README / CONTRIBUTING / README.zh 里的「Tauri Sidecar」段落。

### ✅ 候选 4（slice A+B）—— paper 的数据 seam 名副其实（已完成 2026-11-24）
- Shell 把 `sessionId + listArtifacts/readArtifact/artifactRawUrl` 三件套传给
  AgentPanel —— **产物 tab 从此有数据**（此前两端都实现却没接线，tab 永远空）。
- `SessionList` 不再丢 `resolveDm` 返回值：新增 `openAgentDm`（resolve → reload →
  focus 一处收口）；董事长置顶卡选中态改用解析出的会话 id 点亮。
- `data/auth.ts`（自带 fetch + 私有 base URL，绕过 seam）折叠进
  `data/http/auth.ts`：一个 client、一张 ROUTES 表、一种错误形状；`data/auth.ts`
  只剩 re-export。
- 顺手清了 7 处组件内中文硬编码文案（挪进 `src/content`），并修掉 AgentPanel
  两个存量 unused 报错。**`npm run check` 现在绿了**（typecheck ✓ conventions ✓）。
- ⚠️ 发现的存量缺陷：paper 的 vitest 在本机对任何文件都报 "No test suite found"
  （vitest 3.2.7 + Node 24 + 共享 node_modules junction，trivial 测试也复现）。
  待修：单仓独立依赖或锁 Node 版本；修好前 CI 只跑 typecheck + conventions。
- ⏭ 待办：把 `npm run check`（paper）挂进 `.github/workflows/ci.yml`（该文件当前
  有未提交改动，等它落定再追加，避免踩脚）。

### ⏳ 候选 1 —— groups-chat 回合编排搬进 use_case（第一批已落地 2026-11-24）
2276 行 route 拥有回合编排、执行策略、审批状态、SSE 协议四类职责。分批走：
1. ✅ **审批门 module 拆出**：`routes/groups/approval-gate.ts`（148 行）——
   pendingApprovals 注册表、register/tryResolve/swapDagRun、GET+POST 处理器；
   groups-chat 只剩 re-export 与 router 注册（2277 → 2178 行，棘轮达标）。
   新增 `GET /api/groups/:id/approvals`（挂起 nodeId 列表，paper 前端用）。
2. ✅ **前端审批门闭环**（paper）：panel.approval 带 nodeId → 「批准 / 拒绝」
   按钮 → `resolveApproval` 动作 → POST 决定 → reload；demo 态不出按钮。
3. ⏭ 待做：回合编排（runAgentTurn 装配 :885）、worktree/timeout 策略分支
   （:1504/:1784）下沉为注入端口的 use_case；think-tag 协议规则归 parsers；
   删 runFanoutAsync 测试后门（:2276 附近）。

### ✅ 候选 3 —— commerce 经济口径归位 model（已完成 2026-11-24）
`domains/commerce/merchant-model.ts` 新增维度口径纯函数：`mergeDimensionRows`
（钱+单两侧合并，营收=收入−退款单一真源）、`sumEconomicCore`（合计重算比率）、
`sharePct` / `unitAvg` / `markRepeatRows`（成交≥2 即复购）/ `buildRepeatSummary`
（复购拆分）。`storage/merchant-board.ts` 三份 ~350 行内联循环改为喂数
（1266 → 1146 行）；既有 41 条 sqlite 回归全绿 —— 口径改一处，三卡生效。

### ✅ 候选 6 —— run-sessions 合成回放归位（第一批已完成 2026-11-24）
评审修正：`synthesizeTeamRun` 不是死 demo —— 它是 `?fallback=synthetic` 的
正式兜底路径（BYOK 配错 / 离线时用），不能删。已整模块搬到
`routes/runs/run-sessions/synthetic-run.ts`（2492 → 2253 行，行为逐字对齐）。
⏭ 待做：真编排（非合成路径）提取为 runs use_case。

### ✅ 候选 5 —— 双后端 seam 收口（已执行 2026-11-24，ADR-0001 Accepted）
owner 拍板「立即彻底退役」：backend/python 整目录删除、render.yaml/vercel.json/
Dockerfile.api 删除、compose 去 python 成员、proxy-fallback/python-backend 删除、
backend-mode 墓碑化（恒 single）、dev.mjs/package.json/CONTRIBUTING 同步清理、
PYTHON_BACKEND_URL → BACKEND_URL（指向 Node 自身 loopback）。
全量 1906/1906 测试 + arch-check 绿。决定记录：`documentation/ADR-0001-single-backend.md`。
⏭ 仍开放：BACKEND_GAP 12 组端点族迁入 node（现在命中即显式 404）；
散点死分支随改随清。**frontend/legacy 逃生舱在 Node 未覆盖的子路径上会 404。**

### 次级雷达（排期后置）
fs-browse 写路径安全规则抽 fsGateway、memory-handoff 用例上移、analytics 告警
规则进 usage-model、plan-gate 拆 model/infra、permission-policy v1/v2 收敛、
figma-plugin 两代合一。

## 六、ARC 工作台 Milestones（在 paper 前端上演进）

- **M0（已完成 2026-11-24）** 产物 tab 接线 —— 会话工作目录可浏览、文本/图片可预览。
- **M1（已完成 2026-11-24）管线视图**：`mappers.applyRunState` 把会话流里的真实动静
  投影到存图节点（交过话 → done + 交付摘录；roster busy → running；其余 wait）；
  有「审批」交接进入的节点显示门徽标（虚线框 + 盾牌角标）；选中节点在页脚显示
  「最近交付」摘录。纯数据层投影，无新端点，`arc.test.ts` 钉住行为。
- **M2（已完成 2026-11-24）结果检查**：
  - 产物 tab 识别 ARC 目录约定置顶打标（`data/arc.ts` 纯函数）✅
  - **PDF 终稿预览**：浏览器原生 `<iframe>` 直链（`/api/fs/raw`），零新依赖 ✅
  - **引用核验清单**：`verification_report.json` 渲染成 verified/存疑/虚构 清单 ✅
  - **「管线」tab（第二批，本批）**：右栏新页直接观测 23 阶段 run——
    后端 `domains/research/`（model 23 阶段目录 + 状态推断纯函数 /
    repository 接口 / infra 文件扫描 / use_cases / adapters `/api/arc/*`），
    前端 `data/http/arc.ts` 映射 + `panel/PipelineView.tsx`（相位分组时间线、
    审批门徽标、多轮 attempt 计数、decision（proceed/refine/pivot）、
    耗时、引用核验、质量门裁决、决策史、终稿与交付、运行中 10s 轮询）。
    判定规则：decision.json 的 status 优先，其次 checkpoint 断点，
    再其次「目录在但 decision 未落 = running」；多轮 attempt 冲突取最高轮次
    （真实数据里 stage-13 原始轮 retry、v2 done，曾靠 I/O 完成顺序定胜负——已修）。
- **M3 干预**：把 HITL（approve/reject/guide）包进 WorkspaceSource 新动作；
  univer 预览 experiment 表格（可选）。
- **M4 观测**：cost/用量条接 ARC budget；SSE → WebSocket adapter 评估；
  「管线」tab 从 10s 轮询升级为 `/api/groups/:id/events` SSE 或 ARC ws 事件流。

每步验收同 §五门槛；新增规则文案一律进 `src/content`，数据一律过
`WorkspaceSource`（`check-conventions.mjs` 机检）。

## 七、词汇表

见仓库根 `GLOSSARY.md`（本次评审起建立；深化命名先查后加）。
