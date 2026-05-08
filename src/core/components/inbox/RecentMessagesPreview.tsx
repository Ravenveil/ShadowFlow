import type { Message } from '../../../common/types/inbox';

interface RecentMessagesPreviewProps {
  messages: Message[];
  onOpenChat: () => void;
}

function senderInitial(name: string) {
  return name.charAt(0).toUpperCase();
}

function truncate(text: string, lines = 2) {
  const max = lines * 60;
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function RecentMessagesPreview({ messages, onOpenChat }: RecentMessagesPreviewProps) {
  return (
    <div data-testid="recent-messages-preview" className="flex flex-col gap-3">
      {messages.length === 0 ? (
        <p className="text-xs text-white/35">暂无消息</p>
      ) : (
        messages.map((msg, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-shadowflow-accent text-[10px] font-bold text-white">
              {senderInitial(msg.sender_name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-white">{msg.sender_name}</p>
              <p className="line-clamp-2 text-xs text-white/70">{truncate(msg.content)}</p>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-white/40">
              {formatTimestamp(msg.timestamp)}
            </span>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={onOpenChat}
        className="mt-1 self-start text-xs font-medium text-shadowflow-accent hover:underline"
      >
        打开完整群聊 →
      </button>
    </div>
  );
}
