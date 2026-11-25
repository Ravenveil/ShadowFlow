/**
 * http/arc.ts — ARC（AutoResearchClaw）管线观测的映射层。
 *
 * 后端 `/api/arc/*` 返回的形状已经是领域形状（状态推断在后端 model 完成），
 * 这里只做三件事：信封拆包、宽容兜底（缺字段不炸）、runs 与会话工作目录
 * 的归属匹配。组件不认识这些 DTO，只认 `data/types.ts` 的视图类型。
 */
import { mayGet, pickData, request } from '@/shared/data/http/client';
import { ROUTES } from '@/shared/data/http/client';
import type { ArcPipelineView, ArcRunCard, ArcRunFile, ArcStageView, ArcVerifyItem, ArtifactContent } from '@/shared/data/types';

/* ── DTO（后端 research 域的响应形状） ─────────────────────────────── */

interface ArcRunDto {
  runId?: string;
  dir?: string;
  status?: string;
  doneCount?: number;
  total?: number;
  updatedAt?: string | null;
  topic?: string | null;
}

interface ArcFileDto {
  name?: string;
  path?: string;
  kind?: string;
  size?: number;
}

interface ArcStageDto {
  index?: number;
  key?: string;
  label?: string;
  phase?: string;
  phaseLabel?: string;
  isGate?: boolean;
  status?: string;
  attempts?: number;
  decision?: string | null;
  durationSec?: number | null;
  error?: string | null;
  artifacts?: ArcFileDto[];
}

interface ArcVerifyDto {
  total?: number;
  verified?: number;
  suspicious?: number;
  hallucinated?: number;
  integrityScore?: number | null;
  items?: Array<{ citeKey?: string; title?: string; status?: string; method?: string | null; confidence?: number | null }>;
}

interface ArcQualityDto {
  score?: number | null;
  verdict?: string | null;
  strengths?: string[];
  weaknesses?: string[];
}

interface ArcDecisionDto {
  decision?: string;
  rollbackTarget?: string | null;
  rollbackStage?: number | null;
  attempt?: number | null;
  timestamp?: string | null;
}

interface ArcDetailDto extends ArcRunDto {
  stages?: ArcStageDto[];
  deliverables?: ArcFileDto[];
  verification?: ArcVerifyDto | null;
  quality?: ArcQualityDto | null;
  decisions?: ArcDecisionDto[];
  contentMetrics?: Record<string, unknown> | null;
}

const STATUSES: NonNullable<ArcRunCard['status']>[] = ['running', 'succeeded', 'failed', 'paused', 'unknown'];

function toStatus(raw: unknown): ArcRunCard['status'] {
  return STATUSES.includes(raw as ArcRunCard['status']) ? (raw as ArcRunCard['status']) : 'unknown';
}

function toFiles(rows: ArcFileDto[] | undefined): ArcRunFile[] {
  return (rows ?? [])
    .filter((row) => !!row?.name && !!row?.path)
    .map((row) => ({ name: row.name as string, path: row.path as string, kind: row.kind ?? 'other', size: row.size ?? 0 }));
}

function toStages(rows: ArcStageDto[]): ArcStageView[] {
  return rows
    .filter((row) => typeof row?.index === 'number')
    .map((row) => ({
      index: row.index as number,
      key: row.key ?? '',
      label: row.label ?? row.key ?? '',
      phase: row.phase ?? '',
      phaseLabel: row.phaseLabel ?? '',
      isGate: row.isGate === true,
      status: (['pending', 'running', 'done', 'failed', 'paused', 'skipped'].includes(row.status ?? '')
        ? row.status
        : 'pending') as ArcStageView['status'],
      attempts: row.attempts ?? 1,
      decision: row.decision ?? null,
      durationSec: row.durationSec ?? null,
      error: row.error ?? null,
      artifacts: toFiles(row.artifacts),
    }));
}

