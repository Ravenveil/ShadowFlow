/**
 * arc.ts — AutoResearchClaw 产物约定的识别规则（纯函数，无 IO）。
 *
 * ARC 每次运行把成果落在会话工作目录：`deliverables/`（编译就绪的终稿）、
 * `verification_report.json`（引用核验）、`paper.tex` / `paper_draft.md`、
 * `references.bib`、`charts/`。产物 tab 据此把关键条目置顶并打标，
 * 让「检查成果」不用在一堆中间文件里翻。
 *
 * 识别按名字与目录约定；后端并不返回「这是不是终稿」——这是 ARC 的
 * 目录约定，不是接口字段。标签文案在 `content/app.ts` 的 PANEL。
 */
export type DeliverableTag = 'final' | 'verify' | 'paper' | 'bib' | 'charts';

/** 一条产物 + 它命中的 ARC 约定标签（null = 普通条目，不置顶）。 */
export interface ClassifiedEntry {
  name: string;
  isDir: boolean;
  tag: DeliverableTag | null;
}

/** 单条识别：目录按约定名，文件按 ARC 固定产物名。 */
export function deliverableTag(name: string, isDir: boolean): DeliverableTag | null {
  const lower = name.toLowerCase();
  if (isDir) {
    if (lower === 'deliverables') return 'final';
    if (lower === 'charts') return 'charts';
    return null;
  }
  if (lower === 'verification_report.json') return 'verify';
  if (lower === 'paper.tex' || lower === 'paper_draft.md') return 'paper';
  if (lower === 'references.bib') return 'bib';
  return null;
}

/**
 * 列表投影：打标的条目浮到最前（保持原有目录优先与字母序的相对关系），
 * 其余原样排在其后。输入按 toArtifactListing 的输出序（已是目录在前）。
 */
export function pinDeliverables<T extends { name: string; isDir: boolean }>(entries: T[]): Array<T & { tag: DeliverableTag | null }> {
  const withTags = entries.map((e) => ({ ...e, tag: deliverableTag(e.name, e.isDir) }));
  const pinned = withTags.filter((e) => e.tag !== null);
  const rest = withTags.filter((e) => e.tag === null);
  return [...pinned, ...rest];
}
