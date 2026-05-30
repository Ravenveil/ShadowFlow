/**
 * fsBrowse.ts — 后端目录浏览器客户端,2026-05-30。
 *
 * 配合 server/src/routes/fs-browse.ts。浏览器拿不到本地文件夹真实磁盘路径,
 * 由 Node 后端读磁盘列目录,前端逐层点选拿回绝对路径,用作 CLI cwd。
 */
import { getApiBase } from './_base';

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FsListResult {
  /** 当前目录绝对路径,或 'ROOT'(盘符列表)。 */
  path: string;
  /** 父目录路径;到文件系统根再上 → 'ROOT'(Win)或 null(POSIX)。 */
  parent: string | null;
  isRoot: boolean;
  entries: FsEntry[];
}

export interface FsHome {
  home: string;
  sep: string;
  isWindows: boolean;
}

export async function fsHome(): Promise<FsHome | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/fs/home`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data ?? null) as FsHome | null;
  } catch {
    return null;
  }
}

/** 列出某目录的子目录。path 省略=home;'ROOT'=盘符/根。 */
export async function fsList(path?: string): Promise<FsListResult | null> {
  try {
    const qs = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await fetch(`${getApiBase()}/api/fs/list${qs}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data ?? null) as FsListResult | null;
  } catch {
    return null;
  }
}

export interface FsValidate {
  valid: boolean;
  reason: string | null;
  path?: string;
}

/**
 * 弹出操作系统原生文件夹对话框(daemon 在本机替前端弹),返回用户选的绝对路径。
 * null = 用户取消 / 本机不支持(浏览器拿不到原生弹窗路径,故走后端)。
 */
export async function fsPickNative(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/fs/pick-native`);
    if (!res.ok) return null; // 503 UNSUPPORTED 等
    const json = await res.json();
    const p = json.data?.path;
    return typeof p === 'string' && p.trim() ? p.trim() : null;
  } catch {
    return null;
  }
}

/** 校验候选 cwd:必须是存在的绝对目录。 */
export async function fsValidate(path: string): Promise<FsValidate> {
  try {
    const res = await fetch(`${getApiBase()}/api/fs/validate?path=${encodeURIComponent(path)}`);
    if (!res.ok) return { valid: false, reason: 'request-failed' };
    const json = await res.json();
    return (json.data ?? { valid: false, reason: 'no-data' }) as FsValidate;
  } catch {
    return { valid: false, reason: 'network' };
  }
}
