# Story 5.4: 0G Compute 作为第 5 Provider 接入

Status: ready-for-dev

## Story

As a **技术评委**,
I want **看到 0G Compute 真实被用于推理,不是装饰**,
so that **ShadowFlow 是 0G 原生不是贴标签(PRD 辨识度要求)**。

## Acceptance Criteria

### AC1 — 第 5 Provider 实现 + processResponse 契约

**Given** `shadowflow/llm/zerog.py` 新增,继承 `LLMProvider`
**When** 节点配置 `provider: "0g_compute"` 并运行
**Then** 底层通过 OpenAI SDK 改 `base_url` 调用 0G Compute 端点
**And** 每次推理后调 `processResponse(providerAddress, chatID, usageData)`(0G skill 契约)
**And** ChatID 从 `ZG-Res-Key` header 提取,`data.id` 作 fallback

### AC2 — 推理成功率 ≥ 95%

**Given** 0G Compute 调用成功率统计
**When** 连续跑 100 次推理
**Then** 成功率 ≥ 95%(I3)

## Tasks / Subtasks

- [ ] **AC1 — LLMProvider 子类实现**
  - [ ] 新建 `shadowflow/llm/zerog.py`,`class ZeroGComputeProvider(LLMProvider)`
  - [ ] 注册到现有 provider registry,使 `provider: "0g_compute"` 在 WorkflowDefinition 合法
  - [ ] 初始化:从 `.env` 读 `ZEROG_PRIVATE_KEY` / `ZEROG_RPC_URL` / `ZEROG_PROVIDER_ADDRESS`,构造 `ethers.Wallet` 和 `createZGComputeNetworkBroker(wallet)`(后端用 Node 子进程或纯 Python HTTP;若走 Python,需手签 header)
  - [ ] 启动时 `acknowledgeProvider()` 并校验 `checkBalance()`;balance 不足抛 `ProviderUnavailableError`
- [ ] **AC1 — 推理调用 + chatID 提取**
  - [ ] `async def chat(messages, **kwargs) -> ChatResponse`:
    1. `{endpoint, model} = broker.inference.getServiceMetadata(providerAddress)`
    2. `headers = broker.inference.getRequestHeaders(providerAddress, prompt_text)`
    3. `POST {endpoint}/chat/completions`,body `{messages, model}`
    4. **ChatID 提取逻辑(硬契约)**:
       ```python
       chat_id = response.headers.get("ZG-Res-Key") or response.headers.get("zg-res-key")
       if not chat_id:
           chat_id = data.get("id")  # fallback for chatbot
       if not chat_id:
           raise MissingChatIdError("0G response missing ZG-Res-Key header and data.id")
       ```
    5. **必调**:`await broker.inference.processResponse(providerAddress, chat_id, json.dumps(data["usage"]))` — 参数顺序 **不得颠倒**(AR35)
  - [ ] 完整签名硬编码断言:`processResponse(providerAddress: str, chatID: str, usageData: str)` 三参,缺一报错
  - [ ] `usageData` 必须是 `data.usage` 字段的 JSON 字符串序列化(不是 dict)
- [ ] **AC1 — Streaming 支持**
  - [ ] 流式响应同样提取 `ZG-Res-Key`(SSE 起始 header)
  - [ ] Stream 结束后才调 `processResponse`,确保 `usage` 字段已从最终 chunk 聚合
  - [ ] 若 Stream 中断:记录 chatID + partial usage,尝试 fire-and-forget `processResponse`(避免计费漏结算)
- [ ] **AC2 — 成功率压测脚本**
  - [ ] 新建 `scripts/bench_zerog_compute.py`:连续跑 100 次 `chat({"role":"user","content":"ping"})`,统计成功率、p50/p95 延迟
  - [ ] 成功定义:HTTP 200 + `processResponse` 不抛错
  - [ ] 阈值门禁:成功率 < 95% 退出码 1,CI 可选接入但默认手动触发
  - [ ] 输出 `_bmad-output/benchmarks/zerog-compute-{date}.json`
