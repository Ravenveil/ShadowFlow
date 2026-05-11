/**
 * ProjectListPanel — Story 15.24
 *
 * Left rail of the `/projects` page. Lists every Project (newest first) and
 * exposes:
 *   - "+ New project" button → modal with name / workspace_path / default skill
 *   - row click → onSelect(pid) + writes localStorage `sf.lastProject`
 *   - per-row Trash button → confirm modal that requires retyping the project
 *     name as a second-confirmation guard before issuing DELETE.
 *
 * Lucide-react icons only (CLAUDE.md global rule — no system emoji icons).
 *
 * The panel is intentionally self-contained: it manages its own list state
 * and exposes `selectedId` + `onSelect` so ProjectsPage can mirror selection
 * into the right-pane components.
 */

import React, { useEffect, useState } from 'react';
import { Folder, Plus, Trash2 } from 'lucide-react';
import {
  listProjects,
  createProject,
  deleteProject,
  type ProjectRecord,
  type CreateProjectInput,
} from '../api/projects';
import { listSkills, type SkillInfo } from '../api/skills';
import { useI18n } from '../common/i18n';

export interface ProjectListPanelProps {
  selectedId: string | null;
  /** Called whenever a row is clicked. Parent owns localStorage write. */
  onSelect: (pid: string) => void;
  /** Called when the active project is deleted, so the parent can clear meta. */
  onDeleted?: (pid: string) => void;
  /** Called when a new project is created, so the parent can auto-select it. */
  onCreated?: (project: ProjectRecord) => void;
  /**
   * When the parent (ProjectsPage) commits an inline rename / patch on the
   * meta panel, it can pass the updated record here so the row label and the
   * delete-confirm name stay in sync without refetching the whole list.
   */
  updatedProject?: ProjectRecord | null;
}

const PANEL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--t-panel)',
  borderRight: '1px solid var(--t-border)',
  overflow: 'hidden',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 14px 8px',
  borderBottom: '1px solid var(--t-border)',
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  color: 'var(--t-fg-2)',
  textTransform: 'uppercase',
};

const NEW_BTN_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--t-border)',
  background: 'var(--t-bg)',
  color: 'var(--t-fg-2)',
  fontSize: 11,
  cursor: 'pointer',
};

const LIST_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '6px',
};

const EMPTY_STYLE: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  fontSize: 12,
  color: 'var(--t-fg-4)',
  lineHeight: 1.6,
};

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? 'var(--t-accent-tint)' : 'transparent',
    border: '1px solid transparent',
    fontSize: 12,
    color: active ? 'var(--t-fg)' : 'var(--t-fg-2)',
    fontWeight: active ? 600 : 500,
    marginBottom: 2,
  };
}

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

