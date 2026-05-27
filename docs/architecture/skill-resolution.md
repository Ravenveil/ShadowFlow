# Skill 安装与寻找流程 (`@skill` vs `/skill`)

**Date**: 2026-05-25
**Status**: Reference doc (基于当前 HEAD `bb90665`)
**Scope**: 从"用户输入"到"SKILL 真正被执行"的完整数据流，覆盖 install / register / lookup / resolve 四阶段

---

## TL;DR (一张图)

```
┌─ 安装时（一次性）──────────────────────────────────────────────────────┐
│                                                                        │
│   user 给 GitHub URL / raw .md / pasted text                          │
│            │                                                          │
│            ▼                                                          │
│   skill-ingest/fetch.ts  →  shallow git clone → .shadowflow/cache/    │
│                                                  skill-ingest/<id>/   │
│            │                                                          │
│            ▼                                                          │
│   skill-ingest/canonical-id.ts  →  从 URL 算稳定 id（不是 sha1，      │
│                                       是 URL 末段 + 安全字符过滤）    │
│            │                                                          │
│            ▼                                                          │
│   skill-ingest/probe.ts  →  读 frontmatter / 探测 team.yaml /         │
│                              commands/ 子目录                          │
│            │                                                          │
│            ▼                                                          │
│   skill-ingest/register.ts  →  写到                                    │
│                                  (server/).shadowflow/skills/<id>/    │
└────────────────────────────────────────────────────────────────────────┘

┌─ 进程启动时 (skill-loader.ts) ─────────────────────────────────────────┐
│                                                                        │
│   扫描两个目录:                                                       │
│     .shadowflow/skills/                  ← 项目根 (开发/3-rd party)  │
│     server/.shadowflow/skills/           ← server 自带 + ingest 出来 │
│            │                                                          │
│            ▼                                                          │
│   for each <id>/SKILL.md:                                             │
│     SKILLS[id] = parsedSkill                                          │
│     if exists <id>/commands/X.md:                                     │
│       SKILLS[`${id}:${X}`] = subSkill   ← W2 plugin 命令注册         │
│            │                                                          │
│            ▼                                                          │
│   SKILLS in-memory Map (server/src/skills.ts:220)                     │
│   { 'BMAD-METHOD': {...}, 'BMAD-METHOD:prfaq': {...},                 │
│     'paper-review': {...}, ... }                                      │
└────────────────────────────────────────────────────────────────────────┘

┌─ 用户运行时（每次 send）─────────────────────────────────────────────┐
│                                                                        │
│   StartPage composer 输入框                                           │
│      │                                                                │
│   ┌──┴──────────────────────────────────────────┐                    │
│   │                                              │                    │
│   "@bmad ..."                            "/bmad-method:prfaq ..."     │
│   (前端 fuzzy resolve)                   (前端不动，整段送 server)    │
│      │                                              │                    │
│      ▼                                              │                    │
│   StartPage.tsx:849-859                             │                    │
│   regex /^@([a-z0-9_-]+)(?:\s|$)/i                  │                    │
│   → guess.toLowerCase()                             │                    │
│   → installedSkills.find(s => s.id.lower === guess) │                    │
│   → resolvedSkillName = hit.id                      │                    │
│      │                                              │                    │
│      ▼                                              ▼                    │
│   POST /api/run-sessions                                              │
│   { goal: "...",                                                      │
│     skill_name: "bmad-method"  ← 显式字段                            │
│     | undefined                ← 让 server 解析                       │
│   }                                                                   │
│      │                                                                │
│      ▼                                                                │
│   run-sessions.ts:381-410                                             │
│   1. slashCmdRe  /(?:^|\s)\/([id]):([cmd])(?=\s|$)/  → 命中？        │
│   2. 否则 skillTokenRe /@skill[:\s]+([id])/  → 命中？                │
│   3. 否则 用 body.skill_name 兜底                                     │
│      │                                                                │
│      ▼                                                                │
│   SKILLS[resolved_token]  →  SkillDefinition                          │
│      │                                                                │
│      ▼                                                                │
│   assembler.ts → workflow/scheduler 或 callable.turn()                │
│      │                                                                │
│      ▼                                                                │
│   SSE stream 到前端                                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1 · 安装阶段 (skill-ingest)

**入口**: `POST /api/skills/ingest` 或者本地 .shadowflow/skills/ 手放文件夹

### 1.1 fetch.ts —— 把 source 拉到本地

`server/src/skill-ingest/fetch.ts` 支持 4 种 source（line 5-12 注释）：

| Source 形态 | 行为 | 缓存位置 |
|---|---|---|
| `github.com/<org>/<repo>` | **shallow git clone**（depth 1） | `.shadowflow/cache/skill-ingest/<sha1>/` |
| `github.com/<org>/<repo>/tree/<branch>/<sub/path>` | clone + 提取 subdir | 同上 + subpath 字段 |
| `raw.githubusercontent.com/...md` | 单文件 HTTPS 下载 | 同上，只含 1 个 .md |
| `https://...md` (任意 raw markdown) | 单文件 HTTPS 下载 | 同上 |
| 粘贴的 markdown 文本 | 直接写 SKILL.md | 同上 |

