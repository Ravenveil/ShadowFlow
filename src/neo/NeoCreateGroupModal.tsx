/**
 * NeoCreateGroupModal — Neo 化「新建群聊」模态（2026-08-22 第二轮 GAP D）。
 *
 * 对齐 NeoCreateAgentModal 形态：遮罩 + 白卡，名称输入 + 成员来源二选一
 * （绑定团队 / 勾选若干 Agent）+ 取消/创建主钮。
 *
 * 提交走真实 POST /api/groups（createGroup，src/api/groupApi.ts）：
 *   - 团队模式：team_id + 该团队 roster 作为 agent_ids，群即团队干活现场
 *     （群聊网关 server/src/routes/groups-chat.ts 按 group.team_id 触发 DAG）；
 *   - Agent 模式：勾选 ≥1 个 agent，不绑 team；
 *   - 名称为空时回退团队名 / 勾选 Agent 名拼接，不发明契约外字段。
 * 成功 → onCreated（父级跳群聊现场并刷新 inbox）；失败 → 模态内红条展示
 * 真实错误。无团队且无 Agent 可拉时给明确空态并禁用提交。
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users, UsersRound } from 'lucide-react';
import { createGroup } from '../api/groupApi';
import { listTeams, type TeamRecord } from '../api/teams';
import { listAgents, type AgentRecord } from '../api/agents';
import { useI18n } from '../common/i18n';

export interface NeoCreateGroupModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (group: { groupId: string; name: string }) => void;
}

type MemberMode = 'team' | 'agents';

/** 错误文案：后端 detail 字符串优先，拿不到退回 err.message。 */
function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function NeoCreateGroupModal({ workspaceId, onClose, onCreated }: NeoCreateGroupModalProps) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  const [name, setName] = useState('');
  const [mode, setMode] = useState<MemberMode>('team');
  const [teamId, setTeamId] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [agents, setAgents] = useState<AgentRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 团队 / Agent 列表独立结算：任一失败按空列表处理（空态兜底，不拖垮另一路）。
  useEffect(() => {
    let alive = true;
    listTeams(workspaceId ?? undefined)
      .then((rows) => { if (alive) setTeams(rows); })
      .catch(() => { if (alive) setTeams([]); });
    listAgents(workspaceId ?? undefined)
      .then((rows) => { if (alive) setAgents(rows); })
      .catch(() => { if (alive) setAgents([]); });
    return () => { alive = false; };
  }, [workspaceId]);

  const teamList = teams ?? [];
  const agentList = agents ?? [];
  const loading = teams === null || agents === null;
  const empty = !loading && teamList.length === 0 && agentList.length === 0;

  // 团队列表到位后默认选中第一个；无团队时自动落到 Agent 模式。
  useEffect(() => {
    if (teams === null) return;
    if (teams.length > 0) {
      setMode((m) => m);
      setTeamId((id) => (teams.some((tm) => tm.team_id === id) ? id : teams[0].team_id));
    } else {
      setMode('agents');
      setTeamId('');
    }
  }, [teams]);

  const selectedTeam = teamList.find((tm) => tm.team_id === teamId) ?? null;

  /** 名称为空时的回退：团队名 / 勾选 Agent 名拼接（≤3 个，多了 +N）。 */
  const fallbackName = useMemo(() => {
    if (mode === 'team') return selectedTeam?.name ?? '';
    const names = agentList.filter((a) => picked.has(a.agent_id)).map((a) => a.name);
    if (names.length === 0) return '';
    const head = names.slice(0, 3).join('、');
    return names.length > 3 ? `${head} +${names.length - 3}` : head;
  }, [mode, selectedTeam, agentList, picked]);

  // Esc 关闭（创建中禁用，对齐 NeoCreateAgentModal）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const toggleAgent = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit =
    !busy && !loading && !empty &&
    (mode === 'team' ? selectedTeam !== null : picked.size > 0);

  async function handleCreate() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const agentIds = mode === 'team' ? (selectedTeam?.agent_ids ?? []) : [...picked];
    try {
      const group = await createGroup({
        templateId: 'new-task',
        groupTemplateId: '',
        name: name.trim() || fallbackName || (zh ? '新群聊' : 'New group'),
        agentIds,
        memberEmails: [],
        policyMatrix: {},
        workspaceId: workspaceId ?? undefined,
        teamId: mode === 'team' ? selectedTeam?.team_id : undefined,
      });
      onCreated({ groupId: group.groupId, name: group.name });
    } catch (err) {
      setError(errorMessageOf(err));
      setBusy(false);
    }
  }

  return (
    <div
      className="neo-modal-mask"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="neo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('neo.newGroup.title', { defaultValue: zh ? '新建群聊' : 'New Group' })}
        onClick={(e) => e.stopPropagation()}
        data-testid="neo-create-group-modal"
      >
        <h2 className="neo-modal-title">
          {t('neo.newGroup.title', { defaultValue: zh ? '新建群聊' : 'New Group' })}
        </h2>

        {loading ? (
          <div className="neo-modal-hint" data-testid="neo-create-group-loading">
            {t('common.loading', { defaultValue: zh ? '加载中…' : 'Loading…' })}
          </div>
        ) : empty ? (
          <div className="neo-modal-hint" data-testid="neo-create-group-empty">
            {t('neo.newGroup.empty', {
              defaultValue: zh
                ? '还没有可拉进群的团队或 Agent —— 请先在「团队 / 员工」里创建一个'
                : 'No teams or agents to invite yet — create one first',
            })}
          </div>
        ) : (
          <>
            <label className="neo-modal-label" htmlFor="neo-new-group-name">
              {t('neo.newGroup.nameLabel', { defaultValue: zh ? '群名称' : 'Group name' })}
            </label>
            <input
              id="neo-new-group-name"
              className="neo-modal-input"
              value={name}
              autoFocus
              maxLength={100}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder={fallbackName || t('neo.newGroup.namePlaceholder', { defaultValue: zh ? '新群聊' : 'New group' })}
            />

            <div className="neo-modal-label neo-newgroup-mode-label">
              {t('neo.newGroup.membersLabel', { defaultValue: zh ? '拉谁进群' : 'Members' })}
            </div>
            <div className="neo-newgroup-modes" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'team'}
                className={`neo-newgroup-mode${mode === 'team' ? ' on' : ''}`}
                onClick={() => setMode('team')}
                disabled={busy || teamList.length === 0}
                data-testid="neo-new-group-mode-team"
              >
                <Users size={13} strokeWidth={1.8} aria-hidden />
                {t('neo.newGroup.modeTeam', { defaultValue: zh ? '整个团队' : 'A team' })}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'agents'}
                className={`neo-newgroup-mode${mode === 'agents' ? ' on' : ''}`}
                onClick={() => setMode('agents')}
                disabled={busy || agentList.length === 0}
                data-testid="neo-new-group-mode-agents"
              >
                <UsersRound size={13} strokeWidth={1.8} aria-hidden />
                {t('neo.newGroup.modeAgents', { defaultValue: zh ? '勾选 Agent' : 'Pick agents' })}
              </button>
            </div>

            {mode === 'team' ? (
              <select
                className="neo-modal-input neo-newgroup-select"
                value={teamId}
                disabled={busy}
                onChange={(e) => setTeamId(e.target.value)}
                aria-label={t('neo.newGroup.teamSelect', { defaultValue: zh ? '选择团队' : 'Select team' })}
                data-testid="neo-new-group-team-select"
              >
                {teamList.map((tm) => (
                  <option key={tm.team_id} value={tm.team_id}>
                    {tm.name}（{tm.agent_ids.length}）
                  </option>
                ))}
              </select>
            ) : (
              <div className="neo-newgroup-pick-list" data-testid="neo-new-group-agent-list">
                {agentList.map((a) => (
                  <label key={a.agent_id} className="neo-newgroup-pick-row">
                    <input
                      type="checkbox"
                      checked={picked.has(a.agent_id)}
                      disabled={busy}
                      onChange={() => toggleAgent(a.agent_id)}
                    />
                    <span className="neo-newgroup-pick-name">{a.name}</span>
                  </label>
                ))}
              </div>
            )}
            {mode === 'agents' && picked.size === 0 && (
              <div className="neo-modal-hint" data-testid="neo-new-group-pick-hint">
                {t('neo.newGroup.pickHint', {
                  defaultValue: zh ? '至少勾选一个 Agent' : 'Pick at least one agent',
                })}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="neo-modal-error" role="alert" data-testid="neo-create-group-error">
            {error}
          </div>
        )}
        <div className="neo-modal-actions">
          <button
            type="button"
            className="neo-modal-cancel"
            onClick={onClose}
            disabled={busy}
          >
            {t('common.cancel', { defaultValue: zh ? '取消' : 'Cancel' })}
          </button>
          <button
            type="button"
            className="neo-btn-primary"
            onClick={() => void handleCreate()}
            disabled={!canSubmit}
            data-testid="neo-create-group-submit"
          >
            {busy && <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />}
            {busy
              ? t('neo.newGroup.creating', { defaultValue: zh ? '创建中…' : 'Creating…' })
              : t('neo.newGroup.create', { defaultValue: zh ? '创建并进入' : 'Create & open' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoCreateGroupModal;
