/**
 * ClawHubPage — Claw 集合平台目录页（2026-06，FR-01/02/09）。
 *
 *  - 数据源唯一：GET /api/cli/detect（+ /refresh 重扫），不建平行列表
 *  - 顶部：标题 + 搜索 + 状态/流式格式筛选 + 重新扫描按钮
 *  - 主体：Claw 卡片网格（is_claw 置顶高亮；已装在前）
 *  - 安装流：startInstall → subscribeInstallStream（SSE 日志）→ done 后
 *    refreshCliDetection 刷新状态徽章
 *  - copy-only 条目：复制命令 + 官网链接（详情抽屉内）
 *  - 「对话」→ 跳回主页并把 Claw 设为聊天 target（localStorage 桥接，
 *    NeoApp 装载时消费 —— 见 StartGallery Claw 分区同款通路）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PawPrint, RefreshCw, Search } from 'lucide-react';
import { useI18n } from '../../common/i18n';
import { listDetectedClis, refreshCliDetection, type DetectedCli } from '../../api/cli';
import {
  ClawhubApiError,
  startInstall,
  startUninstall,
  subscribeInstallStream,
  type InstallStreamHandle,
} from '../../api/clawhub';
import { CLAW_CATEGORIES } from '../../config/clawhub';
import { ClawCard } from './ClawCard';
import { ClawDetailDrawer } from './ClawDetailDrawer';
import { InstallLogPanel, type InstallLogLine } from './InstallLogPanel';
import { NeoConfirmModal } from '../../neo/NeoConfirmModal';
import './clawhub.css';

type StatusFilter = 'all' | 'installed' | 'missing';
type FormatFilter = 'all' | 'plain-line' | 'claude-stream-json' | 'codex-stream-json' | 'gh-copilot' | 'cursor-acp';

interface InstallState {
  installId: string;
  cliId: string;
  command: string;
  status: 'running' | 'done' | 'error' | 'canceled';
  lines: InstallLogLine[];
  errorMessage?: string;
}

/** Claw 对话入口桥：写 localStorage，NeoApp/StartGallery 装载时消费。 */
const CLAW_TARGET_KEY = 'sf.claw-target';

