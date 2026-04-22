# Story 5.5: Import by CID + 作者署名链

Status: ready-for-dev

## Story

As a **跨 persona 克隆者(J4)**,
I want **通过 CID 导入模板 + 修改后重归档 + 署名链自动累积**,
so that **模板传承链可追溯,为 Phase 3 INFT 铸造留 metadata 基础**。

## Acceptance Criteria

### AC1 — Import by CID 一级入口 + 署名链展示

**Given** `/import` 页面提供 "Import by CID" 一级入口(不藏在二级菜单)
**When** 用户输入 CID 并加载
**Then** 模板加载 + Merkle 验证 + 署名链展示(`author_lineage: ["Alex", "Jin"]`)

### AC2 — 修改后重归档 + 作者追加 + 原 CID 不可变

**Given** 用户修改模板(如新增角色)并点 "Publish to 0G"
**When** 前端重新归档
**Then** 上传产出新 CID
**And** 新 trajectory metadata 中 `author_lineage` 自动追加当前用户标识
**And** 原 CID 的 trajectory 不被修改(永久不可变,符合 PRD GDPR 应对)

## Tasks / Subtasks

- [ ] **AC1 — Import 一级入口 + 署名链 UI**
  - [ ] `src/pages/ImportPage.tsx`(Story 5.3 已建)扩展:解析 `trajectory.metadata.author_lineage`(string[])
  - [ ] 顶部导航栏常驻 `Import` 入口(AR15 一级入口,**不藏在 Settings/二级菜单**)
  - [ ] 成功加载后显示:
    - CID 短标识 + 0G Explorer 外链
    - Merkle 验证通过 Banner(Story 5.3)
    - `AuthorLineageChip.tsx`:横向 chip 链 `Alex → Jin → (You?)`,最后一段高亮"未归档"状态
  - [ ] 若 `author_lineage` 字段缺失 → 展示 "origin: anonymous" 作为默认起点
- [ ] **AC1 — trajectory metadata schema**
  - [ ] 约定 `trajectory.metadata.author_lineage: string[]`,元素格式 `{alias}@{fingerprint}` 其中 `fingerprint` 是 wallet 地址的前 8 位(不暴露完整地址)
  - [ ] 新增 `shadowflow/runtime/lineage.py`:`append_author(trajectory, author)` 返回新 trajectory(不可变操作)
  - [ ] 约定字段放于 `trajectory.metadata`,与 Story 5.2 sanitize 白名单兼容(metadata 不被 sanitize 剔除)
- [ ] **AC2 — 修改重归档流程**
  - [ ] `EditorPage.tsx` 点 "Publish to 0G" 触发:
    1. 调 `sanitize_trajectory`(Story 5.2)+ 用户确认
    2. **自动追加** `author_lineage`:从 `useSecretsStore` 取当前 wallet 地址的 fingerprint,从 Settings 取 `userAlias`,拼 `${alias}@${fp}` push 到 lineage
    3. 调 `zerogStorage.uploadTrajectory`(Story 5.1)获得新 CID
    4. 成功后 Toast "已发布:新 CID `0xabc…`",并跳转 `/import?cid=<new>` 显示新 lineage chain
  - [ ] **不可变保证**:重归档产生**新 CID**,原 CID 的 trajectory 在 0G Storage 内容不变(这是 0G 存储本身的不可变特性,不需额外代码;但测试需验证原 CID 仍可下载且 lineage 未被污染)
  - [ ] 前端 guard:不允许"覆盖上传",只允许"发布为新 CID"
- [ ] **AC2 — GDPR / 不可变语义文档**
  - [ ] `ImportPage` 底部增加 Tooltip:`上链后永久不可变,请确认已通过 sanitize。如需撤销,请申请新 CID 并弃用旧链接(PRD GDPR 应对)`
  - [ ] `src/pages/AboutPage.tsx` 的 Roadmap Section 补一条"Phase 3 INFT:author_lineage 作为铸造 metadata 基础"
