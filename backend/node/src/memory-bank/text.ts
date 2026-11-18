/**
 * text.ts — 文本规范化与 FTS 分词（Python :562-696 纯函数直译）。
 *
 * 关键实现说明（与 Python 行为逐条对齐）：
 *   - _fts_terms(:578-596)：英文/数字词小写 + CJK bigram（≤12 字 run 追加整串），
 *     保序去重（Python dict.fromkeys 语义 = Set 保序）。这是中文召回的命门：
 *     FTS5 unicode61 tokenizer 本身不切 CJK，bigram 在应用层完成后写入 index_text。
 *   - _fts_query(:599-601)：前 96 个 term，每个双引号包裹（内部 " → ""），
 *     OR 连接——防 FTS 语法错误的硬约束。
 *   - _clean_text(:571-575)：NFC → 去零宽 → 换行归一 → 行内空白折叠 → 空 3+ 行压 2。
 *   - _sliding_spans(:720-749)：字符预算窗口，优先 \n\n/\n/。！？；. ! ? ; 边界，
 *     永远前进（floor = start + size/2），overlap 只回退不重复。
 */

import { createHash } from 'crypto';
import { MemoryBankError } from './errors';

// 与 Python :169-171 完全同款的字符区间/字面量（勿改用 \p{Script=Han}，区间有差异）。
const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;
const WORD_RE = /[A-Za-z0-9_][A-Za-z0-9_.+\-/#]*/g;
export const IDENTIFIER_RE = /\b(?=[A-Za-z0-9_.\-/]{3,}\b)(?=\w*\d)[A-Za-z0-9_.\-/]+\b/g;

export function cleanText(text: string): string {
  // NFC 规范化 + 去 NUL（Python :572）
  let out = text.normalize('NFC').replace(/\x00/g, '');
  out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = out.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Python _fts_terms 的直译：word[:128] + CJK bigram + ≤12 字整串，保序去重。 */
export function ftsTerms(text: string): string[] {
  const terms: string[] = [];
  for (const match of text.toLowerCase().matchAll(WORD_RE)) {
    const word = match[0];
    // Python: if word.strip("._-/#") —— 只有符号的词丢弃
    if (word.replace(/[._\-/#]/g, '')) terms.push(word.slice(0, 128));
  }
  for (const match of text.matchAll(CJK_RUN_RE)) {
    let run = match[0].slice(0, 256);
    if (run.length === 1) {
      terms.push(run);
    } else {
      for (let i = 0; i < run.length - 1; i++) terms.push(run.slice(i, i + 2));
      if (run.length <= 12) terms.push(run);
    }
  }
  return [...new Set(terms)];
}

export function ftsText(text: string): string {
  return ftsTerms(text).join(' ');
}

export function ftsQuery(text: string): string {
  return ftsTerms(text)
    .slice(0, 96)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');
}

/** _lexical_tokens(:604-605) —— 近重复抑制用的 token 集合。 */
export function lexicalTokens(text: string): Set<string> {
  return new Set(ftsTerms(text));
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let inter = 0;
  for (const item of left) if (right.has(item)) inter += 1;
  return inter / (left.size + right.size - inter);
}

/**
 * 多编码探测解码（Python :562-568：utf-8-sig → utf-16 → gb18030 → replace）。
 * Node 语义修正：utf-16le 的 TextDecoder(fatal) 对任意奇偶字节几乎不抛错，
 * 若先试会把 UTF-8 中文误判成乱码；因此顺序为 utf-8 → utf-16le（BOM 探测）→
 * gb18030（Node 无内置 → 退化为 utf-8 replace，与 Python 的 errors='replace' 兜底一致）。
 * 带 UTF-16 BOM 的数据优先按 utf-16 解。
 */
export function decodeText(data: Buffer): string {
  // UTF-16 BOM 显式探测（Python 'utf-16' 自动认 BOM）
  if (data.length >= 2 && ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff))) {
    try {
      return new TextDecoder('utf-16le', { fatal: true }).decode(data);
    } catch {
      /* fallthrough */
    }
  }
  try {
    return new TextDecoder('utf-8-sig', { fatal: true }).decode(data);
  } catch {
    /* fallthrough */
  }
  // Python 的 gb18030 分支 Node 无内置解码器；非 UTF-8 数据按 replacement 兜底，
  // 与 Python 最后一行 data.decode('utf-8', errors='replace') 行为一致。
  return new TextDecoder('utf-8').decode(data); // fatal=false，非法字节 → U+FFFD
}

/**
 * Python _sliding_spans 直译。返回 [start, end) 字符区间；
 * 边界候选分隔符与优先级（取最大命中位置）一致。
 */
export function slidingSpans(text: string, size: number, overlap: number): Array<[number, number]> {
  if (!text) return [];
  if (text.length <= size) return [[0, text.length]];
  const spans: Array<[number, number]> = [];
  const separators = ['\n\n', '\n', '。', '！', '？', '；', '. ', '! ', '? ', '; '];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + size);
    let end = hardEnd;
    if (hardEnd < text.length) {
      // Python: rfind(sep, floor, hard_end) 只在 [floor, hard_end) 窗口内回扫，每窗口
      // 扫描量恒定（~size/2）。JS lastIndexOf 无区间参数且找不到时向前扫到串头
      // （无分隔符长文本会退化为 O(n²)），用 slice 复刻区间语义。
      const floor = start + Math.max(1, Math.floor(size / 2));
      const window = text.slice(floor, hardEnd);
      let boundary = -1;
      for (const sep of separators) {
        const rel = window.lastIndexOf(sep);
        if (rel >= 0) {
          const idx = floor + rel;
          if (idx > boundary) boundary = idx;
        }
      }
      if (boundary >= floor) {
        // Python :742 硬编码 +2（与分隔符实际长度无关），剩余不足 2 时 +1
        end = Math.min(boundary + (hardEnd - boundary >= 2 ? 2 : 1), hardEnd);
      }
    }
    end = Math.max(end, start + 1);
    spans.push([start, end]);
    if (end >= text.length) break;
    let nextStart = Math.max(0, end - overlap);
    if (nextStart <= start) nextStart = start + Math.max(1, size - overlap);
    start = nextStart;
  }
  return spans;
}

/** _modality_boost(:709-717)：查询含表格/图片线索词时对特定 kind 加权。 */
export function modalityBoost(query: string, kind: string): number {
  const q = query.toLowerCase();
  const tableCues = ['表', '表格', 'excel', 'sheet', '行', '列', 'csv', 'table'];
  const imageCues = ['图', '图片', '图像', '照片', '截图', '流程图', 'chart', 'figure', 'image'];
  if (tableCues.some((cue) => q.includes(cue)) && kind === 'table_row') return 1.12;
  if (imageCues.some((cue) => q.includes(cue)) && kind === 'image') return 1.15;
  return 1.0;
}

/** _flatten_json(:752-768)：≤500 键上限；小数组整体保留、大数组按下标展开。 */
export function flattenJson(
  value: unknown,
  prefix = '',
  output: Record<string, unknown> = {},
  depth = 0,
): Record<string, unknown> {
  if (Object.keys(output).length >= 500 || depth > 64) return output;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      flattenJson(item, prefix ? `${prefix}.${key}` : key, output, depth + 1);
    }
  } else if (Array.isArray(value)) {
    const scalar = value.length <= 30 && value.every((v) => v === null || typeof v !== 'object');
    if (scalar) {
      if (prefix) output[prefix] = value;
    } else {
      value.forEach((item, index) => flattenJson(item, `${prefix}[${index}]`, output, depth + 1));
    }
  } else {
    output[prefix || 'value'] = value;
  }
  return output;
}

/** sha256 hex（content-addressed blob 与 checksum 共用）。 */
export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Python _now(:521-523)：UTC ISO8601 带 Z 后缀。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 防御性 finite 浮点（评分链路不允许 NaN/Infinity 泄出）。 */
export function finiteOrThrow(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new MemoryBankError('INTERNAL_SCORE_ERROR', `Non-finite score for ${what}`, 500);
  }
  return value;
}