function toVerification(dto: ArcVerifyDto | null | undefined): ArcPipelineView['verification'] {
  if (!dto || typeof dto.total !== 'number') return null;
  const items: ArcVerifyItem[] = (dto.items ?? [])
    .filter((row) => !!row?.citeKey || !!row?.title)
    .map((row) => ({
      citeKey: row.citeKey ?? '',
      title: row.title ?? '',
      status: row.status ?? 'unknown',
      method: row.method ?? null,
      confidence: row.confidence ?? null,
    }));
  return {
    total: dto.total,
    verified: dto.verified ?? 0,
    suspicious: dto.suspicious ?? 0,
    hallucinated: dto.hallucinated ?? 0,
    integrityScore: dto.integrityScore ?? null,
    items,
  };
}

function toQuality(dto: ArcQualityDto | null | undefined): ArcPipelineView['quality'] {
  if (!dto || (dto.score == null && !dto.verdict)) return null;
  return {
    score: dto.score ?? null,
    verdict: dto.verdict ?? null,
    strengths: dto.strengths ?? [],
    weaknesses: dto.weaknesses ?? [],
  };
}

export function toArcRunCards(rows: ArcRunDto[] | null | undefined): ArcRunCard[] {
  return (rows ?? [])
    .filter((row) => !!row?.runId)
    .map((row) => ({
      runId: row.runId as string,
      status: toStatus(row.status),
      doneCount: row.doneCount ?? 0,
      total: row.total ?? 23,
      updatedAt: row.updatedAt ?? null,
      topic: row.topic ?? null,
    }));
}

export function toArcPipelineView(dto: ArcDetailDto | null): ArcPipelineView | null {
  if (!dto?.runId) return null;
  return {
    runId: dto.runId,
    status: toStatus(dto.status),
    doneCount: dto.doneCount ?? 0,
    total: dto.total ?? 23,
    updatedAt: dto.updatedAt ?? null,
    topic: dto.topic ?? null,
    stages: toStages(dto.stages ?? []),
    deliverables: toFiles(dto.deliverables),
    verification: toVerification(dto.verification),
    quality: toQuality(dto.quality),
    decisions: (dto.decisions ?? []).map((row) => ({
      decision: row.decision ?? 'unknown',
      rollbackTarget: row.rollbackTarget ?? null,
      rollbackStage: row.rollbackStage ?? null,
      attempt: row.attempt ?? null,
      timestamp: row.timestamp ?? null,
    })),
  };
}

/* ── 请求 ─────────────────────────────────────────────────────────── */

/** run 摘要卡（root = 会话工作目录，收窄扫描；缺省 = 全部根）。 */
export async function loadArcRuns(root?: string): Promise<ArcRunCard[]> {
  const res = await mayGet<{ data?: ArcRunDto[] }>(ROUTES.arcRuns(root));
  const rows = pickData<ArcRunDto[]>(res) ?? (Array.isArray(res) ? (res as ArcRunDto[]) : []);
  return toArcRunCards(rows);
}

/** 一次 run 的完整观测视图。 */
export async function loadArcPipeline(runId: string, root?: string): Promise<ArcPipelineView | null> {
  const res = await mayGet<{ data?: ArcDetailDto }>(ROUTES.arcRun(runId, root));
  return toArcPipelineView(pickData<ArcDetailDto>(res));
}

/** 读 run 内文本产物（截头）。 */
export async function readArcArtifact(runId: string, relPath: string, root?: string): Promise<ArtifactContent> {
  const res = await request<{ data?: { content?: string; size?: number; truncated?: boolean } }>(
    ROUTES.arcArtifact(runId, relPath, root),
  );
  return { content: res?.data?.content ?? '', size: res?.data?.size ?? 0, truncated: !!res?.data?.truncated };
}

/** run 内二进制产物（终稿 pdf / 图表）直链。 */
export function arcArtifactRawUrl(runId: string, relPath: string, root?: string): string {
  return ROUTES.arcRaw(runId, relPath, root);
}
