/**
 * ForkTeamTemplateModal — 「从模板新建团队」模板市场（T04 一键 fork 黄金路径）。
 *
 * 列出 Catalog 中 mode=="team" 的团队模板（首轮内置：氢能获客 6 角色 DAG
 * 团队），点「Fork 并创建」→ POST /api/catalog/apps/{id}/fork —— Python 侧
 * 落库 6 个 agent + 带 DAG workflow 的 team 记录，响应 data.team 即新团队。
 * 成功 → onCreated(team)（父级把新团队追加进列表并选为 currentTeam，用户
 * 直接在群聊里开跑）；失败 → 模态内红条展示真实错误，不吞不假成功。
 *
 * 样式与 CreateTeamModal 同款（inline style + var(--t-*) 主题变量），
 * 文案走 t(key, { defaultValue })，不改 locale 文件。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Loader2, Zap } from 'lucide-react';
import {
  CatalogApiError,
  forkCatalogApp,
  listCatalogApps,
  type CatalogAppSummary,
} from '../../api/catalog';
import type { TeamRecord } from '../../api/teams';
import { useI18n } from '../../common/i18n';

export interface ForkTeamTemplateModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (team: TeamRecord) => void;
}

/** 从 CatalogApiError 的 detail 里提取后端真实 message，拿不到就退回 err.message。 */
function errorMessageOf(err: unknown): string {
  if (err instanceof CatalogApiError) {
    const d = err.detail;
    if (d && typeof d === 'object') {
      const inner = (d as Record<string, unknown>).error;
      if (inner && typeof inner === 'object') {
        const msg = (inner as Record<string, unknown>).message;
        if (typeof msg === 'string' && msg) return msg;
      }
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function ForkTeamTemplateModal({ workspaceId, onClose, onCreated }: ForkTeamTemplateModalProps) {
  const { t } = useI18n();
  const [apps, setApps] = useState<CatalogAppSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listCatalogApps()
      .then((rows) => {
        if (alive) setApps(rows.filter((a) => a.mode === 'team'));
      })
      .catch((err) => {
        if (alive) {
          setApps([]);
          setError(errorMessageOf(err));
        }
      });
    return () => { alive = false; };
  }, []);

  // Esc 关闭（fork 中禁用，避免请求悬空时用户误以为已取消）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyId) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busyId]);

  async function handleFork(app: CatalogAppSummary) {
    if (busyId) return;
    setBusyId(app.app_id);
    setError(null);
    try {
      const result = await forkCatalogApp(app.app_id, workspaceId ?? undefined);
      if (!result.team) {
        // team 模板 fork 必须落出 team；缺了就是后端异常，暴露不掩盖
        throw new Error('fork response missing team record');
      }
      onCreated(result.team);
    } catch (err) {
      setError(errorMessageOf(err));
      setBusyId(null);
    }
  }

  const cardStyle: CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '10px 12px', borderRadius: 9,
    background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
  };

  return (
    <div
      data-testid="fork-template-modal-mask"
      onClick={() => { if (!busyId) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-label={t('workspace.forkTemplateTitle', { defaultValue: '从模板新建团队' })}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxHeight: '70vh', overflowY: 'auto',
          background: 'var(--t-panel)', border: '1px solid var(--t-border)',
          borderRadius: 12, padding: '14px 16px',
          boxShadow: '0 12px 32px rgba(0,0,0,.28)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>
          {t('workspace.forkTemplateTitle', { defaultValue: '从模板新建团队' })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--t-fg-4)' }}>
          {t('workspace.forkTemplateHint', {
            defaultValue: 'Fork 内置团队模板：自动创建全部角色 agent 与 DAG 团队，选好即可在群聊运行。',
          })}
        </div>

        {error && (
          <div
            data-testid="fork-template-error"
            style={{
              padding: '7px 9px', borderRadius: 7, fontSize: 12,
              color: 'var(--t-danger, #d66)',
              background: 'color-mix(in oklab, var(--t-danger, #d66) 12%, transparent)',
              border: '1px solid color-mix(in oklab, var(--t-danger, #d66) 35%, transparent)',
            }}
          >
            {error}
          </div>
        )}

        {apps === null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-fg-4)' }} aria-busy="true">
            <Loader2 size={13} className="sf-spin" aria-hidden />
            {t('workspace.forkTemplateLoading', { defaultValue: '加载模板…' })}
          </div>
        )}

        {apps !== null && apps.length === 0 && !error && (
          <div style={{ fontSize: 12, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)' }}>
            {t('workspace.forkTemplateEmpty', { defaultValue: '暂无团队模板' })}
          </div>
        )}

        {(apps ?? []).map((app) => {
          const busy = busyId === app.app_id;
          return (
            <div key={app.app_id} data-testid={`fork-template-card-${app.app_id}`} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Zap size={13} strokeWidth={2} aria-hidden style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--t-fg)' }}>
                  {app.name}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)',
                  padding: '1px 5px', borderRadius: 3, background: 'var(--t-panel)',
                  border: '1px solid var(--t-border)', flexShrink: 0,
                }}>
                  {t('workspace.forkTemplateForkCount', { defaultValue: 'fork' })} · {app.fork_count}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--t-fg-3)', lineHeight: 1.5 }}>
                {app.goal}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  data-testid={`fork-template-run-${app.app_id}`}
                  disabled={busyId !== null}
                  onClick={() => handleFork(app)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                    color: 'var(--t-on-accent, #fff)', background: 'var(--t-accent)',
                    border: 'none', cursor: busyId ? 'default' : 'pointer',
                    opacity: busyId && !busy ? 0.5 : 1,
                  }}
                >
                  {busy && <Loader2 size={12} className="sf-spin" aria-hidden />}
                  {t('workspace.forkTemplateAction', { defaultValue: 'Fork 并创建' })}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
