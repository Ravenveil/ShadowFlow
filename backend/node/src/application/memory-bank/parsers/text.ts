/**
 * parsers/text.ts — 纯文本/Markdown 解析（Python _paragraphs :660-661 + _text_units :664-696）。
 *
 * 语义：Markdown 标题（#{1,6}）维护标题栈，标题路径注入检索文本前缀
 * （"章节：a > b\n正文"），空行分块；group = "<组前缀>::<标题路径>"。
 */

import { randomUUID } from 'crypto';
import { cleanText } from '../text';
import type { Unit } from '../types';

export function newUnit(
  kind: string,
  text: string,
  group_key: string,
  context: Record<string, unknown>,
  data: Record<string, unknown> = {},
  raw: { sha?: string; mime?: string; data?: Buffer } = {},
): Unit {
  return {
    kind,
    text,
    group_key,
    context,
    data,
    raw_sha256: raw.sha ?? '',
    raw_mime: raw.mime ?? '',
    raw_data: raw.data ?? Buffer.alloc(0),
    unit_id: randomUUID().replace(/-/g, ''),
    parent_id: '',
  };
}

/** Python _paragraphs(:660-661)：空行分段 + 各段 clean。 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => cleanText(part))
    .filter((part) => part.length > 0);
}

/**
 * Markdown/标题感知分段（Python _text_units 直译 :664-696）。
 * heading 栈弹出规则：新标题 level ≤ 栈顶 level 时弹栈到更低级。
 */
export function parseTextUnits(
  text: string,
  opts: { context?: Record<string, unknown>; group?: string } = {},
): Unit[] {
  const group = opts.group ?? '正文';
  const context = opts.context ?? {};
  const units: Unit[] = [];
  const headings: Array<{ level: number; title: string }> = [];
  let buffer: string[] = [];

  const flush = (): void => {
    const content = cleanText(buffer.join('\n'));
    buffer = [];
    if (!content) return;
    const path = headings.map((h) => h.title);
    const prefix = path.join(' > ');
    const enriched = prefix ? `章节：${prefix}\n${content}` : content;
    const data = { ...context };
    data.heading_path = path;
    units.push(newUnit('text', enriched, `${group}::${prefix}`, { ...context, ...(path.length ? { heading_path: path } : {}) }, { heading_path: path }));
  };

  for (const line of text.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      const level = (line.match(/^#+/) ?? ['#'])[0].length;
      while (headings.length > 0 && headings[headings.length - 1].level >= level) headings.pop();
      headings.push({ level, title: match[1].trim() });
    } else if (!line.trim()) {
      flush();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return units;
}
