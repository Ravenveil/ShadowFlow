/**
 * parsers/html.ts — HTML 转纯文本单元（Python _HTMLText :771-794 + :1474-1478）。
 *
 * 语义对齐：
 *   - script/style/noscript/template 内容整段跳过；
 *   - 块级标签（p/div/section/article/h1-h3/tr/li/br）产生换行；
 *   - 字符实体解码（htmlparser2 默认 decodeEntities: true）；
 *   - 输出经 cleanText 归一后按 _text_units 分块（group = HTML::<filename>）。
 */

import { Parser } from 'htmlparser2';
import { cleanText } from '../text';
import type { Unit } from '../types';
import { parseTextUnits } from './text';

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'tr', 'li', 'br']);

export function htmlToText(html: string): string {
  const parts: string[] = [];
  let skipDepth = 0;
  const parser = new Parser({
    onopentag(tag) {
      if (SKIP_TAGS.has(tag)) {
        skipDepth += 1;
      } else if (BLOCK_TAGS.has(tag)) {
        parts.push('\n');
      }
    },
    onclosetag(tag) {
      if (SKIP_TAGS.has(tag)) {
        if (skipDepth > 0) skipDepth -= 1;
      } else if (BLOCK_TAGS.has(tag) && tag !== 'br') {
        parts.push('\n');
      }
    },
    ontext(data) {
      if (!skipDepth) parts.push(data);
    },
  });
  parser.write(html);
  parser.end();
  return cleanText(parts.join(''));
}

export function parseHtmlUnits(html: string, group = 'HTML'): Unit[] {
  return parseTextUnits(htmlToText(html), { group });
}
