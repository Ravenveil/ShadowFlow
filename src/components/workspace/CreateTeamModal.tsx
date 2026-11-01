/**
 * CreateTeamModal — WorkspaceStrip「新建团队」创建表单（L2 缺口 A 补齐）。
 *
 * 此前「新建团队」按钮只 navigate('/') 回聊天页（/teams 路由已下架），
 * src/api/teams.ts 的 createTeam() 客户端函数零调用方。本表单把它接通：
 * 名称 + 描述 + 初始成员多选（listAgents 拉当前工作区 agent 列表）→
 * POST /api/teams 真实创建。成功 → 成功态内嵌「已创建，去运行」引导
 * （2026-08-22 第二轮，不静默关窗）；用户点「去运行」/Esc/遮罩时由
 * finish() 统一回调 onCreated（父级把新 team 追加进下拉列表并选为
 * currentTeam）。失败 → 模态内红条展示真实错误，不吞不假成功。
 *
 * 注意：Python CreateTeamRequest 要求 agent_ids min_length=1，所以提交钮
 * 在「名称为空 或 未选成员」时禁用。
 *
 * 样式：跟 WorkspaceStrip 同款的 inline style + var(--t-*) 主题变量；
 * 文案用 t(key, { defaultValue }) 模式（与 NeoCreateAgentModal 一致），
 * 不改动 locale 文件。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { CheckCircle2, Loader2, UsersRound } from 'lucide-react';
import { createTeam, TeamApiError, type TeamRecord } from '../../api/teams';
import { listAgents, type AgentRecord } from '../../api/agents';
import { useI18n } from '../../common/i18n';

export interface CreateTeamModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (team: TeamRecord) => void;
}

/** 从 TeamApiError 的 detail 里提取后端真实 message，拿不到就退回 err.message。 */
function errorMessageOf(err: unknown): string {
  if (err instanceof TeamApiError) {
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

export function CreateTeamModal({ workspaceId, onClose, onCreated }: CreateTeamModalProps) {
  const { t, language } = useI18n();
  const zh = language === 'zh';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 2026-08-22 第二轮 — 创建成功后不静默关窗：进入成功态，内嵌「已创建，
  // 去运行」引导（WorkBuddy 式下一步闭环）。finish() 时才回调 onCreated
  // （父级追加进下拉 + 选为 currentTeam + 关窗），语义与旧直通路径一致。
  const [createdTeam, setCreatedTeam] = useState<TeamRecord | null>(null);

  // 成员候选：当前工作区的 agent 列表（根态 workspaceId=null 时拉全量）。
  useEffect(() => {
    let alive = true;
    listAgents(workspaceId ?? undefined)
      .then((data) => { if (alive) { setAgents(data); setAgentsLoaded(true); } })
      .catch(() => { if (alive) { setAgents([]); setAgentsLoaded(true); } });
    return () => { alive = false; };
  }, [workspaceId]);

  /** 成功态/表单统一的收尾：已创建 → 回调 onCreated（父级选中+关窗）；否则纯关窗。 */
  function finish() {
    if (createdTeam) onCreated(createdTeam);
    else onClose();
  }

  // Esc 关闭（创建中禁用，避免请求悬在空中时用户误以为已取消）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // finish 依赖 createdTeam/onClose/busy，全部列入依赖。
  }, [onClose, busy, createdTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(agentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  async function handleCreate() {
    const n = name.trim();
    if (!n || selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const team = await createTeam({
        name: n,
        description: description.trim(),
        agent_ids: [...selected],
        workspace_id: workspaceId ?? undefined,
      });
      // 不立即 onCreated —— 先入成功态展示引导，用户点「去运行」（或 Esc/
      // 点遮罩）时由 finish() 统一回调，保证父级选中语义不丢。
      setCreatedTeam(team);
      setBusy(false);
    } catch (err) {
      setError(errorMessageOf(err));
      setBusy(false);
    }
  }

  const labelStyle: CSSProperties = {
    display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10,
    color: 'var(--t-fg-4)', letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 4,
  };
  const inputStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: 12.5,
    color: 'var(--t-fg)', background: 'var(--t-panel-2)',
    border: '1px solid var(--t-border)', borderRadius: 7, outline: 'none',
  };
  const maskStyle: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: 'rgba(0,0,0,.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const dialogStyle: CSSProperties = {
    width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)',
    overflowY: 'auto', background: 'var(--t-panel)',
    border: '1px solid var(--t-border)', borderRadius: 12,
    boxShadow: '0 16px 48px rgba(0,0,0,.3)', padding: '16px 16px 12px',
    display: 'flex', flexDirection: 'column', gap: 12,
  };

  // ── 成功态（2026-08-22 第二轮）：已创建 → 内嵌「去运行」引导，不静默关窗 ──
  if (createdTeam) {
    return (
      <div
        data-testid="create-team-modal-mask"
        onClick={() => { if (!busy) finish(); }}
        style={maskStyle}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('workspace.createTeam')}
          data-testid="create-team-modal"
          onClick={(e) => e.stopPropagation()}
          style={dialogStyle}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} strokeWidth={2} aria-hidden style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }} data-testid="create-team-success-title">
              {t('workspace.createTeamForm.successTitle', { defaultValue: zh ? '团队已创建' : 'Team created' })}
            </span>
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--t-fg-2)', lineHeight: 1.7 }} data-testid="create-team-success-body">
            {t('workspace.createTeamForm.successBody', {
              defaultValue: zh
                ? `「${createdTeam.name}」已保存（${createdTeam.agent_ids?.length ?? 0} 名成员）。下一步：去聊天页描述任务，即可让整个团队协同运行。`
                : `"${createdTeam.name}" is saved (${createdTeam.agent_ids?.length ?? 0} members). Next: describe a task in chat to run the whole team.`,
              count: createdTeam.agent_ids?.length ?? 0,
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              data-testid="create-team-go-run"
              onClick={finish}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid color-mix(in oklab, var(--t-accent) 50%, transparent)',
                background: 'color-mix(in oklab, var(--t-accent) 18%, var(--t-panel-2))',
                color: 'var(--t-accent)',
              }}
            >
              <UsersRound size={13} strokeWidth={2} aria-hidden />
              {t('workspace.createTeamForm.goRun', { defaultValue: zh ? '去运行' : 'Go run' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="create-team-modal-mask"
      onClick={() => { if (!busy) finish(); }}
      style={maskStyle}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('workspace.createTeam')}
        data-testid="create-team-modal"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>
          {t('workspace.createTeam')}
        </div>

        <div>
          <label style={labelStyle} htmlFor="create-team-name">
            {t('workspace.createTeamForm.nameLabel', { defaultValue: zh ? '团队名称' : 'Team name' })}
          </label>
          <input
            id="create-team-name"
            data-testid="create-team-name"
            style={inputStyle}
            value={name}
            autoFocus
            maxLength={120}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workspace.createTeamForm.namePlaceholder', { defaultValue: zh ? '例如：全栈开发小队' : 'e.g. Full-stack squad' })}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="create-team-desc">
            {t('workspace.createTeamForm.descLabel', { defaultValue: zh ? '描述（可选）' : 'Description (optional)' })}
          </label>
          <textarea
            id="create-team-desc"
            data-testid="create-team-desc"
            style={{ ...inputStyle, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }}
            value={description}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('workspace.createTeamForm.descPlaceholder', { defaultValue: zh ? '这个团队做什么？' : 'What does this team do?' })}
          />
        </div>

        <div>
          <span style={labelStyle}>
            {t('workspace.createTeamForm.membersLabel', { defaultValue: zh ? '初始成员' : 'Initial members' })}
            {agentsLoaded ? ` · ${selected.size}/${agents.length}` : ' · …'}
          </span>
          <div
            data-testid="create-team-members"
            style={{
              maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
              border: '1px solid var(--t-border)', borderRadius: 7, padding: 4,
              background: 'var(--t-panel-2)',
            }}
          >
            {agentsLoaded && agents.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)' }}>
                {t('workspace.createTeamForm.noAgents', { defaultValue: zh ? '当前工作区还没有 Agent' : 'No agents in this workspace yet' })}
              </div>
            )}
            {agents.map((a) => {
              const on = selected.has(a.agent_id);
              return (
                <button
                  key={a.agent_id}
                  type="button"
                  data-testid={`create-team-member-${a.agent_id}`}
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggle(a.agent_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                    border: on ? '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)' : '1px solid transparent',
                    background: on ? 'color-mix(in oklab, var(--t-accent) 12%, transparent)' : 'transparent',
                    width: '100%', textAlign: 'left', fontSize: 12,
                    color: on ? 'var(--t-accent)' : 'var(--t-fg-2)',
                    fontWeight: on ? 700 : 500,
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${on ? 'var(--t-accent)' : 'var(--t-border)'}`,
                    background: on ? 'var(--t-accent)' : 'transparent',
                    color: 'var(--t-panel)', fontSize: 10, lineHeight: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="create-team-error"
            style={{
              padding: '7px 10px', borderRadius: 7, fontSize: 12,
              color: 'var(--t-danger, #e5534b)',
              background: 'color-mix(in oklab, var(--t-danger, #e5534b) 10%, transparent)',
              border: '1px solid color-mix(in oklab, var(--t-danger, #e5534b) 35%, transparent)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              border: '1px solid var(--t-border)', background: 'transparent',
              color: 'var(--t-fg-3)',
            }}
          >
            {t('common.cancel', { defaultValue: zh ? '取消' : 'Cancel' })}
          </button>
          <button
            type="button"
            data-testid="create-team-submit"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || selected.size === 0 || busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              cursor: !name.trim() || selected.size === 0 || busy ? 'not-allowed' : 'pointer',
              border: '1px solid color-mix(in oklab, var(--t-accent) 50%, transparent)',
              background: 'color-mix(in oklab, var(--t-accent) 18%, var(--t-panel-2))',
              color: 'var(--t-accent)',
              opacity: !name.trim() || selected.size === 0 || busy ? 0.55 : 1,
            }}
          >
            {busy && <Loader2 size={13} strokeWidth={2} className="sf-spin" aria-hidden />}
            {busy
              ? t('workspace.createTeamForm.creating', { defaultValue: zh ? '创建中…' : 'Creating…' })
              : t('workspace.createTeamForm.submit', { defaultValue: zh ? '创建团队' : 'Create team' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateTeamModal;
