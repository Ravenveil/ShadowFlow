/**
 * SkillDropdown — installed-skill picker with live compile status.
 *
 * Round 4 PR-E. Renders a list of installed skills filtered by the
 * user's `@<query>` token, fetching `/api/skills/:id/compile-status`
 * for each visible row so the user can see whether the skill is ready
 * to run before they hit submit:
 *
 *   ┌────────────────────────────────────────┐
 *   │ ● bmad-method                          │
 *   │   BMAD-METHOD · 安装来源                │
 *   │   ✅ 已编译 · team · 6 agents · ~$0.12  │
 *   ├────────────────────────────────────────┤
 *   │ ● paper-review                         │
 *   │   ⏳ 编译中...                          │
 *   └────────────────────────────────────────┘
 *
 * Layered atop the legacy `CommandMenu` rather than replacing it — the
 * existing menu owns keyboard navigation + caret-aware insertion, and
 * StartPage continues to use it. This component is a passive overlay
 * that appears on the same `@<query>` trigger to surface the compile
 * cache; if the user prefers the keyboard flow they can ignore the
 * dropdown entirely and it never gets in the way (positioned below
 * the textarea, not as a modal).
 *
 * Why a separate component:
 *   1. CommandMenu is a generic `/` + `@` slash-menu; cramming the
 *      compile-status fetch into it would couple it to skills.
 *   2. PR-D Lane 1/2 is touching CommandMenu-adjacent code; keeping
 *      this file isolated avoids merge collisions.
 *   3. The dropdown's data dependency (per-item compile fetch) has a
 *      different lifecycle than CommandMenu items, so the cleanest
 *      home is its own component with its own debounce.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, XCircle, CircleDashed } from 'lucide-react';
import { getApiBase } from '../api/_base';
import type { InstalledSkill } from '../api/skillIngest';
import { parseSkillToken } from '../lib/skillToken';

/**
 * Response shape from `GET /api/skills/:id/compile-status`.
 * Mirrored from server/src/routes/skills-preview-triage.ts but
 * intentionally kept as an inline interface (not a shared type)
 * to avoid coupling the frontend build to the server package.
 */
export interface CompileStatus {
  skill_id: string;
  status: 'compiled' | 'compiling' | 'failed' | 'no_cache';
  compiled?: {
    mode: 'agent' | 'team';
    members_count?: number;
    edges_count?: number;
    tools_count?: number;
    compiled_at: string;
    model: string;
    derived_from?: 'structured' | 'prose-llm' | 'fallback';
  };
  estimated_cost_usd: number;
}

export interface SkillDropdownProps {
  /**
   * The raw composer text. The dropdown extracts the `@<query>` token
   * itself via the canonical parser so the consumer doesn't have to
   * keep regex parity. When no token is present the dropdown hides.
   */
  composerText: string;
  /** Installed skill catalog; null = still loading (we render nothing). */
  installedSkills: InstalledSkill[] | null;
  /** Called when user clicks a row. Provides the canonical skill id. */
  onPick?: (skillId: string) => void;
  /** Anchor offset under the textarea — defaults sensibly for /start. */
  className?: string;
}

/**
 * Filter the installed list to whatever the user has typed after `@`.
 * We re-use the same lowercase substring match the existing CommandMenu
 * fuzz uses so behaviour stays consistent.
 */
function filterByQuery(
  installed: InstalledSkill[],
  rawToken: string,
): InstalledSkill[] {
  // rawToken comes from a parsed @<id>; lowercase substring is the cheapest
  // way to keep the dropdown stable while the user keeps typing.
  const q = rawToken.toLowerCase();
  if (!q) return installed.slice(0, 6);
  return installed
    .filter(
      (s) =>
        s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    )
    .slice(0, 6);
}

/**
 * Status row icon + label. Centralised so every row uses the same
 * shorthand and we don't accidentally drift "✅ 已编译" between
 * components. Lucide icons (no emoji per project rule — except the
 * "● bullet" Unicode glyph in the row title which is decorative,
 * not iconographic).
 */
