# Assembly Rules — 前后端孪生同步 Rule

## 背景

`src/lib/assemblyRules.ts`（前端）与 `server/src/lib/intent-router.ts`（后端）
各自维护一份 `SINGLE_AGENT_PATTERNS` 正则数组，以及 `TEAM_INTENT_PATTERN` 负向守卫。
两份必须**逐字一致**——任何一处改动必须同步到另一处，否则前后端对同一 goal
字符串得出不同的 roster 裁决，截断逻辑失效。

这条 Rule 是文章"Script/Validation = 客观关卡，不靠 AI 自我汇报"思想的最小落地：
把注释里的同步约定升格为显式规则，让 Claude 在改任意一端时必须执行。

## 受保护的双边文件

| 前端孪生 | 后端孪生 |
|---|---|
| `src/lib/assemblyRules.ts` | `server/src/lib/intent-router.ts` |

## ALWAYS（每次改动必须执行）

1. **改任意一端的正则/守卫** → 立即同步到另一端，在同一个 commit 里提交两个文件。
2. **同步后跑单测**：`npx vitest run src/lib/__tests__/assemblyRules.test.ts`
   — 11 个测试必须全部通过。
3. **跑 tsc**：`npx tsc --noEmit` — 不得引入新报错（存量报错不算）。
4. **Commit 描述**必须同时提及前端孪生和后端孪生的改动，格式：
   `fix/feat(assembly): <改了什么> — 前后端孪生同步`

## NEVER

- 不允许只改一端就提交（单边提交 = 孪生分叉 = 截断逻辑不一致）。
- 不允许在 `assemblyRules.ts` 和 `intent-router.ts` 里使用不同变量名或不同顺序的正则项。

## 校验方式（当场可执行）

```bash
# 提取前端正则块
node -e "
const fs = require('fs');
const fe = fs.readFileSync('src/lib/assemblyRules.ts','utf8');
const be = fs.readFileSync('server/src/lib/intent-router.ts','utf8');
// 粗校验：两端都必须含相同的核心短语
const phrases = ['一个|单个', 'single.*agent', 'just.*one.*agent', '团队|小队'];
phrases.forEach(p => {
  const inFe = fe.includes(p.split('|')[0]);
  const inBe = be.includes(p.split('|')[0]);
  if (inFe !== inBe) console.error('MISMATCH:', p, 'fe='+inFe, 'be='+inBe);
  else console.log('OK:', p);
});
"
```

## 扩展规则（后续 N2 Rule Pack 落地时）

N2 Rule Pack 会引入更多装配期 Rule（team 一等公民 Rule 等）。届时此文件应扩展为
"所有装配 Rule 的前后端孪生清单"，当前仅管 roster Rule。
