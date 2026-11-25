/**
 * deliverables.ts — 「谁交了什么」的推导（纯函数，无 IO）。
 *
 * 后端没有「产物归属」这个字段：一条 agent 消息只知道作者，一个目录只认识文件。
 * 所以归属只能从**已有的真实线索**推，而不是猜：
 *
 *   1. 交付条目 ← 该成员在会话流里交出的东西（消息里登记的产物名 / 说话摘要）
 *      + 执行摘要里挂在 TA 名下的步骤
 *   2. 关联文件 ← 文件名确实出现在该成员那句话里的磁盘条目
 *
 * 推不出来的（磁盘上有、谁都没提的）不硬塞给任何人 —— 它们仍留在「全部」的
 * 目录浏览里，谁都能看见。宁可少归一件，也不要给人贴错标签。
 */
import type { ArtifactEntry, Message, PanelStep } from '@/shared/data/types';

/** 一条交付：名字或摘要 + 说话时间 + 因此挂上的磁盘文件。 */
export interface DeliverableItem {
  label: string;
  time?: string;
  files: ArtifactEntry[];
}

/** 一位成员的交付汇总（右栏按成员看产物就渲染它）。 */
export interface MemberDeliverables {
  /** 成员显示名，与消息 author / 步骤 agent 同一套写法。 */
  agent: string;
  items: DeliverableItem[];
  /** items 里所有文件的并集（同一路径只留一份）。 */
  files: ArtifactEntry[];
  /** 最近一次交付的时间（`HH:MM`，可直接比较字符串）。 */
  latest?: string;
}

/** 摘要截断长度：够认出交了什么，不至于把右栏撑成一段文章。 */
const EXCERPT_MAX = 44;

/** 扁平化 + 截断：消息正文里有换行和多余空白，列表行只该有一行。 */
function excerpt(text: string | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX)}…` : flat;
}

/**
 * 从一段文字里认出磁盘上的文件：只认**文件名完整出现**（忽略大小写）。
 * 不做模糊匹配 —— `paper.tex` 与 `paper_v2.tex` 是两件东西。
 */
function pickFiles(text: string | undefined, entries: ArtifactEntry[]): ArtifactEntry[] {
  const hay = (text ?? '').toLowerCase();
  if (!hay) return [];
  return entries.filter((e) => !e.isDir && e.name && hay.includes(e.name.toLowerCase()));
}

/**
 * 归组：会话流 + 执行步骤 + 磁盘条目 → 每人一份交付清单。
 * 返回按交付条数降序，交付多的人排前面（右栏一眼看出主力是谁）。
 */
export function groupDeliverables(
  thread: Message[],
  steps: PanelStep[],
  entries: ArtifactEntry[],
): MemberDeliverables[] {
  const byAgent = new Map<string, MemberDeliverables>();

  const push = (agent: string, item: DeliverableItem) => {
    const name = agent.trim();
    if (!name || !item.label) return;
    let rec = byAgent.get(name);
    if (!rec) {
      rec = { agent: name, items: [], files: [] };
      byAgent.set(name, rec);
    }
    // 同一个人同一个名字只算一条（消息与步骤可能互相复述）
    if (rec.items.some((it) => it.label === item.label)) return;
    rec.items.push(item);
    for (const f of item.files) {
      if (!rec.files.some((x) => x.path === f.path)) rec.files.push(f);
    }
    if (item.time && (!rec.latest || item.time > rec.latest)) rec.latest = item.time;
  };

  for (const m of thread) {
    if (m.role !== 'agent' || !m.author) continue;
    const arts = m.artifacts ?? [];
    if (arts.length) {
      // 消息自己登记了产物名 —— 这是最硬的归属证据，一条一件
      for (const a of arts) {
        push(m.author, { label: a.name, time: m.time, files: pickFiles(a.name, entries) });
      }
      continue;
    }
    const label = excerpt(m.text);
    if (label) push(m.author, { label, time: m.time, files: pickFiles(m.text, entries) });
  }

  for (const s of steps) {
    push(s.agent, { label: s.label, files: pickFiles(s.label, entries) });
  }

  // 最新交付排最前；没有时间的（执行步骤）排在后面，保持原有先后。
  for (const rec of byAgent.values()) {
    rec.items.sort((a, b) => {
      if (a.time && b.time) return b.time.localeCompare(a.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });
  }

  return [...byAgent.values()].sort((a, b) => b.items.length - a.items.length);
}

/** 名对名：全名、短名、`A · B` 的任意一段都算同一个人（后端两处写法不一）。 */
export function sameMember(agentName: string, member: { name: string; short?: string }): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const strip = (s: string) => s.split('·').map(norm).filter(Boolean);
  const agent = norm(agentName);
  const targets = [member.name, member.short ?? ''].map(norm).filter(Boolean);
  if (!targets.length) return false;
  if (targets.includes(agent)) return true;
  const agentParts = strip(agentName);
  if (targets.some((t) => agentParts.includes(t))) return true;
  const memberParts = strip(member.name);
  return memberParts.some((p) => p === agent);
}

/** 找某位成员那一份交付；没有就返回 null（界面据此给空态，不编造）。 */
export function deliverablesOf(
  groups: MemberDeliverables[],
  member: { name: string; short?: string },
): MemberDeliverables | null {
  return groups.find((g) => sameMember(g.agent, member)) ?? null;
}

/** 已经被某位成员认领的文件路径 —— 剩下的算共享，别重复展示。 */
export function claimedPaths(groups: MemberDeliverables[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) for (const f of g.files) out.add(f.path);
  return out;
}
