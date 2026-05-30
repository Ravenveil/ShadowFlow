/**
 * DirPicker — 工作目录选择器(给 CLI cwd 选工作文件夹),2026-05-30。
 *
 * 浏览器拿不到本地文件夹真实磁盘路径,所以目录树由 Node 后端读磁盘返回
 * (src/api/fsBrowse.ts → server/src/routes/fs-browse.ts),用户逐层点进、
 * 选中当前目录 → onPick(绝对路径)。复用于 run-session / chat / start 三处
 * 对话框 + 群设置。
 *
 * 本组件只负责浮层(portal 到 body + position:fixed,逃 composer overflow 裁切)。
 * 父组件渲染触发按钮并控制 open;锚点通过 anchorRef 传入用于定位。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, ChevronRight, ArrowUp, Check, X, HardDrive } from 'lucide-react';
import { fsHome, fsList, type FsEntry } from '../api/fsBrowse';

export interface DirPickerProps {
  /** 当前已选目录(用于初始定位);空 = 从 home 开始。 */
  value?: string;
  /** 选定一个目录后回调绝对路径。 */
  onPick: (absPath: string) => void;
  /** 关闭浮层(不选)。 */
  onClose: () => void;
  /** 锚点元素(触发按钮)的 ref,用于定位浮层。 */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 浮层标题。 */
  title?: string;
}

export default function DirPicker({ value, onPick, onClose, anchorRef, title }: DirPickerProps) {
  const [cur, setCur] = useState<string | undefined>(value);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载某目录(undefined=home;'ROOT'=盘符)。
  const load = (p?: string) => {
    setLoading(true);
    setErr(null);
    fsList(p)
      .then((r) => {
        if (!r) {
          setErr('无法读取目录(后端未响应)');
          return;
        }
        setCur(r.path === 'ROOT' ? undefined : r.path);
        setParent(r.parent);
        setEntries(r.entries);
      })
      .finally(() => setLoading(false));
  };

  // 初始:有 value 从它开始,否则 home。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (value) load(value);
    else fsHome().then((h) => load(h?.home));
  }, []);

  // 定位浮层(锚点上方优先,空间不够翻下)。
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 6;
    const PANEL_H = 380;
    const PANEL_W = 360;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    const spaceAbove = r.top;
    if (spaceAbove > PANEL_H + GAP) {
      setPos({ left, bottom: window.innerHeight - r.top + GAP });
    } else {
      setPos({ left, top: r.bottom + GAP });
    }
  }, [anchorRef]);

  // 点外关闭。
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [anchorRef, onClose]);

  const panel = (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom,
        width: 360, maxHeight: 380, zIndex: 300,
        display: 'flex', flexDirection: 'column',
        background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 10,
        boxShadow: '0 12px 32px -8px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.04)',
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
        borderBottom: '1px solid var(--t-border)', flexShrink: 0,
      }}>
        <FolderOpen size={14} strokeWidth={1.8} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg)', flex: 1 }}>
          {title ?? '选择工作目录'}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--t-fg-4)', display: 'flex', padding: 2 }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* current path bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        borderBottom: '1px solid var(--t-border)', flexShrink: 0,
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-3)',
      }}>
        <button
          type="button"
          title="上一级"
          onClick={() => load(parent ?? 'ROOT')}
          disabled={parent === null && !cur}
          style={{
            background: 'transparent', border: '1px solid var(--t-border)', borderRadius: 6,
            cursor: parent === null && !cur ? 'default' : 'pointer', color: 'var(--t-fg-3)',
            display: 'flex', alignItems: 'center', padding: 3, flexShrink: 0,
            opacity: parent === null && !cur ? 0.4 : 1,
          }}
        >
          <ArrowUp size={12} strokeWidth={2} />
        </button>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }}>
          {cur ?? '此电脑 / 盘符'}
        </span>
      </div>

      {/* entry list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono, monospace)' }}>
            读取中…
          </div>
        ) : err ? (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-danger, #e5484d)' }}>{err}</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-fg-4)' }}>（无子目录）</div>
        ) : (
          entries.map((e) => (
            <button
              key={e.path}
              type="button"
              onClick={() => load(e.path)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', border: 0, background: 'transparent', cursor: 'pointer',
                textAlign: 'left', color: 'var(--t-fg)',
              }}
              onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'var(--t-hover, var(--t-bg))'; }}
              onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {cur === undefined
                ? <HardDrive size={13} strokeWidth={1.8} style={{ color: 'var(--t-fg-3)', flexShrink: 0 }} />
                : <Folder size={13} strokeWidth={1.8} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />}
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
              </span>
              <ChevronRight size={12} strokeWidth={1.8} style={{ color: 'var(--t-fg-4)', flexShrink: 0 }} />
            </button>
          ))
        )}
      </div>

      {/* footer — pick current dir */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderTop: '1px solid var(--t-border)', flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 10.5, color: 'var(--t-fg-4)' }}>
          {cur ? '选「此目录」= 该文件夹当 CLI 工作目录' : '进入一个盘符后可选目录'}
        </span>
        <button
          type="button"
          disabled={!cur}
          onClick={() => { if (cur) onPick(cur); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 7, border: 0, cursor: cur ? 'pointer' : 'default',
            background: cur ? 'var(--t-accent)' : 'var(--t-border)',
            color: cur ? '#fff' : 'var(--t-fg-4)', fontSize: 11.5, fontWeight: 600,
          }}
        >
          <Check size={12} strokeWidth={2.5} /> 选此目录
        </button>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