- [ ] **错误处理 + 监控**
  - [ ] 网络超时 30s,重试 1 次(幂等 POST 谨慎)
  - [ ] 余额不足 → `InsufficientBalanceError`,前端 Toast "0G Compute 余额不足,请充值"
  - [ ] `listService()` 返回的是 tuple 数组,用 index 访问:`s[0]=providerAddress`、`s[1]=serviceType`、`s[6]=model`、`s[10]=teeVerified`(0G skill 契约,不用对象属性)

## Dev Notes

### 架构依据
- Epic 5 Goal:0G Compute 是"0G 原生"的核心证据,评委一眼看出真用了 compute 不是装饰
- 相关 AR(AR13 第 5 provider、AR34 ethers v6/cancun、AR35 processResponse 必调)
- 相关 FR/NFR(FR34 0G Compute provider;I3 调用成功率 ≥ 95%)

### 涉及文件
- 后端:
  - `shadowflow/llm/zerog.py` — AR13 第 5 provider + processResponse 契约
  - `shadowflow/llm/base.py` — 若需扩展 provider 接口
  - `shadowflow/llm/__init__.py` — 注册新 provider
- 脚本:
  - `scripts/bench_zerog_compute.py` — 100 次推理成功率压测
- 测试:
  - `tests/test_zerog_provider.py` — chatID 提取 / processResponse 参数顺序 / tuple 访问

### 0G Skill ALWAYS/NEVER 规则(必须遵守)
- **processResponse()** 每次推理后**必调**(AR35),完整签名:
  ```
  processResponse(providerAddress: str, chatID: str, usageData: str)
  ```
  参数顺序不得颠倒,跳过会导致计费结算失败
- **ChatID 提取顺序(硬契约)**:`ZG-Res-Key` header **优先**,`data.id` 仅作 chatbot fallback;两者都没有必须报错而非静默
- **evmVersion** `"cancun"`(AR34 Phase 3)
- **ethers v6** 不用 v5(AR34)
- **ZgFile** 本 Story 不直接涉及文件上传
- **私钥**仅从 `.env`(后端)或 localStorage(前端)加载,永不硬编码(S1/AR37)
- **acknowledgeProvider** 首次使用前必须调
- **checkBalance** 每次 chat 前检查(或启动检查 + 低水位告警)
- **listService()** 返回 tuple 数组,**不是对象**:`s[0]` providerAddress、`s[1]` serviceType、`s[6]` model、`s[10]` teeVerified
- **getLedger()** 返回 tuple:`account[1]` totalBalance、`account[2]` availableBalance

### 关键约束
- 0G Compute 成功率 ≥ 95%(I3):bench 脚本守门,低于阈值阻止发版
- `processResponse` 参数顺序错一个字符就出错 — 代码里加 assertion 防回归
- Stream 中断也要尽力结算(fire-and-forget processResponse),避免 provider 侧账款悬挂
- 密钥绝不硬编码 / 写入日志 / 写入 trajectory metadata(S1)

### 测试标准
- 单元 `tests/test_zerog_provider.py`:
  - mock response header 有 `ZG-Res-Key` → 正确提取
  - mock header 缺失 + body 有 `id` → fallback 生效
  - 两者都缺 → 抛 `MissingChatIdError`
  - `processResponse` 调用参数顺序断言(mock spy)
- 集成:真 0G testnet 跑 100 次 `scripts/bench_zerog_compute.py`,成功率 ≥ 95%
- CI `scripts/check_contracts.py` 扫私钥泄漏(AR4)

## References

- [Source: epics.md#Story 5.4]
- [Source: .0g-skills/CLAUDE.md]
- [Source: .0g-skills/skills/compute/streaming-chat/SKILL.md]
- [Source: .0g-skills/skills/compute/account-management/SKILL.md]
- [Source: architecture.md#Services & External Integrations]

## Dev Agent Record

### Agent Model Used

{待 dev 填写}

### Debug Log References

### Completion Notes List

### File List
