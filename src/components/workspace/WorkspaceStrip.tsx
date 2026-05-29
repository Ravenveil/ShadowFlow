/**
 * WorkspaceStrip — top-of-sidebar workspace + team selector (FB-HiFi universal).
 *
 * Lives at the top of HfSidebar so every FB-HiFi page (chat, teams, agents,
 * calendar, projects) shares the same workspace/team context.
 *
 * 产品心智（对标钉钉）：**公司 = team**。一个 workspace（账号/租户）下可有多个
 * team；切 team 就像钉钉切公司，chat 列表随之只显示该 team 的群。下拉分两段：
 *   - 团队：切当前 workspace 下的 team（setCurrentTeam）—— 主操作
 *   - 工作区：切到另一个 workspace（switchTo，会清空 currentTeam）
 * 顶部按钮优先显示当前 team 名（未选 team 时回退 workspace 名）。
 *
 * Data: useWorkspaceStore (zustand, persisted: currentId + currentTeam) +
 * listTeams(currentId)。切 workspace 自动重拉 teams 并对账 currentTeam（团队
 * 已删则回退第一个）。
 */

import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore, selectCurrentWorkspace } from '../../store/workspaceStore';
import { listTeams, type TeamSummary } from '../../api/teams';
import { useI18n } from '../../common/i18n';

export function WorkspaceStrip() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const { workspaces, currentId, currentTeam, switchTo, setCurrentTeam, fetchWorkspaces } =
    useWorkspaceStore();
  const current = useWorkspaceStore(selectCurrentWorkspace);
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // 拉当前 workspace 的 teams（切 workspace 自动重拉），并对账 currentTeam。
  useEffect(() => {
    if (!currentId) {
      setTeams([]);
      return;
    }
    let alive = true;
    listTeams(currentId)
      .then((list) => {
        if (!alive) return;
        setTeams(list);
        // 对账：持久化的 currentTeam 不在最新列表里 → 回退第一个；在则用最新刷新。
        const match = currentTeam ? list.find((t) => t.team_id === currentTeam.team_id) : undefined;
        if (match) {
          if (
            match.name !== currentTeam!.name ||
            (match.agent_ids ?? []).length !== (currentTeam!.agent_ids ?? []).length
          ) {
            setCurrentTeam({ team_id: match.team_id, name: match.name, agent_ids: match.agent_ids ?? [] });
          }
        } else if (list.length > 0) {
          const f = list[0];
          setCurrentTeam({ team_id: f.team_id, name: f.name, agent_ids: f.agent_ids ?? [] });
        } else {
          setCurrentTeam(null);
        }
      })
      .catch(() => {
        if (alive) setTeams([]);
      });
    return () => {
      alive = false;
    };
    // currentTeam 故意不进依赖：只在 workspace 切换时重拉/对账，避免循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // 点外部关闭
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const wsName = current?.name ?? T('我的工作区', 'My workspace');
  // 顶部主标题：优先 team 名（= 当前「公司」），未选 team 回退 workspace 名。
  const title = currentTeam?.name ?? wsName;
  const subtitle = currentTeam
    ? `${(currentTeam.agent_ids ?? []).length} ${T('成员', 'members')} · ${wsName}`
    : `${current?.agent_count ?? 0} agents · ${current?.team_count ?? teams.length} teams`;

  const handlePickTeam = (tm: TeamSummary) => {
    setCurrentTeam({ team_id: tm.team_id, name: tm.name, agent_ids: tm.agent_ids ?? [] });
    setOpen(false);
  };

  return (
    <div
      style={{ padding: '12px 12px 10px', borderBottom: '1px solid var(--t-border)', position: 'relative' }}
      ref={dropdownRef}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--t-border)',
          background: 'var(--t-panel-2)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            flexShrink: 0,
            background: 'var(--t-accent)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          {title.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--t-fg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>{subtitle}</div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--t-fg-4)' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 12,
            right: 12,
            zIndex: 50,
            marginTop: 4,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
            overflow: 'hidden',
            maxHeight: 380,
            overflowY: 'auto',
          }}
        >
          {/* ── 团队（= 公司）段 ───────────────────────────── */}
          <div
            style={{
              padding: '7px 12px 4px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-5)',
            }}
          >
            {T('团队', 'Teams')}
          </div>
          {teams.length === 0 ? (
            <div style={{ padding: '4px 12px 8px', fontSize: 12, color: 'var(--t-fg-4)' }}>
              {T('当前工作区暂无团队', 'No teams in this workspace')}
            </div>
          ) : (
            teams.map((tm) => (
              <button
                key={tm.team_id}
                onClick={() => handlePickTeam(tm)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background:
                    tm.team_id === currentTeam?.team_id ? 'var(--t-panel-2)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--t-fg)',
                }}
              >
                <span style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tm.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--t-fg-5)' }}>
                  {(tm.agent_ids ?? []).length}
                </span>
                {tm.team_id === currentTeam?.team_id && (
                  <span style={{ fontSize: 10, color: 'var(--t-accent)' }}>✓</span>
                )}
              </button>
            ))
          )}

          {/* ── 工作区段 ───────────────────────────────────── */}
          {workspaces.length > 1 && (
            <>
              <div style={{ height: 1, background: 'var(--t-border)', margin: '4px 0' }} />
              <div
                style={{
                  padding: '7px 12px 4px',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--t-fg-5)',
                }}
              >
                {T('工作区', 'Workspaces')}
              </div>
              {workspaces.map((ws) => (
                <button
                  key={ws.workspace_id}
                  onClick={() => {
                    // switchTo 在 id 变化时会清空 currentTeam；上面的 effect 会
                    // 按新 workspace 重拉 teams 并自动选第一个。
                    switchTo(ws.workspace_id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: ws.workspace_id === currentId ? 'var(--t-panel-2)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--t-fg)',
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12.5 }}>{ws.name}</span>
                  {ws.workspace_id === currentId && (
                    <span style={{ fontSize: 10, color: 'var(--t-accent)' }}>✓</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
