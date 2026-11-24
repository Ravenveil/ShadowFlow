import { getApiBase } from './_base';

export interface FsFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
  ext: string;
}

export interface FsDirEntry {
  name: string;
  path: string;
  isDir: boolean;
  /** 仅 isDir === false 的文件项才有（后端 ?include=files 时返回）。 */
  size?: number;
  /** 毫秒时间戳，同上。 */
  mtime?: number;
  /** 小写扩展名（含点，如 '.png'），同上。 */
  ext?: string;
}

export interface FsListDirsResult {
  path: string;
  parent: string | null;
  isRoot: boolean;
  entries: FsDirEntry[];
  /** 单目录文件数超过后端上限（500）时只返回前 500 个，标记被截断。 */
  truncated?: boolean;
}

/**
 * 列出某目录下的文件（隐藏 dotfile）。
 *
 * 文件树已改由 `listDirs()`（后端 `?include=files`）单请求返回目录 + 文件，
 * 此函数保留给只需要文件列表的调用方（`GET /api/fs/files` 端点仍在）。
 */
export async function listFiles(
  dir: string,
): Promise<{ dir: string; files: FsFile[] }> {
  const r = await fetch(`${getApiBase()}/api/fs/files?path=${encodeURIComponent(dir)}`);
  if (!r.ok) return { dir: '', files: [] };
  const j = await r.json();
  return {
    dir: (j.data?.path as string) ?? '',
    files: (j.data?.files as FsFile[]) ?? [],
  };
}

export async function readFile(
  file: string,
  root: string,
): Promise<{ content: string; size: number; truncated: boolean }> {
  const r = await fetch(
    `${getApiBase()}/api/fs/read?path=${encodeURIComponent(file)}&root=${encodeURIComponent(root)}`,
  );
  if (!r.ok) throw new Error(`read failed: ${r.status}`);
  return (await r.json()).data as { content: string; size: number; truncated: boolean };
}

/**
 * 在工作空间根内写文本文件（新建/覆盖），2026-08-22。
 * file 可绝对（须在 root 子树内）或相对（相对 root 解析，如新建文件只传文件名）。
 * 后端守卫：'..' 段 400、越出 root 403、>1MB 413。失败抛出带后端 message 的 Error。
 */
export async function writeFile(
  file: string,
  content: string,
  root: string,
): Promise<{ path: string; size: number }> {
  const r = await fetch(`${getApiBase()}/api/fs/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: file, content, root }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j?.error?.message as string) ?? `write failed: ${r.status}`);
  return j.data as { path: string; size: number };
}

/**
 * multipart 上传文件到工作空间根内目录（dir 须为 root 子树内的绝对路径）。
 * 同名覆盖；文件名含路径分隔符/'..' 被后端 400 拒绝。上限 8MB。
 */
export async function uploadFile(
  dir: string,
  root: string,
  file: File,
): Promise<{ path: string; name: string; size: number }> {
  const fd = new FormData();
  fd.append('dir', dir);
  fd.append('root', root);
  fd.append('file', file, file.name);
  const r = await fetch(`${getApiBase()}/api/fs/upload`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j?.error?.message as string) ?? `upload failed: ${r.status}`);
  return j.data as { path: string; name: string; size: number };
}

/**
 * 对话框拖拽传图（2026-11-07）— 上传到服务端托管的 _uploads 目录，无需
 * root/dir 语境。返回 path（agent 可读绝对路径）+ url（/projects 静态直链，
 * 时间线缩略图用）。上限 8MB，超限由后端 413 拒绝。
 */
export async function uploadChatAttachment(
  file: File,
): Promise<{ path: string; name: string; size: number; url: string }> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const r = await fetch(`${getApiBase()}/api/fs/chat-upload`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j?.error?.message as string) ?? `upload failed: ${r.status}`);
  return j.data as { path: string; name: string; size: number; url: string };
}

/**
 * 列出某目录下的条目。path 省略=home；'ROOT'=盘符列表。
 *
 * 带 `include=files`：后端一次返回目录 + 文件，目录在前文件在后（工作空间文件树
 * 需要看到产出文件，只会列目录的话右侧预览永远是空态）。文件项带 size/mtime/ext。
 */
export async function listDirs(path?: string): Promise<FsListDirsResult | null> {
  try {
    const qs = path
      ? `?path=${encodeURIComponent(path)}&include=files`
      : '?include=files';
    const r = await fetch(`${getApiBase()}/api/fs/list${qs}`);
    if (!r.ok) return null;
    const j = await r.json();
    return (j.data ?? null) as FsListDirsResult | null;
  } catch {
    return null;
  }
}

/**
 * 用系统默认程序打开文件（Open-in-editor）。daemon 跑在本机，调 OS「打开」命令。
 * 返回 true = 已发起打开；false = 失败 / 503 不支持。
 */
export async function openInEditor(file: string): Promise<boolean> {
  try {
    const r = await fetch(`${getApiBase()}/api/fs/open-native?path=${encodeURIComponent(file)}`);
    if (!r.ok) return false;
    const j = await r.json();
    return j.data?.opened === true;
  } catch {
    return false;
  }
}

/**
 * 文件原始字节直链（图片 <img src> / .html iframe 预览用），带 root 白名单守卫。
 */
export function rawUrl(file: string, root: string): string {
  return `${getApiBase()}/api/fs/raw?path=${encodeURIComponent(file)}&root=${encodeURIComponent(root)}`;
}

/**
 * 弹出操作系统原生文件夹选择框（由后端在本机弹出）。
 * 返回用户选中的绝对路径；null = 取消 / 503 不支持。
 */
export async function pickNativeFolder(): Promise<string | null> {
  try {
    const r = await fetch(`${getApiBase()}/api/fs/pick-native`);
    if (!r.ok) return null;
    const j = await r.json();
    const p = j.data?.path;
    return typeof p === 'string' && p.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}
