import { MessageList } from '@/core/components/inbox/MessageList';
import { NarrowNav } from '@/core/components/inbox/NarrowNav';
import { PreviewPane } from '@/core/components/inbox/PreviewPane';

export default function InboxPage() {
  return (
    <div
      className="flex h-screen flex-row overflow-hidden bg-shadowflow-bg text-white/90"
      style={{
        backgroundImage: 'radial-gradient(#21262D 1px, transparent 1px)',
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
