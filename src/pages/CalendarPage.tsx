import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, X, ChevronLeft, ChevronRight, ArrowUpRight, Trash2 } from 'lucide-react';
import { listSchedules, deleteSchedule, type Schedule } from '../api/schedules';
import { useInboxStore } from '../core/store/useInboxStore';
import { ScheduleDrawer, describeSchedule } from '../components/briefboard/ScheduleDrawer';
import { useWorkspaceStore } from '../store/workspaceStore';

/* ── Types ─────────────────────────────────────────────────────────────── */

type ViewMode = 'month' | 'week' | 'agenda';
type EvStatus = 'ok' | 'run' | 'warn' | 'err' | 'pending';

interface CalEvent {
  id: string;
  scheduleId: string;
  groupId: string;
  groupName: string;
  glyph: string;
  slot: string;
  title: string;
  cronExpr: string;
  date: string;
  startH: number;
  startM: number;
  durMin: number;
  status: EvStatus;
  runId?: string;
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const SLOTS = ['a', 'b', 'c', 'd', 'e'] as const;
const SLOT_COLOR: Record<string, string> = {
  a: '#A855F7', b: '#22D3EE', c: '#F59E0B', d: '#EC4899', e: '#10B981',
};
const SLOT_TINT: Record<string, string> = {
  a: 'rgba(168,85,247,.15)', b: 'rgba(34,211,238,.13)', c: 'rgba(245,158,11,.13)',
  d: 'rgba(236,72,153,.13)', e: 'rgba(16,185,129,.13)',
};
const SLOT_STROKE: Record<string, string> = {
  a: 'rgba(168,85,247,.4)', b: 'rgba(34,211,238,.4)', c: 'rgba(245,158,11,.4)',
  d: 'rgba(236,72,153,.4)', e: 'rgba(16,185,129,.4)',
};

const MONTH_ZH = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const DOW_ZH   = ['周日','周一','周二','周三','周四','周五','周六'];
const DOW_ENG  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DOW_MINI = ['日','一','二','三','四','五','六'];

/* ── Cron helpers ───────────────────────────────────────────────────────── */

function cronHM(cron: string): { h: number; m: number } | null {
  const p = cron.trim().split(/\s+/);
  if (p.length < 2) return null;
  const h = parseInt(p[1]), m = parseInt(p[0]);
  if (isNaN(h) || isNaN(m)) return null;
  return { h, m };
}

function cronMatchDay(cron: string, dow: number): boolean {
  const p = cron.trim().split(/\s+/);
  if (p.length < 5) return false;
  const d = p[4];
  if (d === '*') return true;
  if (d.includes('-')) { const [lo, hi] = d.split('-').map(Number); return dow >= lo && dow <= hi; }
  return d.split(',').map(Number).includes(dow);
}

function fmt2(n: number) { return String(n).padStart(2, '0'); }
function fmtHM(h: number, m: number) { return `${fmt2(h)}:${fmt2(m)}`; }
function isoDate(y: number, mo: number, d: number) { return `${y}-${fmt2(mo + 1)}-${fmt2(d)}`; }

/* ── Event builder ──────────────────────────────────────────────────────── */

function buildEvents(
  schedules: Schedule[],
  groupNames: Map<string, string>,
  slotOf: Map<string, string>,
  year: number,
  month: number,
): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  const add = (iso: string, ev: CalEvent) => {
    const arr = map.get(iso) ?? []; arr.push(ev); map.set(iso, arr);
  };

  const now = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (const sc of schedules) {
    const gName = groupNames.get(sc.group_id) ?? sc.group_id;
    const slot  = slotOf.get(sc.group_id) ?? 'a';
    const glyph = gName.trim()[0] ?? '?';
    const hm    = cronHM(sc.cron_expression);
    if (!hm) continue;

    // Index past runs by date
    const runByDate = new Map<string, { status: string; run_id: string }>();
    for (const r of sc.runs ?? []) {
      const d = r.triggered_at.slice(0, 10);
      if (!runByDate.has(d)) runByDate.set(d, { status: r.status, run_id: r.run_id });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month, d).getDay();
      if (!cronMatchDay(sc.cron_expression, dow)) continue;
      const iso = isoDate(year, month, d);
      const dateObj = new Date(year, month, d);
      const run = runByDate.get(iso);

      let status: EvStatus = 'pending';
      if (run) {
        status = run.status === 'succeeded' ? 'ok' : 'err';
      } else if (dateObj < now && dateObj.toDateString() !== now.toDateString()) {
        status = 'pending';
      }

      add(iso, {
        id: `${sc.schedule_id}-${iso}`,
        scheduleId: sc.schedule_id,
        groupId: sc.group_id,
        groupName: gName,
        glyph,
        slot,
        title: sc.task_description || '定时任务',
        cronExpr: sc.cron_expression,
        date: iso,
        startH: hm.h,
        startM: hm.m,
        durMin: 30,
        status,
        runId: run?.run_id,
      });
    }
  }
  return map;
}

/* ── Month grid builder ─────────────────────────────────────────────────── */

function buildGrid(year: number, month: number) {
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: { day: number; inMonth: boolean; iso?: string; weekend: boolean }[] = [];
  for (let i = startDow - 1; i >= 0; i--) cells.push({ day: prevDays - i, inMonth: false, weekend: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    cells.push({ day: d, inMonth: true, iso: isoDate(year, month, d), weekend: dow === 0 || dow === 6 });
  }
  let t = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) { cells.push({ day: t++, inMonth: false, weekend: false }); if (cells.length >= 42) break; }
  return cells;
}

/* ── Week range ─────────────────────────────────────────────────────────── */

function getWeekDays(year: number, month: number): { iso: string; day: number; dow: number }[] {
  const today = new Date();
  const ref = (today.getFullYear() === year && today.getMonth() === month) ? today : new Date(year, month, 1);
  const startSun = new Date(ref); startSun.setDate(ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startSun); d.setDate(startSun.getDate() + i);
    return { iso: `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}`, day: d.getDate(), dow: d.getDay() };
  });
}

/* ── CSS tokens ─────────────────────────────────────────────────────────── */

