/**
 * structure.ts — 父块/子块结构化（Python _build_parents :1495-1543 + _build_children :1545-1568）。
 *
 * 语义对齐（这是检索质量的根基，逐条照抄）：
 *   - 父块：同 group+kind 连续单元拼接，预算 parent_size=1800；
 *     table_row 超 24 行切父；image 单元独立成父（append 即 flush）；
 *     超长 text 单元按 parent_size 滑窗（overlap=0）拆成多个单单元父块；
 *     父块 context = 首单元 context + {locations: [各单元 data]}。
 *   - 子块：table_row 父 → 每单元一子块（start 用 find 定位真实偏移）；
 *     其余 → _sliding_spans(child_size=420, overlap=64) 切片，strip 后保留；
 *     空文本子块丢弃。
 */

import { randomUUID } from 'crypto';
import { MEMORY_CONFIG } from './config';
import { slidingSpans } from './text';
import { newUnit } from './parsers/text';
import type { Parent, Unit } from './types';

function newId(): string {
  return randomUUID().replace(/-/g, '');
}

export function buildParents(sourceId: string, units: Unit[]): Parent[] {
  const parents: Parent[] = [];
  let current: Unit[] = [];
  let currentLength = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const kinds = new Set(current.map((u) => u.kind));
    const kind = kinds.size === 1 ? current[0].kind : 'mixed';
    const context: Record<string, unknown> = { ...current[0].context };
    context.locations = current.map((u) => u.data);
    const parent: Parent = {
      source_id: sourceId,
      ordinal: parents.length,
      text: current.map((u) => u.text).join('\n\n'),
      kind,
      context,
      units: current,
      parent_id: newId(),
    };
    for (const unit of current) unit.parent_id = parent.parent_id;
    parents.push(parent);
    current = [];
    currentLength = 0;
  };

  for (const unit of units) {
    // 超长 text 单元：独立滑窗拆成多个父块（Python :1519-1530）
    if (unit.kind === 'text' && unit.text.length > MEMORY_CONFIG.parent_size) {
      flush();
      for (const [start, end] of slidingSpans(unit.text, MEMORY_CONFIG.parent_size, 0)) {
        const part = newUnit(
          unit.kind,
          unit.text.slice(start, end),
          unit.group_key,
          { ...unit.context },
          { ...unit.data, unit_char_start: start, unit_char_end: end },
          { sha: unit.raw_sha256, mime: unit.raw_mime },
        );
        const context: Record<string, unknown> = { ...part.context };
        const parent: Parent = {
          source_id: sourceId,
          ordinal: parents.length,
          text: part.text,
          kind: 'text',
          context,
          units: [part],
          parent_id: newId(),
        };
        part.parent_id = parent.parent_id;
        parents.push(parent);
      }
      continue;
    }
    const isTable = unit.kind === 'table_row';
    const sameGroup = current.length > 0 && current[0].group_key === unit.group_key;
    const sameKind = current.length > 0 && current[0].kind === unit.kind;
    const tooManyRows = isTable && current.length >= MEMORY_CONFIG.max_table_rows_per_parent;
    const tooLong = currentLength + unit.text.length + 2 > MEMORY_CONFIG.parent_size;
    if (
      current.length > 0 &&
      (!sameGroup || !sameKind || tooManyRows || tooLong || unit.kind === 'image')
    ) {
      flush();
    }
    current.push(unit);
    currentLength += unit.text.length + 2;
    if (unit.kind === 'image') flush();
  }
  flush();
  return parents;
}

export interface BuiltChild {
  chunk_id: string;
  parent_id: string;
  source_id: string;
  ordinal: number;
  start_char: number;
  end_char: number;
  text: string;
  kind: string;
  context: Record<string, unknown>;
  unit_ids: string[];
}

export function buildChildren(parents: Parent[]): BuiltChild[] {
  const children: BuiltChild[] = [];
  for (const parent of parents) {
    if (parent.kind === 'table_row') {
      let cursor = 0;
      for (const unit of parent.units) {
        let start = parent.text.indexOf(unit.text, cursor);
        if (start < 0) start = cursor;
        const end = start + unit.text.length;
        cursor = end;
        children.push({
          chunk_id: newId(),
          parent_id: parent.parent_id,
          source_id: parent.source_id,
          ordinal: children.length,
          start_char: start,
          end_char: end,
          text: unit.text,
          kind: unit.kind,
          context: { ...parent.context },
          unit_ids: [unit.unit_id],
        });
      }
      continue;
    }
    for (const [start, end] of slidingSpans(
      parent.text,
      MEMORY_CONFIG.child_size,
      MEMORY_CONFIG.child_overlap,
    )) {
      const text = parent.text.slice(start, end).trim();
      if (!text) continue;
      children.push({
        chunk_id: newId(),
        parent_id: parent.parent_id,
        source_id: parent.source_id,
        ordinal: children.length,
        start_char: start,
        end_char: end,
        text,
        kind: parent.kind,
        context: { ...parent.context },
        unit_ids: parent.units.map((u) => u.unit_id),
      });
    }
  }
  return children;
}
