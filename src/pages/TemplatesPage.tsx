/**
 * TemplatesPage — Hi-Fi v2 redesign (T3 Pages-B)
 *
 * UI PROTECTION: 只能加，不能删。所有原有功能必须保留：
 *   - PRESETS 模板（官方）→ 「套用」=onPick(alias) → /editor/:alias
 *   - QUICK_DEMO_PROMPTS → 「预览/Quick Demo」=onQuickDemo(alias) → /editor/:alias?quickDemo=1
 *   - listUserTemplates / deleteUserTemplate (localStorage) → 「我的 fork」
 *   - listTemplates() Builder-origin templates → 「社区 (0G)」+ workflow_id 路由
 *   - 「↗ 粘贴 CID」→ /import 路由
 *   - 「⑂ fork」→ 触发本地 fork（直接打开模板的 editor 入口）
 *   - 「当前」pill → URL ?current=alias 时高亮
 *
 * 视觉来源：/tmp/shadowflow-handoff/shadowflow/project/hf-pages.jsx HfTemplates
 *   全宽内容区 + 4 filter chips + 3-col 卡片（小 DAG 占位 + 套用/预览/⑂）
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PRESETS } from '../templates/presets';
import {
  listUserTemplates,
  deleteUserTemplate,
  type UserTemplate,
} from '../templates/userTemplates';
import { listTemplates, type TemplateListItem } from '../api/templates';
import { HfTopBar, HfPill } from '../components/hifi';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type FilterKey = 'official' | 'community' | 'mine' | 'fav';

type Lang = 'EN' | 'CN';

interface UnifiedTemplate {
  key: string;          // route alias / id used by onPick
  name: string;         // display name
  pathLabel: string;    // OFFICIAL · paper-lab  /  COMMUNITY · slug  /  MINE · slug
  glyph: string;        // single-char tile glyph
  description: string;
  agentCount: number;
  edgeCount: number;
  level: number;        // L1/L2/L3
  star?: number;
  source: 'official' | 'community' | 'mine';
  current?: boolean;
  // Action targets
  applyHref: string;    // /editor/:alias
  previewHref: string;  // /editor/:alias?quickDemo=1
  rawUserTpl?: UserTemplate;
  rawBuilderTpl?: TemplateListItem;
}

// Unicode glyphs aligned with the spec
const PRESET_GLYPHS: Record<string, string> = {
  academic_paper: '◇',
  newsroom: '◈',
  modern_startup: '⬢',
  ming_cabinet: '☷',
  solo_company: '◆',
  blank: '✦',
};

function presetStar(alias: string): number | undefined {
  const stars: Record<string, number> = {
    academic_paper: 127,
    newsroom: 105,
    modern_startup: 83,
    ming_cabinet: 42,
    solo_company: 31,
  };
  return stars[alias];
}

function presetLevel(alias: string): number {
  const lvls: Record<string, number> = {
    academic_paper: 2,
    newsroom: 2,
    modern_startup: 3,
    ming_cabinet: 1,
    solo_company: 1,
    blank: 0,
  };
  return lvls[alias] ?? 1;
}

// ---------------------------------------------------------------------------
// TemplatesPage — Hi-Fi v2
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lang: Lang = 'CN'; // hi-fi spec is CN-first; original page lang switch retained at TopBar globally

  // Current applied template — taken from URL ?current=alias (some flows pass it),
  // else a sane default ("academic_paper") to mirror the spec's "当前" pill.
  const currentAlias = searchParams.get('current') || 'academic_paper';

  // Filters
  const [filter, setFilter] = useState<FilterKey>('official');
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavs());

  // Data: presets (sync), user templates (sync), builder templates (async)
  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  const [builderTpls, setBuilderTpls] = useState<TemplateListItem[]>([]);

  useEffect(() => {
    setUserTpls(listUserTemplates());
  }, []);

  useEffect(() => {
    listTemplates()
      .then((items) => setBuilderTpls(items))
      .catch(() => {
        /* silent — backend may not be running locally */
      });
  }, []);

  // Build unified list
  const unified = useMemo<UnifiedTemplate[]>(() => {
    const out: UnifiedTemplate[] = [];

    // PRESETS = official
    for (const alias of Object.keys(PRESETS)) {
      const p = PRESETS[alias];
      out.push({
        key: alias,
        name: p.title[lang === 'CN' ? 'zh' : 'en'],
        pathLabel: alias === 'blank' ? 'BLANK' : `OFFICIAL · ${alias.replace(/_/g, '-')}`,
        glyph: PRESET_GLYPHS[alias] || p.cjk?.charAt(0) || '✦',
        description: p.description[lang === 'CN' ? 'zh' : 'en'],
        agentCount: p.stats.agents,
        edgeCount: p.stats.edges,
        level: presetLevel(alias),
        star: presetStar(alias),
        source: 'official',
        current: alias === currentAlias,
        applyHref: `/editor/${alias}`,
        previewHref: `/editor/${alias}?quickDemo=1`,
      });
    }

    // listTemplates() — non-builder = community published; builder = community/builder origin
    for (const t of builderTpls) {
      const isBuilder = t.builder_origin === 'builder';
      out.push({
        key: t.template_id,
        name: t.name,
        pathLabel: `COMMUNITY · ${t.template_id.slice(0, 10)}`,
        glyph: '◇',
        description: t.description || '—',
        agentCount: t.agent_roster_count || 0,
        edgeCount: t.group_roster_count || 0,
        level: 2,
        star: undefined,
        source: 'community',
        applyHref: isBuilder && t.workflow_id
          ? `/editor?workflowId=${t.workflow_id}`
          : `/editor/${t.template_id}`,
        previewHref: `/editor/${t.template_id}?quickDemo=1`,
        rawBuilderTpl: t,
      });
    }

    // userTpls = mine
    for (const u of userTpls) {
      out.push({
        key: u.alias,
        name: u.title,
        pathLabel: `MINE · ${u.alias.replace(/_/g, '-')}`,
        glyph: '◆',
        description: u.description || '—',
        agentCount: u.stats.agents,
        edgeCount: u.stats.edges,
        level: 1,
        star: undefined,
        source: 'mine',
        applyHref: `/editor/${u.alias}`,
        previewHref: `/editor/${u.alias}?quickDemo=1`,
        rawUserTpl: u,
      });
    }

    return out;
  }, [userTpls, builderTpls, currentAlias, lang]);

  // Apply filter chip
  const visible = useMemo(() => {
    if (filter === 'official') return unified.filter((t) => t.source === 'official');
    if (filter === 'community') return unified.filter((t) => t.source === 'community');
    if (filter === 'mine') return unified.filter((t) => t.source === 'mine');
    if (filter === 'fav') return unified.filter((t) => favorites.has(t.key));
    return unified;
  }, [unified, filter, favorites]);

  // Counts for chips
  const counts = useMemo(() => ({
    official: unified.filter((t) => t.source === 'official').length,
    community: unified.filter((t) => t.source === 'community').length,
    mine: unified.filter((t) => t.source === 'mine').length,
    fav: favorites.size,
  }), [unified, favorites]);

  function toggleFav(key: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveFavs(next);
      return next;
    });
  }

  function handleApply(t: UnifiedTemplate) {
    navigate(t.applyHref);
  }

  function handlePreview(t: UnifiedTemplate) {
    navigate(t.previewHref);
  }

  function handleFork(t: UnifiedTemplate) {
    // Local fork = jump to editor in fork mode (preserves existing semantics
    // because /editor/:alias loads a template into a fresh canvas you can save)
    navigate(`${t.applyHref}${t.applyHref.includes('?') ? '&' : '?'}fork=1`);
  }

  function handleDeleteMine(t: UnifiedTemplate) {
    if (!t.rawUserTpl) return;
    if (!window.confirm(`确认删除 "${t.rawUserTpl.title}"?`)) return;
    deleteUserTemplate(t.rawUserTpl.alias);
    setUserTpls(listUserTemplates());
  }

  function handlePasteCid() {
    navigate('/import');
  }

  return (
    <>
      <HfTopBar
        right={
          <button
            type="button"
            onClick={handlePasteCid}
            className="hf-btn"
            style={{ fontSize: 11 }}
            data-testid="paste-cid-btn"
          >
            ↗ 粘贴 CID
          </button>
        }
      />

      <div style={{ flex: 1, padding: '20px 28px', overflow: 'auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 800 }}>模板</span>
          <span className="hf-meta">整套蓝图 (agents+team+DAG) · 一键套用</span>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {([
            ['official', `官方 · ${counts.official}`],
            ['community', `社区 (0G) · ${counts.community}`],
            ['mine', `我的 fork · ${counts.mine}`],
            ['fav', `收藏 · ${counts.fav}`],
          ] as Array<[FilterKey, string]>).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={filter === k ? 'hf-chip hf-chip-acc' : 'hf-chip'}
              style={{ fontSize: 10.5, cursor: 'pointer' }}
              data-testid={`tpl-filter-${k}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Empty group */}
        {visible.length === 0 && (
          <div
            className="hf-meta"
            style={{
              padding: '60px 0',
              textAlign: 'center',
              fontSize: 12,
            }}
          >
            {filter === 'community'
              ? '当前没有社区模板。试试 ↗ 粘贴 CID 导入一个。'
              : filter === 'mine'
                ? '还没有自定义模板。在编辑器里点"保存"把当前画布存成模板。'
                : filter === 'fav'
                  ? '还没有收藏。点击卡片右上角的 ☆ 收藏。'
                  : '没有可用模板。'}
          </div>
        )}

        {/* Card grid */}
        {visible.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 14,
            }}
            data-testid="template-grid"
          >
            {visible.map((t) => (
              <TemplateCard
                key={t.key}
                tpl={t}
                fav={favorites.has(t.key)}
                onToggleFav={() => toggleFav(t.key)}
                onApply={() => handleApply(t)}
                onPreview={() => handlePreview(t)}
                onFork={() => handleFork(t)}
                onDeleteMine={t.source === 'mine' ? () => handleDeleteMine(t) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// TemplateCard — single tile with mini DAG preview + 3 buttons
// ---------------------------------------------------------------------------

interface TemplateCardProps {
  tpl: UnifiedTemplate;
  fav: boolean;
  onToggleFav: () => void;
  onApply: () => void;
  onPreview: () => void;
  onFork: () => void;
  onDeleteMine?: () => void;
}

function TemplateCard({
  tpl,
  fav,
  onToggleFav,
  onApply,
  onPreview,
  onFork,
  onDeleteMine,
}: TemplateCardProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="hf-card"
      data-testid={`template-card-${tpl.key}`}
      style={{
        position: 'relative',
        padding: 14,
        borderColor: tpl.current
          ? 'var(--t-accent)'
          : hover
            ? 'color-mix(in oklab, var(--t-accent) 50%, var(--t-border))'
            : 'var(--t-border)',
        transition: 'border-color 160ms',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: 'var(--t-accent-tint)',
            color: 'var(--t-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {tpl.glyph}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {tpl.name}
          </div>
          <div className="hf-mono" style={{ fontSize: 9.5, color: 'var(--t-fg-4)', marginTop: 2 }}>
            {tpl.pathLabel}
          </div>
        </div>
        {tpl.current && <HfPill>当前</HfPill>}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          aria-label={fav ? '取消收藏' : '收藏'}
          title={fav ? '取消收藏' : '收藏'}
          style={{
            background: 'transparent',
            border: 'none',
            color: fav ? 'var(--t-warn)' : 'var(--t-fg-5)',
            fontSize: 14,
            cursor: 'pointer',
            padding: '0 2px',
          }}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--t-fg-3)',
          lineHeight: 1.5,
          marginBottom: 10,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 32,
        }}
      >
        {tpl.description}
      </div>

      {/* Mini DAG preview — SVG flow with 5 nodes + bezier edges.
          Visual blueprint: handoff `fb-tab-templates.jsx` lines 78-90 (real DAG
          flow line). We derive node count from agentCount so each card looks
          slightly different. Pure decoration — no interactivity. */}
      <MiniDagPreview agentCount={tpl.agentCount} keyHash={tpl.key} />

      {/* Chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {tpl.agentCount > 0 && (
          <span className="hf-chip" style={{ fontSize: 9.5 }}>
            {tpl.agentCount} agents
          </span>
        )}
        {tpl.level > 0 && (
          <span className="hf-chip" style={{ fontSize: 9.5 }}>
            L{tpl.level}
          </span>
        )}
        {tpl.star !== undefined && <HfPill>★ {tpl.star}</HfPill>}
        {tpl.source === 'community' && <HfPill color="var(--t-run)">0G</HfPill>}
        {tpl.source === 'mine' && <HfPill color="var(--t-warn)">MINE</HfPill>}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onApply}
          className="hf-btn hf-btn-pri"
          style={{
            flex: 1,
            justifyContent: 'center',
            fontSize: 11,
            padding: '6px 0',
            cursor: 'pointer',
          }}
          data-testid={`apply-${tpl.key}`}
        >
          套用
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="hf-btn"
          style={{ fontSize: 11, padding: '6px 10px', cursor: 'pointer' }}
          data-testid={`preview-${tpl.key}`}
        >
          预览
        </button>
        <button
          type="button"
          onClick={onFork}
          className="hf-btn"
          style={{ fontSize: 11, padding: '6px 10px', cursor: 'pointer' }}
          aria-label="Fork"
          title="Fork"
          data-testid={`fork-${tpl.key}`}
        >
          ⑂
        </button>
      </div>

      {/* Mine: delete affordance */}
      {onDeleteMine && (
        <button
          type="button"
          onClick={onDeleteMine}
          aria-label="删除"
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            background: 'transparent',
            border: 'none',
            fontSize: 10,
            color: 'var(--t-fg-5)',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-err)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-fg-5)';
          }}
        >
          删除
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniDagPreview — small SVG node+edge flow rendered on each template card.
// Replaces the dull gray-bar placeholder with a glanceable workflow shape.
// ---------------------------------------------------------------------------

interface MiniDagPreviewProps {
  agentCount: number;
  keyHash: string; // used to vary the layout per template deterministically
}

function MiniDagPreview({ agentCount, keyHash }: MiniDagPreviewProps) {
  // 0..4 nodes laid out in two rows; edges connect row1→row2 in a fan-in/out.
  const seed = (keyHash.charCodeAt(0) || 0) % 3; // 0/1/2 layout variant
  const n = Math.max(3, Math.min(5, agentCount || 3));
  const W = 260;
  const H = 64;
  // Distribute nodes across two rows (row1 = first half, row2 = remainder)
  const row1Count = Math.ceil(n / 2);
  const row2Count = n - row1Count;
  const xs = (count: number) => Array.from({ length: count }, (_, i) => ((i + 1) * W) / (count + 1));
  const r1Xs = xs(row1Count);
  const r2Xs = xs(row2Count);
  const Y1 = 16;
  const Y2 = 48;
  const NODE_R = 5;

  // Edges: every row1 → every row2 (bipartite). Also chain horizontally inside row1.
  const edges: Array<[number, number, number, number]> = [];
  for (const x1 of r1Xs) {
    for (const x2 of r2Xs) edges.push([x1, Y1, x2, Y2]);
  }
  if (seed === 1 && r1Xs.length > 1) {
    // sequential variant — chain row1
    for (let i = 0; i < r1Xs.length - 1; i++) edges.push([r1Xs[i], Y1, r1Xs[i + 1], Y1]);
  }

  return (
    <div
      className="hf-dotgrid"
      aria-hidden
      style={{
        height: 80,
        borderRadius: 6,
        border: '1px dashed var(--t-border)',
        padding: 8,
        marginBottom: 10,
        background: 'var(--t-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edges first so nodes draw on top */}
        {edges.map(([x1, y1, x2, y2], i) => (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
            fill="none"
            stroke="var(--t-fg-5)"
            strokeWidth={1}
            strokeDasharray={seed === 2 ? '3 3' : undefined}
            opacity={0.7}
          />
        ))}
        {/* Row 1 nodes */}
        {r1Xs.map((x, i) => (
          <circle
            key={`r1-${i}`}
            cx={x}
            cy={Y1}
            r={NODE_R}
            fill="var(--t-accent-tint)"
            stroke="var(--t-accent)"
            strokeWidth={1.4}
          />
        ))}
        {/* Row 2 nodes */}
        {r2Xs.map((x, i) => (
          <circle
            key={`r2-${i}`}
            cx={x}
            cy={Y2}
            r={NODE_R}
            fill="var(--t-panel-2)"
            stroke="var(--t-border-2, var(--t-border))"
            strokeWidth={1.2}
          />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Favorites — localStorage so it survives reloads
// ---------------------------------------------------------------------------

const FAV_KEY = 'shadowflow.template_favs.v1';

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavs(s: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore quota */
  }
}
