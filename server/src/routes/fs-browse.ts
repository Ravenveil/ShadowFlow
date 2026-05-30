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
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';

const router = Router();
const IS_WIN = platform() === 'win32';

/**
 * 清洗用户粘贴的路径,2026-05-30。Windows 资源管理器「复制为路径」给的是带双引号的
 * `"D:\foo"`,拖拽/PowerShell 也可能带前后空格或单引号 —— 直接 statSync 会 NOT_FOUND。
 * 去掉首尾空白 + 成对的首尾引号。这是用户「粘贴路径读不到」的主因。
 */
function sanitizePath(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) s = s.slice(1, -1).trim();
  }
  return s;
}

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

  const clean = sanitizePath(raw);
  const target = clean ? path.resolve(clean) : homedir();

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
  const raw = typeof req.query.path === 'string' ? sanitizePath(req.query.path) : '';
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

/**
 * GET /api/fs/pick-native — 弹出操作系统原生文件夹选择对话框,2026-05-30。
 *
 * 浏览器拿不到系统弹窗的真实路径(安全沙箱),但 daemon 跑在用户本机,可以替前端
 * 弹一个真实的 OS 文件夹对话框、把用户选中的绝对路径回传 —— 比粘贴路径更顺手。
 *   - Windows:PowerShell `-STA` + `System.Windows.Forms.FolderBrowserDialog`
 *   - macOS:`osascript`(choose folder)
 *   - Linux:`zenity --file-selection --directory`(装了 zenity 才有)
 * 返回 `{ data: { path } }`(选了)/ `{ data: { cancelled: true } }`(取消)/
 * 503 `{ error: UNSUPPORTED }`(工具缺失)。对话框弹在 daemon 所在机器(=用户本机)。
 */
router.get('/pick-native', (_req: Request, res: Response) => {
  const os = platform();
  let cmd: string;
  let args: string[];
  if (os === 'win32') {
    // -STA 必须:FolderBrowserDialog 需单线程单元;-NoProfile 加速且避免配置干扰。
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
      "$d.Description = 'ShadowFlow - 选择 CLI 工作目录';",
      '$d.ShowNewFolderButton = $true;',
      'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) }',
    ].join(' ');
    cmd = 'powershell.exe';
    args = ['-NoProfile', '-STA', '-Command', ps];
  } else if (os === 'darwin') {
    cmd = 'osascript';
    args = ['-e', 'try', '-e', 'POSIX path of (choose folder with prompt "选择 CLI 工作目录")', '-e', 'on error', '-e', 'return ""', '-e', 'end try'];
  } else {
    cmd = 'zenity';
    args = ['--file-selection', '--directory', '--title=选择 CLI 工作目录'];
  }

  // 给用户足够时间操作(最多 5 分钟)。execFile 不走 shell,避免注入。
  execFile(cmd, args, { timeout: 300_000, windowsHide: false }, (err, stdout) => {
    const picked = (stdout || '').trim();
    if (picked) {
      res.json({ data: { path: picked } });
      return;
    }
    if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(503).json({
        error: { code: 'UNSUPPORTED', message: `本机没有可用的原生文件夹对话框(${cmd} 缺失)` },
      });
      return;
    }
    res.json({ data: { cancelled: true } });
  });
});

export { router as fsBrowseRouter };
export default router;
