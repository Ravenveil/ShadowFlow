import { useI18n } from '../../../common/i18n';

interface InboxEmptyStateProps {
  keyword?: string;
  onCreateGroup: () => void;
}

export function InboxEmptyState({ keyword, onCreateGroup }: InboxEmptyStateProps) {
  const { t } = useI18n();
  const trimmedKeyword = keyword?.trim() ?? '';

  return (
    <div className="flex flex-col items-center rounded-sf border border-dashed border-[var(--t-border)] px-6 py-10 text-center">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-10 w-10 text-[var(--t-fg-5)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <h3 className="mt-4 text-sm font-medium text-[var(--t-fg-3)]">{t('inbox.empty.noMatch')}</h3>
      <p className="mt-2 text-sm text-[var(--t-fg-4)]">
        {trimmedKeyword
          ? t('inbox.empty.notFound', { keyword: trimmedKeyword })
          : t('inbox.empty.noConversations')}
      </p>
      <button
        type="button"
        onClick={onCreateGroup}
        className="mt-4 text-sm font-medium text-[var(--t-accent)] transition hover:text-[var(--t-accent-bright)]"
      >
        {t('inbox.empty.newGroup')}
      </button>
    </div>
  );
}