export function ClawHubPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [snapshot, setSnapshot] = useState<{ scanned_at: string; items: DetectedCli[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rescanning, setRescanning] = useState(false);
  const [detail, setDetail] = useState<DetectedCli | null>(null);
  const [install, setInstall] = useState<InstallState | null>(null);
  const streamRef = useRef<InstallStreamHandle | null>(null);

  // ── 2026-11-04 用户反馈批：原生弹窗替换 ─────────────────────────────────
  // window.confirm（卸载确认）→ NeoConfirmModal；window.alert（复制成功/
  // copy-only 引导/失败提示）→ 应用内 toast（底部居中，auto-dismiss）。
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 卸载二次确认弹窗目标（NeoConfirmModal，2026-11-04 替换 window.confirm）。 */
  const [uninstallTarget, setUninstallTarget] = useState<DetectedCli | null>(null);
  const [uninstallBusy, setUninstallBusy] = useState(false);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  /** 复制命令：成功 toast「已复制」，clipboard 不可用回退展示命令本体。 */
  const copyCmd = useCallback(
    (item: DetectedCli) => {
      const cmd = item.install_cmd;
      void navigator.clipboard
        ?.writeText(cmd)
        .then(() => showToast(t('clawhub.copyDone', { defaultValue: `已复制：${cmd}` })))
        .catch(() => showToast(cmd));
    },
    [t, showToast],
  );

  const load = useCallback((force = false) => {
    const p = force ? refreshCliDetection() : listDetectedClis();
    return p
      .then((snap) => {
        setSnapshot(snap);
        setLoadError(null);
      })
      .catch((err: Error) => {
        setLoadError(
          t('clawhub.loadError', {
            defaultValue: `加载 Claw 目录失败：${err.message}（请确认后端 :8002 在运行）`,
          }),
        );
      });
  }, [t]);

  useEffect(() => {
    void load();
    return () => {
      streamRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 排序：is_claw 优先 → 已安装优先 → id 字典序。 */
  const sorted = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.items].sort((a, b) => {
      if (!!b.is_claw !== !!a.is_claw) return a.is_claw ? -1 : 1;
      if (!!b.installed !== !!a.installed) return a.installed ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }, [snapshot]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((it) => {
      if (q && !(it.id.toLowerCase().includes(q) || (it.description ?? '').toLowerCase().includes(q))) {
        return false;
      }
      if (statusFilter === 'installed' && !it.installed) return false;
      if (statusFilter === 'missing' && it.installed) return false;
      if (formatFilter !== 'all' && it.stream_format !== formatFilter) return false;
      if (categoryFilter !== 'all' && (it.category ?? 'other') !== categoryFilter) return false;
      return true;
    });
  }, [sorted, query, statusFilter, formatFilter, categoryFilter]);

  /** 发起安装：POST 建会话 → 挂 SSE 日志面板。 */
  const beginInstall = useCallback(
    async (item: DetectedCli) => {
      if (install?.status === 'running') return; // 单面板：一次装一个
      streamRef.current?.close();
      try {
        const resp = await startInstall(item.id);
        setInstall({
          installId: resp.install_id,
          cliId: resp.cli_id,
          command: resp.command,
          status: 'running',
          lines: [],
        });
        streamRef.current = subscribeInstallStream(resp.install_id, {
          onLog: (d) => {
            setInstall((prev) =>
              prev ? { ...prev, lines: [...prev.lines.slice(-400), d] } : prev,
            );
          },
          onDone: () => {
            setInstall((prev) => (prev ? { ...prev, status: 'done' } : prev));
            // 成功 → 强制重扫刷新状态徽章（FR-02 AC3）
            void load(true);
          },
          onError: (d) => {
            setInstall((prev) =>
              prev
                ? {
                    ...prev,
                    status: d.code === 'INSTALL_CANCELED' ? 'canceled' : 'error',
                    errorMessage: d.stderr_tail
                      ? `${d.message}\n${d.stderr_tail.slice(-600)}`
                      : d.message,
                  }
                : prev,
            );
          },
        });
      } catch (err) {
        if (err instanceof ClawhubApiError && err.status === 422) {
          showToast(
            t('clawhub.install.copyOnly', {
              defaultValue: `该 Claw 的安装命令无法自动执行，请复制后在终端运行：${item.install_cmd}`,
            }),
          );
          return;
        }
        showToast(
          err instanceof Error
            ? err.message
            : t('clawhub.install.startFailed', { defaultValue: '发起安装失败' }),
        );
      }
    },
    [install, load, t, showToast],
  );

  /** 跳转主页与该 Claw 对话（写入 claw target 桥 → navigate('/')）。
   *  内嵌模式（2026-10-30）：仍走 '/' 路由 —— NeoApp 装载时消费 claw target
   *  桥，中栏切回聊天态；左栏不变。 */
  const chatWith = useCallback(
    (item: DetectedCli) => {
      try {
        localStorage.setItem(
          CLAW_TARGET_KEY,
          JSON.stringify({ cliId: item.id, name: item.id, at: Date.now() }),
        );
      } catch {
        /* localStorage 不可用 → 直接跳转，用户在主页 Claw 分区手选 */
      }
      navigate('/');
    },
    [navigate],
  );

  /**
   * 发起卸载（2026-10-30 生命周期闭环）：
   *  - 二次确认（卸载影响系统全局，必弹；2026-11-04 起 NeoConfirmModal 应用内
   *    弹窗，不再走 window.confirm 原生框）
   *  - uninstallable → startUninstall 真执行，复用安装日志面板（SSE 同源）
   *  - copy-only → 422，toast 引导（message 含 uninstall_cmd），已自动复制
   */
  const beginUninstall = useCallback(
    (item: DetectedCli) => {
      if (install?.status === 'running') return; // 与安装共用单面板
      setUninstallTarget(item);
    },
    [install],
  );

  const confirmUninstall = useCallback(async () => {
    const item = uninstallTarget;
    if (!item) return;
    setUninstallBusy(true);
    streamRef.current?.close();
    try {
      const resp = await startUninstall(item.id);
      setInstall({
        installId: resp.install_id,
        cliId: resp.cli_id,
        command: resp.command,
        status: 'running',
        lines: [],
      });
      setUninstallTarget(null);
      streamRef.current = subscribeInstallStream(resp.install_id, {
        onLog: (d) => {
          setInstall((prev) =>
            prev ? { ...prev, lines: [...prev.lines.slice(-400), d] } : prev,
          );
        },
        onDone: () => {
          setInstall((prev) => (prev ? { ...prev, status: 'done' } : prev));
          // 卸载成功 → 强制重扫刷新状态徽章。
          void load(true);
        },
        onError: (d) => {
          setInstall((prev) =>
            prev
              ? {
                  ...prev,
                  status: d.code === 'INSTALL_CANCELED' ? 'canceled' : 'error',
                  errorMessage: d.stderr_tail
                    ? `${d.message}\n${d.stderr_tail.slice(-600)}`
                    : d.message,
                }
              : prev,
          );
        },
      });
    } catch (err) {
      if (err instanceof ClawhubApiError && err.status === 422) {
        // copy-only：复制手动卸载命令并 toast 引导。
        const manual = item.uninstall_cmd ?? err.message;
        try {
          void navigator.clipboard?.writeText(manual);
        } catch {
          /* clipboard 不可用 → 仅 toast 展示 */
        }
        showToast(
          t('clawhub.uninstall.copyOnly', {
            defaultValue: `该 Claw 需手动卸载（已复制引导命令）：\n${manual}`,
          }),
        );
        setUninstallTarget(null);
        return;
      }
      showToast(
        err instanceof Error
          ? err.message
          : t('clawhub.uninstall.startFailed', { defaultValue: '发起卸载失败' }),
      );
    } finally {
      setUninstallBusy(false);
    }
  }, [uninstallTarget, load, t, showToast]);

  const handleRescan = useCallback(() => {
    if (rescanning) return;
    setRescanning(true);
    load(true).finally(() => setRescanning(false));
  }, [rescanning, load]);

  const installedCount = snapshot?.items.filter((i) => i.installed).length ?? 0;

  return (
    <div
      className={`clawhub-page${embedded ? ' clawhub-page--embedded' : ''}`}
      data-testid="clawhub-page"
    >
      <div className="clawhub-topbar">
        <span className="clawhub-title">
          <PawPrint size={17} strokeWidth={2} aria-hidden />
          {t('clawhub.title', { defaultValue: 'ClawHub' })}
        </span>
        <span className="clawhub-subtitle">
          {t('clawhub.subtitle', {
            defaultValue: 'Claw 集合平台 — 浏览、安装、对话你的 AI 助手 CLI',
          })}
        </span>
        <span className="clawhub-topbar-spacer" />
        <span className="clawhub-subtitle" data-testid="clawhub-scan-info">
          {snapshot
            ? t('clawhub.scanInfo', {
                defaultValue: `已装 ${installedCount}/${snapshot.items.length} · 扫描于 ${new Date(
                  snapshot.scanned_at,
                ).toLocaleTimeString()}`,
              })
            : ''}
        </span>
      </div>

      <div className="clawhub-filters">
        <div className="clawhub-search">
          <Search size={13} strokeWidth={2} aria-hidden />
          <input
            className="clawhub-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('clawhub.searchPlaceholder', { defaultValue: '搜索 Claw 名称/简介…' })}
            data-testid="clawhub-search"
          />
        </div>
        <select
          className="clawhub-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          data-testid="clawhub-filter-status"
        >
          <option value="all">{t('clawhub.filter.all', { defaultValue: '全部状态' })}</option>
          <option value="installed">{t('clawhub.filter.installed', { defaultValue: '已安装' })}</option>
          <option value="missing">{t('clawhub.filter.missing', { defaultValue: '未安装' })}</option>
        </select>
        <select
          className="clawhub-filter-select"
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}
          data-testid="clawhub-filter-format"
        >
          <option value="all">{t('clawhub.filter.allFormats', { defaultValue: '全部格式' })}</option>
          <option value="plain-line">plain-line</option>
          <option value="claude-stream-json">claude-stream-json</option>
          <option value="codex-stream-json">codex-stream-json</option>
          <option value="gh-copilot">gh-copilot</option>
          <option value="cursor-acp">cursor-acp</option>
        </select>
        <select
          className="clawhub-filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          data-testid="clawhub-filter-category"
        >
          <option value="all">{t('clawhub.filter.allCategories', { defaultValue: '全部分类' })}</option>
          {CLAW_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="clawhub-rescan"
          onClick={handleRescan}
          disabled={rescanning}
          data-testid="clawhub-rescan"
        >
          <RefreshCw size={12} strokeWidth={2} className={rescanning ? 'neo-cp-spin' : undefined} aria-hidden />
          {rescanning
            ? t('clawhub.rescanning', { defaultValue: '重扫中…' })
            : t('clawhub.rescan', { defaultValue: '重新扫描' })}
        </button>
        <span className="clawhub-count" data-testid="clawhub-count">
          {filtered.length} / {sorted.length}
        </span>
      </div>

      <div className="clawhub-scroll">
        {loadError && (
          <div className="neo-modal-error" role="alert" data-testid="clawhub-load-error">
            {loadError}
          </div>
        )}
        {!loadError && !snapshot && (
          <div className="neo-list-note">{t('common.loading', { defaultValue: '加载中…' })}</div>
        )}
        {snapshot && filtered.length === 0 && (
          <div className="neo-list-note">
            {t('clawhub.empty', { defaultValue: '没有匹配的 Claw（调整筛选条件试试）' })}
          </div>
        )}
        <div className="clawhub-grid">
          {filtered.map((item) => (
            <ClawCard
              key={item.id}
              item={item}
              installing={install?.status === 'running' && install.cliId === item.id}
              uninstalling={
                install?.status === 'running' &&
                install.cliId === item.id &&
                install.installId.startsWith('uninst-')
              }
              onInstall={(it) => void beginInstall(it)}
              onCopyCmd={copyCmd}
              onChat={chatWith}
              onDetail={setDetail}
              onUninstall={(it) => beginUninstall(it)}
            />
          ))}
        </div>
      </div>

      <ClawDetailDrawer item={detail} onClose={() => setDetail(null)} onCopyCmd={copyCmd} />

      {/* 卸载二次确认弹窗（2026-11-04 用户反馈批，替换 window.confirm 原生框） */}
      {uninstallTarget && (
        <NeoConfirmModal
          title={t('clawhub.uninstall.title', { defaultValue: '卸载 Claw' })}
          message={t('clawhub.uninstall.confirm', {
            defaultValue: `确定卸载 ${uninstallTarget.id}？卸载后该 Claw 将无法在平台使用（可随时重新安装）。`,
          })}
          confirmLabel={t('clawhub.uninstall.confirmBtn', { defaultValue: '卸载' })}
          busy={uninstallBusy}
          onConfirm={() => void confirmUninstall()}
          onClose={() => {
            if (uninstallBusy) return;
            setUninstallTarget(null);
          }}
        />
      )}

      {/* 应用内 toast（2026-11-04 用户反馈批，替换 window.alert 原生框） */}
      {toast && (
        <div
          role="status"
          data-testid="clawhub-toast"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'min(520px, calc(100vw - 48px))',
            padding: '8px 14px',
            borderRadius: 10,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            color: 'var(--t-fg-2)',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
            wordBreak: 'break-all',
            boxShadow: '0 1px 2px rgba(15,23,42,0.05), 0 8px 24px -8px rgba(15,23,42,0.16)',
            zIndex: 10001,
          }}
        >
          {toast}
        </div>
      )}

      {install && (
        <InstallLogPanel
          installId={install.installId}
          cliId={install.cliId}
          command={install.command}
          lines={install.lines}
          status={install.status}
          errorMessage={install.errorMessage}
          onClose={() => {
            streamRef.current?.close();
            setInstall(null);
          }}
          onRetry={() => {
            const cliId = install.cliId;
            const item = snapshot?.items.find((i) => i.id === cliId);
            streamRef.current?.close();
            setInstall(null);
            if (item) void beginInstall(item);
          }}
          onCopyCmd={() => {
            try {
              void navigator.clipboard?.writeText(install.command);
            } catch {
              /* ignore */
            }
          }}
        />
      )}
    </div>
  );
}

export default ClawHubPage;
