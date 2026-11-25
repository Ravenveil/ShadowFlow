/**
 * parsers/json.ts — JSON/JSONL → record 单元（Python _parse_json :1302-1323）。
 *
 * 语义对齐：
 *   - jsonl：逐行 parse（空行跳过）；json：整体 parse，list 即 records，否则单条；
 *   - 解析失败 → INVALID_JSON 400；
 *   - 每条 record 走 flattenJson（≤500 键）拼 "｜" 行文本；
 *   - 行文本格式：`来源：{file}｜记录：{n}｜k: v｜k: v`。
 */

import { MemoryBankError } from '../errors';
import { decodeText, flattenJson } from '../text';
import type { Unit } from '../types';
import { newUnit } from './text';

export function parseJsonUnits(filename: string, data: Buffer, jsonl = false): Unit[] {
  const text = decodeText(data);
  let records: unknown[];
  try {
    if (jsonl) {
      records = text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as unknown);
    } else {
      const parsed = JSON.parse(text) as unknown;
      records = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch (err) {
    throw new MemoryBankError('INVALID_JSON', `Invalid JSON/JSONL: ${(err as Error).message}`);
  }
  const units: Unit[] = [];
  records.forEach((record, index) => {
    const flattened = flattenJson(record);
    const body = Object.entries(flattened)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('｜');
    units.push(
      newUnit(
        'record',
        `来源：${filename}｜记录：${index + 1}\n${body}`,
        'JSON::records',
        { record_index: index + 1 },
        { record_index: index + 1, record, flattened },
      ),
    );
  });
  return units;
}
