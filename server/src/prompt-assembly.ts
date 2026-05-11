/**
 * prompt-assembly.ts — Story 15.13 / 15.29 — Multi-layer system prompt composer.
 *
 * Implements the OpenDesign-aligned 8-layer "onion" (Story 15.29 added
 * conversation_history at slot 6):
 *
 *   1. DISCOVERY directives    (force intent restatement + plan)
 *   2. Identity charter        (anti-AI-slop hard rules)
 *   3. DS injection_prompt     (from design-systems registry / 15.11)
 *   4. Skill system_prompt     (from skills registry / 15.10)
 *   5. Project meta block      (kind / fidelity / animations / ... )
 *   6. Conversation history    (multi-turn chat history; 15.29)
 *   7. Side files              (reference snippets — interface only; 15.12 fills)
 *   8. Framework directive     (mode-specific, e.g. deck → PPTX layout rules)
 *
 * Layer order is fixed. Each layer is independently togglable via
 * `layer_toggles.<key> = false`. Empty layers (toggled off OR empty content)
 * are dropped completely — no separator, no blank line — so the resulting
 * prompt is dense regardless of which layers are active.
 *
 * Layers are joined by `\n\n---\n\n` (markdown horizontal rule) for visual
 * separation when the prompt is dumped to logs / inspector UI.
 */

import { DISCOVERY_CHARTER } from './discovery-charter';
import { IDENTITY_CHARTER } from './identity-charter';
import { getFrameworkDirective } from './framework-directives';

export interface LayerToggles {
  discovery?: boolean;
  identity?: boolean;
  ds?: boolean;
  skill?: boolean;
  project?: boolean;
  /** Story 15.29 — conversation history layer; default enabled. */
  conversation_history?: boolean;
  sides?: boolean;
  framework?: boolean;
}

export interface ComposeInput {
  /** From design-systems registry (15.11). May be empty. */
  ds_injection?: string;
  /** From skills registry (15.10). The skill body. */
  skill_system_prompt?: string;
  /** Skill mode — drives framework directive selection ('deck' → PPTX). */
  skill_mode?: string;
  /** Optional user-supplied project metadata (kind / fidelity / etc.). */
  project_meta?: Record<string, unknown> | null;
  /**
   * Story 15.29 — pre-rendered conversation history block. When present and
   * non-empty, it is injected between project_meta and side_files as the new
   * layer 6. Empty / missing → drop. assembler.ts owns the rendering (see
   * its `## CONVERSATION HISTORY` markdown block builder).
   */
  conversation_history?: string;
  /**
   * Side-file reference block. Story 15.12 owns construction; here we just
   * accept a pre-rendered string and inject it as layer 7. Empty → skip.
   */
  side_files?: string;
  /** Per-layer overrides; missing keys default to enabled. */
  layer_toggles?: LayerToggles;
}

export interface ComposeResult {
  prompt: string;
  layers_included: string[];
  layers_skipped: string[];
  total_chars: number;
  /** Concrete framework name when a directive was injected, else null. */
  framework: string | null;
}

type LayerKey =
  | 'discovery'
  | 'identity'
  | 'ds'
  | 'skill'
  | 'project'
  | 'conversation_history'
  | 'sides'
  | 'framework';

const LAYER_ORDER: readonly LayerKey[] = [
  'discovery',
  'identity',
  'ds',
  'skill',
  'project',
  // Story 15.29 — conversation_history sits between project and sides.
  'conversation_history',
  'sides',
  'framework',
] as const;

const LAYER_SEPARATOR = '\n\n---\n\n';

/**
 * Render the project_meta object as a bullet list. Strings / numbers /
 * booleans are stringified directly; complex values are JSON.stringify'd so
 * nothing leaks raw [object Object] into the prompt. Object key insertion
 * order is preserved (no sorting / re-keying).
 */
function renderProjectMeta(meta: Record<string, unknown>): string {
  const lines = Object.entries(meta).map(([k, v]) => {
    const val =
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);
    return `- ${k}: ${val}`;
  });
  return '## PROJECT META\n\n' + lines.join('\n');
}

/**
 * Compose the system prompt by stacking 8 ordered layers (Story 15.29 added
 * conversation_history at slot 6). Empty / disabled layers are dropped.
 * Returns the final prompt plus observability metadata for the `compose` SSE
 * event (layer names only — never the prompt itself).
 */
export function composeSystemPrompt(input: ComposeInput): ComposeResult {
  const t = input.layer_toggles ?? {};

  // Build each layer as { key, content }. Empty content === drop later.
  const layers: Array<{ key: LayerKey; content: string }> = [];

  // 1. DISCOVERY
  layers.push({
    key: 'discovery',
    content: t.discovery !== false ? DISCOVERY_CHARTER : '',
  });

  // 2. Identity
  layers.push({
    key: 'identity',
    content: t.identity !== false ? IDENTITY_CHARTER : '',
  });

  // 3. DS injection
  layers.push({
    key: 'ds',
    content: t.ds !== false && input.ds_injection ? input.ds_injection : '',
  });

  // 4. Skill system_prompt
  layers.push({
    key: 'skill',
    content:
      t.skill !== false && input.skill_system_prompt ? input.skill_system_prompt : '',
  });

  // 5. Project meta
  let projectContent = '';
  if (
    t.project !== false &&
    input.project_meta &&
    typeof input.project_meta === 'object' &&
    Object.keys(input.project_meta).length > 0
  ) {
    projectContent = renderProjectMeta(input.project_meta);
  }
  layers.push({ key: 'project', content: projectContent });

  // 6. Conversation history (Story 15.29) — assembler.ts pre-renders the
  // markdown block from `getRecentMessages(conversation_id, 20)`. When the
  // session has no conversation_id or no messages, the input field is empty
  // / undefined and the layer is dropped together with all other empty layers.
  layers.push({
    key: 'conversation_history',
    content:
      t.conversation_history !== false && input.conversation_history
        ? input.conversation_history
        : '',
  });

  // 7. Side files (15.12 interface — empty by default)
  layers.push({
    key: 'sides',
    content: t.sides !== false && input.side_files ? input.side_files : '',
  });

  // 8. Framework directive (mode-driven)
  let frameworkContent = '';
  let framework: string | null = null;
  if (t.framework !== false) {
    frameworkContent = getFrameworkDirective(input.skill_mode);
    if (frameworkContent && input.skill_mode) {
      framework = input.skill_mode;
    }
  }
  layers.push({ key: 'framework', content: frameworkContent });

  // Drop empty layers; preserve order. Using trim() so a layer that's pure
  // whitespace doesn't sneak through as "non-empty".
  const included = layers.filter((l) => l.content.trim().length > 0);
  const skipped = layers
    .filter((l) => l.content.trim().length === 0)
    .map((l) => l.key);

  const prompt = included.map((l) => l.content).join(LAYER_SEPARATOR);

  // Sanity guard — LAYER_ORDER must mirror the layers we just built. Catches
  // divergence between push order and the canonical list.
  const builtKeys = layers.map((l) => l.key);
  if (
    builtKeys.length !== LAYER_ORDER.length ||
    builtKeys.some((k, i) => k !== LAYER_ORDER[i])
  ) {
    throw new Error(
      `[prompt-assembly] layer order drift: built ${builtKeys.join(',')} vs canonical ${LAYER_ORDER.join(',')}`,
    );
  }

  return {
    prompt,
    layers_included: included.map((l) => l.key),
    layers_skipped: skipped,
    total_chars: prompt.length,
    framework,
  };
}

/** Exported for tests / inspector UI. */
export { LAYER_ORDER, LAYER_SEPARATOR };
