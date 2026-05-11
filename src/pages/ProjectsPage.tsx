/**
 * ProjectsPage — Story 15.24
 *
 * Three-column layout for `/projects`:
 *   - Column 1 (280px) ProjectListPanel: list + create + delete
 *   - Column 2 (320px) ConversationHistoryPanel: per-project conversation list
 *   - Column 3 (1fr)   Project meta panel (rename inline + workspace_path
 *                      + skill_id + created_at / updated_at)
 *
 * The selected project id is persisted in `localStorage.sf.lastProject` so
 * that:
 *   - Reloading `/projects` defaults back to the last project
 *   - PreparationPanel on `/run-session` reads the same key for cross-page
 *     project context
 */

import React, { useEffect, useState } from 'react';
import { ProjectListPanel } from '../components/ProjectListPanel';
import { ConversationHistoryPanel } from '../components/ConversationHistoryPanel';
import {
  getProject,
  updateProject,
  type ProjectRecord,
} from '../api/projects';
import { useI18n } from '../common/i18n';

const PAGE_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px 320px 1fr',
  height: '100%',
  minHeight: 0,
  background: 'var(--t-bg)',
  color: 'var(--t-fg)',
};

const META_STYLE: React.CSSProperties = {
  padding: '24px 28px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const META_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--t-fg-4)',
};

const META_VALUE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--t-fg)',
  fontFamily: 'var(--font-mono)',
  wordBreak: 'break-all',
};

const NAME_INPUT: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  color: 'var(--t-fg)',
  padding: '4px 8px',
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
};

const EMPTY_BLOCK: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--t-fg-4)',
  fontSize: 13,
  textAlign: 'center',
  padding: 24,
  lineHeight: 1.6,
};

function readInitialId(): string | null {
  try {
    return localStorage.getItem('sf.lastProject');
  } catch {
    return null;
  }
}

export default function ProjectsPage() {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(readInitialId);
  const [meta, setMeta] = useState<ProjectRecord | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    getProject(selectedId)
      .then((p) => {
        if (!cancelled) {
          setMeta(p);
          setDraftName(p.name);
          setError(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Project missing — likely deleted in another tab. Fall back to none.
        try {
          localStorage.removeItem('sf.lastProject');
        } catch {
          // ignore
        }
        setSelectedId(null);
        setMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function commitRename() {
    if (!meta) return;
    const next = draftName.trim();
    setRenaming(false);
    if (next.length === 0 || next === meta.name) {
      setDraftName(meta.name);
      return;
    }
    try {
      const updated = await updateProject(meta.project_id, { name: next });
      setMeta(updated);
      setDraftName(updated.name);
      setError(null);
    } catch (e) {
      setDraftName(meta.name); // rollback optimistic UI
      setError(e instanceof Error ? e.message : 'rename failed');
    }
  }

  return (
    <div style={PAGE_STYLE} data-testid="projects-page">
      <ProjectListPanel
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDeleted={() => {
          setMeta(null);
          setSelectedId(null);
        }}
        onCreated={(p) => {
          setMeta(p);
          setDraftName(p.name);
        }}
        updatedProject={meta}
      />
      {meta ? (
        <ConversationHistoryPanel projectId={meta.project_id} />
      ) : (
        <div style={{ borderRight: '1px solid var(--t-border)' }} />
      )}
      <div style={META_STYLE}>
        {meta ? (
          <>
            {renaming ? (
              <input
                type="text"
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setDraftName(meta.name);
                    setRenaming(false);
                  }
                }}
                style={{ ...NAME_INPUT, border: '1px solid var(--t-border)' }}
                data-testid="project-meta-name-input"
              />
            ) : (
              <h1
                onClick={() => setRenaming(true)}
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  cursor: 'text',
                  padding: '4px 8px',
                  borderRadius: 6,
                }}
                title={t('projects.renameHint')}
                data-testid="project-meta-name"
              >
                {meta.name}
              </h1>
            )}
            {error && (
              <div role="alert" style={{ fontSize: 11, color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <div>
              <div style={META_LABEL}>{t('projects.workspacePath')}</div>
              <div style={META_VALUE} data-testid="project-meta-path">
                {meta.workspace_path && meta.workspace_path.length > 0
                  ? meta.workspace_path
                  : '—'}
              </div>
            </div>

            <div>
              <div style={META_LABEL}>{t('projects.defaultSkill')}</div>
              <div style={META_VALUE}>{meta.skill_id ?? '—'}</div>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={META_LABEL}>{t('projects.createdAt')}</div>
                <div style={META_VALUE}>
                  {(() => {
                    try {
                      return new Date(meta.created_at).toLocaleString();
                    } catch {
                      return meta.created_at;
                    }
                  })()}
                </div>
              </div>
              <div>
                <div style={META_LABEL}>{t('projects.updatedAt')}</div>
                <div style={META_VALUE}>
                  {(() => {
                    try {
                      return new Date(meta.updated_at).toLocaleString();
                    } catch {
                      return meta.updated_at;
                    }
                  })()}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={EMPTY_BLOCK} data-testid="projects-page-empty-meta">
            {t('projects.selectHint')}
          </div>
        )}
      </div>
    </div>
  );
}
