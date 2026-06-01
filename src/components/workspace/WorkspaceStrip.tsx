/**
 * WorkspaceSelector — sidebar workspace switcher (DingTalk-style).
 * Replaces the old separate WorkspaceStrip row.
 *
 * Props:
 *   collapsed — sidebar is in icon-only mode; show monogram only,
 *               dropdown opens via portal to the right of the icon.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ChevronDown, Users } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
// CreateWorkspaceModal 入口已迁到 /teams 新建团队流程（用户视角 ws=team 是同一回事）
// 文件保留供 future 使用，但本组件不再 mount
import { listTeams, type TeamRecord } from '../../api/teams';
import { useI18n } from '../../common/i18n';

interface WorkspaceSelectorProps {
  collapsed?: boolean;
}

export function WorkspaceSelector({ collapsed }: WorkspaceSelectorProps) {
  const { t } = useI18n();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentId  = useWorkspaceStore((s) => s.currentId);
  const currentTeam = useWorkspaceStore((s) => s.currentTeam);
  const switchTo   = useWorkspaceStore((s) => s.switchTo);
  const setCurrentTeam = useWorkspaceStore((s) => s.setCurrentTeam);
  const fetchWs    = useWorkspaceStore((s) => s.fetchWorkspaces);
  const navigate   = useNavigate();

  const [open, setOpen]           = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  // Teams in the current workspace — lazy loaded when dropdown opens so we
  // don't pay the Python round-trip for users who never open the switcher.
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTeamsLoaded(false);
    listTeams(currentId ?? undefined)
      .then((data) => { if (alive) { setTeams(data); setTeamsLoaded(true); } })
      .catch(() => { if (alive) { setTeams([]); setTeamsLoaded(true); } });
    return () => { alive = false; };
  }, [open, currentId]);

  const wrapRef    = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workspaces.length === 0) fetchWs().catch(() => {});
  }, [workspaces.length, fetchWs]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const getInit = (name: string) => {
    const a = Array.from(name);
    return a.length >= 2 ? a[0] + a[1] : (a[0] ?? '?');
  };
  // 不再回退 workspaces[0]：currentId 为 null = ShadowFlow 根（未选工作区），
  // 此时 current=undefined，触发器显示品牌 "ShadowFlow"、根态副标题、不显示某个
  // 工作区的计数（取消默认工作区设计）。
  const current = workspaces.find((w) => w.workspace_id === currentId);
  const atRoot  = !current && !currentTeam;
  const color   = current?.color || 'var(--t-accent)';
  // 选了 team 就让触发器显示 team（名字 + 字头），否则显示 workspace；都没有=根。
  const displayName = currentTeam?.name ?? current?.name ?? 'ShadowFlow';
  const init    = getInit(displayName);

  function handleClick() {
    if (collapsed && triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  // ── Dropdown content (shared between portal and inline) ─────────────────────
  const dropdownContent = (
    <div
      ref={dropRef}
      style={{
        ...(collapsed && anchorRect
          ? { position: 'fixed', top: anchorRect.top, left: anchorRect.right + 8 }
          : { position: 'absolute', top: 'calc(100% + 6px)', left: 0 }),
        minWidth: 220, background: 'var(--t-panel)',
        border: '1px solid var(--t-border)', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        zIndex: 9999, padding: '6px',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      {/* 2026-05-28 — 单一团队列表（用户语义：workspace=team 是一回事）
          原来上下两区（workspace items + teams items）合并成一区。
          点 team item：切到该 team 所属 workspace + 留在当前页，不 navigate。
          这样用户从任意页（chat/agent/run-session/...）切团队都不会被踢走。 */}
      {/* 回到 ShadowFlow 根目录：清空 workspace + team 选择。根态不显示任何 agent，
          agent 只在进入某个工作区后出现（取消默认工作区设计）。 */}
      <button
        type="button"
        onClick={() => { switchTo(null); setCurrentTeam(null); setOpen(false); }}
        data-testid="workspace-dropdown-root"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
          border: atRoot ? '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)' : '1px solid transparent',
          background: atRoot ? 'color-mix(in oklab, var(--t-accent) 12%, var(--t-panel))' : 'transparent',
          width: '100%', textAlign: 'left',
          color: atRoot ? 'var(--t-accent)' : 'var(--t-fg-2)', fontSize: 12,
          fontWeight: atRoot ? 700 : 500,
        }}
      >
        <span style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          background: 'color-mix(in oklab, var(--t-accent) 18%, var(--t-panel-2))',
          border: '1px solid color-mix(in oklab, var(--t-accent) 45%, transparent)',
          color: 'var(--t-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 10, letterSpacing: '-0.03em',
        }}>SF</span>
        <span style={{ flex: 1 }}>ShadowFlow</span>
        {atRoot && <span style={{ fontSize: 10, color: 'var(--t-accent)' }}>✓</span>}
      </button>

      <div style={{ padding: '8px 8px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users size={11} strokeWidth={2} aria-hidden style={{ color: 'var(--t-fg-4)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {t('workspace.myTeams') || '我的团队'} · {teamsLoaded ? teams.length : '…'}
        </span>
      </div>

      {teamsLoaded && teams.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)' }}>
          {t('workspace.noTeams') || '还没有团队'}
        </div>
      )}

      {/* 已选 team 时给一行"显示全部会话" —— 复位 currentTeam，chat 回到 workspace
          全量会话视图。否则用户选了 team 后没法退回看全部。 */}
      {currentTeam && (
        <button
          type="button"
          onClick={() => { setCurrentTeam(null); setOpen(false); }}
          data-testid="workspace-dropdown-all"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid transparent', background: 'transparent',
            width: '100%', textAlign: 'left', color: 'var(--t-fg-4)', fontSize: 12,
          }}
        >
          <span style={{
            width: 30, height: 30, borderRadius: 7, flexShrink: 0,
            background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={13} strokeWidth={2} style={{ color: 'var(--t-fg-4)' }} />
          </span>
          <span style={{ flex: 1 }}>{t('workspace.allConversations') || '显示全部会话'}</span>
        </button>
      )}

      {teams.map((tm) => {
        const on = tm.team_id === currentTeam?.team_id;
        const c  = current?.color || 'var(--t-accent)';
        const i  = getInit(tm.name);
        return (
          <button
            key={tm.team_id}
            type="button"
            // 选中 team = 设为 currentTeam（chat 据此过滤会话 + 显示成员）。
            // 若该 team 属于别的 workspace，先把 workspace 切过去再设 team
            // （switchTo 会清 currentTeam，所以顺序：先 switchTo 再 setCurrentTeam）。
            onClick={() => {
              if (tm.workspace_id && tm.workspace_id !== currentId) {
                switchTo(tm.workspace_id);
              }
              setCurrentTeam({ team_id: tm.team_id, name: tm.name, agent_ids: tm.agent_ids ?? [] });
              setOpen(false);
            }}
            data-testid={`workspace-dropdown-team-${tm.team_id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
              border: on ? `1px solid color-mix(in oklab, ${c} 40%, transparent)` : '1px solid transparent',
              background: on ? `color-mix(in oklab, ${c} 12%, var(--t-panel))` : 'transparent',
              width: '100%', textAlign: 'left', transition: 'all 100ms ease',
            }}
          >
            <span style={{
              width: 30, height: 30, borderRadius: 7,
              background: `color-mix(in oklab, ${c} 18%, var(--t-panel-2))`,
              border: `1px solid color-mix(in oklab, ${c} 45%, transparent)`,
              color: c, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: i.length > 1 ? 10.5 : 12.5,
              letterSpacing: '-0.03em', flexShrink: 0,
            }}>{i}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: on ? 700 : 500, color: on ? c : 'var(--t-fg-2)' }}>
              {tm.name}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)',
              padding: '1px 5px', borderRadius: 3, background: 'var(--t-panel-2)',
              border: '1px solid var(--t-border)', flexShrink: 0,
            }}>
              {tm.agent_ids?.length ?? 0}A
            </span>
          </button>
        );
      })}

      {/* 兜底：teams 列表为空且 workspaces 也未加载时显示 workspace 名 */}
      {workspaces.length === 0 && !teamsLoaded && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>
          ShadowFlow · Default
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--t-border)', marginTop: 4, paddingTop: 4 }}>
        <button
          type="button"
          // workspace 和 team 合并语义后，"新建" 意为创建一个新团队。当前没有
          // CreateTeamModal 易复用入口，先跳 /teams 走 TeamPage 的新建流程。
          onClick={() => { setOpen(false); navigate('/teams'); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid transparent', background: 'transparent',
            width: '100%', textAlign: 'left', color: 'var(--t-fg-4)', fontSize: 12,
          }}
        >
          <span style={{
            width: 20, height: 20, borderRadius: 5,
            border: '1.5px dashed var(--t-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0, color: 'var(--t-fg-5)',
          }}>+</span>
          {t('workspace.createTeam') || '新建团队'}
        </button>
      </div>
    </div>
  );

  // ── Collapsed: icon-only, dropdown opens via portal to the right ─────────────
  if (collapsed) {
    return (
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div
          ref={triggerRef}
          data-testid="org-switcher-trigger"
          onClick={handleClick}
          title={displayName}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '3px 0' }}
        >
          <span style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: init.length > 1 ? 10 : 13,
            background: `color-mix(in oklab, ${color} 22%, var(--t-panel-2))`,
            border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
            color: color, letterSpacing: '-0.03em',
          }}>{init}</span>
        </div>
        {open && createPortal(dropdownContent, document.body)}
      </div>
    );
  }

  // ── Expanded: full card, dropdown inline (sidebar is wide enough) ────────────
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        ref={triggerRef}
        data-testid="org-switcher-trigger"
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 9px', borderRadius: 8,
          background: 'var(--t-panel-2)', border: '1px solid var(--t-border)',
          cursor: 'pointer', width: '100%',
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: init.length > 1 ? 10 : 13,
          background: `color-mix(in oklab, ${color} 22%, var(--t-panel-2))`,
          border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
          color: color, letterSpacing: '-0.03em',
        }}>{init}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentTeam
              ? `${currentTeam.agent_ids.length} agents · ${current?.name ?? 'Workspace'}`
              : current
                ? `${current.agent_count} agents · ${current.team_count} teams`
                : '选择或新建工作区'}
          </div>
        </div>
        <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--t-fg-4)', flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>

      {open && dropdownContent}
    </div>
  );
}

/** @deprecated use WorkspaceSelector instead */
export { WorkspaceSelector as WorkspaceStrip };
