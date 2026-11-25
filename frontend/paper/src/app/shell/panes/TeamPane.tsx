/**
 * TeamPane — 「管理团队」的第二栏：这页要选的是**哪个团队**。
 *
 * 内置模板（前端常量）与后端团队排在同一列：模板是随时能看的样板，
 * 后端团队是真能在页里改策略的实体，两者在右侧详情页收敛成同一个形状。
 * 这一栏只负责「选谁」，成员、工作流、策略矩阵都在右边。
 */
import { useCallback, useEffect, useState } from 'react';
import { PANE, TEAMS } from '@/shared/content/views';
import { getAgents, getTeams, type AgentBrief, type TeamRecord } from '@/shared/data/http/generic';
import { rosterOfIds } from '@/shared/data/http/mappers';
import { AvatarStack, AVATAR_SIZE } from '@/shared/ui/avatar';
import { DEFAULT_TEAMS, builtinKey, isTeam, teamKey } from '@/business/teams/templates';

type LoadState = 'loading' | 'ready' | 'error';

export function TeamPane({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (key: string) => void;
}) {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [agents, setAgents] = useState<AgentBrief[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  const load = useCallback(() => {
    setState('loading');
    // 后端取不到不算错：内置模板照样可选，右侧详情也不受影响。
    Promise.all([
      getTeams().catch(() => [] as TeamRecord[]),
      getAgents().catch(() => [] as AgentBrief[]),
    ])
      .then(([list, roster]) => {
        setTeams(Array.isArray(list) ? list : []);
        setAgents(roster);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(load, [load]);

  /** 没有任何选中时点亮第一项：右侧总得有一支团队可看。 */
  useEffect(() => {
    if (selected || !DEFAULT_TEAMS.length) return;
    onPick(builtinKey(DEFAULT_TEAMS[0]));
  }, [selected, onPick]);

  return (
    <aside className="pane" aria-label={PANE.teams}>
      <div className="pane-scroll">
        {state === 'loading' ? <div className="pane-state">{PANE.loading}</div> : null}
        {state === 'error' ? <div className="pane-state">{PANE.loadFailed}</div> : null}

        {DEFAULT_TEAMS.map((t) => {
          const key = builtinKey(t);
          const roster = t.members.map((m) => m.name);
          return (
            <button
              key={key}
              type="button"
              className="pane-row"
              data-active={key === selected ? 'true' : undefined}
              aria-pressed={key === selected}
              onClick={() => onPick(key)}
            >
              <span className="pane-row-face">
                <AvatarStack labels={roster} max={3} size={AVATAR_SIZE.list} showRest={false} />
              </span>
              <span className="pane-row-text">
                <strong>{t.name}</strong>
                <small>
                  {roster.length} {PANE.memberUnit} · {TEAMS.builtinTag}
                </small>
              </span>
            </button>
          );
        })}

        {teams.map((t) => {
          const key = teamKey(t);
          const roster = rosterOfIds(agents, t.agent_ids ?? []);
          // 一位成员的不是团队，是某个 agent 的分身：不进这一列。
          if (!isTeam(roster.length)) return null;
          return (
            <button
              key={key}
              type="button"
              className="pane-row"
              data-active={key === selected ? 'true' : undefined}
              aria-pressed={key === selected}
              onClick={() => onPick(key)}
            >
              <span className="pane-row-face">
                <AvatarStack
                  labels={roster.map((m) => m.role)}
                  max={3}
                  size={AVATAR_SIZE.list}
                  showRest={false}
                />
              </span>
              <span className="pane-row-text">
                <strong>{t.name}</strong>
                <small>
                  {roster.length} {PANE.memberUnit}
                </small>
              </span>
            </button>
          );
        })}

        {state === 'ready' && !teams.length && !DEFAULT_TEAMS.length ? (
          <div className="pane-state">{PANE.emptyTeams}</div>
        ) : null}
      </div>
    </aside>
  );
}
