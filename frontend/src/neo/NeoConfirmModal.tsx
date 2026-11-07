/**
 * NeoConfirmModal — Neo 通用确认弹窗（2026-11-04 用户反馈批）。
 *
 * 用户反馈「删除操作感觉还是这么简陋……不想要 localhost:3007 显示那种」：
 * 此前 NeoRail 三处删除（会话/群聊/项目）二次确认仍走浏览器原生
 * window.confirm——白底系统框、标题带「localhost:3007 显示」字样，与应用
 * 视觉完全脱节。本组件用既有 neo-modal 弹层体系（.neo-modal-mask /
 * .neo-modal / .neo-modal-actions，样式在 neo.css 585-743 行）做统一替换。
 *
 * 形态：遮罩 + 白卡 + 标题 + 说明文字 + 取消/确认。与 NeoRenameModal 同款
 * 约定：
 *   - Enter 确认 / Esc 取消（busy 时均失效），mask 点击关闭（busy 时失效）；
 *   - 组件自身不持有 busy/error —— 真实 API 的 loading 与失败都发生在父层，
 *     由父组件经 props 下发（busy 时确认钮转圈、两钮失效；失败后弹窗保持
 *     打开、行内红条展示错误）。
 *
 * 危险语义（danger，缺省 true）：确认钮用 --t-err 红底白字，删除/回滚这类
 * 不可逆操作默认红色警示；中性确认可传 danger={false} 复用。
 */
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '../common/i18n';

export interface NeoConfirmModalProps {
  /** 弹窗标题（如「删除会话」）。 */
  title: string;
  /** 说明文字（如「确定删除会话「hi」？此操作不可撤销」）。 */
  message: string;
  /** 危险操作（缺省 true）：确认钮红色。 */
  danger?: boolean;
  /** 确认钮文案，缺省「删除」。 */
  confirmLabel?: string;
  /** 取消钮文案，缺省「取消」。 */
  cancelLabel?: string;
  /** 提交中：确认钮转圈、两钮 disabled。 */
  busy?: boolean;
  /** 行内错误红条（neo-modal-error，role=alert）；由父层在 API 失败时下发。 */
  error?: string | null;
  /** 确认回调：父组件负责真实调 API。 */
  onConfirm: () => void;
  onClose: () => void;
}

export function NeoConfirmModal({
  title,
  message,
  danger = true,
  confirmLabel,
  cancelLabel,
  busy = false,
  error = null,
  onConfirm,
  onClose,
}: NeoConfirmModalProps) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // 挂载即聚焦确认钮：键盘流 Enter 直接触发确认（与原生 confirm 习惯一致）。
  useEffect(() => {
    confirmBtnRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (busy) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="neo-modal-mask"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="neo-modal neo-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-testid="neo-confirm-modal"
      >
        <h2 className="neo-modal-title">{title}</h2>

        <p className="neo-confirm-message">{message}</p>

        {error && (
          <div className="neo-modal-error" role="alert" data-testid="neo-confirm-error">
            {error}
          </div>
        )}

        <div className="neo-modal-actions">
          <button
            type="button"
            className="neo-modal-cancel"
            onClick={onClose}
            disabled={busy}
            data-testid="neo-confirm-cancel"
          >
            {cancelLabel ?? t('common.cancel', { defaultValue: zh ? '取消' : 'Cancel' })}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            className={`neo-modal-danger-btn${danger ? ' is-danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
            data-testid="neo-confirm-confirm"
          >
            {busy && <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />}
            {confirmLabel ?? t('common.delete', { defaultValue: zh ? '删除' : 'Delete' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoConfirmModal;
