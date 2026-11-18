/**
 * settings-ext.ts — 单后端迁移：Python settings API 缺口端点（settings-ext）
 *
 * 移植自 python backend/python/shadowflow/api/system/settings.py。与现有
 * routes/system/settings.ts（Story 15.9/15.17 + 新版 BYOK/provider 配置）并列、
 * 不重叠：那边已覆盖 appearance/byok/byok models/media/pets 的"新协议"读端点
 * （探针通过）；本文件只补齐 Python 老协议的缺口端点：
 *
 *   GET    /agents/detect                  — PATH 扫描已知 agent CLI（60s TTL 缓存）
 *   GET    /agents/selection               — 读选中 agent id（老协议 .shadowflow/agents/selection.json）
 *   PUT    /agents/selection               — 写选中 agent id
 *   GET    /connectors/composio            — Composio 配置状态
 *   PUT    /connectors/composio            — 写 Composio key（原子写，0600 语义）
 *   DELETE /connectors/composio            — 清空 Composio key
 *   GET    /pets/:petId/spritesheet        — spritesheet 二进制（防路径穿越）
 *   POST   /pets/sync                      — PetShare / j20 Hatchery 社区宠下载
 *   DELETE /byok/:provider                 — 清 BYOK key（老协议 byok-config.json）
 *   DELETE /media/:providerId              — 清 media key（media-config.json）
 *
 * 数据源逐字段对齐 Python（legacy↔single 共享同一份文件）：
 *   - Python DATA_DIR = SHADOWFLOW_DATA_DIR（默认 .shadowflow）
 *     → Node 用 repoDataFile() 收口（SHADOWFLOW_DATA_DIR 优先，语义一致）
 *   - connectors/composio-config.json、agents/selection.json、
 *     byok-config.json、media-config.json、pets 用户根 ~/.codex/pets
 *   - pets bundled 根：Python backend/python/shadowflow/assets/community-pets
 *     → Node backend/node/assets/community-pets（repo 尚无该目录，运行时返回空列表）
 *
 * 注意：byok-config.json（本文件老协议）与 settings KV 的 `byok` 键（settings.ts
 * 新协议）是两份数据，各有消费方，不合并——保持 Python 行为。
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { repoDataFile } from '../../storage/repo-root';

const router = Router();

type Obj = Record<string, unknown>;

// ── 通用 helpers ─────────────────────────────────────────────────────────────

/** JSON 读取（文件缺失返回 null）。 */
function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** 原子写 JSON（tmp + rename，Python tmp.rename 同构）。 */
function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/** HTTPException(detail="...") 的 JSON 等价体：顶层 {detail}。 */
function failDetail(res: Response, status: number, detail: string): void {
  res.status(status).json({ detail });
}

// ════════════════════════════════════════════════════════════════════════════
// agents/detect — PATH 扫描已知 agent CLI（AGENT_DEFS 逐条照抄）
// ════════════════════════════════════════════════════════════════════════════

interface AgentDef {
  id: string;
  name: string;
  bin: string;
  fallback_bins: string[];
  auth_hint: string | null;
  install_hint: string | null;
  docs_url: string | null;
  fallback_models: string[];
}

