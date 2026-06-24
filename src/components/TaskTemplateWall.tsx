/**
 * TaskTemplateWall — clawsgo-style wall of one-click task templates.
 *
 * A grid of rich template cards (深度调研 / 论文复现 / 数据分析 / 交付专业Word …).
 * Each card has a line icon, a title, a one-line description and a category tag.
 * Clicking a card hands its prompt back to the parent (onPick) which fills the
 * composer — the first-impression "describe → go" flow.
 *
 * Round 1 sources templates from a small typed const list in this file (the
 * skills/registry path can be wired later without changing the public API).
 *
 * Style convention matches the repo: inline styles + CSS vars
 * (--t-fg / --t-accent / --t-panel / --t-panel-2 / --t-border / --t-accent-tint …).
 */
import { useState, type ReactNode } from 'react';
import {
  Telescope,
  FlaskConical,
  BarChart3,
  FileText,
  Globe,
  Presentation,
} from 'lucide-react';

export interface TaskTemplate {
  id: string;
  icon: ReactNode;
  title: string;
  desc: string;
  tag: string;
  /** Prompt text injected into the composer when the card is clicked. */
  prompt: string;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'deep-research',
    icon: <Telescope size={18} strokeWidth={1.8} />,
    title: '深度调研',
    desc: '多源检索 + 交叉验证，产出带引用的研究报告',
    tag: '调研',
    prompt:
      '请对【主题】做一次深度调研：分多个角度检索权威来源，交叉验证关键事实，最后产出一份结构化、带引用出处的研究报告。',
  },
  {
    id: 'paper-repro',
    icon: <FlaskConical size={18} strokeWidth={1.8} />,
    title: '论文复现',
    desc: '拆解方法、还原实验、跑通代码并核对结果',
    tag: '科研',
    prompt:
      '请帮我复现这篇论文【论文标题/链接】：拆解其核心方法，列出实验步骤，编写并跑通可运行代码，最后将复现结果与原文指标对比。',
  },
  {
    id: 'data-analysis',
    icon: <BarChart3 size={18} strokeWidth={1.8} />,
    title: '数据分析',
    desc: '清洗 → 探索 → 可视化 → 洞察结论一条龙',
    tag: '数据',
    prompt:
      '请对我提供的数据集做分析：先做数据清洗与质量检查，再做探索性分析与可视化，最后给出关键洞察和可执行建议。',
  },
  {
    id: 'pro-word',
    icon: <FileText size={18} strokeWidth={1.8} />,
    title: '交付专业 Word',
    desc: '排版规范的 .docx：目录 / 标题 / 页码齐全',
    tag: '文档',
    prompt:
      '请把以下内容整理成一份专业的 Word 文档（.docx）：包含封面、自动目录、分级标题、页码与统一排版，可直接交付。',
  },
  {
    id: 'web-page',
    icon: <Globe size={18} strokeWidth={1.8} />,
    title: '搭建网页',
    desc: '从需求到可预览的响应式单页站点',
    tag: '前端',
    prompt:
      '请帮我搭建一个网页【用途/主题】：设计版式与配色，实现响应式布局，产出可直接预览的页面代码。',
  },
  {
    id: 'slides',
    icon: <Presentation size={18} strokeWidth={1.8} />,
    title: '生成演示稿',
    desc: '把主题拆成结构化、可讲解的幻灯片',
    tag: '演示',
    prompt:
      '请围绕【主题】生成一份演示稿：搭好叙事结构，分页给出标题与要点，配上讲解备注，便于直接演讲。',
  },
];

export interface TaskTemplateWallProps {
  /** Called with the template's prompt when a card is clicked. */
  onPick: (prompt: string, template: TaskTemplate) => void;
  /** Optional section label override. */
  label?: string;
  templates?: TaskTemplate[];
}

function TemplateCard({
  tpl,
  onPick,
}: {
  tpl: TaskTemplate;
  onPick: TaskTemplateWallProps['onPick'];
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-testid={`task-template-${tpl.id}`}
      onClick={() => onPick(tpl.prompt, tpl)}
      className="hf-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        background: 'var(--t-panel)',
        color: 'var(--t-fg)',
        fontFamily: 'inherit',
        borderColor: hover
          ? 'color-mix(in oklab, var(--t-accent) 42%, var(--t-border))'
          : undefined,
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover
          ? '0 14px 30px -16px color-mix(in oklab, var(--t-accent) 45%, transparent)'
          : undefined,
        transition:
          'transform 160ms cubic-bezier(.2,.8,.2,1), box-shadow 160ms ease, border-color 160ms ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 10,
            background: hover ? 'var(--t-accent)' : 'var(--t-accent-tint)',
            color: hover ? 'var(--t-accent-ink, #fff)' : 'var(--t-accent)',
            flexShrink: 0,
            transition: 'background 160ms ease, color 160ms ease',
          }}
        >
          {tpl.icon}
        </span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '.04em',
            padding: '3px 8px',
            borderRadius: 999,
            background: 'var(--t-panel-2)',
            color: 'var(--t-fg-4)',
            border: '1px solid var(--t-border)',
            flexShrink: 0,
          }}
        >
          {tpl.tag}
        </span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t-fg)' }}>{tpl.title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--t-fg-3)' }}>{tpl.desc}</div>
    </button>
  );
}

export function TaskTemplateWall({
  onPick,
  label = '从一个任务模板开始',
  templates = TASK_TEMPLATES,
}: TaskTemplateWallProps) {
  return (
    <section style={{ width: '100%' }} data-testid="task-template-wall" data-section="task-templates">
      <div className="hf-label" style={{ marginBottom: 10 }}>
        {label}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
        }}
      >
        {templates.map((tpl) => (
          <TemplateCard key={tpl.id} tpl={tpl} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

export default TaskTemplateWall;