function StatusRow({ status }: { status: CompileStatus | null | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <CircleDashed size={12} /> 状态未知
      </span>
    );
  }
  if (status.status === 'compiled' && status.compiled) {
    const c = status.compiled;
    const meta =
      c.mode === 'team'
        ? `${c.mode} · ${c.members_count ?? 0} agents · ${c.edges_count ?? 0} edges`
        : `${c.mode}${c.tools_count != null ? ` · ${c.tools_count} tools` : ''}`;
    const cost =
      status.estimated_cost_usd > 0
        ? ` · ~$${status.estimated_cost_usd.toFixed(2)}`
        : '';
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 size={12} /> 已编译 · {meta}
        {cost}
      </span>
    );
  }
  if (status.status === 'compiling') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-sky-400">
        <Loader2 size={12} className="animate-spin" /> 编译中...
      </span>
    );
  }
  if (status.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <XCircle size={12} /> 降级运行 (fallback)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      <CircleDashed size={12} /> 未编译
    </span>
  );
}

export const SkillDropdown: React.FC<SkillDropdownProps> = ({
  composerText,
  installedSkills,
  onPick,
  className = '',
}) => {
  // Parse the `@<id>` token out of the composer using the canonical parser
  // so we hide / show the dropdown on exactly the same boundary the route
  // server will see at submit time. The parser ignores `user@example.com`.
  // We additionally allow a tail-substring while the user is still typing —
  // the canonical regex requires `(?=\s|$)` so a half-typed `@bma` wouldn't
  // match at end-of-string; we synthesise a trailing space to make it match.
  const { skill_id: parsedId } = useMemo(() => {
    // Synthesise a trailing space so an in-progress `@bma` matches. If the
    // canonical parser misses (email-like contexts), we fall back to no-op.
    const probe = composerText.trimEnd();
    if (!probe || !probe.includes('@')) {
      return { skill_id: null };
    }
    return parseSkillToken(`${probe} `);
  }, [composerText]);

  // Per-id compile status cache. Populated lazily as visible rows enter
  // view. We keep stale entries so repeatedly opening/closing the dropdown
  // doesn't refetch every keystroke — caller can clear by remounting.
  const [statusById, setStatusById] = useState<Record<string, CompileStatus>>(
    {},
  );
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    if (!installedSkills) return [] as InstalledSkill[];
    return filterByQuery(installedSkills, parsedId ?? '');
  }, [installedSkills, parsedId]);

  // Fetch compile-status for each newly-visible row. Bare `fetch` is
  // enough here — the endpoint is a few-byte JSON response and the UI
  // re-renders on completion via setStatusById. Errors → leave status
  // unset so the row falls back to the "状态未知" affordance.
  useEffect(() => {
    if (visible.length === 0) return;
    const ids = visible.map((s) => s.id);
    const toFetch = ids.filter(
      (id) => !statusById[id] && !loadingIds.has(id),
    );
    if (toFetch.length === 0) return;
    // Mark in-flight so concurrent renders don't refire the same id.
    setLoadingIds((prev) => {
      const next = new Set(prev);
      for (const id of toFetch) next.add(id);
      return next;
    });
    void Promise.all(
      toFetch.map(async (id) => {
        try {
          const r = await fetch(
            `${getApiBase()}/api/skills/${encodeURIComponent(id)}/compile-status`,
          );
          if (!r.ok) return null;
          const data = (await r.json()) as CompileStatus;
          return { id, data };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      setStatusById((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r && r.data) next[r.id] = r.data;
        }
        return next;
      });
      setLoadingIds((prev) => {
        const next = new Set(prev);
        for (const id of toFetch) next.delete(id);
        return next;
      });
    });
  }, [visible, statusById, loadingIds]);

  // Hide entirely when there's no `@` token in the composer or no matches.
  // No installedSkills (still loading) → also hide so we don't flash an
  // empty box.
  if (!parsedId && !composerText.match(/@\S{0,30}$/)) return null;
  if (!installedSkills || visible.length === 0) return null;

  return (
    <div
      data-testid="skill-dropdown"
      className={`mt-2 rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-lg backdrop-blur ${className}`}
    >
      <ul className="divide-y divide-zinc-800">
        {visible.map((s) => {
          const status = statusById[s.id];
          return (
            <li
              key={s.id}
              className="cursor-pointer px-3 py-2 transition hover:bg-zinc-800/60"
              onClick={() => onPick?.(s.id)}
            >
              <div className="flex items-baseline gap-2">
                <span aria-hidden className="text-emerald-500">
                  &bull;
                </span>
                <span className="font-medium text-zinc-100">{s.id}</span>
                <span className="text-xs text-zinc-500">{s.name}</span>
              </div>
              <div className="ml-4 mt-1">
                <StatusRow status={status} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SkillDropdown;
