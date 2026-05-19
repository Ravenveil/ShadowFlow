/**
 * PreviewPanel — right-pane Preview tab content.
 *
 * Maps the design-spec `.preview-wrap` to real run state:
 *   - top bar:  filename + status badge (流式中 / 已完成) + token count
 *   - body:     content rendered by mime type (text/yaml | text/markdown |
 *               text/html | application/json). YAML keeps the original
 *               line-numbered, syntax-highlighted streaming view.
 *   - footer:   "跟随中" indicator + current step label + optional Editor CTA
 *
 * S0.5 (2026-05-19) — extended to support 4 mime types per
 * docs/design/intent-workflow-design-v1.md 原则 5（右侧 Tabs 跟随产物）:
 *   - text/yaml          → 行号 + 高亮 + 流式光标（保留原版本）
 *   - text/html          → <iframe srcDoc sandbox="allow-scripts">（禁 same-origin）
 *   - text/markdown      → 极简 MD 渲染（无新依赖，PreviewMarkdown.tsx）
 *   - application/json   → <details> 折叠的树形视图（PreviewJson.tsx）
 *
 * Mime 来源优先级：session.artifactType（后端透传）> filename 后缀推断 > 'text/yaml'。
 *
 * No mocked content — empty session shows an empty state, not the demo
 * paper.review.v1 yaml.
 */
import React, { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import type { UseRunSessionReturn, RunSessionStep } from '../../core/hooks/useRunSession';
import PreviewIframe from './PreviewIframe';
import PreviewMarkdown from './PreviewMarkdown';
import PreviewJson from './PreviewJson';

interface PreviewPanelProps {
  session: UseRunSessionReturn;
  onOpenEditor?: () => void;
}

type PreviewMime = 'text/yaml' | 'text/html' | 'text/markdown' | 'application/json';

function pickCurrentStep(steps: RunSessionStep[]): RunSessionStep | undefined {
  if (steps.length === 0) return undefined;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].status === 'running') return steps[i];
  }
  return steps[steps.length - 1];
}

// Resolve mime in order of: explicit session.artifactType → filename suffix →
// 'text/yaml' default. Keeps PreviewPanel decoupled from any new backend field
// while still future-proofing for an explicit `mime` from the SSE stream.
function resolveMime(
  artifactType: string | null | undefined,
  filename: string | null | undefined,
): PreviewMime {
  switch (artifactType) {
    case 'html':
      return 'text/html';
    case 'markdown':
      return 'text/markdown';
    case 'yaml':
      return 'text/yaml';
    default:
      break;
  }
  const name = (filename ?? '').toLowerCase();
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'text/html';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown';
  if (name.endsWith('.json')) return 'application/json';
  return 'text/yaml';
}

