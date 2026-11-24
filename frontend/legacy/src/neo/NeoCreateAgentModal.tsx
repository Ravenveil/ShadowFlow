/**
 * NeoCreateAgentModal — Neo 化「新建 Agent」模态（W2-F A14/B27 → 六层能力第二轮 B）。
 *
 * ClawsGO a_002 形态简化版：遮罩 + 白卡 r16，标题 / 名称输入 / 取消 + 创建
 * 主钮（创建中 Loader2 + 禁用态）。帧里的 2×2 营销特性网格不做。
 *
 * 第二轮 B 升级（对标 WorkBuddy/StaffDeck 雇佣体验）：名称之外加「一句话描述
 * → AI 生成人设」——点「生成人设」经 generateAgentPersona（src/api/llm.ts，
 * 走 Node 网关 /api/llm/chat/completions → zhipu GLM）生成中文 persona
 * （角色定位/核心能力/工作边界）。生成中按钮 loading；成功回填到可编辑
 * textarea；失败（无 key/网络错）红条提示 + textarea 展开为可手输——
 * 优雅降级，绝不阻塞「只填名称」的老路径（soul 回落为同名）。
 *
 * 提交走真实 POST /api/agents（quickCreateAgent，src/api/agents.ts）：
 * 后端 QuickCreateRequest 契约要求 name + soul（min_length=1），soul 即
 * persona —— 有生成/手输内容用内容，否则仍传同名；不发明契约外字段。
 * 成功 → onCreated（父级刷新列表并选中新 agent）；失败 → 模态内红条展示
 * 真实错误，不吞不假成功。
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { AgentApiError, quickCreateAgent } from '../api/agents';
import { generateAgentPersona, LlmApiError } from '../api/llm';
import { listDetectedClis, type DetectedCli } from '../api/cli';
import { AvatarStylePicker, type AvatarConfigValue } from '../components/agent/AvatarStylePicker';
import { DEFAULT_AVATAR_STYLE } from '../config/clawhub';
import { useI18n } from '../common/i18n';
// ClawHub（2026-06）：Claw 下拉 + 头像选择器样式（增量引入）
import '../pages/clawhub/clawhub.css';

export interface NeoCreateAgentModalProps {
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (agent: { agent_id: string; name: string }) => void;
}

/** 从 AgentApiError 的 detail 里提取后端真实 message，拿不到就退回 err.message。 */
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

