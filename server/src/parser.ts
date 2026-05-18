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
  //
  // 2026-05-18 — agent-B extension. AgentPanel needs to render 5 slots
  // (Identity / Persona / Model / Tools / Memory). The LLM may now emit
  // optional `model`, `memory`, `tools_picked`, `tools_candidate` attributes
  // alongside the legacy `chips`. All new fields are optional — old skills
  // that only emit chips still parse cleanly, and the front-end falls back
  // to chips-derived values when the new fields are absent.
  buffer = buffer.replace(/<sf:node\s+((?:[^>"']|"[^"]*"|'[^']*')+?)\/>/g, (_match, attrs: string) => {
    const a = parseAttrs(attrs);
    const splitCsv = (s: string | undefined): string[] =>
      (s ?? '').split(',').map(x => x.trim()).filter(Boolean);
    events.push({
      event: 'node',
      data: {
        node_id: a.id ?? '',
        type: (a.type as 'coordinator' | 'agent') ?? 'agent',
        title: a.title ?? '',
        sub: a.sub ?? '',
        chips: splitCsv(a.chips),
        status: 'building',
        avatar_char: a.avatar_char ?? (a.title ? a.title.charAt(0) : '?'),
        // Optional extension fields (undefined when LLM omits them so the
        // front-end can detect missing-data and run its fallback path).
        model: a.model || undefined,
        memory: a.memory || undefined,
        tools_picked: a.tools_picked ? splitCsv(a.tools_picked) : undefined,
        tools_candidate: a.tools_candidate ? splitCsv(a.tools_candidate) : undefined,
        persona: a.persona || undefined,
      },
    });
    return '';
  });

  // sf:agent-persona  (paired tag, body is multi-line system-prompt text)
  //
  // 2026-05-18 — emitted by the assembler when the agent's persona/system
  // prompt is too long to fit in an attribute. Body is taken verbatim
  // (trimmed) and routed to the front-end via a dedicated `agent-persona`
  // event keyed by `node_id` so the AgentPanel can merge it onto the
  // matching node. Order is not guaranteed — the panel must tolerate
  // persona arriving before or after the node it belongs to.
  buffer = buffer.replace(
    /<sf:agent-persona\s+((?:[^>"']|"[^"]*"|'[^']*')+?)>([\s\S]*?)<\/sf:agent-persona>/g,
    (_match, attrs: string, body: string) => {
      const a = parseAttrs(attrs);
      events.push({
        event: 'agent-persona',
        data: {
          node_id: a.node_id ?? '',
          persona: body.trim(),
        },
      });
      return '';
    },
  );

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

  // 2026-05-11 Layer 1 — strip <sf:discovery>...</sf:discovery>. Claude is
  // told by DISCOVERY_CHARTER to emit this block at the start of every
  // first reply (intent restatement + plan + ambiguities). The block is
  // metadata for an inspector view — we don't surface it in the chat
  // bubble, but if we leave it un-stripped the text-emit branch below
  // holds back forever waiting for an unknown tag to close. We emit a
  // `discovery` event so downstream tools could read it; current UI just
  // ignores. Use [\s\S] so newlines inside the block match.
  buffer = buffer.replace(/<sf:discovery>([\s\S]*?)<\/sf:discovery>/g, (_match, content: string) => {
    events.push({ event: 'discovery', data: { body: content.trim() } });
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

  // 2026-05-11 Layer 1 — defensive: any FULLY CLOSED unknown <sf:foo>...</sf:foo>
  // block left in the buffer would otherwise deadlock the text emit branch
  // below (it would hold back at `<`). Strip them and emit a generic
  // `unknown-tag` event so we don't lose information silently. Self-closing
  // unknown tags (<sf:foo .../>) get the same treatment.
  buffer = buffer.replace(/<sf:([\w-]+)>([\s\S]*?)<\/sf:\1>/g, (_match, name: string, content: string) => {
    events.push({ event: 'unknown-tag', data: { name, body: content.trim() } });
    return '';
  });
  buffer = buffer.replace(/<sf:([\w-]+)\s+((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g, (_match, name: string, attrs: string) => {
    events.push({ event: 'unknown-tag', data: { name, attrs: parseAttrs(attrs) } });
    return '';
  });

  // 2026-05-11 Layer 1 — Claude Code-style conversation mode.
  // After stripping all known + unknown closed tags, the residual non-tag
  // text is the LLM's plain natural-language reply. Emit as `text` events.
  // We only hold back content from the first `<sf:` or `<artifact` prefix
  // onward — those could be partial tags still streaming. Other `<`
  // (literal markup the LLM might write, or math like `<5`) flows through.
  const partialTagIdx = findPartialTagStart(buffer);
  const safeText = partialTagIdx === -1 ? buffer : buffer.slice(0, partialTagIdx);
  if (safeText.length > 0) {
    events.push({ event: 'text', data: { text: safeText } });
    buffer = partialTagIdx === -1 ? '' : buffer.slice(partialTagIdx);
  }

  return { buffer, events };
}

// Find the earliest position where the buffer starts a potentially-incomplete
// known tag (`<sf:` or `<artifact`). Returns -1 if no such prefix exists.
function findPartialTagStart(buf: string): number {
  const a = buf.indexOf('<sf:');
  const b = buf.indexOf('<artifact');
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}
