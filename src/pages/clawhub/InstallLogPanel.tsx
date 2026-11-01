/**
 * InstallLogPanel — 安装日志终端风格面板（2026-06，FR-02）。
 *
 * 挂在页面右下角：SSE install-log 实时滚动渲染（stderr 红），
 * 完成 → 绿提示（父级触发 detect/refresh）；失败/取消 → 红提示 + 重试 + 复制命令。
 */
import { useEffect, useRef } from 'react';
import { Check, Copy, Loader2, RotateCcw, X } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import { cancelInstall } from '../../api/clawhub';

export interface InstallLogLine {
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface InstallLogPanelProps {
  installId: string;
  cliId: string;
  command: string;
  lines: InstallLogLine[];
  /** running | done | error | canceled。 */
  status: 'running' | 'done' | 'error' | 'canceled';
  errorMessage?: string;
  onClose: () => void;
  onRetry: () => void;
  onCopyCmd: () => void;
}

export function InstallLogPanel({
  installId,
  cliId,
  command,
  lines,
  status,
  errorMessage,
  onClose,
  onRetry,
  onCopyCmd,
}: InstallLogPanelProps) {
  const { t } = useI18n();
  const logRef = useRef<HTMLDivElement | null>(null);

  // 新日志行 → 自动滚底
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <div className="claw-install-panel" data-testid="install-log-panel" role="dialog" aria-label={`${cliId} 安装日志`}>
      <div className="claw-install-head">
        {status === 'running' ? (
          <Loader2 size={13} strokeWidth={2} className="neo-cp-spin" aria-hidden />
        ) : status === 'done' ? (
          <Check size={13} strokeWidth={2.5} color="#0E9F6E" aria-hidden />
        ) : (
          <X size={13} strokeWidth={2.5} color="#DC2626" aria-hidden />
        )}
        <span>
          {t('clawhub.install.title', { defaultValue: '正在安装' })} {cliId}
        </span>
        <span className="claw-install-cmd" title={command}>
          $ {command}
        </span>
        {status === 'running' && (
          <button
            type="button"
            className="claw-btn"
            onClick={() => void cancelInstall(installId)}
            data-testid="install-cancel"
          >
            {t('clawhub.install.cancel', { defaultValue: '取消' })}
          </button>
        )}
        <button
          type="button"
          className="neo-icon-btn"
          onClick={onClose}
          aria-label={t('common.close', { defaultValue: '关闭' })}
          data-testid="install-close"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="claw-install-log" ref={logRef} data-testid="install-log-body">
        {lines.length === 0 ? (
          <div className="claw-install-log-empty">
            {t('clawhub.install.waiting', { defaultValue: '等待安装输出…' })}
          </div>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className={l.stream === 'stderr' ? 'claw-install-log-line--stderr' : undefined}
            >
              {l.line}
            </div>
          ))
        )}
        {status === 'running' && (
          <div className="claw-install-log-empty">▌</div>
        )}
      </div>

      <div className="claw-install-foot">
        <span
          className={`claw-install-msg ${
            status === 'done' ? 'claw-install-msg--ok' : status === 'error' || status === 'canceled' ? 'claw-install-msg--err' : ''
          }`}
          data-testid="install-status-msg"
        >
          {status === 'running' && t('clawhub.install.running', { defaultValue: '安装进行中…' })}
          {status === 'done' &&
            t('clawhub.install.done', { defaultValue: '安装成功，状态已刷新' })}
          {status === 'canceled' && t('clawhub.install.canceled', { defaultValue: '安装已取消' })}
          {status === 'error' &&
            (errorMessage ?? t('clawhub.install.failed', { defaultValue: '安装失败' }))}
        </span>
        {(status === 'error' || status === 'canceled') && (
          <>
            <button
              type="button"
              className="claw-btn claw-btn--primary"
              onClick={onRetry}
              data-testid="install-retry"
            >
              <RotateCcw size={11} strokeWidth={2.2} aria-hidden />
              {t('clawhub.install.retry', { defaultValue: '重试' })}
            </button>
            <button type="button" className="claw-btn" onClick={onCopyCmd}>
              <Copy size={11} strokeWidth={2.2} aria-hidden />
              {t('clawhub.action.copyCmd', { defaultValue: '复制命令' })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default InstallLogPanel;
