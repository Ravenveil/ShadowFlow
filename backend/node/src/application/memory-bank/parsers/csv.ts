/**
 * parsers/csv.ts — CSV → table_row 单元（Python _parse_csv :1236-1264 + _row_text :699-706）。
 *
 * 语义对齐：
 *   - 分隔符嗅探限定 , \t ; |（Python csv.Sniffer delimiters 同集），失败退默认 ','；
 *   - 首行表头；空行跳过；行号从 2 起；
 *   - 行文本格式：`来源：{file}｜工作表：CSV｜行：{n}\n表头: 值｜表头: 值`；
 *   - 超过 max_table_rows → TABLE_LIMIT 413。
 */

import { MemoryBankError } from '../errors';
import { MEMORY_CONFIG } from '../config';
import { decodeText } from '../text';
import type { Unit } from '../types';
import { newUnit } from './text';

interface CsvRow {
  cells: string[];
}

/** 极简 RFC4180 解析：支持引号包裹、"…" 转义、CRLF；分隔符单字符。 */
export function parseCsvContent(text: string, delimiter: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const push = (): void => {
    row.push(cell);
    cell = '';
  };
  const endRow = (): void => {
    if (row.length > 1 || row[0] !== '' || cell !== '') {
      push();
      rows.push({ cells: row });
    } else {
      push();
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      push();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else {
      cell += ch;
    }
  }
  // 文件尾未换行的最后一行
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** 分隔符嗅探：取前 8KB 中出现次数最多且合法的候选（Sniffer 简化版）。 */
function sniffDelimiter(text: string): string {
  const sample = text.slice(0, 8192);
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = sample.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : ',';
}

export function rowText(
  sourceName: string,
  sheet: string,
  rowNumber: number,
  headers: string[],
  values: string[],
): string {
  const pairs: string[] = [];
  values.forEach((value, index) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    const header =
      index < headers.length && String(headers[index]).trim()
        ? String(headers[index]).trim()
        : `列${index + 1}`;
    pairs.push(`${header}: ${value}`);
  });
  return `来源：${sourceName}｜工作表：${sheet}｜行：${rowNumber}\n` + pairs.join('｜');
}

export function parseCsvUnits(filename: string, data: Buffer): Unit[] {
  const text = decodeText(data);
  const delimiter = sniffDelimiter(text);
  const rows = parseCsvContent(text, delimiter);
  if (rows.length === 0) return [];
  const headers = rows[0].cells.map((v) => v.trim());
  const units: Unit[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (units.length >= MEMORY_CONFIG.max_table_rows) {
      throw new MemoryBankError('TABLE_LIMIT', 'CSV exceeds max_table_rows', 413);
    }
    const cells = rows[i].cells;
    if (!cells.some((v) => v.trim())) continue;
    const rowNumber = i + 1;
    const values: Record<string, string> = {};
    cells.forEach((value, index) => {
      const key = index < headers.length && headers[index] ? headers[index] : `列${index + 1}`;
      values[key] = value;
    });
    units.push(
      newUnit(
        'table_row',
        rowText(filename, 'CSV', rowNumber, headers, cells),
        'CSV::main',
        { sheet: 'CSV', row: rowNumber },
        { sheet: 'CSV', row: rowNumber, headers, values },
      ),
    );
  }
  return units;
}
