/**
 * ClawDetailDrawer — Claw 详情抽屉（2026-06，FR-08）。
 *
 * 展示：版本（探测值）、binary/路径、auth_hint、能力 flags（capabilities）、
 * 安装命令（+复制）、流式格式、fallback 模型、官网链接、installable 说明。
 */
import { useEffect } from 'react';
import { Check, Copy, ExternalLink, X } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import type { DetectedCli } from '../../api/cli';
import { clawCategoryLabel } from '../../config/clawhub';

export interface ClawDetailDrawerProps {
  item: DetectedCli | null;
  onClose: () => void;
  onCopyCmd: (item: DetectedCli) => void;
}

export function ClawDetailDrawer({ item, onClose, onCopyCmd }: ClawDetailDrawerProps) {
  const { t } = useI18n();

  // Esc 关闭
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const caps = Object.entries(item.capabilities ?? {});

  return (
    <div className="claw-drawer-mask" onClick={onClose} data-testid="claw-detail-drawer">
      <div
        className="claw-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.id} 详情`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="claw-drawer-head">
          <span className="claw-drawer-title">{item.id}</span>
          {item.installed && (
            <span className="claw-status claw-status--installed">
              {t('clawhub.status.installed', { defaultValue: '已安装' })}
            </span>
          )}
          <button
            type="button"
            className="neo-icon-btn"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: '关闭' })}
            data-testid="claw-detail-close"
          >
            <X size={15} strokeWidth={1.9} aria-hidden />
          </button>
        </div>

        <div className="claw-drawer-body">
          <div className="claw-drawer-section">
            <span className="claw-drawer-label">
              {t('clawhub.detail.version', { defaultValue: '版本' })}
            </span>
            <span className="claw-drawer-value">
              {item.version ?? t('clawhub.detail.unknown', { defaultValue: '（未探测到）' })}
            </span>
          </div>

          <div className="claw-drawer-section">
            <span className="claw-drawer-label">
              {t('clawhub.detail.binary', { defaultValue: '可执行文件' })}
            </span>
            <span className="claw-drawer-value">{item.path ?? `（PATH 上的 ${item.id}）`}</span>
          </div>

          <div className="claw-drawer-section">
            <span className="claw-drawer-label">
              {t('clawhub.detail.installCmd', { defaultValue: '安装命令' })}
            </span>
            <div className="claw-drawer-cmd">
              <span className="claw-drawer-cmd-text">{item.install_cmd}</span>
              <button
                type="button"
                className="neo-icon-btn"
                onClick={() => onCopyCmd(item)}
                aria-label={t('clawhub.action.copyHint', { defaultValue: '复制安装命令' })}
                data-testid="claw-detail-copy"
              >
                <Copy size={12} strokeWidth={2} aria-hidden />
              </button>
            </div>
            {!item.installable && !item.installed && (
              <span className="claw-copyonly-hint">
                {t('clawhub.detail.copyOnlyHint', {
                  defaultValue: '该安装命令无法自动执行，请复制后在终端运行（或访问官网）。',
                })}
              </span>
            )}
          </div>

          <div className="claw-drawer-section">
            <span className="claw-drawer-label">
              {t('clawhub.detail.auth', { defaultValue: '认证提示' })}
            </span>
            <span className="claw-drawer-value">{item.auth_hint ?? '—'}</span>
          </div>

          {caps.length > 0 && (
            <div className="claw-drawer-section">
              <span className="claw-drawer-label">
                {t('clawhub.detail.capabilities', { defaultValue: '能力 flags' })}
              </span>
              <div className="claw-cap-grid">
                {caps.map(([flag, ok]) => (
                  <span key={flag} className="claw-cap-item">
                    {ok ? (
                      <Check size={11} strokeWidth={2.5} className="on" aria-hidden />
                    ) : (
                      <X size={11} strokeWidth={2.5} className="off" aria-hidden />
                    )}
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(item.fallback_models?.length ?? 0) > 0 && (
            <div className="claw-drawer-section">
              <span className="claw-drawer-label">
                {t('clawhub.detail.models', { defaultValue: '默认模型' })}
              </span>
              <div className="claw-cap-grid">
                {item.fallback_models?.map((m) => (
                  <span key={m} className="claw-cap-item">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="claw-drawer-section">
            <span className="claw-drawer-label">
              {t('clawhub.detail.misc', { defaultValue: '其他' })}
            </span>
            <span className="claw-drawer-value">
              {t('clawhub.detail.streamFormat', { defaultValue: '流式格式' })}: {item.stream_format}
              {' · '}
              {t('clawhub.detail.category', { defaultValue: '分类' })}: {clawCategoryLabel(item.category)}
            </span>
            {item.homepage && (
              <a
                className="claw-btn claw-btn--ghost"
                href={item.homepage}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={12} strokeWidth={2} aria-hidden />
                {t('clawhub.detail.homepage', { defaultValue: '官网' })}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClawDetailDrawer;