**关键证据**:
- `fetch.ts:181`：`throw new Error(\`git clone failed (\${proc.status})...\`)`
- 实际缓存目录看 `.shadowflow/cache/skill-ingest/9ac1ac635235/` 含**完整 BMAD-METHOD repo**（package.json / docs/ / evals/ / banner.png 全在）—— 不是只取部分元数据，是整 repo

**source_hash**: 用 sha1(source URL) 当缓存 key 目录名，**支持同源重复 ingest 时复用缓存**

### 1.2 canonical-id.ts —— 算 skill id

`server/src/skill-ingest/canonical-id.ts:63` `canonicalIdFromUrl(url)`：

```
"https://github.com/bmadcode/BMAD-METHOD" → "BMAD-METHOD"
"github.com/bmadcode/BMAD-METHOD/tree/main/agents" → "BMAD-METHOD"
"https://raw.githubusercontent.com/foo/bar/main/my-skill.md" → "my-skill"
"<garbage input>" → "skill-<sha1-prefix>"  (fallback)
```

**8 步处理**（注释里写）：
1. trim → 空字符串 → fallback
2. 截掉 GitHub 分支尾巴 (`/tree/<branch>/...`)
3. 末尾 `/` 修剪
4. split('/') 取最后一段
5. 去 `.git` 后缀
6. 撞 reserved name（`.` / `..` / `__proto__` 等）→ fallback
7. 过滤 `[a-zA-Z0-9_.-]` 外字符 → fallback
8. 截 ≤ 64 字符

**fallback** 用 `skill-<sha1(source).slice(0,8)>` 保证：
- 同样 URL 永远算出同样 id（重 install 不会漂）
- 不会撞 reserved name 出 path-traversal

### 1.3 probe.ts —— 读元数据

读取 SKILL.md frontmatter（name / description / allowed-tools / team / executor 等），探测：
- `team.skill.yaml` 或 `team.yaml` 存在 → 标记 `has_team`
- `commands/` 目录 → 列出来给 register.ts 用
- agents/ 目录 → 准备 link 到 team

### 1.4 register.ts —— 落到 .shadowflow/skills/

把 cache 里的内容 copy 到 `server/.shadowflow/skills/<canonical-id>/`。

**SHARED FILESYSTEM**: 这个目录被 git ignore，但 skill-loader 启动时会扫。

---

## 2 · 注册阶段 (skill-loader)

**入口**: server 进程启动时 `skill-loader.ts:loadAllSkills(skillsDir)` 调两次：

```ts
// server/src/index.ts (启动)
loadSkillsFromDir(path.join(repoRoot, '.shadowflow/skills'))         // root 项目级
loadSkillsFromDir(path.join(__dirname, '../.shadowflow/skills'))     // server 本身的
```

启动日志（实测）：
```
[skill-loader] loaded 3 skill(s) from D:\VScode\TotalProject\ShadowFlow\.shadowflow\skills
[skill-loader] loaded 7 skill(s) from D:\VScode\TotalProject\ShadowFlow\server\.shadowflow\skills
```

### 2.1 SKILLS registry 形态

`server/src/skills.ts:220`：

