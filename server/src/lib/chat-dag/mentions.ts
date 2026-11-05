/**
 * mentions.ts — @ 提及定向派活解析（2026-11-05，OpenBot「直接点名 = 定向 work assignment」语义）。
 *
 * 群聊里用户直接 @ 某 agent 是最明确的派活意图：无需 LLM 意图拆解，消息只路由给被
 * 点名的成员（DAG 路径收缩为被提及节点诱导子图；串行路径只派发被提及者）。本模块
 * 全纯函数，方便单测：
 *   - parseMentions        — 从消息文本提取 @token，对照候选成员匹配，返回命中 id + 清洗文本；
 *   - restrictTeamToMentions — 计算 DAG 子图（members 按 team.members 原序过滤、edges 两端均在子集内）。
 *
 * 分词规则（与前端 NeoComposer detectTrigger 一致，保证「菜单选中啥、后端就解析啥」）：
 *   - token = '@' 后的非空白连续串；'@' 须在文首或空白后（a@b 邮件式文本不误命中）；
 *   - 命中优先级：精确 name → 精确 id → 忽略大小写精确 → 唯一前缀（长名敲一半）；
 *     歧义或全不命中 → 当普通文本忽略；
 *   - token 尾部标点（手打「@读读，」）剥离后再匹配（菜单插入恒带尾随空格，不受影响）。
 */
import type { TeamRunShape } from '../team-source';

export interface MentionCandidate {
  id: string;
  name: string;
}

export interface MentionParseResult {
  /** 命中的成员 id（按出现顺序去重）。 */
  mentionedIds: string[];
  /** 删除 @token 后的清洗文本（多余空白折叠、trim）。 */
  cleanText: string;
}

/**
 * 解析一条消息里的 @ 提及。无 '@'、无候选或全不命中时返回零命中
 * （mentionedIds 为空，cleanText 原文透传）——调用方按「未提及」走现状路径。
 */
export function parseMentions(
  text: string,
  candidates: MentionCandidate[],
): MentionParseResult {
  if (!text || !text.includes('@') || candidates.length === 0) {
    return { mentionedIds: [], cleanText: text };
  }

  // '@' 须在文首、空白或中文标点后（中文用户手打「@阿Dev，@小Q。」不带空格，
  // 中文标点同样构成触发边界）；token = 其后的连续「非空白非标点」串。
  const segRe = /(^|[\s，。！？、：；）】」』》〉【「『,.!?;:)\]])@([^\s，。！？、：；）】」』》〉【「『,.!?;:)\]}"'`@]+)/gu;
  /** token 后可吞掉的中西文标点（悬挂清理用）。 */
  const PUNCT_TAIL_RE = /[，。！？、：；）】」』》〉【「『,.!?;:)\]}"'`]/;
  const mentioned: string[] = [];
  /** 命中 token 的删除区间 [start, end)（含 '@' 与 token，不含前导空白）。 */
  const spans: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = segRe.exec(text)) !== null) {
    const lead = m[1];
    const token = m[2];
    const hit = matchCandidate(token, candidates);
    if (!hit) continue;
    if (!mentioned.includes(hit)) mentioned.push(hit);
    const at = m.index + lead.length;
    // 删除区间向后吞掉紧随的标点（手打「@阿Dev，」/@Dev: — 不留悬挂标点）。
    let end = at + 1 + token.length;
    while (end < text.length && PUNCT_TAIL_RE.test(text[end])) end++;
    spans.push([at, end]);
  }
  if (mentioned.length === 0) {
    return { mentionedIds: [], cleanText: text };
  }

  // 按区间倒序拼接清洗文本。
  let out = '';
  let pos = text.length;
  for (let i = spans.length - 1; i >= 0; i--) {
    const [s, e] = spans[i];
    out = text.slice(e, pos) + out;
    pos = s;
  }
  out = text.slice(0, pos) + out;
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { mentionedIds: mentioned, cleanText: out };
}

/** 单 token → 成员 id。四级匹配，歧义即弃（当普通文本）。 */
function matchCandidate(token: string, candidates: MentionCandidate[]): string | null {
  const exact =
    candidates.find((c) => c.name === token) ?? candidates.find((c) => c.id === token);
  if (exact) return exact.id;
  const lc = token.toLowerCase();
  const ci =
    candidates.find((c) => c.name.toLowerCase() === lc) ??
    candidates.find((c) => c.id.toLowerCase() === lc);
  if (ci) return ci.id;
  const pref = candidates.filter(
    (c) => c.name.toLowerCase().startsWith(lc) || c.id.toLowerCase().startsWith(lc),
  );
  return pref.length === 1 ? pref[0].id : null;
}

/**
 * 计算被提及节点的 DAG 诱导子图：
 *   - members 保留 team.members 原序（拓扑语义不变），只留 ids 子集；
 *   - edges 只留两端均在子集内的（conditional 返工边同样保留——@Dev @QA 定向
 *     组队时 QA 仍可评审 Dev）；跨子集边随节点裁剪自然消失；
 *   - policy_matrix 原样透传（gate 只按现存边查询，冗余行无副作用）。
 * ids 全不在 team.members 里 → members 为空，调用方据此回落现状路径。
 */
export function restrictTeamToMentions(team: TeamRunShape, ids: string[]): TeamRunShape {
  const idSet = new Set(ids);
  const members = team.members.filter((id) => idSet.has(id));
  const edges = team.edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  return {
    members,
    edges,
    policy_matrix: team.policy_matrix,
    ...(team.name ? { name: team.name } : {}),
  };
}
