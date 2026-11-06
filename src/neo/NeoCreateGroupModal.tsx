/**
 * NeoCreateGroupModal — 「发起群聊」选人式模态（2026-11-06 重做）。
 *
 * 旧版（2026-08-22）是「先选模式（整个团队 / 勾选 Agent）再填名」的表单，
 * 与竞品（微信/Grok Bot）的「建群 = 选人」心智不符。重做后：
 *   1) 顶部已选成员头像 chips（可 × 移除）——选了谁一目了然；
 *   2) 可搜索成员列表（头像 + 名称 + 勾选），支持全选/清空；
 *   3) 群名可空：留空自动用成员名拼接（≤3 个 +N），微信同款；
 *   4) 提交走既有 POST /api/groups（createGroup）：
 *      - 单人 → DM 语义（group kind=dm 由后端按 agent_ids 数量判定）；
 *      - 团队全选（勾选恰好等于某团队 roster）→ 附带 team_id，群即团队现场；
 *      - 其余 → 自由群。
 * 成功 → onCreated（父级跳群聊现场并刷新 inbox）；失败 → 模态内红条。
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, UsersRound, X } from 'lucide-react';
import { createGroup } from '../api/groupApi';
import { listTeams, type TeamRecord } from '../api/teams';
import { listAgents, type AgentRecord } from '../api/agents';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { useI18n } from '../common/i18n';

export interface NeoCreateGroupModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (group: { groupId: string; name: string }) => void;
}

/** 错误文案：后端 detail 字符串优先，拿不到退回 err.message。 */
function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function NeoCreateGroupModal({ workspaceId, onClose, onCreated }: NeoCreateGroupModalProps) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
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

  const agentList = useMemo(() => agents ?? [], [agents]);
  const loading = agents === null;
  const empty = !loading && agentList.length === 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agentList;
    return agentList.filter((a) => (a.name ?? '').toLowerCase().includes(q));
  }, [agentList, query]);

  const pickedAgents = useMemo(
    () => agentList.filter((a) => picked.has(a.agent_id)),
    [agentList, picked],
  );

  /** 群名回退：成员名拼接（≤3 +N），微信同款；留空提交时用它。 */
  const fallbackName = useMemo(() => {
    const names = pickedAgents.map((a) => a.name);
    if (names.length === 0) return '';
    const head = names.slice(0, 3).join('、');
    return names.length > 3 ? `${head} +${names.length - 3}` : head;
  }, [pickedAgents]);

  // 团队整选判定：勾选集合恰好等于某团队 roster → 群挂该团队（team_id），
  // 群聊网关按 group.team_id 跑团队 DAG（旧版「整个团队」模式的语义保留）。
  const matchedTeam = useMemo(() => {
    if (picked.size === 0) return null;
    return (teams ?? []).find((tm) => {
      const ids = tm.agent_ids ?? [];
      if (ids.length !== picked.size) return false;
      return ids.every((id) => picked.has(id));
    }) ?? null;
  }, [teams, picked]);

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

  const canSubmit = !busy && !loading && !empty && picked.size > 0;

  async function handleCreate() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const agentIds = [...picked];
    try {
      const group = await createGroup({
        templateId: 'new-task',
        groupTemplateId: '',
        name: name.trim() || fallbackName || (zh ? '新群聊' : 'New group'),
        agentIds,
        memberEmails: [],
        policyMatrix: {},
        workspaceId: workspaceId ?? undefined,
        teamId: matchedTeam?.team_id,
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
        aria-label={t('neo.newGroup.title', { defaultValue: zh ? '发起群聊' : 'New Group' })}
        onClick={(e) => e.stopPropagation()}
        data-testid="neo-create-group-modal"
      >
        <h2 className="neo-modal-title">
          {t('neo.newGroup.title', { defaultValue: zh ? '发起群聊' : 'New Group' })}
        </h2>

        {loading ? (
          <div className="neo-modal-hint" data-testid="neo-create-group-loading">
            {t('common.loading', { defaultValue: zh ? '加载中…' : 'Loading…' })}
          </div>
        ) : empty ? (
          <div className="neo-modal-hint" data-testid="neo-create-group-empty">
            {t('neo.newGroup.empty', {
              defaultValue: zh
                ? '还没有可拉进群的 Agent —— 请先创建一个员工'
                : 'No agents to invite yet — create one first',
            })}
          </div>
        ) : (
          <>
            {/* 已选成员 chips（微信式：选了谁一目了然，× 即移除） */}
            <div className="neo-ng-chips" data-testid="neo-new-group-chips">
              {pickedAgents.length === 0 ? (
                <span className="neo-ng-chips-hint">
                  {t('neo.newGroup.chipsEmpty', {
                    defaultValue: zh ? '在下方选择成员' : 'Pick members below',
                  })}
                </span>
              ) : (
                pickedAgents.map((a) => (
                  <span key={a.agent_id} className="neo-ng-chip" data-testid="neo-new-group-chip">
                    <AgentAvatar
                      name={a.name}
                      style={a.avatar_style}
                      seed={a.avatar_seed ?? a.name}
                      image={a.avatar_image ?? null}
                      size={18}
                    />
                    <span className="neo-ng-chip-name">{a.name}</span>
                    <button
                      type="button"
                      className="neo-ng-chip-x"
                      onClick={() => toggleAgent(a.agent_id)}
                      disabled={busy}
                      aria-label={t('neo.newGroup.removeMember', {
                        defaultValue: zh ? `移除 ${a.name}` : `Remove ${a.name}`,
                      })}
                      data-testid="neo-new-group-chip-x"
                    >
                      <X size={11} strokeWidth={2} aria-hidden />
                    </button>
                  </span>
                ))
              )}
              {pickedAgents.length > 0 && matchedTeam && (
                <span className="neo-ng-team-tag" data-testid="neo-new-group-team-tag">
                  {t('neo.newGroup.teamMatched', {
                    defaultValue: zh ? `${matchedTeam.name} 团队` : `${matchedTeam.name} team`,
                  })}
                </span>
              )}
            </div>

            {/* 群名（可空 → 成员名拼接） */}
            <input
              className="neo-modal-input"
              value={name}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) void handleCreate();
              }}
              placeholder={fallbackName || t('neo.newGroup.namePlaceholder', { defaultValue: zh ? '群名称（可留空）' : 'Group name (optional)' })}
              aria-label={t('neo.newGroup.nameLabel', { defaultValue: zh ? '群名称' : 'Group name' })}
              data-testid="neo-new-group-name"
            />

            {/* 搜索 + 全选/清空 */}
            <div className="neo-ng-search-row">
              <div className="neo-ng-search">
                <Search size={13} strokeWidth={1.9} aria-hidden className="neo-ng-search-icon" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('neo.newGroup.searchPlaceholder', { defaultValue: zh ? '搜索成员' : 'Search members' })}
                  aria-label={t('neo.newGroup.searchPlaceholder', { defaultValue: zh ? '搜索成员' : 'Search members' })}
                  data-testid="neo-new-group-search"
                />
              </div>
              <button
                type="button"
                className="neo-list-retry"
                disabled={busy || filtered.length === 0}
                onClick={() => {
                  setPicked((prev) => {
                    const allIn = filtered.every((a) => prev.has(a.agent_id));
                    const next = new Set(prev);
                    for (const a of filtered) {
                      if (allIn) next.delete(a.agent_id);
                      else next.add(a.agent_id);
                    }
                    return next;
                  });
                }}
                data-testid="neo-new-group-select-all"
              >
                {(() => {
                  const allIn = filtered.length > 0 && filtered.every((a) => picked.has(a.agent_id));
                  return allIn
                    ? t('neo.newGroup.clearAll', { defaultValue: zh ? '清空' : 'Clear' })
                    : t('neo.newGroup.selectAll', { defaultValue: zh ? '全选' : 'Select all' });
                })()}
              </button>
            </div>

            {/* 成员列表（头像 + 名称 + 勾选态） */}
            <div className="neo-ng-list" data-testid="neo-new-group-agent-list">
              {filtered.length === 0 ? (
                <div className="neo-modal-hint">
                  {t('neo.newGroup.noMatch', { defaultValue: zh ? '没有匹配的成员' : 'No matching members' })}
                </div>
              ) : (
                filtered.map((a) => {
                  const on = picked.has(a.agent_id);
                  return (
                    <button
                      key={a.agent_id}
                      type="button"
                      className={`neo-ng-row${on ? ' on' : ''}`}
                      disabled={busy}
                      onClick={() => toggleAgent(a.agent_id)}
                      data-testid="neo-new-group-agent-row"
                      data-agent-id={a.agent_id}
                      aria-pressed={on}
                    >
                      <AgentAvatar
                        name={a.name}
                        style={a.avatar_style}
                        seed={a.avatar_seed ?? a.name}
                        image={a.avatar_image ?? null}
                        size={28}
                      />
                      <span className="neo-ng-row-name">{a.name}</span>
                      {(a.soul ?? '') && <span className="neo-ng-row-soul">{a.soul}</span>}
                      <span className={`neo-ng-check${on ? ' on' : ''}`} aria-hidden>
                        <Check size={12} strokeWidth={2.5} />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
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
            {picked.size > 0 && (
              <UsersRound size={13} strokeWidth={1.8} aria-hidden style={{ marginRight: 4 }} />
            )}
            {busy
              ? t('neo.newGroup.creating', { defaultValue: zh ? '创建中…' : 'Creating…' })
              : picked.size > 0
                ? t('neo.newGroup.createN', { defaultValue: zh ? `发起(${picked.size})` : `Start (${picked.size})` })
                : t('neo.newGroup.create', { defaultValue: zh ? '发起群聊' : 'Start group' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoCreateGroupModal;
