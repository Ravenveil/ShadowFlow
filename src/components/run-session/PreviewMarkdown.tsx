/**
 * PreviewMarkdown — minimal, dependency-free Markdown renderer.
 *
 * Supports a deliberate subset (covers ~90% of LLM-emitted artifacts):
 *   - ATX headings: `#`..`######`
 *   - Fenced code blocks: ```lang\n...\n```
 *   - Unordered lists: `- item`, `* item`
 *   - Ordered lists: `1. item`
 *   - Inline: `**bold**`, `*italic*`, `` `code` ``, `[text](url)`
 *   - Blockquote: `> ...` (single-line)
 *   - Paragraphs separated by blank lines
 *
 * Out of scope (intentional, to keep <100 lines and zero deps):
 *   tables, footnotes, HTML-in-MD, image rendering, nested lists,
 *   setext headings, task lists.
 *
 * Safe by construction: never sets dangerouslySetInnerHTML; every node is
 * a React element with text children, so untrusted MD cannot inject HTML.
 */
import React from 'react';

interface PreviewMarkdownProps {
  source: string;
}

// Inline tokenizer: walks the string once, emitting React nodes.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // One unified regex covering all inline patterns in priority order.
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('`')) {
      out.push(
        <code
          key={k}
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.92em',
            padding: '1px 5px',
            borderRadius: 3,
            background: 'var(--t-panel-3, var(--bg-elev-3))',
            color: 'var(--t-accent-bright, #D8B4FE)',
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('**')) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('*')) {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    } else if (m[4]) {
      // [text](url)
      out.push(
        <a
          key={k}
          href={m[6]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--t-accent, #A855F7)', textDecoration: 'underline' }}
        >
          {m[5]}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(src: string): React.ReactNode[] {
  const lines = src.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const raw = lines[i];

    // Fenced code block.
    const fence = /^```(\w*)\s*$/.exec(raw);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing fence
      out.push(
        <pre
          key={`code-${key++}`}
          data-lang={lang || undefined}
          style={{
            margin: '12px 0',
            padding: '12px 14px',
            borderRadius: 6,
            background: 'var(--t-panel-3, var(--bg-elev-3))',
            border: '1px solid var(--t-border, var(--border))',
            overflow: 'auto',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--t-fg-2)',
          }}
        >
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Heading.
    const h = /^(#{1,6})\s+(.+)$/.exec(raw);
    if (h) {
      const level = h[1].length;
      const sizes = [22, 19, 17, 15, 14, 13];
      const margins = ['20px 0 10px', '18px 0 10px', '16px 0 8px', '14px 0 6px', '12px 0 6px', '10px 0 4px'];
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      out.push(
        <Tag
          key={`h-${key++}`}
          style={{
            fontSize: sizes[level - 1],
            fontWeight: level <= 2 ? 700 : 600,
            color: 'var(--t-fg, var(--t-fg-1))',
            margin: margins[level - 1],
            lineHeight: 1.3,
          }}
        >
          {renderInline(h[2], `h-${key}`)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // Blockquote.
    if (/^>\s?/.test(raw)) {
      out.push(
        <blockquote
          key={`bq-${key++}`}
          style={{
            margin: '10px 0',
            padding: '6px 12px',
            borderLeft: '3px solid var(--t-accent, #A855F7)',
            color: 'var(--t-fg-3)',
            background: 'var(--t-panel-2, var(--bg-elev-2))',
          }}
        >
          {renderInline(raw.replace(/^>\s?/, ''), `bq-${key}`)}
        </blockquote>,
      );
      i += 1;
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      out.push(
        <ul
          key={`ul-${key++}`}
          style={{ margin: '8px 0', paddingLeft: 22, color: 'var(--t-fg-2)' }}
        >
          {items.map((it, j) => (
            <li key={j} style={{ margin: '4px 0' }}>
              {renderInline(it, `ul-${key}-${j}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      out.push(
        <ol
          key={`ol-${key++}`}
          style={{ margin: '8px 0', paddingLeft: 22, color: 'var(--t-fg-2)' }}
        >
          {items.map((it, j) => (
            <li key={j} style={{ margin: '4px 0' }}>
              {renderInline(it, `ol-${key}-${j}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blank line → flush; otherwise paragraph (collapsing consecutive lines).
    if (raw.trim() === '') {
      i += 1;
      continue;
    }
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`p-${key++}`} style={{ margin: '8px 0' }}>
        {renderInline(paraLines.join(' '), `p-${key}`)}
      </p>,
    );
  }

  return out;
}

const PreviewMarkdown: React.FC<PreviewMarkdownProps> = ({ source }) => {
  return <div data-component="preview-markdown">{renderMarkdown(source)}</div>;
};

export default PreviewMarkdown;
