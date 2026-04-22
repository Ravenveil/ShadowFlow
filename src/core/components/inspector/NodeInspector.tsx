import type { WorkflowNode } from '../../types';

interface NodeInspectorProps {
  node: WorkflowNode | null;
  onUpdate?: (nodeId: string, data: Partial<WorkflowNode['data']>) => void;
}

export function NodeInspector({ node, onUpdate }: NodeInspectorProps) {
  if (!node) {
    return (
      <div style={{ padding: 16, color: 'var(--fg-5)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'center', paddingTop: 32 }}>
        选中节点查看配置
      </div>
    );
  }

  // P17: Prefer zh label, fall back to en, then String coercion
  const label = typeof node.data.label === 'object'
    ? ((node.data.label as { zh?: string; en?: string }).zh
       ?? (node.data.label as { zh?: string; en?: string }).en
       ?? String(node.data.label))
    : String(node.data.label ?? '');

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4 }}>
          {node.data.nodeType ?? 'node'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-0)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-5)', marginTop: 2 }}>{node.id}</div>
      </div>

      {/* Config fields */}
      {node.data.config && Object.entries(node.data.config).map(([k, v]) => {
        // P18: Detect object/array values — render read-only JSON instead of corrupting via String()
        const isComplex = v !== null && typeof v === 'object';
        return (
          // P16: key includes node.id so inputs remount when the selected node changes
          <div key={`${node.id}-${k}`} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--fg-4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {k}
            </label>
            {isComplex ? (
              <textarea
                readOnly
                value={JSON.stringify(v, null, 2)}
                rows={3}
                style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg-4)', fontSize: 11, fontFamily: 'var(--font-mono)', boxSizing: 'border-box', resize: 'none', cursor: 'not-allowed' }}
              />
            ) : (
              <input
                defaultValue={String(v ?? '')}
                onChange={(e) => onUpdate?.(node.id, { config: { ...node.data.config, [k]: e.target.value } })}
                style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg-1)', fontSize: 12, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
