/**
 * run-sessions/artifacts.ts — 多产物登记：blueprint 事件捕获器（run_artifacts 表）。
 */
import type { ArtifactType } from '../../../storage/runs';

export const VALID_ARTIFACT_TYPES: ReadonlyArray<ArtifactType> = ['yaml', 'html', 'markdown'];


export function coerceArtifactType(raw: unknown): ArtifactType | null {
  if (typeof raw !== 'string') return null;
  return (VALID_ARTIFACT_TYPES as ReadonlyArray<string>).includes(raw)
    ? (raw as ArtifactType)
    : null;
}

// ── 多产物登记（2026-11-07）— blueprint 事件捕获器 ──────────────────────────
// 此前「last blueprint wins」：一个 run 只留最后一件产物（runs 表三字段），
// 其余产物在产物面板/项目产物里全部不可见。现在每件 blueprint 产物都进
// captured 列表（storage/runs.ts run_artifacts 表持久化）。
// 导出为纯函数供 __tests__/run-artifacts.test.ts 直测。

/** 一件捕获到的产物（= storage/runs.ts RunArtifact 的运行时形状）。 */
export interface CapturedArtifact {
  type: ArtifactType | null;
  filename: string | null;
  url: string | null;
}

/**
 * captureBlueprintArtifact — 把一条 blueprint 事件的载荷登记进 captured。
 *
 * - 载荷全空（type/filename/url 均无）→ 不登记，返回 null。
 * - 身份 = filename ?? url：同名产物的重复事件**覆盖**既有行（后值补齐
 *   缺字段，如先 filename 后带 url 的补发），不产生重复行。
 * - 返回本次的条目（无论新增还是覆盖）——调用方用它维持「最后一件」的
 *   主产物语义（critique/回执沿用旧行为）。
 */
export function captureBlueprintArtifact(
  captured: CapturedArtifact[],
  data: { artifact_type?: unknown; filename?: unknown; artifact_url?: unknown },
): CapturedArtifact | null {
  const type = coerceArtifactType(data.artifact_type);
  const filename = typeof data.filename === 'string' && data.filename ? data.filename : null;
  const url = typeof data.artifact_url === 'string' && data.artifact_url ? data.artifact_url : null;
  if (!type && !filename && !url) return null;
  const entry: CapturedArtifact = { type, filename, url };
  const key = filename ?? url;
  const idx = key ? captured.findIndex((a) => (a.filename ?? a.url) === key) : -1;
  if (idx >= 0) captured[idx] = entry;
  else captured.push(entry);
  return entry;
}
