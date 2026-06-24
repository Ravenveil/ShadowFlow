import { getApiBase } from './_base';

export interface FsFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
  ext: string;
}

export async function listFiles(dir: string): Promise<FsFile[]> {
  const r = await fetch(`${getApiBase()}/api/fs/files?path=${encodeURIComponent(dir)}`);
  if (!r.ok) return [];
  const j = await r.json();
  return j.data?.files ?? [];
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
