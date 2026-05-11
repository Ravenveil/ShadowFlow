# AgentGraph Tests

当前 `tests/` 目录同时包含两类测试：

- Phase 1 contract baseline
  - `test_runtime_contract.py`
  - `test_runtime_examples.py`
- legacy baseline
  - `legacy/` 目录下的历史测试文件

## 默认执行规则

默认 `pytest -q` 只运行 Phase 1 contract baseline。

原因不是历史测试没有价值，而是它们主要覆盖以下 legacy surface：

- `AgentGraph` 图对象
- `SQLiteMemory` / `RedisMemory` 直接集成
- `SwarmRouter` / 旧 topology
- 旧工作流执行模型

这些内容当前不构成 Phase 1 runtime contract 的权威验收口径。

## 如何运行 legacy tests

```bash
pytest -q --run-legacy
```

当前 legacy tests 目录为：

```text
tests/legacy/
```

这样做的目的，是让“当前 contract baseline”和“历史 API / 实现回归”在目录结构上也显式分层，而不是继续依赖文件名单维护。

## 为什么要分层

当前 AgentGraph 主线目标是：

- 固定 workflow schema
- 固定 runtime request / run result / checkpoint contract
- 固定 CLI / HTTP API 同构执行路径

因此默认测试入口必须优先反映：

- 当前主线支持什么
- 当前主线还不支持什么

而不是让历史接口与旧实现细节持续污染默认基线。

---

## Wire-Contract Guard Tests (TypeScript)

2026-05-11 新增。运行环境：Node + tsx，不依赖 pytest / vitest。

这三个 test 文件不属于 Python 套件，而是「防 6 wire bug 同类问题再发」的结构性 guard。它们通过 `npx tsx` 直接跑，**不需要任何 build 步骤**，也不接入既有 vitest 流程（避免拖慢单测）。

### 这些 test 在防什么

2026-05-11 一天之内出了 6 个「wire 没接上」bug，共同模式都是「契约（contract）没有显式 testable」。这三个 guard 各自盯一类契约：

| 文件 | 防的 bug 模式 |
|------|--------------|
| `wire-contract.test.ts` | localStorage key 一边写一边不读（如 `sf.defaultExecutor` UI 写、`getGenerationSettings` 不读）— zombie 写或 phantom 读。 |
| `cli-spawn-smoke.test.ts` | CLI registry 的 `binary` / `version_arg` 设错（如 claude 缺 `--verbose`、某 CLI 用 `version` 子命令）— 本机真 spawn 一遍。 |
| `sse-parser-fixture.test.ts` | CLI 输出格式跟 parser 假设不同（如 claude `--verbose` 嵌套 envelope vs 扁平）— 用真 CLI 录像 fixture 喂 parser。 |

### 怎么跑

```bash
# 三个分别跑
npx tsx tests/wire-contract.test.ts
npx tsx tests/cli-spawn-smoke.test.ts
npx tsx tests/sse-parser-fixture.test.ts

# 一把跑（建议加进 root package.json 的 test:wire script）
npx tsx tests/wire-contract.test.ts && \
  npx tsx tests/cli-spawn-smoke.test.ts && \
  npx tsx tests/sse-parser-fixture.test.ts
```

任一非 0 exit 即视为 wire 契约违规 / CLI 实际不可用 / SSE parser 回归。

### 各自的 PASS / SKIP 规则

- **wire-contract.test.ts** — 扫 `src/` 和 `server/src/` 所有 `localStorage.{set,get}Item('sf.*')` / `setStoredString`/`getStoredString`/`setSetting`/`getSetting` 调用 + 所有常量声明 `const X_STORAGE = 'sf.xxx'`。
  - 0 unallowed zombie + 0 unallowed phantom = PASS
  - 一边引用、另一边合法缺失的 key（如 BYOK `sf_anthropic_key` 走 header）放在文件顶部 `ALLOWLIST` 里，必须写 reason
- **cli-spawn-smoke.test.ts** — 对 `KNOWN_CLIS` 每一项 `spawnSync(binary, [version_arg])`：
  - exit 0 + stdout 非空 → ✓ pass
  - 不在 PATH → ⊘ skip（不 fail，未装而已）
  - 在 PATH 但 `--version` 非 0 → ✗ fail（多半是 `version_arg` 写错）
  - Windows 下 npm-global `.cmd` shim 通过 `where` 探测后再以 `shell:true` 重跑
- **sse-parser-fixture.test.ts** — 把 `tests/sse-fixtures/*` 三个真实 CLI 输出 chunked 喂给对应 parser，断言：不抛、最后必有 `complete` 事件、注入的 `<sf:complete redirect="…"/>` 探针被实际累积出来（证明 delta 路径真的连通）。

### 建议加进 CI

在 root `package.json` 的 `"scripts"` 加：

```jsonc
{
  "scripts": {
    "test:wire": "tsx tests/wire-contract.test.ts && tsx tests/cli-spawn-smoke.test.ts && tsx tests/sse-parser-fixture.test.ts"
  }
}
```

然后在 GitHub Actions / 任何 CI 流程的 PR 检查里加 `npm run test:wire`。这三步累计 < 3 秒（cli-spawn 慢但只 spawn 一次 `--version`），适合做 pre-merge gate。

