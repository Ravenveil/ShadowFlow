/**
 * KitSmokeRunPanel — Story 10.6 (AC5)
 *
 * Triggers Kit smoke / regression runs against a Blueprint and renders:
 *   - status header (pass/fail + duration)
 *   - per-case list with metric values
 *   - expandable failure details (missing configs + detail message)
 *   - suggested-fix buttons (navigate to KnowledgeDock / PolicyMatrix / etc.)
 *   - regression comparison table (when baseline available)
 *
 * Test ids used by Story 10.6 vitest:
 *   smoke-run-panel
 *   smoke-case-{name}
 *   fix-action-{target}
 */
import { useState } from 'react';
import { CheckCircle2 as KsrCheck, X as KsrX } from '../../../common/icons/iconRegistry';
import {
  runKitSmoke,
  runKitRegression,
  type KitSmokeRunReport,
  type KitRegressionReport,
  type KitSmokeCaseResult,
  type KitSuggestedFix,
} from '../../../api/builder';
import type { AgentBlueprint } from '../../../common/types/agent-builder';

export interface KitSmokeRunPanelProps {
  kitId: string;
  blueprint: AgentBlueprint;
  onNavigate?: (target: string) => void;
}

type Status = 'idle' | 'running' | 'done' | 'error';

export function KitSmokeRunPanel({
  kitId,
  blueprint,
  onNavigate,
}: KitSmokeRunPanelProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<KitSmokeRunReport | null>(null);
  const [regression, setRegression] = useState<KitRegressionReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function handleSmoke() {
    setStatus('running');
    setErrorMsg(null);
    setRegression(null);
    try {
      const r = await runKitSmoke(kitId, blueprint);
      setReport(r);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  async function handleRegression() {
    setStatus('running');
    setErrorMsg(null);
    try {
      const r = await runKitRegression(kitId, blueprint);
      setRegression(r);
      setReport(r.current ?? null);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  function toggle(name: string) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function clickFix(fix: KitSuggestedFix) {
    if (onNavigate) onNavigate(fix.target);
  }

  return (
    <div data-testid="smoke-run-panel" className="kit-smoke-run-panel">
      <div className="kit-smoke-actions" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          data-testid="smoke-run-trigger"
          onClick={handleSmoke}
          disabled={status === 'running'}
        >
          Smoke Run
        </button>
        <button
          type="button"
          data-testid="smoke-regression-trigger"
          onClick={handleRegression}
          disabled={status === 'running'}
        >
          Regression
        </button>
      </div>

      {status === 'running' && (
        <div data-testid="smoke-run-progress" role="status">
          运行中…
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div data-testid="smoke-run-error" role="alert">
          运行失败：{errorMsg}
        </div>
      )}

      {report && (
        <div data-testid="smoke-run-result">
          <header data-testid="smoke-run-header">
            <span data-testid="smoke-run-status">
              {report.passed ? (
                <span className="inline-flex items-center gap-1.5"><KsrCheck size={12} strokeWidth={2} /> 通过</span>
              ) : (
                <span className="inline-flex items-center gap-1.5"><KsrX size={12} strokeWidth={2} /> 失败</span>
              )}
            </span>
            <span data-testid="smoke-run-duration">
              {report.duration_s.toFixed(2)}s
            </span>
            {report.error && (
              <span data-testid="smoke-run-error-tag">{report.error}</span>
            )}
          </header>

          <ul data-testid="smoke-case-list">
            {report.case_results.map((c) => (
              <CaseRow
                key={c.name}
                caseResult={c}
                expanded={!!expanded[c.name]}
                onToggle={() => toggle(c.name)}
                onFix={clickFix}
              />
            ))}
          </ul>
        </div>
      )}

      {regression && regression.baseline_comparison.length === 0 && (
        <div
          data-testid="regression-first-run-banner"
          role="status"
          className="kit-smoke-first-run-banner"
        >
          首次运行 — 已记录为 baseline，下次运行将进行回归对比。
        </div>
      )}

      {regression && regression.baseline_comparison.length > 0 && (
        <table data-testid="regression-comparison">
          <thead>
            <tr>
              <th>指标</th>
              <th>baseline</th>
              <th>当前</th>
              <th>变化</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            {regression.baseline_comparison.map((d) => (
              <tr
                key={d.metric}
                data-testid={`regression-row-${d.metric}`}
                data-verdict={d.verdict}
              >
                <td>{d.metric}</td>
                <td>{d.baseline.toFixed(2)}</td>
                <td>{d.current.toFixed(2)}</td>
                <td>{d.delta_pct.toFixed(1)}%</td>
                <td>{d.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CaseRow({
  caseResult,
  expanded,
  onToggle,
  onFix,
}: {
  caseResult: KitSmokeCaseResult;
  expanded: boolean;
  onToggle: () => void;
  onFix: (fix: KitSuggestedFix) => void;
}) {
  const c = caseResult;
  return (
    <li data-testid={`smoke-case-${c.name}`} data-passed={c.passed ? 'true' : 'false'}>
      <button
        type="button"
        data-testid={`smoke-case-toggle-${c.name}`}
        onClick={onToggle}
      >
        {c.passed ? '✓' : '✗'} {c.name}
        {c.failed_stage && <em> — {c.failed_stage}</em>}
      </button>
      {Object.entries(c.metrics).length > 0 && (
        <span data-testid={`smoke-case-metrics-${c.name}`}>
          {Object.entries(c.metrics)
            .map(([k, v]) => `${k}=${v}`)
            .join(' · ')}
        </span>
      )}
      {expanded && (
        <div data-testid={`smoke-case-detail-${c.name}`}>
          {c.detail && <p>{c.detail}</p>}
          {c.missing_configs.length > 0 && (
            <ul data-testid={`smoke-case-missing-${c.name}`}>
              {c.missing_configs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {c.suggested_fixes.length > 0 && (
            <div data-testid={`smoke-case-fixes-${c.name}`}>
              {c.suggested_fixes.map((f) => (
                <button
                  key={`${f.label}:${f.target}`}
                  type="button"
                  data-testid={`fix-action-${f.target}`}
                  onClick={() => onFix(f)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default KitSmokeRunPanel;
