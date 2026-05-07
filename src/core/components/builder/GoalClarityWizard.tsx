import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../../common/i18n';

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
  step?: 1 | 2;
}

export interface GoalClarityWizardProps {
  onSkip: () => void;
}

const STORAGE_KEY = 'sf_wizard_state';

const ALL_INTENTS = ['research', 'writing', 'code', 'data', 'review', 'other'];

const INTENT_LABELS_ZH: Record<string, string> = {
  research: '研究',
  writing: '写作',
  code: '代码',
  data: '数据',
  review: '审核',
  other: '其他',
};

const INTENT_LABELS_EN: Record<string, string> = {
  research: 'Research',
  writing: 'Writing',
  code: 'Code',
  data: 'Data',
  review: 'Review',
  other: 'Other',
};

// ── Component ────────────────────────────────────────────────────────────────

export function GoalClarityWizard({ onSkip }: GoalClarityWizardProps) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const INTENT_LABELS = language === 'zh' ? INTENT_LABELS_ZH : INTENT_LABELS_EN;

  // Story 13-4 H2 — restore from sessionStorage on mount (synchronous initializer
  // so the first paint reflects the persisted state).
  const initialState = (() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<WizardState>;
      return {
        goal: typeof parsed.goal === 'string' ? parsed.goal : '',
        intents: Array.isArray(parsed.intents) && parsed.intents.length > 0
          ? parsed.intents
          : ['other'],
        step: parsed.step === 2 ? 2 : 1,
      } as { goal: string; intents: string[]; step: 1 | 2 };
    } catch {
      return null;
    }
  })();

  const [step, setStep] = useState<1 | 2>(initialState?.step ?? 1);
  const [goal, setGoal] = useState(initialState?.goal ?? '');
  const [intents, setIntents] = useState<string[]>(initialState?.intents ?? ['other']);

  // Story 13-4 H2 — persist {goal, intents, step} on every change so a
  // refresh during Step 1 input does not lose the goal.
  const didMountRef = useRef(false);
  useEffect(() => {
    // Skip first run if we just restored from storage (avoid noop write churn,
    // but also harmless if it runs).
    didMountRef.current = true;
    const state: WizardState = { goal, intents, scale_hint: null, step };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / disabled storage
    }
  }, [goal, intents, step]);

  // Re-infer intents when goal text changes
  const handleGoalChange = useCallback((text: string) => {
    setGoal(text);
    setIntents(inferIntents(text));
  }, []);

  const toggleIntent = useCallback((intent: string) => {
    setIntents(prev => {
      const next = prev.includes(intent)
        ? prev.filter(i => i !== intent)
        : [...prev, intent];
      return next.length > 0 ? next : ['other'];
    });
  }, []);

  const handleNext = useCallback(() => {
    if (goal.trim()) {
      setStep(2);
    }
  }, [goal]);

  // Story 13-4 H3 — back navigation from Step 2 → Step 1, state preserved.
  const handleBack = useCallback(() => {
    setStep(1);
  }, []);

  const handleStepDotClick = useCallback((target: 1 | 2) => {
    if (target === 1) {
      setStep(1);
    } else if (target === 2 && goal.trim()) {
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
          {/* Step indicator (Story 13-4 H3 — clickable) */}
          <button
            type="button"
            data-testid="wizard-step-dot-1"
            aria-label={T('返回第 1 步', 'Back to Step 1')}
            onClick={() => handleStepDotClick(1)}
            className={`h-2 w-2 rounded-full transition-colors ${
              step === 1 ? 'bg-sf-accent' : 'bg-sf-fg3 hover:bg-sf-fg2'
            }`}
          />
          <button
            type="button"
            data-testid="wizard-step-dot-2"
            aria-label={T('前往第 2 步', 'Go to Step 2')}
            disabled={!goal.trim()}
            onClick={() => handleStepDotClick(2)}
            className={`h-2 w-2 rounded-full transition-colors disabled:cursor-not-allowed ${
              step === 2 ? 'bg-sf-accent' : 'bg-sf-fg3 hover:bg-sf-fg2'
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
          {T('跳过，自己选 →', 'Skip — choose myself →')}
        </button>
      </div>

      {/* Step 1 ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div data-testid="wizard-step-1">
          <h3 className="text-base font-semibold text-sf-fg1 mb-1">
            {T('你想做什么？', 'What do you want to do?')}
          </h3>
          <p className="text-xs text-sf-fg3 mb-3">
            {T(
              '用一两句话描述目标，系统帮你判断适合哪种方式',
              'Describe your goal in a sentence or two; we will recommend the right approach.',
            )}
          </p>

          <textarea
            data-testid="wizard-goal-input"
            className="w-full rounded-sf border border-sf-border bg-sf-bg text-sf-fg1 placeholder:text-sf-fg4 text-sm p-3 resize-none focus:outline-none focus:border-sf-accent transition-colors"
            rows={3}
            maxLength={500}
            placeholder={T('描述你想做的事...', 'Describe what you want to do...')}
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
            {T('下一步 →', 'Next →')}
          </button>
        </div>
      )}

      {/* Step 2 ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div data-testid="wizard-step-2">
          {/* Story 13-4 H3 — Back to Step 1 (state preserved) */}
          <button
            type="button"
            data-testid="wizard-back-btn"
            onClick={handleBack}
            className="mb-2 inline-flex items-center text-xs text-sf-fg3 hover:text-sf-fg1 transition-colors"
          >
            {T('← 返回', '← Back')}
          </button>
          <h3 className="text-base font-semibold text-sf-fg1 mb-1">
            {T('这件事的规模是？', 'What is the scale of this work?')}
          </h3>
          <p className="text-xs text-sf-fg3 mb-4">
            {T(
              '这会决定我们为你推荐单 Agent 还是多 Agent 协作团队',
              'This determines whether we recommend a single Agent or a multi-Agent team.',
            )}
          </p>

          <div className="flex flex-col gap-3">
            {/* Single option */}
            <button
              data-testid="wizard-scale-single"
              onClick={() => handleScaleSelect('single')}
              className="group flex flex-col items-start rounded-sf border border-sf-border bg-sf-bg p-4 text-left transition-colors hover:border-sf-accent hover:bg-sf-accent/5"
            >
              <span className="text-sm font-semibold text-sf-fg1 group-hover:text-sf-accent-bright mb-1">
                {T('只关注这件事本身', 'Just focus on this task')}
              </span>
              <span className="text-xs text-sf-fg3">
                {T(
                  '适合 Deadline 截止前快速产出一份报告，单个 Agent + 内置工作流',
                  'Best for quickly producing a deliverable before a deadline — a single Agent plus a built-in workflow.',
                )}
              </span>
            </button>

            {/* Multi option */}
            <button
              data-testid="wizard-scale-multi"
              onClick={() => handleScaleSelect('multi')}
              className="group flex flex-col items-start rounded-sf border border-sf-border bg-sf-bg p-4 text-left transition-colors hover:border-sf-accent hover:bg-sf-accent/5"
            >
              <span className="text-sm font-semibold text-sf-fg1 group-hover:text-sf-accent-bright mb-1">
                {T('这只是更大计划的一部分', 'This is part of a larger plan')}
              </span>
              <span className="text-xs text-sf-fg3">
                {T(
                  '适合搭建持续运转的多专家协作流水线，先建 Agent 再纳入 Team',
                  'Best for building a continuous multi-expert pipeline — create the Agent first, then add it to a Team.',
                )}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoalClarityWizard;