const CAL_CSS = `
.cal-root {
  --cal-ok-tint:   color-mix(in oklab, var(--t-ok)   14%, transparent);
  --cal-err-tint:  color-mix(in oklab, var(--t-err)  14%, transparent);
  --cal-warn-tint: color-mix(in oklab, var(--t-warn) 14%, transparent);
  --cal-run-tint:  color-mix(in oklab, var(--t-run)  14%, transparent);
  --cal-wkend:     var(--t-fg-5);
  --cal-out:       var(--t-fg-6, #3F3F46);
  --cal-acdot:     color-mix(in oklab, var(--t-accent) 40%, transparent);
  --cal-p3:        var(--t-panel-3, #1A1A1F);
  --cal-fg0:       var(--t-fg, #FAFAFA);
  --cal-fg1:       var(--t-fg-2, #E4E4E7);
}
@keyframes cal-blink { 0%,100%{opacity:1}50%{opacity:.25} }
@keyframes cal-spin  { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
.cal-pulse { animation: cal-blink 1.6s ease-in-out infinite; }
.cal-mono  { font-family: var(--font-mono); }
.cal-label { font-family: var(--font-mono); font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--t-fg-4); }
.cal-meta  { font-family: var(--font-mono); font-size:10px; font-weight:500; color:var(--t-fg-4); letter-spacing:.04em; }
.cal-noscroll::-webkit-scrollbar { display:none; } .cal-noscroll { scrollbar-width:none; }
.cal-cell:hover { background: color-mix(in oklab, var(--t-accent) 4%, var(--t-bg)) !important; }
.cal-ev:hover { opacity:.85; transform: translateX(1px); }
.cal-ev { transition: opacity 120ms, transform 120ms; }
.cal-agenda-row:hover { background: var(--t-panel-2) !important; }
`;

/* ── Status helpers ─────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<EvStatus, string> = {
  ok: 'var(--t-ok)', run: 'var(--t-run)', warn: 'var(--t-warn)', err: 'var(--t-err)', pending: 'var(--t-fg-5)',
};
const STATUS_TINT: Record<EvStatus, string> = {
  ok: 'var(--cal-ok-tint)', run: 'var(--cal-run-tint)', warn: 'var(--cal-warn-tint)',
  err: 'var(--cal-err-tint)', pending: 'var(--t-panel-2)',
};
const STATUS_LABEL: Record<EvStatus, string> = {
  ok: '已完成 ✓', run: '运行中', warn: '待重试', err: '失败 ✗', pending: '已计划',
};

/* ── Avatar ─────────────────────────────────────────────────────────────── */

function CalAvatar({ glyph, slot, size = 22 }: { glyph: string; slot: string; size?: number }) {
  const c = SLOT_COLOR[slot] ?? '#A855F7';
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3,
      background: SLOT_TINT[slot], border: `1px solid ${SLOT_STROKE[slot]}`,
      color: c, display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight: 800, fontSize: size * 0.46, flexShrink: 0,
    }}>{glyph}</div>
  );
}

/* ── EventBar (month cell) ──────────────────────────────────────────────── */

function EventBar({ ev, onSelect }: { ev: CalEvent; onSelect: (e: CalEvent) => void }) {
  const c = SLOT_COLOR[ev.slot]; const ti = SLOT_TINT[ev.slot]; const st = SLOT_STROKE[ev.slot];
  const isRun = ev.status === 'run', isErr = ev.status === 'err', isPending = ev.status === 'pending';
  return (
    <div className="cal-ev"
      onClick={(e) => { e.stopPropagation(); onSelect(ev); }}
      title={`${fmtHM(ev.startH, ev.startM)} ${ev.title}`}
      style={{
        display:'flex', alignItems:'center', gap: 4,
        padding: '2px 6px', borderRadius: 4, cursor:'pointer',
        background: isRun ? c : ti,
        border: `1px solid ${isRun ? c : st}`,
        opacity: isPending ? 0.72 : 1,
        boxShadow: isRun ? `0 0 0 2px ${SLOT_TINT[ev.slot]}` : 'none',
        minWidth: 0,
      }}>
      <span style={{
        width: 5, height: 5, borderRadius:'50%', flexShrink:0,
        background: isRun ? '#fff' : c,
        ...(isRun ? { animation:'cal-blink 1.4s ease-in-out infinite' } : {}),
      }}/>
      <span style={{
        fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:700,
        color: isRun ? '#fff' : c, flexShrink:0,
      }}>{fmtHM(ev.startH, ev.startM)}</span>
      <span style={{
        fontSize:10.5, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        flex:1, minWidth:0, color: isRun ? '#fff' : 'var(--cal-fg1)',
      }}>{ev.title}</span>
      {isRun && <span style={{ fontFamily:'var(--font-mono)', fontSize:7.5, fontWeight:800, color:'#fff', letterSpacing:'.1em' }}>LIVE</span>}
      {isErr && <span style={{ fontFamily:'var(--font-mono)', fontSize:8, fontWeight:800, color:'var(--t-err)', flexShrink:0 }}>ERR</span>}
    </div>
  );
}

/* ── Month view ─────────────────────────────────────────────────────────── */

