/**
 * ClawCard — ClawHub 目录卡片（2026-06，FR-01/02）。
 *
 * 品牌色块 + 名称 + 简介 + 状态徽章 + 操作行（安装/复制命令/对话/详情）。
 * is_claw 条目加高亮描边 + Claw chip。
 */
import { memo } from 'react';
import { Check, Download, MessageSquare, PawPrint, Search, Trash2 } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import type { DetectedCli } from '../../api/cli';
import { clawCategoryLabel, resolveClawMeta } from '../../config/clawhub';
import { BrandGlyph } from '../../common/icons/brandIcons';

export interface ClawCardProps {
  item: DetectedCli;
  /** 该条目是否正在安装中（显示安装态）。 */
  installing?: boolean;
  /** 该条目是否正在卸载中（显示卸载态，2026-10-30）。 */
  uninstalling?: boolean;
  onInstall: (item: DetectedCli) => void;
  onCopyCmd: (item: DetectedCli) => void;
  onChat: (item: DetectedCli) => void;
  onDetail: (item: DetectedCli) => void;
  /** 卸载入口（2026-10-30 生命周期闭环）。 */
  onUninstall: (item: DetectedCli) => void;
}

export const ClawCard = memo(function ClawCard({
  item,
  installing = false,
  uninstalling = false,
  onInstall,
  onCopyCmd,
  onChat,
  onDetail,
  onUninstall,
}: ClawCardProps) {
  const { t } = useI18n();
  const brand = resolveClawMeta(item.id);

  return (
    <div
      className={`claw-card${item.is_claw ? ' is-claw' : ''}`}
      data-testid={`claw-card-${item.id}`}
    >
      <div className="claw-card-head">
        <span
          className="claw-brand-badge"
          style={{
            background: `color-mix(in oklab, ${brand.tint} 16%, var(--t-panel))`,
            color: brand.tint,
          }}
          aria-hidden
        >
          {BrandGlyph({ brandId: item.id, size: 16 }) ?? brand.monogram}
        </span>
        {/* 2026-11-06 优化：状态徽章移至 meta 行——原先在标题右侧，长 id
            （gh-copilot 等）被挤成省略号、错误串版本把头部撑爆。标题行
            现在独占整行宽度。 */}
        <div className="claw-card-title-wrap">
          <span className="claw-card-title" title={item.id}>
            {item.id}
            {item.is_claw && (
              <span className="claw-chip claw-chip--claw">
                <PawPrint size={9} strokeWidth={2.2} aria-hidden />
                Claw
              </span>
            )}
          </span>
          <span className="claw-card-desc" title={item.description ?? ''}>
            {item.description ?? item.install_cmd}
          </span>
        </div>
      </div>

      <div className="claw-card-meta">
        <span
          className={item.installed && item.env_set ? 'claw-status claw-status--installed' : item.installed ? 'claw-status claw-status--env' : 'claw-status claw-status--missing'}
          data-testid={`claw-status-${item.id}`}
        >
          {item.installed ? (
            item.env_set ? (
              <>
                <Check size={10} strokeWidth={2.5} aria-hidden />
                {t('clawhub.status.installed', { defaultValue: '已安装' })}
              </>
            ) : (
              t('clawhub.status.envMissing', { defaultValue: '缺环境变量' })
            )
          ) : (
            t('clawhub.status.notInstalled', { defaultValue: '未安装' })
          )}
        </span>
        {/* 版本串可能很长（错误信息/完整 binary 标识）→ 限宽省略，title 悬浮看全 */}
        {item.installed && item.version && (
          <span className="claw-version" title={item.version}>
            {item.version.slice(0, 32)}
          </span>
        )}
        <span className="claw-chip">{clawCategoryLabel(item.category)}</span>
        <span className="claw-chip">{item.stream_format}</span>
        {item.needs_env && <span className="claw-chip">env: {item.needs_env}</span>}
      </div>

      <div className="claw-card-actions">
        {item.installed ? (
          <>
            <button
              type="button"
              className="claw-btn claw-btn--primary"
              onClick={() => onChat(item)}
              data-testid={`claw-chat-${item.id}`}
            >
              <MessageSquare size={12} strokeWidth={2} aria-hidden />
              {t('clawhub.action.chat', { defaultValue: '对话' })}
            </button>
            {/* 2026-10-30 生命周期闭环：已安装 → 卸载入口。可自动卸载真执行；
                copy-only（uninstall_cmd）时 onUninstall 内部复制引导命令。 */}
            <button
              type="button"
              className="claw-btn claw-btn--danger"
              disabled={uninstalling}
              onClick={() => onUninstall(item)}
              data-testid={`claw-uninstall-${item.id}`}
              title={
                item.uninstallable
                  ? t('clawhub.action.uninstallHint', { defaultValue: '卸载此 Claw' })
                  : item.uninstall_cmd ?? undefined
              }
            >
              <Trash2 size={12} strokeWidth={2} aria-hidden />
              {uninstalling
                ? t('clawhub.action.uninstalling', { defaultValue: '卸载中…' })
                : t('clawhub.action.uninstall', { defaultValue: '卸载' })}
            </button>
          </>
        ) : item.installable ? (
          <button
            type="button"
            className="claw-btn claw-btn--primary"
            disabled={installing}
            onClick={() => onInstall(item)}
            data-testid={`claw-install-${item.id}`}
          >
            <Download size={12} strokeWidth={2} aria-hidden />
            {installing
              ? t('clawhub.action.installing', { defaultValue: '安装中…' })
              : t('clawhub.action.install', { defaultValue: '安装' })}
          </button>
        ) : (
          <button
            type="button"
            className="claw-btn"
            onClick={() => onCopyCmd(item)}
            data-testid={`claw-copy-${item.id}`}
            title={t('clawhub.action.copyHint', { defaultValue: '复制安装命令' })}
          >
            {t('clawhub.action.copyCmd', { defaultValue: '复制命令' })}
          </button>
        )}
        <button
          type="button"
          className="claw-btn claw-btn--ghost"
          onClick={() => onDetail(item)}
          data-testid={`claw-detail-${item.id}`}
        >
          <Search size={12} strokeWidth={2} aria-hidden />
          {t('clawhub.action.detail', { defaultValue: '详情' })}
        </button>
      </div>
    </div>
  );
});

export default ClawCard;
