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
import { ExternalLink, FileText, Code2, FileJson, FileCode } from 'lucide-react';
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
        <span key={`n${i++}`} style={{ color: 'var(--t-accent-bright, #69B4FF)' }}>
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
      <span style={{ color: 'var(--t-accent, #1890FF)', fontWeight: 500 }}>{kkey}</span>
      <span style={{ color: 'var(--t-fg-3)' }}>:</span>
      {valueTokens}
    </span>
  );
}

// Intentional empty-state shown before any artifact bytes have streamed.
// Replaces the bare gray "等待 …" line with a centered, branded placeholder
// that reads as "the workspace is ready, the product will build here" rather
// than looking broken. Driven entirely by props (mime + current step) — no
// mock content. icon + accent shift per mime so each preview type feels
// purpose-built.
const PreviewEmptyState: React.FC<{
  mime: PreviewMime;
  stepName: string | undefined;
  isStreaming: boolean;
}> = ({ mime, stepName, isStreaming }) => {
  const meta: Record<PreviewMime, { icon: React.ReactNode; kind: string }> = {
    'text/yaml': { icon: <Code2 size={26} strokeWidth={1.5} />, kind: 'YAML 蓝图' },
    'text/html': { icon: <FileCode size={26} strokeWidth={1.5} />, kind: '网页' },
    'text/markdown': { icon: <FileText size={26} strokeWidth={1.5} />, kind: '文档' },
    'application/json': { icon: <FileJson size={26} strokeWidth={1.5} />, kind: 'JSON 数据' },
  };
  const { icon, kind } = meta[mime];
  return (
    <div
      data-component="preview-empty"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="sf-empty"
        style={{
          gap: 10,
          maxWidth: 360,
          padding: '32px 28px',
          borderWidth: '1.5px',
          borderColor: 'var(--t-border-2, var(--border-strong))',
          background: 'var(--t-panel-2, var(--bg-elev-2))',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isStreaming ? 'var(--t-accent, #1890FF)' : 'var(--t-fg-4)',
            background: isStreaming
              ? 'var(--t-accent-tint, rgba(24,144,255,.12))'
              : 'var(--t-panel-3, var(--bg-elev-3))',
            border: `1px solid ${isStreaming ? 'var(--t-accent, #1890FF)' : 'var(--t-border, var(--border))'}`,
            animation: isStreaming ? 'sf-pulse 1.8s ease-in-out infinite' : undefined,
          }}
        >
          {icon}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--t-fg, #FAFAFA)' }}>
          产物将在这里生成
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-fg-4)', lineHeight: 1.55 }}>
          {stepName ? (
            <>
              当前步骤{' '}
              <code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--t-fg-2)' }}>
                {stepName}
              </code>{' '}
              完成后，{kind}会实时流式渲染在此面板。
            </>
          ) : (
            <>团队开始工作后，{kind}会实时流式渲染在此面板。</>
          )}
        </div>
        {isStreaming && (
          <div
            style={{
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono, monospace)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--t-accent, #1890FF)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--t-accent, #1890FF)',
                animation: 'sf-pulse 1.4s ease-in-out infinite',
              }}
            />
            生成中
          </div>
        )}
      </div>
    </div>
  );
};

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
              ? 'var(--t-accent-tint, rgba(24,144,255,.14))'
              : 'var(--t-panel-3, var(--bg-elev-3))',
            color: isStreaming ? 'var(--t-accent, #1890FF)' : 'var(--t-fg-4)',
            border: `1px solid ${
              isStreaming ? 'var(--t-accent, #1890FF)' : 'var(--t-border, var(--border))'
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
      {mime === 'text/yaml' && empty && (
        <PreviewEmptyState mime={mime} stepName={currentStep?.name} isStreaming={isStreaming} />
      )}
      {mime === 'text/yaml' && !empty && (
        <pre
          ref={preRef}
          className="sf-scroll"
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
          {(
            lines.map((ln, i) => {
              // 2026-06-02 (Trae 式跟随) — highlight the line currently being
              // streamed so the eye locks onto where YAML is being written.
              // Steady tint (not a fading flash) because the last line keeps
              // mutating token-by-token; a left accent bar marks the cursor row.
              const isActiveLine = isStreaming && i === lines.length - 1;
              return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  minWidth: 0,
                  background: isActiveLine ? 'var(--t-accent-tint, rgba(24,144,255,.10))' : undefined,
                  boxShadow: isActiveLine ? 'inset 2px 0 0 var(--t-accent, #1890FF)' : undefined,
                  borderRadius: isActiveLine ? 2 : undefined,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 36,
                    paddingRight: 10,
                    textAlign: 'right',
                    color: isActiveLine ? 'var(--t-accent, #1890FF)' : 'var(--t-fg-6)',
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
                      background: 'var(--t-accent, #1890FF)',
                      verticalAlign: 'text-bottom',
                      animation: 'sf-cur 1s steps(2) infinite',
                    }}
                  />
                )}
              </div>
              );
            })
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
            <PreviewEmptyState mime={mime} stepName={currentStep?.name} isStreaming={isStreaming} />
          ) : (
            <PreviewIframe html={yaml} title={filename ?? 'artifact.html'} />
          )}
        </div>
      )}

      {mime === 'text/markdown' && (
        <div
          className="sf-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: empty ? 0 : '20px 24px',
            display: empty ? 'flex' : undefined,
            flexDirection: empty ? 'column' : undefined,
            background: 'var(--t-bg)',
            color: 'var(--t-fg-2)',
            fontSize: 13.5,
            lineHeight: 1.7,
          }}
        >
          {empty ? (
            <PreviewEmptyState mime={mime} stepName={currentStep?.name} isStreaming={isStreaming} />
          ) : (
            <PreviewMarkdown source={yaml} />
          )}
        </div>
      )}

      {mime === 'application/json' && (
        <div
          className="sf-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: empty ? 0 : '16px 20px',
            display: empty ? 'flex' : undefined,
            flexDirection: empty ? 'column' : undefined,
            background: 'var(--t-bg)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--t-fg-3)',
          }}
        >
          {empty ? (
            <PreviewEmptyState mime={mime} stepName={currentStep?.name} isStreaming={isStreaming} />
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
            background: isStreaming ? 'var(--t-accent, #1890FF)' : 'var(--t-fg-5)',
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