function MonthView({ year, month, eventsByDate, onEventClick }: {
  year: number; month: number;
  eventsByDate: Map<string, CalEvent[]>;
  onEventClick: (e: CalEvent) => void;
}) {
  const cells = useMemo(() => buildGrid(year, month), [year, month]);
  const today = new Date();
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--t-bg)', minWidth:0, minHeight:0, overflow:'hidden' }}>
      {/* weekday header */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--t-border)', background:'var(--t-panel)', flexShrink:0 }}>
        {DOW_ZH.map((h, i) => (
          <div key={i} style={{
            padding:'9px 12px', borderRight: i < 6 ? '1px solid var(--t-border)' : 'none',
            fontSize:11, fontWeight:600, color: (i===0||i===6) ? 'var(--cal-wkend)' : 'var(--t-fg-3)',
            fontFamily:'var(--font-mono)', letterSpacing:'.04em',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <span>{h}</span>
            <span style={{ fontSize:9, opacity:.6 }}>{DOW_ENG[i]}</span>
          </div>
        ))}
      </div>
      {/* grid */}
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridAutoRows:'1fr', minHeight:0 }}>
        {cells.map((cell, i) => {
          const evs = cell.inMonth && cell.iso ? (eventsByDate.get(cell.iso) ?? []) : [];
          const visible = evs.slice(0, 4);
          const overflow = evs.length - visible.length;
          const isToday = cell.inMonth && cell.iso === `${today.getFullYear()}-${fmt2(today.getMonth()+1)}-${fmt2(today.getDate())}`;
          const col = i % 7;
          return (
            <div key={i} className="cal-cell"
              style={{
                padding:'7px 7px 5px', minWidth:0,
                borderRight: col < 6 ? '1px solid var(--t-border)' : 'none',
                borderBottom: i < cells.length - 7 ? '1px solid var(--t-border)' : 'none',
                background: isToday ? 'color-mix(in oklab, var(--t-accent) 5%, var(--t-bg))' : 'var(--t-bg)',
                display:'flex', flexDirection:'column', gap:3, cursor:'default',
                transition:'background 120ms',
              }}>
              {/* date number */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
                {isToday ? (
                  <span style={{
                    minWidth:22, height:22, padding:'0 6px', borderRadius:11,
                    background:'var(--t-accent)', color:'var(--t-accent-ink)',
                    display:'inline-flex', alignItems:'center', justifyContent:'center',
                    fontWeight:800, fontSize:12, fontFamily:'var(--font-mono)',
                  }}>{cell.day}</span>
                ) : (
                  <span style={{
                    fontWeight: !cell.inMonth ? 400 : 700, fontSize:13,
                    color: !cell.inMonth ? 'var(--cal-out)' : cell.weekend ? 'var(--cal-wkend)' : 'var(--cal-fg0)',
                    fontFamily:'var(--font-mono)',
                  }}>{cell.day}</span>
                )}
                {isToday && <span className="cal-label" style={{ fontSize:8, color:'var(--t-accent-bright)', letterSpacing:'.1em' }}>TODAY</span>}
              </div>
              {/* events */}
              <div style={{ display:'flex', flexDirection:'column', gap:2.5, minWidth:0 }}>
                {visible.map(ev => <EventBar key={ev.id} ev={ev} onSelect={onEventClick}/>)}
                {overflow > 0 && (
                  <div style={{ fontSize:10, color:'var(--t-fg-4)', padding:'1px 5px', fontFamily:'var(--font-mono)' }}>
                    +{overflow} 更多
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Week event block ───────────────────────────────────────────────────── */

function WeekEventBlock({ ev, pxPerHour, startH, onSelect }: {
  ev: CalEvent; pxPerHour: number; startH: number; onSelect: (e: CalEvent) => void;
}) {
  const top = (ev.startH + ev.startM / 60 - startH) * pxPerHour;
  const height = Math.max(26, (ev.durMin / 60) * pxPerHour);
  const c = SLOT_COLOR[ev.slot]; const ti = SLOT_TINT[ev.slot];
  const isRun = ev.status === 'run', isPending = ev.status === 'pending';
  return (
    <div onClick={() => onSelect(ev)} style={{
      position:'absolute', left:5, right:5, top, height,
      background: isRun ? c : ti,
      border: `1px solid ${isRun ? c : SLOT_STROKE[ev.slot]}`,
      borderLeft: `3px solid ${c}`,
      borderRadius:6, padding:'5px 7px', cursor:'pointer',
      opacity: isPending ? 0.76 : 1,
      boxShadow: isRun ? `0 0 0 2px ${SLOT_TINT[ev.slot]}, 0 8px 24px -8px ${SLOT_TINT[ev.slot]}` : 'none',
      overflow:'hidden', zIndex:2,
      transition:'opacity 120ms',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:2 }}>
        {isRun && <span style={{ width:5, height:5, borderRadius:'50%', background:'#fff', flexShrink:0, animation:'cal-blink 1.4s infinite' }}/>}
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:700, color: isRun ? '#fff' : c }}>
          {fmtHM(ev.startH, ev.startM)}
        </span>
        {isRun && <span style={{ marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:8, fontWeight:800, color:'#fff', letterSpacing:'.1em' }}>LIVE</span>}
      </div>
      {height >= 44 && (
        <div style={{ fontSize:11.5, fontWeight:700, color: isRun ? '#fff' : 'var(--cal-fg0)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {ev.title}
        </div>
      )}
      {height >= 64 && (
        <div className="cal-meta" style={{ fontSize:9, marginTop:2, color: isRun ? 'rgba(255,255,255,.7)' : 'var(--t-fg-4)' }}>
          {ev.groupName}
        </div>
      )}
    </div>
  );
}

/* ── Week view ──────────────────────────────────────────────────────────── */

function WeekView({ year, month, eventsByDate, onEventClick }: {
  year: number; month: number;
  eventsByDate: Map<string, CalEvent[]>;
  onEventClick: (e: CalEvent) => void;
}) {
  const weekDays = useMemo(() => getWeekDays(year, month), [year, month]);
  const START_H = 6, END_H = 23, PX = 56;
  const hours = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${fmt2(today.getMonth()+1)}-${fmt2(today.getDate())}`;
  const nowTop = (today.getHours() + today.getMinutes() / 60 - START_H) * PX;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--t-bg)', minWidth:0, minHeight:0, overflow:'hidden' }}>
      {/* header */}
      <div style={{ display:'grid', gridTemplateColumns:'54px repeat(7,1fr)', borderBottom:'1px solid var(--t-border)', background:'var(--t-panel)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid var(--t-border)' }}>
          <span className="cal-label" style={{ fontSize:9 }}>GMT+8</span>
        </div>
        {weekDays.map((d, i) => {
          const isToday = d.iso === todayIso;
          const wkend = d.dow === 0 || d.dow === 6;
          const evCount = (eventsByDate.get(d.iso) ?? []).length;
          return (
            <div key={d.iso} style={{ padding:'10px 12px', borderRight: i<6 ? '1px solid var(--t-border)' : 'none', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{
                width:32, height:32, borderRadius:9,
                background: isToday ? 'var(--t-accent)' : 'transparent',
                color: isToday ? 'var(--t-accent-ink)' : wkend ? 'var(--cal-wkend)' : 'var(--cal-fg0)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:800, fontSize:16, fontFamily:'var(--font-mono)',
              }}>{d.day}</div>
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                <span style={{ fontSize:11, fontWeight:600, color: isToday ? 'var(--t-accent-bright)' : wkend ? 'var(--cal-wkend)' : 'var(--t-fg-3)' }}>{DOW_ZH[d.dow]}</span>
                <span className="cal-meta" style={{ fontSize:9 }}>{evCount} 计划</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* time grid */}
      <div className="cal-noscroll" style={{ flex:1, overflow:'auto', position:'relative' }}>
        <div style={{ display:'grid', gridTemplateColumns:'54px repeat(7,1fr)', position:'relative' }}>
          {/* hour gutter */}
          <div style={{ borderRight:'1px solid var(--t-border)', background:'var(--t-bg)' }}>
            {hours.map(h => (
              <div key={h} style={{
                height:PX, paddingRight:8, paddingTop:3,
                display:'flex', justifyContent:'flex-end', alignItems:'flex-start',
                color:'var(--t-fg-4)', fontFamily:'var(--font-mono)', fontSize:10,
              }}>{fmt2(h)}:00</div>
            ))}
          </div>
          {/* day columns */}
          {weekDays.map((d, di) => {
            const evs = eventsByDate.get(d.iso) ?? [];
            const isToday = d.iso === todayIso;
            return (
              <div key={d.iso} style={{
                position:'relative',
                borderRight: di<6 ? '1px solid var(--t-border)' : 'none',
                background: isToday ? 'color-mix(in oklab, var(--t-accent) 4%, var(--t-bg))' : 'var(--t-bg)',
              }}>
                {hours.map(h => (
                  <div key={h} style={{ height:PX, borderBottom:'1px solid var(--t-border)', position:'relative' }}>
                    <div style={{ position:'absolute', left:0, right:0, top:PX/2, borderTop:'1px dashed color-mix(in oklab, var(--t-border) 60%, transparent)' }}/>
                  </div>
                ))}
                {evs.map(ev => <WeekEventBlock key={ev.id} ev={ev} pxPerHour={PX} startH={START_H} onSelect={onEventClick}/>)}
                {/* now-line */}
                {isToday && nowTop >= 0 && (
                  <div style={{ position:'absolute', left:-4, right:0, top:nowTop, zIndex:5, pointerEvents:'none' }}>
                    <div style={{ display:'flex', alignItems:'center' }}>
                      <div style={{ width:9, height:9, borderRadius:'50%', background:'var(--t-accent)', boxShadow:'0 0 0 3px color-mix(in oklab, var(--t-accent) 25%, transparent)', flexShrink:0 }}/>
                      <div style={{ flex:1, height:2, background:'var(--t-accent)' }}/>
                      <span style={{
                        position:'absolute', left:12, top:-15,
                        fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color:'var(--t-accent-bright)',
                        padding:'1px 5px', borderRadius:4, background:'var(--t-accent-tint)',
                        border:'1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)',
                      }}>now · {fmt2(today.getHours())}:{fmt2(today.getMinutes())}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Agenda view ────────────────────────────────────────────────────────── */

function AgendaView({ year, month, eventsByDate, onEventClick }: {
  year: number; month: number;
  eventsByDate: Map<string, CalEvent[]>;
  onEventClick: (e: CalEvent) => void;
}) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${fmt2(today.getMonth()+1)}-${fmt2(today.getDate())}`;

  // Build 14 days starting today (or month start if different month)
  const ref = (today.getFullYear() === year && today.getMonth() === month) ? today : new Date(year, month, 1);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(ref); d.setDate(ref.getDate() + i - 1);
    const iso = `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}`;
    return { iso, day: d.getDate(), dow: d.getDay(), isToday: iso === todayIso, isPast: d < today && iso !== todayIso };
  });

  return (
    <div className="cal-noscroll" style={{ flex:1, overflow:'auto', background:'var(--t-bg)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'72px 1fr', padding:'8px 0' }}>
        {days.map((d, di) => {
          const evs = eventsByDate.get(d.iso) ?? [];
          return (
            <div key={d.iso} style={{ display:'contents' }}>
              {/* Day rail */}
              <div style={{
                padding:'14px 12px 14px 20px',
                borderRight:'1px solid var(--t-border)',
                borderTop: di>0 ? '1px solid var(--t-border)' : 'none',
                background: d.isToday ? 'color-mix(in oklab, var(--t-accent) 5%, var(--t-bg))' : 'var(--t-bg)',
              }}>
                <div style={{
                  fontSize:24, fontWeight:800, lineHeight:1, marginBottom:4,
                  color: d.isPast ? 'var(--t-fg-5)' : d.isToday ? 'var(--t-accent-bright)' : 'var(--cal-fg0)',
                  fontFamily:'var(--font-mono)',
                }}>{d.day}</div>
                <div className="cal-label" style={{ fontSize:9, letterSpacing:'.1em', color: d.isToday ? 'var(--t-accent-bright)' : 'var(--t-fg-4)' }}>
                  {fmt2(month+1)}月 · {DOW_ZH[d.dow]}
                </div>
                {d.isToday && <div style={{ marginTop:4, fontSize:11, fontWeight:600, color:'var(--t-accent-bright)' }}>今天</div>}
                <div className="cal-meta" style={{ marginTop:6, fontSize:9 }}>{evs.length} 计划</div>
              </div>

              {/* Events */}
              <div style={{
                padding:'8px 20px 14px',
                borderTop: di>0 ? '1px solid var(--t-border)' : 'none',
                background: d.isToday ? 'color-mix(in oklab, var(--t-accent) 3%, var(--t-bg))' : 'var(--t-bg)',
                display:'flex', flexDirection:'column', gap:6,
              }}>
                {evs.length === 0 ? (
                  <div style={{ padding:'10px 12px', fontSize:11.5, color:'var(--t-fg-5)', fontFamily:'var(--font-mono)', letterSpacing:'.04em' }}>
                    无计划 · ⌘N 新建
                  </div>
                ) : evs.map(ev => {
                  const c = SLOT_COLOR[ev.slot];
                  return (
                    <div key={ev.id} className="cal-agenda-row cal-ev"
                      onClick={() => onEventClick(ev)}
                      style={{
                        display:'grid', gridTemplateColumns:'70px 26px 1fr auto auto',
                        alignItems:'center', gap:12, padding:'9px 12px',
                        background:'var(--t-panel)',
                        border:`1px solid ${ev.status==='run' ? 'color-mix(in oklab,var(--t-accent) 40%,transparent)' : 'var(--t-border)'}`,
                        borderLeft:`3px solid ${c}`, borderRadius:8,
                        opacity: d.isPast ? 0.65 : 1, cursor:'pointer',
                        transition:'background 120ms',
                      }}>
                      <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:700, color:'var(--cal-fg0)' }}>
                          {fmtHM(ev.startH, ev.startM)}
                        </span>
                        <span className="cal-meta" style={{ fontSize:9 }}>→ {fmtHM(ev.startH, ev.startM + ev.durMin)}</span>
                      </div>
                      <CalAvatar glyph={ev.glyph} slot={ev.slot} size={24}/>
                      <div style={{ minWidth:0 }}>
                        <div style={{
                          fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          color:'var(--cal-fg0)',
                          textDecoration: d.isPast && ev.status==='ok' ? 'line-through' : 'none',
                          textDecorationColor:'var(--t-fg-5)',
                        }}>{ev.title}</div>
                        <div className="cal-meta" style={{ fontSize:9.5, display:'flex', gap:6, marginTop:2 }}>
                          <span>{ev.groupName}</span>
                          <span>·</span>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:9 }}>{ev.cronExpr}</span>
                        </div>
                      </div>
                      {/* status chip */}
                      <span style={{
                        display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6,
                        background: STATUS_TINT[ev.status], color: STATUS_COLOR[ev.status],
                        border:`1px solid color-mix(in oklab,${STATUS_COLOR[ev.status]} 30%,transparent)`,
                        fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:700, letterSpacing:'.04em',
                      }}>{STATUS_LABEL[ev.status]}</span>
                      <ArrowUpRight size={13} style={{ color:'var(--t-fg-5)', flexShrink:0 }}/>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Mini month (sidebar) ───────────────────────────────────────────────── */

function MiniMonth({ year, month, eventsByDate, onNav }: {
  year: number; month: number;
  eventsByDate: Map<string, CalEvent[]>;
  onNav: (delta: number) => void;
}) {
  const cells = useMemo(() => buildGrid(year, month), [year, month]);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${fmt2(today.getMonth()+1)}-${fmt2(today.getDate())}`;
  return (
    <div style={{ padding:'8px 12px 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'2px 2px 7px' }}>
        <span style={{ fontSize:12, fontWeight:700 }}>{year} 年 {MONTH_ZH[month]}月</span>
        <div style={{ display:'flex', gap:1 }}>
          {([-1,1] as const).map(d => (
            <button key={d} type="button" onClick={() => onNav(d)} style={{
              width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--t-fg-4)', cursor:'pointer', borderRadius:5, border:'none', background:'transparent',
              fontSize:14,
            }}>{d < 0 ? '‹' : '›'}</button>
          ))}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', rowGap:2 }}>
        {DOW_MINI.map((h, i) => (
          <span key={i} className="cal-label" style={{
            textAlign:'center', fontSize:9, paddingBottom:3,
            color: (i===0||i===6) ? 'var(--cal-wkend)' : 'var(--t-fg-4)',
          }}>{h}</span>
        ))}
        {cells.map((c, i) => {
          const isToday = c.inMonth && c.iso === todayIso;
          const dots = c.inMonth && c.iso ? Math.min(3, (eventsByDate.get(c.iso) ?? []).length) : 0;
          return (
            <div key={i} style={{
              height:24, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              position:'relative', borderRadius:5, cursor:'pointer',
              background: isToday ? 'var(--t-accent)' : 'transparent',
              color: isToday ? 'var(--t-accent-ink)' :
                     !c.inMonth ? 'var(--cal-out)' :
                     c.weekend ? 'var(--cal-wkend)' : 'var(--t-fg-2)',
              fontFamily:'var(--font-mono)', fontSize:11, fontWeight: isToday ? 800 : 500,
            }}>
              {c.day}
              {dots > 0 && !isToday && (
                <span style={{ position:'absolute', bottom:1, display:'flex', gap:1.5 }}>
                  {Array.from({ length: dots }).map((_, j) => (
                    <span key={j} style={{ width:3, height:3, borderRadius:'50%', background:'var(--t-accent)' }}/>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */

function CalSidebar({ year, month, eventsByDate, schedules, groupNames, slotOf, onNewPlan, onNav }: {
  year: number; month: number;
  eventsByDate: Map<string, CalEvent[]>;
  schedules: Schedule[];
  groupNames: Map<string, string>;
  slotOf: Map<string, string>;
  onNewPlan: (gid: string) => void;
  onNav: (delta: number) => void;
}) {
  const [nlText, setNlText] = useState('');

  // Find next upcoming schedule
  const nextSchedule = useMemo(() => {
    const now = new Date();
    let nearest: { sc: Schedule; name: string; slot: string; timeStr: string } | null = null;
    let minDiff = Infinity;
    for (const sc of schedules) {
      if (sc.next_run_time) {
        const d = new Date(sc.next_run_time);
        const diff = d.getTime() - now.getTime();
        if (diff > 0 && diff < minDiff) {
          minDiff = diff;
          nearest = {
            sc,
            name: groupNames.get(sc.group_id) ?? sc.group_id,
            slot: slotOf.get(sc.group_id) ?? 'a',
            timeStr: d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }),
          };
        }
      }
    }
    return nearest;
  }, [schedules, groupNames, slotOf]);

  // Groups with their schedules
  const groupEntries = useMemo(() => {
    const seen = new Map<string, { name: string; slot: string; count: number; cron: string }>();
    for (const sc of schedules) {
      if (!seen.has(sc.group_id)) {
        seen.set(sc.group_id, {
          name: groupNames.get(sc.group_id) ?? sc.group_id,
          slot: slotOf.get(sc.group_id) ?? 'a',
          count: 1,
          cron: sc.cron_expression,
        });
      } else {
        seen.get(sc.group_id)!.count++;
      }
    }
    return [...seen.entries()];
  }, [schedules, groupNames, slotOf]);

  return (
    <div style={{
      width:260, flexShrink:0, display:'flex', flexDirection:'column',
      background:'var(--t-panel)', borderRight:'1px solid var(--t-border)', minHeight:0,
    }}>
      {/* NL quick-add */}
      <div style={{ padding:12 }}>
        <div style={{
          padding:'10px 12px', background:'var(--t-panel-2)',
          border:'1px solid var(--t-border)', borderRadius:10,
          display:'flex', flexDirection:'column', gap:7,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{
              width:18, height:18, borderRadius:5, background:'var(--t-accent-tint)',
              color:'var(--t-accent-bright)', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:800, border:'1px solid color-mix(in oklab,var(--t-accent) 40%,transparent)',
            }}>✦</span>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--cal-fg0)' }}>一句话约计划</span>
            <span className="cal-meta" style={{ marginLeft:'auto', fontSize:9 }}>⌘N</span>
          </div>
          <input
            value={nlText} onChange={e => setNlText(e.target.value)}
            placeholder="每个工作日 09:00 让 Team 跑任务…"
            style={{
              padding:'7px 9px', borderRadius:7,
              background:'var(--t-bg)', border:'1px solid var(--t-border)',
              fontSize:11.5, color:'var(--cal-fg0)', outline:'none',
              fontFamily:'var(--font-sans)', width:'100%',
            }}
          />
          {groupEntries.length > 0 && (
            <select
              onChange={e => { if (e.target.value) { onNewPlan(e.target.value); e.target.value=''; } }}
              defaultValue=""
              style={{
                padding:'4px 8px', borderRadius:6, border:'1px solid var(--t-border)',
                background:'var(--t-panel)', color:'var(--t-fg-3)', fontSize:11,
                fontFamily:'var(--font-sans)', cursor:'pointer',
              }}>
              <option value="">↵ 选择团队确认</option>
              {groupEntries.map(([gid, g]) => <option key={gid} value={gid}>{g.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Mini month */}
      <MiniMonth year={year} month={month} eventsByDate={eventsByDate} onNav={onNav}/>
      <div style={{ height:1, background:'var(--t-border)', margin:'0 12px' }}/>

      {/* Team calendars */}
      {groupEntries.length > 0 && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px 4px' }}>
            <span className="cal-label" style={{ fontSize:9 }}>我的日历</span>
            <span className="cal-meta" style={{ fontSize:9 }}>{groupEntries.length} 个</span>
          </div>
          <div style={{ padding:'0 6px' }}>
            {groupEntries.map(([gid, g]) => (
              <div key={gid} style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 10px', borderRadius:7, cursor:'pointer' }}
                onClick={() => onNewPlan(gid)}>
                <span style={{
                  width:13, height:13, borderRadius:3,
                  background: SLOT_COLOR[g.slot], border:`1px solid ${SLOT_COLOR[g.slot]}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:9, color:'#fff', fontWeight:800,
                }}>✓</span>
                <CalAvatar glyph={g.name[0] ?? '?'} slot={g.slot} size={18}/>
                <span style={{ fontSize:11.5, fontWeight:500, color:'var(--t-fg-2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {g.name}
                </span>
                <span className="cal-meta" style={{ fontSize:9, flexShrink:0 }}>{g.count} 计划</span>
              </div>
            ))}
            <button type="button" onClick={() => groupEntries.length > 0 && onNewPlan(groupEntries[0][0])}
              style={{
                margin:'4px 10px', padding:'6px 10px', borderRadius:7, width:'calc(100% - 20px)',
                border:'1px dashed var(--t-border-2)', color:'var(--t-fg-4)', fontSize:11,
                fontFamily:'var(--font-mono)', letterSpacing:'.04em', cursor:'pointer', background:'transparent',
              }}>+ 新建定时计划</button>
          </div>
          <div style={{ flex:1, minHeight:10 }}/>
        </>
      )}

      {groupEntries.length === 0 && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px 16px', gap:10 }}>
          <span style={{ fontSize:28 }}>📅</span>
          <p style={{ margin:0, fontSize:12, color:'var(--t-fg-4)', textAlign:'center', lineHeight:1.5 }}>
            暂无定时计划<br/>
            <span style={{ fontSize:11, color:'var(--t-fg-5)' }}>在 Team 聊天页添加 Schedule</span>
          </p>
        </div>
      )}

      {/* Next trigger flash card */}
      {nextSchedule && (
        <div style={{ margin:'0 12px 12px', padding:11, borderRadius:10, background:'var(--t-panel-2)', border:'1px solid var(--t-border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:7 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--t-ok)', animation:'cal-blink 1.6s infinite', flexShrink:0 }}/>
            <span className="cal-label" style={{ fontSize:8.5 }}>下一次触发</span>
            <span className="cal-meta" style={{ marginLeft:'auto', fontSize:8.5 }}>
              {nextSchedule.timeStr}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <CalAvatar glyph={nextSchedule.name[0] ?? '?'} slot={nextSchedule.slot} size={24}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {nextSchedule.name}
              </div>
              <div className="cal-meta" style={{ fontSize:9 }}>{nextSchedule.sc.cron_expression}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */

function CalToolbar({ view, onViewChange, year, month, onNav, onToday, onRefresh, total, completed, warnCount, onNewPlan }: {
  view: ViewMode; onViewChange: (v: ViewMode) => void;
  year: number; month: number;
  onNav: (d: number) => void; onToday: () => void; onRefresh: () => void;
  total: number; completed: number; warnCount: number;
  onNewPlan: () => void;
}) {
  const VIEWS: { id: ViewMode; label: string }[] = [
    { id:'month', label:'月' }, { id:'week', label:'周' }, { id:'agenda', label:'列表' },
  ];
  return (
    <div style={{
      height:52, flexShrink:0, display:'flex', alignItems:'center', gap:12,
      padding:'0 20px', borderBottom:'1px solid var(--t-border)', background:'var(--t-panel)',
    }}>
      <button type="button" onClick={onToday} style={{
        height:28, padding:'0 12px', borderRadius:7, border:'1px solid var(--t-border)',
        background:'var(--t-panel-2)', color:'var(--cal-fg0)', fontSize:12, fontWeight:600, cursor:'pointer',
      }}>今天</button>
      <div style={{ display:'flex', gap:2 }}>
        {([-1,1] as const).map(d => (
          <button key={d} type="button" onClick={() => onNav(d)} style={{
            width:28, height:28, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--t-fg-3)', fontSize:16, cursor:'pointer', border:'none', background:'transparent',
          }}>{d < 0 ? <ChevronLeft size={15}/> : <ChevronRight size={15}/>}</button>
        ))}
      </div>
      <h2 style={{ margin:0, fontSize:20, fontWeight:800, letterSpacing:'-.02em', color:'var(--cal-fg0)' }}>
        {year} 年 {MONTH_ZH[month]}月
      </h2>
      <div style={{ flex:1 }}/>
      {/* metrics */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginRight:8 }}>
        <Metric label="已计划" value={String(total)} hint="本月"/>
        <Metric label="已完成" value={String(completed)} hint="本月" color="var(--t-ok)"/>
        {warnCount > 0 && <Metric label="失败" value={String(warnCount)} hint="本月" color="var(--t-err)"/>}
      </div>
      {/* view switcher */}
      <div style={{ display:'flex', padding:2, borderRadius:8, background:'var(--t-panel-2)', border:'1px solid var(--t-border)' }}>
        {VIEWS.map(v => (
          <button key={v.id} type="button" onClick={() => onViewChange(v.id)} style={{
            height:24, padding:'0 11px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
            color: view===v.id ? 'var(--cal-fg0)' : 'var(--t-fg-4)',
            background: view===v.id ? 'var(--t-panel-3,#1A1A1F)' : 'transparent',
            border: view===v.id ? '1px solid var(--t-border)' : '1px solid transparent',
          }}>{v.label}</button>
        ))}
      </div>
      <button type="button" onClick={onRefresh} style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--t-border)', background:'transparent', color:'var(--t-fg-4)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
        <RefreshCw size={13} strokeWidth={1.7}/>
      </button>
      <button type="button" onClick={onNewPlan} style={{
        height:28, padding:'0 13px', borderRadius:7,
        background:'var(--t-accent)', color:'var(--t-accent-ink)',
        fontSize:12.5, fontWeight:700, cursor:'pointer', border:'none',
        display:'inline-flex', alignItems:'center', gap:5,
      }}>
        <span style={{ fontSize:14 }}>+</span> 新建计划
      </button>
    </div>
  );
}

function Metric({ label, value, hint, color }: { label: string; value: string; hint: string; color?: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', lineHeight:1.1 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:15, fontWeight:800, color: color ?? 'var(--cal-fg0)' }}>{value}</span>
        <span className="cal-meta" style={{ fontSize:9 }}>{hint}</span>
      </div>
      <span className="cal-label" style={{ fontSize:9 }}>{label}</span>
    </div>
  );
}

/* ── Event detail panel ─────────────────────────────────────────────────── */

function EventDetailPanel({ event, schedule, onClose, onDelete }: {
  event: CalEvent;
  schedule?: Schedule;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const c = SLOT_COLOR[event.slot];
  const recentRuns = schedule?.runs?.slice(-5).reverse() ?? [];
  return (
    <div style={{
      width:320, flexShrink:0, display:'flex', flexDirection:'column',
      background:'var(--t-panel)', borderLeft:'1px solid var(--t-border)',
      minHeight:0, overflow:'hidden',
    }}>
      {/* header strip */}
      <div style={{ height:3, background:c, flexShrink:0 }}/>
      <div style={{ padding:'14px 18px 12px', borderBottom:'1px solid var(--t-border)', flexShrink:0,
        background:`linear-gradient(180deg, color-mix(in oklab,${c} 10%,var(--t-panel)) 0%, var(--t-panel) 100%)` }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          <CalAvatar glyph={event.glyph} slot={event.slot} size={24}/>
          <span style={{ fontSize:13, fontWeight:700, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.groupName}</span>
          <button type="button" onClick={() => onDelete(event.scheduleId)} title="删除计划"
            style={{ width:26, height:26, borderRadius:6, border:'none', background:'transparent', color:'var(--t-fg-5)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Trash2 size={13} strokeWidth={1.7}/>
          </button>
          <button type="button" onClick={onClose} style={{ width:26, height:26, borderRadius:6, border:'none', background:'transparent', color:'var(--t-fg-4)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={14} strokeWidth={2}/>
          </button>
        </div>
        <div style={{ fontSize:16, fontWeight:800, letterSpacing:'-.01em', marginBottom:6 }}>{event.title}</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <span style={{
            display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:5,
            background: STATUS_TINT[event.status], color: STATUS_COLOR[event.status],
            border:`1px solid color-mix(in oklab,${STATUS_COLOR[event.status]} 30%,transparent)`,
            fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:700,
          }}>{STATUS_LABEL[event.status]}</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--t-fg-4)' }}>{event.date} · {fmtHM(event.startH, event.startM)}</span>
        </div>
      </div>

      {/* body */}
      <div className="cal-noscroll" style={{ flex:1, overflow:'auto', padding:16, display:'flex', flexDirection:'column', gap:16 }}>
        {/* Schedule info */}
        <section>
          <div className="cal-label" style={{ fontSize:9, marginBottom:8 }}>Schedule</div>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <KV k="cron" v={event.cronExpr}/>
            <KV k="下次触发" v={schedule?.next_run_time ? new Date(schedule.next_run_time).toLocaleString('zh-CN') : '—'}/>
            <KV k="时区" v="Asia/Shanghai · GMT+8"/>
            {schedule && <KV k="任务" v={describeSchedule(schedule)}/>}
          </div>
        </section>

        {/* Run history */}
        {recentRuns.length > 0 && (
          <section>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span className="cal-label" style={{ fontSize:9 }}>执行记录</span>
              <span className="cal-meta" style={{ fontSize:9 }}>最近 {recentRuns.length} 次</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {recentRuns.map((r, i) => (
                <div key={r.run_id ?? i} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'5px 9px',
                  borderRadius:6, background:'var(--t-panel-2)',
                }}>
                  <span style={{
                    width:7, height:7, borderRadius:'50%', flexShrink:0,
                    background: r.status === 'succeeded' ? 'var(--t-ok)' : 'var(--t-err)',
                  }}/>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--t-fg-3)', flex:1 }}>
                    {new Date(r.triggered_at).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                  </span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:700, color: r.status === 'succeeded' ? 'var(--t-ok)' : 'var(--t-err)' }}>
                    {r.status === 'succeeded' ? 'OK' : 'ERR'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* footer */}
      <div style={{ padding:12, borderTop:'1px solid var(--t-border)', display:'flex', gap:7, flexShrink:0 }}>
        <button type="button" style={{
          flex:1, height:34, borderRadius:7, background:'var(--t-accent)', color:'var(--t-accent-ink)',
          fontSize:12.5, fontWeight:700, cursor:'pointer', border:'none',
        }}>▶ 立即触发</button>
        <button type="button" onClick={onClose} style={{
          height:34, padding:'0 12px', borderRadius:7, border:'1px solid var(--t-border)',
          background:'var(--t-panel-2)', color:'var(--t-fg-3)', fontSize:12, fontWeight:600, cursor:'pointer',
        }}>关闭</button>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'72px 1fr', gap:'4px 10px', alignItems:'baseline' }}>
      <span className="cal-label" style={{ fontSize:9, letterSpacing:'.07em' }}>{k}</span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:500, color:'var(--cal-fg1)', wordBreak:'break-all' }}>{v}</span>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */

export default function CalendarPage() {
  const today = new Date();
  const [view, setView]   = useState<ViewMode>('month');
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [drawerGroupId, setDrawerGroupId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const groups    = useInboxStore(s => s.groups);
  const currentId = useWorkspaceStore(s => s.currentId);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await listSchedules();
      setSchedules(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load schedules');
    } finally { setLoading(false); }
  }, [currentId]);

  useEffect(() => { void load(); }, [load]);

  // Build lookup maps
  const groupNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const slotOf = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    for (const sc of schedules) {
      if (!m.has(sc.group_id)) { m.set(sc.group_id, SLOTS[i % SLOTS.length]); i++; }
    }
    return m;
  }, [schedules]);

  const eventsByDate = useMemo(
    () => buildEvents(schedules, groupNames, slotOf, year, month),
    [schedules, groupNames, slotOf, year, month],
  );

  const navMonth = (delta: number) => {
    let m = month + delta, y = year;
    if (m > 11) { m = 0; y++; } else if (m < 0) { m = 11; y--; }
    setMonth(m); setYear(y);
  };

  const allEvs     = useMemo(() => [...eventsByDate.values()].flat(), [eventsByDate]);
  const total      = allEvs.length;
  const completed  = allEvs.filter(e => e.status === 'ok').length;
  const warnCount  = allEvs.filter(e => e.status === 'err' || e.status === 'warn').length;

  const selectedSchedule = selectedEvent
    ? schedules.find(s => s.schedule_id === selectedEvent.scheduleId)
    : undefined;

  async function handleDelete(scheduleId: string) {
    setDeleting(scheduleId);
    try { await deleteSchedule(scheduleId); await load(); setSelectedEvent(null); }
    catch { /* ignore */ } finally { setDeleting(null); }
  }

  return (
    <div className="cal-root" style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, background:'var(--t-bg)', color:'var(--cal-fg0)' }}>
      <style>{CAL_CSS}</style>

      <CalToolbar
        view={view} onViewChange={setView}
        year={year} month={month}
        onNav={navMonth} onToday={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
        onRefresh={() => void load()}
        total={total} completed={completed} warnCount={warnCount}
        onNewPlan={() => groups.length > 0 ? setDrawerGroupId(groups[0].id) : null}
      />

      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>
        <CalSidebar
          year={year} month={month}
          eventsByDate={eventsByDate}
          schedules={schedules}
          groupNames={groupNames}
          slotOf={slotOf}
          onNewPlan={gid => setDrawerGroupId(gid)}
          onNav={navMonth}
        />

        {/* main area */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, minHeight:0, overflow:'hidden' }}>
          {loading && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:10, color:'var(--t-fg-4)' }}>
              <RefreshCw size={16} strokeWidth={1.7} style={{ animation:'cal-spin 1s linear infinite' }}/>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>加载中…</span>
            </div>
          )}
          {!loading && error && (
            <div style={{ margin:24, padding:'12px 16px', borderRadius:8, background:`color-mix(in oklab,var(--t-err) 10%,var(--t-panel))`, border:'1px solid color-mix(in oklab,var(--t-err) 30%,transparent)', color:'var(--t-err)', fontSize:12, fontFamily:'var(--font-mono)' }}>
              {error}
            </div>
          )}
          {!loading && !error && view === 'month' && (
            <MonthView year={year} month={month} eventsByDate={eventsByDate} onEventClick={setSelectedEvent}/>
          )}
          {!loading && !error && view === 'week' && (
            <WeekView year={year} month={month} eventsByDate={eventsByDate} onEventClick={setSelectedEvent}/>
          )}
          {!loading && !error && view === 'agenda' && (
            <AgendaView year={year} month={month} eventsByDate={eventsByDate} onEventClick={setSelectedEvent}/>
          )}
        </div>

        {/* event detail */}
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            schedule={selectedSchedule}
            onClose={() => setSelectedEvent(null)}
            onDelete={id => void handleDelete(id)}
          />
        )}
      </div>

      {/* ScheduleDrawer */}
      {drawerGroupId && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:499, background:'rgba(0,0,0,.45)' }}
               onClick={() => { setDrawerGroupId(null); void load(); }}/>
          <ScheduleDrawer groupId={drawerGroupId} onClose={() => { setDrawerGroupId(null); void load(); }}/>
        </>
      )}

      {deleting && (
        <div style={{ position:'fixed', bottom:20, right:20, zIndex:600, padding:'10px 16px', borderRadius:8, background:'var(--t-panel)', border:'1px solid var(--t-border)', fontSize:12, color:'var(--t-fg-3)', display:'flex', alignItems:'center', gap:8 }}>
          <RefreshCw size={12} style={{ animation:'cal-spin 1s linear infinite' }}/> 删除中…
        </div>
      )}

      <style>{`@keyframes cal-spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
