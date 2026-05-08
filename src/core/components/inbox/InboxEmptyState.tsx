interface InboxEmptyStateProps {
  keyword?: string;
  onCreateGroup: () => void;
}

export function InboxEmptyState({ keyword, onCreateGroup }: InboxEmptyStateProps) {
  const trimmedKeyword = keyword?.trim() ?? '';

  return (
    <div className="flex flex-col items-center rounded-sf border border-dashed border-white/10 px-6 py-10 text-center">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-10 w-10 text-white/30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <h3 className="mt-4 text-sm font-medium text-white/70">没有匹配的会话</h3>
      <p className="mt-2 text-sm text-white/50">
        {trimmedKeyword ? `未找到 '${trimmedKeyword}'` : '还没有会话'}
      </p>
      <button
        type="button"
        onClick={onCreateGroup}
        className="mt-4 text-sm font-medium text-[#A78BFA] transition hover:text-[#C4B5FD]"
      >
        + 新群聊
      </button>
    </div>
  );
}
