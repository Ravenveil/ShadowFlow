/**
 * SoulPane — 右栏「灵魂」tab 内嵌的 Agent 人设编辑器（紧凑版）。
 *
 * 用户定调：灵魂配置属于「Agent 主机」（右栏），不在左侧导航。
 * 能力与 legacy NeoAgentSoul 对齐：名称 / 人设提示词 / 头像（DiceBear 风格+
 * 种子）/ Claw 绑定 / 运行状态（暂停·恢复）/ 删除 / 保存；顶部可切换成员。
 *
 * 数据全走真实后端（GET|PATCH|DELETE /api/agents/:id、POST :id/pause|resume、
 * GET /api/cli/detect）；文案全在 content/views.ts 的 SOUL，组件内零中文零色值。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOUL } from '@/shared/content/views';
import {
  deleteAgent,
  getAgentDetail,
  getAgents,
  getClaws,
  pauseAgent,
  resumeAgent,
  saveAgentSoul,
  type AgentBrief,
  type DetectedCli,
} from '@/shared/data/http/generic';
import {
  AVATAR_STYLES,
  DEFAULT_AVATAR_STYLE,
  normalizeStyle,
  randomSeed,
  renderAvatarSvg,
} from '@/shared/data/avatarStyles';
import { patchAgentAvatar, removeAgentAvatar, setAgentAvatars } from '@/shared/data/avatarRegistry';
import { AgentAvatar } from '@/shared/ui/avatar';
import { IconTrash } from '@/shared/ui/icons';
import { CreateAgentModal } from './CreateAgentModal';

const SOUL_MAX = 8000;
const NAME_MAX = 100;

function hasExplicitAvatar(a: AgentBrief): boolean {
  return !!(a.avatar_style || a.avatar_seed || a.avatar_image);
}
function isReadonlyError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 422;
}
function errorMessageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return SOUL.failed;
}

export function SoulPane({ agentHint }: { agentHint?: string }) {
  const [list, setList] = useState<AgentBrief[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentBrief | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [soul, setSoul] = useState('');
  const [clawId, setClawId] = useState('');
  const [avatarStyle, setAvatarStyle] = useState(DEFAULT_AVATAR_STYLE);
  const [avatarSeed, setAvatarSeed] = useState('');

  const [claws, setClaws] = useState<DetectedCli[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  /* 成员列表 + Claw 探测 */
  useEffect(() => {
    let alive = true;
    getAgents()
      .then((rows) => {
        if (!alive) return;
        setList(rows);
        setAgentAvatars(rows);
        const hint = (agentHint ?? '').trim().toLowerCase();
        const matched = hint
          ? rows.find(
              (r) =>
                r.agent_id.toLowerCase() === hint ||
                (r.name ?? '').toLowerCase() === hint ||
                (r.name ?? '').toLowerCase().includes(hint),
            )
          : undefined;
        setSelectedId((cur) => cur ?? matched?.agent_id ?? rows[0]?.agent_id ?? null);
      })
      .catch(() => undefined);
    getClaws()
      .then((c) => alive && setClaws(c))
      .catch(() => alive && setClaws([]));
    return () => {
      alive = false;
    };
  }, [agentHint]);

  const loadDetail = useCallback((id: string) => {
    setLoading(true);
    setError(null);
    setSavedAt(null);
    getAgentDetail(id)
      .then((a) => {
        setAgent(a);
        setName(a.name ?? '');
        setSoul(a.soul ?? '');
        setClawId(a.claw_id ?? '');
        setAvatarStyle(normalizeStyle(a.avatar_style));
        setAvatarSeed(a.avatar_seed ?? '');
        setLoading(false);
      })
      .catch(() => {
        setAgent(null);
        setLoading(false);
        setError(SOUL.loadFailed);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setAgent(null);
      return;
    }
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const isTemplate = agent?.source === 'yaml-template';
  const avatarTouched =
    agent !== null &&
    (avatarStyle !== normalizeStyle(agent.avatar_style) ||
      avatarSeed !== (agent.avatar_seed ?? ''));
  const showSvg = agent !== null && (hasExplicitAvatar(agent) || avatarTouched);
  const dirty =
    agent !== null &&
    (name !== (agent.name ?? '') ||
      soul !== (agent.soul ?? '') ||
      clawId !== (agent.claw_id ?? '') ||
      avatarTouched);
  const canSave = dirty && name.trim().length > 0 && !saving && !isTemplate;
  const svg = useMemo(
    () => renderAvatarSvg(avatarStyle, avatarSeed, name || agent?.name || ''),
    [avatarStyle, avatarSeed, name, agent?.name],
  );

  async function handleSave() {
    if (!canSave || !agent) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await saveAgentSoul(agent.agent_id, {
        name: name.trim(),
        soul,
        claw_id: clawId,
        avatar_style: avatarStyle,
        avatar_seed: avatarSeed,
      });
      setAgent(updated);
      setSavedAt(Date.now());
      patchAgentAvatar({
        agent_id: updated.agent_id,
        name: updated.name,
        avatar_style: updated.avatar_style,
        avatar_seed: updated.avatar_seed,
        avatar_image: updated.avatar_image,
        avatar_color: updated.avatar_color,
      });
      setList((rows) => rows.map((r) => (r.agent_id === updated.agent_id ? { ...r, ...updated } : r)));
    } catch (err) {
      setError(isReadonlyError(err) ? SOUL.readonly : errorMessageOf(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!agent || statusBusy || isTemplate) return;
    setStatusBusy(true);
    setError(null);
    try {
      const updated =
        agent.status === 'paused' ? await resumeAgent(agent.agent_id) : await pauseAgent(agent.agent_id);
      setAgent(updated);
    } catch {
      setError(SOUL.statusFailed);
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDelete() {
    if (!agent || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteAgent(agent.agent_id);
      removeAgentAvatar({ agent_id: agent.agent_id, name: agent.name });
      setList((rows) => {
        const next = rows.filter((r) => r.agent_id !== agent.agent_id);
        setSelectedId(next[0]?.agent_id ?? null);
        return next;
      });
      setAgent(null);
      setDeleteAsk(false);
    } catch {
      setError(SOUL.deleteFailed);
    } finally {
      setDeleteBusy(false);
    }
  }

  const statusText =
    agent?.status === 'paused'
      ? SOUL.statusPaused
      : agent?.status === 'running'
        ? SOUL.statusRunning
        : agent?.status === 'error'
          ? SOUL.statusError
          : SOUL.statusIdle;

  return (
    <div className="soul-pane">
      {/* 成员切换 + 新建入口 */}
      <div className="soul-pane-toolbar">
        <select
          className="soul-pane-pick"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {list.map((a) => (
            <option key={a.agent_id} value={a.agent_id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="soul-pane-mini"
          onClick={() => setCreateOpen(true)}
        >
          {SOUL.create}
        </button>
      </div>

      {loading ? (
        <div className="soul-pane-state">{SOUL.loading}</div>
      ) : !agent ? (
        <div className="soul-pane-state">{SOUL.pickHint}</div>
      ) : (
        <>
          <div className="soul-pane-head">
            {showSvg ? (
              <span className="soul-pane-face" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <AgentAvatar label={agent.name} size={36} status={false} />
            )}
            <div className="soul-pane-id">
              <b>{agent.name}</b>
              <span>
                {SOUL.statusLabel} · {statusText}
              </span>
            </div>
            <button
              type="button"
              className="soul-pane-mini"
              disabled={statusBusy || isTemplate}
              onClick={() => void toggleStatus()}
            >
              {agent.status === 'paused' ? SOUL.resume : SOUL.pause}
            </button>
            <button
              type="button"
              className="soul-pane-mini soul-pane-danger"
              disabled={deleteBusy}
              onClick={() => setDeleteAsk(true)}
              aria-label={SOUL.delete}
              title={SOUL.delete}
            >
              <IconTrash size={12} />
            </button>
          </div>

          {isTemplate && <div className="soul-pane-warn">{SOUL.readonly}</div>}
          {error && <div className="soul-pane-error">{error}</div>}

          {/* 头像 */}
          <label className="soul-pane-label">{SOUL.avatarStyle}</label>
          <select
            className="soul-pane-input"
            value={avatarStyle}
            disabled={isTemplate}
            onChange={(e) => setAvatarStyle(e.target.value)}
          >
            {AVATAR_STYLES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="soul-pane-row">
            <input
              className="soul-pane-input"
              value={avatarSeed}
              placeholder={SOUL.avatarSeed}
              disabled={isTemplate}
              onChange={(e) => setAvatarSeed(e.target.value)}
            />
            <button
              type="button"
              className="soul-pane-mini"
              disabled={isTemplate}
              onClick={() => setAvatarSeed(randomSeed())}
            >
              {SOUL.avatarRandom}
            </button>
          </div>

          {/* 名称 */}
          <label className="soul-pane-label">{SOUL.name}</label>
          <input
            className="soul-pane-input"
            value={name}
            maxLength={NAME_MAX}
            disabled={saving || isTemplate}
            onChange={(e) => setName(e.target.value)}
          />

          {/* 灵魂 */}
          <label className="soul-pane-label">{SOUL.prompt}</label>
          <textarea
            className="soul-pane-input soul-pane-textarea"
            value={soul}
            maxLength={SOUL_MAX}
            disabled={saving || isTemplate}
            onChange={(e) => setSoul(e.target.value)}
          />
          <div className="soul-pane-count">{SOUL.chars(soul.length, SOUL_MAX)}</div>

          {/* Claw */}
          <label className="soul-pane-label">{SOUL.claw}</label>
          <select
            className="soul-pane-input"
            value={clawId}
            disabled={saving}
            onChange={(e) => setClawId(e.target.value)}
          >
            <option value="">{SOUL.clawNone}</option>
            {agent.claw_id && !claws.some((c) => c.id === agent.claw_id) && (
              <option value={agent.claw_id}>{agent.claw_id}</option>
            )}
            {claws.map((c) => (
              <option key={c.id} value={c.id}>{c.id}</option>
            ))}
          </select>

          <div className="soul-pane-foot">
            {savedAt !== null && <span className="soul-pane-saved">{SOUL.saved}</span>}
            <button
              type="button"
              className="soul-pane-save"
              data-primary={canSave ? 'true' : 'false'}
              disabled={!canSave}
              onClick={() => void handleSave()}
            >
              {saving ? SOUL.saving : SOUL.save}
            </button>
          </div>

          {deleteAsk && (
            <div className="soul-pane-confirm">
              <p>{SOUL.deleteConfirm(agent.name)}</p>
              <div className="soul-pane-row">
                <button type="button" className="soul-pane-mini" onClick={() => setDeleteAsk(false)}>
                  {SOUL.cancel}
                </button>
                <button
                  type="button"
                  className="soul-pane-mini soul-pane-danger"
                  disabled={deleteBusy}
                  onClick={() => void handleDelete()}
                >
                  {SOUL.delete}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            setList((rows) => [created, ...rows.filter((r) => r.agent_id !== created.agent_id)]);
            setSelectedId(created.agent_id);
            setAgentAvatars([created, ...list.filter((r) => r.agent_id !== created.agent_id)]);
          }}
        />
      )}
    </div>
  );
}
