import { useI18n } from '../../../common/i18n';

export type ChatBriefBoardTab = 'chat' | 'briefboard' | 'approvals';

interface ChatBriefBoardToggleProps {
  briefBoardAlias: string;
  activeTab: ChatBriefBoardTab;
  onChange: (tab: ChatBriefBoardTab) => void;
  /** Optional pending approvals count rendered as a small badge on the
   *  Approvals tab. Falsy values hide the badge. */
  pendingApprovalsCount?: number;
}

export function ChatBriefBoardToggle({
  briefBoardAlias,
  activeTab,
  onChange,
  pendingApprovalsCount,
}: ChatBriefBoardToggleProps) {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const segmentClass = (tab: ChatBriefBoardTab) =>
    `px-4 py-1.5 rounded-[10px] text-sm transition-colors ${
      activeTab === tab
        ? 'bg-shadowflow-accent text-white'
        : 'text-white/60 hover:text-white/80'
    }`;

  const approvalsLabel = T('审批', 'Approvals');
  const showApprovalsBadge =
    typeof pendingApprovalsCount === 'number' && pendingApprovalsCount > 0;

  return (
    <div role="tablist" className="flex rounded-sf bg-white/5 p-0.5">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'chat'}
        className={segmentClass('chat')}
        onClick={() => onChange('chat')}
      >
        Chat
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'briefboard'}
        className={segmentClass('briefboard')}
        onClick={() => onChange('briefboard')}
      >
        {briefBoardAlias}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'approvals'}
        data-testid="approvals-tab"
        className={segmentClass('approvals')}
        onClick={() => onChange('approvals')}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {approvalsLabel}
          {showApprovalsBadge && (
            <span
              aria-label={T('待审批数量', 'pending approvals')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 18,
                height: 16,
                padding: '0 5px',
                borderRadius: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 700,
                background: 'var(--t-warn)',
                color: 'var(--t-accent-ink, #0d1117)',
              }}
            >
              {pendingApprovalsCount}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
