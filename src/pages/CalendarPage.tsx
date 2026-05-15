import { CalendarDays } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--t-fg-4)' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--t-panel)', border: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CalendarDays size={26} strokeWidth={1.4}/>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--t-fg-3)' }}>日历</p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t-fg-5)', lineHeight: 1.6 }}>Agent 任务调度 · 定时触发 · 里程碑<br/>即将推出</p>
      </div>
    </div>
  );
}
