/**
 * news 域 — RSS / Atom 抓取（外部，技术变化驱动）。
 *
 * 不引第三方依赖：正则解析常见的 RSS 2.0 `<item>` 与 Atom `<entry>`，
 * 单源失败只抛错误，由用例层汇总，不拖垮整体刷新。
 */

import { SUMMARY_MAX, type RawNews } from '../model';

const FETCH_TIMEOUT_MS = 9000;
const PER_FEED_CAP = 60;

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string, depth = 0): string {
  const decoded = text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const num = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : whole;
    }
    return ENTITY_MAP[code.toLowerCase()] ?? whole;
  });
  // 处理双重转义（&amp;lt;），限制递归深度
  return depth < 1 && /&[a-z#]/i.test(decoded) ? decodeEntities(decoded, depth + 1) : decoded;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContent(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1').trim();
}

/** RSS 的 `<link>url</link>` 或 Atom 的 `<link rel="alternate" href="url"/>`。 */
function linkOf(block: string): string {
  const plain = tagContent(block, 'link');
  if (plain && /^https?:\/\//i.test(plain)) return plain;
  const hrefs = [...block.matchAll(/<link\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  if (hrefs.length === 0) return '';
  const alternate = hrefs.find((m) => /rel\s*=\s*["']alternate["']/i.test(m[0]));
  return (alternate ?? hrefs[0])[1];
}

function publishedAtOf(block: string): number {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date']) {
    const value = tagContent(block, tag);
    const ts = value ? Date.parse(value) : Number.NaN;
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

function parseBlocks(xml: string): RawNews[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const out: RawNews[] = [];
  for (const block of blocks) {
    const title = stripTags(tagContent(block, 'title'));
    const link = linkOf(block).trim();
    if (!title || !link) continue;
    const rawSummary = tagContent(block, 'description') || tagContent(block, 'summary') || tagContent(block, 'content');
    const summary = stripTags(rawSummary).slice(0, SUMMARY_MAX);
    out.push({ title: title.slice(0, 200), link, summary, publishedAt: publishedAtOf(block) });
    if (out.length >= PER_FEED_CAP) break;
  }
  return out;
}

/** 抓取并解析单个订阅源；非 2xx 或解析为空时抛错。 */
export async function fetchFeed(url: string): Promise<RawNews[]> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'ShadowFlowNewsBot/1.0 (+https://shadowflow.local)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const xml = await res.text();
  const items = parseBlocks(xml);
  if (items.length === 0) throw new Error('EMPTY_FEED');
  return items;
}
