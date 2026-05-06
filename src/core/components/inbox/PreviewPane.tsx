interface PreviewPaneProps {
  groupId?: string;
}

function PlaceholderCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-sf border border-white/10 bg-shadowflow-surface px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{title}</p>
      <p className="mt-2 text-lg font-semibold text-white/90">{value}</p>
    </div>
  );
}

export function PreviewPane({ groupId }: PreviewPaneProps) {
  const hasSelection = Boolean(groupId);

  return (
    <main
      data-testid="preview-pane"
      className="flex flex-1 flex-col overflow-y-auto bg-shadowflow-bg px-8 py-8"
    >
      {!hasSelection ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex h-[200px] w-[200px] items-center justify-center rounded-sf border border-white/10 bg-shadowflow-surface text-center text-sm text-white/45">
            Preview
            <br />
            Placeholder
          </div>
          <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em] text-white">
            选择一个会话查看详情
          </h2>
          <p className="mt-3 max-w-sm text-center text-sm text-white/55">
            从左侧列表选择群聊或单聊开始协作
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <PlaceholderCard title="Active Runs" value="12" />
            <PlaceholderCard title="Pending Approvals" value="3" />
            <PlaceholderCard title="Cost Today" value="$18.40" />
            <PlaceholderCard title="Members" value="7" />
          </div>

          <section className="rounded-sf border border-shadowflow-accent/40 bg-shadowflow-surface px-6 py-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-shadowflow-accent">
              APPROVAL GATE
            </p>
            <div className="mt-4 h-64 rounded-sf border border-dashed border-shadowflow-accent/30 bg-shadowflow-bg/60" />
          </section>

          <section className="rounded-sf border border-white/10 bg-shadowflow-surface px-6 py-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">Recent Messages</p>
            <div className="mt-4 h-40 rounded-sf border border-dashed border-white/10 bg-shadowflow-bg/60" />
          </section>
        </div>
      )}
    </main>
  );
}
