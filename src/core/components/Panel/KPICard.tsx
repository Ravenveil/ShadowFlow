/**
 * KPICard — compact metric card (Story 4.7).
 */
import React from 'react';

export interface KPICardProps {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaColor?: string;
  width?: number | string;
  valueColor?: string;
}

export function KPICard({ label, value, delta, deltaColor, width = 340, valueColor }: KPICardProps): JSX.Element {
  return (
    <div
      data-testid={`kpi-${label}`}
      style={{
        width,
        padding: '14px 16px',
        background: '#0F0F11',
        border: '1px solid var(--border)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg-5)' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: valueColor ?? 'var(--fg-0)', lineHeight: 1.1 }}>
        {value}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: deltaColor ?? 'var(--fg-4)' }}>
          {delta}
        </div>
      )}
    </div>
  );
}

export default KPICard;
