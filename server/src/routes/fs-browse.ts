/**
 * fs-browse.ts — 后端目录浏览器,2026-05-30。
 *
 * 为什么需要:浏览器拿不到本地文件夹的真实磁盘绝对路径(安全沙箱),而 CLI 的
 * cwd 需要一个真实路径。Node 后端就跑在用户本机,能读磁盘 —— 所以由后端列目录、
 * 前端逐层点选、回传绝对路径,是纯网页能拿到真路径的唯一方案。
 *
 * 只读、只列目录(不返回文件内容)。单机单用户场景,列目录是预期功能。
 *
 *   GET /api/fs/list?path=<abs>   列出 <path> 下的子目录;path 省略 → 用户 home。
 *                                  path='ROOT' → 列盘符(Windows)或 '/'(POSIX)。
 *   GET /api/fs/home              返回 { home, sep }(前端初始化用)。
 */
import { Router, type Request, type Response } from 'express';
import { readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';

const router = Router();
const IS_WIN = platform() === 'win32';

/** Windows 盘符枚举:试 A: … Z:,可 stat 的算存在。POSIX 直接返回 '/'。 */
function listDrives(): Array<{ name: string; path: string; isDir: true }> {
  if (!IS_WIN) return [{ name: '/', path: '/', isDir: true }];
  const out: Array<{ name: string; path: string; isDir: true }> = [];
  for (let c = 65; c <= 90; c++) {
    const drive = `${String.fromCharCode(c)}:\\`;
    try {
      statSync(drive);
      out.push({ name: `${String.fromCharCode(c)}:`, path: drive, isDir: true });
    } catch {
      /* drive not present */
    }
  }
  return out;
}

/** 父目录;到达盘符根(D:\)或 POSIX 根(/)再上 → null(调用方据此回到盘符列表)。 */
function parentOf(abs: string): string | null {
  const parent = path.dirname(abs);
  if (parent === abs) return null; // already at filesystem root
  return parent;
}

router.get('/home', (_req: Request, res: Response) => {
  res.json({ data: { home: homedir(), sep: path.sep, isWindows: IS_WIN } });
});

router.get('/list', (req: Request, res: Response) => {
  const raw = typeof req.query.path === 'string' ? req.query.path : '';

  // Special sentinel → drive/root listing.
  if (raw === 'ROOT') {
    res.json({ data: { path: 'ROOT', parent: null, isRoot: true, entries: listDrives() } });
    return;
  }

  const target = raw.trim() ? path.resolve(raw) : homedir();

  let names: string[];
  try {
    const st = statSync(target);
    if (!st.isDirectory()) {
      res.status(400).json({ error: { code: 'NOT_A_DIR', message: `${target} 不是目录` } });
      return;
    }
    names = readdirSync(target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: msg, path: target } });
    return;
  }

  const entries: Array<{ name: string; path: string; isDir: boolean }> = [];
  for (const name of names) {
    if (name.startsWith('.')) continue; // hide dotfiles/dirs by default
    const full = path.join(target, name);
    try {
      if (statSync(full).isDirectory()) {
        entries.push({ name, path: full, isDir: true });
      }
    } catch {
      /* unreadable entry (permissions / broken link) — skip */
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // parent: at a Windows drive root (D:\) dirname returns itself → expose ROOT
  // sentinel so the UI can step up to the drive list.
  let parent = parentOf(target);
  if (parent === null && IS_WIN) parent = 'ROOT';

  res.json({ data: { path: target, parent, isRoot: false, entries } });
});

/** Validate a candidate cwd: must be an existing absolute directory. */
router.get('/validate', (req: Request, res: Response) => {
  const raw = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  if (!raw) {
    res.json({ data: { valid: false, reason: 'empty' } });
    return;
  }
  if (!path.isAbsolute(raw)) {
    res.json({ data: { valid: false, reason: 'not-absolute', path: raw } });
    return;
  }
  try {
    const ok = statSync(raw).isDirectory();
    res.json({ data: { valid: ok, reason: ok ? null : 'not-a-dir', path: path.resolve(raw) } });
  } catch {
    res.json({ data: { valid: false, reason: 'not-found', path: raw } });
  }
});

export { router as fsBrowseRouter };
export default router;