const AGENT_DEFS: AgentDef[] = [
  { id: 'claude',   name: 'Claude Code',    bin: 'claude',        fallback_bins: ['openclaude'],
    auth_hint: 'Run `claude login`', install_hint: 'npm i -g @anthropic-ai/claude-code',
    docs_url: 'https://claude.ai/code',
    fallback_models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
  { id: 'codex',    name: 'Codex CLI',      bin: 'codex',         fallback_bins: [],
    auth_hint: 'Set OPENAI_API_KEY env var', install_hint: 'npm i -g @openai/codex',
    docs_url: 'https://github.com/openai/codex', fallback_models: ['o4-mini', 'o3', 'gpt-4o'] },
  { id: 'gemini',   name: 'Gemini CLI',     bin: 'gemini',        fallback_bins: [],
    auth_hint: 'Set GEMINI_API_KEY env var', install_hint: 'npm i -g @google/gemini-cli',
    docs_url: 'https://github.com/google-gemini/gemini-cli',
    fallback_models: ['gemini-2.5-pro', 'gemini-2.0-flash'] },
  { id: 'opencode', name: 'OpenCode',       bin: 'opencode',      fallback_bins: [],
    auth_hint: 'See opencode docs', install_hint: 'npm i -g opencode-ai',
    docs_url: 'https://opencode.ai', fallback_models: [] },
  { id: 'openclaw', name: 'OpenClaw',       bin: 'openclaw',      fallback_bins: [],
    auth_hint: 'See openclaw docs', install_hint: null,
    docs_url: null, fallback_models: ['openclaw-default'] },
  { id: 'cursor',   name: 'Cursor Agent',   bin: 'cursor-agent',  fallback_bins: [],
    auth_hint: 'Sign in via Cursor app', install_hint: null,
    docs_url: 'https://cursor.com', fallback_models: [] },
  { id: 'qwen',     name: 'Qwen Code',      bin: 'qwen',          fallback_bins: [],
    auth_hint: 'Set DASHSCOPE_API_KEY env var', install_hint: null,
    docs_url: 'https://qwenlm.github.io', fallback_models: ['qwen-coder-32b'] },
  { id: 'copilot',  name: 'GitHub Copilot', bin: 'copilot',       fallback_bins: [],
    auth_hint: 'Run `gh auth login`', install_hint: 'gh extension install github/gh-copilot',
    docs_url: 'https://github.com/features/copilot',
    fallback_models: ['gpt-4o', 'claude-sonnet-4-6'] },
  { id: 'hermes',   name: 'Hermes',         bin: 'hermes',        fallback_bins: [],
    auth_hint: 'See hermes docs', install_hint: null,
    docs_url: null, fallback_models: [] },
  { id: 'devin',    name: 'Devin',          bin: 'devin',         fallback_bins: [],
    auth_hint: 'Set DEVIN_API_KEY env var', install_hint: null,
    docs_url: 'https://devin.ai', fallback_models: [] },
  { id: 'kimi',     name: 'Kimi CLI',       bin: 'kimi',          fallback_bins: [],
    auth_hint: 'Set MOONSHOT_API_KEY env var', install_hint: null,
    docs_url: 'https://kimi.moonshot.cn', fallback_models: ['kimi-latest'] },
  { id: 'kiro',     name: 'Kiro',           bin: 'kiro',          fallback_bins: [],
    auth_hint: 'Sign in via kiro CLI', install_hint: null,
    docs_url: 'https://kiro.dev', fallback_models: [] },
  { id: 'kilo',     name: 'Kilo',           bin: 'kilo',          fallback_bins: [],
    auth_hint: 'See kilo docs', install_hint: null,
    docs_url: null, fallback_models: [] },
  { id: 'vibe',     name: 'Vibe',           bin: 'vibe',          fallback_bins: [],
    auth_hint: 'Set MISTRAL_API_KEY env var', install_hint: null,
    docs_url: null, fallback_models: [] },
  { id: 'pi',       name: 'Pi',             bin: 'pi',            fallback_bins: [],
    auth_hint: 'See pi docs', install_hint: null,
    docs_url: null, fallback_models: [] },
  { id: 'deepseek', name: 'DeepSeek Coder', bin: 'deepseek',      fallback_bins: [],
    auth_hint: 'Set DEEPSEEK_API_KEY env var', install_hint: null,
    docs_url: 'https://deepseek.com', fallback_models: [] },
];

/** shutil.which 等价：逐 PATH 目录 + Windows PATHEXT 探测。 */
function resolveOnPath(binName: string): string | null {
  const pathEnv = process.env.PATH ?? '';
  const dirs = pathEnv.split(path.delimiter).filter((d) => d.length > 0);
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((e) => e.length > 0)
      : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, binName + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        const st = fs.statSync(candidate);
        if (st.isFile()) return candidate;
      } catch {
        // not here — keep scanning
      }
    }
  }
  return null;
}

