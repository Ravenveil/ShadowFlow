/**
 * avatar.tsx — Agent 头像统一真源（2026-11-08 头像一致性收尾）。
 *
 * 背景问题：同一 agent 在不同视图拿到不同头像——种子不统一（名字缩写 / 名字 /
 * "CEO" 各传各的，DiceBear 每个种子一张脸），且旧实现走 api.dicebear.com 远程
 * CDN，加载失败/超时就回落字母块甚至空圈（时脸、时字、时无）。
 *
 * 本模块的确定性规则（全端共用 AgentAvatar）：
 *   1. 本地生成：@dicebear/core + micah 同步出 SVG，离线可用、零网络请求，
 *      没有「加载中/加载失败」空窗，任何分支都必有可见头像；
 *   2. 规范身份表：编制内 agent 的名字 / 缩写 / 别名统一解析到同一种子 + 同一
 *      accent 色（与 ProductApp agents 表同值），跨视图同人同脸同色；
 *   3. 兜底：编制外 agent 按 label 稳定 hash 取种子与色（同 label 同脸）；
 *      仅当 SVG 生成抛异常才落字母块——不允许出现空头像。
 */
import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as micah from "@dicebear/micah";

/** 规范身份条目：aliases 内任意写法 → 同一 seed（脸）+ color（accent）。 */
interface AgentIdentity {
  seed: string;
  color: string;
}

/** 编制内身份表（键归一化：trim + 小写）。色值与 ProductApp agents 表一致。 */
const IDENTITY_TABLE: { aliases: string[]; identity: AgentIdentity }[] = [
  {
    aliases: ["市场分析师", "ma", "市场"],
    identity: { seed: "市场分析师", color: "#2777e8" },
  },
  {
    aliases: ["品牌策划师", "bp", "品牌"],
    identity: { seed: "品牌策划师", color: "#7c5cff" },
  },
  {
    aliases: ["内容策划师", "cc", "内容"],
    identity: { seed: "内容策划师", color: "#e2603a" },
  },
  {
    aliases: ["运营专员", "ops", "运营"],
    identity: { seed: "运营专员", color: "#0ea5a4" },
  },
  {
    aliases: ["商务专员", "bd", "商务"],
    identity: { seed: "商务专员", color: "#57a04a" },
  },
  {
    aliases: ["合规审核员", "cr", "合规"],
    identity: { seed: "合规审核员", color: "#d6455e" },
  },
  {
    aliases: ["董事长", "ceo", "agent-shadow-secretary", "ai 总经理", "ai总经理", "总经理"],
    identity: { seed: "CEO", color: "#ff5e3a" },
  },
];

const ALIAS_INDEX: Map<string, AgentIdentity> = new Map(
  IDENTITY_TABLE.flatMap((entry) =>
    entry.aliases.map((alias) => [alias.trim().toLowerCase(), entry.identity] as const),
  ),
);

/** 按别名长度降序的扫描表（模糊解析优先长别名，防「市场」抢「市场分析师」）。 */
const ALIAS_SCAN: { alias: string; identity: AgentIdentity }[] = IDENTITY_TABLE.flatMap(
  (entry) => entry.aliases.map((alias) => ({ alias: alias.trim().toLowerCase(), identity: entry.identity })),
).sort((a, b) => b.alias.length - a.alias.length);

/** 兜底色板（与 ProductApp SF_PALETTE 同值）；编制外 label 稳定 hash 取色。 */
const FALLBACK_PALETTE = ["#ff5e3a", "#2777e8", "#d97b38", "#c64f7d", "#7c5cff", "#0ea5a4"];

function hashIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % mod;
}

/**
 * label → 规范身份。解析顺序：
 *   1. 精确别名（trim + 小写）；
 *   2. 双向包含模糊命中（≥2 字符）：名字缩写（「市场」）、截断（「董事」）、
 *      带前后缀的全名（「手工艺品代卖·市场分析师」）都归到同一身份；
 *   3. 兜底：label 直作种子 + 色板 hash（同 label 同脸同色）。
 */
export function agentIdentity(label: string | null | undefined): AgentIdentity {
  const raw = (label ?? "").trim();
  const key = raw.toLowerCase();
  const exact = ALIAS_INDEX.get(key);
  if (exact) return exact;
  if (key.length >= 2) {
    for (const { alias, identity } of ALIAS_SCAN) {
      if (alias.length >= 2 && (key.includes(alias) || alias.includes(key))) return identity;
    }
  }
  return {
    seed: raw || "Agent",
    color: FALLBACK_PALETTE[hashIndex(raw || "Agent", FALLBACK_PALETTE.length)],
  };
}

export interface AgentAvatarProps {
  /** 身份标签（agent 名 / 缩写 / 别名均可——身份表统一解析）。 */
  label: string;
  /** @deprecated 仅兼容旧调用签名；颜色一律由身份表决定，此值被忽略。 */
  color?: string;
  small?: boolean;
  size?: "lg" | "xl";
}

/**
 * Agent 头像（本地生成，同人同脸同色，任何分支必有可见头像）。
 * 渲染结构沿用 product-app.css 的 .sf-agent-avatar（含在线状态点 <i/>）。
 */
export function AgentAvatar({ label, small = false, size }: AgentAvatarProps) {
  const identity = useMemo(() => agentIdentity(label), [label]);
  const face = useMemo(() => {
    try {
      return createAvatar(micah, {
        seed: identity.seed,
        backgroundColor: [identity.color.replace("#", "")],
        radius: 0,
      }).toString();
    } catch {
      return null; // 生成异常 → 字母块兜底
    }
  }, [identity.seed, identity.color]);

  const cls = `sf-agent-avatar ${small ? "small" : ""} ${size ?? ""}`;
  const style = { "--avatar-color": identity.color } as React.CSSProperties;

  if (!face) {
    return (
      <span className={cls} style={style}>
        {(label ?? "").trim().slice(0, 1) || "?"}
        <i />
      </span>
    );
  }
  return (
    <span className={`${cls} has-face`} style={style}>
      <span className="sf-agent-avatar-face" dangerouslySetInnerHTML={{ __html: face }} />
      <i />
    </span>
  );
}

export default AgentAvatar;
