# Story 5.3: 0G Storage 下载 + Merkle 验证

Status: ready-for-dev

## Story

As a **用户**,
I want **通过 CID 下载 trajectory,且验证数据完整性**,
so that **我能信任从 0G 克隆的模板未被篡改**。

## Acceptance Criteria

### AC1 — CID 下载 + Merkle 验证 + 成功渲染

**Given** 用户粘贴 CID 到 `/import` 页面输入框
**When** 点 "Load"
**Then** 前端调 SDK 下载 + 本地 Merkle root 验证
**And** 验证通过 → 渲染模板,顶部显示 "✓ 0G Storage · CID 验证通过"

### AC2 — 验证失败 → Toast 不加载

**Given** Merkle 验证不通过
**When** SDK 返回 error 或校验失败
**Then** 验证失败 → Toast "Merkle 验证失败,数据可能被篡改",不加载

## Tasks / Subtasks

- [ ] **AC1 — zerogStorage 下载 API**
  - [ ] 扩展 `src/adapter/zerogStorage.ts`,新增 `downloadTrajectory(cid: string): Promise<{bytes, verified: true}>`
  - [ ] 构造 `Indexer(STORAGE_INDEXER)`,调用 `indexer.download(cid, outputPath, true)`(第三参 `verified=true` 启用 Merkle 校验,AR36)
  - [ ] 必须 try/catch:`download()` **既可能 throw,也可能返回 error**(0G skill 契约,见 SKILL.md Core Rules)— 两路都要处理
  - [ ] 浏览器环境下 `outputPath` 用 Blob URL 或内存 Uint8Array(取决于 SDK 支持);若浏览器下载需要代理,走 `shadowflow/integrations/zerog_storage.py` fallback
  - [ ] CID 格式校验:下载前用正则 `/^0x[a-fA-F0-9]{64}$/` 拒绝非法输入,不浪费网络往返
- [ ] **AC1 — /import 页面一级入口**
  - [ ] 新建 `src/pages/ImportPage.tsx`,对应 `/import` 路由(AR15 一级入口,不藏二级菜单)
  - [ ] 输入框 + "Load" 按钮 + 历史 CID 列表(localStorage 缓存最近 10 条)
  - [ ] 成功后顶部绿色 Banner:`✓ 0G Storage · CID <短 CID> 验证通过`,含 0G Explorer 外链按钮
  - [ ] 模板渲染调用现有 `loadTemplateFromYaml(bytes)` 路径(与本地导入共享)
- [ ] **AC2 — 验证失败处理**
  - [ ] `downloadTrajectory` 捕获任何 error(throw 或返回)→ 统一抛 `MerkleVerificationError`
  - [ ] UI 使用 `sonner` 或现有 Toast 系统显示红色 Toast:`Merkle 验证失败,数据可能被篡改`
  - [ ] 不渲染任何模板内容,Editor 状态保持 empty
  - [ ] 失败日志本地保留 `{cid, error_type, timestamp}`,供用户复制提交 issue(不含密钥)
- [ ] **性能与稳定性**
  - [ ] 下载超时 ≤ 15s,超时 Toast "下载超时,请检查 CID 或网络"
  - [ ] 并发保护:同一 CID 下载中禁用 "Load" 按钮
  - [ ] 单元:mock `indexer.download` 两种错误路径(throw + error 返回)均被捕获
  - [ ] E2E 覆盖 J4:Import → Merkle 验证通过 → 模板渲染

## Dev Notes

### 架构依据
- Epic 5 Goal:链上可验证的核心就在下载侧的 Merkle proof 校验,没有这一步 CID 只是 URL,不是可信资产
- 相关 AR(AR15 Import 一级入口、AR19 SDK 封装、AR34 ethers v6、AR36 ZgFile finally)
- 相关 FR/NFR(FR32 CID 导入、FR33 Merkle 验证;S3 数据完整性、I2 合规、I3 0G 调用成功率)

### 涉及文件
- 前端:
  - `src/adapter/zerogStorage.ts` — AR19 下载 + Merkle 验证封装
  - `src/pages/ImportPage.tsx` — AR15 `/import` 路由,Import by CID 一级入口
  - `src/components/CidVerifiedBanner.tsx` — 成功标识 Banner
- 后端(fallback):
  - `shadowflow/integrations/zerog_storage.py` — 浏览器 SDK 不支持场景的代理下载

### 0G Skill ALWAYS/NEVER 规则(必须遵守)
- **processResponse()** 本 Story 不涉及推理(Story 5.4 处理),但同仓 compute 路径每次推理后必调(AR35)
- **evmVersion** `"cancun"`(AR34)
- **ethers v6** 不用 v5(AR34)
- **ZgFile** 下载链若打开本地 file handle 必须在 `finally` 关闭(AR36);浏览器 Blob 无需显式关闭但需 `URL.revokeObjectURL`
- **私钥** 下载通常不需要私钥,但若 SDK 要求签名必从 localStorage 取(S1/AR37)
- **download()** 可能 throw **也可能返回 error** — 必须 try/catch + 检查 error,两路都要处理(SKILL.md Core Rules 明确)
- **verified=true** 生产环境下载必开,本 Story 硬编码第三参为 `true`,不给 UI 选项禁用

### 关键约束
- 下载必须 Merkle 验证(S3):失败不加载,仅显示 Toast,不给"忽略警告继续"按钮
- Import by CID 必须**一级入口**(AR15/FR32):放在顶部导航栏,不藏二级菜单
- 超时阈值 15s,考虑 0G Storage 冷数据可能慢;过长需告警
- CID 不可信来源:正则校验 → 格式合法 → 才发请求,防止恶意 payload

### 测试标准
- 单元 `src/adapter/__tests__/zerogStorage.download.test.ts`(mock throw + mock error-return 两条失败路径)
- E2E Playwright 覆盖 J4(跨 persona CID 克隆):Import → Merkle 验证 → 模板渲染 → 编辑 → 重归档(与 Story 5.5 联调)
- 0G Compute 成功率压测(Story 5.4 覆盖,但下载侧统计同一 dashboard)
- 合约扫描 `scripts/check_contracts.py` 无私钥泄漏(AR4)

## References

- [Source: epics.md#Story 5.3]
- [Source: .0g-skills/CLAUDE.md]
- [Source: .0g-skills/skills/storage/download-file/SKILL.md]
- [Source: .0g-skills/skills/storage/merkle-verification/SKILL.md]
- [Source: architecture.md#Data Architecture]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
