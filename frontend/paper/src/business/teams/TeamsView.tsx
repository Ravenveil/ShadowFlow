/**
 * TeamsView — 管理团队（工作台子页）。
 *
 * 数据是两路的并集：
 *   1. 内置模板（`./templates.ts`）：后端一个团队都没有时，也照样能看完整工作流；
 *   2. 后端团队（`/api/teams`）：工作流与策略矩阵真存真取，矩阵改完能落库。
 *
 * 选哪支团队由第二栏（TeamPane）决定，这页受 `selected` 控制，不再自己摆一排选卡：
 * 页头直接就是那支团队的名字，下面依次是成员、工作流、策略矩阵。
 * 内置模板没有后端记录 → 不给策略矩阵（没有可写的地方，就不摆假开关）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SUBVIEW, TEAMS } from '@/shared/content/views';
import { getAgents, getTeams, type AgentBrief, type TeamRecord } from '@/shared/data/http/generic';
import {
  getTeamPolicy,
  getTeamWorkflow,
  saveTeamPolicy,
  type TeamWorkflowGraph,
} from '@/shared/data/http/teams';
import { PAGE_DAG, flowLayout, rosterOfIds, toDag, toPolicy } from '@/shared/data/http/mappers';
import type { DagDataset, PolicyMatrix as Matrix, RosterMember } from '@/shared/data/types';
import { DagFlow } from '@/runtime/panel/DagFlow';
import { PolicyMatrix } from '@/runtime/panel/PolicyMatrix';
import { AVATAR_SIZE, AgentAvatar } from '@/shared/ui/avatar';
import { DEFAULT_TEAMS, builtinKey, teamKey, type TeamTemplate } from './templates';

type LoadState = 'loading' | 'ready' | 'error';

/** 当前选中的团队：内置模板与后端记录在这里收敛成同一个形状。 */
interface ActiveTeam {
  name: string;
  description: string;
  roster: RosterMember[];
  /** 后端团队 id；内置模板为 null（没有可写的目的地）。 */
  backendId: string | null;
}

/** 模板里的成员是角色名，不是 agent id：id 就用名字，图上的 owner 也是它。 */
function templateRoster(team: TeamTemplate): RosterMember[] {
  return team.members.map((m) => ({
    id: m.name,
    name: m.name,
    role: m.role,
    short: m.name.slice(0, 2),
  }));
}

const EMPTY_DAG: DagDataset = {
  canvas: { w: PAGE_DAG.w, h: PAGE_DAG.minH },
  nodes: [],
  edges: [],
};

