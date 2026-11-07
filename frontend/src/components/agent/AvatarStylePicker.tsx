/**
 * AvatarStylePicker — DiceBear 风格/种子选择器（ClawHub 2026-06，FR-06）。
 *
 *  - 提示词生成区（2026-11-04 os-unified）：描述 → 生成 → 保存，对齐 Grok Bot
 *    「描述→生成→保存」流程。双通道：① 云端（用户 BYOK 配的绘图模型，
 *    智谱 CogView-4 / OpenAI gpt-image-1 自动挑）② 云端未配置/失败时本地
 *    DiceBear 启发式生成 4 候选。候选 stagger 淡入，点选回填。
 *  - 风格网格（12+ 套，带预览缩略图 —— 用当前种子实时渲染每套风格 mini 头像）
 *  - 种子输入框 + 随机骰子按钮
 *  - 大号实时预览卡（AgentAvatar 128px）
 *
 * 受控组件：value = {style, seed}；onChange 回抛完整对象（清空键位由调用方提供）。
 * 云端图候选（dataURL）通过 onChangeImage 回抛，调用方决定是否上传/存储。
 */
import { useMemo, useState } from 'react';
import { Dices, Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import {
  DICEBEAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  avatarFromPrompt,
  randomSeed,
  renderAvatarSvg,
  type DicebearStyleId,
} from '../../config/clawhub';
import { generateImageFromPrompt, ImageGenError } from '../../api/imageGen';
import { AgentAvatar } from './AgentAvatar';

export interface AvatarConfigValue {
  style: string;
  seed: string;
}

/** 一个生成候选：本地 DiceBear（style+seed）或云端图（imageUrl dataURL）。 */
interface GenCandidate {
  kind: 'local' | 'cloud';
  style?: string;
  seed?: string;
  imageUrl?: string;
}

export interface AvatarStylePickerProps {
  value: AvatarConfigValue;
  onChange: (next: AvatarConfigValue) => void;
  /** 预览用 Agent 名（种子为空时名字直作种子）。 */
  agentName: string;
  /** 尺寸档：紧凑（表单内嵌）| 舒展（模态）。默认 compact。 */
  variant?: 'compact' | 'roomy';
  /** 云端图生成成功回调（调用方持久化 dataURL；不传则只做本地候选）。 */
  onChangeImage?: (dataUrl: string) => void;
  /**
   * 当前生效的提示词生成头像图（dataURL/URL）。预览必须与侧栏/气泡同源：
   * avatar_image 优先于 DiceBear style/seed，否则「选择器预览 ≠ 实际头像」
   * （2026-11-04 用户反馈：左侧栏与灵魂页选择器预览不一致的根因）。
   */
  image?: string | null;
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

/** 生成候选卡片：云端图或本地 SVG + 选中描边 + stagger 淡入动画。 */
function PromptCandidate({
  candidate,
  index,
  active,
  onPick,
  label,
}: {
  candidate: GenCandidate;
  index: number;
  active: boolean;
  onPick: () => void;
  label: string;
}) {
  const localSvg = useMemo(() => {
    if (candidate.kind !== 'local') return '';
    try {
      return renderAvatarSvg(candidate.style as DicebearStyleId, candidate.seed ?? '');
    } catch {
      return '';
    }
  }, [candidate]);
  return (
    <button
      type="button"
      className={`claw-gen-candidate${active ? ' on' : ''}`}
      style={{ animationDelay: `${index * 70}ms` }}
      onClick={onPick}
      aria-label={label}
      title={label}
      data-testid={`claw-gen-candidate-${index}`}
    >
      {candidate.kind === 'cloud' ? (
        <img src={candidate.imageUrl} alt="" width={64} height={64} />
      ) : (
        <span aria-hidden dangerouslySetInnerHTML={{ __html: localSvg }} />
      )}
    </button>
  );
}

export function AvatarStylePicker({
  value,
  onChange,
  agentName,
  variant = 'compact',
  onChangeImage,
  image,
}: AvatarStylePickerProps) {
  const { t } = useI18n();
  // 提示词生成区（2026-11-04）：提示词 + 生成中瞬态 + 候选（云端或本地）
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<GenCandidate[] | null>(null);
  const [genSource, setGenSource] = useState<'cloud' | 'local' | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // 种子兜底唯一约定（2026-11-05 修复）：空 → agentName 直作种子，
  // 与 AgentAvatar 组件内兜底及调用方 `avatar_seed ?? name` 同规则，
  // 保证选择器预览/缩略图与侧栏头像同一张脸。
  const effectiveSeed = value.seed.trim() || agentName;

  /** 生成：云端优先（BYOK 绘图模型），503/失败 → 本地 DiceBear 4 候选。 */
  async function handleGenerate() {
    const text = prompt.trim();
    if (!text || generating) return;
    setGenerating(true);
    setCandidates(null);
    setGenError(null);
    try {
      // 云端：真实 AI 生图（一档，即点即用）
      const dataUrl = await generateImageFromPrompt(text);
      setGenSource('cloud');
      setCandidates([{ kind: 'cloud', imageUrl: dataUrl }]);
      onChangeImage?.(dataUrl);
    } catch (err) {
      if (!(err instanceof ImageGenError)) {
        setGenError(err instanceof Error ? err.message : String(err));
      }
      // 本地降级：503 未配置静默降级；其他错误提示后同样给本地候选兜底
      setGenSource('local');
      setCandidates([0, 1, 2, 3].map((i) => {
        const c = avatarFromPrompt(text, i);
        return { kind: 'local' as const, style: c.style, seed: c.seed };
      }));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={`claw-avatar-picker claw-avatar-picker--${variant}`} data-testid="avatar-style-picker">
      {/* ── 提示词生成区（Grok Bot 范式：描述 → 生成 → 点选 → 保存）───────── */}
      <div className="claw-gen-block" data-testid="claw-gen-block">
        <div className="claw-gen-row">
          <input
            type="text"
            className="claw-seed-input"
            value={prompt}
            maxLength={200}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleGenerate();
            }}
            placeholder={t('clawhub.avatar.genPlaceholder', {
              defaultValue: '描述想要的头像，如「戴圆眼镜的猫工程师」',
            })}
            aria-label={t('clawhub.avatar.genLabel', { defaultValue: '提示词生成头像' })}
            data-testid="claw-gen-input"
          />
          <button
            type="button"
            className="claw-seed-dice claw-gen-btn"
            onClick={() => void handleGenerate()}
            disabled={!prompt.trim() || generating}
            title={t('clawhub.avatar.genBtn', { defaultValue: '生成候选头像' })}
            data-testid="claw-gen-btn"
          >
            {generating ? (
              <Loader2 size={14} strokeWidth={2} className="neo-spin" aria-hidden />
            ) : (
              <Sparkles size={14} strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
        {generating && (
          <div className="claw-gen-hint" data-testid="claw-gen-hint">
            {t('clawhub.avatar.generating', { defaultValue: '生成中…' })}
          </div>
        )}
        {genError && (
          <div className="claw-gen-hint" style={{ color: '#b45309' }} data-testid="claw-gen-error">
            {genError}
          </div>
        )}
        {candidates && (
          <>
            {genSource === 'local' && (
              <div className="claw-gen-hint">
                {t('clawhub.avatar.localFallback', {
                  defaultValue: '云端绘图未配置，已用本地风格生成候选',
                })}
              </div>
            )}
            <div className="claw-gen-candidates" role="radiogroup" data-testid="claw-gen-candidates">
              {candidates.map((c, i) => (
                <PromptCandidate
                  key={c.kind === 'cloud' ? `cloud-${i}` : `${c.style}-${c.seed}`}
                  candidate={c}
                  index={i}
                  active={
                    c.kind === 'local' &&
                    value.style === c.style &&
                    value.seed === c.seed
                  }
                  onPick={() => {
                    if (c.kind === 'local') {
                      onChange({ style: c.style ?? '', seed: c.seed ?? '' });
                    }
                    // 云端候选：图片已由 onChangeImage 回抛（生成时），点选仅确认
                  }}
                  label={t('clawhub.avatar.candidate', { defaultValue: `候选 ${i + 1}` })}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 实时预览（image 优先：与侧栏/气泡同源，生成图覆盖 DiceBear 预览） */}
      <div className="claw-avatar-preview">
        <AgentAvatar
          name={agentName}
          style={value.style}
          seed={value.seed || null}
          image={image ?? null}
          size={variant === 'roomy' ? 96 : 64}
        />
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