interface ProbeResult {
  id: string;
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  auth_hint: string | null;
  install_hint: string | null;
  docs_url: string | null;
  fallback_models: string[];
}

/** _probe_one 同构：which → --version（1.5s 超时；126/127 视为未安装）。 */
function probeOne(defn: AgentDef): ProbeResult {
  let p = resolveOnPath(defn.bin);
  for (const fb of defn.fallback_bins) {
    if (!p) p = resolveOnPath(fb);
  }
  let version: string | null = null;
  if (p) {
    try {
      const isWin = process.platform === 'win32';
      const out = spawnSyncVersion(p, isWin);
      if (out.returncode === 126 || out.returncode === 127) {
        p = null;
      } else {
        version = (out.stdout.trim() || out.stderr.trim() || null) as string | null;
      }
    } catch {
      // 探测失败不影响 installed 判定（Python except: pass 同款）
    }
  }
  return {
    id: defn.id,
    name: defn.name,
    installed: Boolean(p),
    path: p,
    version,
    auth_hint: defn.auth_hint,
    install_hint: defn.install_hint,
    docs_url: defn.docs_url,
    fallback_models: defn.fallback_models,
  };
}

/** `<path> --version`，1.5s 超时杀进程。Windows 下经 cmd 包一层（对齐
 *  Python 的语义——直接 spawn 的 .cmd/.bat 在 win 上不会被 exec 搜索到）。 */
function spawnSyncVersion(
  binPath: string,
  isWin: boolean,
): { returncode: number; stdout: string; stderr: string } {
  try {
    const res = isWin
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${binPath}" --version`], {
          windowsVerbatimArguments: true,
          timeout: 1500,
          windowsHide: true, // CREATE_NO_WINDOW 等价
          encoding: 'utf-8',
        })
      : spawnSync(binPath, ['--version'], { timeout: 1500, encoding: 'utf-8' });
    const stdout = typeof res.stdout === 'string' ? res.stdout : '';
    const stderr = typeof res.stderr === 'string' ? res.stderr : '';
    if (res.error) {
      // spawn 失败（ENOENT 等）→ 视作 127 语义
      return { returncode: 127, stdout, stderr };
    }
    return { returncode: res.status ?? 1, stdout, stderr };
  } catch {
    return { returncode: 127, stdout: '', stderr: '' };
  }
}

// 模块级 60s TTL 缓存（python _DETECT_CACHE 同构）
let detectCacheTs = 0;
let detectCacheResult: ProbeResult[] | null = null;
const DETECT_CACHE_TTL_S = 60;

function detectAgents(force: boolean): ProbeResult[] {
  const now = Date.now();
  if (!force && detectCacheResult !== null && now - detectCacheTs < DETECT_CACHE_TTL_S * 1000) {
    return detectCacheResult;
  }
  const result = AGENT_DEFS.map(probeOne);
  detectCacheTs = now;
  detectCacheResult = result;
  return result;
}

// GET /agents/detect?force=1 — 扫描 PATH（60s 缓存；?force=1 绕过）
router.get('/agents/detect', (req: Request, res: Response) => {
  const forceRaw = req.query.force;
  const force = forceRaw === '1' || forceRaw === 'true' || forceRaw === 'True';
  const agents = detectAgents(force);
  const cached = !force && detectCacheResult !== null;
  res.json({ agents, cached, ttl_s: DETECT_CACHE_TTL_S });
});

// ════════════════════════════════════════════════════════════════════════════
// agents/selection — 老协议 agents/selection.json
// ════════════════════════════════════════════════════════════════════════════

function selectionFile(): string {
  return repoDataFile('agents', 'selection.json');
}

