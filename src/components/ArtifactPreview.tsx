/**
 * ArtifactPreview — Story 15.3 + 15.6 + 15.15
 *
 * Right-panel preview for an artifact produced by Skill Studio (Story 15.2).
 * - HTML artifact: iframe (sandbox="allow-scripts allow-same-origin") + source tab
 * - YAML / Markdown artifact: <pre> with monospace formatting
 *
 * The component is intentionally self-contained:
 * - no external markdown / yaml syntax-highlight deps (kept zero-install per Story 15.3)
 * - skeleton pulse during iframe load, hidden after onLoad
 * - sandbox is required: artifact HTML is LLM-generated and must not access
 *   the parent origin's storage / cookies. allow-same-origin keeps fetches
 *   to /projects/<session_id>/* working (same origin as the host app).
 *
 * Story 15.6: when sessionId / filename / isComplete are provided AND the
 * session has finished, render two download anchors in the toolbar:
 *   • single-file download (uses the existing static `url` prop)
 *   • ZIP download via /api/export/<sessionId>/zip
 * All three new props are optional so older callers (and unit tests) keep
 * working unchanged.
 *
 * Story 15.15: when the artifact is HTML, also render PDF + Markdown export
 * anchors that hit `/api/export/<sessionId>/{pdf,markdown}`. PDF anchor
 * intercepts the click to HEAD-probe for 503 PDF_ENGINE_UNAVAILABLE — if
 * chromium failed to launch we surface an alert instead of letting the
 * browser's own download error eat the failure silently. Other types (yaml,
 * markdown) keep only the original "下载 X" + ZIP buttons since the new
 * formats don't apply.
 */
import { useState, useRef, useEffect } from 'react';
import { Download, Archive, FileText } from 'lucide-react';

export interface ArtifactPreviewProps {
  /** URL served by the dev/static server, e.g. /projects/<session_id>/prototype.html */
  url: string;
  /** Artifact kind — controls render mode (iframe vs <pre>). */
  type: 'html' | 'yaml' | 'markdown';
  /** Raw textual content; used for the source tab and for yaml/markdown render. */
  content: string;
  /** Story 15.6 — RunSession id; required for the ZIP export endpoint. */
  sessionId?: string;
  /** Story 15.6 — basename for the single-file download (e.g. "prototype.html"). */
  filename?: string;
  /** Story 15.6 — only show download buttons once the session is finished. */
  isComplete?: boolean;
}

type HtmlTab = 'preview' | 'source';

const TYPE_LABELS: Record<ArtifactPreviewProps['type'], string> = {
  html: 'HTML',
  yaml: 'YAML',
  markdown: 'Markdown',
};

/** Story 15.6 — toolbar download actions; rendered only when all download
 *  prerequisites are met. Returns null otherwise so the toolbar collapses. */
function DownloadActions({
  url,
  type,
  sessionId,
  filename,
  isComplete,
}: Required<Pick<ArtifactPreviewProps, 'url' | 'type'>> &
  Pick<ArtifactPreviewProps, 'sessionId' | 'filename' | 'isComplete'>) {
  if (!isComplete || !sessionId || !filename || !url) return null;

  const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 22,
    padding: '0 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: 'var(--t-panel-2)',
    color: 'var(--t-fg-3)',
    border: '1px solid var(--t-border)',
    textDecoration: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  // Story 15.15 — PDF + Markdown export only apply to HTML source artifacts.
  // For yaml/markdown the conversion is either a no-op (yaml→md) or a
  // category error (yaml→pdf), so we hide those buttons rather than show
  // disabled controls.
  const showHtmlExports = type === 'html';
  const pdfHref = `/api/export/${encodeURIComponent(sessionId)}/pdf?filename=${encodeURIComponent(filename)}&viewport=1280x800`;
  const markdownHref = `/api/export/${encodeURIComponent(sessionId)}/markdown?filename=${encodeURIComponent(filename)}`;

  // 503 probe — if chromium failed to launch we don't want the user to be
  // dumped into a generic browser error. HEAD the endpoint first; on 503 we
  // alert and abort, otherwise fall through to the native download. We use
  // alert() rather than a toast lib to keep this component dep-free.
  async function handlePdfClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    try {
      const probe = await fetch(pdfHref, { method: 'HEAD' });
      if (probe.status === 503) {
        // eslint-disable-next-line no-alert
        alert('PDF 引擎不可用，请联系管理员重装 Chromium 后重试。');
        return;
      }
    } catch {
      /* network blip — fall through to native download which will surface
         its own error UI. */
    }
    window.location.href = pdfHref;
  }

  return (
    <div
      data-testid="artifact-download-actions"
      style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}
    >
      <a
        href={url}
        download={filename}
        data-testid="artifact-download-file"
        style={linkStyle}
      >
        <Download size={12} strokeWidth={2} />
        下载 {TYPE_LABELS[type]}
      </a>
      {showHtmlExports && (
        <>
          <a
            href={pdfHref}
            data-testid="artifact-download-pdf"
            onClick={handlePdfClick}
            style={linkStyle}
          >
            <FileText size={12} strokeWidth={2} />
            下载 PDF
          </a>
          <a
            href={markdownHref}
            download
            data-testid="artifact-download-markdown"
            style={linkStyle}
          >
            <FileText size={12} strokeWidth={2} />
            下载 Markdown
          </a>
        </>
      )}
      <a
        href={`/api/export/${encodeURIComponent(sessionId)}/zip`}
        download
        data-testid="artifact-download-zip"
        style={linkStyle}
      >
        <Archive size={12} strokeWidth={2} />
        下载 ZIP
      </a>
    </div>
  );
}

