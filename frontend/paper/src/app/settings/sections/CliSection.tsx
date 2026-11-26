/**
 * 本地 CLI——搬 legacy LocalCLISection（Variant E）的卡片墙形态：
 *   全 22 个已知 CLI 首帧即出（品牌卡同步铺满，网络扫描只翻转安装态），
 *   已安装区实卡 + 未检测区虚线小卡，分类筛选 + 搜索 + 强制重扫。
 * 数据走 paper 自己的数据源（settings.clis + onRescanCli），不直接 fetch。
 *
 * ClawHub 的安装/卸载能力并入本分区（不新建页面、不加导航项）：
 *   已安装卡片 → 详情抽屉（含卸载入口）；未安装且可安装 → 卡片上直接「安装」；
 *   copy-only → 详情抽屉里复制命令；安装日志内联在工具栏下方，不遮挡筛选/搜索。
 *   安装完成后自动重扫；后端 refresh 有 5s 限流，429 只提示稍后重试。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLI_LABEL, CLI_META, SETTINGS_COPY } from '@/shared/content/settings';
import { CLAWHUB_COPY } from '@/shared/content/clawhub';
import type { CliProbe } from '@/shared/data/types';
import { ApiError } from '@/shared/data/http/client';
import {
  startInstall,
  startUninstall,
  subscribeInstallStream,
  type InstallStreamHandle,
} from '@/shared/data/http/clawhub';
import { IconSearch } from '@/shared/ui/icons';
import { useFlash } from '@/app/settings/primitives';
import { CliDetailDrawer } from '@/app/settings/sections/CliDetailDrawer';
import { CliInstallPanel, type CliInstallView } from '@/app/settings/sections/CliInstallPanel';

const C = SETTINGS_COPY.cli;

/** 后端 KNOWN_CLIS 的全量 id（首帧占位用，扫描回来后合并真值）。 */
const KNOWN_IDS = Object.keys(CLI_LABEL);

type FilterKey = 'all' | 'installed' | 'missing' | 'anthropic' | 'openai' | 'google' | 'cn';

/** 品牌色调：legacy 用 hex 硬色，这里收敛到主题 tone（三套主题各自成组）。 */
const VENDOR_TONE: Record<string, string> = {
  anthropic: 'var(--tone-amber)',
  openai: 'var(--tone-green)',
  google: 'var(--tone-blue)',
  cn: 'var(--tone-teal)',
  other: 'var(--tone-slate)',
};

const vendorOf = (id: string) => CLI_META[id]?.vendor ?? 'other';
const tintOf = (id: string) => VENDOR_TONE[vendorOf(id)];
const monogramOf = (id: string) => id.slice(0, 2).toUpperCase();

const placeholder = (id: string): CliProbe => ({
  id,
  name: CLI_LABEL[id] ?? id,
  bin: id,
  version: '',
  path: '',
  installed: false,
});

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="st-cli-chip" data-active={active ? 'true' : undefined} onClick={onClick}>
      {label}
      <span>{count}</span>
    </button>
  );
}

function Divider({ label, count }: { label: string; count: number }) {
  return (
    <div className="st-cli-divider">
      <span>
        {label} · {count}
      </span>
      <i />
    </div>
  );
}

