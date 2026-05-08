/**
 * PersonaNPCWizard — Story 10.4 (AC1, AC3)
 *
 * 三步向导（Goal Mode 5 输入项）：
 *   Step 1: 角色名称 + 性格描述（"你的角色是谁？"）
 *   Step 2: 背景故事（可选）+ 记忆保留策略（minimal/balanced/rich 三档）+ 关系追踪开关
 *   Step 3: 预览（角色卡片，含 State Fields 初始值）+ 确认
 *
 * 提交后调用 instantiatePersonaNPCKit(inputs) 获取 AgentBlueprint。
 * 结果视图：AgentDM（Epic 7）+ AgentStatePanel（Story 9.4）右侧嵌入。
 */
import { useState, useCallback } from 'react';
import { instantiatePersonaNPCKit } from '../../../../api/builder';
import type { PersonaNPCKitInputs } from '../../../../common/types/kits';
import type { AgentBlueprint } from '../../../../common/types/agent-builder';
import { Icon, Drama, Sparkles, Heart } from '../../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

interface WizardState {
  persona_name: string;
  personality: string;
  backstory: string;
  memory_retention: 'minimal' | 'balanced' | 'rich';
  enable_relationships: boolean;
}

export interface PersonaNPCWizardProps {
  /** 向导完成后（Blueprint 生成）的回调 */
  onComplete: (blueprint: AgentBlueprint) => void;
  /** 取消/关闭向导的回调 */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// 记忆保留策略选项（产品化文案，不暴露技术参数）
// ---------------------------------------------------------------------------

const MEMORY_RETENTION_OPTIONS: Array<{
  value: 'minimal' | 'balanced' | 'rich';
  label: string;
  desc: string;
  icon: string;
  hint: string;
}> = [
  {
    value: 'minimal',
    label: '轻量模式',
    desc: '只记住重要事件',
    icon: '💡',
    hint: '适合短期互动，内存占用少，对话轻快',
  },
  {
    value: 'balanced',
    label: '平衡模式',
    desc: '自动管理记忆',
    icon: '⚖️',
    hint: '适合日常陪伴，在记忆深度与性能之间取得平衡',
  },
  {
    value: 'rich',
    label: '丰富模式',
    desc: '记住所有细节',
    icon: '🗂️',
    hint: '适合长期深度角色，会记得每一次对话的细节',
  },
];

// State Fields 初始值展示（对应后端 Blueprint）
const INITIAL_STATE_FIELDS = [
  { name: 'mood', label: '当前心情', defaultValue: 'neutral', type: 'string' },
  { name: 'relationship_level', label: '关系等级', defaultValue: '0 / 100', type: 'number' },
  { name: 'interaction_count', label: '互动次数', defaultValue: '0', type: 'number' },
  { name: 'last_seen', label: '最后互动', defaultValue: '(首次对话时记录)', type: 'time' },
];

// ---------------------------------------------------------------------------
// 子组件：步骤指示器
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as Step;
        const isDone = current > step;
        const isActive = current === step;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold transition-all',
                isDone
                  ? 'bg-sf-approve text-white'
                  : isActive
                    ? 'bg-sf-accent text-white shadow-[0_0_0_3px_rgba(var(--sf-accent-raw),0.2)]'
                    : 'border border-sf-border text-sf-fg4',
              ].join(' ')}
            >
              {isDone ? '✓' : step}
            </div>
            {i < total - 1 && (
              <div
                className={[
                  'h-0.5 w-8 rounded-full transition-all',
                  isDone ? 'bg-sf-approve' : 'bg-sf-border',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件：角色预览卡片（Step 3）
// ---------------------------------------------------------------------------

interface PersonaPreviewCardProps {
  name: string;
  personality: string;
  backstory: string;
  memoryRetention: 'minimal' | 'balanced' | 'rich';
  enableRelationships: boolean;
}

function PersonaPreviewCard({
  name,
  personality,
  backstory,
  memoryRetention,
  enableRelationships,
}: PersonaPreviewCardProps) {
  const memOpt = MEMORY_RETENTION_OPTIONS.find((o) => o.value === memoryRetention)!;

  return (
    <div
      className="rounded-[14px] border border-sf-accent/30 bg-sf-panel p-5 shadow-[0_0_0_1px_rgba(var(--sf-accent-raw),0.08)]"
      data-testid="persona-preview-card"
    >
      {/* 角色头像区 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sf-accent/15 text-sf-accent-bright">
          <Drama size={24} strokeWidth={2} />
        </div>
        <div>
          <h3 className="text-[17px] font-bold text-sf-fg1">{name || '未命名角色'}</h3>
          <p className="text-[12px] text-sf-fg3">{personality || '—'}</p>
        </div>
      </div>

      {/* 背景故事 */}
      {backstory.trim() && (
        <div className="mb-4 rounded-[8px] bg-sf-surface p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-sf-fg4">
            背景故事
          </p>
          <p className="line-clamp-3 text-[12px] leading-relaxed text-sf-fg2">{backstory}</p>
        </div>
      )}

      {/* State Fields 初始值 */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-sf-fg4">
          状态字段（初始值）
        </p>
        <div className="space-y-1 rounded-[8px] bg-sf-surface p-3">
          {INITIAL_STATE_FIELDS.map((field) => (
            <div key={field.name} className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-sf-fg3">{field.name}</span>
              <span className="font-mono text-[11px] text-sf-fg2">{field.defaultValue}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 配置摘要 */}
      <div className="flex flex-wrap gap-2">
        <span className="flex items-center gap-1 rounded-[6px] bg-sf-surface px-2 py-1 text-[11px] text-sf-fg3">
          <Icon token={memOpt.icon} size={12} /> {memOpt.label}
        </span>
        {enableRelationships && (
          <span className="flex items-center gap-1 rounded-[6px] bg-sf-surface px-2 py-1 text-[11px] text-sf-fg3">
            <Heart size={12} strokeWidth={2} /> 关系追踪开启
          </span>
        )}
        <span className="rounded-[6px] bg-sf-accent/10 px-2 py-1 font-mono text-[10px] uppercase text-sf-accent-bright">
          persona
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonaNPCWizard 主组件
// ---------------------------------------------------------------------------

export function PersonaNPCWizard({ onComplete, onCancel }: PersonaNPCWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<WizardState>({
    persona_name: '',
    personality: '',
    backstory: '',
    memory_retention: 'balanced',
    enable_relationships: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 字段更新
  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Step 1 校验
  const step1Valid = state.persona_name.trim().length > 0 && state.personality.trim().length > 0;

  // 提交
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const inputs: PersonaNPCKitInputs = {
        persona_name: state.persona_name.trim(),
        personality: state.personality.trim(),
        backstory: state.backstory.trim(),
        memory_retention: state.memory_retention,
        enable_relationships: state.enable_relationships,
      };
      const blueprint = await instantiatePersonaNPCKit(inputs);
      onComplete(blueprint);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 1: 你的角色是谁？
  // ---------------------------------------------------------------------------

  const renderStep1 = () => (
    <div className="space-y-5" data-testid="persona-wizard-step1">
      {/* 步骤说明 */}
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-sf-fg1">
          你的角色是谁？
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          给你的角色一个名字和独特的性格，让它在对话中始终保持一致。
        </p>
      </div>

      {/* 角色名称 */}
      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-sf-fg2" htmlFor="persona-name">
          角色名称 <span className="text-sf-reject">*</span>
        </label>
        <input
          id="persona-name"
          type="text"
          value={state.persona_name}
          onChange={(e) => update('persona_name', e.target.value)}
          placeholder="例如：Aria、林小白、守护者"
          maxLength={200}
          className="w-full rounded-[10px] border border-sf-border bg-sf-surface px-3 py-2.5 text-[14px] text-sf-fg1 placeholder-sf-fg5 outline-none transition focus:border-sf-accent/60 focus:ring-1 focus:ring-sf-accent/20"
          data-testid="persona-name-input"
          autoFocus
        />
      </div>

      {/* 性格描述 */}
      <div>
        <label
          className="mb-1.5 block text-[13px] font-semibold text-sf-fg2"
          htmlFor="persona-personality"
        >
          性格描述 <span className="text-sf-reject">*</span>
        </label>
        <textarea
          id="persona-personality"
          value={state.personality}
          onChange={(e) => update('personality', e.target.value)}
          placeholder="例如：温柔、善解人意、略带神秘感；或者：直率、充满好奇心、喜欢用类比解释问题"
          rows={3}
          maxLength={2000}
          className="w-full resize-none rounded-[10px] border border-sf-border bg-sf-surface px-3 py-2.5 text-[14px] text-sf-fg1 placeholder-sf-fg5 outline-none transition focus:border-sf-accent/60 focus:ring-1 focus:ring-sf-accent/20"
          data-testid="persona-personality-input"
        />
        <p className="mt-1 text-[11px] text-sf-fg4">
          用逗号或顿号分隔特征词，或用自然语言描述。这些词会成为角色语气的判断基准。
        </p>
      </div>

      {/* 下一步按钮 */}
      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-sf-border px-4 py-2 text-[13px] text-sf-fg3 hover:bg-sf-surface"
          >
            取消
          </button>
        )}
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!step1Valid}
          className="rounded-[8px] bg-sf-accent px-6 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="persona-wizard-next1"
        >
          下一步 →
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step 2: 记忆与关系设置
  // ---------------------------------------------------------------------------

  const renderStep2 = () => (
    <div className="space-y-5" data-testid="persona-wizard-step2">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-sf-fg1">
          记忆与关系设置
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          决定角色记住多少，以及是否随时间和你建立更深的关系。
        </p>
      </div>

      {/* 背景故事（可选） */}
      <div>
        <label
          className="mb-1.5 block text-[13px] font-semibold text-sf-fg2"
          htmlFor="persona-backstory"
        >
          背景故事 <span className="text-[11px] font-normal text-sf-fg4">（可选）</span>
        </label>
        <textarea
          id="persona-backstory"
          value={state.backstory}
          onChange={(e) => update('backstory', e.target.value)}
          placeholder="角色的来历、经历或世界观背景（这段文字会成为角色语义记忆的种子，影响它理解和回应的视角）"
          rows={4}
          maxLength={5000}
          className="w-full resize-none rounded-[10px] border border-sf-border bg-sf-surface px-3 py-2.5 text-[14px] text-sf-fg1 placeholder-sf-fg5 outline-none transition focus:border-sf-accent/60 focus:ring-1 focus:ring-sf-accent/20"
          data-testid="persona-backstory-input"
        />
      </div>

      {/* 记忆保留策略（三档选择） */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-sf-fg2">记忆保留策略</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MEMORY_RETENTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update('memory_retention', opt.value)}
              className={[
                'group flex flex-col rounded-[10px] border p-3 text-left transition-all',
                state.memory_retention === opt.value
                  ? 'border-sf-accent bg-sf-accent/8 shadow-[0_0_0_1px_rgba(var(--sf-accent-raw),0.2)]'
                  : 'border-sf-border bg-sf-surface hover:border-sf-accent/40',
              ].join(' ')}
              data-testid={`memory-retention-${opt.value}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center text-sf-fg2">
                  <Icon token={opt.icon} size={18} />
                </span>
                <span
                  className={[
                    'text-[13px] font-semibold',
                    state.memory_retention === opt.value ? 'text-sf-accent-bright' : 'text-sf-fg2',
                  ].join(' ')}
                >
                  {opt.label}
                </span>
              </div>
              <span className="text-[11px] text-sf-fg3">{opt.desc}</span>
              <span className="mt-1 text-[10px] leading-relaxed text-sf-fg4">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 关系追踪开关 */}
      <div className="flex items-start justify-between rounded-[10px] border border-sf-border bg-sf-surface p-4">
        <div className="flex-1 pr-4">
          <p className="text-[13px] font-semibold text-sf-fg2">关系追踪</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-sf-fg3">
            开启后，随着互动次数增加，角色与你的关系等级会自动提升（每 10 次互动 +5），
            语气也会逐渐变得更亲近。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.enable_relationships}
          onClick={() => update('enable_relationships', !state.enable_relationships)}
          className={[
            'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
            state.enable_relationships ? 'bg-sf-accent' : 'bg-sf-border',
          ].join(' ')}
          data-testid="enable-relationships-toggle"
        >
          <span
            className={[
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              state.enable_relationships ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {/* 按钮区 */}
      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="rounded-[8px] border border-sf-border px-4 py-2 text-[13px] text-sf-fg3 hover:bg-sf-surface"
        >
          ← 上一步
        </button>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="rounded-[8px] bg-sf-accent px-6 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
          data-testid="persona-wizard-next2"
        >
          预览 →
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step 3: 预览 + 确认
  // ---------------------------------------------------------------------------

  const renderStep3 = () => (
    <div className="space-y-5" data-testid="persona-wizard-step3">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-sf-fg1">
          确认角色配置
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          以下是你的角色预览，确认后将生成 Blueprint 并进入对话视图。
        </p>
      </div>

      {/* 角色预览卡片 */}
      <PersonaPreviewCard
        name={state.persona_name}
        personality={state.personality}
        backstory={state.backstory}
        memoryRetention={state.memory_retention}
        enableRelationships={state.enable_relationships}
      />

      {/* 提交错误 */}
      {submitError && (
        <div
          className="rounded-[8px] border border-sf-reject/30 bg-sf-reject/8 px-3 py-2 text-[12px] text-sf-reject"
          role="alert"
          data-testid="persona-wizard-error"
        >
          {submitError}
        </div>
      )}

      {/* 信息提示 */}
      <div className="rounded-[8px] bg-sf-accent/6 px-3 py-2.5 text-[12px] leading-relaxed text-sf-fg3">
        <strong className="text-sf-fg2">提示：</strong>
        创建后你可以在 AgentDM 频道与角色开始对话，右侧面板将实时显示状态字段变化。
        随着互动次数增加，角色记忆将自动积累和更新。
      </div>

      {/* 按钮区 */}
      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={isSubmitting}
          className="rounded-[8px] border border-sf-border px-4 py-2 text-[13px] text-sf-fg3 hover:bg-sf-surface disabled:opacity-40"
        >
          ← 上一步
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-[8px] bg-sf-accent px-6 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="persona-wizard-submit"
        >
          {isSubmitting ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              创建中…
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={14} strokeWidth={2} /> 创建角色
            </span>
          )}
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  return (
    <div
      className="mx-auto max-w-[560px] rounded-[18px] border border-sf-border bg-sf-panel p-6 shadow-lg"
      data-testid="persona-npc-wizard"
    >
      {/* 步骤指示器 */}
      <StepIndicator current={step} total={3} />

      {/* 步骤内容 */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </div>
  );
}

export default PersonaNPCWizard;
