/**
 * NeoAgentSoul — Agent「灵魂」编辑页（CherryStudio 助手提示词形态，2026-08-22）。
 *
 * 中栏内嵌页（rail 常驻，与 KnowledgePage/MemoryPage embedded 同款模式）：
 * 头像 + 名称 + 大号 soul（persona / system prompt）编辑区 + 保存。
 *
 * 数据全部真实后端：GET /api/agents/:id（getAgent）加载，保存走
 * PATCH /api/agents/:id（patchAgent，此前无调用方的闲置能力）——后端同步
 * 写 blueprint.goal 与 role_profiles[0].persona，聊天注入 system prompt、
 * 编排者路由、team DAG 三处消费侧即刻生效。
 * 不 mock、不假成功：加载/保存失败都展示真实错误红条。
 *
 * 管理面闭环（2026-08-23）：头部追加运行状态 + 暂停/恢复切换，走
 * POST /api/agents/:id/pause|resume（pauseAgent/resumeAgent），成功以端点
 * 返回的完整 record 刷新本地状态。
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import {
  AgentApiError,
  getAgent,
  patchAgent,
  pauseAgent,
  resumeAgent,
  type AgentRecord,
} from '../api/agents';
import { listDetectedClis, type DetectedCli } from '../api/cli';
import { AgentAvatar } from '../components/agent/AgentAvatar';
import { AvatarStylePicker, type AvatarConfigValue } from '../components/agent/AvatarStylePicker';
import { useI18n } from '../common/i18n';
// ClawHub（2026-06）：Claw 绑定编辑 + 头像重配样式（增量引入）
import '../pages/clawhub/clawhub.css';

export interface NeoAgentSoulProps {
  agentId: string;
}

/** 从 AgentApiError 的 detail 里提取后端真实 message（与 NeoCreateAgentModal 同款）。 */
function errorMessageOf(err: unknown): string {
  if (err instanceof AgentApiError) {
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

export function NeoAgentSoul({ agentId }: NeoAgentSoulProps) {
  const { t, language } = useI18n();
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [name, setName] = useState('');
  const [soul, setSoul] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 保存成功瞬态提示（2s 后消失）
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // 管理面闭环（2026-08-23）：灵魂页直接切暂停/恢复（pauseAgent/resumeAgent
  // 真实端点），成功用返回的完整 record 刷新本地状态，失败红条不吞错。
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // ── ClawHub（2026-06，FR-05/06）：Claw 绑定 + 头像 查看/重配 ──────────────
  const [claws, setClaws] = useState<DetectedCli[]>([]);
  const [clawId, setClawId] = useState('');
  const [avatarCfg, setAvatarCfg] = useState<AvatarConfigValue>({ style: '', seed: '' });
  const [clawDirty, setClawDirty] = useState(false);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listDetectedClis()
      .then((snap) => {
        if (alive) setClaws(snap.items.filter((i) => i.is_claw && i.installed));
      })
      .catch(() => {
        if (alive) setClaws([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // record 加载/刷新 → 同步本地编辑态（binding 与 soul 分离保存，互不干扰）
  useEffect(() => {
    if (!agent) return;
    setClawId(agent.claw_id ?? '');
    setAvatarCfg({ style: agent.avatar_style ?? '', seed: agent.avatar_seed ?? '' });
    setClawDirty(false);
    setAvatarDirty(false);
  }, [agent]);

  useEffect(() => {
    let alive = true;
    setLoadState('loading');
    setLoadError(null);
    setAgent(null);
    getAgent(agentId)
      .then((a) => {
        if (!alive) return;
        setAgent(a);
        setName(a.name);
        setSoul(a.soul ?? '');
        setLoadState('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(errorMessageOf(err));
        setLoadState('error');
      });
    return () => {
      alive = false;
    };
  }, [agentId, reloadTick]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const dirty = agent !== null && (name !== agent.name || soul !== (agent.soul ?? ''));
  const canSave = dirty && name.trim().length > 0 && soul.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave || !agent) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchAgent(agent.agent_id, { name: name.trim(), soul });
      setAgent(updated);
      setName(updated.name);
      setSoul(updated.soul ?? '');
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(errorMessageOf(err));
    } finally {
      setSaving(false);
    }
  }

  // 暂停/恢复切换：成功以端点返回的 record 为准刷新状态显示。
  async function handleToggleStatus() {
    if (!agent || statusBusy) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const updated =
        agent.status === 'paused'
          ? await resumeAgent(agent.agent_id)
          : await pauseAgent(agent.agent_id);
      setAgent(updated);
    } catch (err) {
      setStatusError(errorMessageOf(err));
    } finally {
      setStatusBusy(false);
    }
  }

  // ── ClawHub（2026-06）：保存 Claw 绑定（"" = 解绑）。独立于 soul 保存钮。──
  async function handleSaveClawBinding() {
    if (!agent || bindingBusy) return;
    setBindingBusy(true);
    setBindingError(null);
    try {
      const updated = await patchAgent(agent.agent_id, { claw_id: clawId });
      setAgent(updated);
    } catch (err) {
      setBindingError(errorMessageOf(err));
    } finally {
      setBindingBusy(false);
    }
  }

  // ── ClawHub（2026-06）：保存头像配置（"" = 清空回默认/名字 hash）。────────
  async function handleSaveAvatar() {
    if (!agent || bindingBusy) return;
    setBindingBusy(true);
    setBindingError(null);
    try {
      const updated = await patchAgent(agent.agent_id, {
        avatar_style: avatarCfg.style,
        avatar_seed: avatarCfg.seed,
      });
      setAgent(updated);
    } catch (err) {
      setBindingError(errorMessageOf(err));
    } finally {
      setBindingBusy(false);
    }
  }

  // 当前绑定 Claw 是否仍已安装（卸载提示；弱校验仅 UI 提示不阻断）。
  const boundClawUninstalled = useMemo(
    () =>
      !!agent?.claw_id &&
      claws.length > 0 &&
      !claws.some((c) => c.id === agent.claw_id),
    [agent, claws],
  );

  if (loadState === 'loading') {
    return (
      <div className="neo-soul" aria-busy="true" aria-label={t('common.loading')}>
        <div className="sf-skeleton neo-soul-skeleton" />
        <div className="sf-skeleton neo-soul-skeleton neo-soul-skeleton--tall" />
      </div>
    );
  }

  if (loadState === 'error' || !agent) {
    return (
      <div className="neo-soul">
        <div className="neo-modal-error" role="alert" data-testid="neo-soul-load-error">
          {loadError ?? t('team.loadError')}
        </div>
        <div>
          <button
            type="button"
            className="neo-list-retry"
            onClick={() => setReloadTick((n) => n + 1)}
            data-testid="neo-soul-retry"
          >
            <RotateCcw size={11} strokeWidth={2} aria-hidden />
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-soul" data-testid="neo-agent-soul">
      <header className="neo-soul-head">
        <h2 className="neo-soul-title">
          {t('neo.soul.title', { defaultValue: language === 'zh' ? '灵魂' : 'Soul' })}
        </h2>
        <span className="neo-soul-sub">
          {t('neo.soul.subtitle', {
            defaultValue:
              language === 'zh'
                ? 'Agent 的人设与系统提示词，决定它在聊天和团队 DAG 里的行为'
                : 'Persona / system prompt — drives behavior in chat and team DAG runs',
          })}
        </span>
        {/* 管理面闭环（2026-08-23）：运行状态 + 暂停/恢复切换（真实端点） */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="neo-soul-sub" data-testid="neo-soul-status">
            {t('neo.soul.statusLabel', { defaultValue: language === 'zh' ? '状态' : 'Status' })}
            {' · '}
            {agent.status}
          </span>
          <button
            type="button"
            className="neo-list-retry"
            onClick={() => void handleToggleStatus()}
            disabled={statusBusy}
            data-testid="neo-soul-status-toggle"
          >
            {statusBusy ? (
              <Loader2 size={11} strokeWidth={2} className="neo-spin" aria-hidden />
            ) : agent.status === 'paused' ? (
              <Play size={11} strokeWidth={2} aria-hidden />
            ) : (
              <Pause size={11} strokeWidth={2} aria-hidden />
            )}
            {agent.status === 'paused'
              ? t('neo.manage.resume', { defaultValue: language === 'zh' ? '恢复' : 'Resume' })
              : t('neo.manage.pause', { defaultValue: language === 'zh' ? '暂停' : 'Pause' })}
          </button>
        </span>
      </header>

      {statusError && (
        <div className="neo-modal-error" role="alert" data-testid="neo-soul-status-error">
          {statusError}
        </div>
      )}

      {/* ── ClawHub（2026-06）：头像预览 + Claw 绑定编辑（增量区块）────────── */}
      <div className="claw-avatar-preview" data-testid="neo-soul-claw-block">
        <AgentAvatar
          name={agent.name}
          style={avatarCfg.style || agent.avatar_style}
          seed={avatarCfg.seed || agent.avatar_seed}
          size={56}
        />
        <div className="claw-avatar-preview-meta" style={{ flex: 1 }}>
          <label className="neo-modal-label" htmlFor="neo-soul-claw">
            {t('clawhub.agent.clawLabel', { defaultValue: language === 'zh' ? '驱动后端（Claw）' : 'Backend (Claw)' })}
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              id="neo-soul-claw"
              className="neo-modal-input"
              style={{ flex: '1 1 180px', minHeight: 30 }}
              value={clawId}
              disabled={bindingBusy}
              onChange={(e) => {
                setClawId(e.target.value);
                setClawDirty(true);
              }}
              data-testid="neo-soul-claw-select"
            >
              <option value="">
                {t('clawhub.agent.noClaw', { defaultValue: language === 'zh' ? '不绑定（默认 AI 引擎）' : 'None (default engine)' })}
              </option>
              {agent.claw_id && !claws.some((c) => c.id === agent.claw_id) && (
                <option value={agent.claw_id}>{agent.claw_id}（未安装）</option>
              )}
              {claws.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                  {c.version ? ` · ${c.version.slice(0, 20)}` : ''}
                </option>
              ))}
            </select>
            {clawDirty && (
              <button
                type="button"
                className="neo-btn-primary"
                style={{ height: 30, padding: '0 12px', fontSize: 12 }}
                onClick={() => void handleSaveClawBinding()}
                disabled={bindingBusy}
                data-testid="neo-soul-claw-save"
              >
                {bindingBusy ? <Loader2 size={12} className="neo-spin" aria-hidden /> : null}
                {t('common.save', { defaultValue: language === 'zh' ? '保存' : 'Save' })}
              </button>
            )}
          </div>
          {boundClawUninstalled && (
            <span className="claw-copyonly-hint" style={{ color: '#B45309' }}>
              {t('clawhub.agent.boundClawMissing', {
                defaultValue: `绑定的 ${agent.claw_id} 当前未安装，对话将无法由它驱动（可在 ClawHub 重装）`,
              })}
            </span>
          )}
        </div>
      </div>

      <div className="neo-soul-field">
        <label className="neo-modal-label" htmlFor="neo-soul-name">
          {t('neo.newAgent.nameLabel', { defaultValue: language === 'zh' ? '名称' : 'Name' })}
        </label>
        <input
          id="neo-soul-name"
          className="neo-modal-input"
          value={name}
          maxLength={100}
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
          data-testid="neo-soul-name"
        />
      </div>

      <div className="neo-soul-field neo-soul-field--grow">
        <label className="neo-modal-label" htmlFor="neo-soul-prompt">
          {t('neo.soul.promptLabel', {
            defaultValue: language === 'zh' ? '提示词（Soul / Persona）' : 'Prompt (Soul / Persona)',
          })}
        </label>
        <textarea
          id="neo-soul-prompt"
          className="neo-soul-textarea"
          value={soul}
          maxLength={8000}
          disabled={saving}
          onChange={(e) => setSoul(e.target.value)}
          placeholder={t('agent.soulPlaceholder', {
            defaultValue:
              language === 'zh'
                ? '描述这个 Agent 的角色、能力边界、语气与协作方式…'
                : 'Describe this agent’s role, boundaries, tone and collaboration style…',
          })}
          data-testid="neo-soul-textarea"
        />
      </div>

      {saveError && (
        <div className="neo-modal-error" role="alert" data-testid="neo-soul-save-error">
          {saveError}
        </div>
      )}

      {/* ── ClawHub（2026-06）：头像重配（风格 + 种子 + 实时预览；独立保存）── */}
      <div className="neo-soul-field">
        <label className="neo-modal-label">
          {t('clawhub.agent.avatarLabel', { defaultValue: language === 'zh' ? '头像（DiceBear）' : 'Avatar (DiceBear)' })}
        </label>
        <AvatarStylePicker
          value={avatarCfg}
          onChange={(next) => {
            setAvatarCfg(next);
            setAvatarDirty(true);
          }}
          agentName={agent.name}
          variant="compact"
        />
        {bindingError && (
          <div className="neo-modal-error" role="alert" data-testid="neo-soul-binding-error">
            {bindingError}
          </div>
        )}
        {avatarDirty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              className="neo-btn-primary"
              style={{ height: 30, padding: '0 14px', fontSize: 12 }}
              onClick={() => void handleSaveAvatar()}
              disabled={bindingBusy}
              data-testid="neo-soul-avatar-save"
            >
              {bindingBusy && <Loader2 size={12} className="neo-spin" aria-hidden />}
              {t('clawhub.agent.saveAvatar', { defaultValue: language === 'zh' ? '保存头像' : 'Save Avatar' })}
            </button>
          </div>
        )}
      </div>

      <div className="neo-soul-foot">
        <span className="neo-soul-count">
          {soul.length} / 8000
          {savedAt !== null && (
            <span className="neo-soul-saved" data-testid="neo-soul-saved">
              <Check size={12} strokeWidth={2} aria-hidden />
              {t('neo.soul.saved', { defaultValue: language === 'zh' ? '已保存' : 'Saved' })}
            </span>
          )}
        </span>
        <button
          type="button"
          className="neo-btn-primary"
          onClick={() => void handleSave()}
          disabled={!canSave}
          data-testid="neo-soul-save"
        >
          {saving && <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />}
          {saving
            ? t('neo.soul.saving', { defaultValue: language === 'zh' ? '保存中…' : 'Saving…' })
            : t('common.save', { defaultValue: language === 'zh' ? '保存' : 'Save' })}
        </button>
      </div>
    </div>
  );
}

export default NeoAgentSoul;
