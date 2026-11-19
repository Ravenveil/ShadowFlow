/**
 * commerce 域 — social-publish 子域领域模型（纯规则层）
 *
 * 帖子四态状态机 + 人工审核门 + 平台字数/媒体限制，纯函数，禁止 import
 * express/sqlite/crypto/fs。
 *
 * 状态机（C5 人工审核门，对齐 T09 审批门语义）：
 *   draft ──提交审核──> pending_review ──通过──> approved ──发布──> published
 *     ↑                     │                              └──失败──> failed
 *     └──── 退回 ──── rejected <──驳回──┘
 *
 * 关键不变量：
 *   - 仅 draft / rejected 可提审；仅 pending_review 可裁定
 *   - pending_review / rejected 禁止外发（防止绕过人工门）
 *   - published 不可重复发布
 *   - 校验一律返回结果对象，不抛异常（技术错误由 adapter/storage 映射成 HTTP 语义）
 */

export const POST_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'publishing',
  'published',
  'failed',
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export type RuleResult = { ok: true } | { ok: false; code: string; message: string };

const OK: RuleResult = { ok: true };

/** 提审前置：仅 draft / rejected 可提审。 */
export function checkSubmitForReview(status: string): RuleResult {
  if (status === 'draft' || status === 'rejected') return OK;
  return {
    ok: false,
    code: 'INVALID_STATUS',
    message: `当前状态 ${status} 不能提审（仅 draft / rejected 可提审）`,
  };
}

/** 裁定前置：仅 pending_review 可审核。 */
export function checkReview(status: string): RuleResult {
  if (status === 'pending_review') return OK;
  return {
    ok: false,
    code: 'INVALID_STATUS',
    message: `当前状态 ${status} 不在审核中（仅 pending_review 可审核）`,
  };
}

/**
 * 外发前置（人工门）。draft 直发保留——人工点发布即人工门本身；
 * 自动化批量外发必须走提审→过审。
 */
export function checkPublishable(status: string): RuleResult {
  if (status === 'published') {
    return { ok: false, code: 'POST_ALREADY_PUBLISHED', message: '帖子已发布，不能重复发布' };
  }
  if (status === 'pending_review') {
    return { ok: false, code: 'REVIEW_PENDING', message: '帖子在人工审核中，过审前不可外发' };
  }
  if (status === 'rejected') {
    return { ok: false, code: 'REVIEW_REJECTED', message: '帖子已被审核退回，请修改后重新提审' };
  }
  return OK;
}

/** 裁定后的目标状态。 */
export function reviewNextStatus(decision: 'approve' | 'reject'): PostStatus {
  return decision === 'approve' ? 'approved' : 'rejected';
}

/** action journal 的裁定枚举是 auto/approve/deny/block —— reject 语义映射 deny。 */
export function reviewActionDecision(decision: 'approve' | 'reject'): 'approve' | 'deny' {
  return decision === 'approve' ? 'approve' : 'deny';
}

export interface ReviewRecordShape {
  decision: 'approve' | 'reject';
  comment?: string;
  reviewer?: string;
  ts: number;
}

/** 裁定留痕：意见 ≤500 字、审核人 ≤64 字，空值不落字段。 */
export function buildReviewRecord(
  decision: 'approve' | 'reject',
  comment: string | undefined,
  reviewer: string | undefined,
  ts: number,
): ReviewRecordShape {
  return {
    decision,
    ...(comment ? { comment: comment.slice(0, 500) } : {}),
    ...(reviewer ? { reviewer: reviewer.slice(0, 64) } : {}),
    ts,
  };
}

/** 媒体数组校验：必须是字符串数组，且不超过平台上限，单条 URL ≤2048。 */
export function checkMedia(
  media: unknown,
  maxMedia: number,
  platformName: string,
): { ok: true; list: string[] } | { ok: false; code: string; message: string } {
  if (media == null) return { ok: true, list: [] };
  if (!Array.isArray(media) || media.some((m) => typeof m !== 'string')) {
    return { ok: false, code: 'INVALID_MEDIA', message: 'media 必须是字符串数组' };
  }
  const list = media as string[];
  if (list.length > maxMedia) {
    return {
      ok: false,
      code: 'MEDIA_LIMIT',
      message: `${platformName} 最多 ${maxMedia} 张图`,
    };
  }
  return { ok: true, list: list.map((m) => String(m).slice(0, 2048)) };
}

export interface PlatformLimits {
  name: string;
  title_max: number;
  content_max: number;
}

/** 帖文内容校验：正文必填、标题/正文不超平台上限。 */
export function checkPostBody(
  title: string,
  content: string,
  spec: PlatformLimits,
): RuleResult {
  if (!content) return { ok: false, code: 'INVALID_CONTENT', message: 'content 不能为空' };
  if (spec.title_max > 0 && title.length > spec.title_max) {
    return {
      ok: false,
      code: 'TITLE_LIMIT',
      message: `${spec.name} 标题最多 ${spec.title_max} 字`,
    };
  }
  if (content.length > spec.content_max) {
    return {
      ok: false,
      code: 'CONTENT_LIMIT',
      message: `${spec.name} 正文最多 ${spec.content_max} 字`,
    };
  }
  return OK;
}

/** 读取已入库的 media（JSON 文本）：坏数据一律当空数组，不猜。 */
export function parseStoredMedia(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === 'string') : [];
  } catch {
    return [];
  }
}
