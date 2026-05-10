/**
 * Story 15.3 + 15.6 + 15.15 — ArtifactPreview unit tests.
 *
 * 15.3 covers the three render branches (html iframe / yaml / markdown).
 * 15.6 adds: download actions only render when sessionId + filename + isComplete
 * are all supplied; single-file anchor uses `download={filename}`; ZIP anchor
 * targets `/api/export/<sessionId>/zip`; type label switches per artifact kind.
 * 15.15 adds: PDF + Markdown export anchors are visible only for type='html';
 * 503 PDF_ENGINE_UNAVAILABLE is intercepted via HEAD probe + alert.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';

describe('<ArtifactPreview />', () => {
  it('renders an iframe + skeleton for html artifacts (AC2 + AC5)', () => {
    render(
      <ArtifactPreview
        url="/projects/abc/prototype.html"
        type="html"
        content="<!doctype html><html><body>hi</body></html>"
      />,
    );
    const frame = screen.getByTestId('artifact-preview-iframe') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('src')).toBe('/projects/abc/prototype.html');
    // 2026-05-10 review B1: sandbox 仅 `allow-scripts`（去掉 allow-same-origin
    // 防 BYOK key 外泄；按 OpenDesign architecture.md 模式）。
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('title')).toBe('Artifact Preview');

    // Skeleton present until iframe.onLoad fires.
    expect(screen.getByTestId('artifact-preview-skeleton')).toBeTruthy();

    // Simulate iframe load → skeleton disappears.
    fireEvent.load(frame);
    expect(screen.queryByTestId('artifact-preview-skeleton')).toBeNull();
  });

  it('switches html artifact to source tab and renders raw content (AC2)', () => {
    const html = '<!doctype html><html><body>hi</body></html>';
    render(<ArtifactPreview url="/projects/x/p.html" type="html" content={html} />);

    // Default tab = preview → no source pre yet.
    expect(screen.queryByTestId('artifact-preview-source')).toBeNull();

    fireEvent.click(screen.getByTestId('artifact-tab-source'));
    const src = screen.getByTestId('artifact-preview-source');
    expect(src.textContent).toBe(html);
  });

  it('renders a <pre> for yaml artifacts (AC3)', () => {
    const yaml = 'name: agent\nrole: planner\n';
    render(<ArtifactPreview url="/projects/x/blueprint.yml" type="yaml" content={yaml} />);
    const pre = screen.getByTestId('artifact-preview-yaml');
    expect(pre.tagName).toBe('PRE');
    expect(pre.textContent).toBe(yaml);
    // No iframe in yaml mode.
    expect(screen.queryByTestId('artifact-preview-iframe')).toBeNull();
  });

  it('renders a <pre> for markdown artifacts (AC3)', () => {
    const md = '# Title\n\n- item 1\n- item 2\n';
    render(<ArtifactPreview url="/projects/x/report.md" type="markdown" content={md} />);
    const pre = screen.getByTestId('artifact-preview-markdown');
    expect(pre.tagName).toBe('PRE');
    expect(pre.textContent).toBe(md);
    expect(screen.queryByTestId('artifact-preview-iframe')).toBeNull();
  });

  // ── Story 15.6 — download buttons ────────────────────────────────────────

  it('hides download buttons when isComplete is false (15.6 AC4)', () => {
    render(
      <ArtifactPreview
        url="/projects/abc/prototype.html"
        type="html"
        content="<!doctype html>"
        sessionId="abc"
        filename="prototype.html"
        isComplete={false}
      />,
    );
    expect(screen.queryByTestId('artifact-download-actions')).toBeNull();
    expect(screen.queryByTestId('artifact-download-file')).toBeNull();
    expect(screen.queryByTestId('artifact-download-zip')).toBeNull();
  });

  it('hides download buttons when sessionId/filename are missing (15.6 AC4)', () => {
    // isComplete=true but no sessionId/filename → no download UI.
    render(
      <ArtifactPreview
        url="/projects/abc/prototype.html"
        type="html"
        content="<!doctype html>"
        isComplete
      />,
    );
    expect(screen.queryByTestId('artifact-download-actions')).toBeNull();
  });

  it('shows download HTML + ZIP buttons when html artifact complete (15.6 AC1+AC2+AC3)', () => {
    render(
      <ArtifactPreview
        url="/projects/abc/prototype.html"
        type="html"
        content="<!doctype html>"
        sessionId="11111111-1111-4111-8111-111111111111"
        filename="prototype.html"
        isComplete
      />,
    );
    const file = screen.getByTestId('artifact-download-file') as HTMLAnchorElement;
    expect(file.getAttribute('href')).toBe('/projects/abc/prototype.html');
    expect(file.getAttribute('download')).toBe('prototype.html');
    expect(file.textContent).toContain('下载 HTML');

    const zip = screen.getByTestId('artifact-download-zip') as HTMLAnchorElement;
    expect(zip.getAttribute('href')).toBe(
      '/api/export/11111111-1111-4111-8111-111111111111/zip',
    );
    expect(zip.hasAttribute('download')).toBe(true);
    expect(zip.textContent).toContain('下载 ZIP');
  });

  it('uses YAML label when artifact type is yaml (15.6 AC1)', () => {
    render(
      <ArtifactPreview
        url="/projects/abc/team_blueprint.yml"
        type="yaml"
        content="name: x\n"
        sessionId="11111111-1111-4111-8111-111111111111"
        filename="team_blueprint.yml"
        isComplete
      />,
    );
    expect(screen.getByTestId('artifact-download-file').textContent).toContain('下载 YAML');
  });

  it('uses Markdown label when artifact type is markdown (15.6 AC1)', () => {
    render(
      <ArtifactPreview
        url="/projects/abc/report.md"
        type="markdown"
        content="# title\n"
        sessionId="11111111-1111-4111-8111-111111111111"
        filename="report.md"
        isComplete
      />,
    );
    expect(screen.getByTestId('artifact-download-file').textContent).toContain('下载 Markdown');
  });

  // ── Story 15.15 — PDF + Markdown export buttons ─────────────────────────

  describe('15.15 — PDF / Markdown export buttons', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows PDF + Markdown export anchors for html artifacts (15.15 AC5)', () => {
      render(
        <ArtifactPreview
          url="/projects/abc/prototype.html"
          type="html"
          content="<!doctype html>"
          sessionId="11111111-1111-4111-8111-111111111111"
          filename="prototype.html"
          isComplete
        />,
      );

      const pdf = screen.getByTestId('artifact-download-pdf') as HTMLAnchorElement;
      expect(pdf.getAttribute('href')).toBe(
        '/api/export/11111111-1111-4111-8111-111111111111/pdf?filename=prototype.html&viewport=1280x800',
      );
      expect(pdf.textContent).toContain('下载 PDF');

      const md = screen.getByTestId('artifact-download-markdown') as HTMLAnchorElement;
      expect(md.getAttribute('href')).toBe(
        '/api/export/11111111-1111-4111-8111-111111111111/markdown?filename=prototype.html',
      );
      expect(md.hasAttribute('download')).toBe(true);
      expect(md.textContent).toContain('下载 Markdown');
    });

    it('hides PDF + Markdown anchors for yaml artifacts (15.15 AC5)', () => {
      render(
        <ArtifactPreview
          url="/projects/abc/team_blueprint.yml"
          type="yaml"
          content="name: x\n"
          sessionId="11111111-1111-4111-8111-111111111111"
          filename="team_blueprint.yml"
          isComplete
        />,
      );
      // Original buttons remain
      expect(screen.getByTestId('artifact-download-file')).toBeTruthy();
      expect(screen.getByTestId('artifact-download-zip')).toBeTruthy();
      // New 15.15 buttons hidden for non-html
      expect(screen.queryByTestId('artifact-download-pdf')).toBeNull();
      expect(screen.queryByTestId('artifact-download-markdown')).toBeNull();
    });

    it('hides PDF + Markdown anchors for markdown artifacts (15.15 AC5)', () => {
      render(
        <ArtifactPreview
          url="/projects/abc/report.md"
          type="markdown"
          content="# t\n"
          sessionId="11111111-1111-4111-8111-111111111111"
          filename="report.md"
          isComplete
        />,
      );
      expect(screen.queryByTestId('artifact-download-pdf')).toBeNull();
      expect(screen.queryByTestId('artifact-download-markdown')).toBeNull();
    });

    it('alerts and aborts navigation when PDF endpoint returns 503 (15.15 AC4+AC6)', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ status: 503 } as Response);
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
      // We don't want the test to actually navigate.
      const origLoc = window.location.href;

      render(
        <ArtifactPreview
          url="/projects/abc/prototype.html"
          type="html"
          content="<!doctype html>"
          sessionId="11111111-1111-4111-8111-111111111111"
          filename="prototype.html"
          isComplete
        />,
      );
      const pdf = screen.getByTestId('artifact-download-pdf') as HTMLAnchorElement;
      // jsdom href setter is a no-op for navigation; just verify no throw + alert fired.
      fireEvent.click(pdf);
      // Wait a microtask so the async handler resolves.
      await Promise.resolve();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/pdf?filename=prototype.html'),
        expect.objectContaining({ method: 'HEAD' }),
      );
      expect(alertMock).toHaveBeenCalledTimes(1);
      expect(alertMock.mock.calls[0]?.[0] as string).toContain('PDF');
      // Confirm we did NOT navigate (window.location.href unchanged).
      expect(window.location.href).toBe(origLoc);
    });
  });
});