- [ ] **测试**
  - [ ] 单元 `tests/test_lineage.py`:`append_author` 不修改原 trajectory(深拷贝返回);fingerprint 截断正确;缺失 lineage 时初始化 `[]`
  - [ ] E2E J4 流程:
    1. Alex 创建模板 → Publish → 得到 CID-A(lineage = ["alex@0x12345678"])
    2. Jin(不同浏览器 profile)打开 `/import`,粘 CID-A → Merkle 验证通过 → 看到 lineage chip
    3. Jin 编辑 + Publish → 得 CID-B(lineage = ["alex@0x12345678", "jin@0xabcdef01"])
    4. 回头访问 CID-A:lineage 仍只有 Alex(原 CID 不可变验证)
  - [ ] 视觉回归:`AuthorLineageChip.tsx` Storybook 快照 1/2/3 人场景

## Dev Notes

### 架构依据
- Epic 5 Goal:模板成为链上可验证**且可溯源**的资产,author_lineage 是 Phase 3 INFT 铸造的 metadata 基础
- 相关 AR(AR14 author_lineage、AR15 Import 一级入口、AR19 SDK 封装)
- 相关 FR/NFR(FR32 Import by CID 一级入口、FR33 Merkle 验证、FR34 署名链;I2 合规、P6 单次上传 ≤ 10s)

### 涉及文件
- 前端:
  - `src/pages/ImportPage.tsx` — AR15 `/import` 路由,Import by CID 一级入口
  - `src/components/AuthorLineageChip.tsx` — 新增,横向 chip 署名链
  - `src/pages/EditorPage.tsx` — Publish 流程追加 lineage
  - `src/adapter/zerogStorage.ts` — Story 5.1 上传封装(本 Story 复用)
  - `src/core/hooks/useSecretsStore.ts` — Story 5.1 读取 wallet fingerprint
- 后端:
  - `shadowflow/runtime/lineage.py` — `append_author` 不可变操作
  - `shadowflow/runtime/sanitize.py` — Story 5.2 需保证 `metadata.author_lineage` 白名单内不被剔除
- 测试:
  - `tests/test_lineage.py` — 作者追加与不可变性
  - `tests/e2e/import-lineage.spec.ts` — J4 跨 persona 克隆闭环

### 0G Skill ALWAYS/NEVER 规则(必须遵守)
- **processResponse()** 本 Story 不涉及 compute 推理(Story 5.4 处理),但若 lineage 内含 AI 分析步骤,推理后必调(AR35),参数顺序 `(providerAddress, chatID, usageData)`
- **evmVersion** `"cancun"`(AR34)
- **ethers v6** 不用 v5(AR34);wallet fingerprint 用 `wallet.address.slice(2, 10)`
- **ZgFile** 上传后 `finally` 关闭(AR36)— 复用 Story 5.1 封装
- **私钥**仅从 localStorage,永不硬编码 / 永不上链 / 永不写入 trajectory metadata(S1/AR37)—
  author_lineage 仅存 **alias + fingerprint(地址前 8 位)**,**不存私钥、不存完整地址**
- **upload** 返回 `[result, error]` tuple — 两路都要处理
- **download** 可能 throw 也可能返回 error — 必须 try/catch + 检查 error(Story 5.3 已覆盖)

### 关键约束
- Import by CID 必须**一级入口**(AR15/FR32):顶部导航栏常驻,不藏二级菜单
- `author_lineage` 是追加操作,不是覆盖;旧 lineage 元素顺序不得变
- 修改模板重归档时 `author_lineage` **自动追加**当前用户,原 CID 不被修改(0G Storage 内容寻址天然不可变)
- GDPR 应对:`trajectory` 上链后**不可删**,sanitize 是唯一防线;Import UI 必须展示不可变 Tooltip
- fingerprint 脱敏(仅前 8 位)防止全地址被公开用作身份追踪

### 测试标准
- 单元 `tests/test_lineage.py`:append 不可变、fingerprint 截断、缺失默认空数组
- E2E 覆盖 J4(跨 persona CID 克隆):Import → Merkle 验证 → 修改 → 重归档 → 新 CID + lineage 追加 → 原 CID 回访验证 lineage 未变
- 集成:sanitize(Story 5.2)+ upload(Story 5.1)+ download(Story 5.3)+ lineage(本 Story)全链路
- CI `scripts/check_contracts.py` 扫 API key / 完整私钥泄漏(AR4)

## References

- [Source: epics.md#Story 5.5]
- [Source: .0g-skills/CLAUDE.md]
- [Source: .0g-skills/skills/storage/upload-file/SKILL.md]
- [Source: .0g-skills/skills/storage/download-file/SKILL.md]
- [Source: architecture.md#Data Architecture]
- [Source: prd.md#Measurable Outcomes]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
