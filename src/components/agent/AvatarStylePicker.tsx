/**
 * AvatarStylePicker — DiceBear 风格/种子选择器（ClawHub 2026-06，FR-06）。
 *
 *  - 风格下拉（12 套，带预览缩略图 —— 用当前种子实时渲染每套风格 mini 头像）
 *  - 种子输入框 + 随机骰子按钮
 *  - 大号实时预览卡（AgentAvatar 128px）
 *
 * 受控组件：value = {style, seed}；onChange 回抛完整对象（清空键位由调用方提供）。
 */
import { useMemo } from 'react';
import { Dices } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import {
  DICEBEAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  hashSeed,
  randomSeed,
  renderAvatarSvg,
  type DicebearStyleId,
} from '../../config/clawhub';
import { AgentAvatar } from './AgentAvatar';

export interface AvatarConfigValue {
  style: string;
  seed: string;
}

export interface AvatarStylePickerProps {
  value: AvatarConfigValue;
  onChange: (next: AvatarConfigValue) => void;
  /** 预览用 Agent 名（种子为空时按名字 hash）。 */
  agentName: string;
  /** 尺寸档：紧凑（表单内嵌）| 舒展（模态）。默认 compact。 */
  variant?: 'compact' | 'roomy';
}

/** 风格缩略图（当前种子渲染 mini SVG）。 */
function StyleThumb({ styleId, seed }: { styleId: DicebearStyleId; seed: string }) {
  const svg = useMemo(() => {
    try {
      return renderAvatarSvg(styleId, seed);
    } catch {
      return '';
    }
  }, [styleId, seed]);
  return (
    <span
      className="claw-style-thumb"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function AvatarStylePicker({
  value,
  onChange,
  agentName,
  variant = 'compact',
}: AvatarStylePickerProps) {
  const { t } = useI18n();

  const effectiveSeed = value.seed.trim() || hashSeed(agentName);

  return (
    <div className={`claw-avatar-picker claw-avatar-picker--${variant}`} data-testid="avatar-style-picker">
      {/* 实时预览 */}
      <div className="claw-avatar-preview">
        <AgentAvatar name={agentName} style={value.style} seed={value.seed || null} size={variant === 'roomy' ? 96 : 64} />
        <div className="claw-avatar-preview-meta">
          <span className="claw-avatar-preview-style">
            {DICEBEAR_STYLES.find((s) => s.id === value.style)?.label ?? value.style}
          </span>
          <span className="claw-avatar-preview-seed" title={effectiveSeed}>
            {t('clawhub.avatar.seedLabel', { defaultValue: '种子' })}: {effectiveSeed.slice(0, 16)}
            {effectiveSeed.length > 16 ? '…' : ''}
          </span>
        </div>
      </div>

      {/* 风格网格（12 套带缩略图；比下拉更好扫视，移动端友好） */}
      <div className="claw-style-grid" role="radiogroup" aria-label={t('clawhub.avatar.styleLabel', { defaultValue: '头像风格' })}>
        {DICEBEAR_STYLES.map((s) => {
          const active = value.style === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`claw-style-cell${active ? ' on' : ''}`}
              onClick={() => onChange({ ...value, style: s.id })}
              title={s.id === DEFAULT_AVATAR_STYLE ? `${s.label}（默认）` : s.label}
              data-testid={`claw-style-${s.id}`}
            >
              <StyleThumb styleId={s.id} seed={effectiveSeed} />
              <span className="claw-style-cell-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* 种子输入 + 随机 */}
      <div className="claw-seed-row">
        <input
          type="text"
          className="claw-seed-input"
          value={value.seed}
          maxLength={64}
          spellCheck={false}
          onChange={(e) => onChange({ ...value, seed: e.target.value })}
          placeholder={t('clawhub.avatar.seedPlaceholder', {
            defaultValue: '种子（留空 = 按名字自动生成）',
          })}
          data-testid="claw-avatar-seed-input"
        />
        <button
          type="button"
          className="claw-seed-dice"
          onClick={() => onChange({ ...value, seed: randomSeed() })}
          title={t('clawhub.avatar.randomSeed', { defaultValue: '随机种子' })}
          data-testid="claw-avatar-seed-dice"
        >
          <Dices size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default AvatarStylePicker;
