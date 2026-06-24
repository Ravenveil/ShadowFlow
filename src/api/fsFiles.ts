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
}

export interface FsListDirsResult {
  path: string;
  parent: string | null;
  isRoot: boolean;
  entries: FsDirEntry[];
}

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

/** 列出某目录下的子目录（及全部条目）。path 省略=home；'ROOT'=盘符列表。 */
export async function listDirs(path?: string): Promise<FsListDirsResult | null> {
  try {
    const qs = path ? `?path=${encodeURIComponent(path)}` : '';
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
