/**
 * ReviewApprovalWizard — Story 10.3 (AC1/AC5)
 *
 * 三步向导（Review & Approval Kit Goal Mode 输入）：
 *   Step 1: 内容类型（content_type）+ 审批层级（approval_levels）
 *   Step 2: 驳回上限（max_reject_rounds）+ 输出格式 + 角色命名
 *   Step 3: Blueprint 预览（2-3 角色卡片 + Policy Matrix 摘要）+ 确认提交
 *
 * 向导文案以场景驱动（如"内容由谁来审核？"）而非技术术语。
 * 提交后调用 instantiateReviewApprovalKit()，返回 AgentBlueprint。
 */
import { useState, useCallback } from 'react';
import { instantiateReviewApprovalKit } from '../../../../api/builder';
import type { ReviewApprovalKitInputs } from '../../../../common/types/kits';
import type { AgentBlueprint } from '../../../../common/types/agent-builder';
import { Icon, Check } from '../../../../common/icons/iconRegistry';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

interface WizardState {
  content_type: NonNullable<ReviewApprovalKitInputs['content_type']>;
  approval_levels: NonNullable<ReviewApprovalKitInputs['approval_levels']>;
  max_reject_rounds: number;
  output_format: string;
  reviewer_name: string;
  approver_name: string;
}

export interface ReviewApprovalWizardProps {
  /** 向导完成后（Blueprint 生成）的回调 */
  onComplete: (blueprint: AgentBlueprint) => void;
  /** 取消/关闭向导的回调 */
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// 选项定义
// ---------------------------------------------------------------------------

const CONTENT_TYPE_OPTIONS = [
  {
    value: 'document' as const,
    label: '文档 / 报告',
    desc: '长文档、项目报告、需要内容审核的文章',
    icon: '📄',
  },
  {
    value: 'code' as const,
    label: '代码 / PR',
    desc: '代码变更、Pull Request、技术文档',
    icon: '💻',
  },
  {
    value: 'proposal' as const,
    label: '方案 / 提案',
    desc: '商业提案、技术方案、决策文件',
    icon: '📋',
  },
  {
    value: 'custom' as const,
    label: '自定义',
    desc: '其他需要审批的内容类型',
    icon: '✨',
  },
] as const;

const APPROVAL_LEVEL_OPTIONS = [
  {
    value: 'single_review' as const,
    label: '单层审核',
    desc: '内容先由 Writer 起草，再经 Reviewer 审核通过即完成',
    roles: ['Writer', 'Reviewer'],
    icon: '👤',
  },
  {
    value: 'review_then_approve' as const,
    label: '双层审批',
    desc: '经过 Reviewer 复核后，还需 Approver 做最终审批',
    roles: ['Writer', 'Reviewer', 'Approver'],
    icon: '👥',
  },
] as const;

const OUTPUT_FORMAT_OPTIONS = [
  { value: 'markdown', label: 'Markdown', desc: '结构化文档，推荐用于报告和文章' },
  { value: 'json', label: 'JSON', desc: '机器可读格式，适合程序处理' },
  { value: 'plain_text', label: '纯文本', desc: '简洁无格式，适合电子邮件或简报' },
];

// 角色预览（3 角色最大配置）
const ROLE_PREVIEWS = [
  {
    id: 'writer',
    name: 'Writer',
    icon: '✍️',
    badge: '起草',
    desc: '负责生成初稿，根据审核意见修改并重新提交',
    color: 'blue',
    always: true,
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    icon: '🔍',
    badge: '复核',
    desc: '复核内容，提供 approve 或 reject 决定及具体建议',
    color: 'amber',
    always: true,
  },
  {
    id: 'approver',
    name: 'Approver',
    icon: '✅',
    badge: '审批',
    desc: '对通过 Reviewer 复核的内容做最终审批决策',
    color: 'green',
    always: false,
  },
];

// ---------------------------------------------------------------------------
// 样式工具
// ---------------------------------------------------------------------------

const cs = (...args: Array<string | false | null | undefined>) =>
  args.filter(Boolean).join(' ');

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 700,
  color: 'var(--t-fg-4)',
  marginBottom: 4,
  textTransform: 'uppercase' as const,
  letterSpacing: '.1em',
};

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20 }}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          style={{
            width: n === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background: n === current
              ? 'var(--t-accent, #7c5cfc)'
              : n < current
              ? 'var(--t-accent-dim, #5a3db8)'
              : 'var(--t-border, #2a2a3a)',
            transition: 'all .2s',
          }}
        />
      ))}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', marginLeft: 4 }}>
        步骤 {current} / {total}
      </span>
    </div>
  );
}

function OptionCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: { value: T; label: string; desc: string; icon?: string };
  selected: boolean;
  onSelect: (v: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        borderRadius: 10,
        border: `1.5px solid ${selected ? 'var(--t-accent, #7c5cfc)' : 'var(--t-border, #2a2a3a)'}`,
        background: selected ? 'rgba(124, 92, 252, 0.08)' : 'var(--t-panel-2)',
        cursor: 'pointer',
        transition: 'all .15s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      {option.icon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, marginTop: 1, color: 'var(--t-fg-2, #c5c5d6)' }}>
          <Icon token={option.icon} size={18} />
        </span>
      )}
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-fg, #e8e8f0)', marginBottom: 2 }}>
          {option.label}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--t-fg-3, #7a7a9a)', lineHeight: 1.5 }}>
          {option.desc}
        </div>
      </div>
      {selected && (
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', color: 'var(--t-accent, #7c5cfc)' }} aria-label="selected">
          <Check size={14} strokeWidth={2.5} aria-hidden />
        </span>
      )}
    </button>
  );
}

function RoleCard({
  role,
  active,
  customName,
}: {
  role: typeof ROLE_PREVIEWS[number];
  active: boolean;
  customName?: string;
}) {
  if (!active) return null;
  const colorMap: Record<string, string> = {
    blue: '#4da6ff',
    amber: '#f59e0b',
    green: '#34d399',
  };
  const accent = colorMap[role.color] ?? 'var(--t-accent, #7c5cfc)';
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${accent}33`,
        background: `${accent}0d`,
        display: 'flex',
        gap: 10,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, color: accent }}>
        <Icon token={role.icon} size={20} />
      </span>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-fg, #e8e8f0)' }}>
            {customName ?? role.name}
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: accent,
              background: `${accent}20`,
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            {role.badge}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--t-fg-3, #7a7a9a)', lineHeight: 1.5 }}>
          {role.desc}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export function ReviewApprovalWizard({ onComplete, onCancel }: ReviewApprovalWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    content_type: 'document',
    approval_levels: 'single_review',
    max_reject_rounds: 3,
    output_format: 'markdown',
    reviewer_name: 'Reviewer',
    approver_name: 'Approver',
  });

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const isThreeRole = state.approval_levels === 'review_then_approve';

  // ── Step 1 ──────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-fg)', margin: '0 0 4px' }}>
          内容是什么类型？
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--t-fg-3)', margin: 0 }}>
          选择最贴近您场景的内容类型，Kit 会自动调整 Writer 角色的输出格式。
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {CONTENT_TYPE_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            option={opt}
            selected={state.content_type === opt.value}
            onSelect={(v) => update('content_type', v)}
          />
        ))}
      </div>

      <div>
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-fg)', margin: '0 0 4px' }}>
            内容由谁来审核？
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--t-fg-3)', margin: 0 }}>
            选择审批层级，决定审批流程需要经过多少环节。
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {APPROVAL_LEVEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update('approval_levels', opt.value)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1.5px solid ${state.approval_levels === opt.value ? 'var(--t-accent, #7c5cfc)' : 'var(--t-border, #2a2a3a)'}`,
                background: state.approval_levels === opt.value
                  ? 'rgba(124, 92, 252, 0.08)'
                  : 'var(--t-panel-2)',
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, color: 'var(--t-fg-2, #c5c5d6)' }}>
                  <Icon token={opt.icon} size={18} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-fg)' }}>{opt.label}</span>
                {state.approval_levels === opt.value && (
                  <span style={{ marginLeft: 'auto', color: 'var(--t-accent, #7c5cfc)' }}>✓</span>
                )}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--t-fg-3)', margin: '0 0 8px 26px' }}>
                {opt.desc}
              </p>
              <div style={{ display: 'flex', gap: 4, marginLeft: 26 }}>
                {opt.roles.map((r) => (
                  <span
                    key={r}
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--t-panel-3)',
                      border: '1px solid var(--t-border)',
                      borderRadius: 4,
                      padding: '1px 6px',
                      color: 'var(--t-fg-3)',
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Step 2 ──────────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 驳回上限 */}
      <div>
        <label style={labelStyle}>驳回上限（max_reject_rounds）</label>
        <p style={{ fontSize: 11.5, color: 'var(--t-fg-3)', margin: '0 0 10px' }}>
          Writer 被驳回超过此轮次后，流程标记为"需升级处理"。当前：
          <strong style={{ color: 'var(--t-accent, #7c5cfc)' }}> {state.max_reject_rounds} 轮</strong>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="range"
            min={1}
            max={10}
            value={state.max_reject_rounds}
            onChange={(e) => update('max_reject_rounds', Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--t-accent, #7c5cfc)' }}
          />
          <span
            style={{
              minWidth: 32,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--t-accent, #7c5cfc)',
            }}
          >
            {state.max_reject_rounds}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
          <span>1（严格）</span>
          <span>10（宽松）</span>
        </div>
      </div>

      {/* 输出格式 */}
      <div>
        <label style={labelStyle}>输出格式</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {OUTPUT_FORMAT_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              option={opt}
              selected={state.output_format === opt.value}
              onSelect={(v) => update('output_format', v)}
            />
          ))}
        </div>
      </div>

      {/* 角色命名（可选） */}
      <div>
        <label style={labelStyle}>审核角色命名（可选）</label>
        <p style={{ fontSize: 11.5, color: 'var(--t-fg-3)', margin: '0 0 10px' }}>
          可自定义审核人和审批人的显示名称，默认使用 "Reviewer" 和 "Approver"。
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, marginBottom: 4 }}>审核人名称</label>
            <input
              type="text"
              value={state.reviewer_name}
              onChange={(e) => update('reviewer_name', e.target.value || 'Reviewer')}
              placeholder="Reviewer"
              maxLength={64}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--t-border)',
                background: 'var(--t-panel-2)',
                color: 'var(--t-fg)',
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {isThreeRole && (
            <div style={{ flex: 1 }}>
              <label style={{ ...labelStyle, marginBottom: 4 }}>审批人名称</label>
              <input
                type="text"
                value={state.approver_name}
                onChange={(e) => update('approver_name', e.target.value || 'Approver')}
                placeholder="Approver"
                maxLength={64}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--t-border)',
                  background: 'var(--t-panel-2)',
                  color: 'var(--t-fg)',
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Step 3: Blueprint 预览 ────────────────────────────────────────────
  const renderStep3 = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-fg)', margin: '0 0 4px' }}>
          Blueprint 预览
        </h3>
        <p style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: 0 }}>
          确认角色配置与 Policy 规则，点击「生成 Blueprint」后开始构建。
        </p>
      </div>

      {/* 角色卡片 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {ROLE_PREVIEWS.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            active={role.always || isThreeRole}
            customName={
              role.id === 'reviewer'
                ? state.reviewer_name
                : role.id === 'approver'
                ? state.approver_name
                : undefined
            }
          />
        ))}
      </div>

      {/* Policy Matrix 摘要 */}
      <div
        style={{
          borderRadius: 10,
          border: '1px solid var(--t-border)',
          background: 'var(--t-panel-2)',
          padding: '12px 14px',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: 'var(--t-fg-4)',
            marginBottom: 10,
          }}
        >
          Policy Matrix 摘要
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <PolicyRow
            sender="Writer"
            arrow="→"
            receiver={state.reviewer_name}
            label="只能发给 Reviewer"
            type="send"
          />
          <PolicyRow
            sender={state.reviewer_name}
            arrow="↩"
            receiver="Writer"
            label="可驳回 Writer（触发 checkpoint）"
            type="reject"
          />
          {isThreeRole && (
            <>
              <PolicyRow
                sender={state.reviewer_name}
                arrow="→"
                receiver={state.approver_name}
                label="通过后发给 Approver"
                type="send"
              />
              <PolicyRow
                sender={state.approver_name}
                arrow="↩"
                receiver="Writer"
                label="可驳回 Writer（触发 checkpoint）"
                type="reject"
              />
            </>
          )}
          <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--t-border)' }}>
            <span style={{ color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              驳回上限：{state.max_reject_rounds} 轮 · 超出后标记 escalated
            </span>
          </div>
        </div>
      </div>

      {/* 配置摘要行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[
          { label: '内容类型', value: state.content_type },
          { label: '审批层级', value: state.approval_levels },
          { label: '输出格式', value: state.output_format },
          { label: '驳回上限', value: `${state.max_reject_rounds} 轮` },
        ].map(({ label, value }) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              background: 'var(--t-panel-3)',
              border: '1px solid var(--t-border)',
              borderRadius: 4,
              padding: '2px 7px',
              color: 'var(--t-fg-3)',
            }}
          >
            {label}: {value}
          </span>
        ))}
      </div>
    </div>
  );

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const inputs: ReviewApprovalKitInputs = {
        content_type: state.content_type,
        approval_levels: state.approval_levels,
        max_reject_rounds: state.max_reject_rounds,
        output_format: state.output_format,
        reviewer_name: state.reviewer_name,
        approver_name: state.approver_name,
      };
      const blueprint = await instantiateReviewApprovalKit(inputs);
      onComplete(blueprint);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成 Blueprint 失败，请重试';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [state, onComplete]);

  // ── 导航 ─────────────────────────────────────────────────────────────────
  const canProceedStep1 = Boolean(state.content_type && state.approval_levels);
  const canProceedStep2 = state.max_reject_rounds >= 1 && state.max_reject_rounds <= 10;

  const canNext = step === 1 ? canProceedStep1 : step === 2 ? canProceedStep2 : false;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
        padding: '24px 20px',
        background: 'var(--t-panel)',
        borderRadius: 16,
        border: '1px solid var(--t-border)',
      }}
      data-testid="review-approval-wizard"
    >
      {/* 顶部标题 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--t-accent, #7c5cfc)', marginBottom: 4 }}>
          Review &amp; Approval Kit
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-fg)', margin: 0, letterSpacing: '-.02em' }}>
          配置审批流程
        </h2>
      </div>

      <StepIndicator current={step} total={3} />

      {/* Step 内容 */}
      <div style={{ minHeight: 300 }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      {/* 错误提示 */}
      {submitError && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255, 80, 80, 0.08)',
            border: '1px solid rgba(255, 80, 80, 0.25)',
            fontSize: 12,
            color: '#ff6b6b',
          }}
          role="alert"
          data-testid="wizard-submit-error"
        >
          {submitError}
        </div>
      )}

      {/* 导航按钮 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid var(--t-border)',
        }}
      >
        {/* 左侧：取消 / 返回 */}
        <button
          type="button"
          onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as Step)}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--t-border)',
            background: 'transparent',
            color: 'var(--t-fg-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            cursor: 'pointer',
          }}
          data-testid="wizard-back-btn"
        >
          {step === 1 ? '取消' : '← 返回'}
        </button>

        {/* 右侧：下一步 / 生成 Blueprint */}
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={!canNext}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: canNext ? 'var(--t-accent, #7c5cfc)' : 'var(--t-border)',
              color: canNext ? 'white' : 'var(--t-fg-5)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              cursor: canNext ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
            }}
            data-testid="wizard-next-btn"
          >
            下一步 →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--t-accent, #7c5cfc)',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            data-testid="wizard-submit-btn"
          >
            {isSubmitting ? (
              <>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,.3)',
                    borderTopColor: 'white',
                    display: 'inline-block',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
                生成中…
              </>
            ) : (
              '生成 Blueprint ✓'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PolicyRow 子组件（Policy Matrix 摘要行）
// ---------------------------------------------------------------------------

function PolicyRow({
  sender,
  arrow,
  receiver,
  label,
  type,
}: {
  sender: string;
  arrow: string;
  receiver: string;
  label: string;
  type: 'send' | 'reject';
}) {
  const typeColor = type === 'send' ? '#4da6ff' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
      <span
        style={{
          background: 'var(--t-panel-3)',
          border: '1px solid var(--t-border)',
          borderRadius: 4,
          padding: '1px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--t-fg-2)',
          whiteSpace: 'nowrap',
        }}
      >
        {sender}
      </span>
      <span style={{ color: typeColor, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {arrow}
      </span>
      <span
        style={{
          background: 'var(--t-panel-3)',
          border: '1px solid var(--t-border)',
          borderRadius: 4,
          padding: '1px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--t-fg-2)',
          whiteSpace: 'nowrap',
        }}
      >
        {receiver}
      </span>
      <span style={{ color: 'var(--t-fg-4)', fontSize: 11 }}>{label}</span>
    </div>
  );
}

export default ReviewApprovalWizard;
