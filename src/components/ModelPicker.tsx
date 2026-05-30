/**
 * ModelPicker — 模型/执行器选择器（CLI 段 + API 段），2026-05-29。
 *
 * 从 RunSessionPage 内联代码抽出，复用到 run-session / chat ComposerFB /
 * StartPage 三处。自管：开关、CLI/API 数据加载（GET /api/settings/agents/detect
 * + /api/settings/byok）、sessionStorage 缓存、点击外部关闭。
 *
 * **不写 localStorage** —— 选中只 `onChange({executor, model})`，落库由父组件决定
 * （run-session/chat/StartPage 各自写 sf.defaultExecutor + sf.model）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cpu, Check, ExternalLink } from 'lucide-react';
import { useI18n } from '../common/i18n';
import { getApiBase } from '../api/_base';
import {
  PICKER_CLI_META,
  PICKER_PROVIDER_META,
  fetchPickerCliItems,
  fetchPickerApiItems,
  loadCachedPicker,
  saveCachedPicker,
  pickerLabel,
  type PickerCliItem,
  type PickerApiItem,
  type PickerItem,
  type ModelPickerValue,
} from '../common/constants/modelPicker';

export interface ModelPickerProps {
  value: ModelPickerValue;
  onChange: (next: ModelPickerValue) => void;
  /** 是否含 CLI 段。chat 后端经 Node dispatcher 支持 CLI → 默认含。 */
  includeCli?: boolean;
  /** 下拉弹出方向（默认向上，composer 都在底部）。 */
  placement?: 'up' | 'down';
  /** 'button'=run-session 宽按钮；'compact'=工具栏图标按钮。 */
  variant?: 'button' | 'compact';
  /** 空态「去设置」跳转回调（父注入 navigate）。 */
  onNavigateSettings?: (target: string) => void;
}

