/**
 * ProjectsView — 项目（工作台子页）。
 *
 * 选哪个项目由第二栏（ProjectsPane）决定：正文上半是该项目的会话
 * （点一条回对话页打开），下半是该项目的文件（workspace_path 直读）。
 * 项目在这里 = 会话分组 + 它的成果文件，一个入口说清。
 */
import { useEffect } from 'react';
import { PROJECTS, SUBVIEW } from '@/shared/content/views';
import { projectKey, projectsStore } from './projects';
import FilesView from '@/runtime/host/FilesView';

export default function ProjectsView({
  selected,
  onOpenSession,
}: {
  selected?: string;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { items: projects, state } = projectsStore.useList();

  useEffect(() => {
    void projectsStore.load();
  }, []);

  const active = projects.find((p) => projectKey(p) === selected) ?? null;
  const sessions = active?.sessions ?? [];
  const wsDir = active?.workspace_path ?? '';

  if (state === 'error') {
    return (
      <section className="subview">
        <div className="subview-state">
          <span>{PROJECTS.loadFailed}</span>
          <button className="subview-btn" type="button" onClick={() => void projectsStore.load(true)}>
            {SUBVIEW.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="subview">
      <header className="subview-head">
        <h1 className="subview-title">{active?.name ?? PROJECTS.title}</h1>
      </header>

      {active && sessions.length > 0 ? (
        <div className="subview-detail">
          {sessions.map((session, i) => {
            const id = session.session_id ?? '';
            return (
              <button
                key={id || String(i)}
                type="button"
                className="subview-row"
                disabled={!id || !onOpenSession}
                onClick={() => id && onOpenSession?.(id)}
              >
                <span>{session.title || id}</span>
                <span>{session.status ?? ''}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {active && wsDir ? (
        <div className="proj-files">
          <FilesView initialDir={wsDir} embedded />
        </div>
      ) : null}
    </section>
  );
}
