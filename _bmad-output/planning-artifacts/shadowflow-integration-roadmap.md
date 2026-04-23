---
name: shadowflow-integration-roadmap
title: ShadowFlow × Shadow 集成路线
status: draft
created: 2026-04-15
updated: 2026-04-15
owner: Jy
purpose: Product Brief 「技术可行性」章节底稿；说明 ShadowFlow 在黑客松交付后如何合入 Shadow 桌面应用
---

# ShadowFlow × Shadow 集成路线

## 一、产品边界

ShadowFlow 与 Shadow 是**两个互补产品**，不是同一个产品的两种形态。

| 产品 | 核心职责 | 类比 |
|------|----------|------|
| **ShadowFlow** | AI 协作团队设计器 + 多智能体执行引擎 | CAMEL 的脑子 + N8N 的手感 |
| **Shadow** | 文件 / 知识 / 记忆的索引宿主 + 桌面应用 | 作用于文件夹之上的智能助手 |

- 黑客松交付产物 = ShadowFlow（独立 Web 应用）
- 黑客松后 → ShadowFlow 作为 Shadow 的「执行层」接入桌面版；Shadow 提供「记忆层」反哺 ShadowFlow

边界已经写在 `ShadowFlow/docs/SHADOW_AGENTGRAPH_RESPONSIBILITY_MATRIX.md`，接口契约稳定。

---

## 二、现有资产盘点

### 已完成（不必重做）

- **ShadowFlow Python runtime Phase 1**：workflow schema、policy_matrix、stages / lanes、6 个角色原型、3 个 preset、checkpoint 契约
- **4 个 provider adapter**：Codex CLI、Claude CLI、OpenAI API、Anthropic API（对应"Agent 自选 AI 语言"这一层）
- **0G KV checkpoint store stub**（`pip install shadowflow[zerog]`）
- **Shadow 前端图渲染组件**：PixiJS GPU 加速，d3-force 物理布局，几百节点不卡
- **责任矩阵文档**：Shadow ↔ ShadowFlow 的输入输出契约已定义

### 前端同栈优势

- Shadow：React 18 + ReactFlow 11 + Zustand + Tailwind
- ShadowFlow：React 18 + ReactFlow 11 + Zustand + Tailwind
- **两边完全同栈**，组件可直接互搬，视觉语言天然统一

---

## 三、三阶段集成路线

### 阶段 1 · 黑客松（至 2026-05-16）—— 不集成

**交付形态：** ShadowFlow 独立 Web 应用
- Python FastAPI 后端（已有）
- React 前端（编辑器 + 看板）
- 本地启动，浏览器访问，方便评委 5 分钟跑完一个 demo
- trajectory 归档至 0G Storage（证明链上原生能力）

**刻意不做：**
- 不打包 Tauri
- 不接 Shadow 知识库
- 不做多用户 / 企业版

**Demo 叙事：** "桌面集成已在路线图中，本次先交付能跑的 Web MVP。"

---

### 阶段 2 · 集成（黑客松后 2-3 周）—— Sidecar 合体

**策略：** Tauri Sidecar + PyInstaller 单文件打包

```
┌────────────────────────────────────────────────┐
│  Shadow 桌面应用 (Tauri exe)                   │
│  ┌──────────────┐  ┌─────────────────────────┐ │
│  │  React 前端  │←→│ Rust 后端 (shadow-core) │ │
│  │  (共用组件)  │  │  知识库 / 记忆 / 图谱   │ │
│  └──────┬───────┘  └──────────┬──────────────┘ │
│         │                     │                │
│         │  HTTP (127.0.0.1)   │                │
│         ↓                     ↓                │
│  ┌──────────────────────────────────────────┐  │
│  │ shadowflow.exe (Python sidecar 子进程)   │  │
│  │  FastAPI + policy_matrix + runtime       │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**具体工作量：**

| 任务 | 代码量 | 负责方 |
|------|--------|--------|
| PyInstaller 配置，把 ShadowFlow 打成单 exe | ~50 行 spec | Codex |
| Tauri `externalBin` 声明 sidecar | ~10 行 JSON | 人工 |
| Rust 侧 `shadowflow_client.rs`（HTTP 客户端 + 子进程生命周期）| ~200 行 | Codex + 人工联调 |
| 前端改调 Tauri invoke 转发到 ShadowFlow | ~30 行 | Codex |
| Windows 打包调试（杀软误报、端口冲突、签名）| — | 人工 3-5 天 |

**风险与 mitigation：**

| 风险 | 概率 | 缓解方案 |
|------|------|----------|
| Windows Defender 误报 PyInstaller 产物 | 中 | 对 exe 做代码签名；或换 PyOxidizer |
| Python 冷启动 2-3 秒 | 高 | 后台 spawn，前端显示"引擎启动中"动画 |
| 端口冲突 | 低 | 启动时选随机端口，通过 stdout 告知 Rust |
| 子进程崩溃 | 低 | Rust 侧监听事件，自动重启 + toast 提示 |

---

### 阶段 3 · 演化（长期，按需触发）—— 分层下沉

**原则：** 只在遇到具体瓶颈时动手，不预先优化。

| 触发条件 | 下沉方案 |
|---------|---------|
| Trajectory 高频写盘慢 | writeback 层改调 Shadow Rust 的 `write_artifact`，Rust 用 blake3 + rusqlite 写 |
| 消息总线高并发瓶颈 | 总线用 Rust 实现，暴露 HTTP；Python 仅做编排决策 |
| 知识库召回延迟 | ShadowFlow memory 层调 Shadow 的 `graph_query_*` 命令，走 Rust 向量召回 |

**永久保留在 Python：** LLM provider adapter（生态最成熟）、workflow schema 校验（pydantic 强项）、policy_matrix 语义层。

---

## 四、技术选型对照（与参照产品）

| 层级 | CAMEL-AI | N8N | Shadow × ShadowFlow | 评价 |
|------|----------|-----|---------------------|------|
| AI 编排核心 | Python | ❌ 无 | **Python**（ShadowFlow）| 同 CAMEL，生态最完整 |
| 可视化编辑器 | ❌ 无 | Vue + TS | **React + TS** | 比 N8N 的 Vue 更主流 |
| 桌面宿主 | ❌ 无 | ❌ 无（仅 Web）| **Rust + Tauri**（Shadow）| 两者都没有，差异化能力 |

三层栈完整覆盖"CAMEL + N8N"组合的全部能力域，并额外提供桌面化这一差异点。

---

## 五、结论

- **集成债可控，有标准工程方案。**
- **前端同栈 + 契约已定** = 最艰难的 60% 工作已在黑客松前完成。
- **Sidecar + PyInstaller** 是业内成熟路径，2-3 周工期可落地。
- **Python / Rust 分工稳定**：编排 AI 生态用 Python，性能与桌面分发用 Rust，不互相替代。

**给评委的一句话承诺：**
> "Web MVP 今天可跑，桌面版在路线图中，集成方案已设计完毕，工程风险可量化。"
