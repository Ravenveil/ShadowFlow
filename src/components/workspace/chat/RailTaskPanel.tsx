/**
 * RailTaskPanel — 任务看板（Rail "task" tab）
 * 参考飞书任务 / Linear / Notion Board 三栏看板
 */

import { useState } from 'react';
import { FBAv } from '../FBAtoms';
import { CI } from './icons';

type TaskStatus = 'todo' | 'doing' | 'done';

interface TaskItem {
  id: string;
  title: string;
  assignee: { glyph: string; color: string; name: string };
  priority: 'P0' | 'P1' | 'P2';
  due?: string;
  tags?: string[];
}

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: 'todo', label: '待办', accent: 'var(--t-fg-3)' },
  { key: 'doing', label: '进行中', accent: 'var(--status-run)' },
  { key: 'done', label: '已完成', accent: 'var(--status-ok)' },
];

const MOCK_TASKS: Record<TaskStatus, TaskItem[]> = {
  todo: [
    { id: 't1', title: '§4.2 RetroCorr 数据核实', assignee: { glyph: '查', color: 'var(--t-gated, var(--t-accent))', name: '查查' }, priority: 'P0', due: '今天', tags: ['核验'] },
    { id: 't2', title: '补充 baseline 对比表', assignee: { glyph: '写', color: 'var(--t-err)', name: '小写' }, priority: 'P1', due: '明天' },
    { id: 't3', title: '生成论文摘要卡片', assignee: { glyph: '读', color: 'var(--t-accent)', name: '读读' }, priority: 'P2' },
  ],
  doing: [
    { id: 't4', title: '§6.3 Tab.2 原始数据 diff', assignee: { glyph: '写', color: 'var(--t-err)', name: '小写' }, priority: 'P0', due: '今天', tags: ['重写 r2/3'] },
    { id: 't5', title: '§5.1 方法论一致性检查', assignee: { glyph: '批', color: 'var(--t-warn)', name: '阿批' }, priority: 'P1' },
  ],
  done: [
    { id: 't6', title: '全文精读 12 篇', assignee: { glyph: '读', color: 'var(--t-accent)', name: '读读' }, priority: 'P1', tags: ['已归档'] },
    { id: 't7', title: '引用格式校验 47/47', assignee: { glyph: '查', color: 'var(--t-gated, var(--t-accent))', name: '查查' }, priority: 'P2' },
  ],
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'var(--status-reject)',
  P1: 'var(--status-warn)',
  P2: 'var(--t-fg-4)',
};

function TaskCard({ task }: { task: TaskItem }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, background: 'var(--t-panel-2)',
      border: '1px solid var(--t-border)', cursor: 'pointer',
      transition: 'border-color 120ms',
    }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--t-accent)')}
       onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--t-border)')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
          color: PRIORITY_COLOR[task.priority], padding: '1px 5px', borderRadius: 3,
          background: `color-mix(in oklab, ${PRIORITY_COLOR[task.priority]} 12%, transparent)`,
          border: `1px solid color-mix(in oklab, ${PRIORITY_COLOR[task.priority]} 25%, transparent)`,
        }}>{task.priority}</span>
        {task.tags?.map(tag => (
          <span key={tag} style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)',
            padding: '1px 5px', borderRadius: 3, background: 'var(--t-panel-3)',
            border: '1px solid var(--t-border)',
          }}>{tag}</span>
        ))}
        <span style={{ flex: 1 }} />
        <FBAv glyph={task.assignee.glyph} color={task.assignee.color} size={20} square />
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-fg)', lineHeight: 1.4 }}>{task.title}</div>
      {task.due && (
        <div style={{
          marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 11, height: 11, display: 'flex' }}>{CI.cal}</span>
          {task.due}
        </div>
      )}
    </div>
  );
}

export function RailTaskPanel() {
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const total = Object.values(MOCK_TASKS).reduce((s, arr) => s + arr.length, 0);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid var(--t-border)',
        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--skin-panel)', flexShrink: 0,
      }}>
        <span style={{ width: 18, height: 18, display: 'flex', color: 'var(--t-accent-bright)' }}>{CI.task}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>任务看板</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>{total} 项</span>
        <span style={{ flex: 1 }} />
        {(['all', 'mine'] as const).map(f => (
          <span key={f} onClick={() => setFilter(f)} style={{
            padding: '3px 10px', borderRadius: 11, fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
            background: f === filter ? 'var(--t-accent-tint)' : 'var(--t-panel-2)',
            color: f === filter ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
            border: `1px solid ${f === filter ? 'color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'var(--t-border)'}`,
          }}>{f === 'all' ? '全部' : '我的'}</span>
        ))}
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 12, padding: 14 }}>
        {COLUMNS.map(col => (
          <div key={col.key} style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
              borderRadius: 6, background: 'var(--t-panel)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: col.accent,
              }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t-fg-2)' }}>{col.label}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)',
                padding: '0 5px', borderRadius: 8, background: 'var(--t-panel-2)',
                border: '1px solid var(--t-border)',
              }}>{MOCK_TASKS[col.key].length}</span>
            </div>
            {MOCK_TASKS[col.key].map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