export function CliSection({
  clis,
  onRescan,
}: {
  clis: CliProbe[];
  onRescan: () => Promise<CliProbe[]>;
}) {
  // 首帧 = 全目录占位（未检测态）；真值合并后只翻转 installed/version/path。
  const [probes, setProbes] = useState<CliProbe[]>(() => {
    const known = new Map(clis.map((c) => [c.id, c]));
    return KNOWN_IDS.map((id) => known.get(id) ?? placeholder(id));
  });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useFlash();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [install, setInstall] = useState<CliInstallView | null>(null);
  const streamRef = useRef<InstallStreamHandle | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.close();
    },
    [],
  );

  /**
   * 重扫并合并结果。`quiet` = 安装完成后自动触发：失败时只闪提示，
   * 不把卡片墙整块换成错误页（429 = 后端 5s 限流，提示稍后重试）。
   */
  const scan = async (
    rescan: () => Promise<CliProbe[]>,
    opts: { quiet?: boolean } = {},
  ) => {
    setScanning(true);
    setError(false);
    try {
      const next = await rescan();
      const byId = new Map(next.map((c) => [c.id, c]));
      setProbes(
        KNOWN_IDS.map((id) => {
          const hit = byId.get(id);
          if (hit) return hit;
          // API 里没有的 id（后端未收录）按未检测占位，不丢卡片
          const stale = probes.find((p) => p.id === id);
          return stale ?? placeholder(id);
        }),
      );
      const ready = next.filter((c) => c.installed).length;
      setFlash(C.scanned(ready, next.length));
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setFlash(CLAWHUB_COPY.rateLimited);
      } else if (opts.quiet) {
        setFlash(C.loadFailed);
      } else {
        setError(true);
      }
    } finally {
      setScanning(false);
    }
  };

  /** 发起安装 / 卸载：POST 建会话 → 挂 SSE 日志面板；终态后自动重扫。 */
  const beginAction = async (item: CliProbe, kind: 'install' | 'uninstall') => {
    if (install?.status === 'running') {
      setFlash(CLAWHUB_COPY.alreadyBusy);
      return;
    }
    streamRef.current?.close();
    try {
      const resp = kind === 'install' ? await startInstall(item.id) : await startUninstall(item.id);
      setInstall({
        installId: resp.install_id,
        cliId: resp.cli_id,
        cliName: item.name,
        command: resp.command,
        kind,
        status: 'running',
        lines: [],
      });
      setDetailId(null);
      streamRef.current = subscribeInstallStream(resp.install_id, {
        onLog: (d) => {
          setInstall((prev) =>
            prev ? { ...prev, lines: [...prev.lines, d].slice(-400) } : prev,
          );
        },
        onDone: () => {
          setInstall((prev) => (prev ? { ...prev, status: 'done' } : prev));
          // 安装/卸载成功 → 自动重扫刷新安装态（限流时只提示稍后重试）
          void scan(onRescan, { quiet: true });
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
      if (err instanceof ApiError && err.status === 422) {
        // copy-only：后端拒绝自动执行，复制命令交给用户手动跑。
        const manual = kind === 'install' ? item.installCmd : item.uninstallCmd || item.installCmd;
        if (manual) void navigator.clipboard?.writeText(manual);
        setFlash(kind === 'install' ? CLAWHUB_COPY.copyOnlyInstall : CLAWHUB_COPY.copyOnlyUninstall);
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setFlash(CLAWHUB_COPY.alreadyBusy);
        return;
      }
      setFlash(CLAWHUB_COPY.startFailed);
    }
  };

  const closeInstall = () => {
    streamRef.current?.close();
    streamRef.current = null;
    setInstall(null);
  };

  const retryInstall = () => {
    if (!install) return;
    const item = probes.find((p) => p.id === install.cliId);
    const kind = install.kind;
    closeInstall();
    if (item) void beginAction(item, kind);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return probes.filter((p) => {
      const meta = CLI_META[p.id];
      if (q && !`${p.name} ${p.id} ${meta?.short ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'installed') return p.installed;
      if (filter === 'missing') return !p.installed;
      if (filter === 'all') return true;
      return vendorOf(p.id) === filter;
    });
  }, [probes, filter, search]);

  const installed = filtered.filter((p) => p.installed);
  const missing = filtered.filter((p) => !p.installed);
  const detail = detailId ? probes.find((p) => p.id === detailId) ?? null : null;

  const counts = useMemo(() => {
    const by = (pred: (p: CliProbe) => boolean) => probes.filter(pred).length;
    return {
      all: probes.length,
      installed: by((p) => p.installed),
      missing: by((p) => !p.installed),
      anthropic: by((p) => vendorOf(p.id) === 'anthropic'),
      openai: by((p) => vendorOf(p.id) === 'openai'),
      google: by((p) => vendorOf(p.id) === 'google'),
      cn: by((p) => vendorOf(p.id) === 'cn'),
    } satisfies Record<FilterKey, number>;
  }, [probes]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: C.filterAll },
    { key: 'installed', label: C.filterInstalled },
    { key: 'missing', label: C.filterMissing },
    { key: 'anthropic', label: C.filterAnthropic },
    { key: 'openai', label: C.filterOpenai },
    { key: 'google', label: C.filterGoogle },
    { key: 'cn', label: C.filterCn },
  ];

  return (
    <div className="st-stack st-cli">
      {/* 工具条：筛选 chips + 搜索 + 重扫 */}
      <div className="st-cli-toolbar">
        <span className="st-cli-toolbar-label">{C.filterAll}</span>
        {FILTERS.map((f) => (
          <FilterChip key={f.key} label={f.label} count={counts[f.key]} active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
        <div className="st-cli-search">
          <IconSearch size={13} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={C.searchPlaceholder}
            aria-label={C.searchPlaceholder}
          />
          {!search && <kbd>{C.searchKey}</kbd>}
        </div>
        <button type="button" className="st-cli-rescan" onClick={() => void scan(onRescan)} disabled={scanning}>
          {scanning ? C.scanning : C.rescan}
        </button>
      </div>

      {/* 安装日志：内联在工具条下方，与卡片列表并存，不遮挡筛选/搜索 */}
      {install ? (
        <CliInstallPanel state={install} onClose={closeInstall} onRetry={retryInstall} />
      ) : null}

      {error ? (
        <div className="st-cli-error">{C.loadFailed}</div>
      ) : (
        <>
          {installed.length > 0 && (
            <>
              <Divider label={C.dividerInstalled} count={installed.length} />
              <div className="st-cli-grid">
                {installed.map((p) => (
                  <article
                    className="st-cli-card"
                    key={p.id}
                    data-installed="true"
                    role="button"
                    tabIndex={0}
                    title={CLAWHUB_COPY.openDetail}
                    onClick={() => setDetailId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailId(p.id);
                      }
                    }}
                  >
                    <header>
                      <span className="st-cli-logo" style={{ color: tintOf(p.id) }}>
                        {monogramOf(p.id)}
                      </span>
                      <span className="st-cli-tag" data-tone="ok">
                        {C.installed}
                      </span>
                    </header>
                    <div className="st-cli-name">
                      <b>{p.name}</b>
                      <small>{CLI_META[p.id]?.short ?? p.id}</small>
                    </div>
                    <dl>
                      {p.version ? (
                        <div>
                          <dt>{C.versionLabel}</dt>
                          <dd>{p.version}</dd>
                        </div>
                      ) : null}
                      {p.path ? (
                        <div>
                          <dt>{C.pathLabel}</dt>
                          <dd title={p.path}>{p.path}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}

          {missing.length > 0 && (
            <>
              <Divider label={C.dividerMissing} count={missing.length} />
              <div className="st-cli-grid st-cli-grid--missing">
                {missing.map((p) => (
                  <div
                    className="st-cli-mini"
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    title={CLAWHUB_COPY.openDetail}
                    onClick={() => setDetailId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailId(p.id);
                      }
                    }}
                  >
                    <span className="st-cli-logo" data-mini="true" style={{ color: tintOf(p.id) }}>
                      {monogramOf(p.id)}
                    </span>
                    <div className="st-cli-mini-text">
                      <b>{p.name}</b>
                      <small>{CLI_META[p.id]?.short ?? ''}</small>
                    </div>
                    {p.installable ? (
                      <button
                        type="button"
                        className="st-cli-mini-install"
                        onClick={(e) => {
                          e.stopPropagation();
                          void beginAction(p, 'install');
                        }}
                      >
                        {CLAWHUB_COPY.install}
                      </button>
                    ) : (
                      <span className="st-cli-tag" data-tone="mute">
                        {C.missing}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {installed.length === 0 && missing.length === 0 && <div className="st-cli-empty">{C.noMatch}</div>}

          <p className="st-hint">{C.rescanNote}</p>
          {flash ? <span className="st-flash">{flash}</span> : null}
        </>
      )}

      <CliDetailDrawer
        item={detail}
        onClose={() => setDetailId(null)}
        onInstall={(item) => void beginAction(item, 'install')}
        onUninstall={(item) => void beginAction(item, 'uninstall')}
      />
    </div>
  );
}