function readAgentSelection(): Obj {
  const data = readJson(selectionFile());
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Obj)
    : { selectedId: 'claude' };
}

// GET /agents/selection → {selectedId}
router.get('/agents/selection', (_req: Request, res: Response) => {
  res.json(readAgentSelection());
});

// PUT /agents/selection {selectedId} → {selectedId}
router.put('/agents/selection', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { selectedId?: unknown };
  if (typeof body.selectedId !== 'string') {
    failDetail(res, 422, 'Field required: selectedId');
    return;
  }
  try {
    writeJsonAtomic(selectionFile(), { selectedId: body.selectedId });
    res.json({ selectedId: body.selectedId });
  } catch {
    failDetail(res, 500, 'Failed to save agent selection');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// connectors/composio — 老协议 connectors/composio-config.json
// ════════════════════════════════════════════════════════════════════════════

function composioFile(): string {
  return repoDataFile('connectors', 'composio-config.json');
}

function readComposioConfig(): { apiKey: string } {
  const data = readJson(composioFile());
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const key = (data as Obj)['apiKey'];
    return { apiKey: typeof key === 'string' ? key : '' };
  }
  return { apiKey: '' };
}

function composioStatus(): { configured: boolean; apiKeyTail: string } {
  const cfg = readComposioConfig();
  return { configured: Boolean(cfg.apiKey), apiKeyTail: cfg.apiKey ? cfg.apiKey.slice(-4) : '' };
}

// GET /connectors/composio → {configured, apiKeyTail}
router.get('/connectors/composio', (_req: Request, res: Response) => {
  res.json(composioStatus());
});

// PUT /connectors/composio {apiKey} → {configured, apiKeyTail}
router.put('/connectors/composio', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { apiKey?: unknown };
  if (typeof body.apiKey !== 'string') {
    failDetail(res, 422, 'Field required: apiKey');
    return;
  }
  try {
    writeJsonAtomic(composioFile(), { apiKey: body.apiKey });
    res.json(composioStatus());
  } catch {
    failDetail(res, 500, 'Failed to save Composio config');
  }
});

// DELETE /connectors/composio → {configured:false, apiKeyTail:''}
router.delete('/connectors/composio', (_req: Request, res: Response) => {
  try {
    writeJsonAtomic(composioFile(), { apiKey: '' });
  } catch {
    failDetail(res, 500, 'Failed to clear Composio config');
    return;
  }
  res.json({ configured: false, apiKeyTail: '' });
});

// ════════════════════════════════════════════════════════════════════════════
// pets — 用户根 ~/.codex/pets + bundled backend/node/assets/community-pets
// ════════════════════════════════════════════════════════════════════════════

const PET_ID_RE = /^[a-zA-Z0-9._-]{1,80}$/;
const SPRITESHEET_NAMES = ['spritesheet.webp', 'spritesheet.png', 'spritesheet.gif'];

function userPetsRoot(): string {
  return path.join(os.homedir(), '.codex', 'pets');
}

/** Python bundled_root = settings.py 的 parent.parent/assets/community-pets；
 *  Node 侧对齐到 backend/node/assets/community-pets（repo 现无该目录 → 空）。 */
function bundledPetsRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', 'assets', 'community-pets');
}

function readPetManifest(petDir: string): Obj {
  const data = readJson(path.join(petDir, 'pet.json'));
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Obj) : {};
}

