/**
 * QuestionFormModal — S12
 *
 * Renders an interactive form when LLM emits `<sf:question-form>` during
 * Phase 1 (analyze) because user goal was too ambiguous. Borrowed from
 * open-design's `<question-form>` pattern.
 *
 * Body schema (parsed from JSON inside the tag):
 *
 *   {
 *     description?: string,
 *     questions: Array<{
 *       id: string,
 *       label: string,
 *       type: 'radio' | 'checkbox' | 'text',
 *       options?: string[],         // for radio / checkbox
 *       placeholder?: string,       // for text
 *       required?: boolean,
 *       maxSelections?: number,     // for checkbox
 *     }>
 *   }
 *
 * On submit:
 *   - Builds a `{ question_form_id, answers: {id: value} }` payload as JSON
 *   - Calls `onSubmit(content: string)` with that JSON serialised
 *   - Parent POSTs to /api/run-sessions/:id/messages as a follow-up turn
 *     carrying that JSON as content, which the LLM consumes on the next
 *     iteration.
 *   - Modal closes via parent-controlled `open` after the POST 201's
 *
 * "No mock" rule: this component only renders what the LLM gave us.
 * Unparseable body → renders a fallback "Invalid form schema" message
 * with the raw body for debug.
 */
import React, { useState, useMemo } from 'react';
import { X, Send } from 'lucide-react';

interface FormQuestion {
  id: string;
  label: string;
  type: 'radio' | 'checkbox' | 'text';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  maxSelections?: number;
}

interface FormBody {
  description?: string;
  questions: FormQuestion[];
}

