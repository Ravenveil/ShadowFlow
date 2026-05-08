/**
 * CatalogInstallTab — Story 12.5 AC7, AC3, AC8
 *
 * 「从 Catalog 安装」tab content inside CreateAgentModal.
 * Fetches pack list, lets user install a pack, calls onInstalled on success.
 */
import { useCallback, useEffect, useState } from 'react';
import { Shield, AlertTriangle } from '../../../common/icons/iconRegistry';
import { listPacks, installPack, RegistryApiError } from '../../../api/registry';
import type { PackRecord } from '../../../api/registry';

interface CatalogInstallTabProps {
  onInstalled: (agentId: string, packName: string) => void;
}

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span
        className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-400"
        title="ShadowFlow 官方认证"
        data-testid="badge-verified"
      >
        <Shield size={10} strokeWidth={2} /> 官方
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-0.5 rounded bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium text-yellow-500"
      title="社区 Pack，未验证"
      data-testid="badge-unverified"
    >
      <AlertTriangle size={10} strokeWidth={2} /> 未验证
    </span>
  );
}

function StatusButton({
  status,
  installing,
  onInstall,
}: {
  status: PackRecord['install_status'];
  installing: boolean;
  onInstall: () => void;
}) {
  const label =
    installing ? '安装中…'
    : status === 'not_installed' ? '安装'
    : status === 'has_update' ? '更新'
    : '已安装';

  return (
    <button
      onClick={onInstall}
      disabled={installing || status === 'installed'}
      className="rounded border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
      data-testid={`btn-install-${status}`}
    >
      {label}
    </button>
  );
}

export function CatalogInstallTab({ onInstalled }: CatalogInstallTabProps) {
  const [packs, setPacks] = useState<PackRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  const fetchPacks = useCallback(async (query?: string) => {
    setLoadStatus('loading');
    setLoadError(null);
    try {
      const data = await listPacks({ q: query || undefined });
      setPacks(data);
      setLoadStatus('success');
    } catch (err) {
      const msg = err instanceof RegistryApiError
        ? `加载失败（${err.status}）`
        : '加载失败，请稍后重试';
      setLoadError(msg);
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  async function handleInstall(pack: PackRecord) {
    setInstallingId(pack.id);
    setInstallError(null);
    try {
      const result = await installPack(pack.id);
      // Refresh list to update install_status
      await fetchPacks(q || undefined);
      onInstalled(result.agent_id, pack.name);
    } catch (err) {
      const msg = err instanceof RegistryApiError
        ? `安装失败（${err.status}）：${err.code}`
        : '安装失败，请稍后重试';
      setInstallError(msg);
    } finally {
      setInstallingId(null);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchPacks(q || undefined);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="catalog-install-tab">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索 Pack…"
          className="flex-1 rounded border border-shadowflow-border bg-white/5 px-3 py-1.5 text-[12px] text-white/80 placeholder-white/30 outline-none focus:border-white/30"
          data-testid="pack-search-input"
        />
        <button
          type="submit"
          className="rounded border border-shadowflow-border px-3 py-1.5 text-[12px] text-white/50 hover:text-white/80"
        >
          搜索
        </button>
      </form>

      {/* Error messages */}
      {loadError && (
        <p className="text-[11px] text-red-400" data-testid="load-error">{loadError}</p>
      )}
      {installError && (
        <p className="text-[11px] text-red-400" data-testid="install-error">{installError}</p>
      )}

      {/* Pack list */}
      {loadStatus === 'loading' && (
        <p className="py-6 text-center text-[12px] text-white/40" data-testid="packs-loading">
          加载中…
        </p>
      )}

      {loadStatus === 'success' && packs.length === 0 && (
        <p className="py-6 text-center text-[12px] text-white/40" data-testid="packs-empty">
          没有找到匹配的 Pack。
        </p>
      )}

      {loadStatus === 'success' && packs.length > 0 && (
        <div
          className="flex max-h-64 flex-col gap-2 overflow-y-auto"
          data-testid="packs-list"
        >
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="flex items-start justify-between gap-3 rounded border border-shadowflow-border bg-white/[0.02] px-3 py-2.5"
              data-testid={`pack-card-${pack.id}`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-white/90">{pack.name}</span>
                  <span className="text-[10px] text-white/30">v{pack.version}</span>
                  <VerifiedBadge verified={pack.verified} />
                </div>
                <p className="truncate text-[11px] text-white/50">{pack.description}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {pack.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-white/5 px-1 py-px font-mono text-[9px] text-white/35"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                <StatusButton
                  status={pack.install_status}
                  installing={installingId === pack.id}
                  onInstall={() => handleInstall(pack)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