function findSpritesheet(petId: string): string | null {
  for (const root of [userPetsRoot(), bundledPetsRoot()]) {
    const petDir = path.join(root, petId);
    if (!fs.existsSync(petDir) || !fs.statSync(petDir).isDirectory()) continue;
    for (const name of SPRITESHEET_NAMES) {
      const candidate = path.join(petDir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function listPets(baseUrl: string): Array<Obj> {
  const pets: Array<Obj> = [];
  const seen = new Set<string>();
  const roots: Array<[string, boolean]> = [
    [userPetsRoot(), false],
    [bundledPetsRoot(), true],
  ];
  for (const [root, bundled] of roots) {
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const petId = entry.name;
      if (seen.has(petId)) continue;
      const petDir = path.join(root, petId);
      const manifest = readPetManifest(petDir);
      let sheet: string | null = null;
      for (const name of SPRITESHEET_NAMES) {
        if (fs.existsSync(path.join(petDir, name))) {
          sheet = name;
          break;
        }
      }
      if (!sheet) continue;
      seen.add(petId);
      pets.push({
        id: petId,
        displayName:
          typeof manifest['displayName'] === 'string'
            ? (manifest['displayName'] as string)
            : petId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: typeof manifest['description'] === 'string' ? (manifest['description'] as string) : '',
        spritesheetUrl: `${baseUrl}/api/settings/pets/${petId}/spritesheet`,
        bundled,
        author: typeof manifest['author'] === 'string' ? (manifest['author'] as string) : '',
        tags: Array.isArray(manifest['tags']) ? manifest['tags'] : [],
      });
    }
  }
  return pets;
}

// GET /pets/:petId/spritesheet — 二进制回包（防路径穿越：PET_ID_RE 白名单）
router.get('/pets/:petId/spritesheet', (req: Request, res: Response) => {
  const petId = req.params.petId;
  if (!PET_ID_RE.test(petId)) {
    failDetail(res, 404, 'Pet not found');
    return;
  }
  const sheet = findSpritesheet(petId);
  if (!sheet) {
    failDetail(res, 404, 'Pet not found');
    return;
  }
  const MIME: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.gif': 'image/gif',
  };
  res.setHeader('Content-Type', MIME[path.extname(sheet)] ?? 'application/octet-stream');
  fs.createReadStream(sheet).pipe(res);
});

// POST /pets/sync?source=&limit= — PetShare / j20 Hatchery 社区宠下载
router.post('/pets/sync', async (req: Request, res: Response) => {
  const sourceRaw = typeof req.query.source === 'string' ? req.query.source : 'all';
  const limitRaw = Number.parseInt(String(req.query.limit ?? '24'), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 24;
  if (sourceRaw !== 'petshare' && sourceRaw !== 'hatchery' && sourceRaw !== 'all') {
    failDetail(res, 422, 'Invalid source');
    return;
  }

  const userRoot = userPetsRoot();
  try {
    fs.mkdirSync(userRoot, { recursive: true });
  } catch {
    /* fallthrough — download 会再报错 */
  }

  let wrote = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  async function fetchJson(url: string): Promise<unknown | null> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return JSON.parse(await r.text());
    } catch (e) {
      errors.push(`Fetch ${url}: ${(e as Error).message}`);
      return null;
    }
  }

  async function downloadSprite(url: string, dest: string, ext: string): Promise<boolean> {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const buf = Buffer.from(await r.arrayBuffer());
      // 魔数校验：防非图片内容落盘
      const MAGIC: Record<string, Buffer> = {
        '.webp': Buffer.from('RIFF', 'ascii'),
        '.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        '.gif': Buffer.from('GIF8', 'ascii'),
      };
      const magic = MAGIC[`.${ext}`];
      if (magic && !buf.subarray(0, magic.length).equals(magic)) return false;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return true;
    } catch (e) {
      errors.push(`Download ${url}: ${(e as Error).message}`);
      return false;
    }
  }

  function sanitize(val: unknown): string {
    if (typeof val !== 'string') return '';
    return val.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
  }

  function pickExt(sheetUrl: string): string {
    const ext = sheetUrl.includes('.') ? sheetUrl.split('.').pop()!.toLowerCase() : 'webp';
    return ext === 'webp' || ext === 'png' || ext === 'gif' ? ext : 'webp';
  }

  interface SyncTask {
    source: string;
    folder: string;
    manifest: Obj;
    spritesheetUrl: string;
    ext: string;
  }
  const tasks: SyncTask[] = [];

  // --- PetShare ---
  if (sourceRaw === 'petshare' || sourceRaw === 'all') {
    const url = `https://ihzwckyzfcuktrljwpha.supabase.co/functions/v1/petshare/api/pets?page=1&pageSize=${limit}`;
    const data = await fetchJson(url);
    if (data && typeof data === 'object') {
      const d = data as Obj;
      const items = Array.isArray(data)
        ? (data as unknown[])
        : Array.isArray(d['pets'])
          ? (d['pets'] as unknown[])
          : [];
      for (const item of items.slice(0, limit)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const o = item as Obj;
        const pid = sanitize(o['id'] ?? o['displayName'] ?? '');
        if (!pid) continue;
        const sheetUrl = o['spritesheetUrl'] ?? o['spritesheetPath'];
        if (typeof sheetUrl !== 'string' || !sheetUrl) continue;
        tasks.push({
          source: 'petshare',
          folder: pid,
          manifest: {
            displayName: typeof o['displayName'] === 'string' ? o['displayName'] : pid,
            description: typeof o['description'] === 'string' ? o['description'] : '',
            author: typeof o['ownerName'] === 'string' ? o['ownerName'] : '',
            tags: Array.isArray(o['tags']) ? o['tags'] : [],
          },
          spritesheetUrl: sheetUrl,
          ext: pickExt(sheetUrl),
        });
      }
    }
  }

  // --- Hatchery ---
  if (sourceRaw === 'hatchery' || sourceRaw === 'all') {
    const hatchData = await fetchJson('https://j20.nz/hatchery/api/pets.json');
    if (hatchData && typeof hatchData === 'object') {
      const d = hatchData as Obj;
      const items = Array.isArray(hatchData)
        ? (hatchData as unknown[])
        : Array.isArray(d['pets'])
          ? (d['pets'] as unknown[])
          : [];
      const existingFolders = new Set(tasks.map((t) => t.folder));
      for (const item of items.slice(0, limit)) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const o = item as Obj;
        const pid = sanitize(o['petManifestId'] ?? o['id'] ?? o['displayName'] ?? '');
        if (!pid || existingFolders.has(pid)) continue;
        const sheetUrl = o['spritesheetUrl'];
        if (typeof sheetUrl !== 'string' || !sheetUrl) continue;
        tasks.push({
          source: 'hatchery',
          folder: pid,
          manifest: {
            displayName: typeof o['displayName'] === 'string' ? o['displayName'] : pid,
            description: typeof o['description'] === 'string' ? o['description'] : '',
            author: typeof o['authorLabel'] === 'string' ? o['authorLabel'] : '',
            tags: [],
          },
          spritesheetUrl: sheetUrl,
          ext: pickExt(sheetUrl),
        });
      }
    }
  }

  const total = tasks.length;

  for (const task of tasks) {
    const sheetPath = path.join(userRoot, task.folder, `spritesheet.${task.ext}`);
    if (fs.existsSync(sheetPath)) {
      skipped += 1;
      continue;
    }
    if (await downloadSprite(task.spritesheetUrl, sheetPath, task.ext)) {
      writeJsonAtomic(path.join(userRoot, task.folder, 'pet.json'), task.manifest);
      wrote += 1;
    } else {
      failed += 1;
    }
  }

  res.json({
    wrote,
    skipped,
    failed,
    total,
    errors: errors.slice(0, 10),
    rootDir: userRoot,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 老协议 BYOK / media 删除端点 — byok-config.json / media-config.json
// ════════════════════════════════════════════════════════════════════════════

const BYOK_CONFIG_FILE = (): string => repoDataFile('byok-config.json');
const MEDIA_CONFIG_FILE = (): string => repoDataFile('media-config.json');

const PY_VALID_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'deepseek', 'azure', 'zhipu', 'mimo']);
const PY_DEFAULT_MODEL = 'claude-sonnet-4-6';

const MEDIA_PROVIDERS = [
  { id: 'openai-image', name: 'OpenAI Image',    hint: 'DALL-E / gpt-image-2',    category: 'image' },
  { id: 'stability',    name: 'Stability AI',    hint: 'Stable Diffusion',        category: 'image' },
  { id: 'fal',          name: 'Fal.ai',          hint: 'Fast image generation',   category: 'image' },
  { id: 'replicate',    name: 'Replicate',       hint: 'Open model hosting',      category: 'image' },
  { id: 'xai',          name: 'xAI / Grok',      hint: 'Aurora image model',      category: 'image' },
  { id: 'kling',        name: 'Kling',           hint: 'Video generation',        category: 'video' },
  { id: 'minimax',      name: 'MiniMax',         hint: 'Video + TTS',             category: 'video' },
  { id: 'elevenlabs',   name: 'ElevenLabs',      hint: 'Voice & audio',           category: 'audio' },
  { id: 'suno',         name: 'Suno',            hint: 'AI music generation',     category: 'audio' },
];
const MEDIA_PROVIDER_IDS = new Set(MEDIA_PROVIDERS.map((p) => p.id));

function readByokConfig(): { keys: Record<string, unknown>; baseUrls: Record<string, unknown>; model: string } {
  const data = readJson(BYOK_CONFIG_FILE());
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Obj;
    return {
      keys: (d['keys'] && typeof d['keys'] === 'object' && !Array.isArray(d['keys'])
        ? (d['keys'] as Record<string, unknown>)
        : {}),
      baseUrls: (d['baseUrls'] && typeof d['baseUrls'] === 'object' && !Array.isArray(d['baseUrls'])
        ? (d['baseUrls'] as Record<string, unknown>)
        : {}),
      model: typeof d['model'] === 'string' ? (d['model'] as string) : PY_DEFAULT_MODEL,
    };
  }
  const keys: Record<string, unknown> = {};
  for (const p of PY_VALID_PROVIDERS) keys[p] = null;
  return { keys, baseUrls: {}, model: PY_DEFAULT_MODEL };
}

