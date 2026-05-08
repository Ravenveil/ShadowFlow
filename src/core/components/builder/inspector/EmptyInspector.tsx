/** Inspector 空态 — 未选中任何节点时显示 */
export function EmptyInspector() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-5 text-center"
      data-testid="inspector-empty"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-sf-fg5">
        Inspector
      </p>
      <p className="mt-2 text-[12px] text-sf-fg4">
        Select a node to inspect and edit.
      </p>
    </div>
  );
}
