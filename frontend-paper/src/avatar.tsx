/**
 * avatar.tsx — Agent 头像真源（与 shadowflow-merge/frontend/src/avatar.tsx 同机制）
 *
 * 一致性要求：同一 agent 在任何视图必须是同一张脸 + 同一个 accent 色。
 *   - 本地生成（@dicebear/core + micah），离线可用、零网络请求；
 *   - 规范身份表把「名字 / 英文 id / 别名 / 截断写法」解析到同一种子；
 *   - 编制外角色按 label 稳定 hash 取种子与色（同 label 同脸）。
 *
 * 主控沿用 shadowflow-merge 的 seed="CEO" / #ff5e3a，保证跨产品同脸。
 */
import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as micah from '@dicebear/micah';

interface AgentIdentity {
  seed: string;
  color: string;
}

/** 规范身份表（键归一化：trim + 小写）。 */
const IDENTITY_TABLE: { aliases: string[]; identity: AgentIdentity }[] = [
  {
    aliases: ['主控', '论文主控', '董事长', 'ceo', 'agent-shadow-secretary', '总经理'],
    identity: { seed: 'CEO', color: '#ff5e3a' },
  },
  {
    aliases: ['pi', '课题负责人', '负责人'],
    identity: { seed: 'PI', color: '#f4511e' },
  },
  {
    aliases: ['sectionwriter', '章节主笔', '主笔', '写作'],
    identity: { seed: 'SectionWriter', color: '#2777e8' },
  },
  {
    aliases: ['citationreviewer', '引用审查', '引用核查', '文献审查'],
    identity: { seed: 'CitationReviewer', color: '#0ea5a4' },
  },
  {
    aliases: ['methodreviewer', '方法复核', '方法审查'],
    identity: { seed: 'MethodReviewer', color: '#7c5cff' },
  },
  {
    aliases: ['editorialpolisher', '润色编辑', '润色', '编辑'],
    identity: { seed: 'EditorialPolisher', color: '#e2603a' },
  },
  {
    aliases: ['submissionmanager', '投稿管理', '投稿'],
    identity: { seed: 'SubmissionManager', color: '#57a04a' },
  },
  {
    aliases: ['市场分析师', 'ma'],
    identity: { seed: '市场分析师', color: '#2777e8' },
  },
  {
    aliases: ['品牌策划师', 'bp'],
    identity: { seed: '品牌策划师', color: '#7c5cff' },
  },
  {
    aliases: ['内容策划师', 'cc'],
    identity: { seed: '内容策划师', color: '#e2603a' },
  },
  {
    aliases: ['运营专员', 'ops'],
    identity: { seed: '运营专员', color: '#0ea5a4' },
  },
  {
    aliases: ['商务专员', 'bd'],
    identity: { seed: '商务专员', color: '#57a04a' },
  },
  {
    aliases: ['合规审核员', 'cr'],
    identity: { seed: '合规审核员', color: '#d6455e' },
  },
];

const ALIAS_INDEX: Map<string, AgentIdentity> = new Map(
  IDENTITY_TABLE.flatMap((entry) =>
    entry.aliases.map((alias) => [alias.trim().toLowerCase(), entry.identity] as const),
  ),
);

/** 按别名长度降序扫描，防「主笔」抢「章节主笔」。 */
const ALIAS_SCAN: { alias: string; identity: AgentIdentity }[] = IDENTITY_TABLE.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias: alias.trim().toLowerCase(), identity: entry.identity })),
).sort((a, b) => b.alias.length - a.alias.length);

const FALLBACK_PALETTE = ['#ff5e3a', '#2777e8', '#d97b38', '#c64f7d', '#7c5cff', '#0ea5a4'];

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
  return {
    seed: raw || 'Agent',
    color: FALLBACK_PALETTE[hashIndex(raw || 'Agent', FALLBACK_PALETTE.length)],
  };
}

export interface AgentAvatarProps {
  label: string;
  small?: boolean;
  size?: number;
  /** 是否显示右下角在线状态点（默认 true）。 */
  status?: boolean;
  className?: string;
}

export function AgentAvatar({ label, small = false, size, status = true, className }: AgentAvatarProps) {
  const identity = useMemo(() => agentIdentity(label), [label]);

  const face = useMemo(() => {
    try {
      return createAvatar(micah, {
        seed: identity.seed,
        backgroundColor: [identity.color.replace('#', '')],
        radius: 0,
      }).toString();
    } catch {
      return null;
    }
  }, [identity.seed, identity.color]);

  const px = size ?? (small ? 20 : 28);
  const style: React.CSSProperties = {
    width: px,
    height: px,
    background: identity.color,
  };

  return (
    <span
      className={`sf-avatar${className ? ` ${className}` : ''}`}
      style={style}
      data-agent={identity.seed}
      title={label}
    >
      {face ? (
        <span className="sf-avatar-face" dangerouslySetInnerHTML={{ __html: face }} />
      ) : (
        <span className="sf-avatar-fallback">{(label ?? '').trim().slice(0, 1) || '?'}</span>
      )}
      {status ? <i className="sf-avatar-dot" /> : null}
    </span>
  );
}

/** 头像堆叠（团队成员概要）。 */
export function AvatarStack({
  labels,
  max = 4,
  size = 20,
  showRest = true,
}: {
  labels: string[];
  max?: number;
  size?: number;
  /** 是否显示「+N」尾巴；窄卡片里关掉更干净。 */
  showRest?: boolean;
}) {
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  return (
    <span className="sf-avatar-stack">
      {shown.map((l) => (
        <AgentAvatar key={l} label={l} size={size} status={false} />
      ))}
      {showRest && rest > 0 ? (
        <span className="sf-avatar-more" style={{ width: size, height: size }}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export default AgentAvatar;