```ts
export let SKILLS: Record<string, SkillDefinition> = { ...HARDCODED_SKILLS };
```

- `HARDCODED_SKILLS` —— 3 个 builtin（在 skills.ts 顶部定义）
- 启动时 file-system skills overlay 上去
- **后加载的覆盖前加载的同名 id**（server 级覆盖项目级，自定义覆盖 hardcoded）

### 2.2 W2 命令注册 (`commands/` 子注册)

**这是 `/skill:cmd` 能 work 的关键**。`skill-loader.ts:275-300`：

```ts
const cmdsDir = path.join(skillsDir, id, 'commands');
if (fs.existsSync(cmdsDir)) {
  for (const cmdEntry of cmdEntries) {
    if (!cmdEntry.name.endsWith('.md')) continue;
    const cmdName = cmdEntry.name.slice(0, -3);
    SKILLS[`${id}:${cmdName}`] = {
      // ...简化版 skill：mode='prototype', team=null, executor=null
      // 内容就是这个 .md 文件本身
    };
  }
}
```

**例**: `BMAD-METHOD` skill 含 `commands/create-prd.md`、`commands/prfaq.md`，注册后 SKILLS 长这样：
```
SKILLS['BMAD-METHOD']           = SkillDefinition  ← skill 根入口
SKILLS['BMAD-METHOD:create-prd'] = SkillDefinition  ← prfaq 命令
SKILLS['BMAD-METHOD:prfaq']      = SkillDefinition  ← create-prd 命令
SKILLS['BMAD-METHOD:dev-story']  = ...
SKILLS['BMAD-METHOD:retrospective'] = ...
... 几十个
```

这个机制**模仿 Claude Code v2.1.88 plugin `/<id>:<cmd>` 语法**（注释里写明了）。

---

## 3 · 运行时寻找 (`@` 路径)

### 3.1 前端 fuzzy resolve (`StartPage.tsx:849-866`)

**仅在 composer 提交时触发**，不是输入时实时弹 dropdown（dropdown 是 CommandMenu 另一套）。

```ts
let resolvedSkillName = pendingSkill?.skill_id;  // 如果用户在 dropdown 显式选了
if (!resolvedSkillName && installedSkills?.length) {
  const m = text.match(/^@([a-z0-9_-]+)(?:\s|$)/i);  // 只看消息开头第一个 @ token
  if (m) {
    const guess = m[1].toLowerCase();
    const hit = installedSkills.find((s) => s.id.toLowerCase() === guess);
    if (hit) resolvedSkillName = hit.id;
  }
}
```

**关键细节**：
- regex `^@([a-z0-9_-]+)` —— **仅匹配消息开头**（`/^/` 锚定），消息中间的 `@xxx` 不算
- `.toLowerCase()` —— 前端比较时**不区分大小写**（`@bmad` 能找到 `BMAD-METHOD` 吗？看 fallback：`'bmad' !== 'bmad-method'.toLower()`，所以**不**能；要打全 `@BMAD-METHOD`）
- `installedSkills` —— 来自 `/api/skills` 在页面加载时 fetch 的列表

### 3.2 POST 到 server

```http
POST /api/run-sessions
Content-Type: application/json

{
  "goal": "@bmad-method 帮我做电商系统",
  "skill_name": "BMAD-METHOD",        ← 前端 resolve 后填进来
  "provider": "zhipu",
  "model": "glm-4.7"
}
```

注意：`skill_name` 字段是**显式 hint**，server 优先用它；如果空，server 才从 goal 里 regex 解析。

### 3.3 server 端解析（兜底） (`run-sessions.ts:381-410`)

如果前端 `skill_name` 没填，server 在 goal 里再扫一遍：

```ts
const skillTokenRe = /@skill[:\s]+([a-zA-Z0-9][a-zA-Z0-9_.-]{0,63})/;
const m = goal_text.match(skillTokenRe);
if (m) inline_skill_token = m[1];
```

**注意 regex 比前端复杂**：
- 匹配的是 `@skill:<id>` 而不是 `@<id>`（更严格，避免误匹配 `@dengyu` 这种用户名）
- 大小写敏感（注释里写明 `BMAD-METHOD` ≠ `bmad-method` 因为 canonical-id 保留大小写）
- 允许 `@skill <id>` 用空格也能命中
- goal 里出现位置不限制（不像前端只看开头）