export interface QuestionFormModalProps {
  open: boolean;
  formId: string;
  title: string;
  body: unknown;
  onSubmit: (jsonContent: string) => Promise<void> | void;
  onCancel: () => void;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function narrowBody(body: unknown): FormBody | { error: string; raw: unknown } {
  if (!isRecord(body)) return { error: 'body is not an object', raw: body };
  if (!Array.isArray(body.questions)) return { error: 'body.questions is not an array', raw: body };
  const questions: FormQuestion[] = [];
  for (const q of body.questions) {
    if (!isRecord(q)) continue;
    if (typeof q.id !== 'string' || typeof q.label !== 'string') continue;
    if (q.type !== 'radio' && q.type !== 'checkbox' && q.type !== 'text') continue;
    questions.push({
      id: q.id,
      label: q.label,
      type: q.type,
      options: Array.isArray(q.options) ? (q.options as unknown[]).filter((o): o is string => typeof o === 'string') : undefined,
      placeholder: typeof q.placeholder === 'string' ? q.placeholder : undefined,
      required: q.required === true,
      maxSelections: typeof q.maxSelections === 'number' ? q.maxSelections : undefined,
    });
  }
  return {
    description: typeof body.description === 'string' ? body.description : undefined,
    questions,
  };
}

export const QuestionFormModal: React.FC<QuestionFormModalProps> = ({
  open,
  formId,
  title,
  body,
  onSubmit,
  onCancel,
}) => {
  const parsed = useMemo(() => narrowBody(body), [body]);
  // string | string[] (checkbox accumulates), keyed by question id
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  if ('error' in parsed) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={overlayStyle}
        onClick={onCancel}
      >
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          <header style={headerStyle}>
            <span style={titleStyle}>无法渲染表单</span>
            <button type="button" onClick={onCancel} style={iconBtnStyle} aria-label="close">
              <X size={14} />
            </button>
          </header>
          <div style={{ padding: 16, fontSize: 12, color: 'var(--t-fg-3)' }}>
            <div style={{ color: 'var(--t-err, #EF4444)', marginBottom: 8 }}>
              错误：{parsed.error}
            </div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--t-panel-2)', padding: 8, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>
              {JSON.stringify(parsed.raw, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  const handleRadio = (qid: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };
  const handleCheckbox = (qid: string, value: string, max?: number) => {
    setAnswers((prev) => {
      const cur = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
      let next: string[];
      if (cur.includes(value)) {
        next = cur.filter((v) => v !== value);
      } else {
        next = max != null && cur.length >= max ? cur : [...cur, value];
      }
      return { ...prev, [qid]: next };
    });
  };
  const handleText = (qid: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const canSubmit = parsed.questions.every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    if (q.type === 'checkbox') return Array.isArray(v) && v.length > 0;
    return typeof v === 'string' && v.trim().length > 0;
  });

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const payload = { question_form_id: formId, answers };
      await onSubmit(JSON.stringify(payload));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" style={overlayStyle} onClick={onCancel}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()} data-testid="question-form-modal">
        <header style={headerStyle}>
          <span style={titleStyle}>{title || '需要您澄清'}</span>
          <button type="button" onClick={onCancel} style={iconBtnStyle} aria-label="close">
            <X size={14} />
          </button>
        </header>

        {parsed.description && (
          <div style={{ padding: '10px 16px 0 16px', fontSize: 12, color: 'var(--t-fg-3)', lineHeight: 1.5 }}>
            {parsed.description}
          </div>
        )}

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflowY: 'auto' }}>
          {parsed.questions.map((q) => (
            <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)' }}>
                {q.label}
                {q.required && <span style={{ color: 'var(--t-err, #EF4444)', marginLeft: 4 }}>*</span>}
              </label>

              {q.type === 'radio' && q.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {q.options.map((opt) => (
                    <label key={opt} style={radioRowStyle}>
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleRadio(q.id, opt)}
                      />
                      <span style={{ fontSize: 12 }}>{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'checkbox' && q.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {q.options.map((opt) => {
                    const checked = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt);
                    return (
                      <label key={opt} style={radioRowStyle}>
                        <input
                          type="checkbox"
                          name={q.id}
                          value={opt}
                          checked={checked}
                          onChange={() => handleCheckbox(q.id, opt, q.maxSelections)}
                        />
                        <span style={{ fontSize: 12 }}>{opt}</span>
                      </label>
                    );
                  })}
                  {q.maxSelections != null && (
                    <span style={{ fontSize: 10, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)' }}>
                      最多选 {q.maxSelections} 项
                    </span>
                  )}
                </div>
              )}

              {q.type === 'text' && (
                <input
                  type="text"
                  value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                  onChange={(e) => handleText(q.id, e.target.value)}
                  placeholder={q.placeholder}
                  style={textInputStyle}
                />
              )}
            </div>
          ))}
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={onCancel} style={cancelBtnStyle}>
            稍后再说
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{
              ...submitBtnStyle,
              opacity: !canSubmit || submitting ? 0.5 : 1,
              cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            <Send size={12} strokeWidth={2.2} />
            {submitting ? '提交中…' : '提交（继续）'}
          </button>
        </footer>
      </div>
    </div>
  );
};

// ── styles ───────────────────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  animation: 'rs-fade-in 200ms ease',
};

const panelStyle: React.CSSProperties = {
  width: 'min(520px, 92vw)',
  maxHeight: '85vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--t-panel)',
  border: '1px solid var(--t-border)',
  borderRadius: 12,
  boxShadow: '0 24px 48px -16px rgba(0,0,0,.45)',
  animation: 'rs-drawer-in 280ms ease',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 14px',
  borderBottom: '1px solid var(--t-border)',
  background: 'var(--t-panel-2)',
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--t-fg)',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--t-fg-3)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
};

const radioRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  padding: '3px 0',
};

const textInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  fontSize: 12.5,
  background: 'var(--t-bg)',
  color: 'var(--t-fg)',
  fontFamily: 'inherit',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '10px 14px',
  borderTop: '1px solid var(--t-border)',
  background: 'var(--t-panel-2)',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--t-fg-3)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const submitBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  background: 'var(--t-accent, #A855F7)',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--t-accent-ink, #fff)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default QuestionFormModal;