export function ProjectListPanel({
  selectedId,
  onSelect,
  onDeleted,
  onCreated,
  updatedProject,
}: ProjectListPanelProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPath, setCreatePath] = useState('');
  const [createSkill, setCreateSkill] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete-modal state
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  // Sync row label whenever the parent broadcasts a fresh ProjectRecord
  // (e.g. after the meta panel commits an inline rename).
  useEffect(() => {
    if (!updatedProject) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.project_id === updatedProject.project_id ? updatedProject : p,
      ),
    );
  }, [updatedProject]);

  // Lazy-load skills only when the create modal opens (avoids bootstrapping
  // the catalog every time someone enters /projects).
  useEffect(() => {
    if (showCreate && skills.length === 0) {
      listSkills().then(setSkills).catch(() => undefined);
    }
  }, [showCreate, skills.length]);

  const trimmedName = createName.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= 80;

  async function handleCreate() {
    if (!nameValid) return;
    setCreating(true);
    setCreateError(null);
    try {
      const input: CreateProjectInput = { name: trimmedName };
      if (createPath.trim().length > 0) input.workspace_path = createPath.trim();
      if (createSkill.length > 0) input.skill_id = createSkill;
      const created = await createProject(input);
      setProjects((prev) => [created, ...prev]);
      setShowCreate(false);
      setCreateName('');
      setCreatePath('');
      setCreateSkill('');
      try {
        localStorage.setItem('sf.lastProject', created.project_id);
      } catch {
        // ignore quota / unavailable errors
      }
      onSelect(created.project_id);
      onCreated?.(created);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'create failed');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmText !== deleteTarget.name) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.project_id);
      const wasSelected = selectedId === deleteTarget.project_id;
      setProjects((prev) =>
        prev.filter((p) => p.project_id !== deleteTarget.project_id),
      );
      if (wasSelected) {
        onDeleted?.(deleteTarget.project_id);
        try {
          localStorage.removeItem('sf.lastProject');
        } catch {
          // ignore
        }
      }
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={PANEL_STYLE} data-testid="project-list-panel">
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>{t('projects.title')}</span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={NEW_BTN_STYLE}
          data-testid="project-list-new-btn"
        >
          <Plus size={12} strokeWidth={1.75} aria-hidden /> {t('projects.newProject')}
        </button>
      </div>

      <div style={LIST_STYLE}>
        {loading ? (
          <div style={EMPTY_STYLE}>{t('common.loading')}</div>
        ) : error ? (
          <div style={{ ...EMPTY_STYLE, color: '#fca5a5' }} role="alert">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div style={EMPTY_STYLE} data-testid="project-list-empty">
            {t('projects.empty')}
          </div>
        ) : (
          projects.map((p) => {
            const active = p.project_id === selectedId;
            return (
              <div
                key={p.project_id}
                onClick={() => {
                  try {
                    localStorage.setItem('sf.lastProject', p.project_id);
                  } catch {
                    // ignore
                  }
                  onSelect(p.project_id);
                }}
                style={rowStyle(active)}
                data-testid={`project-row-${p.project_id}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(p.project_id);
                  }
                }}
              >
                <Folder
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                  style={{
                    color: active ? 'var(--t-accent)' : 'var(--t-fg-3)',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(p);
                    setDeleteConfirmText('');
                  }}
                  title={t('common.delete')}
                  data-testid={`project-row-delete-${p.project_id}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--t-fg-4)',
                    padding: 4,
                    borderRadius: 4,
                    display: 'inline-flex',
                  }}
                >
                  <Trash2 size={12} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            );
          })
        )}
      </div>

      {showCreate && (
        <div style={MODAL_BACKDROP} onClick={() => !creating && setShowCreate(false)}>
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
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My Project"
                style={INPUT_STYLE}
                disabled={creating}
                data-testid="project-create-name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nameValid && !creating) handleCreate();
                  if (e.key === 'Escape') setShowCreate(false);
                }}
              />
              {!nameValid && createName.length > 0 && (
                <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 4 }}>
                  {t('projects.nameError')}
                </div>
              )}
            </div>

            <div>
              <div style={FIELD_LABEL}>{t('projects.workspacePath')}</div>
              <input
                type="text"
                value={createPath}
                onChange={(e) => setCreatePath(e.target.value)}
                placeholder="/Users/me/projects/my-project"
                style={{ ...INPUT_STYLE, fontFamily: 'var(--font-mono)' }}
                disabled={creating}
                data-testid="project-create-path"
              />
            </div>

            <div>
              <div style={FIELD_LABEL}>{t('projects.defaultSkill')}</div>
              <select
                value={createSkill}
                onChange={(e) => setCreateSkill(e.target.value)}
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

            {createError && (
              <div role="alert" style={{ fontSize: 11, color: '#fca5a5' }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--t-border)',
                  background: 'transparent',
                  color: 'var(--t-fg-3)',
                  fontSize: 12,
                  cursor: creating ? 'not-allowed' : 'pointer',
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
                  background: '#7c3aed',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: !nameValid || creating ? 'not-allowed' : 'pointer',
                  opacity: !nameValid || creating ? 0.6 : 1,
                }}
              >
                {creating ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={MODAL_BACKDROP} onClick={() => !deleting && setDeleteTarget(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={MODAL_CARD}
            data-testid="project-delete-modal"
          >
            <h3 style={{ margin: 0, fontSize: 14, color: 'var(--t-fg)' }}>
              {t('projects.deleteTitle')}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--t-fg-3)', lineHeight: 1.5 }}>
              {t('projects.deleteConfirm', { name: deleteTarget.name })}
            </p>
            <div>
              <div style={FIELD_LABEL}>{t('projects.deleteRetypePrompt')}</div>
              <input
                type="text"
                autoFocus
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget.name}
                style={INPUT_STYLE}
                disabled={deleting}
                data-testid="project-delete-confirm-input"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--t-border)',
                  background: 'transparent',
                  color: 'var(--t-fg-3)',
                  fontSize: 12,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={
                  deleting || deleteConfirmText !== deleteTarget.name
                }
                data-testid="project-delete-submit"
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid rgba(239,68,68,0.45)',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor:
                    deleting || deleteConfirmText !== deleteTarget.name
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    deleting || deleteConfirmText !== deleteTarget.name
                      ? 0.6
                      : 1,
                }}
              >
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectListPanel;
