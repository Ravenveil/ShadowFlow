/**
 * 项目列表的取形与取数。
 *
 * 第二栏（选哪个项目）和正文（看这个项目的会话）共用一份快照，
 * 免得正文里改名/删会话之后左边那列还挂着旧值。
 */
import { createListStore } from '@/shared/data/listStore';
import { getProjects, type ProjectBrief } from '@/shared/data/http/generic';

/** 主键可能叫 project_id，也可能只有 id / name。 */
export function projectKey(project: ProjectBrief): string {
  return String(project.project_id ?? project.id ?? project.name);
}

export const projectsStore = createListStore<ProjectBrief>(getProjects);