export default function ModelPicker({
  value,
  onChange,
  includeCli = true,
  placement = 'up',
  variant = 'button',
  onNavigateSettings,
}: ModelPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [cliItems, setCliItems] = useState<PickerCliItem[]>(() => loadCachedPicker()?.cli ?? []);
  const [apiItems, setApiItems] = useState<PickerApiItem[]>(() => loadCachedPicker()?.api ?? []);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 下拉用 portal 渲染到 <body> + position:fixed，逃离 composer `.compShell`
  // 等祖先的 overflow:hidden / transform 裁切（之前 absolute 被 compShell 裁掉，
  // 模型下拉「显示不出来」，2026-05-30 修）。坐标按触发按钮的视口 rect 计算。
  const dropdownRef = useRef<HTMLDivElement>(null);
  // 实际最大高度：按选定方向的可用视口空间夹取（≤460），永不溢出页边。
  const [maxH, setMaxH] = useState(460);
  // fixed 定位坐标：top 或 bottom 二选一（向下/向上弹），left 夹取防溢出右边。
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });

  // Prewarm on mount + refresh on open (catches newly-installed CLI / new keys).
  const refresh = () => {
    const apiBase = getApiBase();
    const hasData = cliItems.length > 0 || apiItems.length > 0;
    if (!hasData) setLoading(true);
    Promise.all([fetchPickerCliItems(apiBase), fetchPickerApiItems(apiBase)])
      .then(([cli, api]) => {
        setCliItems(cli);
        setApiItems(api);
        saveCachedPicker(cli, api);
      })
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) refresh(); }, [open]);

  // Click-outside close. The dropdown is portaled to <body>, so it's NOT a DOM
  // descendant of wrapRef — must also exclude dropdownRef or a click on a menu
  // item would be treated as "outside" and close before the item's onClick.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // 打开时（及滚动/resize 时）按按钮 rect 算 fixed 坐标 + 上/下弹方向 + 最大高度。
  // useLayoutEffect：定位在 paint 前完成，避免下拉先闪一下再归位。
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = wrapRef.current?.querySelector('button');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const GAP = 6;
      const DROP_W = 260;
      const spaceAbove = rect.top - 12;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const dir: 'up' | 'down' =
        placement === 'up'
          ? (spaceAbove < 360 && spaceBelow > spaceAbove ? 'down' : 'up')
          : (spaceBelow < 360 && spaceAbove > spaceBelow ? 'up' : 'down');
      setMaxH(Math.max(180, Math.min(460, dir === 'up' ? spaceAbove : spaceBelow)));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - DROP_W - 8));
      setPos(dir === 'up'
        ? { left, bottom: window.innerHeight - rect.top + GAP }
        : { left, top: rect.bottom + GAP });
    };
    compute();
    // capture=true：捕获任意可滚动祖先的滚动，让 fixed 下拉跟随按钮。
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [open, placement]);

  const { label, tooltip } = pickerLabel(value.executor, value.model);

  const select = (it: PickerItem) => {
    if (it.kind === 'cli') onChange({ executor: `cli:${it.agentId}`, model: value.model });
    else onChange({ executor: `byok:${it.providerId}`, model: it.modelId });
    setOpen(false);
  };

  const renderItem = (it: PickerItem) => {
    const active = it.kind === 'cli'
      ? value.executor === `cli:${it.agentId}`
      : value.executor === `byok:${it.providerId}` && value.model === it.modelId;
    const key = it.kind === 'cli' ? `cli:${it.agentId}` : `byok:${it.providerId}:${it.modelId}`;
    const title = it.kind === 'cli' ? it.name : it.modelId;
    const sub = it.kind === 'cli' ? (it.version ? it.version : 'CLI · installed') : it.providerName;
    return (
      <button
        key={key}
        type="button"
        title={it.kind === 'cli' ? `${title} · ${sub}` : `${title} — ${sub}`}
        onClick={() => select(it)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', border: 0, cursor: 'pointer',
          background: active ? 'var(--t-accent-tint)' : 'transparent',
          textAlign: 'left', transition: 'background .1s',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--t-hover, var(--t-panel))'; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
          background: `color-mix(in oklab, ${it.tint} 14%, var(--t-panel))`,
          border: `1px solid color-mix(in oklab, ${it.tint} ${active ? 60 : 30}%, transparent)`,
          color: it.tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 8.5,
          letterSpacing: '-0.04em', userSelect: 'none',
        }}>{it.monogram}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, fontWeight: 500,
            color: active ? 'var(--t-accent-bright)' : 'var(--t-fg)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{title}</span>
          <span style={{
            display: 'block', fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5,
            color: 'var(--t-fg-4)', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{sub}</span>
        </span>
        {active && <Check size={12} strokeWidth={2.5} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />}
      </button>
    );
  };

  const sectionLabel = (text: string) => (
    <div style={{
      padding: '8px 12px 4px', fontFamily: 'var(--font-mono, monospace)',
      fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
      color: 'var(--t-fg-4)', fontWeight: 600,
    }}>{text}</div>
  );

  const emptyHint = (text: string, target: string) => (
    <button
      type="button"
      onClick={() => { onNavigateSettings?.(target); setOpen(false); }}
      style={{
        width: '100%', textAlign: 'left', padding: '6px 12px 9px',
        background: 'transparent', border: 0, cursor: 'pointer',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-4)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-accent-bright)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t-fg-4)'; }}
    >
      <span>{text}</span>
      <ExternalLink size={10} strokeWidth={1.8} />
    </button>
  );

  const compact = variant === 'compact';

  return (
    <div style={{ position: 'relative' }} data-model-picker ref={wrapRef}>
      <button
        type="button"
        title={tooltip}
        className={compact ? undefined : 'cmp-btn'}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          ...(compact
            ? {
                height: 28, padding: '0 8px', borderRadius: 7, maxWidth: 160,
                background: open ? 'var(--t-accent-tint)' : 'transparent',
                border: `1px solid ${open ? 'var(--t-accent)' : 'var(--t-border)'}`,
                color: open ? 'var(--t-accent-bright)' : 'var(--t-fg-3)', cursor: 'pointer',
              }
            : {
                ...(open ? { background: 'var(--t-accent-tint)', borderColor: 'var(--t-accent)', color: 'var(--t-accent-bright)' } : {}),
                paddingLeft: 8, paddingRight: 10, width: 'auto', maxWidth: 200,
              }),
        }}
      >
        <Cpu size={compact ? 13 : 15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: compact ? 11 : 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {label}
        </span>
      </button>
      {open && createPortal(
        <div ref={dropdownRef} data-model-picker-pop style={{
          position: 'fixed', left: pos.left, width: 260, maxHeight: maxH, zIndex: 1000,
          ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom ?? 0 }),
          background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 10,
          boxShadow: '0 8px 24px -8px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.04)',
          padding: '4px 0', overflowY: 'auto',
        }}>
          {includeCli && (
            <>
              {sectionLabel('CLI')}
              {loading && cliItems.length === 0
                ? <div style={{ padding: '4px 12px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-4)' }}>{t('common.detecting')}</div>
                : cliItems.length === 0
                  ? emptyHint('未检测到已安装的 CLI · 去设置', '/settings#local-cli')
                  : cliItems.map(renderItem)}
              <div style={{ margin: '4px 0', borderTop: '1px solid var(--t-border)' }} />
            </>
          )}
          {sectionLabel('API')}
          {loading && apiItems.length === 0
            ? <div style={{ padding: '4px 12px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: 10.5, color: 'var(--t-fg-4)' }}>{t('common.loading')}</div>
            : apiItems.length === 0
              ? emptyHint('未配置 API Key · 去设置 BYOK', '/settings#byok')
              : apiItems.map(renderItem)}
        </div>,
        document.body,
      )}
    </div>
  );
}

// 透传常量给少数仍需直接读 meta 的调用方（如 RunSessionPage 的 label 兜底）。
export { PICKER_CLI_META, PICKER_PROVIDER_META };
