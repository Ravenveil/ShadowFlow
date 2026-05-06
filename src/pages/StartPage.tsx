import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GoalClarityWizard } from '../core/components/builder/GoalClarityWizard';

// ── Primitive card data ───────────────────────────────────────────────────────

const PRIMITIVES = [
  {
    id: 'agent',
    emoji: '🤖',
    title: '创建 Agent',
    desc: '定义一个 AI 员工——为它命名、赋予灵魂、绑定工具',
    action: '开始创建',
    href: '/builder?mode=single',
  },
  {
    id: 'team',
    emoji: '👥',
    title: '创建 Team',
    desc: '将多个 Agent 组成协作团队，配置审批门控与工作流',
    action: '组建团队',
    href: '/builder?mode=team',
  },
  {
    id: 'catalog',
    emoji: '📦',
    title: '从模板开始',
    desc: '浏览已发布的 Agent 与工作流模板，一键 Fork 到自己的工作区',
    action: '浏览模板',
    href: '/templates',
  },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function StartPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showWizard, setShowWizard] = useState(false);

  // Allow ?wizard=1 URL param to auto-open wizard
  useEffect(() => {
    if (searchParams.get('wizard') === '1') {
      setShowWizard(true);
    }
  }, [searchParams]);

  return (
    <div
      className="min-h-screen bg-sf-bg text-sf-fg1"
      style={{
        backgroundImage: 'radial-gradient(#27272A 1px, transparent 1px)',
        backgroundSize: '120px 120px',
      }}
      data-testid="start-page"
    >
      <div className="mx-auto max-w-3xl px-6 pt-20 pb-12">
        {/* Heading */}
        <div className="text-center mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sf-accent mb-3">
            ShadowFlow · 开始
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-sf-fg0 mb-3">
            今天想做什么？
          </h1>
          <p className="text-sm text-sf-fg3">
            选择一个起点，或让向导帮你决定
          </p>
        </div>

        {/* Primitive cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PRIMITIVES.map(card => (
            <button
              key={card.id}
              data-testid={`primitive-card-${card.id}`}
              onClick={() => navigate(card.href)}
              className="group flex flex-col items-start rounded-sf border border-sf-border bg-sf-panel p-5 text-left transition-all hover:border-sf-accent hover:shadow-glow-accent"
            >
              <span className="mb-3 text-2xl">{card.emoji}</span>
              <span className="text-sm font-semibold text-sf-fg1 group-hover:text-sf-accent-bright mb-1">
                {card.title}
              </span>
              <span className="text-xs text-sf-fg3 leading-relaxed mb-4">
                {card.desc}
              </span>
              <span className="mt-auto rounded-pill border border-sf-border px-3 py-1 text-xs text-sf-fg3 group-hover:border-sf-accent group-hover:text-sf-accent-bright transition-colors">
                {card.action} →
              </span>
            </button>
          ))}
        </div>

        {/* Wizard trigger */}
        {!showWizard && (
          <div className="mt-8 text-center">
            <button
              data-testid="goal-clarity-wizard-trigger"
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 rounded-pill border border-sf-border px-5 py-2.5 text-sm text-sf-fg3 hover:border-sf-accent hover:text-sf-accent-bright transition-colors"
            >
              不确定选哪个？让我帮你决定 →
            </button>
          </div>
        )}

        {/* GoalClarityWizard (inline expand) */}
        {showWizard && (
          <GoalClarityWizard onSkip={() => setShowWizard(false)} />
        )}
      </div>
    </div>
  );
}
