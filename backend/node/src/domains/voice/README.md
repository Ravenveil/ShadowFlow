# voice 域（语音输入转写）

按「内外分层 + 按业务聚合」从 `routes/system/asr.ts` 抽出（2026-11-19，第 1 批）。

- `adapters/asr.ts`：`POST /api/asr/transcribe` 的 Express 路由 + OpenAI 兼容 `/audio/transcriptions` 与小米 `chat-audio` 两种上游形态。当前实现自带 HTTP 适配与 BYOK key 解析；后续可把 key 解析/基址归一上提到 `shared/adapters`，本域仅留转写用例。
- 旧路径 `routes/system/asr.ts` 保留为兼容 re-export，调用方与测试无需改动；确认无引用后单独一步删除。

边界：语音转写是独立业务能力，不读写记忆库/OPC/看板等域的数据；上游 Key 走请求头 BYOK 或服务端 env，与 `llm.ts` 共享约定。

验证：`npx vitest run src/__tests__/asr.test.ts` + `npm run build`（tsc）。
