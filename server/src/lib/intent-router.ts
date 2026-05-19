/**
 * intent-router.ts — TypeScript port of `shadowflow/runtime/intent_router.py`.
 *
 * Lightweight keyword-based goal classifier. Only classifies intent —
 * does NOT pick agents or compose teams. Team/agent composition is decided
 * downstream by the Assembler LLM, which is fed parsed skill content plus
 * this classifier's output.
 *
 * Faithful 1:1 port of the Python version: keyword lists, priority order
 * (workflow > review > report > answer), confidence values, complexity
 * scores, and the report/team default fallback are all preserved.
 *
 * Public surface for Stream A consumers in routes/run-sessions.ts:
 *
 *   classifyTS(goal: string): ClassifyResult
 *
 * Note: the design doc spec asks for kind ∈ {chat, clarify, task} with
 * confidence + reasons. The Python source emits richer output_type/mode
 * (answer | report | review | workflow) × (single | team) along with a
 * complexity score. We expose BOTH:
 *   - classifyTS()      — design-doc-compliant {kind, confidence, reasons}
 *   - classifyIntent()  — full Python-equivalent IntentResult shape
 * so the caller (Stream A) can pick whichever it needs without forcing a
 * second rewrite later.
 */

// ─── Design-doc public types (S1.1 spec) ───────────────────────────────────

export type IntentKind = 'chat' | 'clarify' | 'task';

export interface ClassifyResult {
  kind: IntentKind;
  confidence: number; // 0..1
  reasons: string[]; // matched keywords or rule names
}

// ─── Python-equivalent richer types (for parity with intent_router.py) ─────

export type OutputType = 'answer' | 'report' | 'review' | 'workflow';
export type AssemblyMode = 'single' | 'team';

export interface IntentResult {
  outputType: OutputType;
  mode: AssemblyMode;
  confidence: number;
  complexity: number;
}

// ─── Keyword tables (verbatim from Python: order, casing, content) ─────────

export const ANSWER_KW: readonly string[] = [
  '什么是',
  '有什么区别',
  '怎么',
  '如何',
  '解释',
  'what is',
  'how to',
  'difference',
  '是什么',
];

export const REPORT_KW: readonly string[] = [
  '调研',
  '报告',
  '分析',
  'research',
  'report',
  'survey',
  '调查',
  '综述',
];

export const REVIEW_KW: readonly string[] = [
  'review',
  '审查',
  '评审',
  '代码review',
  'code review',
  '帮我看',
  '找问题',
  'review这',
];

export const WORKFLOW_KW: readonly string[] = [
  '工作流',
  '流程',
  'workflow',
  'pipeline',
  '自动化',
  'automation',
  '可复用',
];

// ─── Core classifier (Python parity) ───────────────────────────────────────

interface KeywordHit {
  outputType: OutputType;
  mode: AssemblyMode;
  confidence: number;
  complexity: number;
  matched: string;
}

/**
 * Run keyword classification with the exact Python priority order:
 *   workflow > review > report > answer.
 * Returns the first hit (and which keyword matched) or null.
 */
function keywordClassify(goal: string): KeywordHit | null {
  const g = goal.toLowerCase();

  for (const kw of WORKFLOW_KW) {
    if (g.includes(kw)) {
      return { outputType: 'workflow', mode: 'team', confidence: 0.88, complexity: 3, matched: kw };
    }
  }
  for (const kw of REVIEW_KW) {
    if (g.includes(kw)) {
      return { outputType: 'review', mode: 'team', confidence: 0.9, complexity: 2, matched: kw };
    }
  }
  for (const kw of REPORT_KW) {
    if (g.includes(kw)) {
      return { outputType: 'report', mode: 'team', confidence: 0.87, complexity: 4, matched: kw };
    }
  }
  for (const kw of ANSWER_KW) {
    if (g.includes(kw)) {
      return { outputType: 'answer', mode: 'single', confidence: 0.85, complexity: 1, matched: kw };
    }
  }
  return null;
}

/**
 * Full Python-equivalent classify(). Honours `outputHint` override
 * (single for "answer", team otherwise), otherwise keyword-classifies,
 * otherwise falls back to the Python default of (report, team, 0.75, 3).
 *
 * Sync because the Python version's `async` is purely cosmetic — there
 * are no awaits inside it; TS callers don't need the Promise overhead.
 */
export function classifyIntent(
  goal: string,
  outputHint?: string | null,
): IntentResult {
  if (outputHint && (['answer', 'report', 'review', 'workflow'] as const).includes(outputHint as OutputType)) {
    const hint = outputHint as OutputType;
    const mode: AssemblyMode = hint === 'answer' ? 'single' : 'team';
    return { outputType: hint, mode, confidence: 1.0, complexity: 2 };
  }

  const hit = keywordClassify(goal);
  if (hit) {
    return {
      outputType: hit.outputType,
      mode: hit.mode,
      confidence: hit.confidence,
      complexity: hit.complexity,
    };
  }

  // Python default fallback
  return { outputType: 'report', mode: 'team', confidence: 0.75, complexity: 3 };
}

// ─── Design-doc-shaped wrapper: classifyTS() ───────────────────────────────

/**
 * Map Python output_type → design-doc IntentKind:
 *   - answer        → chat     (single-turn Q&A, no team)
 *   - report/review/workflow → task  (needs a team / multi-step plan)
 *
 * "clarify" is reserved for the case where the goal is too vague to
 * classify with any keyword AND too short to be a meaningful task —
 * the classifier needs to come back to the user before assembling.
 * We treat <= 3 chars (after trim) or empty input as needing clarify.
 */
export function classifyTS(goal: string): ClassifyResult {
  const trimmed = (goal ?? '').trim();
  const reasons: string[] = [];

  if (trimmed.length === 0) {
    return { kind: 'clarify', confidence: 1.0, reasons: ['empty_goal'] };
  }
  if (trimmed.length <= 3) {
    return { kind: 'clarify', confidence: 0.8, reasons: ['too_short'] };
  }

  const g = trimmed.toLowerCase();
  const hit = keywordClassify(g);

  if (hit) {
    reasons.push(`keyword:${hit.matched}`);
    reasons.push(`output_type:${hit.outputType}`);

    if (hit.outputType === 'answer') {
      return { kind: 'chat', confidence: hit.confidence, reasons };
    }
    // report / review / workflow → multi-step team task
    return { kind: 'task', confidence: hit.confidence, reasons };
  }

  // Python default fallback was (report, team, 0.75, 3) — treat as task,
  // but mark the rule that fired so callers can tell it was a guess.
  reasons.push('fallback:default_report_team');
  return { kind: 'task', confidence: 0.75, reasons };
}