export default function TeamsView({ selected }: { selected?: string }) {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [agents, setAgents] = useState<AgentBrief[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  /** 后端团队的工作流 + 策略（内置模板不走这两条）。 */
  const [workflow, setWorkflow] = useState<TeamWorkflowGraph | null>(null);
  const [detail, setDetail] = useState<LoadState>('ready');
  const [draft, setDraft] = useState<Matrix>({});
  const [saved, setSaved] = useState<Matrix>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(() => {
    setState('loading');
    setNotice(null);
    Promise.all([
      // 后端团队取不到不该拖垮整页：内置模板是前端常量，照样能看。
      getTeams().catch(() => [] as TeamRecord[]),
      // 成员名册同理：拿不到就把名字回落成 agent id。
      getAgents().catch(() => [] as AgentBrief[]),
    ])
      .then(([list, roster]) => {
        setTeams(Array.isArray(list) ? list : []);
        setAgents(roster);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load, reload]);

  /** 第二栏还没点亮任何一项时，先按第一支模板渲染（避免首帧空白）。 */
  const activeKey = selected ?? (DEFAULT_TEAMS[0] ? builtinKey(DEFAULT_TEAMS[0]) : '');
  const template = DEFAULT_TEAMS.find((t) => builtinKey(t) === activeKey) ?? null;
  const record = teams.find((t) => teamKey(t) === activeKey) ?? null;

  const active = useMemo<ActiveTeam | null>(() => {
    if (template) {
      return {
        name: template.name,
        description: template.description,
        roster: templateRoster(template),
        backendId: null,
      };
    }
    if (record) {
      return {
        name: record.name,
        description: record.description ?? '',
        roster: rosterOfIds(agents, record.agent_ids ?? []),
        backendId: teamKey(record) || null,
      };
    }
    return null;
  }, [template, record, agents]);

  const backendId = active?.backendId ?? null;

  /** 换团队就重新取工作流与策略；内置模板直接跳过。 */
  useEffect(() => {
    setNotice(null);
    if (!backendId) {
      setWorkflow(null);
      setDraft({});
      setSaved({});
      setDetail('ready');
      return;
    }
    let dead = false;
    setDetail('loading');
    Promise.all([getTeamWorkflow(backendId), getTeamPolicy(backendId)])
      .then(([graph, matrix]) => {
        if (dead) return;
        const clean = toPolicy(matrix);
        setWorkflow(graph);
        setDraft(clean);
        setSaved(clean);
        setDetail('ready');
      })
      .catch(() => {
        if (!dead) setDetail('error');
      });
    return () => {
      dead = true;
    };
  }, [backendId]);

  const dag = useMemo(() => {
    if (!active) return EMPTY_DAG;
    const graph = active.backendId ? workflow : template?.workflow ?? null;
    return flowLayout(toDag(graph, active.roster, PAGE_DAG), PAGE_DAG);
  }, [active, workflow, template]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  /** 一改就撤掉「已保存」：那句提示只对上一版成立。 */
  function changePolicy(next: Matrix) {
    setDraft(next);
    setNotice(null);
  }

  async function submitPolicy() {
    if (!backendId) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveTeamPolicy(backendId, draft);
      setSaved(draft);
      setNotice(TEAMS.savedPolicy);
    } catch {
      setNotice(TEAMS.savePolicyFailed);
    } finally {
      setSaving(false);
    }
  }

  if (state === 'error') {
    return (
      <section className="subview">
        <div className="subview-state">
          <span>{TEAMS.loadFailed}</span>
          <button className="subview-btn" type="button" onClick={() => setReload((n) => n + 1)}>
            {SUBVIEW.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="subview">
      <header className="subview-head">
        <h1 className="subview-title">{active?.name ?? TEAMS.title}</h1>
        {active?.description ? <p className="subview-blurb">{active.description}</p> : null}
      </header>

      {active ? (
        <div className="subview-detail">
          <section className="subview-section">
            <div className="tv-sec-head">
              <h2>
                {TEAMS.members} · {active.roster.length}
              </h2>
            </div>
            {active.roster.length === 0 ? (
              <div className="subview-state">{TEAMS.noMembers}</div>
            ) : (
              <div className="tv-members">
                {active.roster.map((m) => (
                  <div className="tv-member" key={m.id}>
                    <AgentAvatar label={m.role} size={AVATAR_SIZE.team} status={false} />
                    <span className="tv-member-text">
                      <b>{m.name}</b>
                      <span>{m.role}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="subview-section">
            <div className="tv-sec-head">
              <h2>{TEAMS.workflow}</h2>
            </div>
            {detail === 'loading' && <div className="subview-state">{SUBVIEW.loading}</div>}
            {detail === 'error' && <div className="subview-state">{TEAMS.loadFailed}</div>}
            {detail === 'ready' &&
              (dag.nodes.length === 0 ? (
                <div className="subview-state">{TEAMS.noWorkflow}</div>
              ) : (
                <div className="tv-dag">
                  <DagFlow
                    nodes={dag.nodes}
                    edges={dag.edges}
                    canvas={dag.canvas}
                    policy={backendId ? draft : {}}
                    roster={active.roster}
                  />
                </div>
              ))}
          </section>

          {backendId && detail === 'ready' ? (
            <section className="subview-section">
              <div className="tv-sec-head">
                <h2>{TEAMS.policy}</h2>
                <span className="tv-sec-actions">
                  {notice ? <span className="subview-tag">{notice}</span> : null}
                  <button
                    type="button"
                    className="subview-btn"
                    disabled={!dirty || saving}
                    onClick={() => void submitPolicy()}
                  >
                    {saving ? TEAMS.savingPolicy : TEAMS.savePolicy}
                  </button>
                </span>
              </div>
              <PolicyMatrix roster={active.roster} value={draft} onChange={changePolicy} />
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
