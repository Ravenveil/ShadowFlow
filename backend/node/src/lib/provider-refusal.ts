/**
 * provider-refusal.ts — 模型供应商拒绝/错误的人话化（2026-11-08，
 * 模式移植自 CopilotKit/OpenBot 的 provider-refusal）。
 *
 * OpenBot 纪律：模型供应商拒绝（密钥、限流、未知模型、工具过多、请求过大、
 * 供应商宕机、欠费等）时**用人话结束该轮**，供应商原文只进日志——用户不该
 * 被「API key not configured」这类原始错误刷屏，也不该面对一个无声失败的
 * agent。群聊消息流的三条出错面（DAG raw 卡 / 串行 raw 卡 / run-team-dag
 * 系统消息）统一经 humanizeModelError 收口。
 *
 * fail-soft 契约：认不出的错误回落通用文案 + 原始错误摘录，绝不抛。
 */

/** 供应商原文摘录上限（进聊天的诊断尾巴；全文由调用方按需落日志）。 */
const RAW_TAIL_MAX = 160;

/** 错误分类（对齐 OpenBot 的 refusal taxonomy；宽松匹配，认不出回落 unknown）。 */
export type ModelErrorKind =
  | 'key_missing'
  | 'rate_limited'
  | 'model_unknown'
  | 'request_too_large'
  | 'quota'
  | 'timeout'
  | 'provider_down'
  | 'unknown';

interface Rule {
  kind: ModelErrorKind;
  re: RegExp;
  /** 用户看到的人话（「出错」后缀前的主句）。 */
  human: string;
}

/** 顺序即优先级：密钥/限流等具体信号先于泛化的网络/5xx。 */
const RULES: Rule[] = [
  {
    kind: 'key_missing',
    re: /api[ _-]?key|no_api_key|unauthorized|401|authentication|credential/i,
    human: '模型服务密钥缺失或无效，请在设置中配置 API Key',
  },
  {
    kind: 'rate_limited',
    re: /rate.?limit|too many requests|429|限流/i,
    human: '模型服务限流，请稍后重试',
  },
  {
    kind: 'quota',
    re: /quota|billing|insufficient|欠费|额度|余额|balance/i,
    human: '模型服务额度不足或欠费，请检查账户余额',
  },
  {
    kind: 'model_unknown',
    re: /model.{0,40}(not found|does not exist|unknown|invalid)|unknown model|invalid model|no such model/i,
    human: '模型名不存在或无权使用，请检查模型配置',
  },
  {
    kind: 'request_too_large',
    re: /context.{0,30}(length|window|too long)|too many tokens|maximum context|request too large|413|payload too large/i,
    human: '请求过大（上下文超长），请减少附件或缩短历史后重试',
  },
  {
    kind: 'timeout',
    re: /timed? ?out|etimedout|deadline|超时/i,
    human: '模型服务响应超时，请稍后重试',
  },
  {
    kind: 'provider_down',
    re: /econnrefused|enotfound|fetch failed|network|socket hang up|502|503|504|overloaded|service unavailable|internal server error/i,
    human: '模型服务暂时不可用（网络或供应商故障），请稍后重试',
  },
];

/**
 * 供应商原始错误 → 用户可读的一句话（含诊断尾巴）。
 *
 * 结构：`<人话>（原始错误：<摘录>）`——人话在前保证可读，摘录在后保证
 * 可排障（与 OpenBot「原文进日志」等价：这里聊天即用户唯一可见面，故留
 * 摘录而全文留调用方日志）。空错误返回通用文案。
 */
export function humanizeModelError(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return '模型服务返回异常，请稍后重试';
  const hit = RULES.find((r) => r.re.test(text));
  const human = hit ? hit.human : '模型服务返回异常，请稍后重试';
  const tail = text.length > RAW_TAIL_MAX ? `${text.slice(0, RAW_TAIL_MAX)}…` : text;
  return `${human}（原始错误：${tail}）`;
}

/** 按类别人话（不含原始错误尾巴；给「只给人话」的收口面用）。 */
export function classifyModelError(raw: string | null | undefined): ModelErrorKind {
  const text = (raw ?? '').trim();
  return RULES.find((r) => r.re.test(text))?.kind ?? 'unknown';
}
