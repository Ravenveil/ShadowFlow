/**
 * MemoryHandoffPanel — 功能线③「记忆与交接」面板（2026-11-05）。
 *
 * 沿用 MemoryPage 的 neo-mm-* 视觉体系与 i18n defaultValue 兜底，不引新依赖、
 * 不另建页面：由 MemoryPage 一行挂载，数据全部走 /api/memory/handoff。
 *
 * 三块能力：
 *   1. A 下班建交接包（后端自动汇总快照）→ B 点「接班」接收；
 *   2. 输入 agent 查「当前能读到的上下文」，逐条显示来源（handoff: / lesson:）；
 *   3. 长期画像写回 + 客户反馈规则式自动提炼，展示当前值与变更流水。
 *
 * 所有请求都吞掉异常并转成错误条：后端未启动时本页只降级，不拖垮记忆页。
 */
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../common/i18n';
import {
  acceptHandoff,
  createHandoff,
  getHandoffContext,
  getHandoffStats,
  getProfile,
  ingestFeedback,
  listHandoffs,
  writebackProfile,
  type Handoff,
  type HandoffContextResult,
  type HandoffStats,
  type ProfileResult,
} from '../api/memoryHandoff';
import './memory-neo.css';

export default function MemoryHandoffPanel() {
  const { t } = useI18n();
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [stats, setStats] = useState<HandoffStats | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // 新建交接包
  const [shiftId, setShiftId] = useState('');
  const [fromAgent, setFromAgent] = useState('');
  const [toAgent, setToAgent] = useState('');
  const [scopeKey, setScopeKey] = useState('');

  // B 的上下文
  const [contextAgent, setContextAgent] = useState('');
  const [contextResult, setContextResult] = useState<HandoffContextResult | null>(null);

  // 长期画像
  const [subjectId, setSubjectId] = useState('');
  const [profileKey, setProfileKey] = useState('preference');
  const [profileValue, setProfileValue] = useState('');
  const [confidence, setConfidence] = useState('0.8');
  const [feedbackText, setFeedbackText] = useState('');
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);

  const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([listHandoffs(), getHandoffStats()]);
      setHandoffs(list);
      setStats(s);
    } catch (err) {
      // 后端未启动 / 网关未挂时静默降级，不阻塞记忆主列表。
      setErrorMsg(`交接数据加载失败：${msg(err)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (busy) return null;
      setBusy(true);
      setErrorMsg('');
      try {
        return await fn();
      } catch (err) {
        setErrorMsg(`操作失败：${msg(err)}`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const handleCreate = useCallback(async () => {
    const out = await run(() =>
      createHandoff({
        shift_id: shiftId.trim(),
        from_agent: fromAgent.trim(),
        to_agent: toAgent.trim(),
        scope_key: scopeKey.trim(),
      }),
    );
    if (!out) return;
    setShiftId('');
    await refresh();
  }, [run, shiftId, fromAgent, toAgent, scopeKey, refresh]);

  const handleAccept = useCallback(
    async (h: Handoff) => {
      const out = await run(() => acceptHandoff(h.id, h.to_agent));
      if (!out) return;
      await refresh();
    },
    [run, refresh],
  );

  const handleContext = useCallback(async () => {
    const out = await run(() => getHandoffContext(contextAgent.trim()));
    setContextResult(out);
  }, [run, contextAgent]);

  const loadProfile = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setProfileResult(await getProfile(id));
    } catch (err) {
      setErrorMsg(`画像读取失败：${msg(err)}`);
    }
  }, []);

  const handleWriteback = useCallback(async () => {
    const out = await run(() =>
      writebackProfile({
        subject_id: subjectId.trim(),
        key: profileKey.trim(),
        value: profileValue.trim(),
        confidence: Number(confidence),
        source: 'manual',
      }),
    );
    if (!out) return;
    await loadProfile(subjectId.trim());
  }, [run, subjectId, profileKey, profileValue, confidence, loadProfile]);

  const handleIngest = useCallback(async () => {
    const out = await run(() =>
      ingestFeedback({ subject_id: subjectId.trim(), text: feedbackText.trim() }),
    );
    if (!out) return;
    setFeedbackText('');
    await loadProfile(subjectId.trim());
  }, [run, subjectId, feedbackText, loadProfile]);

  return (
    <section data-testid="memory-handoff-panel" className="neo-mm-card">
      <div className="neo-mm-card-head">
        <h3 className="neo-mm-card-title">
          {t('neo.memory.handoff.title', { defaultValue: '记忆交接与长期画像' })}
        </h3>
        {stats && (
          <span data-testid="handoff-stats" className="neo-mm-scope-pill">
            交接 {stats.handoffs} · 待接班 {stats.pending} · 画像写入 {stats.profile_events}
          </span>
        )}
      </div>
      <p className="neo-mm-card-meta">
        {t('neo.memory.handoff.subtitle', {
          defaultValue: 'A 下班系统自动汇总上下文，B 接班后即可读到；画像写回逐条留痕，冲突不猜谁对。',
        })}
      </p>

      {errorMsg && <div role="alert" className="neo-mm-alert">{errorMsg}</div>}

      {/* ── 交接包 ── */}
      <div className="neo-mm-card-actions">
        <input
          data-testid="handoff-create-shift"
          className="neo-mm-input"
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
          placeholder={t('neo.memory.handoff.shiftPh', { defaultValue: '班次 ID' })}
        />
        <input
          data-testid="handoff-create-from"
          className="neo-mm-input"
          value={fromAgent}
          onChange={(e) => setFromAgent(e.target.value)}
          placeholder={t('neo.memory.handoff.fromPh', { defaultValue: '下班 A' })}
        />
        <input
          data-testid="handoff-create-to"
          className="neo-mm-input"
          value={toAgent}
          onChange={(e) => setToAgent(e.target.value)}
          placeholder={t('neo.memory.handoff.toPh', { defaultValue: '接班 B' })}
        />
        <input
          data-testid="handoff-create-scope"
          className="neo-mm-input"
          value={scopeKey}
          onChange={(e) => setScopeKey(e.target.value)}
          placeholder={t('neo.memory.handoff.scopePh', { defaultValue: '作用域（留空=通用）' })}
        />
        <button
          data-testid="handoff-create-submit"
          disabled={busy || !shiftId.trim() || !fromAgent.trim() || !toAgent.trim()}
          onClick={handleCreate}
          className="neo-mm-btn neo-mm-btn-primary neo-mm-btn-sm"
        >
          {t('neo.memory.handoff.create', { defaultValue: '生成交接包' })}
        </button>
      </div>

      <div data-testid="handoff-list">
        {handoffs.length === 0 && (
          <p className="neo-mm-card-meta">
            {t('neo.memory.handoff.empty', { defaultValue: '还没有交接包。填好班次与 A/B 后生成一份。' })}
          </p>
        )}
        {handoffs.map((h) => (
          <div key={h.id} data-testid={`handoff-card-${h.id}`} className="neo-mm-card">
            <div className="neo-mm-card-head">
              <h3 className="neo-mm-card-title">{h.from_agent} → {h.to_agent}</h3>
              <span className={`neo-mm-scope-pill neo-mm-scope-pill--${h.status === 'pending' ? 'session' : 'project'}`}>
                {h.status === 'pending' ? '待接班' : '已接班'}
              </span>
            </div>
            <p className="neo-mm-card-content">{h.summary || `班次 ${h.shift_id}`}</p>
            <p className="neo-mm-card-meta">
              班次 {h.shift_id} · 上下文 {h.context_items} 条
              {h.scope_key ? ` · 作用域 ${h.scope_key}` : ' · 通用'}
            </p>
            {h.status === 'pending' && (
              <div className="neo-mm-card-actions">
                <button
                  data-testid={`handoff-accept-${h.id}`}
                  disabled={busy}
                  onClick={() => handleAccept(h)}
                  className="neo-mm-btn neo-mm-btn-ghost neo-mm-btn-sm"
                >
                  {t('neo.memory.handoff.accept', { defaultValue: `${h.to_agent} 接班` })}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── B 能读到的上下文 ── */}
      <div className="neo-mm-card-actions">
        <input
          data-testid="handoff-context-agent"
          className="neo-mm-input"
          value={contextAgent}
          onChange={(e) => setContextAgent(e.target.value)}
          placeholder={t('neo.memory.handoff.agentPh', { defaultValue: '查看谁的上下文（如 B）' })}
        />
        <button
          data-testid="handoff-context-load"
          disabled={busy || !contextAgent.trim()}
          onClick={handleContext}
          className="neo-mm-btn neo-mm-btn-sm"
        >
          {t('neo.memory.handoff.loadContext', { defaultValue: '读上下文' })}
        </button>
      </div>
      {contextResult && (
        <div data-testid="handoff-context-list">
          {contextResult.items.length === 0 && (
            <p className="neo-mm-card-meta">
              {t('neo.memory.handoff.noContext', { defaultValue: '该 agent 暂时没有可读上下文。' })}
            </p>
          )}
          {contextResult.items.map((item, idx) => (
            <div key={`${item.source}-${idx}`} data-testid="handoff-context-item" className="neo-mm-card">
              <p className="neo-mm-card-content">{item.content}</p>
              <p className="neo-mm-card-meta">
                {item.source}
                {item.from_agent ? ` · 来自 ${item.from_agent}` : ''}
                {item.kind ? ` · ${item.kind}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── 长期画像写回 ── */}
      <div className="neo-mm-card-actions">
        <input
          data-testid="handoff-profile-subject"
          className="neo-mm-input"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          placeholder={t('neo.memory.handoff.subjectPh', { defaultValue: '主体 ID（如客户 ID）' })}
        />
        <input
          data-testid="handoff-profile-key"
          className="neo-mm-input"
          value={profileKey}
          onChange={(e) => setProfileKey(e.target.value)}
          placeholder="key"
        />
        <input
          data-testid="handoff-profile-value"
          className="neo-mm-input"
          value={profileValue}
          onChange={(e) => setProfileValue(e.target.value)}
          placeholder={t('neo.memory.handoff.valuePh', { defaultValue: '画像值' })}
        />
        <input
          data-testid="handoff-profile-confidence"
          className="neo-mm-input"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
          placeholder="0~1"
        />
        <button
          data-testid="handoff-profile-submit"
          disabled={busy || !subjectId.trim() || !profileKey.trim() || !profileValue.trim()}
          onClick={handleWriteback}
          className="neo-mm-btn neo-mm-btn-primary neo-mm-btn-sm"
        >
          {t('neo.memory.handoff.writeback', { defaultValue: '写回画像' })}
        </button>
      </div>
      <div className="neo-mm-card-actions">
        <input
          data-testid="handoff-feedback-text"
          className="neo-mm-input"
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder={t('neo.memory.handoff.feedbackPh', {
            defaultValue: '客户反馈原文（自动提炼偏好/预算/行业，零模型消耗）',
          })}
        />
        <button
          data-testid="handoff-feedback-submit"
          disabled={busy || !subjectId.trim() || !feedbackText.trim()}
          onClick={handleIngest}
          className="neo-mm-btn neo-mm-btn-sm"
        >
          {t('neo.memory.handoff.ingest', { defaultValue: '反馈自动提炼' })}
        </button>
      </div>

      {profileResult && (
        <div data-testid="handoff-profile-result">
          <p className="neo-mm-card-meta">
            当前画像 {profileResult.profile.length} 项 · 变更流水 {profileResult.writes} 条 · 冲突 {profileResult.conflicts} 条
          </p>
          {profileResult.profile.map((p) => (
            <div key={p.key} className="neo-mm-card">
              <p className="neo-mm-card-content">{p.key}：{p.value}</p>
              <p className="neo-mm-card-meta">置信度 {p.confidence} · 来源 {p.source}</p>
            </div>
          ))}
          {profileResult.history.slice(-5).map((h, idx) => (
            <p key={idx} className="neo-mm-card-meta">
              {h.action} · {h.old_value ?? '—'} → {h.new_value} · {h.source}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
