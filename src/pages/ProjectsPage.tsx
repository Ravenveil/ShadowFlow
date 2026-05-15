/**
 * ProjectsPage — v2
 *
 * Layout (per design spec projects-v2.html):
 *   Left 240px sidebar: projects grouped by team, collapsible headers,
 *   relative timestamps, dashed "New project" button.
 *
 *   Right panel:
 *     ├── Panel header (inline rename, team tag, workspace path + copy, timestamp)
 *     ├── Artifact toolbar (count · filter chips · sort popover · view toggle)
 *     └── Artifacts area (grid or list) — data from GET /api/projects/:id/artifacts
 *
 * Token mapping (design → code):
 *   var(--bg) → var(--t-bg), var(--skin-panel) → var(--t-panel),
 *   var(--accent) → var(--t-accent), var(--border) → var(--t-border),
 *   var(--fg-1..5) → var(--t-fg / t-fg-2 / t-fg-3 / t-fg-4 / t-fg-5)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Copy,
  Check,
  Eye,
  Download,
  Layers,
  Search,
  LayoutGrid,
  List,
  X,
  ArrowRight,
} from 'lucide-react';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listProjectArtifacts,
  type ProjectRecord,
  type CreateProjectInput,
  type ArtifactRecord,
} from '../api/projects';
import { listSkills, type SkillInfo } from '../api/skills';
import { useI18n } from '../common/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'newest' | 'oldest' | 'nameAZ' | 'sizeDesc';
type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'html' | 'md' | 'yaml' | 'pdf';

interface ProjectGroup {
  team_id: string | null;
  team_name: string;
  projects: ProjectRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/** Group a flat project list by team_id. Projects with no team go under null. */
function groupByTeam(projects: ProjectRecord[]): ProjectGroup[] {
  const map = new Map<string | null, ProjectRecord[]>();
  for (const p of projects) {
    // team_id is not in the current API contract — stub as null
    const key = null as string | null;
    const existing = map.get(key) ?? [];
    existing.push(p);
    map.set(key, existing);
  }
  const groups: ProjectGroup[] = [];
  map.forEach((projs, teamId) => {
    groups.push({
      team_id: teamId,
      team_name: teamId ?? 'No Team',
      projects: projs,
    });
  });
  return groups;
}

const BADGE_STYLES: Record<string, React.CSSProperties> = {
  html: {
    background: 'rgba(37,99,235,.12)',
    border: '1px solid rgba(37,99,235,.22)',
    color: '#2563EB',
  },
  md: {
    background: 'rgba(5,150,105,.12)',
    border: '1px solid rgba(5,150,105,.22)',
    color: '#059669',
  },
  yaml: {
    background: 'rgba(217,119,6,.12)',
    border: '1px solid rgba(217,119,6,.22)',
    color: '#D97706',
  },
  pdf: {
    background: 'rgba(220,38,38,.12)',
    border: '1px solid rgba(220,38,38,.22)',
    color: '#DC2626',
  },
};

const THUMB_GRADIENT: Record<string, string> = {
  html: 'linear-gradient(135deg, rgba(37,99,235,.10) 0%, rgba(37,99,235,.04) 100%)',
  md:   'linear-gradient(135deg, rgba(5,150,105,.10)  0%, rgba(5,150,105,.04) 100%)',
  yaml: 'linear-gradient(135deg, rgba(217,119,6,.10)  0%, rgba(217,119,6,.04) 100%)',
  pdf:  'linear-gradient(135deg, rgba(220,38,38,.10)  0%, rgba(220,38,38,.04) 100%)',
};

const THUMB_BORDER: Record<string, string> = {
  html: 'rgba(37,99,235,.14)',
  md:   'rgba(5,150,105,.14)',
  yaml: 'rgba(217,119,6,.14)',
  pdf:  'rgba(220,38,38,.14)',
};
const THUMB_COLOR: Record<string, string> = {
  html: '#2563EB',
  md:   '#059669',
  yaml: '#D97706',
  pdf:  '#DC2626',
};

