import { useEffect, useState } from 'react';
import { fetchBriefBoard, type BriefBoardEntry } from '../../../api/groupApi';
import { useI18n } from '../../../common/i18n';

interface BriefBoardViewProps {
  groupId: string;
  date?: string;
}

export function BriefBoardView({ groupId, date }: BriefBoardViewProps) {
  const { t } = useI18n();
  const today = date ?? new Date().toLocaleDateString('en-CA');
  const [entries, setEntries] = useState<BriefBoardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchBriefBoard(groupId, today)
      .then((data) => setEntries(data.entries))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [groupId, today]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--t-fg-5)]">
        {t('inbox.loading')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
      {/* TODO: i18n — "今日 · {today}" and "今天暂无 Agent 产出 · 运行一个工作流开始协作" have no locale key yet */}
      <h2 className="mb-4 text-sm font-semibold text-[var(--t-fg-3)]">今日 · {today}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--t-fg-5)]">今天暂无 Agent 产出 · 运行一个工作流开始协作</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={`${entry.agent_name}-${entry.timestamp}`} className="flex gap-3 rounded-sf bg-[var(--t-hover)] p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shadowflow-accent/20 text-xs font-semibold text-shadowflow-accent">
                {entry.agent_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--t-fg-2)]">{entry.agent_name}</span>
                  <span className="rounded px-1.5 py-0.5 text-xs bg-[var(--t-active)] text-[var(--t-fg-3)]">
                    {entry.agent_kind}
                  </span>
                  <span className="text-xs text-[var(--t-fg-5)]">
                    {new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--t-fg-3)]">{entry.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