---

## 4 · 运行时寻找 (`/` 路径)

### 4.1 前端 ——什么都不做

`/bmad-method:prfaq` 在 StartPage composer 里**不会触发任何特殊处理**。整段 goal text 原样塞进 `goal` 字段 POST 给 server。

> 注：CommandMenu 弹的 / 提示是 UI 层的命令面板，跟我们这里说的 skill 命令是另一个东西。

### 4.2 server 端解析 (`run-sessions.ts:399-409`)

```ts
const slashCmdRe = /(?:^|\s)\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}):([a-zA-Z0-9][a-zA-Z0-9_-]{0,63})(?=\s|$)/;
const sm = goal_text.match(slashCmdRe);
if (sm) {
  inline_skill_token = `${sm[1]}:${sm[2]}`;  // 例: "BMAD-METHOD:prfaq"
  goal_text = goal_text.replace(slashCmdRe, '').trim();
  if (!goal_text) goal_text = '执行该 skill 命令。';  // 用户只打 slash 没目标
}
```

**两个关键 hardening**（注释里写）：
1. `(?:^|\s)` 锚定 ——**前面必须是字符串开头或空格**，不允许 mid-URL 误匹配（避免 `https://api.example.com/foo:bar` 被当 slash 解析）
2. **大小写不丢** —— SKILLS key 是大小写敏感的，强行 lowercase 会让 `/BMAD-METHOD:prfaq` 找不到

### 4.3 优先级（**slash > @ > skill_name body**）

`run-sessions.ts:399` 用的是 `if (sm) { ... } else { ... }` 结构 —— slash 命中**直接 short-circuit**，不再走 @ 分支。

完整优先级链：

```
1. inline_skill_token = /<id>:<cmd> regex 命中？     ← W2 plugin slash command
   是 → 用之 → STOP
2. inline_skill_token = @skill:<id> regex 命中？     ← server 兜底 @ 解析
   是 → 用之 → STOP
3. body.skill_name 字段非空？                        ← 前端 fuzzy resolve 的结果
   是 → 用之
4. 都没 → 默认 skill (`agent-team-blueprint`)
```

---

## 5 · `@` vs `/` —— 完整对比

| 维度 | `@<id>` / `@skill:<id>` | `/<id>:<cmd>` |
|---|---|---|
| 颗粒度 | skill 根级（整个 plugin 入口） | 命令级（plugin 内一个具体命令） |
| 例子 | `@BMAD-METHOD` / `@skill:BMAD-METHOD` | `/BMAD-METHOD:prfaq` |
| 前端做什么 | StartPage.tsx 简易 regex resolve → POST `skill_name` 字段 | 啥也不做，整段 POST `goal` 字段 |
| server 解析的 regex | `@skill[:\s]+([id])` | `(?:^|\s)\/([id]):([cmd])(?=\s|$)` |
| 优先级（server 端）| 中 | 最高 |
| SKILLS key 形态 | `<id>` | `<id>:<cmd>` |
| key 注册时机 | skill-loader 读 SKILL.md 时 | skill-loader 读 `commands/X.md` 时 |
| 大小写敏感 | server 端敏感，前端不敏感（fuzzy） | 严格敏感 |
| 模仿对象 | 自家 at-mention 习惯 | Claude Code v2.1.88 plugin syntax |

---

## 6 · 关键认知（容易踩坑）

### 6.1 前后端 `@` 解析不同步

前端只看消息**开头**的 `@<id>`，server 兜底解析的是消息**任何位置**的 `@skill:<id>`（不是 `@<id>`）。

**坑**：用户输入 `请帮我用 @bmad-method 做电商` —— 前端 regex `^@...` **不命中**（@ 不在开头），server 兜底 regex 找 `@skill:<id>` 也**不命中**（用户没打 `@skill:` 前缀）。结果：fallback 到默认 `agent-team-blueprint` skill，用户感觉"我 @ 了为啥没用 BMAD"。

**修复建议**（如需）：前端 regex 改成全文扫，或 server 端加宽兜底 regex 接受 `@<id>`（与前端对齐）。