// Lightweight YAML syntax highlighter. Splits each line into tokens for:
//   `# comment`  → comment gray
//   `key:`       → accent
//   `"string"` / `'string'` → ok green
//   numbers / bools → fg-3
// Anything else falls through as plain text. This is intentionally pre-
// rendered per line (cheap, no streaming reflow surprises).
function highlightYamlLine(line: string, key: string | number): React.ReactNode {
  // Comment line — whole line as comment.
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) {
    return (
      <span key={key} style={{ color: 'var(--t-fg-5)', fontStyle: 'italic' }}>
        {line}
      </span>
    );
  }
  // Find `key:` segment.
  const keyMatch = /^(\s*-?\s*)([A-Za-z_][\w.-]*)\s*:/.exec(line);
  if (!keyMatch) {
    return (
      <span key={key} style={{ color: 'var(--t-fg-3)' }}>
        {line}
      </span>
    );
  }
  const indent = keyMatch[1];
  const kkey = keyMatch[2];
  const after = line.slice(keyMatch[0].length);

  // Tokenise after the colon: strings, numbers, bools, plain.
  const valueTokens: React.ReactNode[] = [];
  const reToken = /(".*?"|'.*?'|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = reToken.exec(after)) !== null) {
    if (m.index > last) {
      valueTokens.push(
        <span key={`p${i++}`} style={{ color: 'var(--t-fg-3)' }}>
          {after.slice(last, m.index)}
        </span>,
      );
    }
    const tok = m[0];
    if (tok.startsWith('"') || tok.startsWith("'")) {
      valueTokens.push(
        <span key={`s${i++}`} style={{ color: 'var(--t-ok, #10B981)' }}>
          {tok}
        </span>,
      );
    } else {
      valueTokens.push(
        <span key={`n${i++}`} style={{ color: 'var(--t-accent-bright, #D8B4FE)' }}>
          {tok}
        </span>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < after.length) {
    valueTokens.push(
      <span key={`p${i++}`} style={{ color: 'var(--t-fg-3)' }}>
        {after.slice(last)}
      </span>,
    );
  }

  return (
    <span key={key}>
      <span style={{ color: 'var(--t-fg-3)' }}>{indent}</span>
      <span style={{ color: 'var(--t-accent, #A855F7)', fontWeight: 500 }}>{kkey}</span>
      <span style={{ color: 'var(--t-fg-3)' }}>:</span>
      {valueTokens}
    </span>
  );
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ session, onOpenEditor }) => {
  const yaml = session.blueprintYaml ?? '';
  const filename = session.blueprintFile;
  const mime = resolveMime(session.artifactType, filename);
  const lines = yaml ? yaml.split('\n') : [];
  const isStreaming = !session.isComplete && session.error == null;
  const currentStep = pickCurrentStep(session.steps);
  const preRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom while streaming so user sees the freshest YAML.
  // Only applies to the YAML branch (other mimes render whole-doc views and
  // do not benefit from line-by-line autoscroll).
  useEffect(() => {
    if (!isStreaming) return;
    if (mime !== 'text/yaml') return;
    const pre = preRef.current;
    if (pre) pre.scrollTop = pre.scrollHeight;
  }, [yaml, isStreaming, mime]);

  const empty = yaml.length === 0;

  // Status-bar mime label — short, monospaced, sits beside the filename.
  const mimeLabel: Record<PreviewMime, string> = {
    'text/yaml': 'yaml',
    'text/html': 'html',
    'text/markdown': 'md',
    'application/json': 'json',
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--t-bg)',
      }}
      data-component="preview-panel"
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderBottom: '1px solid var(--t-border)',
          background: 'var(--t-panel-2, var(--bg-elev-2))',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            color: 'var(--t-fg-2)',
          }}
        >
          {filename ?? 'team_blueprint.yml'}
        </span>
        <span
          style={{
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--t-fg-4)',
            background: 'var(--t-panel-3, var(--bg-elev-3))',
            border: '1px solid var(--t-border, var(--border))',
            fontFamily: 'var(--font-mono, monospace)',
          }}
          title={mime}
        >
          {mimeLabel[mime]}
        </span>
        <span
          style={{
            padding: '2px 7px',
            borderRadius: 4,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: isStreaming
              ? 'var(--t-accent-tint, rgba(168,85,247,.14))'
              : 'var(--t-panel-3, var(--bg-elev-3))',
            color: isStreaming ? 'var(--t-accent, #A855F7)' : 'var(--t-fg-4)',
            border: `1px solid ${
              isStreaming ? 'var(--t-accent, #A855F7)' : 'var(--t-border, var(--border))'
            }`,
            animation: isStreaming ? 'sf-pulse 1.4s ease-in-out infinite' : undefined,
          }}
        >
          {isStreaming ? '流式中' : session.error ? '出错' : '已完成'}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            color: 'var(--t-fg-5)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {mime === 'text/yaml' ? `${lines.length} 行 · ` : ''}
          {session.tokenCount.toLocaleString()} tokens
        </span>
      </div>

      {/* Body — branches by mime. */}
      {mime === 'text/yaml' && (
        <pre
          ref={preRef}
          style={{
            flex: 1,
            minHeight: 0,
            margin: 0,
            padding: '16px 20px',
            overflow: 'auto',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--t-fg-3)',
            background: 'var(--t-bg)',
            whiteSpace: 'pre',
          }}
        >
          {empty ? (
            <span style={{ color: 'var(--t-fg-5)' }}>
              {currentStep ? `等待 "${currentStep.name}" 步骤产出 YAML…` : '等待 YAML 流开始…'}
            </span>
          ) : (
            lines.map((ln, i) => (
              <div key={i} style={{ display: 'flex', minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 36,
                    paddingRight: 10,
                    textAlign: 'right',
                    color: 'var(--t-fg-6)',
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  {i + 1}
                </span>
                {highlightYamlLine(ln, i)}
                {/* Live caret at end of stream */}
                {isStreaming && i === lines.length - 1 && (
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 13,
                      marginLeft: 2,
                      background: 'var(--t-accent, #A855F7)',
                      verticalAlign: 'text-bottom',
                      animation: 'sf-cur 1s steps(2) infinite',
                    }}
                  />
                )}
              </div>
            ))
          )}
        </pre>
      )}

      {mime === 'text/html' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--t-bg)',
          }}
        >
          {empty ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--t-fg-5)',
                fontSize: 12,
              }}
            >
              {currentStep ? `等待 "${currentStep.name}" 步骤产出 HTML…` : '等待 HTML 流开始…'}
            </div>
          ) : (
            <PreviewIframe html={yaml} title={filename ?? 'artifact.html'} />
          )}
        </div>
      )}

      {mime === 'text/markdown' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '20px 24px',
            background: 'var(--t-bg)',
            color: 'var(--t-fg-2)',
            fontSize: 13.5,
            lineHeight: 1.7,
          }}
        >
          {empty ? (
            <div style={{ color: 'var(--t-fg-5)', fontSize: 12 }}>
              {currentStep ? `等待 "${currentStep.name}" 步骤产出 Markdown…` : '等待 Markdown 流开始…'}
            </div>
          ) : (
            <PreviewMarkdown source={yaml} />
          )}
        </div>
      )}

      {mime === 'application/json' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '16px 20px',
            background: 'var(--t-bg)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--t-fg-3)',
          }}
        >
          {empty ? (
            <span style={{ color: 'var(--t-fg-5)' }}>
              {currentStep ? `等待 "${currentStep.name}" 步骤产出 JSON…` : '等待 JSON 流开始…'}
            </span>
          ) : (
            <PreviewJson source={yaml} />
          )}
        </div>
      )}

      {/* Footer — "跟随中 · Preview 跟着 'xxx' 步骤实时刷新" */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderTop: '1px solid var(--t-border)',
          background: 'var(--t-panel-2, var(--bg-elev-2))',
          fontSize: 11.5,
          color: 'var(--t-fg-3)',
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isStreaming ? 'var(--t-accent, #A855F7)' : 'var(--t-fg-5)',
            animation: isStreaming ? 'sf-pulse 1.4s ease-in-out infinite' : undefined,
            flexShrink: 0,
          }}
        />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentStep ? (
            <>
              <strong>{isStreaming ? '跟随中' : '已停留'}</strong> · Preview 跟随{' '}
              <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                {currentStep.name}
              </code>{' '}
              步骤
              {isStreaming && ' 实时刷新'}
            </>
          ) : (
            <span style={{ color: 'var(--t-fg-5)' }}>等待 step 开始…</span>
          )}
        </span>
        {session.artifactUrl && (
          <button
            type="button"
            onClick={onOpenEditor}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 5,
              background: 'transparent',
              border: '1px solid var(--t-border-2, var(--border-strong))',
              color: 'var(--t-fg-2)',
              fontSize: 11,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ExternalLink size={10} /> Editor 打开
          </button>
        )}
      </div>
    </div>
  );
};

export default PreviewPanel;
