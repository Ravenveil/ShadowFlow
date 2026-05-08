import type { GroupItem, AgentDMItem } from '../../../common/types/inbox';
import { StatusPill } from './StatusPill';
import { HighlightText } from './HighlightText';
import { ClipboardList } from '../../../common/icons/iconRegistry';

type Item = GroupItem | AgentDMItem;

function isGroupItem(item: Item): item is GroupItem {
  return 'pendingApprovalsCount' in item;
}

function getItemName(item: Item): string {
  return isGroupItem(item) ? item.name : item.agentName;
}

function getAvatarLetter(item: Item): string {
  return getItemName(item).charAt(0).toUpperCase();
}

function truncate(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatUnread(count: number): string {
  return count > 99 ? '99+' : String(count);
}

interface MessageItemProps {
  item: Item;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  highlightKeyword?: string;
}

export function MessageItem({
  item,
  selected,
  onClick,
  onDoubleClick,
  highlightKeyword,
}: MessageItemProps) {
  const isGroup = isGroupItem(item);
  const name = getItemName(item);
  const unread = item.unreadCount;
  const pending = isGroup ? item.pendingApprovalsCount : 0;
  const preview = truncate(item.lastMessage);
  const timestamp = new Date(item.lastActivityAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const avatarBg = isGroup ? 'bg-shadowflow-accent' : 'bg-[#A78BFA]';

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={[
        'flex w-full items-start gap-3 rounded-sf bg-shadowflow-surface px-3 py-3 text-left transition hover:bg-white/5',
        selected ? 'border-l-[3px] border-shadowflow-accent bg-white/5' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Avatar */}
      <div
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${avatarBg} text-sm font-bold text-white`}
        aria-hidden
      >
        {getAvatarLetter(item)}
      </div>

      {/* Text area */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <HighlightText
            text={name}
            keyword={highlightKeyword}
            className="truncate text-sm font-semibold text-white"
          />
          <span className="ml-2 shrink-0 font-mono text-[10px] text-white/50">
            {timestamp}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusPill status={item.status} />
          <HighlightText
            text={preview}
            keyword={highlightKeyword}
            className="truncate text-xs text-white/50"
          />
        </div>
      </div>

      {/* Badge area */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {unread > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-shadowflow-accent text-xs font-bold text-white">
            {formatUnread(unread)}
          </span>
        )}
        {pending > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-shadowflow-warn">
            <ClipboardList size={11} strokeWidth={2} /> {pending}
          </span>
        )}
      </div>
    </button>
  );
}