### 6.2 大小写敏感性混乱

| 入口 | 大小写处理 |
|---|---|
| 前端 `@<id>` 自动 resolve | `guess.toLowerCase()` 比 `installedSkills[].id.toLowerCase()`，**case-insensitive** |
| 前端 dropdown 显式选 | hit.id 原样，**保留大小写** |
| server `@skill:<id>` | **case-sensitive**（canonical-id 保留大小写） |
| server `/<id>:<cmd>` | **case-sensitive**（slash hardening 明确不 lowercase） |

**坑**：前端 `@bmad-method`（小写）能 resolve 到 `BMAD-METHOD`（大写）；但 server 端 `/bmad-method:prfaq`（小写）**会找不到** `SKILLS['BMAD-METHOD:prfaq']`。

### 6.3 双扫描目录

`.shadowflow/skills/` （项目根）和 `server/.shadowflow/skills/` （server 自带 + ingest）**都被扫**，**后加载覆盖前加载**。

**坑**：项目根 `.shadowflow/skills/bmad/` 和 server 自带 `server/.shadowflow/skills/BMAD-METHOD/` 共存时，看起来像 2 个 skill（因为 id 不同），但都叫 BMAD —— 这就是 commit `bb90665` 删除前 dropdown 出现 2 个的原因。

### 6.4 `commands/` 子注册数量上限

`skill-loader.ts:300` `MAX_ENTRIES` 截断过多 commands。超过会 console.warn 但继续，超出的 commands 不被注册。**坑**：BMAD-METHOD 上游有 50+ commands，**可能被截断**。建议 grep MAX_ENTRIES 看具体数字，必要时调高。

---

## 7 · 调试 cheat sheet

### 7.1 看当前 SKILLS registry 全清单
```bash
curl -s http://localhost:8002/api/skills | python -c "
import sys, json
d = json.load(sys.stdin)
for s in (d if isinstance(d, list) else d.get('skills', [])):
    print(s.get('skill_name', '?'), '→', s.get('id') or s.get('skill_id') or '?')
"
```

### 7.2 看 cache 里某 skill 的 raw 内容
```bash
ls server/.shadowflow/cache/skill-ingest/<canonical-id>/
cat server/.shadowflow/cache/skill-ingest/<canonical-id>/SKILL.md
```

### 7.3 看注册到了哪
```bash
ls .shadowflow/skills/
ls server/.shadowflow/skills/
```

### 7.4 看 LLM 实际收到的 skill 选择
看 Node Express log（tsx watch output）里有：
```
[run-sessions] Created session ... skill=BMAD-METHOD ds=none provider=zhipu ...
```
`skill=` 后面就是 resolve 出来的最终 token。

### 7.5 强制重新扫描
skill-loader 只在 server 启动时跑一次。改了 `.shadowflow/skills/` 内容后**必须 kill + restart Express**，tsx watch 不会感知文件系统增删。

---

## 8 · 相关文件

- `server/src/skill-ingest/fetch.ts` — clone / fetch 源码
- `server/src/skill-ingest/canonical-id.ts` — URL → 稳定 id
- `server/src/skill-ingest/probe.ts` — 读元数据
- `server/src/skill-ingest/register.ts` — 落地
- `server/src/loaders/skill-loader.ts` — 启动时扫 + 注册 SKILLS
- `server/src/skills.ts:220` — SKILLS in-memory registry
- `server/src/routes/run-sessions.ts:381-410` — server 端 `/` 和 `@skill:` 解析
- `src/pages/StartPage.tsx:849-866` — 前端 `@` fuzzy resolve

## 9 · 已知 TODO

- 删 builtin `bmad` 后只剩 BMAD-METHOD（commit `bb90665`），但 BMAD-METHOD `has_team=false`。skill-ingest 还没能力解析上游 repo 的 `bmad-modules.yaml` + `agents/` 生成 team.yaml。**Round 3-B 候选**。
- 前后端 `@` 解析不同步（见 §6.1）。**P2 follow-up**。
- 大小写处理不一致（见 §6.2）。**P2 follow-up**。
- `MAX_ENTRIES` commands 截断可能切到 BMAD-METHOD 完整命令清单。**未验证 P3**。
