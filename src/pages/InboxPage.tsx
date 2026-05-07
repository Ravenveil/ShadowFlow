import { MessageList } from '@/core/components/inbox/MessageList';
import { NarrowNav } from '@/core/components/inbox/NarrowNav';
import { PreviewPane } from '@/core/components/inbox/PreviewPane';

export default function InboxPage() {
  return (
    <div
      className="flex h-screen flex-row overflow-hidden"
      style={{
        background: 'var(--t-bg)',
        color: 'var(--t-fg)',
        backgroundImage: 'radial-gradient(var(--t-border) 1px, transparent 1px)',
        backgroundSize: '120px 120px',
      }}
    >
      <NarrowNav />
      <MessageList />
      <div className="hidden min-w-0 flex-1 lg:flex">
        <PreviewPane />
      </div>
    </div>
  );
}