export function ArtifactPreview({
  url,
  type,
  content,
  sessionId,
  filename,
  isComplete,
}: ArtifactPreviewProps) {
  const [tab, setTab] = useState<HtmlTab>('preview');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset loading state when iframe src changes (二次 BLUEPRINT 事件 / artifact 切换)
  useEffect(() => {
    setLoaded(false);
    setLoadError(false);
  }, [url]);

  if (type === 'html') {
    return (
      <div
        data-testid="artifact-preview-html"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flex: 1,
          minHeight: 0,
          background: 'var(--t-bg)',
        }}
      >
        {/* Sub-tab bar (preview / source) + 15.6 download actions on the right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '6px 16px',
            borderBottom: '1px solid var(--t-border)',
            flexShrink: 0,
          }}
        >
          {(['preview', 'source'] as HtmlTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              data-testid={`artifact-tab-${t}`}
              style={{
                height: 24,
                padding: '0 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                background: tab === t ? 'var(--t-accent-tint)' : 'transparent',
                color: tab === t ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
                border: tab === t ? '1px solid rgba(168,85,247,.3)' : '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              {t === 'preview' ? '预览' : '源码'}
            </button>
          ))}
          <DownloadActions
            url={url}
            type={type}
            sessionId={sessionId}
            filename={filename}
            isComplete={isComplete}
          />
        </div>

        {tab === 'preview' ? (
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            {!loaded && (
              <div
                data-testid="artifact-preview-skeleton"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--t-panel-2)',
                  animation: 'rs-pulse 1.4s ease-in-out infinite',
                }}
              />
            )}
            {loadError && (
              <div
                data-testid="artifact-preview-error"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 8,
                  background: 'var(--t-panel-2)',
                  color: 'var(--t-fg-3)',
                  fontSize: 12,
                }}
              >
                <span>预览加载失败</span>
                <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--t-accent-bright)' }}>
                  在新标签打开
                </a>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={url}
              // SECURITY (2026-05-10 review B1, OpenDesign architecture.md 模式):
              // 仅 `allow-scripts`，不能加 `allow-same-origin`。同时设两个 token 时
              // iframe 与父同源，恶意 LLM 生成的 HTML 可读 top.localStorage 拿走
              // 用户的 BYOK Anthropic key。`allow-scripts` 单 token 让 iframe 进入
              // opaque origin，与父域隔离。
              sandbox="allow-scripts"
              title="Artifact Preview"
              data-testid="artifact-preview-iframe"
              onLoad={() => setLoaded(true)}
              onError={() => { setLoadError(true); setLoaded(true); }}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#fff',
              }}
            />
          </div>
        ) : (
          <pre
            data-testid="artifact-preview-source"
            style={{
              flex: 1,
              minHeight: 0,
              margin: 0,
              overflow: 'auto',
              padding: 16,
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--t-fg-2)',
              background: 'var(--t-panel-2)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {content}
          </pre>
        )}
      </div>
    );
  }

  // YAML / Markdown — toolbar (download only) + single <pre> view.
  return (
    <div
      data-testid={`artifact-preview-${type}-wrapper`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flex: 1,
        minHeight: 0,
        background: 'var(--t-bg)',
      }}
    >
      {(isComplete && sessionId && filename) ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 16px',
            borderBottom: '1px solid var(--t-border)',
            flexShrink: 0,
          }}
        >
          <DownloadActions
            url={url}
            type={type}
            sessionId={sessionId}
            filename={filename}
            isComplete={isComplete}
          />
        </div>
      ) : null}
      <pre
        data-testid={`artifact-preview-${type}`}
        style={{
          flex: 1,
          minHeight: 0,
          margin: 0,
          overflow: 'auto',
          padding: 16,
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--t-fg-2)',
          background: 'var(--t-panel-2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.55,
        }}
      >
        {content}
      </pre>
    </div>
  );
}

export default ArtifactPreview;
