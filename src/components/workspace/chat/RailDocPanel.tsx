/**
 * RailDocPanel — 文档列表（Rail "doc" tab）
 * 参考飞书文档 / Notion 文档列表
 */

import { FBAv } from '../FBAtoms';
import { CI } from './icons';
import { Pin } from '../../../common/icons/iconRegistry';

interface DocItem {
  id: string;
  title: string;
  type: 'paper' | 'draft' | 'note' | 'data';
  author: { glyph: string; color: string; name: string };
  updated: string;
  version?: string;
  pinned?: boolean;
}

const DOC_TYPE_META: Record<string, { icon: JSX.Element; label: string; color: string }> = {
  paper: { icon: CI.doc, label: '论文', color: 'var(--t-accent)' },
  draft: { icon: CI.doc, label: '草稿', color: 'var(--status-warn)' },
  note:  { icon: CI.doc, label: '笔记', color: 'var(--t-fg-3)' },
  data:  { icon: CI.doc, label: '数据', color: 'var(--status-ok)' },
};

const MOCK_DOCS: DocItem[] = [
  { id: 'd1', title: 'arXiv:2410.11215 — 精读批注', type: 'paper', author: { glyph: '读', color: 'var(--t-accent)', name: '读读' }, updated: '09:14', pinned: true },
  { id: 'd2', title: 'draft.v3 — §6.3 重写', type: 'draft', author: { glyph: '写', color: 'var(--t-err)', name: '小写' }, updated: '09:21', version: 'v3' },
  { id: 'd3', title: '不一致发现报告', type: 'note', author: { glyph: '批', color: 'var(--t-warn)', name: '阿批' }, updated: '09:16' },
  { id: 'd4', title: 'Tab.2 原始数据 diff', type: 'data', author: { glyph: '查', color: 'var(--t-gated, var(--t-accent))', name: '查查' }, updated: '09:18' },
  { id: 'd5', title: 'draft.v2 — baseline 版本', type: 'draft', author: { glyph: '写', color: 'var(--t-err)', name: '小写' }, updated: '昨日', version: 'v2' },
  { id: 'd6', title: '引用校验清单 47/47', type: 'data', author: { glyph: '查', color: 'var(--t-gated, var(--t-accent))', name: '查查' }, updated: '昨日' },
  { id: 'd7', title: '文献综述大纲', type: 'note', author: { glyph: '读', color: 'var(--t-accent)', name: '读读' }, updated: '2天前' },
];

function DocRow({ doc }: { doc: DocItem }) {
  const meta = DOC_TYPE_META[doc.type];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
      borderRadius: 8, cursor: 'pointer', transition: 'background 120ms',
    }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--t-panel-2)')}
       onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{
        width: 32, height: 32, borderRadius: 7, background: `color-mix(in oklab, ${meta.color} 12%, var(--t-panel-2))`,
        border: `1px solid color-mix(in oklab, ${meta.color} 25%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, flexShrink: 0,
      }}>
        <span style={{ width: 15, height: 15, display: 'flex' }}>{meta.icon}</span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {doc.pinned && <span style={{ width: 10, height: 10, display: 'flex', color: 'var(--t-accent)' }}>{CI.pin}</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {doc.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: meta.color,
            padding: '0 4px', borderRadius: 3,
            background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
          }}>{meta.label}</span>
          {doc.version && <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)',
            padding: '0 4px', borderRadius: 3, background: 'var(--t-panel-3)', border: '1px solid var(--t-border)',
          }}>{doc.version}</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>
            {doc.author.name} · {doc.updated}
          </span>
        </div>
      </div>
      <FBAv glyph={doc.author.glyph} color={doc.author.color} size={22} square />
    </div>
  );
}

export function RailDocPanel() {
  const pinned = MOCK_DOCS.filter(d => d.pinned);
  const rest = MOCK_DOCS.filter(d => !d.pinned);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid var(--t-border)',
        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--skin-panel)', flexShrink: 0,
      }}>
        <span style={{ width: 18, height: 18, display: 'flex', color: 'var(--t-accent-bright)' }}>{CI.doc}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>文档</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>{MOCK_DOCS.length} 份</span>
      </div>

      {/* Doc list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }}>
        {pinned.length > 0 && (
          <>
            <div style={{ padding: '6px 14px 4px', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--t-fg-4)', letterSpacing: '0.06em' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Pin size={11} strokeWidth={2} /> 置顶</span>
            </div>
            {pinned.map(d => <DocRow key={d.id} doc={d} />)}
          </>
        )}
        <div style={{ padding: '10px 14px 4px', fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--t-fg-4)', letterSpacing: '0.06em' }}>
          最近文档
        </div>
        {rest.map(d => <DocRow key={d.id} doc={d} />)}
      </div>
    </div>
  );
}
