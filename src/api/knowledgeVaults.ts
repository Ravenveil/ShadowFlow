/**
 * knowledgeVaults.ts — /api/knowledge-vaults API client（2026-08-19）。
 *
 * 本地仓库知识库（Obsidian vault 模式）。Node 侧直连（不经 Python）。
 * 错误处理对齐 api/knowledge.ts：稳定 code（VAULT_NOT_FOUND / NOT_A_DIR /
 * FORBIDDEN / …），非 JSON 响应显式抛错避免裸 SyntaxError。
 */
import type {
  KnowledgeVault,
  VaultFileContentData,
  VaultFilesData,
} from '../common/types/knowledgeVault';
import type { GraphData } from '../common/utils/graphAnalysis';
import type { KnowledgeGraphMeta } from './knowledge';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export class VaultApiError extends Error {
  public readonly code: string;

  constructor(
    public status: number,
    public detail: unknown,
    code: string = '',
  ) {
    super(`Vault API error ${status}`);
    this.code = code || `HTTP_${status}`;
  }
}

function _extractErrorCode(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>;
    const inner = d.error;
    if (inner && typeof inner === 'object') {
      const code = (inner as Record<string, unknown>).code;
      if (typeof code === 'string') return code;
    }
    const code = d.code;
    if (typeof code === 'string') return code;
  }
  return '';
}

async function _handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    try {
      return (await res.json()) as T;
    } catch {
      throw new VaultApiError(res.status, 'non-JSON response', 'VAULT_API_BAD_RESPONSE');
    }
  }
  const body = await res.text();
  let detail: unknown = body;
  try {
    detail = JSON.parse(body);
  } catch {
    /* keep raw text */
  }
  throw new VaultApiError(res.status, detail, _extractErrorCode(detail));
}

export async function listVaults(): Promise<{ data: { vaults: KnowledgeVault[] } }> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge-vaults`);
  return _handleResponse<{ data: { vaults: KnowledgeVault[] } }>(res);
}

export async function addVault(payload: {
  path: string;
  name?: string;
  /** 目标不存在时新建一级目录再注册(新建仓库流程)。 */
  create?: boolean;
}): Promise<{ data: KnowledgeVault }> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge-vaults`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<{ data: KnowledgeVault }>(res);
}

export async function renameVault(
  vaultId: string,
  name: string,
): Promise<{ data: KnowledgeVault }> {
  const res = await fetch(`${API_BASE_URL}/api/knowledge-vaults/${encodeURIComponent(vaultId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return _handleResponse<{ data: KnowledgeVault }>(res);
}

export async function removeVault(
  vaultId: string,
): Promise<{ data: { deleted: boolean; vault_id: string; disk_untouched: boolean } }> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge-vaults/${encodeURIComponent(vaultId)}`,
    { method: 'DELETE' },
  );
  return _handleResponse<{ data: { deleted: boolean; vault_id: string; disk_untouched: boolean } }>(
    res,
  );
}

export async function listVaultFiles(vaultId: string): Promise<{ data: VaultFilesData }> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge-vaults/${encodeURIComponent(vaultId)}/files`,
  );
  return _handleResponse<{ data: VaultFilesData }>(res);
}

export async function readVaultFile(
  vaultId: string,
  relPath: string,
): Promise<{ data: VaultFileContentData }> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge-vaults/${encodeURIComponent(vaultId)}/file` +
      `?path=${encodeURIComponent(relPath)}`,
  );
  return _handleResponse<{ data: VaultFileContentData }>(res);
}

/** 文件夹链接图谱(Obsidian 式,后端即时计算;响应形状与 pack 图谱一致)。 */
export interface VaultGraphResponse {
  data: GraphData;
  meta: KnowledgeGraphMeta & { scanned_files?: number; truncated?: boolean };
}

export async function getVaultGraph(vaultId: string): Promise<VaultGraphResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/knowledge-vaults/${encodeURIComponent(vaultId)}/graph`,
  );
  return _handleResponse<VaultGraphResponse>(res);
}
