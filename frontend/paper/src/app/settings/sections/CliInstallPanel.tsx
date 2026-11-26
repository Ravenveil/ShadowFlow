/**
 * CliInstallPanel — ClawHub 安装 / 卸载日志面板（内联在本地 CLI 分区里，
 * 不遮挡筛选与搜索）。
 *
 * 逐行渲染 SSE install-log（stderr 标红），新行自动滚到底；运行中可取消，
 * 终态展示完成 / 失败 / 已取消，失败可重试或复制命令。
 * 文案全部来自 `content/clawhub.ts`。
 */
import { useEffect, useRef } from 'react';
import { CLAWHUB_COPY } from '@/shared/content/clawhub';
import { cancelInstall, type InstallLogLine } from '@/shared/data/http/clawhub';
import { IconAlert, IconCheckCircle, IconClose, IconCopy, IconLoader, IconRefresh } from '@/shared/ui/icons';

const C = CLAWHUB_COPY;

export type CliInstallStatus = 'running' | 'done' | 'error' | 'canceled';

/** 一次安装 / 卸载会话在界面上的完整状态。 */
export interface CliInstallView {
  installId: string;
  cliId: string;
  cliName: string;
  command: string;
  kind: 'install' | 'uninstall';
  status: CliInstallStatus;
  lines: InstallLogLine[];
  errorMessage?: string;
}

export function CliInstallPanel({
  state,
  onClose,
  onRetry,
}: {
  state: CliInstallView;
  onClose: () => void;
  onRetry: () => void;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.lines.length, state.status]);

  const running = state.status === 'running';
  const failed = state.status === 'error' || state.status === 'canceled';
  const title = state.kind === 'uninstall' ? C.uninstallLogTitle : C.logTitle;

  const statusText = running
    ? state.kind === 'uninstall'
      ? C.uninstalling
      : C.installing
    : state.status === 'done'
      ? state.kind === 'uninstall'
        ? C.uninstallDone
        : C.installDone
      : state.status === 'canceled'
        ? C.canceled
        : state.errorMessage || (state.kind === 'uninstall' ? C.uninstallFailed : C.installFailed);

  return (
    <div className="st-cli-install" role="dialog" aria-label={`${state.cliName} ${title}`}>
      <header className="st-cli-install-head">
        <span className="st-cli-install-ico" data-tone={running ? 'run' : state.status === 'done' ? 'ok' : 'danger'}>
          {running ? (
            <IconLoader size={13} className="st-spin" />
          ) : state.status === 'done' ? (
            <IconCheckCircle size={13} />
          ) : (
            <IconAlert size={13} />
          )}
        </span>
        <b>{title}</b>
        <span className="st-cli-install-name">{state.cliName}</span>
        <code className="st-cli-install-cmd" title={state.command}>
          $ {state.command}
        </code>
        {running ? (
          <button type="button" className="st-cli-install-btn" onClick={() => void cancelInstall(state.installId)}>
            {C.cancel}
          </button>
        ) : null}
        <button
          type="button"
          className="st-cli-drawer-x"
          onClick={onClose}
          aria-label={C.close}
          title={C.close}
        >
          <IconClose size={14} />
        </button>
      </header>

      <div className="st-cli-install-log" ref={logRef}>
        {state.lines.length === 0 ? (
          <div className="st-cli-install-empty">{C.waiting}</div>
        ) : (
          state.lines.map((line, i) => (
            <div key={i} data-stream={line.stream}>
              {line.line}
            </div>
          ))
        )}
        {running ? <div className="st-cli-install-caret">▌</div> : null}
      </div>

      <footer className="st-cli-install-foot">
        <span className="st-cli-install-msg" data-tone={state.status === 'done' ? 'ok' : failed ? 'danger' : 'run'}>
          {statusText}
        </span>
        {failed ? (
          <>
            <button type="button" className="st-cli-install-btn" onClick={onRetry}>
              <IconRefresh size={11} />
              {C.retry}
            </button>
            <button
              type="button"
              className="st-cli-install-btn"
              onClick={() => void navigator.clipboard?.writeText(state.command)}
            >
              <IconCopy size={11} />
              {C.copyCommand}
            </button>
          </>
        ) : null}
      </footer>
    </div>
  );
}
