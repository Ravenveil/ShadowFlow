import type { ReactNode } from 'react';

interface EditorToolbarProps {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
}

export function EditorToolbar({ title = 'ShadowFlow Editor', left, right }: EditorToolbarProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: '100%',
      padding: '0 14px', gap: 12, overflow: 'hidden',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--fg-2)', flexShrink: 0 }}>
        {title}
      </span>
      {left && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{left}</div>}
      <div style={{ flex: 1 }} />
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}
