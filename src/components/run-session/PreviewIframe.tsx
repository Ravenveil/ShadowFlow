/**
 * PreviewIframe — sandboxed HTML preview for artifact mime='text/html'.
 *
 * Security:
 *   - `sandbox="allow-scripts"` (NO allow-same-origin) → script can run but
 *     cannot read parent origin's cookies / localStorage / DOM.
 *   - `srcDoc` (not `src`) → avoids URL injection; payload is bound by
 *     React as a literal string.
 *
 * Streaming friendly: re-renders on every `html` prop change. Browsers
 * recreate the document on each srcDoc update; this is fine for the typical
 * "stream until isComplete" cadence.
 */
import React from 'react';

interface PreviewIframeProps {
  html: string;
  title?: string;
}

const PreviewIframe: React.FC<PreviewIframeProps> = ({ html, title }) => {
  return (
    <iframe
      title={title ?? 'preview'}
      srcDoc={html}
      sandbox="allow-scripts"
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        height: '100%',
        border: 0,
        background: '#fff',
      }}
    />
  );
};

export default PreviewIframe;
