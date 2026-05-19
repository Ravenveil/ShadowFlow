/**
 * PreviewJson — collapsible JSON tree using native <details>.
 *
 * Renders any JSON value recursively. Objects and arrays use <details>
 * (open by default at the root, closed for nested keys) so users can
 * expand / collapse without any custom expand-state hook.
 *
 * On parse failure (e.g. mid-stream truncated JSON) falls back to a
 * monospaced pre with the raw source — better than throwing.
 */
import React from 'react';

interface PreviewJsonProps {
  source: string;
}

function renderValue(value: unknown, depth: number): React.ReactNode {
  if (value === null) return <span style={{ color: 'var(--t-fg-5)' }}>null</span>;
  if (typeof value === 'boolean')
    return <span style={{ color: 'var(--t-accent-bright, #D8B4FE)' }}>{String(value)}</span>;
  if (typeof value === 'number')
    return <span style={{ color: 'var(--t-accent-bright, #D8B4FE)' }}>{value}</span>;
  if (typeof value === 'string')
    return <span style={{ color: 'var(--t-ok, #10B981)' }}>"{value}"</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--t-fg-4)' }}>[]</span>;
    return (
      <details open={depth < 1} style={{ marginLeft: depth === 0 ? 0 : 12 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--t-fg-4)' }}>
          [{value.length}]
        </summary>
        <div style={{ marginLeft: 12 }}>
          {value.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--t-fg-5)' }}>{i}:</span>
              <span style={{ flex: 1, minWidth: 0 }}>{renderValue(v, depth + 1)}</span>
            </div>
          ))}
        </div>
      </details>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: 'var(--t-fg-4)' }}>{'{}'}</span>;
    return (
      <details open={depth < 1} style={{ marginLeft: depth === 0 ? 0 : 12 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--t-fg-4)' }}>
          {'{'}
          {entries.length}
          {'}'}
        </summary>
        <div style={{ marginLeft: 12 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--t-accent, #A855F7)' }}>"{k}":</span>
              <span style={{ flex: 1, minWidth: 0 }}>{renderValue(v, depth + 1)}</span>
            </div>
          ))}
        </div>
      </details>
    );
  }
  return <span>{String(value)}</span>;
}

const PreviewJson: React.FC<PreviewJsonProps> = ({ source }) => {
  let parsed: unknown;
  let parseError: Error | null = null;
  try {
    parsed = JSON.parse(source);
  } catch (e) {
    parseError = e as Error;
  }
  if (parseError) {
    return (
      <div data-component="preview-json-error">
        <div style={{ color: 'var(--t-fg-5)', fontSize: 11, marginBottom: 8 }}>
          JSON 解析失败（可能流式中）— 展示原文：
        </div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{source}</pre>
      </div>
    );
  }
  return <div data-component="preview-json">{renderValue(parsed, 0)}</div>;
};

export default PreviewJson;
