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
import { Check, Loader2, Search, Sparkles, FlaskConical, UsersRound, X } from 'lucide-react';
import { createGroup } from '../api/groupApi';
import { listTeams, type TeamRecord } from '../api/teams';
import { listAgents, type AgentRecord } from '../api/agents';
import { forkCatalogApp, listCatalogApps, type CatalogAppSummary } from '../api/catalog';
import { listDetectedClis } from '../api/cli';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { useI18n } from '../common/i18n';

export interface NeoCreateGroupModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (group: { groupId: string; name: string }) => void;
}

/**
 * 默认推荐团队（Auto Research Cloud · 论文专家团）。
 * 排在模板列表最前并打「默认」标：用户要的是「点一下就能开始写论文」，
 * 不该在模板市场里翻找。
 */
const FEATURED_APP_ID = 'app-auto-research-cloud';

/** AutoResearchClaw = 本机已注册的 23 阶段自动研究管线 CLI（GitHub 项目）。 */
const ARC_CLI_ID = 'autoresearchclaw';
/** 群级 executor 的 localStorage 键前缀（NeoGroupChat 发送时优先读它）。 */
export const GROUP_EXECUTOR_KEY_PREFIX = 'sf.groupExecutor.';

/** 错误文案：后端 detail 字符串优先，拿不到退回 err.message。 */
function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Catalog 错误的消息提取。CatalogApiError 的 message 是 "Catalog API error 400"，
 * 真正有用的原因在 detail.error.message 里 —— 一键 fork 失败必须让用户看到
 * 「到底哪一步不行」（缺快照？角色校验不过？），不能只显示状态码。
 */