export function NeoCreateAgentModal({ workspaceId, onClose, onCreated }: NeoCreateAgentModalProps) {
  const { t, language } = useI18n();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [persona, setPersona] = useState('');
  // persona 编辑区展开：生成成功回填后可见；生成失败也展开（降级为手输）
  const [personaOpen, setPersonaOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── ClawHub（2026-06，FR-05/06）：驱动后端 Claw 下拉 + DiceBear 头像 ──────
  const [claws, setClaws] = useState<DetectedCli[]>([]);
  const [clawId, setClawId] = useState(''); // '' = 不绑定
  const [avatarCfg, setAvatarCfg] = useState<AvatarConfigValue>({
    style: DEFAULT_AVATAR_STYLE,
    seed: '',
  });
  // 已安装 Claw 列表（失败 → 空表，下拉仅剩「不绑定」）
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
  // 名字变化且种子为空时预览跟随（name 直作种子，与 AgentAvatar 兜底一致）
  const previewName = useMemo(() => name.trim() || t('neo.newAgent.namePlaceholder', { defaultValue: '我的 Agent' }), [name, t]);

  const locked = busy || generating;

  // Esc 关闭（创建中/生成中禁用，避免请求悬在空中时用户误以为已取消）
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
      setPersona(text);
      setPersonaOpen(true);
    } catch (err) {
      // 优雅降级：红条展示真实错误（无 key 401 / 网络错），同时展开 textarea 供手输
      setGenError(
        err instanceof LlmApiError && err.code === 'NO_API_KEY'
          ? t('neo.newAgent.genNoKey', {
              defaultValue:
                language === 'zh'
                  ? '未检测到 GLM API Key，可在设置中配置，或直接手输人设'
                  : 'No GLM API key found — configure one in Settings, or write the persona manually',
            })
          : errorMessageOf(err),
      );
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
      const agent = await quickCreateAgent({
        name: n,
        soul: persona.trim() || n,
        workspace_id: workspaceId ?? undefined,
        // ClawHub（2026-06）：Claw 绑定 + DiceBear 头像（'' = 不绑定/用默认）
        claw_id: clawId || undefined,
        avatar_style: avatarCfg.style || undefined,
        avatar_seed: avatarCfg.seed.trim() || undefined,
      });
      onCreated({ agent_id: agent.agent_id, name: agent.name || n });
    } catch (err) {
      setError(errorMessageOf(err));
      setBusy(false);
    }
  }

  return (
    <div
      className="neo-modal-mask"
      onClick={() => {
        if (!locked) onClose();
      }}
    >
      <div
        className="neo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('neo.newAgent.title', {
          defaultValue: language === 'zh' ? '新建 Agent' : 'New Agent',
        })}
        onClick={(e) => e.stopPropagation()}
        data-testid="neo-create-agent-modal"
      >
        <h2 className="neo-modal-title">
          {t('neo.newAgent.title', { defaultValue: language === 'zh' ? '新建 Agent' : 'New Agent' })}
        </h2>
        <label className="neo-modal-label" htmlFor="neo-new-agent-name">
          {t('neo.newAgent.nameLabel', { defaultValue: language === 'zh' ? '名称' : 'Name' })}
        </label>
        <input
          id="neo-new-agent-name"
          className="neo-modal-input"
          value={name}
          autoFocus
          maxLength={100}
          disabled={locked}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
          placeholder={t('neo.newAgent.namePlaceholder', {
            defaultValue: language === 'zh' ? '我的 Agent' : 'My Agent',
          })}
        />
        <label className="neo-modal-label" htmlFor="neo-new-agent-desc" style={{ marginTop: 12 }}>
          {t('neo.newAgent.descLabel', {
            defaultValue: language === 'zh' ? '一句话描述（可选）' : 'One-line description (optional)',
          })}
        </label>
        <div className="neo-modal-gen-row">
          <input
            id="neo-new-agent-desc"
            className="neo-modal-input"
            value={desc}
            maxLength={200}
            disabled={locked}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleGenerate();
            }}
            placeholder={t('neo.newAgent.descPlaceholder', {
              defaultValue:
                language === 'zh'
                  ? '例：负责氢能重卡渠道开拓的销售专家'
                  : 'e.g. Sales expert for hydrogen truck channels',
            })}
            data-testid="neo-create-agent-desc"
          />
          <button
            type="button"
            className="neo-modal-gen-btn"
            onClick={() => void handleGenerate()}
            disabled={!desc.trim() || locked}
            data-testid="neo-create-agent-generate"
          >
            {generating ? (
              <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />
            ) : (
              <Sparkles size={13} strokeWidth={2} aria-hidden />
            )}
            {generating
              ? t('neo.newAgent.generating', { defaultValue: language === 'zh' ? '生成中…' : 'Generating…' })
              : t('neo.newAgent.generate', { defaultValue: language === 'zh' ? '生成人设' : 'Generate' })}
          </button>
        </div>
        {genError && (
          <div className="neo-modal-error" role="alert" data-testid="neo-create-agent-gen-error">
            {genError}
          </div>
        )}
        {personaOpen && (
          <>
            <label className="neo-modal-label" htmlFor="neo-new-agent-persona" style={{ marginTop: 12 }}>
              {t('neo.newAgent.personaLabel', {
                defaultValue: language === 'zh' ? '人设（可编辑）' : 'Persona (editable)',
              })}
            </label>
            <textarea
              id="neo-new-agent-persona"
              className="neo-modal-textarea"
              value={persona}
              rows={7}
              disabled={busy}
              onChange={(e) => setPersona(e.target.value)}
              placeholder={t('neo.newAgent.personaPlaceholder', {
                defaultValue:
                  language === 'zh'
                    ? '## 角色定位\n…\n## 核心能力\n- …\n## 工作边界\n- …'
                    : '## Role\n…\n## Capabilities\n- …\n## Boundaries\n- …',
              })}
              data-testid="neo-create-agent-persona"
            />
          </>
        )}

        {/* ── ClawHub（2026-06，FR-05）：驱动后端（Claw）下拉 — 增量区块 ────── */}
        <label className="neo-modal-label" htmlFor="neo-new-agent-claw" style={{ marginTop: 12 }}>
          {t('clawhub.agent.clawLabel', { defaultValue: language === 'zh' ? '驱动后端（Claw）' : 'Backend (Claw)' })}
        </label>
        <select
          id="neo-new-agent-claw"
          className="neo-modal-input"
          value={clawId}
          disabled={locked}
          onChange={(e) => setClawId(e.target.value)}
          data-testid="neo-create-agent-claw"
        >
          <option value="">
            {t('clawhub.agent.noClaw', { defaultValue: language === 'zh' ? '不绑定（默认 AI 引擎）' : 'None (default engine)' })}
          </option>
          {claws.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
              {c.version ? ` · ${c.version.slice(0, 20)}` : ''}
            </option>
          ))}
        </select>
        <span className="claw-copyonly-hint">
          {t('clawhub.agent.clawHint', {
            defaultValue: language === 'zh'
              ? '绑定后对话完全由该 Claw 驱动（Agent 仅作入口）；未安装的 Claw 可先去 ClawHub 安装'
              : 'Once bound, chats are fully driven by this Claw',
          })}
        </span>

        {/* ── ClawHub（2026-06，FR-06）：DiceBear 头像配置 — 增量区块 ───────── */}
        <label className="neo-modal-label" style={{ marginTop: 12 }}>
          {t('clawhub.agent.avatarLabel', { defaultValue: language === 'zh' ? '头像（DiceBear）' : 'Avatar (DiceBear)' })}
        </label>
        <AvatarStylePicker
          value={avatarCfg}
          onChange={setAvatarCfg}
          agentName={previewName}
          variant="compact"
        />
        {/* 隐式引用 AgentAvatar：AvatarStylePicker 内部已用；此处展示种子
            空值语义（种子空 → 名字直作种子，与 AgentAvatar 兜底唯一约定） */}
        <span className="claw-copyonly-hint" data-testid="neo-avatar-seed-hint">
          {avatarCfg.seed.trim()
            ? `${t('clawhub.avatar.seedLabel', { defaultValue: '种子' })}: ${avatarCfg.seed}`
            : t('clawhub.avatar.seedAuto', { defaultValue: '种子留空 = 按名字自动生成' })}
          {' · '}
          {previewName}
        </span>

        {error && (
          <div className="neo-modal-error" role="alert" data-testid="neo-create-agent-error">
            {error}
          </div>
        )}
        <div className="neo-modal-actions">
          <button
            type="button"
            className="neo-modal-cancel"
            onClick={onClose}
            disabled={locked}
          >
            {t('common.cancel', { defaultValue: language === 'zh' ? '取消' : 'Cancel' })}
          </button>
          <button
            type="button"
            className="neo-btn-primary"
            onClick={() => void handleCreate()}
            disabled={!name.trim() || locked}
            data-testid="neo-create-agent-submit"
          >
            {busy && <Loader2 size={13} strokeWidth={2} className="neo-spin" aria-hidden />}
            {busy
              ? t('neo.newAgent.creating', { defaultValue: language === 'zh' ? '创建中…' : 'Creating…' })
              : t('neo.newAgent.create', { defaultValue: language === 'zh' ? '创建' : 'Create' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NeoCreateAgentModal;
