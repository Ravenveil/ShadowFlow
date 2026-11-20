/**
 * approval-model.ts — OpenBot 审批纪律的文本解析规则（2026-11-20 从
 * routes/groups/groups-chat.ts 迁出）。
 *
 * 这里只放**纯规则**：决定词正则、长度闸门、意见切分。pendingApprovals
 * 注册表与 HTTP 端点留在路由层（它们是会话状态与协议形状，不是规则）。
 *
 * 背景（2026-11-05 OpenBot 审批纪律 — chat DAG approve 边的人工审批门）：
 * 用户两条路批/拒：
 *   1) 显式 API：POST /api/groups/:id/approvals/:nodeId { decision, comment? }
 *   2) 会话内自然语言：该群下一条用户消息若以 批准/同意/approve/go/继续 开头 → 批；
 *      以 拒绝/不同意/reject/否/停 开头 → 拒。
 * 2026-11-07 BE-06：决定升级为 ApprovalVerdict { decision, comment? }，文本路径
 * 意见需显式分隔符（，,、:：），防误吞派活句。
 */

/** 审批决定 + 可选自由文本意见（BE-06）。 */
export interface ApprovalVerdict {
  decision: 'approved' | 'rejected';
  /** 审批意见（自由文本，可空）。 */
  comment?: string;
}

/**
 * 纯函数：解析会话短文本里的审批决定（决定路径②宽松前缀版）。
 * 导出供回归测试直打真实实现——此前测试用同正则副本复测，双实现会漂移。
 */
export function parseApprovalDecision(text: string): 'approved' | 'rejected' | null {
  const trimmed = text.trim().toLowerCase();
  // 决定消息必须短——「批准」「拒绝」是决定，「继续写代码」这种长句是新一轮
  // 派活，不吞（前缀「继续」会误伤，长度闸门兜住）。中文 ≤6 字；拉丁词按
  // 字符计 ≤10（"approve"/"rejected" 全词各 7-8 字符）。
  const latinChars = (trimmed.match(/[a-z]/g) ?? []).length;
  const lenLimit = latinChars > 0 ? 10 : 6;
  if (trimmed.length > lenLimit) return null;
  const isApprove = /^(批准|同意|approve|ok|好|通过|allowed|yes)/.test(trimmed);
  const isReject = /^(拒绝|不同意|reject|否|不行|停|驳回|no|deny)/.test(trimmed);
  if (!isApprove && !isReject) return null;
  return isApprove ? 'approved' : 'rejected';
}

// ── BE-06 审批意见解析（2026-11-07）────────────────────────────────────────
// 决定词全集（含常见屈折形）——裸形态必须整串就是「决定词 + 轻声尾缀/标点」，
// 决定词开头的整句（「拒绝的诱惑」「停止生成」）不算决定，防误吞派活。
const APPROVE_WORD = '(?:批准|同意|通过|approved|approve|allowed|allow|yes|ok|okay|好)';
const REJECT_WORD = '(?:拒绝|不同意|驳回|不行|rejected|reject|denied|deny|no|停|否)';
const DECISION_TAIL = '(?:吧|啊|哦|呢|呀|的)?[。！!？?~～\\s]*';
const BARE_APPROVE_RE = new RegExp(`^${APPROVE_WORD}${DECISION_TAIL}$`, 'i');
const BARE_REJECT_RE = new RegExp(`^${REJECT_WORD}${DECISION_TAIL}$`, 'i');
/** 显式分隔符——只有这些后面的半句才收作审批意见。 */
const VERDICT_SEPARATORS = /[，,、:：]/;
/** 文本路径意见长度上限（API 路径见 approvalDecisionHandler，500）。 */
const MAX_TEXT_COMMENT = 200;

/**
 * 纯函数：解析会话文本里的「审批决定 + 可选意见」（BE-06，决定路径②意见版）。
 * 规则：
 *   - 有显式分隔符（，,、:：）→ 前半句必须是纯决定短语，后半句收作意见
 *     （「同意，预算砍半」→ {approved, comment:'预算砍半'}）；
 *   - 无分隔符 → 整串必须是纯决定短语（≤6 中文/≤10 拉丁闸门保留），无意见；
 *     「拒绝的诱惑」「停止生成」「approve now」这类决定词开头的派活句 → null。
 * parseApprovalDecision（宽松前缀版）保持不动——旧回归直打它；本函数供
 * tryResolveApprovalFromText 用，语义更严（意见需要显式分隔符，防误吞）。
 */
export function parseApprovalVerdict(text: string): ApprovalVerdict | null {
  const trimmed = text.trim();
  const sep = trimmed.search(VERDICT_SEPARATORS);
  if (sep >= 0) {
    const head = trimmed.slice(0, sep).trim();
    const comment = trimmed.slice(sep + 1).trim().slice(0, MAX_TEXT_COMMENT);
    const decision = bareDecision(head);
    if (!decision) return null;
    return comment ? { decision, comment } : { decision };
  }
  const decision = bareDecision(trimmed);
  return decision ? { decision } : null;
}

/** 裸决定短语判定：整串 = 决定词 + 轻尾缀/标点；带旧长度闸门兜底。 */
function bareDecision(head: string): 'approved' | 'rejected' | null {
  const latinChars = (head.match(/[a-z]/gi) ?? []).length;
  const lenLimit = latinChars > 0 ? 10 : 6;
  if (head.length > lenLimit) return null;
  if (BARE_APPROVE_RE.test(head)) return 'approved';
  if (BARE_REJECT_RE.test(head)) return 'rejected';
  return null;
}
