/**
 * CliDetailDrawer — 本地 CLI 详情抽屉（ClawHub 能力并入设置分区）。
 *
 * 点卡片打开：名称 / 版本 / 路径 / 命令 / 可安装或仅复制命令 / 官网链接。
 * - 未安装且可安装 → 「安装」
 * - 未安装且 copy-only → 只给复制命令 + 提示
 * - 已安装且可卸载 → 「卸载」
 * - 已安装且不可卸载 → 复制手动卸载引导
 * 文案全部来自 `content/clawhub.ts`。
 */
import { useEffect, useState } from 'react';
import { CLAWHUB_COPY } from '@/shared/content/clawhub';
import type { CliProbe } from '@/shared/data/types';
import { IconClose, IconCopy, IconLink } from '@/shared/ui/icons';

const C = CLAWHUB_COPY;

export function CliDetailDrawer({
  item,
  onClose,
  onInstall,
  onUninstall,
}: {
  item: CliProbe | null;
  onClose: () => void;
  onInstall: (item: CliProbe) => void;
  onUninstall: (item: CliProbe) => void;
}) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setNote(null);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const copy = (text: string) => {
    if (!text) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setNote(C.copied))
      .catch(() => setNote(C.copyFailed));
  };

  const installed = item.installed;
  const installable = !!item.installable;
  const uninstallable = !!item.uninstallable;
  const installCmd = item.installCmd ?? '';
  const uninstallCmd = item.uninstallCmd ?? '';

  return (
    <div className="st-cli-drawer-mask" onClick={onClose}>
      <div
        className="st-cli-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} ${C.detailTitle}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="st-cli-drawer-head">
          <b>{item.name}</b>
          <span className="st-cli-tag" data-tone={installed ? 'ok' : 'mute'}>
            {installed ? C.statusInstalled : C.statusMissing}
          </span>
          <span
            className="st-cli-drawer-tag"
            data-installable={(installed ? uninstallable : installable) ? 'true' : 'false'}
          >
            {installed ? (uninstallable ? C.uninstallable : C.copyOnly) : installable ? C.installable : C.copyOnly}
          </span>
          <button
            type="button"
            className="st-cli-drawer-x"
            onClick={onClose}
            aria-label={C.close}
            title={C.close}
          >
            <IconClose size={15} />
          </button>
        </header>

        <div className="st-cli-drawer-body">
          <div className="st-cli-drawer-row">
            <span>{C.versionLabel}</span>
            <b>{item.version || C.unknownValue}</b>
          </div>
          <div className="st-cli-drawer-row">
            <span>{C.pathLabel}</span>
            <b title={item.path}>{item.path || C.unknownValue}</b>
          </div>
          {installCmd ? (
            <div className="st-cli-drawer-row st-cli-drawer-row--cmd">
              <span>{C.commandLabel}</span>
              <code>{installCmd}</code>
              <button
                type="button"
                className="st-cli-drawer-icon"
                onClick={() => copy(installCmd)}
                aria-label={C.copyCommand}
                title={C.copyCommand}
              >
                <IconCopy size={13} />
              </button>
            </div>
          ) : null}
          {installed && !uninstallable && uninstallCmd ? (
            <p className="st-cli-drawer-hint">{C.copyOnlyUninstallHint}</p>
          ) : null}
          {!installed && !installable && installCmd ? (
            <p className="st-cli-drawer-hint">{C.copyOnlyHint}</p>
          ) : null}
          {item.homepage ? (
            <a
              className="st-cli-drawer-link"
              href={item.homepage}
              target="_blank"
              rel="noreferrer"
            >
              <IconLink size={12} />
              {C.viewDocs}
            </a>
          ) : null}
        </div>

        <footer className="st-cli-drawer-foot">
          {note ? <span className="st-cli-drawer-note">{note}</span> : null}
          {installed ? (
            uninstallable ? (
              <button type="button" className="st-btn st-btn--danger" onClick={() => onUninstall(item)}>
                {C.uninstall}
              </button>
            ) : (
              <button
                type="button"
                className="st-btn"
                onClick={() => copy(uninstallCmd)}
                disabled={!uninstallCmd}
              >
                <IconCopy size={12} />
                {C.copyCommand}
              </button>
            )
          ) : installable ? (
            <button type="button" className="st-btn st-btn--solid" onClick={() => onInstall(item)}>
              {C.install}
            </button>
          ) : (
            <button
              type="button"
              className="st-btn"
              onClick={() => copy(installCmd)}
              disabled={!installCmd}
            >
              <IconCopy size={12} />
              {C.copyCommand}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