// DELETE /byok/:provider — 清老协议 BYOK key（{keys[provider]: null} 保留档位）
router.delete('/byok/:provider', (req: Request, res: Response) => {
  const provider = req.params.provider;
  if (!PY_VALID_PROVIDERS.has(provider)) {
    failDetail(res, 422, 'Invalid provider');
    return;
  }
  try {
    const config = readByokConfig();
    config.keys[provider] = null;
    writeJsonAtomic(BYOK_CONFIG_FILE(), config);
  } catch {
    failDetail(res, 500, 'Failed to clear BYOK key');
    return;
  }
  res.json({ ok: true });
});

function readMediaConfig(): Obj {
  const data = readJson(MEDIA_CONFIG_FILE());
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Obj)
    : { keys: {} };
}

function writeMediaKey(providerId: string, apiKey: string): Obj {
  const cfg = readMediaConfig();
  const keys =
    cfg['keys'] && typeof cfg['keys'] === 'object' && !Array.isArray(cfg['keys'])
      ? (cfg['keys'] as Record<string, unknown>)
      : {};
  keys[providerId] = apiKey ? apiKey : null;
  cfg['keys'] = keys;
  writeJsonAtomic(MEDIA_CONFIG_FILE(), cfg);
  return cfg;
}

// DELETE /media/:providerId — 清 media key（写 null；无效 provider 也 200 {ok:true}，
// python delete_media_config 只在写文件炸掉时 500 且仍返回 {ok:true}——这里同语义）
router.delete('/media/:providerId', (req: Request, res: Response) => {
  const providerId = req.params.providerId;
  if (!MEDIA_PROVIDER_IDS.has(providerId)) {
    failDetail(res, 422, 'Unknown provider');
    return;
  }
  try {
    writeMediaKey(providerId, '');
  } catch {
    // python 该路径吞错后仍返回 ok:true
  }
  res.json({ ok: true });
});

export default router;
