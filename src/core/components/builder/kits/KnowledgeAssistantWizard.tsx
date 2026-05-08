/**
 * KnowledgeAssistantWizard — Story 10.2 (AC1, AC5)
 *
 * Knowledge Assistant Kit 3 步向导：
 *   Step 1: 知识来源绑定（嵌入 KnowledgeDock 或简化知识源选择）
 *   Step 2: 行为偏好（引用开关 / 升级策略 / 关键词列表）
 *   Step 3: 助手命名 + Blueprint 预览（3 角色卡片）
 *
 * 完成后调用 onSubmit(inputs) 回调，由 BuilderPage 触发实例化。
 */
import { useState } from 'react';
import type { KnowledgeAssistantKitInputs } from '../../../../common/types/kits';
import { Icon, BookOpen } from '../../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3;

export interface KnowledgeAssistantWizardProps {
  /** 向导完成后的回调，接收完整的 Kit 输入 */
  onSubmit: (inputs: KnowledgeAssistantKitInputs) => void;
  /** 取消向导的回调 */
  onCancel?: () => void;
  /** 正在提交中（由父组件控制加载状态） */
  isSubmitting?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STRATEGY_OPTIONS: Array<{
  value: KnowledgeAssistantKitInputs['low_confidence_strategy'];
  label: string;
  desc: string;
}> = [
  {
    value: 'escalate_human',
    label: '转人工审核',
    desc: '置信度低时将问题直接转交人工客服',
  },
  {
    value: 'escalate_review',
    label: '进入审核队列',
    desc: '置信度低时将问题加入人工审核队列',
  },
  {
    value: 'reject_with_message',
    label: '返回拒答提示',
    desc: '置信度低时返回标准拒答模板，不转人工',
  },
];

const SOURCE_OPTIONS: Array<{
  value: KnowledgeAssistantKitInputs['knowledge_source'];
  label: string;
  icon: string;
  desc: string;
}> = [
  { value: 'upload', label: '上传文档', icon: '📄', desc: 'PDF · Markdown · TXT · DOCX · CSV' },
  { value: 'url', label: '填写 URL', icon: '🔗', desc: '网页 / 文档链接' },
  { value: 'existing_pack', label: '绑定已有知识包', icon: '📦', desc: '选择已创建的 KnowledgePack' },
  { value: 'none', label: '暂不绑定', icon: '⏭', desc: '仅使用拒答策略兜底' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  testId?: string;
}

function ToggleSwitch({ on, onChange, label, testId }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      data-testid={testId}
      className={[
        'relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-accent',
        on ? 'bg-sf-accent' : 'bg-sf-elev3',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform',
          on ? 'translate-x-[17px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  );
}

interface StepIndicatorProps {
  current: WizardStep;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className="mb-6 flex items-center gap-2" aria-label={`步骤 ${current} / ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as WizardStep;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                'flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold transition-all',
                step === current
                  ? 'bg-sf-accent text-white'
                  : step < current
                  ? 'bg-sf-ok/20 text-sf-ok'
                  : 'bg-sf-elev2 text-sf-fg4',
              ].join(' ')}
            >
              {step < current ? '✓' : step}
            </div>
            {i < total - 1 && (
              <div
                className={['h-px w-8 transition-colors', step < current ? 'bg-sf-ok/40' : 'bg-sf-border'].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role Preview Card (Step 3)
// ---------------------------------------------------------------------------

interface RoleCard {
  id: string;
  name: string;
  icon: string;
  description: string;
  badge?: string;
  badgeColor?: string;
}

function RolePreviewCard({ card }: { card: RoleCard }) {
  return (
    <div
      className="flex flex-col rounded-[12px] border border-sf-border bg-sf-elev1 p-4"
      data-testid={`role-preview-${card.id}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center justify-center text-sf-fg2" aria-hidden="true">
          <Icon token={card.icon} size={20} />
        </span>
        <span className="text-[14px] font-semibold text-sf-fg1">{card.name}</span>
        {card.badge && (
          <span
            className={[
              'ml-auto rounded-[4px] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]',
              card.badgeColor ?? 'bg-sf-elev2 text-sf-fg4',
            ].join(' ')}
          >
            {card.badge}
          </span>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-sf-fg4">{card.description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: 知识来源绑定
// ---------------------------------------------------------------------------

interface Step1Props {
  knowledgeSource: KnowledgeAssistantKitInputs['knowledge_source'];
  packId: string;
  onSourceChange: (v: KnowledgeAssistantKitInputs['knowledge_source']) => void;
  onPackIdChange: (v: string) => void;
  onNext: () => void;
  onCancel?: () => void;
}

function Step1KnowledgeSource({ knowledgeSource, packId, onSourceChange, onPackIdChange, onNext, onCancel }: Step1Props) {
  return (
    <div data-testid="wizard-step-1">
      <h3 className="mb-1 text-[17px] font-bold text-sf-fg1">知识来源绑定</h3>
      <p className="mb-5 text-[13px] text-sf-fg3">
        选择助手将使用的知识来源。你可以上传文档、填写 URL、绑定已有知识包，或暂不绑定。
      </p>

      {/* 来源选项卡片 */}
      <div className="mb-5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="知识来源类型">
        {SOURCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={knowledgeSource === opt.value}
            onClick={() => onSourceChange(opt.value)}
            data-testid={`source-option-${opt.value}`}
            className={[
              'flex flex-col rounded-[10px] border p-3 text-left transition-all',
              knowledgeSource === opt.value
                ? 'border-sf-accent bg-sf-accent/8 shadow-[0_0_0_1px_rgba(var(--sf-accent-raw),0.2)]'
                : 'border-sf-border bg-sf-elev1 hover:border-sf-accent/40',
            ].join(' ')}
          >
            <span className="mb-1 inline-flex items-center text-sf-fg2" aria-hidden="true">
              <Icon token={opt.icon} size={20} />
            </span>
            <span className="text-[13px] font-semibold text-sf-fg1">{opt.label}</span>
            <span className="text-[11px] text-sf-fg4">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* 条件输入：existing_pack 需要填写 pack_id */}
      {knowledgeSource === 'existing_pack' && (
        <div className="mb-5">
          <label className="mb-1 block text-[12px] font-medium text-sf-fg2">
            Knowledge Pack ID
          </label>
          <input
            type="text"
            value={packId}
            onChange={(e) => onPackIdChange(e.target.value)}
            placeholder="输入 KnowledgePack 名称或 ID"
            data-testid="pack-id-input"
            className="w-full rounded-[8px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[13px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
          />
          <p className="mt-1 font-mono text-[10px] text-sf-fg5">
            Knowledge Pack 在 Epic 9 中创建和管理
          </p>
        </div>
      )}

      {/* 状态提示 */}
      {knowledgeSource !== 'none' && (
        <div
          className="mb-5 rounded-[8px] border border-sf-accent/30 bg-sf-accent/8 px-3 py-2 font-mono text-[11px] text-sf-accent-bright"
          data-testid="source-status-badge"
        >
          {knowledgeSource === 'existing_pack' ? (
            <span>📦 indexing — 知识包状态轮询由 Epic 9 KnowledgeDock 处理</span>
          ) : (
            <span>⏳ pending — 知识导入将在 Kit 实例化后触发</span>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNext}
          data-testid="btn-step1-next"
          className="rounded-[8px] bg-sf-accent px-5 py-2 font-mono text-[12px] font-bold text-white hover:opacity-90"
        >
          下一步
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] bg-sf-elev2 px-5 py-2 font-mono text-[12px] text-sf-fg3 hover:text-sf-fg1"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: 行为偏好
// ---------------------------------------------------------------------------

interface Step2Props {
  citationRequired: boolean;
  strategy: KnowledgeAssistantKitInputs['low_confidence_strategy'];
  keywords: string[];
  onCitationChange: (v: boolean) => void;
  onStrategyChange: (v: KnowledgeAssistantKitInputs['low_confidence_strategy']) => void;
  onKeywordsChange: (v: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

function Step2Preferences({
  citationRequired,
  strategy,
  keywords,
  onCitationChange,
  onStrategyChange,
  onKeywordsChange,
  onNext,
  onBack,
}: Step2Props) {
  const [keywordInput, setKeywordInput] = useState('');

  function addKeyword() {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      onKeywordsChange([...keywords, kw]);
      setKeywordInput('');
    }
  }

  function removeKeyword(kw: string) {
    onKeywordsChange(keywords.filter((k) => k !== kw));
  }

  return (
    <div data-testid="wizard-step-2">
      <h3 className="mb-1 text-[17px] font-bold text-sf-fg1">行为偏好配置</h3>
      <p className="mb-5 text-[13px] text-sf-fg3">
        配置引用策略、低置信度处理方式和高风险关键词。
      </p>

      {/* 强制引用开关 */}
      <div className="mb-5 flex items-center justify-between rounded-[10px] border border-sf-border bg-sf-elev1 p-4">
        <div>
          <p className="text-[14px] font-semibold text-sf-fg1">强制引用来源</p>
          <p className="text-[12px] text-sf-fg4">所有回答必须附带 citation_trace（推荐开启）</p>
        </div>
        <ToggleSwitch
          on={citationRequired}
          onChange={onCitationChange}
          label="强制引用来源"
          testId="citation-required-toggle"
        />
      </div>

      {/* 升级策略单选 */}
      <div className="mb-5">
        <p className="mb-2 text-[13px] font-semibold text-sf-fg1">低置信度处理策略</p>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="低置信度处理策略">
          {STRATEGY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={strategy === opt.value}
              onClick={() => onStrategyChange(opt.value)}
              data-testid={`strategy-option-${opt.value}`}
              className={[
                'flex items-start gap-3 rounded-[10px] border p-3 text-left transition-all',
                strategy === opt.value
                  ? 'border-sf-accent bg-sf-accent/8'
                  : 'border-sf-border bg-sf-elev1 hover:border-sf-accent/40',
              ].join(' ')}
            >
              <div
                className={[
                  'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all',
                  strategy === opt.value
                    ? 'border-sf-accent bg-sf-accent'
                    : 'border-sf-fg4 bg-transparent',
                ].join(' ')}
              />
              <div>
                <p className="text-[13px] font-semibold text-sf-fg1">{opt.label}</p>
                <p className="text-[11px] text-sf-fg4">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 关键词列表（可选） */}
      <div className="mb-5">
        <p className="mb-1 text-[13px] font-semibold text-sf-fg1">
          高风险关键词 <span className="font-normal text-sf-fg4">（可选）</span>
        </p>
        <p className="mb-2 text-[11px] text-sf-fg4">
          命中这些关键词时强制引用来源，不允许引用缺失
        </p>
        {/* 关键词 chip 列表 */}
        {keywords.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" data-testid="keyword-chips">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="flex items-center gap-1 rounded-[6px] bg-sf-elev2 px-2 py-0.5 font-mono text-[11px] text-sf-fg2"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => removeKeyword(kw)}
                  className="text-sf-fg5 hover:text-sf-reject"
                  aria-label={`删除关键词 ${kw}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {/* 添加关键词输入框 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder="输入关键词，按 Enter 添加"
            data-testid="keyword-input"
            className="flex-1 rounded-[8px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={addKeyword}
            data-testid="btn-add-keyword"
            className="rounded-[8px] border border-sf-border bg-sf-elev2 px-3 py-2 text-[12px] text-sf-fg3 hover:text-sf-fg1"
          >
            添加
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNext}
          data-testid="btn-step2-next"
          className="rounded-[8px] bg-sf-accent px-5 py-2 font-mono text-[12px] font-bold text-white hover:opacity-90"
        >
          下一步
        </button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-[8px] bg-sf-elev2 px-5 py-2 font-mono text-[12px] text-sf-fg3 hover:text-sf-fg1"
        >
          上一步
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: 助手命名 + Blueprint 预览
// ---------------------------------------------------------------------------

interface Step3Props {
  assistantName: string;
  citationRequired: boolean;
  strategy: KnowledgeAssistantKitInputs['low_confidence_strategy'];
  onNameChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

function Step3Preview({
  assistantName,
  citationRequired,
  strategy,
  onNameChange,
  onSubmit,
  onBack,
  isSubmitting,
}: Step3Props) {
  const roleCards: RoleCard[] = [
    {
      id: 'retriever',
      name: 'Retriever',
      icon: '🔍',
      description: '执行知识库检索，输出命中片段与 confidence score。Retriever 故障时回退到拒答。',
    },
    {
      id: 'answerer',
      name: 'Answerer',
      icon: '💬',
      description: `基于检索片段生成带 citation_trace 的回答。${citationRequired ? '强制引用来源。' : ''}hit_count=0 时返回标准拒答模板。`,
      badge: citationRequired ? 'citation_required' : undefined,
      badgeColor: 'bg-sf-accent/10 text-sf-accent-bright',
    },
    {
      id: 'escalation',
      name: 'Escalation',
      icon: '🚨',
      description: `触发升级条件时接管，发出 human_handoff_event（${
        strategy === 'escalate_human' ? '转人工审核' :
        strategy === 'escalate_review' ? '进入审核队列' : '返回拒答提示'
      }）。`,
      badge: 'human',
      badgeColor: 'bg-sf-orange/10 text-sf-orange',
    },
  ];

  return (
    <div data-testid="wizard-step-3">
      <h3 className="mb-1 text-[17px] font-bold text-sf-fg1">助手命名 & Blueprint 预览</h3>
      <p className="mb-5 text-[13px] text-sf-fg3">为你的知识助手命名，并确认 3 角色 Blueprint 结构。</p>

      {/* 助手名称输入 */}
      <div className="mb-5">
        <label className="mb-1 block text-[13px] font-semibold text-sf-fg2">
          助手名称 <span className="text-sf-reject">*</span>
        </label>
        <input
          type="text"
          value={assistantName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="例如：产品文档助手 / HR 知识库助手"
          data-testid="assistant-name-input"
          className="w-full rounded-[8px] border border-sf-border bg-sf-elev1 px-3 py-2.5 text-[14px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
          maxLength={200}
        />
        <p className="mt-1 font-mono text-[10px] text-sf-fg5">
          用于 AgentDM 显示名和 Blueprint 标识
        </p>
      </div>

      {/* Blueprint 预览 — Scene Tree */}
      <div className="mb-5">
        <p className="mb-2 text-[13px] font-semibold text-sf-fg1">
          Scene Tree 预览
          <span className="ml-2 font-mono text-[10px] font-normal text-sf-fg4">
            Retriever → Answerer → Escalation
          </span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="role-cards">
          {roleCards.map((card) => (
            <RolePreviewCard key={card.id} card={card} />
          ))}
        </div>
      </div>

      {/* Policy 规则摘要 */}
      <div
        className="mb-5 rounded-[10px] border border-sf-border bg-sf-elev1 p-4"
        data-testid="policy-summary"
      >
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-sf-accent-bright">
          Policy 规则摘要
        </p>
        <ul className="space-y-1 font-mono text-[11px] text-sf-fg3">
          <li>◆ hit_count = 0 → Answerer 禁止发言，返回 no_source_response</li>
          <li>◆ confidence &lt; 0.5 → 转 Escalation，触发 human_handoff_event</li>
          <li>◆ escalation_keywords 命中 → 强制引用，不允许引用缺失</li>
          <li>◆ Retriever 故障 → 回退拒答，不崩溃整个助手</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!assistantName.trim() || isSubmitting}
          data-testid="btn-submit-wizard"
          className="rounded-[8px] bg-sf-accent px-5 py-2 font-mono text-[12px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              生成中…
            </span>
          ) : (
            '生成 Blueprint'
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="rounded-[8px] bg-sf-elev2 px-5 py-2 font-mono text-[12px] text-sf-fg3 hover:text-sf-fg1 disabled:opacity-50"
        >
          上一步
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeAssistantWizard — main export
// ---------------------------------------------------------------------------

export function KnowledgeAssistantWizard({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: KnowledgeAssistantWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [knowledgeSource, setKnowledgeSource] =
    useState<KnowledgeAssistantKitInputs['knowledge_source']>('none');
  const [packId, setPackId] = useState('');

  // Step 2 state
  const [citationRequired, setCitationRequired] = useState(true);
  const [strategy, setStrategy] =
    useState<KnowledgeAssistantKitInputs['low_confidence_strategy']>('escalate_human');
  const [keywords, setKeywords] = useState<string[]>([]);

  // Step 3 state
  const [assistantName, setAssistantName] = useState('Knowledge Assistant');

  function handleSubmit() {
    const inputs: KnowledgeAssistantKitInputs = {
      knowledge_source: knowledgeSource,
      citation_required: citationRequired,
      low_confidence_strategy: strategy,
      escalation_keywords: keywords,
      assistant_name: assistantName.trim() || 'Knowledge Assistant',
      pack_id: knowledgeSource === 'existing_pack' ? packId.trim() : undefined,
      confidence_threshold: 0.5,
    };
    onSubmit(inputs);
  }

  return (
    <div
      className="w-full max-w-[640px] rounded-[16px] border border-sf-border bg-sf-panel p-6"
      data-testid="knowledge-assistant-wizard"
    >
      {/* Header */}
      <div className="mb-5">
        <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-sf-accent-bright">
          Knowledge Assistant Kit
        </p>
        <h2 className="flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em] text-sf-fg1">
          <BookOpen size={20} strokeWidth={2} className="text-sf-accent-bright" />
          创建知识问答助手
        </h2>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} total={3} />

      {/* Step content */}
      {step === 1 && (
        <Step1KnowledgeSource
          knowledgeSource={knowledgeSource}
          packId={packId}
          onSourceChange={setKnowledgeSource}
          onPackIdChange={setPackId}
          onNext={() => setStep(2)}
          onCancel={onCancel}
        />
      )}

      {step === 2 && (
        <Step2Preferences
          citationRequired={citationRequired}
          strategy={strategy}
          keywords={keywords}
          onCitationChange={setCitationRequired}
          onStrategyChange={setStrategy}
          onKeywordsChange={setKeywords}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <Step3Preview
          assistantName={assistantName}
          citationRequired={citationRequired}
          strategy={strategy}
          onNameChange={setAssistantName}
          onSubmit={handleSubmit}
          onBack={() => setStep(2)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

export default KnowledgeAssistantWizard;
