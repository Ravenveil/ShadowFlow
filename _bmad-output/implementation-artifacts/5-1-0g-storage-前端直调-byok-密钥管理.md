# Story 5.1: 0G Storage 前端直调 + BYOK 密钥管理

Status: ready-for-dev

## Story

As a **用户**,
I want **我的 0G 密钥仅存储于本地 localStorage,前端直接上传 trajectory 到 0G**,
so that **后端永不接触我的密钥(S1 BYOK)**。

## Acceptance Criteria

### AC1 — 密钥仅在浏览器存储与解密

**Given** `src/adapter/zerogStorage.ts` 封装 `@0glabs/0g-ts-sdk`
**When** 用户在设置页输入 0G 私钥
**Then** 密钥以加密形式(Web Crypto API)存储到 localStorage,内存中解密使用
**And** 密钥**不出现**在任何 network request payload、log、error message(S1)

### AC2 — 前端直调 SDK 签名上传,不经后端

**Given** 用户发起 0G Storage 上传
**When** 前端调用 SDK
**Then** SDK 直接签名并提交到 0G Storage 端点(不经过 `shadowflow-api`)
**And** 单次上传 ≤ 10s(P6),返回 CID

## Tasks / Subtasks

- [ ] **AC1 — BYOK 密钥管理 Hook**
  - [ ] 新建 `src/core/hooks/useSecretsStore.ts`,Zustand store 仅在内存持有解密后的私钥
  - [ ] 加密方案:Web Crypto API `AES-GCM` + 用户设置页输入的 passphrase 派生 key(`PBKDF2`,迭代 ≥ 100000)
  - [ ] `putPrivateKey(pk, passphrase)` / `getPrivateKey(passphrase)` / `clear()` 三个 API
  - [ ] localStorage 键 `shadowflow.secrets.0g` 仅存 `{cipher, iv, salt}`,不存明文
  - [ ] 单元测试:刷新页面后需 passphrase 再次解密;清空内存不影响 localStorage 密文
- [ ] **AC1 — 密钥泄漏防护检查**
  - [ ] Axios/fetch 请求拦截器拒绝任何 body 或 header 含 `0x[0-9a-f]{64}` 匹配的私钥模式
  - [ ] 全局 console 包装:error/warn/log 过滤命中 `sk-`、`0x[0-9a-f]{64}` 的字符串
  - [ ] 扩展 `scripts/check_contracts.py`(AR4)加入前端文件扫描,CI 检查
- [ ] **AC2 — zerogStorage 适配器(前端直调)**
  - [ ] 新建 `src/adapter/zerogStorage.ts`,依赖 `@0glabs/0g-ts-sdk` + `ethers` v6
  - [ ] `uploadTrajectory(bytes, passphrase): Promise<{cid, txHash}>`:从 Hook 取密钥 → `new ethers.Wallet(pk, provider)` → `Indexer.upload(file, rpcUrl, signer)` 处理 `[result, error]` tuple 两路返回
  - [ ] 必须在 `finally` 分支调 `file.close()`(AR36/0G skill)
  - [ ] 读配置:`STORAGE_INDEXER` / `RPC_URL` 从 `vite` 环境变量注入(`VITE_ZEROG_*`)
- [ ] **AC2 — 后端 fallback(可选代理路径)**
  - [ ] `shadowflow/integrations/zerog_storage.py` 提供 `POST /workflow/runs/{id}/trajectory/upload_via_proxy`,仅在用户显式关闭 BYOK 时启用
  - [ ] 默认 feature flag `ZEROG_FRONTEND_DIRECT=true`,后端 endpoint 返回 403 并提示 BYOK 模式
- [ ] **性能与验证**
  - [ ] Playwright 测用例:10MB trajectory 上传 ≤ 10s(P6)
  - [ ] 网络 DevTools 断点检查:上传请求 host 为 0G Storage 端点,非 `api.shadowflow.*`
  - [ ] 集成 E2E:故意输入错误 passphrase → 解密失败 Toast,不触发 SDK

## Dev Notes

### 架构依据
- Epic 5 Goal:模板/trajectory 成为链上可验证资产,BYOK + sanitize + Merkle + author lineage 组成完整合规链
- 相关 AR(AR15 Import 一级入口、AR16 BYOK localStorage、AR19 SDK 封装、AR34 ethers v6/cancun、AR36 ZgFile finally、AR37 密钥不硬编码)
- 相关 FR/NFR(FR27 BYOK、FR29 前端直调;S1 密钥不出浏览器、P6 单次上传 ≤ 10s)

### 涉及文件
- 前端:
  - `src/adapter/zerogStorage.ts` — AR19 封装 `@0glabs/0g-ts-sdk`,前端直调
  - `src/core/hooks/useSecretsStore.ts` — AR16 localStorage 加密持久化 BYOK
  - `src/pages/SettingsPage.tsx` — 密钥录入/清除 UI
- 后端:
  - `shadowflow/integrations/zerog_storage.py` — 后端代理 fallback,默认禁用
- 脚本:
  - `scripts/check_contracts.py` — AR4 泄漏扫描扩展

### 0G Skill ALWAYS/NEVER 规则(必须遵守)
- **processResponse()** 本 Story 不涉及推理,但同仓 compute 路径必调(AR35)
- **evmVersion** `"cancun"`(AR34 Phase 3)
- **ethers v6** 不用 v5,`new ethers.JsonRpcProvider(RPC_URL)` / `new ethers.Wallet(pk, provider)`(AR34)
- **ZgFile** 上传后必须在 `finally` 调 `file.close()`(AR36)
- **私钥**仅从 `.env` 或 localStorage,永不硬编码、永不上链、永不写入 trajectory metadata(S1/AR37)
- **upload** 返回 `[result, error]` tuple,两路都要处理,不要假设 throw
- **Merkle tree** 必须在上传前生成(AR36,`ZgFile` API 默认行为,但需验证)

### 关键约束
- 密钥绝不经后端(S1):CI 扫描 + 运行时拦截器双保险
- 单次上传 ≤ 10s(P6),大 trajectory 需要 chunk/streaming
- BYOK feature flag 默认开启,用户可在 Settings 切换代理模式(但代理模式警告标红)
- passphrase 错误时 UI 必须给出明确错误,不泄漏密文细节

### 测试标准
- 单元 `src/core/hooks/__tests__/useSecretsStore.test.ts`(加密/解密/错误 passphrase)
- E2E Playwright:BYOK 上传 happy path + passphrase 错误 + 网络包嗅探断言
- CI `scripts/check_contracts.py` 扫 API key/私钥泄漏(AR4)

## References

- [Source: epics.md#Story 5.1]
- [Source: .0g-skills/CLAUDE.md]
- [Source: .0g-skills/skills/storage/upload-file/SKILL.md]
- [Source: architecture.md#Data Architecture]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
