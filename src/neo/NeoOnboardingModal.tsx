/**
 * NeoOnboardingModal — 首访入职问卷（2026-11-06，模仿 ZCode/Codex 对话框弹出形式）。
 *
 * 触发：进入秘书的会话（欢迎语上屏）后延迟弹出，居中模态 + 遮罩。
 *
 * 内容：模仿竞品「开场提示词」问卷——用轻量问题认识用户（称呼、职业、日常
 * 事务、想甩掉的重活、常用工具、沟通偏好、红线、今天想先做成的一件事）。
 * 全部可跳过（留空 = 「保持默认」）。
 *
 * 提交三连（2026-11-06 用户需求：问完直接做一个 Agent 给用户，对标 GrokBot
 * 「主Bot派活」+ OpenBot 员工即用）：
 *  1. 画像持久化 localStorage（'sf.user-profile'）；
 *  2. 自我介绍作为第一条用户消息发进与秘书的会话（NeoApp onFinished 承接）；
 *  3. 按「最想甩掉的重活」generateAgentPersona 生成专属助理 Agent 人设，
 *     quickCreateAgent 落库（复用 NeoCreateAgentModal 同款创建链路）；
 *     LLM 失败降级为问卷答案直拼的模板 persona——创建永不因 LLM 挂掉。
 *     成功经 onAgentCreated 上报（NeoApp 刷新左栏列表）。
 */
import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useI18n } from '../common/i18n';
import { quickCreateAgent } from '../api/agents';
import { generateAgentPersona } from '../api/llm';

export const ONBOARDING_DONE_KEY = 'sf.onboarding.done';
export const USER_PROFILE_KEY = 'sf.user-profile';

/** 单个问题定义：选项 chips + 可自由输入（ZCode/Codex 式「选或填」）。 */
interface QuizField {
  key: string;
  label: string;
  placeholder: string;
  options: string[];
  /** 多选（工具/事务类问题）。 */
  multi?: boolean;
}

const QUIZ_FIELDS: QuizField[] = [
  {
    key: 'name',
    label: '怎么称呼你',
    placeholder: '输入你希望被称呼的方式，可跳过',
    options: [],
  },
  {
    key: 'identity',
    label: '你是做什么的（职业/身份）',
    placeholder: '例如：产品经理 / 学生 / 独立开发者',
    options: ['产品经理', '开发者', '设计师', '运营', '学生'],
  },
  {
    key: 'daily',
    label: '你每天主要在忙什么',
    placeholder: '例如：开会、写文档、盯数据',
    options: ['写代码', '开会', '写文档', '盯数据', '回消息'],
    multi: true,
  },
  {
    key: 'delegate',
    label: '最想甩掉的重活是什么',
    placeholder: '例如：每天整理资讯、回邮件、做表格',
    options: ['整理资讯', '回邮件', '做表格', '写周报', '调研整理'],
    multi: true,
  },
  {
    key: 'tools',
    label: '常用工具（选/填，逗号分隔）',
    placeholder: '例如：Gmail、Notion、飞书、VS Code',
    options: ['飞书', 'Notion', 'VS Code', 'GitHub', '微信'],
    multi: true,
  },
  {
    key: 'style',
    label: '希望总经理怎么跟你说话',
    placeholder: '例如：简短中文、先给结论',
    options: ['简短中文', '先给结论', '详细解释', '列清单'],
  },
  {
    key: 'redline',
    label: '有哪些红线（总经理必须遵守）',
    placeholder: '例如：发消息前先给我看、不碰支付',
    options: ['发消息前先给我看', '不碰支付', '不主动加人', '重要决定先问我'],
    multi: true,
  },
  {
    key: 'firstTask',
    label: '今天就想让总经理先帮你做成的一件事',
    placeholder: '例如：帮我整理一份行业日报模板',
    options: [],
  },
];

