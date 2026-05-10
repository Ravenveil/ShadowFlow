/**
 * parser.ts — Streaming XML-tag parser for Claude SSE output (Story 15.2)
 *
 * Consumes incremental text emitted by Claude's content_block_delta stream and
 * extracts the following ShadowFlow control tags into SSE events:
 *
 *   <sf:classify .../>     → classify
 *   <sf:step .../>         → assemble
 *   <sf:node .../>         → node
 *   <sf:edge .../>         → edge
 *   <artifact ...>...</>   → blueprint (+ yaml-line × N when type="yaml")
 *   <sf:complete .../>     → complete
 *
 * The parser is *buffer-aware*: callers feed it the accumulated buffer; it
 * returns the residual buffer (with completed tags stripped) and the array of
 * SSE events produced this tick. Open/incomplete tags stay in the buffer for
 * the next call.
 *
 * The artifact callback is fired synchronously when an <artifact> closes — the
 * caller writes the file to .shadowflow/projects/<session_id>/<filename>.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export type ArtifactCallback = (
  filename: string,
  content: string,
  type: string,
) => void;

// ─── attribute parsing ───────────────────────────────────────────────────────

function parseAttrs(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([\w][\w-]*)\s*=\s*["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(attrStr)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

// ─── main parser ─────────────────────────────────────────────────────────────

export function parseAndExtract(
  buffer: string,
  sessionId: string,
  artifactCallback: ArtifactCallback,
): { buffer: string; events: SseEvent[] } {
  const events: SseEvent[] = [];

  // sf:classify  (self-closing, no children)
  buffer = buffer.replace(/<sf:classify\s+((?:[^>"']|"[^"]*"|'[^']*')+?)\/>/g, (_match, attrs: string) => {
    const a = parseAttrs(attrs);
    events.push({
      event: 'classify',
      data: {
        output_type: a.output_type ?? 'workflow',
        mode: a.mode ?? 'team',
        confidence: parseFloat(a.confidence ?? '0.8'),
        complexity: parseInt(a.complexity ?? '2', 10),
      },
    });
    return '';
  });

  // sf:step  (self-closing)
  buffer = buffer.replace(/<sf:step\s+((?:[^>"']|"[^"]*"|'[^']*')+?)\/>/g, (_match, attrs: string) => {
    const a = parseAttrs(attrs);
    events.push({
      event: 'assemble',
      data: {
        step: a.name ?? '',
        status: a.status ?? 'running',
        elapsed_ms: a.elapsed_ms ? parseInt(a.elapsed_ms, 10) : null,
      },
    });
    return '';
  });

  // sf:node  (self-closing)
  buffer = buffer.replace(/<sf:node\s+((?:[^>"']|"[^"]*"|'[^']*')+?)\/>/g, (_match, attrs: string) => {
    const a = parseAttrs(attrs);
    events.push({
      event: 'node',
      data: {
        node_id: a.id ?? '',
        type: (a.type as 'coordinator' | 'agent') ?? 'agent',
        title: a.title ?? '',
        sub: a.sub ?? '',
        chips: (a.chips ?? '').split(',').map(s => s.trim()).filter(Boolean),
        status: 'building',
        avatar_char: a.avatar_char ?? (a.title ? a.title.charAt(0) : '?'),
      },
    });
    return '';
  });

  // sf:edge  (self-closing)
  buffer = buffer.replace(/<sf:edge\s+((?:[^>"']|"[^"]*"|'[^']*')+?)\/>/g, (_match, attrs: string) => {
    const a = parseAttrs(attrs);
    events.push({
      event: 'edge',
      data: {
        from: a.from ?? '',
        to: a.to ?? '',
        status: 'active',
      },
    });
    return '';
  });

  // <artifact ...>...</artifact>  — only when fully closed
  const artifactRe = /<artifact([^>]*)>([\s\S]*?)<\/artifact>/g;
  buffer = buffer.replace(artifactRe, (_match, tagAttrs: string, content: string) => {
    const a = parseAttrs(tagAttrs);
    const type = a.type ?? 'yaml';
    const filename =
      a.filename ??
      (type === 'html' ? 'output.html' : type === 'markdown' ? 'output.md' : 'output.yml');
    const trimmed = content.trim();

    // Side-effect: write file to disk
    try {
      artifactCallback(filename, trimmed, type);
    } catch (err) {
      // We don't want a write failure to crash the parser — surface as error event.
      events.push({
        event: 'error',
        data: {
          message: `Failed to persist artifact ${filename}: ${(err as Error).message}`,
          code: 'ARTIFACT_WRITE_FAILED',
        },
      });
    }

    // Primary event: blueprint (the front-end displays `yaml` regardless of type)
    events.push({
      event: 'blueprint',
      data: {
        yaml: trimmed,
        filename,
        artifact_type: type,
        artifact_url: `/projects/${sessionId}/${filename}`,
      },
    });

    // YAML row stream
    if (type === 'yaml') {
      const lines = trimmed.split('\n');
      lines.forEach(line => {
        events.push({
          event: 'yaml-line',
          data: { line, total_lines: lines.length },
        });
      });
    }

    return '';
  });

  // sf:complete  (self-closing, attrs optional). Allow attribute values that
  // themselves contain `/` (e.g. redirect="/editor"). We accept any chars that
  // are not `>` until we hit the literal `/>` terminator.
  buffer = buffer.replace(/<sf:complete\s*((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g, (_match, attrs: string) => {
    const a = parseAttrs(attrs ?? '');
    events.push({
      event: 'complete',
      data: {
        session_id: sessionId,
        run_id: `run-${sessionId.slice(0, 8)}`,
        redirect: a.redirect ?? `/editor?session=${sessionId}`,
      },
    });
    return '';
  });

  return { buffer, events };
}
