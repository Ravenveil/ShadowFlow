/**
 * HfSelect — 通用「好看下拉」，替代丑陋的原生 <select>。
 *
 * 设计沿用 ModelPicker 验证过的方案：触发按钮 + portal 到 <body> 的 fixed 下拉，
 * 按视口空间自动上/下翻转、点外关闭、选中项 accent 高亮 + Check。但本组件是
 * 纯通用的——只吃 {value,label,sub?,swatch?} 选项，不含任何 CLI/API 业务。
 *
 * 用 design token（var(--t-*)），深浅皮肤自动适配。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface HfSelectOption {
  value: string;
  label: string;
  /** 第二行小字说明（可选）。 */
  sub?: string;
  /** 左侧小色块（可选，传 CSS 颜色）。 */
  swatch?: string;
}

export interface HfSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: HfSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  /** 触发按钮 label 用等宽字体（模型名场景）。 */
  mono?: boolean;
  'data-testid'?: string;
}

export default function HfSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  ariaLabel,
  mono = false,
  'data-testid': testId,
}: HfSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(320);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });

  const current = options.find(o => o.value === value);

  // 点外关闭（下拉 portal 到 body，不是 wrapRef 后代，需同时排除 dropdownRef）。
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (wrapRef.current?.contains(tgt)) return;
      if (dropdownRef.current?.contains(tgt)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 打开/滚动/resize 时按按钮 rect 算 fixed 坐标 + 上/下翻转 + 夹取最大高度。
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = wrapRef.current?.querySelector('button');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const GAP = 6;
      const spaceAbove = rect.top - 12;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const dir: 'up' | 'down' = spaceBelow < 240 && spaceAbove > spaceBelow ? 'up' : 'down';
      setMaxH(Math.max(160, Math.min(320, dir === 'up' ? spaceAbove : spaceBelow)));
      setPos(dir === 'up'
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + GAP }
        : { left: rect.left, width: rect.width, top: rect.bottom + GAP });
    };
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  const labelFont = mono ? 'var(--font-mono, monospace)' : 'inherit';

  return (
    <div style={{ position: 'relative' }} ref={wrapRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: '0 10px',
          borderRadius: 9,
          background: 'var(--t-panel-2)',
          border: `1px solid ${open ? 'var(--t-accent)' : 'var(--t-border)'}`,
          boxShadow: open ? '0 0 0 3px color-mix(in oklab, var(--t-accent) 16%, transparent)' : 'none',
          color: current ? 'var(--t-fg)' : 'var(--t-fg-4)',
          cursor: 'pointer',
          transition: 'border-color 140ms, box-shadow 140ms',
          textAlign: 'left',
        }}
      >
        {current?.swatch && (
          <span style={{ width: 14, height: 14, borderRadius: 5, background: current.swatch, flexShrink: 0, border: '1px solid color-mix(in oklab, var(--t-fg) 14%, transparent)' }} />
        )}
        <span style={{ flex: 1, minWidth: 0, fontFamily: labelFont, fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          style={{ flexShrink: 0, color: 'var(--t-fg-4)', transition: 'transform 160ms', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            maxHeight: maxH,
            zIndex: 1000,
            ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom ?? 0 }),
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 10,
            boxShadow: '0 12px 32px -10px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.03)',
            padding: '5px',
            overflowY: 'auto',
          }}
        >
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '8px 9px',
                  border: 0,
                  borderRadius: 7,
                  cursor: 'pointer',
                  background: active ? 'var(--t-accent-tint)' : 'transparent',
                  textAlign: 'left',
                  transition: 'background 100ms',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'color-mix(in oklab, var(--t-fg) 6%, transparent)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {opt.swatch && (
                  <span style={{ width: 14, height: 14, borderRadius: 5, background: opt.swatch, flexShrink: 0, border: '1px solid color-mix(in oklab, var(--t-fg) 14%, transparent)' }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block',
                    fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: active ? 'var(--t-accent-bright)' : 'var(--t-fg)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{opt.label}</span>
                  {opt.sub && (
                    <span style={{
                      display: 'block', fontSize: 10, color: 'var(--t-fg-4)', marginTop: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{opt.sub}</span>
                  )}
                </span>
                {active && <Check size={13} strokeWidth={2.5} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
