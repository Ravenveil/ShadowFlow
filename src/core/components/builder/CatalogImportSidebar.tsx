/**
 * CatalogImportSidebar — Story 13.3 (AC2/AC3/AC4)
 *
 * 600px 宽的 Drawer 面板，从 Catalog 中选择已发布 Agent 引入为 Team 成员角色。
 *
 * Props:
 *   blueprintId      — 当前 Builder blueprint 的 ID（传给 import-agent 端点）
 *   onClose          — 关闭 Drawer
 *   onImportSuccess  — 引入成功回调，传入新的 RoleProfile
 */
import { useEffect, useRef, useState } from 'react';
import { listCatalogApps, CatalogApiError } from '../../../api/catalog';
import { importAgentToBlueprint, BuilderApiError } from '../../../api/builder';
import type { CatalogAppSummary } from '../../../common/types/catalog';
import type { RoleProfile } from '../../../common/types/agent-builder';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CatalogImportSidebarProps {
  blueprintId: string;
  onClose: () => void;
  /**
   * Story 13.6 review P5 — onImportSuccess receives the optional replaceRoleId
   * inline so the caller doesn't have to reconstruct it from a separate state
   * source (which can desync if the sidebar is opened/closed concurrently).
   */
  onImportSuccess: (role: RoleProfile, replaceRoleId?: string) => void;
  /**
   * Story 13.6 AC5: when set, the import is treated as a replacement of the
   * given role_id — caller's onImportSuccess handler splices the returned
   * RoleProfile in place of `replaceRoleId` (preserving anchor metadata).
   */
  replaceRoleId?: string;
}

// ---------------------------------------------------------------------------
// Error message helpers (AC4)
// ---------------------------------------------------------------------------

function _importErrorMessage(err: unknown): string {
  if (err instanceof BuilderApiError) {
    if (err.status === 404) return '该 Agent 已从 Catalog 移除';
    if (err.status === 409 || err.status === 422) return 'Agent 快照与当前 Builder 合同不兼容';
  }
  if (err instanceof CatalogApiError) {
    if (err.status === 404) return '该 Agent 已从 Catalog 移除';
    if (err.status === 409 || err.status === 422) return 'Agent 快照与当前 Builder 合同不兼容';
  }
  return '引入失败，请稍后重试';
}

// ---------------------------------------------------------------------------
// Skeleton rows (AC2 loading state)
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-sf-border/40 bg-sf-elev2/60 px-4 py-3 animate-pulse">
      <div className="h-4 w-2/5 rounded bg-sf-border/50" />
      <div className="ml-auto h-4 w-12 rounded bg-sf-border/50" />
      <div className="h-4 w-16 rounded bg-sf-border/30" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CatalogImportSidebar
// ---------------------------------------------------------------------------

