/**
 * ResearchKitWizard — Story 10.1 (AC1/AC5)
 *
 * 三步向导（多步骤 Goal Mode 输入）：
 *   Step 1: 研究主题输入（必填）
 *   Step 2: 偏好设置（输出形式 / 新鲜度 / 引用开关 / 搜索深度滑块）
 *   Step 3: Blueprint 预览（4 角色卡片）+ 确认提交
 *
 * 提交后调用 POST /builder/kits/research/instantiate 获取 AgentBlueprint。
 */
import { useState, useCallback } from 'react';
import { instantiateResearchKit } from '../../../../api/builder';
import type { ResearchKitInputs } from '../../../../common/types/kits';
import type { AgentBlueprint } from '../../../../common/types/agent-builder';
import { Icon, Microscope } from '../../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

interface WizardState {
  research_topic: string;
  output_format: ResearchKitInputs['output_format'];
  freshness: ResearchKitInputs['freshness'];
  citation_required: boolean;
  max_search_rounds: number;
}

export interface ResearchKitWizardProps {
  /** 向导完成后（Blueprint 生成）的回调 */
  onComplete: (blueprint: AgentBlueprint) => void;
  /** 取消/关闭向导的回调 */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const OUTPUT_FORMAT_OPTIONS: Array<{
  value: ResearchKitInputs['output_format'];
  label: string;
  desc: string;
}> = [
  { value: 'report', label: '完整报告', desc: '含标题、章节、结论的结构化 Markdown 报告' },
  { value: 'answer', label: '直接回答', desc: '简洁直接的问答形式，适合事实性查询' },
  { value: 'structured_outline', label: '结构大纲', desc: '层级化大纲，每节含关键要点' },
];

const FRESHNESS_OPTIONS: Array<{
  value: ResearchKitInputs['freshness'];
  label: string;
  desc: string;
}> = [
  { value: 'any', label: '不限', desc: '使用任意时间段的资料' },
  { value: 'within_month', label: '近一个月', desc: '优先使用近 30 天内发布的资料' },
  { value: 'latest', label: '最新', desc: '仅使用最近发布的资料（可能覆盖较窄）' },
];

// 4 角色预览数据（对应后端 create_research_blueprint 产出）
const ROLE_PREVIEWS = [
  {
    id: 'planner',
    name: 'Planner',
    icon: '🗺️',
    color: 'sf-accent',
    desc: '把研究主题拆解为结构化子任务和搜索计划',
    badge: '规划',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    icon: '🔍',
    color: 'emerald',
    desc: '执行搜索任务，收集原始信息片段并整理证据集',
    badge: '搜集',
  },
  {
    id: 'summarizer',
    name: 'Summarizer',
    icon: '✂️',
    color: 'amber',
    desc: '对原始片段去重整合，产出中间摘要',
    badge: '总结',
  },
  {
    id: 'report_writer',
    name: 'Report Writer',
    icon: '📝',
    color: 'purple',
    desc: '把摘要整合为最终结构化报告，附引用列表',
    badge: '报告',
  },
];

// ---------------------------------------------------------------------------
// 子组件：步骤指示器
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { step: 1 as Step, label: '研究主题' },
    { step: 2 as Step, label: '偏好设置' },
    { step: 3 as Step, label: '预览确认' },
  ];

  return (
    <div className="mb-8 flex items-center gap-0" role="navigation" aria-label="向导步骤">
      {steps.map(({ step, label }, idx) => (
        <div key={step} className="flex items-center">
          {/* Step 圆圈 */}
          <div
            className={[
              'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all',
              current === step
                ? 'bg-sf-accent text-white shadow-[0_0_0_3px_rgba(var(--sf-accent-raw),0.2)]'
                : current > step
                  ? 'bg-sf-accent/20 text-sf-accent-bright'
                  : 'border border-sf-border bg-sf-surface text-sf-fg4',
            ].join(' ')}
            aria-current={current === step ? 'step' : undefined}
          >
            {current > step ? '✓' : step}
          </div>
          {/* Step 标签 */}
          <span
            className={[
              'ml-1.5 text-[12px]',
              current === step ? 'font-semibold text-sf-fg1' : 'text-sf-fg4',
            ].join(' ')}
          >
            {label}
          </span>
          {/* 分隔线 */}
          {idx < steps.length - 1 && (
            <div
              className={[
                'mx-3 h-px w-8 transition-colors',
                current > step ? 'bg-sf-accent/40' : 'bg-sf-border',
              ].join(' ')}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — 研究主题输入
// ---------------------------------------------------------------------------

function Step1({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-sf-fg1">
          你想研究什么？
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          输入你的研究主题，越具体越好——比如"2025 年大模型推理优化方法"。
        </p>
      </div>

      <div>
        <label
          htmlFor="research-topic"
          className="mb-1.5 block text-[12px] font-semibold text-sf-fg2"
        >
          研究主题 <span className="text-sf-reject">*</span>
        </label>
        <textarea
          id="research-topic"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如：2025 年大模型推理优化方法有哪些？各有什么优缺点？"
          rows={4}
          className={[
            'w-full resize-none rounded-[10px] border bg-sf-surface p-3 text-[13px] text-sf-fg1',
            'placeholder-sf-fg5 outline-none transition-colors',
            value.trim()
              ? 'border-sf-accent/50 focus:border-sf-accent'
              : 'border-sf-border focus:border-sf-accent/60',
          ].join(' ')}
          data-testid="research-topic-input"
          autoFocus
        />
        <p className="mt-1 text-[11px] text-sf-fg5">{value.length} / 1000 字符</p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!value.trim()}
          className={[
            'rounded-[8px] px-6 py-2.5 font-mono text-[12px] font-bold transition-all',
            value.trim()
              ? 'bg-sf-accent text-white hover:bg-sf-accent/90'
              : 'cursor-not-allowed bg-sf-border text-sf-fg4',
          ].join(' ')}
          data-testid="step1-next"
        >
          下一步 →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — 偏好设置
// ---------------------------------------------------------------------------

function Step2({
  state,
  onUpdate,
  onBack,
  onNext,
}: {
  state: WizardState;
  onUpdate: (partial: Partial<WizardState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-sf-fg1">
          研究偏好设置
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          调整输出形式、资料新鲜度和搜索深度，默认值适合大多数场景。
        </p>
      </div>

      {/* 输出形式 */}
      <div>
        <label className="mb-2 block text-[12px] font-semibold text-sf-fg2">
          你希望得到什么形式的结果？
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {OUTPUT_FORMAT_OPTIONS.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdate({ output_format: value })}
              className={[
                'rounded-[10px] border p-3 text-left transition-all',
                state.output_format === value
                  ? 'border-sf-accent bg-sf-accent/8 shadow-[0_0_0_1px_rgba(var(--sf-accent-raw),0.2)]'
                  : 'border-sf-border bg-sf-surface hover:border-sf-accent/40',
              ].join(' ')}
              data-testid={`output-format-${value}`}
            >
              <span className="block text-[13px] font-semibold text-sf-fg1">{label}</span>
              <span className="mt-0.5 block text-[11px] text-sf-fg4">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 资料新鲜度 */}
      <div>
        <label className="mb-2 block text-[12px] font-semibold text-sf-fg2">
          资料新鲜度要求
        </label>
        <div className="flex flex-wrap gap-2">
          {FRESHNESS_OPTIONS.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdate({ freshness: value })}
              title={desc}
              className={[
                'rounded-[8px] border px-3 py-1.5 text-[12px] font-medium transition-all',
                state.freshness === value
                  ? 'border-sf-accent bg-sf-accent text-white'
                  : 'border-sf-border text-sf-fg2 hover:border-sf-accent/40 hover:text-sf-fg1',
              ].join(' ')}
              data-testid={`freshness-${value}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-sf-fg5">
          {FRESHNESS_OPTIONS.find((o) => o.value === state.freshness)?.desc}
        </p>
      </div>

      {/* 是否强制引用 */}
      <div className="flex items-center justify-between rounded-[10px] border border-sf-border bg-sf-surface p-3">
        <div>
          <p className="text-[13px] font-semibold text-sf-fg1">需要标注信息来源？</p>
          <p className="mt-0.5 text-[11px] text-sf-fg4">
            开启后，每条信息都会附带出处引用，提升报告可信度
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.citation_required}
          onClick={() => onUpdate({ citation_required: !state.citation_required })}
          className={[
            'relative h-6 w-11 rounded-full transition-colors',
            state.citation_required ? 'bg-sf-accent' : 'bg-sf-border',
          ].join(' ')}
          data-testid="citation-toggle"
        >
          <span
            className={[
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
              state.citation_required ? 'translate-x-5' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {/* 搜索深度滑块 */}
      <div>
        <label
          htmlFor="search-rounds"
          className="mb-2 block text-[12px] font-semibold text-sf-fg2"
        >
          搜索深度
          <span className="ml-2 rounded-[4px] bg-sf-accent/15 px-1.5 py-0.5 text-[11px] font-bold text-sf-accent-bright">
            {state.max_search_rounds} 轮
          </span>
        </label>
        <input
          id="search-rounds"
          type="range"
          min={1}
          max={5}
          step={1}
          value={state.max_search_rounds}
          onChange={(e) => onUpdate({ max_search_rounds: Number(e.target.value) })}
          className="w-full accent-[var(--sf-accent)]"
          data-testid="search-rounds-slider"
        />
        <div className="mt-1 flex justify-between text-[10px] text-sf-fg5">
          <span>1 轮（快速）</span>
          <span>3 轮（均衡）</span>
          <span>5 轮（深度）</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-[8px] border border-sf-border px-4 py-2 font-mono text-[12px] text-sf-fg3 transition-all hover:border-sf-accent/40 hover:text-sf-fg1"
          data-testid="step2-back"
        >
          ← 上一步
        </button>
        <button
          type="button"
          onClick={onNext}
          className="rounded-[8px] bg-sf-accent px-6 py-2.5 font-mono text-[12px] font-bold text-white transition-all hover:bg-sf-accent/90"
          data-testid="step2-next"
        >
          预览 Blueprint →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Blueprint 预览 + 确认
// ---------------------------------------------------------------------------

function Step3({
  state,
  onBack,
  onSubmit,
  isLoading,
  error,
}: {
  state: WizardState;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const outputLabel =
    OUTPUT_FORMAT_OPTIONS.find((o) => o.value === state.output_format)?.label ?? state.output_format;
  const freshnessLabel =
    FRESHNESS_OPTIONS.find((o) => o.value === state.freshness)?.label ?? state.freshness;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-sf-fg1">
          Blueprint 预览
        </h2>
        <p className="mt-1 text-[13px] text-sf-fg3">
          确认配置无误后点击「生成 Blueprint」开始构建。
        </p>
      </div>

      {/* 研究配置摘要 */}
      <div className="rounded-[12px] border border-sf-border bg-sf-surface px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-sf-fg4">
          研究配置
        </p>
        <p className="mb-2 break-words text-[14px] font-semibold text-sf-fg1">
          {state.research_topic}
        </p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-[4px] bg-sf-accent/10 px-2 py-0.5 text-sf-accent-bright">
            {outputLabel}
          </span>
          <span className="rounded-[4px] bg-sf-surface border border-sf-border px-2 py-0.5 text-sf-fg3">
            {freshnessLabel}
          </span>
          <span
            className={[
              'rounded-[4px] px-2 py-0.5',
              state.citation_required
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-sf-surface border border-sf-border text-sf-fg4',
            ].join(' ')}
          >
            {state.citation_required ? '强制引用' : '不需要引用'}
          </span>
          <span className="rounded-[4px] bg-sf-surface border border-sf-border px-2 py-0.5 text-sf-fg3">
            {state.max_search_rounds} 轮搜索
          </span>
        </div>
      </div>

      {/* 4 角色预览 */}
      <div>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em] text-sf-fg4">
          角色流水线（顺序依赖）
        </p>
        <div className="relative space-y-2">
          {ROLE_PREVIEWS.map((role, idx) => (
            <div key={role.id} className="relative">
              {/* 连线 */}
              {idx < ROLE_PREVIEWS.length - 1 && (
                <div
                  className="absolute bottom-0 left-[22px] h-2 w-px translate-y-full bg-sf-border"
                  aria-hidden="true"
                />
              )}
              <div
                className="flex items-start gap-3 rounded-[10px] border border-sf-border bg-sf-surface px-4 py-3"
                data-testid={`role-preview-${role.id}`}
              >
                <span className="mt-0.5 inline-flex items-center justify-center text-sf-fg2">
                  <Icon token={role.icon} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-sf-fg1">{role.name}</span>
                    <span className="rounded-[3px] bg-sf-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-sf-accent-bright">
                      {role.badge}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-sf-fg4">{role.desc}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] font-bold text-sf-fg5">
                  {idx + 1}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div
          className="rounded-[8px] border border-sf-reject/30 bg-sf-reject/8 px-3 py-2 text-[12px] text-sf-reject"
          role="alert"
          data-testid="wizard-error"
        >
          {error}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="rounded-[8px] border border-sf-border px-4 py-2 font-mono text-[12px] text-sf-fg3 transition-all hover:border-sf-accent/40 hover:text-sf-fg1 disabled:opacity-50"
          data-testid="step3-back"
        >
          ← 上一步
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading}
          className={[
            'flex items-center gap-2 rounded-[8px] px-6 py-2.5 font-mono text-[12px] font-bold transition-all',
            isLoading
              ? 'cursor-wait bg-sf-accent/60 text-white'
              : 'bg-sf-accent text-white hover:bg-sf-accent/90',
          ].join(' ')}
          data-testid="wizard-submit"
        >
          {isLoading && (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          {isLoading ? '生成中…' : '生成 Blueprint'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResearchKitWizard 主组件
// ---------------------------------------------------------------------------

export function ResearchKitWizard({ onComplete, onCancel }: ResearchKitWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<WizardState>({
    research_topic: '',
    output_format: 'report',
    freshness: 'any',
    citation_required: true,
    max_search_rounds: 2,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const inputs: ResearchKitInputs = {
        research_topic: state.research_topic.trim(),
        output_format: state.output_format,
        freshness: state.freshness,
        citation_required: state.citation_required,
        max_search_rounds: state.max_search_rounds,
      };
      const blueprint = await instantiateResearchKit(inputs);
      onComplete(blueprint);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '生成 Blueprint 失败，请稍后重试';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [state, onComplete]);

  return (
    <div
      className="w-full max-w-[600px] rounded-[16px] border border-sf-border bg-sf-panel p-6 shadow-sf-panel"
      data-testid="research-kit-wizard"
    >
      {/* 标题行 */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center text-sf-accent-bright" aria-hidden="true">
            <Microscope size={20} strokeWidth={2} />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sf-accent-bright">
              Research Kit
            </p>
            <h1 className="text-[15px] font-bold text-sf-fg1">规划-搜集-总结-报告向导</h1>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] text-sf-fg4 transition-colors hover:text-sf-fg1"
            aria-label="关闭向导"
            data-testid="wizard-cancel"
          >
            ✕
          </button>
        )}
      </div>

      {/* 步骤指示器 */}
      <StepIndicator current={step} />

      {/* 步骤内容 */}
      {step === 1 && (
        <Step1
          value={state.research_topic}
          onChange={(v) => update({ research_topic: v })}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2
          state={state}
          onUpdate={update}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3
          state={state}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={error}
        />
      )}
    </div>
  );
}

export default ResearchKitWizard;
