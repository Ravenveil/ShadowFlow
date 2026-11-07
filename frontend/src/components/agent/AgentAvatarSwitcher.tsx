/**
 * AgentAvatarSwitcher — Grok 式头像切换（2026-11-04 用户反馈批）。
 *
 * 之前换头像要：进「灵魂」tab → 找「头像（DiceBear）」表单 → 调风格/种子 →
 * 再点「保存头像」。Grok 的范式是**点一下头像，弹出一屏候选，点一个就换好**。
 *
 * 本组件：
 *   - 渲染当前头像（可点击），弹出紧凑候选浮层；
 *   - 候选 = 当前 seed 下各套 DiceBear 风格的实时预览网格（点选即 PATCH 保存，
 *     没有独立的「保存」按钮）；
 *   - 「换一批」换随机种子重排候选；「上传图片」读本地文件为 dataURL 直接存；
 *     「恢复默认」清空自定义回名字 hash；
 *   - 保存中禁用、失败行内红字，不阻塞关闭。
 *
 * 数据源与侧栏/气泡/成员面板/DAG 节点同源（AgentAvatar），保存走
 * patchAgent 真实端点，成功后 onChanged 回抛新 record 让调用方刷新全 app。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dices, ImagePlus, RotateCcw } from 'lucide-react';
import { patchAgent, type AgentRecord } from '../../api/agents';
import { DICEBEAR_STYLES, randomSeed } from '../../config/clawhub';
import { AgentAvatar } from './AgentAvatar';
import { useI18n } from '../../common/i18n';

export interface AgentAvatarSwitcherProps {
  agent: AgentRecord;
  /** 头像直径（px）。默认 20（会话顶栏尺寸）。 */
  size?: number;
  /** 保存成功回调：回抛 PATCH 后的完整 record。 */
  onChanged?: (agent: AgentRecord) => void;
  className?: string;
}

export function AgentAvatarSwitcher({
  agent,
  size = 20,
  onChanged,
  className = '',
}: AgentAvatarSwitcherProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(() => agent.avatar_seed || agent.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  /** 浮层用 portal 挂 body + fixed 定位：会话顶栏 .neo-gc-title 有
   *  overflow:hidden，普通绝对定位会被裁掉。点开时按触发钮实测定位。 */
  const toggleOpen = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const left = Math.min(rect.left, Math.max(8, window.innerWidth - 288));
        setPopPos({ top: rect.bottom + 10, left });
      }
      return !wasOpen;
    });
  }, []);

  // 31 套全铺开要同步生成 31 张 DiceBear SVG，浮层打开会卡一下。
  // Grok 式默认给 12 个候选，点「更多风格」再展开全套。
  const candidates = useMemo(
    () => (showAll ? DICEBEAR_STYLES : DICEBEAR_STYLES.slice(0, 12)),
    [showAll],
  );

  const apply = useCallback(
    async (patch: { avatar_style?: string; avatar_seed?: string; avatar_image?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const next = await patchAgent(agent.agent_id, patch);
        onChanged?.(next);
        setOpen(false);
      } catch {
        setError(t('clawhub.agent.avatarSaveFailed', { defaultValue: '头像保存失败，请重试' }));
      } finally {
        setBusy(false);
      }
    },
    [agent.agent_id, onChanged, t],
  );

  const pickFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') void apply({ avatar_image: reader.result });
      };
      reader.onerror = () =>
        setError(t('clawhub.agent.avatarReadFailed', { defaultValue: '图片读取失败' }));
      reader.readAsDataURL(file);
    },
    [apply, t],
  );

  return (
    <span className={`neo-aas${className ? ` ${className}` : ''}`} title={agent.name}>
      <button
        ref={triggerRef}
        type="button"
        className="neo-aas-trigger"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={t('clawhub.agent.changeAvatar', { defaultValue: `更换 ${agent.name} 的头像` })}
        title={t('clawhub.agent.changeAvatar', { defaultValue: '点击更换头像' })}
        data-testid="neo-aas-trigger"
      >
        <AgentAvatar
          name={agent.name}
          style={agent.avatar_style}
          seed={agent.avatar_seed ?? agent.name}
          image={agent.avatar_image ?? null}
          size={size}
        />
      </button>

      {open &&
        createPortal(
          <>
            <div className="neo-aas-backdrop" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="neo-aas-pop"
              data-testid="neo-aas-pop"
              style={{ position: 'fixed', top: popPos.top, left: popPos.left }}
            >
          <div className="neo-aas-pop-head">
            <AgentAvatar
              name={agent.name}
              style={agent.avatar_style}
              seed={agent.avatar_seed ?? agent.name}
              image={agent.avatar_image ?? null}
              size={40}
            />
            <div className="neo-aas-pop-meta">
              <div className="neo-aas-pop-name">{agent.name}</div>
              <div className="neo-aas-pop-hint">
                {t('clawhub.agent.avatarPickHint', { defaultValue: '点一个头像立即生效' })}
              </div>
            </div>
          </div>

          <div className="neo-aas-grid" role="group" aria-label="头像候选">
            {candidates.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`neo-aas-cell${agent.avatar_style === style.id ? ' on' : ''}`}
                disabled={busy}
                title={style.label}
                aria-label={style.label}
                data-testid="neo-aas-cell"
                onClick={() => void apply({ avatar_style: style.id, avatar_seed: seed, avatar_image: '' })}
              >
                <AgentAvatar name={agent.name} style={style.id} seed={seed} size={38} />
              </button>
            ))}
          </div>

          {!showAll && DICEBEAR_STYLES.length > 12 && (
            <button
              type="button"
              className="neo-aas-more"
              onClick={() => setShowAll(true)}
            >
              {t('clawhub.agent.avatarMoreStyles', {
                defaultValue: '更多风格（{{count}}）',
                count: DICEBEAR_STYLES.length - 12,
              })}
            </button>
          )}

          <div className="neo-aas-actions">
            <button
              type="button"
              className="neo-aas-action"
              disabled={busy}
              onClick={() => {
                const next = randomSeed();
                setSeed(next);
                void apply({ avatar_seed: next, avatar_image: '' });
              }}
            >
              <Dices size={13} strokeWidth={1.9} aria-hidden />
              {t('clawhub.agent.avatarShuffle', { defaultValue: '换一批' })}
            </button>
            <button
              type="button"
              className="neo-aas-action"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={13} strokeWidth={1.9} aria-hidden />
              {t('clawhub.agent.avatarUpload', { defaultValue: '上传' })}
            </button>
            <button
              type="button"
              className="neo-aas-action"
              disabled={busy}
              onClick={() => void apply({ avatar_style: '', avatar_seed: '', avatar_image: '' })}
            >
              <RotateCcw size={13} strokeWidth={1.9} aria-hidden />
              {t('clawhub.agent.avatarReset', { defaultValue: '默认' })}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="neo-aas-file"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {error && <div className="neo-aas-error">{error}</div>}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

export default AgentAvatarSwitcher;