export function CatalogImportSidebar({
  blueprintId,
  onClose,
  onImportSuccess,
  replaceRoleId,
}: CatalogImportSidebarProps) {
  const [apps, setApps] = useState<CatalogAppSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Per-row import state: importingId (one at a time), importError (per row)
  const [importingId, setImportingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Load catalog list on mount
  useEffect(() => {
    let cancelled = false;
    setLoadStatus('loading');
    setLoadError(null);

    listCatalogApps({ page_size: 20 })
      .then((resp) => {
        if (cancelled) return;
        setApps(resp.data.apps);
        setLoadStatus('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadStatus('error');
        setLoadError(err instanceof Error ? err.message : '加载 Catalog 失败');
      });

    return () => { cancelled = true; };
  }, []);

  // Front-end keyword filter (AC2)
  const filterMatches = (app: CatalogAppSummary) =>
    searchQuery.trim() === ''
      ? true
      : app.name.toLowerCase().includes(searchQuery.trim().toLowerCase());

  // Story 13.5 AC4: sort with scope_hint = 'team_member_candidate' first
  const filtered = apps
    .filter(filterMatches)
    .sort((a, b) => {
      const aIsTeam = a.scope_hint === 'team_member_candidate' ? 0 : 1;
      const bIsTeam = b.scope_hint === 'team_member_candidate' ? 0 : 1;
      return aIsTeam - bIsTeam;
    });

  async function handleImport(app: CatalogAppSummary) {
    if (importingId) return; // one at a time
    setImportingId(app.app_id);
    setRowErrors((prev) => ({ ...prev, [app.app_id]: '' }));

    try {
      const role = await importAgentToBlueprint(blueprintId, app.app_id);
      if (!isMountedRef.current) return;
      // P5: only forward replaceRoleId when actually set, so existing call
      // sites (and test expectations) that match a single-arg signature still
      // work for the non-replace path.
      if (replaceRoleId) onImportSuccess(role, replaceRoleId);
      else onImportSuccess(role);
      onClose();
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg = _importErrorMessage(err);
      setRowErrors((prev) => ({ ...prev, [app.app_id]: msg }));
    } finally {
      if (isMountedRef.current) setImportingId(null);
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-40 flex justify-end"
      data-testid="catalog-import-sidebar"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel — 600px wide */}
      <div
        className="relative z-50 flex h-full w-[600px] flex-col bg-sf-panel shadow-2xl border-l border-sf-border"
        role="dialog"
        aria-modal
        aria-label="从 Catalog 引入 Agent"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sf-border px-6 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sf-accent-bright">
              Catalog
            </p>
            <h2 className="mt-0.5 text-[18px] font-bold tracking-tight">
              {replaceRoleId ? '切换主负责人' : '从 Catalog 引入 Agent'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[6px] px-3 py-1.5 text-[13px] text-sf-fg3 hover:bg-sf-elev2 hover:text-sf-fg1"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-sf-border px-6 py-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 Agent 名称…"
            className="w-full rounded-[8px] border border-sf-border bg-sf-elev2 px-3 py-2 text-[13px] text-sf-fg1 placeholder-sf-fg5 outline-none focus:border-sf-accent"
            data-testid="catalog-agent-search"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {/* Loading skeleton */}
          {loadStatus === 'loading' && (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {/* Load error */}
          {loadStatus === 'error' && (
            <div
              className="rounded-[8px] border border-sf-reject/40 bg-sf-reject-tint px-4 py-3 text-[13px] text-sf-reject"
              role="alert"
              data-testid="catalog-load-error"
            >
              {loadError ?? '加载失败，请稍后重试'}
            </div>
          )}

          {/* Empty state */}
          {loadStatus === 'success' && filtered.length === 0 && (
            <p className="py-6 text-center text-[13px] text-sf-fg5">
              {searchQuery.trim() ? `没有匹配「${searchQuery}」的 Agent` : 'Catalog 暂无已发布的 Agent'}
            </p>
          )}

          {/* Agent rows */}
          {loadStatus === 'success' &&
            filtered.map((app) => {
              const isImporting = importingId === app.app_id;
              const rowError = rowErrors[app.app_id];

              return (
                <div
                  key={app.app_id}
                  className="rounded-[8px] border border-sf-border bg-sf-elev2/40 px-4 py-3"
                  data-testid={`catalog-agent-item-${app.app_id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="truncate text-[13px] font-semibold text-sf-fg1">
                          {app.name}
                        </p>
                        {/* Story 13.5 AC4: 团队候选标签 */}
                        {app.scope_hint === 'team_member_candidate' && (
                          <span
                            data-testid="scope-hint-badge"
                            className="inline-flex items-center rounded-[4px] bg-sf-accent-tint px-1.5 py-px font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-sf-accent-bright whitespace-nowrap border border-sf-accent/30"
                          >
                            团队候选 ★
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-[4px] border border-sf-accent/30 bg-sf-accent-tint px-[5px] py-px font-mono text-[9px] uppercase tracking-[0.1em] text-sf-accent-bright">
                          {app.kit_type}
                        </span>
                        <span className="text-[11px] text-sf-fg5">
                          {app.published_at ? new Date(app.published_at).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!!importingId}
                      onClick={() => void handleImport(app)}
                      className="shrink-0 rounded-[6px] bg-sf-accent px-3 py-1.5 font-mono text-[11px] font-bold text-white transition-opacity disabled:opacity-50 enabled:hover:opacity-90"
                      data-testid={`import-agent-btn-${app.app_id}`}
                      aria-label={`引入 ${app.name}`}
                    >
                      {isImporting ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : '引入'}
                    </button>
                  </div>

                  {/* Per-row error (AC4) */}
                  {rowError && (
                    <p
                      className="mt-2 text-[12px] text-sf-reject"
                      role="alert"
                      data-testid="import-error-inline"
                    >
                      {rowError}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