export function NeoOnboardingModal({
  onFinished,
  onSkipped,
  onAgentCreated,
}: {
  /** 提交：带用户答案摘要（已拼好发秘书的第一条消息文本）。 */
  onFinished: (introMessage: string) => void;
  /** 跳过（右上 × 或 ESC）。 */
  onSkipped: () => void;
  /** 专属助理 Agent 创建成功（NeoApp 刷新左栏 + 气泡提示）。 */
  onAgentCreated?: (agent: { agent_id: string; name: string }) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [chips, setChips] = useState<Record<string, string[]>>({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Agent 生成阶段提示（submit 内逐步 setState，UI 实时反馈进度）
  const [phase, setPhase] = useState<'idle' | 'persona' | 'saving'>('idle');

  const field = QUIZ_FIELDS[step];
  const total = QUIZ_FIELDS.length;
  const isLast = step === total - 1;

  const toggleChip = (key: string, opt: string) => {
    setChips((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
      return { ...prev, [key]: next };
    });
  };

  const answerOf = (key: string): string => {
    const f = QUIZ_FIELDS.find((x) => x.key === key);
    if (!f) return '';
    return [...(chips[key] ?? []), (values[key] ?? '').trim()].filter(Boolean).join('、');
  };

  /** 问卷答案 → 专属助理 Agent 的兜底 persona（LLM 失败时的降级模板）。 */
  const buildFallbackPersona = (): { name: string; soul: string } => {
    const name = answerOf('delegate') ? `${answerOf('delegate').slice(0, 12)}助理` : '专属助理';
    const lines = [
      `你是用户的专属助理 Agent（由入职问卷自动生成）。`,
      answerOf('identity') && `用户身份：${answerOf('identity')}。`,
      answerOf('daily') && `用户日常：${answerOf('daily')}。`,
      answerOf('delegate') && `你的主责：替用户分担——${answerOf('delegate')}。`,
      answerOf('tools') && `用户常用工具：${answerOf('tools')}。`,
      answerOf('style') && `沟通风格：${answerOf('style')}。`,
      answerOf('redline') && `红线（必须遵守）：${answerOf('redline')}。`,
    ].filter(Boolean);
    return { name, soul: lines.join('\n') };
  };

  const submit = async () => {
    setSubmitting(true);
    const answerLines: string[] = [];
    for (const f of QUIZ_FIELDS) {
      const v = (values[f.key] ?? '').trim();
      const cs = chips[f.key] ?? [];
      const combined = [...cs, v].filter(Boolean).join('、');
      if (combined) answerLines.push(`${f.label}：${combined}`);
    }
    // 持久化画像（秘书后续对话可引用；设置页后续可展示/编辑）
    try {
      localStorage.setItem(
        USER_PROFILE_KEY,
        JSON.stringify({ updatedAt: new Date().toISOString(), answers: Object.fromEntries(QUIZ_FIELDS.map((f) => [f.key, [...(chips[f.key] ?? []), (values[f.key] ?? '').trim()].filter(Boolean).join('、')])) }),
      );
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    // ── 专属助理 Agent（2026-11-06：问完直接做一个 Agent 给用户）──────────
    // 以「最想甩掉的重活」为种子：LLM 生成人设，失败降级问卷直拼模板；
    // 创建失败也不阻塞（onboarding 本体的价值在画像 + 自我介绍）。
    const delegate = answerOf('delegate');
    if (delegate) {
      setPhase('persona');
      let persona = '';
      const agentName = `${delegate.slice(0, 12)}助理`;
      try {
        persona = await generateAgentPersona(
          `帮我招一个助理 Agent，主责替我分担：${delegate}。${answerOf('identity') ? `我是${answerOf('identity')}。` : ''}${answerOf('style') ? `沟通风格：${answerOf('style')}。` : ''}`,
        );
      } catch {
        const fb = buildFallbackPersona();
        persona = fb.soul;
      }
      setPhase('saving');
      try {
        const agent = await quickCreateAgent({ name: agentName, soul: persona });
        onAgentCreated?.({ agent_id: agent.agent_id, name: agent.name || agentName });
      } catch {
        /* 创建失败不阻塞 onboarding 完成（下次可手动建） */
      }
    }
    setPhase('idle');
    const intro = answerLines.length
      ? `（认识一下）你好，总经理，先自我介绍：\n${answerLines.join('\n')}\n请记住这些，之后按我习惯的方式跟我协作。`
      : '';
    onFinished(intro);
  };

  return (
    <div className="neo-onb-overlay" role="dialog" aria-modal="true" data-testid="neo-onboarding-modal">
      <div className="neo-onb-card">
        <button
          type="button"
          className="neo-onb-close"
          onClick={onSkipped}
          aria-label={t('common.close', { defaultValue: '关闭' })}
          data-testid="neo-onboarding-skip"
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
        <div className="neo-onb-head">
          <span className="neo-onb-badge">
            <Sparkles size={13} strokeWidth={1.9} aria-hidden />
          </span>
          <div className="neo-onb-title-wrap">
            <h2 className="neo-onb-title">
              {t('neo.onboarding.title', { defaultValue: '让总经理更快帮上你' })}
            </h2>
            <p className="neo-onb-sub">
              {t('neo.onboarding.sub', {
                defaultValue: '几个小问题，选一选或填一填，总经理据此安排怎么协助你。都可以跳过。',
              })}
            </p>
          </div>
        </div>

        <div className="neo-onb-progress" aria-hidden>
          <span className="neo-onb-progress-fill" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>

        <div className="neo-onb-body" key={field.key}>
          <label className="neo-onb-q" htmlFor={`neo-onb-${field.key}`}>
            {field.label}
          </label>
          {field.options.length > 0 && (
            <div className="neo-onb-chips">
              {field.options.map((opt) => {
                const on = (chips[field.key] ?? []).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`neo-onb-chip${on ? ' on' : ''}`}
                    onClick={() => toggleChip(field.key, opt)}
                    data-testid={`neo-onb-chip-${opt}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
          <input
            id={`neo-onb-${field.key}`}
            className="neo-onb-input"
            type="text"
            value={values[field.key] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isLast) {
                e.preventDefault();
                setStep((s) => s + 1);
              }
            }}
            placeholder={field.placeholder}
            data-testid={`neo-onb-input-${field.key}`}
          />
        </div>

        <div className="neo-onb-foot">
          <span className="neo-onb-step">
            {step + 1} / {total}
          </span>
          <div className="neo-onb-foot-actions">
            {step > 0 && (
              <button type="button" className="neo-onb-btn" onClick={() => setStep((s) => s - 1)} data-testid="neo-onb-back">
                {t('common.back', { defaultValue: '上一步' })}
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                className="neo-onb-btn primary"
                disabled={submitting}
                onClick={submit}
                data-testid="neo-onb-finish"
              >
                {submitting ? (
                  <>
                    <Loader2 size={12} strokeWidth={2} className="neo-spin" aria-hidden />
                    {phase === 'persona'
                      ? t('neo.onboarding.genPersona', { defaultValue: '正在生成你的专属助理…' })
                      : phase === 'saving'
                        ? t('neo.onboarding.savingAgent', { defaultValue: '正在创建助理 Agent…' })
                        : t('neo.onboarding.submitting', { defaultValue: '提交中…' })}
                  </>
                ) : (
                  t('neo.onboarding.finish', { defaultValue: '完成，开始使用' })
                )}
              </button>
            ) : (
              <button type="button" className="neo-onb-btn primary" onClick={() => setStep((s) => s + 1)} data-testid="neo-onb-next">
                {t('common.next', { defaultValue: '下一步' })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
