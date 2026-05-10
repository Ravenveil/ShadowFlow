/**
 * CritiqueResult.tsx — Story 15.14 — 5+1 维质量自检雷达图 + 改进列表.
 *
 * 维度（轴名）:
 *   Goal / Completeness / Structure / Grounding / Anti-pattern (+ Policy 可选)
 *
 * 渲染策略：纯 SVG（无 recharts 依赖），多边形雷达 + 半径轴 + 维度文字 + 分数条。
 * scores 全 null 时降级为 "质量自检不可用：{overall_summary}"。
 */
import React from 'react';
import type { CritiqueResultEvent, CritiqueDimensionKey } from '../api/runSessions';

interface Props {
  result: CritiqueResultEvent;
}

interface Axis {
  key: CritiqueDimensionKey;
  label: string;
}

const BASE_AXES: Axis[] = [
  { key: 'goal_achievement', label: 'Goal' },
  { key: 'skill_completeness', label: 'Completeness' },
  { key: 'structural_integrity', label: 'Structure' },
  { key: 'reference_grounding', label: 'Grounding' },
  { key: 'anti_pattern_free', label: 'Anti-pattern' },
];

export function CritiqueResult({ result }: Props): React.ReactElement {
  // Failure state — degrade gracefully without rendering radar.
  if (!result.scores) {
    return (
      <div
        data-testid="critique-result-degraded"
        style={{
          margin: 12,
          padding: 12,
          borderRadius: 10,
          border: '1px solid rgba(245,158,11,.4)',
          background: 'rgba(245,158,11,.08)',
          color: 'var(--t-warn, #f59e0b)',
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>质量自检不可用</div>
        <div>{result.overall_summary || result.error_message || '(no detail)'}</div>
      </div>
    );
  }

  // Build the axis list — append Policy only when scores include a non-null value.
  const policy = result.scores.policy_compliance;
  const axes: Axis[] = policy && typeof policy === 'object' && typeof policy.score === 'number'
    ? [...BASE_AXES, { key: 'policy_compliance', label: 'Policy' }]
    : BASE_AXES;

  // Pull (score / rationale / improvement) per axis.
  const axisData = axes.map((a) => {
    const dim = result.scores?.[a.key] ?? null;
    return {
      ...a,
      score: dim?.score ?? 0,
      rationale: dim?.rationale ?? '',
      improvement: dim?.improvement ?? '',
    };
  });

  // SVG geometry: square viewbox 200x200 centered at (100, 100), max radius 80.
  const N = axes.length;
  const cx = 100;
  const cy = 100;
  const maxR = 80;
  // Angle: top axis first (-π/2), going clockwise.
  const angleAt = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / N;
  const polyPoints = axisData
    .map((d, i) => {
      const r = (Math.max(0, Math.min(10, d.score)) / 10) * maxR;
      const x = cx + r * Math.cos(angleAt(i));
      const y = cy + r * Math.sin(angleAt(i));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  // Background grid rings at scores 2, 4, 6, 8, 10
  const rings = [2, 4, 6, 8, 10].map((s) => (s / 10) * maxR);

  return (
    <div
      data-testid="critique-result"
      style={{
        margin: 12,
        padding: 12,
        borderRadius: 10,
        border: '1px solid var(--t-border, #2a2a2a)',
        background: 'var(--t-panel, rgba(20,20,20,.6))',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--t-fg-4, #888)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        <span>质量自检 / Critique</span>
        <span data-testid="critique-lint-summary">
          lint · {result.lint_summary.errors}E / {result.lint_summary.warnings}W /{' '}
          {result.lint_summary.infos}I
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {/* Radar SVG */}
        <svg
          viewBox="0 0 200 200"
          style={{ width: 200, height: 200, flexShrink: 0 }}
          aria-label="critique-radar"
          data-testid="critique-radar-svg"
        >
          {/* Rings */}
          {rings.map((r, i) => (
            <circle
              key={`ring-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--t-border, #2a2a2a)"
              strokeWidth={0.6}
              strokeDasharray={i === rings.length - 1 ? undefined : '2 3'}
            />
          ))}
          {/* Spokes */}
          {axisData.map((_, i) => {
            const x = cx + maxR * Math.cos(angleAt(i));
            const y = cy + maxR * Math.sin(angleAt(i));
            return (
              <line
                key={`spoke-${i}`}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="var(--t-border, #2a2a2a)"
                strokeWidth={0.5}
              />
            );
          })}
          {/* Filled polygon */}
          <polygon
            points={polyPoints}
            fill="rgba(124,58,237,.25)"
            stroke="rgba(124,58,237,.85)"
            strokeWidth={1.4}
            data-testid="critique-radar-polygon"
          />
          {/* Axis labels */}
          {axisData.map((d, i) => {
            const labelR = maxR + 14;
            const x = cx + labelR * Math.cos(angleAt(i));
            const y = cy + labelR * Math.sin(angleAt(i));
            return (
              <text
                key={`label-${i}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fill="var(--t-fg-3, #aaa)"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              >
                {d.label}
              </text>
            );
          })}
        </svg>

        {/* Per-axis list */}
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
            color: 'var(--t-fg-2, #ddd)',
            minWidth: 0,
          }}
        >
          {axisData.map((d) => (
            <li
              key={d.key}
              data-testid={`critique-row-${d.key}`}
              style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
            >
              <span style={{ width: 92, color: 'var(--t-fg-4, #888)', flexShrink: 0 }}>
                {d.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  width: 36,
                  color: 'var(--t-fg, #fff)',
                  flexShrink: 0,
                }}
              >
                {d.score}/10
              </span>
              <span
                title={d.improvement || d.rationale}
                style={{
                  flex: 1,
                  color: 'var(--t-fg-3, #bbb)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {d.improvement || d.rationale || '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {result.overall_summary && (
        <p
          data-testid="critique-summary"
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.55,
            color: 'var(--t-fg-4, #999)',
          }}
        >
          {result.overall_summary}
        </p>
      )}
    </div>
  );
}

export default CritiqueResult;
