/**
 * ComposerTokenMeter — Studio 输入框上下文用量计（contextTokens vs model window）。
 *
 * 参考 hermes-desktop screens/Chat/ContextGauge：已用 context tokens 对模型上下文窗口
 * 的占比，sf-bar 进度条 + 颜色分段（ok/warn/reject）+ hover 明细。
 *
 * 数据来源（真实，非调用方静态值）：
 *  - `used` = StudioChat 对当前会话的 token 估算（estimateTokens 累加所有消息），
 *    一旦后端回传真实 usage.contextTokens，调用方直接传真实值即可。
 *  - `window` = 选中 executor/model 推出的上下文窗口（currentModelWindow，读 sf.* localStorage）；
 *    调用方不传或传 0 时本组件兜底用 currentModelWindow()。
 */
import { useMemo, useState } from 'react';
import { currentModelWindow } from './studioTokens';

/**
 * 用量百分比 → sf-bar 语义类。对齐 clawsgo / hermes 色温：
 * 正常态（<70%）走柔和蓝 `sf-bar--blue`（而非绿），70%+ 转琥珀警示、90%+ 转红。
 * 与 studioTokens.sfBarTone 的区别仅在「正常态色」——本计是上下文「占用」而非
 * 「成功率」，蓝色比绿色更贴近 hermes ContextGauge 的中性观感。
 */
function gaugeTone(pct: number): string {
  if (pct >= 90) return 'sf-bar--reject';
  if (pct >= 70) return 'sf-bar--warn';
  return 'sf-bar--blue';
}

export interface ComposerTokenMeterProps {
  /** 当前已用 context tokens。 */
  used: number;
  /** 模型上下文窗口大小（tokens）。<=0 时本组件用 currentModelWindow() 兜底。 */
  window: number;
  /** 紧凑模式（只显示条，不显示数字）。 */
  compact?: boolean;
}

function fmtK(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(k >= 10 ? 0 : 1)}k`;
  }
  return String(n);
}

export function ComposerTokenMeter({ used, window: win, compact }: ComposerTokenMeterProps) {
  const [hover, setHover] = useState(false);
  // window<=0 → 用当前选中模型的窗口兜底，保证永远有一个真实分母。
  const effWindow = useMemo(() => (win > 0 ? win : currentModelWindow()), [win]);
  const pct = effWindow > 0 ? Math.min(100, Math.round((used / effWindow) * 100)) : 0;
  const tone = gaugeTone(pct);

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, width: compact ? 96 : 176 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${used.toLocaleString()} / ${effWindow.toLocaleString()} tokens (${pct}%)`}
      data-testid="studio-token-meter"
    >
      <div className={`sf-bar ${tone}`} style={{ flex: 1 }}>
        <span className="sf-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: pct >= 90 ? 'var(--status-reject, #EF4444)' : 'var(--t-fg-4)',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtK(used)}/{fmtK(effWindow)}
        </span>
      )}
      {/* hover 明细浮层（hermes ContextGauge 风格） */}
      {hover && (
        <div
          className="sf-anim-fade"
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            minWidth: 150,
            padding: '8px 10px',
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px -8px rgba(0,0,0,.4)',
            zIndex: 60,
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--t-fg-2)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--t-fg-4)' }}>已用</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {used.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--t-fg-4)' }}>窗口</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {effWindow.toLocaleString()}
            </span>
          </div>
          <div
            style={{
              marginTop: 4,
              paddingTop: 4,
              borderTop: '1px solid var(--t-border)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ color: 'var(--t-fg-4)' }}>占比</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color:
                  pct >= 90
                    ? 'var(--status-reject, #EF4444)'
                    : pct >= 70
                      ? 'var(--status-warn, #F59E0B)'
                      : 'var(--status-blue, #3B82F6)',
              }}
            >
              {pct}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ComposerTokenMeter;
