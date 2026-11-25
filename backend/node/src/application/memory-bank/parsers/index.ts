/**
 * parsers/index.ts — 按扩展名分派解析（Python _parse_units :1464-1491 的 v1 裁剪版）。
 *
 * v1 支持链路（team-lead 裁剪）：txt/md/markdown/log、json/jsonl、html/htm、csv。
 * xlsx/xlsm/docx/pdf/图片：登记过扩展名（KNOWN_BUT_UNSUPPORTED）→ 明确
 * UNSUPPORTED_FORMAT 415（与 Python 对未知格式行为一致：清晰报错，不静默、
 * 不用文件名冒充内容）；其它未知扩展名同样 415。
 * _check_ooxml 的 zip-bomb 校验留待二期（ooxml.ts）。
 */

import { MemoryBankError } from '../errors';
import { P0_EXTENSIONS, TEXT_EXTENSIONS, KNOWN_BUT_UNSUPPORTED } from '../config';
import { safeSuffix } from '../paths';
import { decodeText } from '../text';
import type { Unit } from '../types';
import { parseTextUnits } from './text';
import { parseHtmlUnits } from './html';
import { parseCsvUnits } from './csv';
import { parseJsonUnits } from './json';

export function parseUnits(filename: string, data: Buffer, mime_type: string): Unit[] {
  const suffix = safeSuffix(filename);
  if (!P0_EXTENSIONS.has(suffix)) {
    const known = KNOWN_BUT_UNSUPPORTED.has(suffix) ? ` (known but not supported in v1: ${suffix})` : '';
    throw new MemoryBankError(
      'UNSUPPORTED_FORMAT',
      `Unsupported extension ${suffix}; supported: ${[...P0_EXTENSIONS].sort().join(', ')}${known}`,
      415,
    );
  }
  if (TEXT_EXTENSIONS.has(suffix)) {
    return parseTextUnits(decodeText(data), { group: `TEXT::${filename}` });
  }
  if (suffix === '.html' || suffix === '.htm') {
    return parseHtmlUnits(decodeText(data), `HTML::${filename}`);
  }
  if (suffix === '.csv') return parseCsvUnits(filename, data);
  if (suffix === '.json' || suffix === '.jsonl') {
    return parseJsonUnits(filename, data, suffix === '.jsonl');
  }
  throw new MemoryBankError('UNSUPPORTED_FORMAT', `Unsupported extension: ${suffix}`, 415);
}

export { parseTextUnits, parseHtmlUnits, parseCsvUnits, parseJsonUnits };
