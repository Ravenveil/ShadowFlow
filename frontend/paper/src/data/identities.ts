/**
 * identities.ts — Agent 身份表（脸 + 品牌色）。
 *
 * 为什么单独成表：同一 agent 在任何视图必须是同一张脸、同一个色。
 * 这张表是唯一真源，`avatar.tsx` 只负责把 seed 画成 SVG，不再持有任何名单。
 *
 * `color` 是 dicebear 生成头像时要写进 SVG 的真实 hex（SVG 里不能用 var()），
 * 所以它必须留在 TS 里；`tone` 是给 CSS 用的语义名，两边靠这张表对齐。
 * 新增角色 = 在这张表加一行，不动任何组件。
 */
import type { ToneName } from '../theme/tones';

export interface AgentIdentity {
  /** dicebear 的种子（同 seed 同脸）。 */
  seed: string;
  /** 头像底色 hex（同时用于角标、头像堆叠描边）。 */
  color: string;
  /** 语义色调名，供 CSS 侧（`--tone-*`）复用同一套语义。 */
  tone: ToneName;
}

interface IdentityEntry {
  /** 别名（归一化：trim + 小写）；别名越多的写法越靠前无所谓，解析时按长度降序扫。 */
  aliases: string[];
  identity: AgentIdentity;
}

/** 论文团队 + 市场团队（与 shadowflow-merge 共用一套脸）。 */
const IDENTITY_TABLE: IdentityEntry[] = [
  {
    aliases: ['主控', '论文主控', '董事长', 'ceo', 'agent-shadow-secretary', '总经理'],
    identity: { seed: 'CEO', color: '#ff5e3a', tone: 'accent' },
  },
  {
    aliases: ['pi', '课题负责人', '负责人'],
    identity: { seed: 'PI', color: '#f4511e', tone: 'amber' },
  },
  {
    aliases: ['sectionwriter', '章节主笔', '主笔', '写作'],
    identity: { seed: 'SectionWriter', color: '#2777e8', tone: 'blue' },
  },
  {
    aliases: ['citationreviewer', '引用审查', '引用核查', '文献审查'],
    identity: { seed: 'CitationReviewer', color: '#0ea5a4', tone: 'teal' },
  },
  {
    aliases: ['methodreviewer', '方法复核', '方法审查'],
    identity: { seed: 'MethodReviewer', color: '#7c5cff', tone: 'violet' },
  },
  {
    aliases: ['editorialpolisher', '润色编辑', '润色', '编辑'],
    identity: { seed: 'EditorialPolisher', color: '#e2603a', tone: 'pink' },
  },
  {
    aliases: ['submissionmanager', '投稿管理', '投稿'],
    identity: { seed: 'SubmissionManager', color: '#57a04a', tone: 'green' },
  },
  {
    aliases: ['市场分析师', 'ma'],
    identity: { seed: '市场分析师', color: '#2777e8', tone: 'blue' },
  },
  {
    aliases: ['品牌策划师', 'bp'],
    identity: { seed: '品牌策划师', color: '#7c5cff', tone: 'violet' },
  },
  {
    aliases: ['内容策划师', 'cc'],
    identity: { seed: '内容策划师', color: '#e2603a', tone: 'pink' },
  },
  {
    aliases: ['运营专员', 'ops'],
    identity: { seed: '运营专员', color: '#0ea5a4', tone: 'teal' },
  },
  {
    aliases: ['商务专员', 'bd'],
    identity: { seed: '商务专员', color: '#57a04a', tone: 'green' },
  },
  {
    aliases: ['合规审核员', 'cr'],
    identity: { seed: '合规审核员', color: '#d6455e', tone: 'red' },
  },
];

/** 编制外角色：按 label 稳定 hash 取一套脸与色，同 label 同结果。 */
const FALLBACK_PALETTE: AgentIdentity[] = [
  { seed: 'FALLBACK_1', color: '#ff5e3a', tone: 'accent' },
  { seed: 'FALLBACK_2', color: '#2777e8', tone: 'blue' },
  { seed: 'FALLBACK_3', color: '#d97b38', tone: 'amber' },
  { seed: 'FALLBACK_4', color: '#c64f7d', tone: 'pink' },
  { seed: 'FALLBACK_5', color: '#7c5cff', tone: 'violet' },
  { seed: 'FALLBACK_6', color: '#0ea5a4', tone: 'teal' },
];

const ALIAS_INDEX = new Map<string, AgentIdentity>(
  IDENTITY_TABLE.flatMap((entry) =>
    entry.aliases.map((alias) => [alias.trim().toLowerCase(), entry.identity] as const),
  ),
);

/** 按别名长度降序扫描，防「主笔」抢「章节主笔」。 */
const ALIAS_SCAN = IDENTITY_TABLE.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias: alias.trim().toLowerCase(), identity: entry.identity })),
).sort((a, b) => b.alias.length - a.alias.length);

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function agentIdentity(label: string | null | undefined): AgentIdentity {
  const raw = (label ?? '').trim();
  const key = raw.toLowerCase();
  const exact = ALIAS_INDEX.get(key);
  if (exact) return exact;
  if (key.length >= 2) {
    for (const { alias, identity } of ALIAS_SCAN) {
      if (alias.length >= 2 && (key.includes(alias) || alias.includes(key))) return identity;
    }
  }
  const fallback = FALLBACK_PALETTE[hashIndex(raw || 'Agent', FALLBACK_PALETTE.length)];
  return { ...fallback, seed: raw || fallback.seed };
}