function catalogErrorOf(err: unknown): string {
  const detail = (err as { detail?: unknown })?.detail;
  if (detail && typeof detail === 'object') {
    const inner = (detail as Record<string, unknown>).error;
    if (inner && typeof inner === 'object') {
      const msg = (inner as Record<string, unknown>).message;
      if (typeof msg === 'string' && msg) return msg;
    }
    const d = (detail as Record<string, unknown>).detail;
    if (typeof d === 'string' && d) return d;
  }
  return errorMessageOf(err);
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
  /** 团队模板（Catalog 里 mode==='team' 的条目）—— 一键建群用。 */
  const [templates, setTemplates] = useState<CatalogAppSummary[] | null>(null);
  /** 正在 fork 的模板 app_id（null = 空闲）。 */
  const [forkingId, setForkingId] = useState<string | null>(null);
  /** AutoResearchClaw CLI 的安装态（null = 还在检测）。 */
  const [arcCli, setArcCli] = useState<{ installed: boolean; version: string | null } | null>(null);
  /** 「论文专家团 · 一键开始」的忙碌态。 */
  const [arcBusy, setArcBusy] = useState(false);

  // 团队 / Agent 列表独立结算：任一失败按空列表处理（空态兜底，不拖垮另一路）。
  useEffect(() => {
    let alive = true;
    listTeams(workspaceId ?? undefined)
      .then((rows) => { if (alive) setTeams(rows); })
      .catch(() => { if (alive) setTeams([]); });
    listAgents(workspaceId ?? undefined)
      .then((rows) => { if (alive) setAgents(rows); })
      .catch(() => { if (alive) setAgents([]); });
    // 团队模板：单后端下由 catalog-builtin 种子，legacy 下由 Python 提供；
    // 取不到就当作没有模板（不弹错，注册流程不受影响）。
    listCatalogApps()
      .then((rows) => {
        if (!alive) return;
        const teamTpls = rows.filter((a) => a.mode === 'team');
        // 论文专家团置顶：它是「默认团队」的落点
        teamTpls.sort((a, b) => {
          const fa = a.app_id === FEATURED_APP_ID ? 0 : 1;
          const fb = b.app_id === FEATURED_APP_ID ? 0 : 1;
          return fa - fb;
        });
        setTemplates(teamTpls);
      })
      .catch(() => { if (alive) setTemplates([]); });
    // AutoResearchClaw（23 阶段研究管线）是否已装 —— 决定「论文专家团」卡片
    // 是「一键开始」还是「去 ClawHub 装」。检测失败按未安装处理（不拦整体流程）。
    listDetectedClis()
      .then((r) => {
        if (!alive) return;
        const hit = (r.items ?? []).find((c) => c.id === ARC_CLI_ID);
        setArcCli({ installed: Boolean(hit?.installed), version: hit?.version ?? null });
      })
      .catch(() => { if (alive) setArcCli({ installed: false, version: null }); });
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

  /**
   * 「论文专家团」一键开始（2026-11-20）。
   *
   * 与下面「团队模板」的区别：这里跑的是**真管线**——AutoResearchClaw
   * （`researchclaw` CLI，23 阶段：选题→检索→精读→方法→实验→分析→写作→
   * 审稿回炉），产物直接落在群目录，右侧产出面板立刻能看到。
   *
   * 为什么先 fork 再利用其中一个角色：单后端下 `POST /api/agents` 仍转发给
   * Python（会 502），本地能落 agent 的唯一通路就是 catalog fork。fork 出 9 个
   * 角色后只把主控拉进群（其余角色留着可随时另建群），群 executor 钉成
   * `cli:autoresearchclaw`，避免全局默认执行器把它冲掉。
   */
  async function handleStartArc() {
    if (busy || arcBusy || forkingId) return;
    setArcBusy(true);
    setError(null);
    try {
      const forked = await forkCatalogApp(FEATURED_APP_ID, workspaceId ?? undefined);
      const leadId = forked.team?.agent_ids?.[0] ?? forked.agents?.[0]?.agent_id;
      if (!leadId) {
        throw new Error(zh ? '论文专家团模板不可用（未取到主控角色）' : 'paper team template has no lead role');
      }
      const group = await createGroup({
        templateId: 'new-task',
        groupTemplateId: '',
        name: zh ? '论文专家团 · 自动研究' : 'Paper Team · AutoResearch',
        agentIds: [leadId],
        memberEmails: [],
        policyMatrix: {},
        workspaceId: workspaceId ?? undefined,
      });
      try {
        // 群级 executor：这个群每一轮都走研究管线 CLI
        localStorage.setItem(`${GROUP_EXECUTOR_KEY_PREFIX}${group.groupId}`, `cli:${ARC_CLI_ID}`);
      } catch {
        /* localStorage 不可用 → 回落全局默认 executor（仍可在模型选择器里手选） */
      }
      onCreated({ groupId: group.groupId, name: group.name });
    } catch (err) {
      setError(catalogErrorOf(err));
      setArcBusy(false);
    }
  }

  /**
   * 一键使用团队模板：fork（落 agent + team）→ 建群绑 team_id → 直接进群开跑。
   *
   * 这是「论文专家团点一下就能用」的完整链路：用户不用先手动建 9 个 agent、
   * 再逐个勾选，也不会撞上「勾选集合恰好等于 roster 才挂 team」的隐式规则。
   */
  async function handleUseTemplate(tpl: CatalogAppSummary) {
    if (busy || forkingId) return;
    setForkingId(tpl.app_id);
    setError(null);
    try {
      const forked = await forkCatalogApp(tpl.app_id, workspaceId ?? undefined);
      const team = forked.team;
      const agentIds = team?.agent_ids?.length
        ? team.agent_ids
        : (forked.agents ?? []).map((a) => a.agent_id);
      if (!team || agentIds.length === 0) {
        // team 模板 fork 必须落出 team；缺了就是后端异常，暴露不掩盖
        throw new Error(zh ? '模板已 fork，但没返回团队记录' : 'fork returned no team record');
      }
      const group = await createGroup({
        templateId: 'new-task',
        groupTemplateId: '',
        name: team.name || tpl.name,
        agentIds,
        memberEmails: [],
        policyMatrix: {},
        workspaceId: workspaceId ?? undefined,
        teamId: team.team_id,
      });
      onCreated({ groupId: group.groupId, name: group.name });
    } catch (err) {
      setError(catalogErrorOf(err));
      setForkingId(null);
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

        {/* ── 论文专家团（默认团队）：一键跑 AutoResearchClaw 研究管线 ── */}
        <div className="neo-ng-arc" data-testid="neo-ng-arc-card">
          <div className="neo-ng-arc-main">
            <div className="neo-ng-arc-title">
              <FlaskConical size={14} strokeWidth={1.9} aria-hidden />
              <span>{t('neo.newGroup.arcTitle', { defaultValue: zh ? '论文专家团' : 'Paper Team' })}</span>
              <span className="neo-ng-template-badge">
                {t('neo.newGroup.defaultTag', { defaultValue: zh ? '默认' : 'Default' })}
              </span>
            </div>
            <div className="neo-ng-arc-desc">
              {t('neo.newGroup.arcDesc', {
                defaultValue: zh
                  ? 'AutoResearchClaw 自动研究管线：给一个课题，跑完检索/精读/方法/实验/分析/写作/审稿，产出直接落到群目录（右侧文件树可见）。'
                  : 'AutoResearchClaw pipeline: give it a topic and it runs scoping, reading, method, experiments, analysis, writing and review — outputs land in the group folder.',
              })}
            </div>
            {arcCli && !arcCli.installed && (
              <div className="neo-ng-arc-warn" data-testid="neo-ng-arc-missing">
                {t('neo.newGroup.arcMissing', {
                  defaultValue: zh
                    ? '本机未检测到 researchclaw —— 到 设置 → ClawHub 安装后再一键开跑'
                    : 'researchclaw not detected — install it from Settings → ClawHub first',
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            className="neo-ng-template-use"
            disabled={busy || arcBusy || arcCli?.installed === false}
            onClick={() => void handleStartArc()}
            data-testid="neo-ng-arc-start"
          >
            {arcBusy && <Loader2 size={12} strokeWidth={2} className="neo-spin" aria-hidden />}
            {arcBusy
              ? t('neo.newGroup.templateForking', { defaultValue: zh ? '准备中…' : 'Preparing…' })
              : t('neo.newGroup.arcStart', { defaultValue: zh ? '一键开始' : 'Start' })}
          </button>
        </div>

        {/* ── 推荐团队：一键 fork + 建群（不依赖已有 agent，零 agent 也能用）── */}
        {templates && templates.length > 0 && (
          <div className="neo-ng-templates" data-testid="neo-ng-templates">
            <div className="neo-ng-templates-head">
              <Sparkles size={13} strokeWidth={1.9} aria-hidden />
              <span>{t('neo.newGroup.templatesHead', { defaultValue: zh ? '推荐团队 · 一键开始' : 'Recommended teams' })}</span>
            </div>
            {templates.map((tpl) => {
              const featured = tpl.app_id === FEATURED_APP_ID;
              const working = forkingId === tpl.app_id;
              return (
                <div
                  key={tpl.app_id}
                  className={`neo-ng-template-row${featured ? ' featured' : ''}`}
                  data-testid="neo-ng-template-row"
                  data-app-id={tpl.app_id}
                >
                  <div className="neo-ng-template-main">
                    <div className="neo-ng-template-name">
                      {tpl.name}
                      {featured && (
                        <span className="neo-ng-template-badge" data-testid="neo-ng-template-default-badge">
                          {t('neo.newGroup.defaultTag', { defaultValue: zh ? '默认' : 'Default' })}
                        </span>
                      )}
                    </div>
                    {tpl.goal && <div className="neo-ng-template-goal">{tpl.goal}</div>}
                  </div>
                  <button
                    type="button"
                    className="neo-ng-template-use"
                    disabled={busy || forkingId !== null}
                    onClick={() => void handleUseTemplate(tpl)}
                    data-testid="neo-ng-template-use"
                  >
                    {working && <Loader2 size={12} strokeWidth={2} className="neo-spin" aria-hidden />}
                    {working
                      ? t('neo.newGroup.templateForking', { defaultValue: zh ? '准备中…' : 'Preparing…' })
                      : t('neo.newGroup.templateUse', { defaultValue: zh ? '一键使用' : 'Use' })}
                  </button>
                </div>
              );
            })}
          </div>
        )}

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
