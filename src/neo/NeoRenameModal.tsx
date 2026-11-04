/**
 * NeoRenameModal — Neo 通用重命名弹窗（2026-11-04 用户反馈批）。
 *
 * 用户反馈「编辑项目名字的功能能不能成熟一点」：此前项目/会话/团队三处
 * 重命名都走浏览器原生 window.prompt（弹窗标题是「localhost:3007 显示」、
 * 标签「新名称」，样式与应用完全脱节）。本组件用既有 neo-modal 弹层体系
 * （.neo-modal-mask / .neo-modal / .neo-modal-input / .neo-modal-error /
 * .neo-modal-actions，样式在 neo.css 585-743 行）做统一替换。
 *
 * 形态对齐 NeoCreateGroupModal（遮罩 + 白卡 + label + input + 取消/确定），
 * 成熟度三件套：
 *   - 挂载即全选初始名（useRef + select()），用户直接输入即覆盖；
 *   - Enter 确认 / Esc 取消（busy 时均失效），mask 点击关闭（busy 时失效）；
 *   - 提交守卫：trim 后为空或与 initial 相同 → 确认钮 disabled
 *     （与父层「不改名就不发请求」语义一致）。
 *
 * 组件自身不持有 busy/error —— 真实 API 的 loading 与失败都发生在父层，
 * 由父组件经 props 下发（失败后弹窗保持打开，行内红条展示错误）。
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '../common/i18n';

export interface NeoRenameModalProps {
  /** 弹窗标题（如「重命名项目」/「重命名团队」）。 */
  title: string;
  /** 当前名称：进弹窗即全选，方便直接覆盖输入。 */
  initial: string;
  /** 提交中：确认钮转圈、输入框/两钮 disabled。 */
  busy?: boolean;
  /** 行内错误红条（neo-modal-error，role=alert）；由父层在 API 失败时下发。 */
  error?: string | null;
  /** 确认钮文案，缺省「确定」。 */
  confirmLabel?: string;
  /** 取消钮文案，缺省「取消」。 */
  cancelLabel?: string;
  /** 输入长度上限，缺省 100（对齐既有输入 maxLength 约定）。 */
  maxLength?: number;
  /** 提交回调：交出去 trim 后的名字；父组件负责真实调 API。 */
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function NeoRenameModal({
  title,
  initial,
  busy = false,
  error = null,
  confirmLabel,
  cancelLabel,
  maxLength = 100,
  onConfirm,
  onClose,
}: NeoRenameModalProps) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  const [name, setName] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 挂载即全选初始名：焦点已在输入框内，用户直接输入 = 覆盖（prompt 时代
  // 还要手动清空旧名，这是本次「成熟一点」的核心体验点）。
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  // 提交守卫：空名（含纯空白）不改名；与当前名相同不改名（不发无效请求）。
  const trimmed = name.trim();
  const canSubmit = !busy && trimmed.length > 0 && trimmed !== initial;

  const submit = () => {
    if (!canSubmit) return;
    onConfirm(trimmed);
  };

  return (
    <div
      className="neo-modal-mask"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="neo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        data-testid="neo-rename-modal"
      >
        <h2 className="neo-modal-title">{title}</h2>

        <label className="neo-modal-label" htmlFor="neo-rename-input">
          {t('neo.rename.nameLabel', { defaultValue: zh ? '新名称' : 'New name' })}
        </label>

        <input
          ref={inputRef}
          id="neo-rename-input"
          className="neo-modal-input"
          value={name}
          autoFocus
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Enter 确认 / Esc 取消；busy 时键盘提交/取消都失效（请求进行中
            // 不允许半途关弹窗，避免父层 busy 态悬挂）。
            if (busy) return;
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onClose();
          }}
          data-testid="neo-rename-input"
        />

        {error && (
          <div className="neo-modal-error" role="alert" data-testid="neo-rename-error">
            {error}
          </div>
        )}

        <div className="neo-modal-actions">
          <button
            type="button"
            className="neo-modal-cancel"
            onClick={onClose}
            disabled={busy}
            data-testid="neo-rename-cancel"
          >
            {cancelLabel ?? t('common.cancel', { defaultValue: zh ? '取消' : 'Cancel' })}
          </button>
          <button
            type="button"
            className="neo-btn-primary"
            onClick={submit}
            disabled={!canSubmit}
            data-testid="neo-rename-confirm"
          >
            {busy && <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />}
            {confirmLabel ?? t('common.confirm', { defaultValue: zh ? '确定' : 'OK' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoRenameModal;
