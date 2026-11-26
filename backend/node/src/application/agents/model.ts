/**
 * model.ts — Agent Pack Registry 的纯数据模型与规则函数。
 *
 * 从 infra-registry.ts 抽出，供其 import（也可独立单测）：
 *   - PackManifest        — pack 清单数据类型
 *   - parseVersionParts   — semver 解析（compareVersions 的私有依赖，一并迁移）
 *   - compareVersions     — prerelease-aware 版本比较
 *   - verifySignature     — HMAC-SHA256 签名校验
 *
 * 未迁移：installStatus 依赖 infra-registry.ts 的模块级闭包变量 packCache 与
 * getInstalledVersion（读文件），非纯函数，原样移动无法编译，故留在原文件。
 */

import crypto from 'crypto';
import yaml from 'js-yaml';

export interface PackManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  author: string;
  soul: string;
  kind: string;
  capabilities: {
    tools: string[];
    llm_provider: string;
    streaming: boolean;
    approval_required: boolean;
    session_resume: boolean;
    tool_calls: boolean;
  };
  install_cmd: string | null;
  signature: { algorithm: string; value: string } | null;
}

/** prerelease-aware 点分段版本比较；解析失败 → 0.0.0（对齐 _parse_version 兜底）。 */
function parseVersionParts(v: string): { core: number[]; pre: string | null } {
  const str = String(v ?? '').trim();
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.*))?$/.exec(str);
  if (!m) return { core: [0, 0, 0], pre: null };
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  for (let i = 0; i < 3; i++) {
    const diff = pa.core[i]! - pb.core[i]!;
    if (diff !== 0) return diff;
  }
  // 无 prerelease > 有 prerelease（semver 规则）；都有则字典序。
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
}

/** HMAC-SHA256 over canonical yaml（sortKeys 对齐 PyYAML sort_keys=True）。 */
export function verifySignature(manifest: PackManifest): boolean {
  if (manifest.signature === null || manifest.signature === undefined) return true;
  const secret = (process.env.SHADOWFLOW_PACK_SECRET ?? '').trim();
  if (!secret) return false; // 有签名但无 secret → 视为校验失败（防绕过）
  const { signature: _ignored, ...body } = manifest;
  void _ignored;
  const canonical = yaml.dump(body, { sortKeys: true, lineWidth: 80, noRefs: true });
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf-8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(manifest.signature.value, 'utf-8'));
  } catch {
    return false;
  }
}
