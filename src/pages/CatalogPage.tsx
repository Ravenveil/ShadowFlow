/**
 * CatalogPage — Story 8.7
 *
 * UI PROTECTION: 只能加，不能删。新增独立路由 /catalog，不挤占 TemplatesPage。
 *
 * 功能：
 *   - 列出已发布 Agent，按 published_at 倒序
 *   - kit_type 过滤 + 关键词搜索（前端二次过滤，分页语义保留）
 *   - 卡片详情抽屉（脱敏视图）
 *   - Fork CTA → POST /catalog/apps/{id}/fork → /builder?blueprint_id=...&mode=scene
 *   - 空态、错误态、Fork 失败 toast 均走可理解文案
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listCatalogApps,
  getCatalogApp,
  forkCatalogApp,
  CatalogApiError,
} from '../api/catalog';
import { promoteToTeamFromAgent, BuilderApiError } from '../api/builder';
import { useBuilderStore } from '../core/stores/builderStore';
import type {
  CatalogAppSummary,
  CatalogAppDetail,
  CatalogKitType,
} from '../common/types/catalog';

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';
type ForkStatus = 'idle' | 'forking' | 'success' | 'error';

const KIT_FILTERS: { value: CatalogKitType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'research', label: 'Research' },
  { value: 'knowledge_assistant', label: 'Knowledge' },
  { value: 'review_approval', label: 'Review' },
  { value: 'persona', label: 'Persona' },
  { value: 'custom', label: 'Custom' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function translateForkError(err: unknown): string {
  if (err instanceof CatalogApiError) {
    if (err.code === 'CATALOG_APP_NOT_FOUND' || err.status === 404) {
      return 'Fork 失败：原 Agent 已被删除，可能需要返回列表刷新。';
    }
    if (err.code === 'CATALOG_BLUEPRINT_INVALID') {
      return 'Fork 失败：该 Agent 的快照已损坏或与当前 Builder 合同不兼容。建议联系发布者。';
    }
    if (err.code === 'CATALOG_SNAPSHOT_MISSING') {
      return 'Fork 失败：该 Agent 的快照缺失。建议返回列表，或联系发布者重新发布。';
    }
    if (err.status === 0 || err.status >= 500) {
      return 'Fork 失败：服务暂时不可用，请稍后重试。';
    }
    return 'Fork 失败：请稍后重试，或返回列表查看其他 Agent。';
  }
  return 'Fork 失败：网络错误，请检查连接后重试。';
}

function translateDetailError(err: unknown): string {
  if (err instanceof CatalogApiError) {
    if (err.code === 'CATALOG_APP_NOT_FOUND' || err.status === 404) {
      return '该 Agent 已被删除或下线。';
    }
    if (err.code === 'CATALOG_SNAPSHOT_MISSING' || err.code === 'CATALOG_BLUEPRINT_INVALID') {
      return '无法读取详情：Agent 快照损坏，可联系发布者重新发布。';
    }
    if (err.status >= 500) return '服务暂时不可用，请稍后重试。';
  }
  return '无法读取详情，请稍后重试。';
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`kit-filter-${label}`}
      style={{
        height: 32,
        padding: '0 14px',
        fontSize: 12,
        borderRadius: 8,
        border: `1px solid ${active ? 'var(--t-accent)' : 'var(--t-border)'}`,
        background: active ? 'var(--t-accent-tint)' : 'var(--t-panel)',
        color: active ? 'var(--t-accent-bright)' : 'var(--t-fg-2)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {label}
    </button>
  );
}

function CatalogCard({
  app,
  onOpen,
  onFork,
  onPromote,
  forking,
  promoting,
}: {
  app: CatalogAppSummary;
  onOpen: (id: string) => void;
  onFork: (id: string) => void;
  onPromote: (id: string) => void;
  forking: boolean;
  promoting: boolean;
}) {
  const promoteEnabled =
    !app.scope_hint || app.scope_hint === 'team_member_candidate';
  const promoteTooltip = promoteEnabled
    ? '基于该 Agent 创建一个新团队，并把它作为核心角色'
    : '该 Agent 已声明为独立助手';
  return (
    <div
      data-testid={`catalog-card-${app.app_id}`}
      style={{
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 14,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        onClick={() => onOpen(app.app_id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(app.app_id);
        }}
        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--t-accent-bright)',
              textTransform: 'uppercase',
              letterSpacing: '.12em',
            }}
          >
            {app.kit_type}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
            {fmtDate(app.published_at)}
          </span>
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--t-fg)',
            lineHeight: 1.25,
          }}
        >
          {app.name || app.app_id}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--t-fg-3)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {app.goal || '—'}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--t-fg-4)',
          paddingTop: 8,
          borderTop: '1px solid var(--t-border)',
        }}
      >
        <span>by {app.author || 'anonymous'} · forks {app.fork_count}</span>
        <button
          data-testid={`fork-btn-${app.app_id}`}
          disabled={forking}
          onClick={() => onFork(app.app_id)}
          style={{
            height: 28,
            padding: '0 12px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid var(--t-accent)',
            background: forking ? 'var(--t-panel)' : 'var(--t-accent-tint)',
            color: 'var(--t-accent-bright)',
            cursor: forking ? 'progress' : 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {forking ? 'Forking…' : 'Fork →'}
        </button>
      </div>
      {/* Story 13.6: 以此为核心搭建协作团队 */}
      <button
        data-testid={`promote-btn-${app.app_id}`}
        disabled={!promoteEnabled || promoting}
        title={promoteTooltip}
        onClick={() => onPromote(app.app_id)}
        style={{
          height: 30,
          fontSize: 12,
          borderRadius: 6,
          border: '1px solid var(--t-border)',
          background: !promoteEnabled
            ? 'var(--t-panel)'
            : promoting
            ? 'var(--t-panel)'
            : 'var(--t-panel)',
          color: !promoteEnabled ? 'var(--t-fg-5)' : 'var(--t-fg)',
          cursor: !promoteEnabled ? 'not-allowed' : promoting ? 'progress' : 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {promoting ? '组建中…' : '★ 以此为核心，搭建协作团队'}
      </button>
    </div>
  );
}

