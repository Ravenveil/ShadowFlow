/**
 * ProjectsPane — 「项目」的第二栏：这页要选的是**哪个项目**。
 *
 * 与正文共用 projectsStore 的同一份快照：改名、删会话之后两边不会分叉。
 */
import { useEffect } from 'react';
import { PANE, PROJECTS } from '@/shared/content/views';
import { projectKey, projectsStore } from '@/business/projects/projects';

export function ProjectsPane({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (key: string) => void;
}) {
  const { items: projects, state } = projectsStore.useList();

  useEffect(() => {
    void projectsStore.load();
  }, []);

  useEffect(() => {
    if (selected) return;
    const key = projects[0] ? projectKey(projects[0]) : '';
    if (key) onPick(key);
  }, [selected, projects, onPick]);

  return (
    <aside className="pane" aria-label={PANE.projects}>
      <div className="pane-scroll">
        {state === 'loading' && !projects.length ? (
          <div className="pane-state">{PANE.loading}</div>
        ) : null}
        {state === 'error' ? <div className="pane-state">{PANE.loadFailed}</div> : null}

        {projects.map((project) => {
          const key = projectKey(project);
          const count = project.sessions?.length ?? 0;
          return (
            <button
              key={key}
              type="button"
              className="pane-row"
              data-active={key === selected ? 'true' : undefined}
              aria-pressed={key === selected}
              onClick={() => onPick(key)}
            >
              <span className="pane-row-text">
                <strong>{project.name}</strong>
                <small>{PROJECTS.sessions(count)}</small>
              </span>
            </button>
          );
        })}

        {state === 'ready' && !projects.length ? (
          <div className="pane-state">{PANE.emptyProjects}</div>
        ) : null}
      </div>
    </aside>
  );
}
