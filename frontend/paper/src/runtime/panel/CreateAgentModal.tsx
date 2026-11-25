/**
 * CreateAgentModal — 新建 Agent 弹窗（搬 legacy NeoCreateAgentModal）。
 *
 * 名称 + 一句话描述（可选）→ 生成人设（走 /api/llm/chat/completions，GLM；
 * 失败红条提示并展开 textarea 降级为手输，绝不阻塞只填名称的老路径）→
 * POST /api/agents（name + soul 必填；soul 缺省同名）。成功回调 onCreated
 * 让父级刷新名册并选中新成员；失败把后端真实错误亮在弹窗里，不吞不假成功。
 * 文案全在 content/views.ts 的 SOUL；组件内零中文零色值。
 */
import { useEffect, useMemo, useState } from 'react';
import { SOUL } from '@/shared/content/views';
import {
  createAgent,
  generateAgentPersona,
  getClaws,
  type AgentBrief,
  type DetectedCli,
} from '@/shared/data/http/generic';
import { IconClose } from '@/shared/ui/icons';

const NAME_MAX = 100;
const DESC_MAX = 200;

/** 后端错误 → 展示文本（ApiError 已带 message；兜底 String）。 */
function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (agent: AgentBrief) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [persona, setPersona] = useState('');
  const [personaOpen, setPersonaOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [clawId, setClawId] = useState('');
  const [claws, setClaws] = useState<DetectedCli[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 已安装 Claw 列表（失败 → 空表，下拉仅剩不绑定） */
  useEffect(() => {
    let alive = true;
    getClaws()
      .then((c) => alive && setClaws(c))
      .catch(() => alive && setClaws([]));
    return () => {
      alive = false;
    };
  }, []);

  const locked = busy || generating;

  /* Esc 关闭（创建中/生成中禁用，避免请求悬空时误取消） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, locked]);

  async function handleGenerate() {
    const d = desc.trim();
    if (!d || generating || busy) return;
    setGenerating(true);
    setGenError(null);
    try {
      const text = await generateAgentPersona(d);
      if (text.trim()) {
        setPersona(text.trim());
        setPersonaOpen(true);
      } else {
        setGenError(SOUL.genFailed);
        setPersonaOpen(true);
      }
    } catch (err) {
      setGenError(errorMessageOf(err) || SOUL.genNoKey);
      setPersonaOpen(true);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreate() {
    const n = name.trim();
    if (!n || locked) return;
    setBusy(true);
    setError(null);
    try {
      const agent = await createAgent({
        name: n,
        soul: persona.trim() || n,
        claw_id: clawId || undefined,
      });
      onCreated(agent);
    } catch (err) {
      setError(errorMessageOf(err) || SOUL.createFailed);
      setBusy(false);
    }
  }

  const canCreate = useMemo(() => name.trim().length > 0 && !locked, [name, locked]);

  return (
    <div className="kb-mask" role="dialog" aria-modal onClick={() => !locked && onClose()}>
      <div className="kb-confirm ca-card" onClick={(e) => e.stopPropagation()}>
        <div className="qs-head">
          <b>{SOUL.createTitle}</b>
          <button type="button" className="kb-srcdel" onClick={onClose} aria-label={SOUL.cancel} disabled={locked}>
            <IconClose size={13} />
          </button>
        </div>

        <label className="qs-field">
          <span className="qs-label">{SOUL.nameLabel}</span>
          <input
            className="subview-input"
            value={name}
            autoFocus
            maxLength={NAME_MAX}
            disabled={locked}
            placeholder={SOUL.namePlaceholder}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
        </label>

        <div className="qs-field">
          <span className="qs-label">{SOUL.descLabel}</span>
          <div className="ca-genrow">
            <input
              className="subview-input"
              value={desc}
              maxLength={DESC_MAX}
              disabled={locked}
              placeholder={SOUL.descPlaceholder}
              onChange={(e) => setDesc(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleGenerate();
              }}
            />
            <button
              type="button"
              className="subview-btn"
              disabled={!desc.trim() || locked}
              onClick={() => void handleGenerate()}
            >
              {generating ? SOUL.generating : SOUL.generate}
            </button>
          </div>
        </div>

        {genError && (
          <div className="subview-state" role="alert">
            {genError}
          </div>
        )}

        {personaOpen && (
          <label className="qs-field">
            <span className="qs-label">{SOUL.personaLabel}</span>
            <textarea
              className="subview-textarea"
              value={persona}
              rows={7}
              disabled={busy}
              placeholder={SOUL.personaPlaceholder}
              onChange={(e) => setPersona(e.currentTarget.value)}
            />
          </label>
        )}

        <label className="qs-field">
          <span className="qs-label">{SOUL.claw}</span>
          <select className="subview-input" value={clawId} disabled={locked} onChange={(e) => setClawId(e.currentTarget.value)}>
            <option value="">{SOUL.clawNone}</option>
            {claws.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
                {c.version ? ` · ${String(c.version).slice(0, 20)}` : ''}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <div className="subview-state" role="alert">
            {error}
          </div>
        )}

        <div className="kb-confirm-actions">
          <button type="button" className="subview-btn" onClick={onClose} disabled={locked}>
            {SOUL.cancel}
          </button>
          <button
            type="button"
            className="subview-btn"
            data-primary="true"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
          >
            {busy ? SOUL.creating : SOUL.createBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