function thumbGradient(fileType: string): string {
  return THUMB_GRADIENT[fileType.toLowerCase()] ?? 'linear-gradient(135deg, rgba(161,161,170,.08) 0%, rgba(113,113,122,.04) 100%)';
}
function thumbBorder(fileType: string): string {
  return THUMB_BORDER[fileType.toLowerCase()] ?? 'rgba(161,161,170,.14)';
}
function thumbColor(fileType: string): string {
  return THUMB_COLOR[fileType.toLowerCase()] ?? '#71717A';
}

function badgeStyle(fileType: string): React.CSSProperties {
  return BADGE_STYLES[fileType.toLowerCase()] ?? {
    background: 'rgba(161,161,170,.12)',
    border: '1px solid rgba(161,161,170,.3)',
    color: 'var(--t-fg-3)',
  };
}

function readInitialId(): string | null {
  try {
    return localStorage.getItem('sf.lastProject');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PathCell({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => {});
  }
  const display = path.length > 52 ? '…' + path.slice(-52) : path;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <FolderOpen
        size={12}
        strokeWidth={1.75}
        aria-hidden
        style={{ color: 'var(--t-fg-4)', flexShrink: 0 }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--t-fg-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={path}
      >
        {display}
      </span>
      <button
        type="button"
        onClick={copy}
        title="Copy path"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          border: '1px solid var(--t-border)',
          background: 'transparent',
          borderRadius: 5,
          cursor: 'pointer',
          color: copied ? 'var(--t-ok)' : 'var(--t-fg-4)',
          flexShrink: 0,
          padding: 0,
        }}
      >
        {copied ? (
          <Check size={10} strokeWidth={2.5} aria-hidden />
        ) : (
          <Copy size={10} strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  projects: ProjectRecord[];
  selectedId: string | null;
  onSelect: (pid: string) => void;
  onNewProject: () => void;
}

function Sidebar({ projects, selectedId, onSelect, onNewProject }: SidebarProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : projects;
  const groups = groupByTeam(filtered);
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set());

  function toggleGroup(key: string | null) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function closeSearch() {
    setQuery('');
    setSearchOpen(false);
  }

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--t-panel)',
        borderRight: '1px solid var(--t-border)',
        overflow: 'hidden',
      }}
      data-testid="projects-sidebar"
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 12px 10px',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          gap: 6,
        }}
      >
        {searchOpen ? (
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('projects.sidebarSearch')}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            style={{
              flex: 1,
              background: 'var(--t-bg)',
              border: '1px solid var(--t-border)',
              borderRadius: 5,
              color: 'var(--t-fg)',
              fontSize: 11,
              padding: '4px 8px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--t-fg-4)',
              flex: 1,
            }}
          >
            {t('projects.title')}
          </span>
        )}
        <button
          type="button"
          onClick={searchOpen ? closeSearch : openSearch}
          title={searchOpen ? 'Clear search' : 'Search projects'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: '1px solid var(--t-border)',
            background: searchOpen ? 'var(--t-accent-tint)' : 'transparent',
            borderRadius: 5,
            cursor: 'pointer',
            color: searchOpen ? 'var(--t-accent)' : 'var(--t-fg-4)',
            flexShrink: 0,
            padding: 0,
          }}
        >
          {searchOpen ? <X size={11} strokeWidth={2} aria-hidden /> : <Search size={11} strokeWidth={2} aria-hidden />}
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 0' }}>
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.team_id);
          const groupKey = group.team_id ?? '__no_team__';
          return (
            <div key={groupKey} style={{ marginBottom: 4 }}>
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.team_id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  width: '100%',
                  padding: '5px 8px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--t-fg-4)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  textAlign: 'left',
                  borderRadius: 5,
                }}
                aria-expanded={!isCollapsed}
                data-testid={`projects-group-${groupKey}`}
              >
                {isCollapsed ? (
                  <ChevronRight size={11} strokeWidth={2} aria-hidden />
                ) : (
                  <ChevronDown size={11} strokeWidth={2} aria-hidden />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.team_name}
                </span>
                <span style={{ opacity: 0.5 }}>{group.projects.length}</span>
              </button>

              {/* Project rows */}
              {!isCollapsed &&
                group.projects.map((p) => {
                  const active = p.project_id === selectedId;
                  return (
                    <button
                      key={p.project_id}
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.setItem('sf.lastProject', p.project_id);
                        } catch {
                          // ignore
                        }
                        onSelect(p.project_id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        width: '100%',
                        padding: '7px 8px 7px 24px',
                        background: active ? 'var(--t-accent-tint)' : 'transparent',
                        border: '1px solid transparent',
                        borderColor: active ? 'rgba(168,85,247,.2)' : 'transparent',
                        cursor: 'pointer',
                        borderRadius: 6,
                        marginBottom: 1,
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                      data-testid={`project-row-${p.project_id}`}
                    >
                      <Folder
                        size={13}
                        strokeWidth={1.75}
                        aria-hidden
                        style={{
                          color: active ? 'var(--t-accent)' : 'var(--t-fg-4)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 12,
                          fontWeight: active ? 600 : 500,
                          color: active ? 'var(--t-fg)' : 'var(--t-fg-2)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--t-fg-5)',
                          flexShrink: 0,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {relativeTime(p.updated_at)}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>

      {/* New project dashed button */}
      <div style={{ padding: '10px 6px 14px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onNewProject}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '8px 12px',
            background: 'transparent',
            border: '1px dashed var(--t-border)',
            borderRadius: 7,
            cursor: 'pointer',
            color: 'var(--t-fg-4)',
            fontSize: 12,
            fontFamily: 'inherit',
            fontWeight: 500,
            transition: 'border-color 120ms ease, color 120ms ease',
          }}
          data-testid="projects-new-btn"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-fg-2)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-border-2)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-fg-4)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--t-border)';
          }}
        >
          <Plus size={13} strokeWidth={2} aria-hidden />
          New project
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artifact card
// ---------------------------------------------------------------------------

function ArtifactCard({ artifact, index = 0 }: { artifact: ArtifactRecord; index?: number }) {
  const [hover, setHover] = useState(false);
  const { t } = useI18n();
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--t-panel)',
        border: '1px solid var(--t-border)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        cursor: 'pointer',
        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
        borderColor: hover ? 'var(--t-border-2, var(--t-border))' : 'var(--t-border)',
        boxShadow: hover ? '0 4px 16px -4px rgba(0,0,0,.18)' : 'none',
        transform: hover ? 'translateY(-1px)' : 'none',
        animation: `pj-card-in 240ms ease both`,
        animationDelay: `${index * 32}ms`,
      }}
      data-testid={`artifact-card-${artifact.artifact_id}`}
    >
      {/* Thumbnail strip */}
      <div
        aria-hidden
        style={{
          height: 42,
          flexShrink: 0,
          background: thumbGradient(artifact.file_type),
          borderBottom: `1px solid ${thumbBorder(artifact.file_type)}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            opacity: 0.55,
            color: thumbColor(artifact.file_type),
          }}
        >
          {artifact.file_type.toUpperCase()}
        </span>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 8,
            fontSize: 44,
            fontWeight: 900,
            lineHeight: 1,
            opacity: 0.05,
            letterSpacing: '-.04em',
            fontFamily: 'var(--font-mono)',
            top: '50%',
            transform: 'translateY(-50%)',
            userSelect: 'none',
            pointerEvents: 'none',
            color: thumbColor(artifact.file_type),
          }}
        >
          {artifact.file_type.toUpperCase()}
        </span>
      </div>

      {/* Card body */}
      <div style={{ padding: '11px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              padding: '3px 7px',
              borderRadius: 6,
              flexShrink: 0,
              ...badgeStyle(artifact.file_type),
            }}
          >
            {artifact.file_type.toUpperCase()}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--t-fg)',
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              flex: 1,
            }}
          >
            {artifact.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-4)', flex: 1 }}>
            {relativeTime(artifact.generated_at)}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, var(--t-panel) 58%, transparent)',
          padding: '28px 14px 12px',
          display: 'flex',
          gap: 7,
          opacity: hover ? 1 : 0,
          transform: hover ? 'translateY(0)' : 'translateY(5px)',
          transition: 'opacity 150ms ease, transform 150ms ease',
          pointerEvents: hover ? 'auto' : 'none',
        }}
      >
        {artifact.preview_url && (
          <a
            href={artifact.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              height: 28, padding: '0 12px', borderRadius: 6,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--t-border-2, var(--t-border))',
              background: 'var(--t-bg)', color: 'var(--t-fg-2)',
              display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none',
            }}
            data-testid={`artifact-preview-${artifact.artifact_id}`}
          >
            <Eye size={12} strokeWidth={2} aria-hidden />
            {t('projects.artifactPreview')}
          </a>
        )}
        {artifact.download_url && (
          <a
            href={artifact.download_url}
            download
            style={{
              height: 28, padding: '0 12px', borderRadius: 6,
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--t-border-2, var(--t-border))',
              background: 'var(--t-bg)', color: 'var(--t-fg-2)',
              display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none',
            }}
            data-testid={`artifact-download-${artifact.artifact_id}`}
          >
            <Download size={12} strokeWidth={2} aria-hidden />
            {t('projects.artifactDownload')}
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel (right column)
// ---------------------------------------------------------------------------

const MODAL_BACKDROP: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const MODAL_CARD: React.CSSProperties = {
  background: 'var(--t-panel)',
  border: '1px solid var(--t-border)',
  borderRadius: 12,
  padding: 20,
  width: 380,
  maxWidth: '92vw',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--t-fg-3)',
  marginBottom: 4,
  fontWeight: 500,
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  color: 'var(--t-fg)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

interface PanelProps {
  meta: ProjectRecord;
  onRename: (next: string) => void;
}

function Panel({ meta, onRename }: PanelProps) {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(meta.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [artLoading, setArtLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<ViewMode>('grid');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!renaming) setDraftName(meta.name);
  }, [meta.name, renaming]);

  useEffect(() => {
    let cancelled = false;
    setArtLoading(true);
    setArtifacts([]);
    listProjectArtifacts(meta.project_id)
      .then((list) => { if (!cancelled) setArtifacts(list); })
      .catch(() => { if (!cancelled) setArtifacts([]); })
      .finally(() => { if (!cancelled) setArtLoading(false); });
    return () => { cancelled = true; };
  }, [meta.project_id]);

  useEffect(() => {
    if (!sortOpen) return;
    function handleOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [sortOpen]);

  function commitRename() {
    const next = draftName.trim();
    setRenaming(false);
    if (next.length === 0) { setDraftName(meta.name); return; }
    if (next !== meta.name) onRename(next);
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'newest',   label: t('projects.sortNewest') },
    { key: 'oldest',   label: t('projects.sortOldest') },
    { key: 'nameAZ',   label: t('projects.sortNameAZ') },
    { key: 'sizeDesc', label: t('projects.sortSizeDesc') },
  ];

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: 'all',  label: t('projects.filterAll') },
    { key: 'html', label: 'HTML' },
    { key: 'md',   label: 'MD' },
    { key: 'yaml', label: 'YAML' },
    { key: 'pdf',  label: 'PDF' },
  ];

  const visible = artifacts
    .filter((a) => filter === 'all' || a.file_type.toLowerCase() === filter)
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();
      if (sort === 'oldest') return new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime();
      if (sort === 'nameAZ') return a.title.localeCompare(b.title);
      return 0;
    });

  const currentSortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? '';

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--t-bg)',
        overflow: 'hidden',
      }}
      data-testid="projects-panel"
    >
      {/* ── Panel header ── */}
      <div
        style={{
          padding: '20px 28px 0',
          borderBottom: '1px solid var(--t-border)',
          background: 'var(--t-panel)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {renaming ? (
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setDraftName(meta.name); setRenaming(false); }
                }}
                style={{
                  fontSize: 20, fontWeight: 700,
                  background: 'var(--t-bg)', border: '1px solid var(--t-accent)',
                  borderRadius: 5, color: 'var(--t-fg)', padding: '2px 6px',
                  outline: 'none', fontFamily: 'inherit', minWidth: 180,
                  letterSpacing: '-.02em',
                }}
                data-testid="project-meta-name-input"
              />
            ) : (
              <h1
                onClick={() => setRenaming(true)}
                style={{
                  margin: 0, fontSize: 20, fontWeight: 700, cursor: 'text',
                  color: 'var(--t-fg)', padding: '2px 6px', marginLeft: -6,
                  borderRadius: 5, lineHeight: 1.3, letterSpacing: '-.02em',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                title={t('projects.renameHint')}
                data-testid="project-meta-name"
              >
                {meta.name}
              </h1>
            )}
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'var(--t-accent-tint)',
                border: '1px solid rgba(168,85,247,.25)',
                color: 'var(--t-accent)',
              }}
            >
              {t('projects.noTeam')}
            </span>
          </div>
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--t-fg-4)', flexShrink: 0, paddingTop: 4,
          }}>
            {relativeTime(meta.updated_at)}
          </span>
        </div>

        {meta.workspace_path && meta.workspace_path.length > 0 && (
          <div style={{ paddingBottom: 14 }}>
            <PathCell path={meta.workspace_path} />
          </div>
        )}
      </div>

      {/* ── Artifact toolbar ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 28px', flexShrink: 0,
          borderBottom: '1px solid var(--t-border)',
          background: 'var(--t-panel)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg-3)', flex: 1, whiteSpace: 'nowrap' }}>
          <strong style={{ color: 'var(--t-fg)' }}>{artifacts.length}</strong>
          {t('projects.artifactCountUnit')}
        </span>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 5, letterSpacing: '.04em', cursor: 'pointer',
                  border: active ? '1px solid var(--t-accent)' : '1px solid var(--t-border)',
                  background: active ? 'var(--t-accent-tint)' : 'var(--t-bg)',
                  color: active ? 'var(--t-accent)' : 'var(--t-fg-4)',
                  transition: 'all 100ms ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Sort popover */}
        <div ref={sortRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, height: 26,
              padding: '0 8px 0 10px', borderRadius: 5,
              border: '1px solid var(--t-border)',
              background: 'var(--t-bg)',
              color: 'var(--t-fg-3)',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
              letterSpacing: '.04em', cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 100ms ease',
            }}
          >
            {currentSortLabel}
            <ChevronDown
              size={12} strokeWidth={2} aria-hidden
              style={{ transition: 'transform 150ms ease', transform: sortOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          {sortOpen && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)',
                padding: 4, minWidth: 152, zIndex: 100, display: 'flex', flexDirection: 'column',
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => { setSort(o.key); setSortOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 5, cursor: 'pointer', fontSize: 12,
                    fontWeight: o.key === sort ? 600 : 500,
                    color: o.key === sort ? 'var(--t-accent)' : 'var(--t-fg-2)',
                    background: 'transparent', border: 'none', fontFamily: 'inherit',
                    textAlign: 'left', width: '100%', whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {o.key === sort && <Check size={13} strokeWidth={2.5} aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div style={{
          display: 'flex', gap: 2, border: '1px solid var(--t-border)',
          borderRadius: 6, padding: 2, background: 'var(--t-bg)', flexShrink: 0,
        }}>
          {([['grid', LayoutGrid], ['list', List]] as const).map(([mode, Icon]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              title={t(mode === 'grid' ? 'projects.viewGrid' : 'projects.viewList')}
              style={{
                width: 24, height: 22, borderRadius: 4, border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                background: view === mode ? 'var(--t-panel)' : 'transparent',
                color: view === mode ? 'var(--t-fg)' : 'var(--t-fg-4)',
                boxShadow: view === mode ? '0 1px 3px rgba(0,0,0,.07)' : 'none',
                transition: 'all 100ms ease',
              }}
            >
              <Icon size={13} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      </div>

      {/* ── Artifacts area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 28px' }}>
        {artLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--t-fg-4)', fontSize: 12 }}>
            Loading…
          </div>
        ) : artifacts.length === 0 ? (
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 12, padding: '80px 40px', textAlign: 'center',
            }}
            data-testid="artifacts-empty"
          >
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: 'var(--t-panel)', border: '1px solid var(--t-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--t-fg-4)', marginBottom: 4,
            }}>
              <Layers size={26} strokeWidth={1.25} aria-hidden />
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--t-fg-2)' }}>
              {t('projects.artifactsEmpty')}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t-fg-4)', maxWidth: 320, lineHeight: 1.6 }}>
              {t('projects.artifactsEmptyDesc')}
            </p>
            <a
              href="/chat"
              style={{
                fontSize: 13, fontWeight: 600, color: 'var(--t-accent)',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4,
              }}
              data-testid="artifacts-empty-cta"
            >
              {t('projects.artifactsEmptyCta')}
              <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
            </a>
          </div>
        ) : visible.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--t-fg-4)', fontSize: 12 }}>
            {t('projects.filterNoResults')}
          </div>
        ) : view === 'grid' ? (
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 14 }}
            data-testid="artifacts-grid"
          >
            {visible.map((a, i) => (
              <ArtifactCard key={a.artifact_id} artifact={a} index={i} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="artifacts-list">
            {visible.map((a) => (
              <div
                key={a.artifact_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--t-panel)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ ...badgeStyle(a.file_type), fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 6, flexShrink: 0 }}>
                  {a.file_type.toUpperCase()}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t-fg)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-4)', flexShrink: 0, minWidth: 82, textAlign: 'right' }}>
                  {relativeTime(a.generated_at)}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {a.preview_url && (
                    <a href={a.preview_url} target="_blank" rel="noopener noreferrer"
                      style={{ height: 24, padding: '0 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid var(--t-border)', background: 'var(--t-bg)', color: 'var(--t-fg-3)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <Eye size={11} strokeWidth={2} aria-hidden />
                      {t('projects.artifactPreview')}
                    </a>
                  )}
                  {a.download_url && (
                    <a href={a.download_url} download
                      style={{ height: 24, padding: '0 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: '1px solid var(--t-border)', background: 'var(--t-bg)', color: 'var(--t-fg-3)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <Download size={11} strokeWidth={2} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create project modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void;
  onCreate: (p: ProjectRecord) => void;
}

function CreateModal({ onClose, onCreate }: CreateModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [skillId, setSkillId] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSkills().then(setSkills).catch(() => undefined);
  }, []);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= 80;

  async function handleCreate() {
    if (!nameValid) return;
    setCreating(true);
    setError(null);
    try {
      const input: CreateProjectInput = { name: trimmedName };
      if (path.trim().length > 0) input.workspace_path = path.trim();
      if (skillId.length > 0) input.skill_id = skillId;
      const created = await createProject(input);
      try {
        localStorage.setItem('sf.lastProject', created.project_id);
      } catch {
        // ignore
      }
      onCreate(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      style={MODAL_BACKDROP}
      onClick={() => !creating && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={MODAL_CARD}
        data-testid="project-create-modal"
      >
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--t-fg)' }}>
          {t('projects.newProject')}
        </h3>

        <div>
          <div style={FIELD_LABEL}>{t('projects.fieldName')}</div>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
            style={INPUT_STYLE}
            disabled={creating}
            data-testid="project-create-name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nameValid && !creating) handleCreate();
              if (e.key === 'Escape') onClose();
            }}
          />
          {!nameValid && name.length > 0 && (
            <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 4 }}>
              {t('projects.nameError')}
            </div>
          )}
        </div>

        <div>
          <div style={FIELD_LABEL}>{t('projects.workspacePath')}</div>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/me/projects/my-project"
            style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }}
            disabled={creating}
            data-testid="project-create-path"
          />
        </div>

        <div>
          <div style={FIELD_LABEL}>{t('projects.defaultSkill')}</div>
          <select
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            style={INPUT_STYLE}
            disabled={creating}
            data-testid="project-create-skill"
          >
            <option value="">{t('projects.defaultSkillNone')}</option>
            {skills.map((s) => (
              <option key={s.skill_id} value={s.skill_id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 11, color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--t-border)',
              background: 'transparent',
              color: 'var(--t-fg-3)',
              fontSize: 12,
              cursor: creating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!nameValid || creating}
            data-testid="project-create-submit"
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid rgba(124,58,237,0.45)',
              background: 'var(--t-accent)',
              color: 'var(--t-accent-ink)',
              fontSize: 12,
              fontWeight: 600,
              cursor: !nameValid || creating ? 'not-allowed' : 'pointer',
              opacity: !nameValid || creating ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {creating ? t('common.loading') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------

interface DeleteModalProps {
  target: ProjectRecord;
  onClose: () => void;
  onDeleted: (pid: string) => void;
}

function DeleteModal({ target, onClose, onDeleted }: DeleteModalProps) {
  const { t } = useI18n();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== target.name) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProject(target.project_id);
      onDeleted(target.project_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={MODAL_BACKDROP} onClick={() => !deleting && onClose()}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={MODAL_CARD}
        data-testid="project-delete-modal"
      >
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--t-fg)' }}>
          {t('projects.deleteTitle')}
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-fg-3)', lineHeight: 1.5 }}>
          {t('projects.deleteConfirm', { name: target.name })}
        </p>
        <div>
          <div style={FIELD_LABEL}>{t('projects.deleteRetypePrompt')}</div>
          <input
            type="text"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={target.name}
            style={INPUT_STYLE}
            disabled={deleting}
            data-testid="project-delete-confirm-input"
          />
        </div>
        {error && (
          <div role="alert" style={{ fontSize: 11, color: '#fca5a5' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--t-border)',
              background: 'transparent',
              color: 'var(--t-fg-3)',
              fontSize: 12,
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || confirmText !== target.name}
            data-testid="project-delete-submit"
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.45)',
              background: '#ef4444',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: deleting || confirmText !== target.name ? 'not-allowed' : 'pointer',
              opacity: deleting || confirmText !== target.name ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {deleting ? t('common.loading') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-right-pane state
// ---------------------------------------------------------------------------

function EmptyPane() {
  const { t } = useI18n();
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 10,
        color: 'var(--t-fg-4)',
        textAlign: 'center',
        padding: 24,
      }}
      data-testid="projects-page-empty-meta"
    >
      <Folder size={36} strokeWidth={1.25} aria-hidden style={{ opacity: 0.3 }} />
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, maxWidth: 260 }}>
        {t('projects.selectHint')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(readInitialId);
  const [meta, setMeta] = useState<ProjectRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    getProject(selectedId)
      .then((p) => {
        if (!cancelled) setMeta(p);
      })
      .catch(() => {
        if (!cancelled) {
          try {
            localStorage.removeItem('sf.lastProject');
          } catch {
            // ignore
          }
          setSelectedId(null);
          setMeta(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function handleSelect(pid: string) {
    setSelectedId(pid);
    try {
      localStorage.setItem('sf.lastProject', pid);
    } catch {
      // ignore
    }
  }

  async function handleRename(next: string) {
    if (!meta) return;
    try {
      const updated = await updateProject(meta.project_id, { name: next });
      setMeta(updated);
      setProjects((prev) =>
        prev.map((p) => (p.project_id === updated.project_id ? updated : p)),
      );
    } catch {
      // rollback: re-fetch
      try {
        const fresh = await getProject(meta.project_id);
        setMeta(fresh);
      } catch {
        // ignore
      }
    }
  }

  function handleCreated(p: ProjectRecord) {
    setProjects((prev) => [p, ...prev]);
    setSelectedId(p.project_id);
    setMeta(p);
    setShowCreate(false);
  }

  function handleDeleted(pid: string) {
    setProjects((prev) => prev.filter((p) => p.project_id !== pid));
    if (selectedId === pid) {
      setSelectedId(null);
      setMeta(null);
    }
    setDeleteTarget(null);
    try {
      localStorage.removeItem('sf.lastProject');
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--t-fg-4)',
          fontSize: 13,
        }}
        data-testid="projects-page"
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
        overflow: 'hidden',
      }}
      data-testid="projects-page"
    >
      <Sidebar
        projects={projects}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNewProject={() => setShowCreate(true)}
      />

      {meta ? (
        <Panel
          meta={meta}
          onRename={handleRename}
        />
      ) : (
        <EmptyPane />
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
