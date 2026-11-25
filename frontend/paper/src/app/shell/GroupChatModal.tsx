/**
 * GroupChatModal — 「发起群聊」选人式模态（搬 legacy NeoCreateGroupModal 的主链路）。
 *
 * legacy 三条建群路里，paper 保留两条真的：
 *   1. 勾选成员 → 建群（勾选恰好等于某团队 roster 时由后端挂 team）；
 *   2. 团队模板「一键使用」→ fork 落 agent + team → 建群挂 team_id。
 * 论文专家团一键开跑依赖本机 CLI 安装态，那一段留在 legacy（paper 用模板路覆盖）。
 *
 * 群名可空：留空用成员名拼接（≤3 个 +N），微信同款。
 */
import { useEffect, useMemo, useState } from 'react';
import { LIST } from '@/shared/content/app';
import { listCatalogTeamApps, type CatalogTeamApp } from '@/shared/data/http/generic';
import { getAgents, type AgentBrief } from '@/shared/data/http/generic';
import { getTeams, type TeamRecord } from '@/shared/data/http/generic';
import { rosterOfIds } from '@/shared/data/http/mappers';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { IconClose, IconSearch } from '@/shared/ui/icons';

export function GroupChatModal({
  onClose,
  onCreated,
  createGroupChat,
  useTeamTemplate,
}: {
  onClose: () => void;
  onCreated: (groupId: string) => void;
  createGroupChat: (input: { name?: string; agentIds: string[]; teamId?: string }) => Promise<string>;
  useTeamTemplate: (appId: string) => Promise<string>;
}) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [agents, setAgents] = useState<AgentBrief[]>([]);
  const [templates, setTemplates] = useState<CatalogTeamApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 任一路取失败都按空处理：模态不能因为一路 404 就整块不可用。
    Promise.all([
      getTeams().catch(() => [] as TeamRecord[]),
      getAgents().catch(() => [] as AgentBrief[]),
      listCatalogTeamApps().catch(() => [] as CatalogTeamApp[]),
    ]).then(([teamRows, agentRows, tplRows]) => {
      if (!alive) return;
      setTeams(teamRows);
      setAgents(agentRows);
      setTemplates(tplRows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Esc 关闭（创建中禁用，对齐 legacy）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => (a.name ?? '').toLowerCase().includes(q));
  }, [agents, query]);

  const pickedAgents = useMemo(
    () => agents.filter((a) => picked.has(a.agent_id)),
    [agents, picked],
  );

  /** 群名回退：成员名拼接（≤3 +N），微信同款。 */
  const fallbackName = useMemo(() => {
    const names = pickedAgents.map((a) => a.name);
    if (!names.length) return '';
    const head = names.slice(0, 3).join('、');
    return names.length > 3 ? `${head} +${names.length - 3}` : head;
  }, [pickedAgents]);

  /** 整队判定：勾选集合恰好等于某团队 roster → 群挂该团队（语义与 legacy 一致）。 */
  const matchedTeam = useMemo(() => {
    if (!picked.size) return null;
    return teams.find((tm) => {
      const ids = tm.agent_ids ?? [];
      return ids.length === picked.size && ids.every((id) => picked.has(id));
    }) ?? null;
  }, [teams, picked]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAll = (on: boolean) => {
    setPicked(on ? new Set<string>(filtered.map((a) => a.agent_id)) : new Set<string>());
  };

  const canSubmit = !busy && !loading && picked.size > 0;

  async function handleCreate() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const gid = await createGroupChat({
        name: name.trim() || fallbackName || LIST.groupFallbackName,
        agentIds: [...picked],
        teamId: matchedTeam ? matchedTeam.team_id ?? matchedTeam.id : undefined,
      });
      onCreated(gid);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function handleUseTemplate(appId: string) {
    if (busy || forkingId) return;
    setForkingId(appId);
    setError(null);
    try {
      const gid = await useTeamTemplate(appId);
      onCreated(gid);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setForkingId(null);
    }
  }

  return (
    <div className="sf-modal-mask" onClick={() => !busy && onClose()}>
      <div
        className="sf-modal"
        role="dialog"
        aria-modal="true"
        aria-label={LIST.newGroup}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sf-modal-head">
          <h2>{LIST.newGroup}</h2>
          <button className="sf-icon-btn" onClick={onClose} aria-label={LIST.cancel}>
            <IconClose size={15} />
          </button>
        </div>

        {templates.length > 0 ? (
          <div className="gk-templates">
            {templates.map((tpl) => (
              <div className="gk-tpl" key={tpl.app_id}>
                <div className="gk-tpl-main">
                  <strong>{tpl.name}</strong>
                  {tpl.goal ? <span>{tpl.goal}</span> : null}
                </div>
                <button
                  type="button"
                  className="subview-btn"
                  disabled={busy || forkingId !== null}
                  onClick={() => void handleUseTemplate(tpl.app_id)}
                >
                  {forkingId === tpl.app_id ? LIST.groupPreparing : LIST.groupUseTemplate}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="sf-modal-hint">{LIST.loading}</div>
        ) : agents.length === 0 ? (
          <div className="sf-modal-hint">{LIST.groupNoAgents}</div>
        ) : (
          <>
            <div className="gk-chips">
              {pickedAgents.length === 0 ? (
                <span className="gk-chips-hint">{LIST.groupPickHint}</span>
              ) : (
                pickedAgents.map((a) => (
                  <span className="gk-chip" key={a.agent_id}>
                    <AgentAvatar label={a.name} size={AVATAR_SIZE.xs} />
                    <span>{a.name}</span>
                    <button type="button" onClick={() => toggle(a.agent_id)} disabled={busy} aria-label={a.name}>
                      <IconClose size={11} />
                    </button>
                  </span>
                ))
              )}
              {matchedTeam ? <span className="gk-team-tag">{matchedTeam.name}</span> : null}
            </div>

            <input
              className="slist-input"
              value={name}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void handleCreate(); }}
              placeholder={fallbackName || LIST.groupNamePlaceholder}
              aria-label={LIST.groupNamePlaceholder}
            />

            <div className="gk-search-row">
              <label className="gk-search">
                <IconSearch size={13} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                  placeholder={LIST.searchPlaceholder}
                  aria-label={LIST.searchPlaceholder}
                />
              </label>
              <button
                type="button"
                className="subview-btn"
                disabled={busy || filtered.length === 0}
                onClick={() => setAll(filtered.some((a) => !picked.has(a.agent_id)))}
              >
                {filtered.every((a) => picked.has(a.agent_id)) ? LIST.groupClearAll : LIST.groupSelectAll}
              </button>
            </div>

            <div className="gk-roster">
              {filtered.map((a) => {
                const on = picked.has(a.agent_id);
                const role = rosterOfIds(agents, [a.agent_id])[0]?.role ?? '';
                return (
                  <button
                    type="button"
                    className="gk-row"
                    key={a.agent_id}
                    data-on={on ? 'true' : undefined}
                    onClick={() => toggle(a.agent_id)}
                    disabled={busy}
                  >
                    <AgentAvatar label={a.name} size={AVATAR_SIZE.sm} />
                    <span className="gk-row-text">
                      <strong>{a.name}</strong>
                      <small>{role}</small>
                    </span>
                    <i className="gk-check" data-on={on ? 'true' : undefined} />
                  </button>
                );
              })}
            </div>

            {error ? <div className="sf-modal-error">{error}</div> : null}

            <div className="sf-modal-actions">
              <button type="button" className="subview-btn" onClick={onClose} disabled={busy}>
                {LIST.cancel}
              </button>
              <button
                type="button"
                className="subview-btn"
                data-primary="true"
                disabled={!canSubmit}
                onClick={() => void handleCreate()}
              >
                {busy ? LIST.groupCreating : LIST.groupCreateConfirm}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
