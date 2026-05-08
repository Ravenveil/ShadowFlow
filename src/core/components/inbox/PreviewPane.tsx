import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInboxStore } from '../../store/useInboxStore';
import { GroupMetricsBar } from './GroupMetricsBar';
import { RecentMessagesPreview } from './RecentMessagesPreview';
import { ApprovalGatePanel } from './ApprovalGatePanel';
import { fetchRecentMessages } from '../../../api/groupApi';
import type { GroupMetrics } from '../../../common/types/inbox';
import { useI18n } from '../../../common/i18n';

const DEFAULT_METRICS: GroupMetrics = {
  activeRuns: 0,
  pendingApprovalsCount: 0,
  costToday: 0,
  members: 0,
};

export function PreviewPane() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const selectedGroupId = useInboxStore((s) => s.selectedGroupId);
  const groups = useInboxStore((s) => s.groups);
  const recentMessages = useInboxStore((s) => s.recentMessages);
  const setRecentMessages = useInboxStore((s) => s.setRecentMessages);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  useEffect(() => {
    if (!selectedGroupId) return;
    if (recentMessages[selectedGroupId]) return;
    fetchRecentMessages(selectedGroupId, 3)
      .then((msgs) => setRecentMessages(selectedGroupId, msgs))
      .catch(() => setRecentMessages(selectedGroupId, []));
  }, [selectedGroupId, recentMessages, setRecentMessages]);

  const metrics = selectedGroup?.metrics ?? DEFAULT_METRICS;
  const messages = selectedGroupId ? (recentMessages[selectedGroupId] ?? []) : [];

  return (
    <main
      data-testid="preview-pane"
      className="flex flex-1 flex-col overflow-y-auto bg-shadowflow-bg px-8 py-8"
    >
      {!selectedGroupId ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex h-[200px] w-[200px] items-center justify-center rounded-sf border border-white/10 bg-shadowflow-surface text-center text-sm text-white/45">
            Preview
            <br />
            Placeholder
          </div>
          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] text-white">
            {t('inbox.selectConvHint')}
          </h2>
          <p className="mt-3 max-w-sm text-center text-sm text-white/55">
            {t('inbox.selectConvDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* AC2: Metrics bar */}
          <GroupMetricsBar metrics={metrics} />

          {/* AC1: Approval gate panel (Story 7.7) */}
          <ApprovalGatePanel groupId={selectedGroupId} />

          {/* AC3: Recent messages slot */}
          <section className="rounded-sf border border-white/10 bg-shadowflow-surface px-6 py-6">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
              {t('inbox.recentMessages')}
            </p>
            <RecentMessagesPreview
              messages={messages}
              onOpenChat={() => navigate(`/chat/${selectedGroupId}`)}
            />
          </section>
        </div>
      )}
    </main>
  );
}
