import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Intent inference ─────────────────────────────────────────────────────────

const INTENT_RULES: { keywords: string[]; intent: string }[] = [
  { keywords: ['研究', '调研', '总结', '搜集', '收集', '信息', '资料'], intent: 'research' },
  { keywords: ['写作', '报告', '文章', '内容', '写', '撰写', '文档'], intent: 'writing' },
  { keywords: ['代码', '开发', '编程', '工程', '程序', '软件', '实现'], intent: 'code' },
  { keywords: ['数据', '分析', '统计', '图表', '数字', '指标', '报表'], intent: 'data' },
  { keywords: ['审核', '评审', 'review', '审查', '检查', '校对', '审批'], intent: 'review' },
];

export function inferIntents(text: string): string[] {
  if (!text.trim()) return ['other'];
  const matched = INTENT_RULES
    .filter(rule => rule.keywords.some(kw => text.includes(kw)))
    .map(rule => rule.intent);
  return matched.length > 0 ? matched : ['other'];
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface WizardState {
  goal: string;
  intents: string[];
  scale_hint: 'single' | 'multi' | null;
}

export interface GoalClarityWizardProps {
  onSkip: () => void;
}

const STORAGE_KEY = 'sf_wizard_state';

const ALL_INTENTS = ['research', 'writing', 'code', 'data', 'review', 'other'];

const INTENT_LABELS: Record<string, string> = {
  research: '研究',
  writing: '写作',
  code: '代码',
  data: '数据',
  review: '审核',
  other: '其他',
};

// ── Component ────────────────────────────────────────────────────────────────

export function GoalClarityWizard({ onSkip }: GoalClarityWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [goal, setGoal] = useState('');
  const [intents, setIntents] = useState<string[]>(['other']);

  // Re-infer intents when goal text changes
  const handleGoalChange = useCallback((text: string) => {
    setGoal(text);
    setIntents(inferIntents(text));
  }, []);

  const toggleIntent = useCallback((intent: string) => {
    setIntents(prev =>
      prev.includes(intent)
        ? prev.filter(i => i !== intent)
        : [...prev, intent],
    );
  }, []);

  const handleNext = useCallback(() => {
    if (goal.trim()) {
      setStep(2);
    }
  }, [goal]);

  const handleScaleSelect = useCallback(
    (scale_hint: 'single' | 'multi') => {
      const state: WizardState = { goal, intents, scale_hint };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      const encodedGoal = encodeURIComponent(goal);
      const encodedIntents = intents.join(',');

      if (scale_hint === 'single') {
        navigate(`/builder?mode=single&goal=${encodedGoal}&intents=${encodedIntents}`);
      } else {
        navigate(`/builder?mode=team&goal=${encodedGoal}&intents=${encodedIntents}`);
      }
    },
    [goal, intents, navigate],
  );

  const handleSkip = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    onSkip();
  }, [onSkip]);

  return (
    <div
      className="mt-8 w-full max-w-xl mx-auto rounded-sf border border-sf-border bg-sf-panel p-6"
      data-testid="goal-clarity-wizard"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {/* Step indicator */}
          <span
            className={`h-2 w-2 rounded-full transition-colors ${
              step === 1 ? 'bg-sf-accent' : 'bg-sf-fg3'
            }`}
          />
          <span
            className={`h-2 w-2 rounded-full transition-colors ${
              step === 2 ? 'bg-sf-accent' : 'bg-sf-fg3'
            }`}
          />
          <span className="ml-2 text-xs text-sf-fg3 font-mono">
            {step} / 2
          </span>
        </div>
        <button
          className="text-xs text-sf-fg3 hover:text-sf-fg2 transition-colors"
          data-testid="wizard-skip-btn"
          onClick={handleSkip}
        >
          跳过，自己选 →
        </button>
      </div>

      {/* Step 1 ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div data-testid="wizard-step-1">
          <h3 className="text-base font-semibold text-sf-fg1 mb-1">
            你想做什么？
          </h3>
          <p className="text-xs text-sf-fg3 mb-3">
            用一两句话描述目标，系统帮你判断适合哪种方式
          </p>

          <textarea
            data-testid="wizard-goal-input"
            className="w-full rounded-sf border border-sf-border bg-sf-bg text-sf-fg1 placeholder:text-sf-fg4 text-sm p-3 resize-none focus:outline-none focus:border-sf-accent transition-colors"
            rows={3}
            maxLength={500}
            placeholder="描述你想做的事..."
            value={goal}
            onChange={e => handleGoalChange(e.target.value)}
          />

          {/* Intent tags */}
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_INTENTS.map(intent => {
              const active = intents.includes(intent);
              return (
                <button
                  key={intent}
                  data-testid={`wizard-intent-tag-${intent}`}
                  onClick={() => toggleIntent(intent)}
                  className={`rounded-pill border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-sf-accent bg-sf-accent/10 text-sf-accent-bright'
                      : 'border-sf-border bg-transparent text-sf-fg3 hover:border-sf-fg4 hover:text-sf-fg2'
                  }`}
                >
                  {INTENT_LABELS[intent] ?? intent}
                </button>
              );
            })}
          </div>

          <button
            data-testid="wizard-next-btn"
            disabled={!goal.trim()}
            onClick={handleNext}
            className="mt-5 w-full rounded-sf bg-sf-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-90"
          >
            下一步 →
          </button>
        </div>
      )}

      {/* Step 2 ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div data-testid="wizard-step-2">
          <h3 className="text-base font-semibold text-sf-fg1 mb-1">
            这件事的规模是？
          </h3>
          <p className="text-xs text-sf-fg3 mb-4">
            这会决定我们为你推荐单 Agent 还是多 Agent 协作团队
          </p>

          <div className="flex flex-col gap-3">
            {/* Single option */}
            <button
              data-testid="wizard-scale-single"
              onClick={() => handleScaleSelect('single')}
              className="group flex flex-col items-start rounded-sf border border-sf-border bg-sf-bg p-4 text-left transition-colors hover:border-sf-accent hover:bg-sf-accent/5"
            >
              <span className="text-sm font-semibold text-sf-fg1 group-hover:text-sf-accent-bright mb-1">
                只关注这件事本身
              </span>
              <span className="text-xs text-sf-fg3">
                适合 Deadline 截止前快速产出一份报告，单个 Agent + 内置工作流
              </span>
            </button>

            {/* Multi option */}
            <button
              data-testid="wizard-scale-multi"
              onClick={() => handleScaleSelect('multi')}
              className="group flex flex-col items-start rounded-sf border border-sf-border bg-sf-bg p-4 text-left transition-colors hover:border-sf-accent hover:bg-sf-accent/5"
            >
              <span className="text-sm font-semibold text-sf-fg1 group-hover:text-sf-accent-bright mb-1">
                这只是更大计划的一部分
              </span>
              <span className="text-xs text-sf-fg3">
                适合搭建持续运转的多专家协作流水线，先建 Agent 再纳入 Team
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalClarityWizard;
