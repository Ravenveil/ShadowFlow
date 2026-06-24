import { useEffect, useState } from 'react';
import { listRunSessions, type RunSessionSummary } from '../../api/runSessions';
import { useRunSession, type UseRunSessionReturn } from './useRunSession';

export interface WorkspaceRun {
  session: UseRunSessionReturn;
  latest: RunSessionSummary | null;
  history: RunSessionSummary[];
  runCwd: string | null;
  loading: boolean;
  reload: () => void;
}

export function useWorkspaceRun(groupId?: string | null): WorkspaceRun {
  const [runs, setRuns] = useState<RunSessionSummary[] | null>(null);
  const [loading, setLoading] = useState(!!groupId);

  const load = () => {
    if (!groupId) { setRuns([]); setLoading(false); return; }
    setLoading(true);
    listRunSessions(groupId)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (!groupId) return;
    const onCreated = () => load();
    const onActive = (e: Event) => {
      const d = (e as CustomEvent).detail as { groupId?: string } | undefined;
      if (d?.groupId === groupId) load();
    };
    window.addEventListener('sf:run-created', onCreated);
    window.addEventListener('sf:gateway-run-active', onActive);
    return () => {
      window.removeEventListener('sf:run-created', onCreated);
      window.removeEventListener('sf:gateway-run-active', onActive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const latest = runs?.[0] ?? null;
  // 关键：useRunSession 必须无条件调用（hooks 规则）。无 run → 传空串，hook 内部 !sessionId 短路不订阅。
  const session = useRunSession(latest?.session_id ?? '');

  return {
    session,
    latest,
    history: runs?.slice(1) ?? [],
    runCwd: latest ? `.shadowflow/projects/${latest.session_id}` : null,
    loading,
    reload: load,
  };
}