function DetailDrawer({
  detail,
  loading,
  error,
  onClose,
  onFork,
  forking,
}: {
  detail: CatalogAppDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onFork: (id: string) => void;
  forking: boolean;
}) {
  return (
    <div
      data-testid="catalog-detail-drawer"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 'min(520px, 100vw)',
        background: 'var(--t-panel)',
        borderLeft: '1px solid var(--t-border)',
        boxShadow: '-12px 0 30px rgba(0,0,0,.45)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--t-fg-4)',
            textTransform: 'uppercase',
            letterSpacing: '.12em',
          }}
        >
          Agent Detail
        </span>
        <button
          onClick={onClose}
          data-testid="catalog-detail-close"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-3)',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', color: 'var(--t-fg)' }}>
        {loading && <div style={{ color: 'var(--t-fg-3)' }}>加载中…</div>}
        {error && (
          <div data-testid="detail-error" style={{ color: 'var(--status-reject)', fontSize: 13 }}>
            {error}
          </div>
        )}
        {detail && !loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{detail.name || detail.app_id}</div>
            <div style={{ fontSize: 13, color: 'var(--t-fg-3)', lineHeight: 1.6 }}>
              <span style={{ color: 'var(--t-fg-4)' }}>Goal: </span>
              {detail.goal || detail.description || '—'}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--t-fg-3)',
              }}
            >
              <div>Mode: {detail.mode}</div>
              <div>Kit: {detail.kit_type}</div>
              <div>Roles: {detail.role_count}</div>
              <div>Forks: {detail.fork_count}</div>
              <div style={{ gridColumn: '1 / -1' }}>Published: {fmtDate(detail.published_at)}</div>
              {detail.forked_from && (
                <div style={{ gridColumn: '1 / -1' }}>Forked from: {detail.forked_from}</div>
              )}
            </div>
            {detail.role_names.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--t-fg-4)', marginBottom: 6 }}>Roles</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--t-fg-2)', fontSize: 13 }}>
                  {detail.role_names.map((rn, i) => (
                    <li key={`${rn}-${i}`}>{rn}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              data-testid="detail-fork-btn"
              disabled={forking}
              onClick={() => onFork(detail.app_id)}
              style={{
                marginTop: 14,
                height: 40,
                fontSize: 13,
                borderRadius: 10,
                border: '1px solid var(--t-accent)',
                background: forking ? 'var(--t-panel)' : 'var(--t-accent-tint)',
                color: 'var(--t-accent-bright)',
                cursor: forking ? 'progress' : 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {forking ? 'Forking…' : 'Fork 此 Agent →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const navigate = useNavigate();

  // List state
  const [listStatus, setListStatus] = useState<LoadStatus>('idle');
  const [apps, setApps] = useState<CatalogAppSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  // Filter state
  const [kitFilter, setKitFilter] = useState<CatalogKitType>('all');
  const [keyword, setKeyword] = useState('');

  // Detail drawer state
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogAppDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fork state
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [forkStatus, setForkStatus] = useState<ForkStatus>('idle');
  const [forkError, setForkError] = useState<string | null>(null);

  // Story 13.6 — Promote state
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Initial load — server-side filter by kit_type (when not 'all')
  useEffect(() => {
    let cancelled = false;
    setListStatus('loading');
    setListError(null);
    listCatalogApps({ kit_type: kitFilter, page: 1, page_size: 100 })
      .then((resp) => {
        if (cancelled) return;
        setApps(resp.data.apps);
        setListStatus('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(
          err instanceof CatalogApiError && err.status >= 500
            ? '服务暂时不可用，请稍后刷新页面。'
            : '无法加载 Agent 列表，请检查网络连接。',
        );
        setListStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [kitFilter]);

  // Client-side keyword filter (combinable with kit_type — see AC2).
  // NOTE: list is capped at page_size=100; if apps.length === 100 results may be truncated.
  const visibleApps = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter((a) => {
      const hay = `${a.name} ${a.goal}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [apps, keyword]);

  // Open detail drawer
  function handleOpenDetail(appId: string) {
    setOpenAppId(appId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    getCatalogApp(appId)
      .then((resp) => {
        setDetail(resp.data);
        setDetailLoading(false);
      })
      .catch((err) => {
        setDetailError(translateDetailError(err));
        setDetailLoading(false);
      });
  }

  function handleCloseDetail() {
    setOpenAppId(null);
    setDetail(null);
    setDetailError(null);
  }

  // Story 13.6 — Promote CTA → POST /builder/teams/from-agent → setBlueprint → /builder?promote=1
  async function handlePromote(appId: string) {
    // P6: in-flight guard prevents double-click → duplicate setBlueprint + navigate.
    if (promotingId) return;
    setPromotingId(appId);
    setPromoteError(null);
    try {
      const blueprint = await promoteToTeamFromAgent(appId);
      useBuilderStore.getState().setBlueprint(blueprint);
      const bpId = encodeURIComponent(blueprint.blueprint_id);
      navigate(`/builder?blueprint_id=${bpId}&mode=team&promote=1`);
    } catch (err) {
      let msg: string;
      if (err instanceof BuilderApiError) {
        if (err.status === 404) {
          msg = '该 Agent 已被删除，无法组建团队。';
        } else if (err.status === 422) {
          // D3-a: server now also rejects scope_hint=standalone with a dedicated code.
          const code = (err.detail as { error?: { code?: string } } | undefined)?.error?.code;
          if (code === 'CATALOG_AGENT_STANDALONE_LOCKED') {
            msg = '该 Agent 已声明为独立助手，不能作为团队主负责人。';
          } else if (code === 'INVALID_ANCHOR_AGENT_ID') {
            msg = '内部错误：anchor_agent_id 格式非法。';
          } else {
            msg = '该 Agent 快照已损坏，无法作为主负责人。';
          }
        } else {
          msg = '组建团队失败，请稍后重试。';
        }
      } else {
        msg = '组建团队失败：网络错误。';
      }
      setPromoteError(msg);
    } finally {
      setPromotingId(null);
    }
  }

  // Fork CTA → POST /catalog/apps/{id}/fork → /builder?blueprint_id=...&mode=scene
  async function handleFork(appId: string) {
    setForkingId(appId);
    setForkStatus('forking');
    setForkError(null);
    try {
      const resp = await forkCatalogApp(appId);
      setForkStatus('success');
      const newId = encodeURIComponent(resp.data.blueprint_id);
      navigate(`/builder?blueprint_id=${newId}&mode=scene`);
    } catch (err) {
      setForkError(translateForkError(err));
      setForkStatus('error');
    } finally {
      setForkingId(null);
    }
  }

  return (
    <div
      data-testid="catalog-page"
      style={{ minHeight: '100vh', background: 'var(--t-bg)', color: 'var(--t-fg)' }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 32px',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          background: 'var(--t-panel)',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t-fg-3)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          ← 返回
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--t-border)' }} />
        <h1 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>Agent 目录</h1>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--t-fg-4)',
          }}
        >
          已发布 Agent · 一键 Fork 进 Builder
        </span>
      </div>

      {/* Filters */}
      <div
        style={{
          padding: '16px 32px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          background: 'var(--t-panel)',
          borderBottom: '1px solid var(--t-border)',
        }}
      >
        {KIT_FILTERS.map((f) => (
          <FilterButton
            key={f.value}
            active={kitFilter === f.value}
            label={f.label}
            onClick={() => setKitFilter(f.value)}
          />
        ))}
        <div style={{ width: 1, height: 22, background: 'var(--t-border)', margin: '0 6px' }} />
        <input
          data-testid="catalog-search-input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索 name / goal…"
          style={{
            flex: 1,
            minWidth: 220,
            height: 32,
            padding: '0 12px',
            fontSize: 13,
            borderRadius: 8,
            border: '1px solid var(--t-border)',
            background: 'var(--t-bg)',
            color: 'var(--t-fg)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-4)' }}>
          {visibleApps.length} / {apps.length}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 32 }}>
        {listStatus === 'loading' && (
          <div data-testid="catalog-loading" style={{ color: 'var(--t-fg-3)', textAlign: 'center', padding: 40 }}>
            加载中…
          </div>
        )}

        {listStatus === 'error' && (
          <div
            data-testid="catalog-error"
            style={{
              color: 'var(--status-reject)',
              textAlign: 'center',
              padding: 40,
              border: '1px dashed var(--status-reject)',
              borderRadius: 12,
            }}
          >
            {listError ?? '加载失败'}
          </div>
        )}

        {listStatus === 'success' && apps.length === 0 && (
          <div
            data-testid="catalog-empty"
            style={{
              textAlign: 'center',
              padding: 60,
              border: '1px dashed var(--t-border)',
              borderRadius: 12,
              color: 'var(--t-fg-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 16, color: 'var(--t-fg)' }}>还没有已发布的 Agent</div>
            <div style={{ fontSize: 13 }}>使用 Builder 发布第一个 Agent，让其他人也能 Fork 它。</div>
            <button
              data-testid="empty-builder-cta"
              onClick={() => navigate('/builder')}
              style={{
                height: 36,
                padding: '0 18px',
                fontSize: 13,
                borderRadius: 8,
                border: '1px solid var(--t-accent)',
                background: 'var(--t-accent-tint)',
                color: 'var(--t-accent-bright)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              去 Builder 创建第一个 →
            </button>
          </div>
        )}

        {listStatus === 'success' && apps.length > 0 && visibleApps.length === 0 && (
          <div
            data-testid="catalog-no-match"
            style={{
              textAlign: 'center',
              padding: 40,
              color: 'var(--t-fg-3)',
              border: '1px dashed var(--t-border)',
              borderRadius: 12,
            }}
          >
            没有找到匹配的 Agent
          </div>
        )}

        {visibleApps.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 18,
            }}
            data-testid="catalog-grid"
          >
            {visibleApps.map((a) => (
              <CatalogCard
                key={a.app_id}
                app={a}
                onOpen={handleOpenDetail}
                onFork={handleFork}
                onPromote={handlePromote}
                forking={forkingId === a.app_id}
                promoting={promotingId === a.app_id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fork toast (error only — success path navigates away) */}
      {forkStatus === 'error' && forkError && (
        <div
          data-testid="fork-error-toast"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--t-panel)',
            border: '1px solid var(--status-reject)',
            color: 'var(--t-fg)',
            padding: '12px 18px',
            borderRadius: 10,
            fontSize: 13,
            maxWidth: 520,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{forkError}</span>
          <button
            data-testid="fork-toast-dismiss"
            onClick={() => {
              setForkStatus('idle');
              setForkError(null);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--t-fg-3)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Story 13.6 — Promote error toast */}
      {promoteError && (
        <div
          data-testid="promote-error-toast"
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--t-panel)',
            border: '1px solid var(--status-reject)',
            color: 'var(--t-fg)',
            padding: '12px 18px',
            borderRadius: 10,
            fontSize: 13,
            maxWidth: 520,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{promoteError}</span>
          <button
            onClick={() => setPromoteError(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--t-fg-3)', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {openAppId && (
        <DetailDrawer
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={handleCloseDetail}
          onFork={handleFork}
          forking={forkingId === openAppId}
        />
      )}
    </div>
  );
}
