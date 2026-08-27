/**
 * 本地仓库（vault）类型 — 2026-08-19。
 *
 * 字段 snake_case 对齐 Node 侧 server/src/routes/knowledge-vaults.ts 的响应
 * （同 knowledge.ts 的约定：边界不做 camelCase 转换）。
 */

/** active = 目录还在磁盘上；missing = 路径已不存在/不可访问（现场探测，不落库）。 */
export type VaultHealth = 'active' | 'missing';

export interface KnowledgeVault {
  vault_id: string;
  name: string;
  /** 仓库根的磁盘绝对路径（注册时 path UNIQUE 幂等 upsert）。 */
  path: string;
  created_at: string;
  last_opened_at: string | null;
  status: string;
  health: VaultHealth;
}

export type VaultFileType = 'doc' | 'pdf' | 'image';

export interface VaultFile {
  name: string;
  /** 相对仓库根路径，一律 '/' 分隔（前端按 '/' 建文件树）。 */
  path: string;
  type: VaultFileType;
  size: number;
  mtime: number;
}

export interface VaultFilesData {
  vault_id: string;
  path: string;
  files: VaultFile[];
  total: number;
  truncated: boolean;
  by_type: Record<string, number>;
}

export interface VaultFileContentData {
  content: string;
  size: number;
  truncated: boolean;
  path: string;
  vault_id: string;
}
