import { MessageList } from '@/core/components/inbox/MessageList';

// 2026-06-24 — 收件箱并入统一 ChatRail 布局：删掉自带的 NarrowNav（与全局
// 左栏导航重复的第二条窄栏）和 PreviewPane（"Preview Placeholder" 占位 mock）。
// 收件箱 = 一列会话列表，点击直接跳到对应群聊/单聊（MessageList 内导航）。
export default function InboxPage() {
  return (
    <div
      className="flex h-full flex-1 flex-col overflow-hidden"
      style={{ background: 'var(--t-bg)', color: 'var(--t-fg)' }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <MessageList />
      </div>
    </div>
  );
}
