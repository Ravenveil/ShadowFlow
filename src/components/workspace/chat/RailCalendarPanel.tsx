/**
 * RailCalendarPanel — 日历视图（Rail "cal" tab）
 * 参考飞书日历 / Google Calendar 周视图 + 右侧 agenda
 */

import { useState } from 'react';
import { FBAv } from '../FBAtoms';
import { CI } from './icons';

interface CalEvent {
  id: string;
  title: string;
  time: string;
  duration: string;
  agent?: { glyph: string; color: string; name: string };
  type: 'run' | 'review' | 'sync' | 'deadline';
}

const TYPE_STYLE: Record<string, { bg: string; border: string; label: string }> = {
  run:      { bg: 'color-mix(in oklab, var(--status-run) 12%, transparent)', border: 'var(--status-run)', label: 'RUN' },
  review:   { bg: 'color-mix(in oklab, var(--status-warn) 12%, transparent)', border: 'var(--status-warn)', label: 'REVIEW' },
  sync:     { bg: 'color-mix(in oklab, var(--t-accent) 10%, transparent)', border: 'var(--t-accent)', label: 'SYNC' },
  deadline: { bg: 'color-mix(in oklab, var(--status-reject) 10%, transparent)', border: 'var(--status-reject)', label: 'DDL' },
};

const TODAY_EVENTS: CalEvent[] = [
  { id: 'e1', title: '论文深读 Run #042', time: '09:00', duration: '30min', agent: { glyph: '读', color: 'var(--t-accent)', name: '读读' }, type: 'run' },
  { id: 'e2', title: '§4.2 / §5.1 / §6.3 审查', time: '09:30', duration: '20min', agent: { glyph: '批', color: 'var(--t-warn)', name: '阿批' }, type: 'review' },
  { id: 'e3', title: '重写 r2/3 截止', time: '11:00', duration: '—', type: 'deadline' },
  { id: 'e4', title: 'Team standup · 全员同步', time: '14:00', duration: '15min', type: 'sync' },
  { id: 'e5', title: '引用校验 final check', time: '15:30', duration: '10min', agent: { glyph: '查', color: 'var(--t-gated, var(--t-accent))', name: '查查' }, type: 'review' },
  { id: 'e6', title: 'Run #043 · 数据可视化', time: '16:00', duration: '45min', agent: { glyph: '写', color: 'var(--t-err)', name: '小写' }, type: 'run' },
];

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

function MiniCalendar({ selected, onSelect }: { selected: number; onSelect: (d: number) => void }) {
  const today = new Date();
  const startOfWeek = today.getDate() - today.getDay() + 1;
  const days = Array.from({ length: 7 }, (_, i) => startOfWeek + i);

  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 2px' }}>
      {days.map((d, i) => {
        const isToday = d === today.getDate();
        const isSel = d === selected;
        return (
          <div key={i} onClick={() => onSelect(d)} style={{
            flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, cursor: 'pointer',
            background: isSel ? 'var(--t-accent-tint)' : 'transparent',
            border: isSel ? '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)' : '1px solid transparent',
            transition: 'all 120ms',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)', marginBottom: 2 }}>{WEEK_DAYS[i]}</div>
            <div style={{
              fontSize: 13, fontWeight: isToday ? 800 : 600,
              color: isToday ? 'var(--t-accent-bright)' : 'var(--t-fg-2)',
            }}>{d}</div>
            {isToday && <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--t-accent-bright)', margin: '2px auto 0' }} />}
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ event }: { event: CalEvent }) {
  const style = TYPE_STYLE[event.type];
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, background: style.bg,
      borderLeft: `3px solid ${style.border}`, cursor: 'pointer',
      transition: 'transform 120ms',
    }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateX(2px)')}
       onMouseLeave={e => (e.currentTarget.style.transform = 'none')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em',
          color: style.border, padding: '1px 5px', borderRadius: 3,
          background: `color-mix(in oklab, ${style.border} 18%, transparent)`,
        }}>{style.label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-3)' }}>
          {event.time} · {event.duration}
        </span>
        <span style={{ flex: 1 }} />
        {event.agent && <FBAv glyph={event.agent.glyph} color={event.agent.color} size={20} square />}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg)', marginTop: 5, lineHeight: 1.4 }}>
        {event.title}
      </div>
    </div>
  );
}

export function RailCalendarPanel() {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid var(--t-border)',
        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--skin-panel)', flexShrink: 0,
      }}>
        <span style={{ width: 18, height: 18, display: 'flex', color: 'var(--t-accent-bright)' }}>{CI.cal}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>日历</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>
          {today.getFullYear()} {monthNames[today.getMonth()]}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-accent-bright)',
          padding: '3px 10px', borderRadius: 11, background: 'var(--t-accent-tint)',
          border: '1px solid color-mix(in oklab, var(--t-accent) 35%, transparent)',
          cursor: 'pointer', fontWeight: 600,
        }}>今天</span>
      </div>

      {/* Mini week strip */}
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--t-border)', background: 'var(--t-panel)', flexShrink: 0 }}>
        <MiniCalendar selected={selectedDay} onSelect={setSelectedDay} />
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, color: 'var(--t-fg-4)',
          letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 0',
        }}>
          {selectedDay === today.getDate() ? '今日日程' : `${selectedDay}日日程`} · {TODAY_EVENTS.length} 项
        </div>
        {TODAY_EVENTS.map(evt => (
          <EventCard key={evt.id} event={evt} />
        ))}
        <div style={{
          marginTop: 8, padding: '12px', borderRadius: 8, border: '1px dashed var(--t-border)',
          textAlign: 'center', cursor: 'pointer', color: 'var(--t-fg-4)', fontSize: 11.5,
          transition: 'border-color 120ms',
        }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--t-accent)')}
           onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--t-border)')}>
          + 新建日程
        </div>
      </div>
    </div>
  );
}
