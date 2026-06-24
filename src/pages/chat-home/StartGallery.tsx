/**
 * StartGallery — clawsgo 式开始页模板画廊（2026-06-13）。
 *
 * 对标 clawsgo 进站首屏：大输入框下方 = 分类 tab + 模板卡片网格。
 * **真实数据，零 mock**：卡片来自 GET /api/skills（listSkills），每张卡 =
 * 一个 skill（name + description + domain/kind 标签）。点击卡片 → 把
 * `@<skill_id> ` 预填进 UnifiedComposer（其 parseSkillToken 自动选中该
 * skill），用户接着打字即带 skill 发起 run。
 *
 * 不臆造 clawsgo 卡片上的「交付X · 约N分钟」——那是我们数据里没有的字段，
 * 编造即 mock。只渲染 skill 的真实字段。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Workflow, FileCode, FileText, Boxes, Bot, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { listSkills, type SkillInfo } from '../../api/skills';

/** 过滤掉测试/演示 skill（id 或 name 含测试关键词）。 */
function isTestSkill(s: SkillInfo): boolean {
  const id = s.skill_id ?? '';
  const name = (s.name ?? '').toLowerCase();
  const desc = (s.description ?? '').toLowerCase();
  // id 以 test- / demo- 开头
  if (/^(test|demo)-/i.test(id)) return true;
  // 已知测试 id
  if (['editor-export-demo', 'test-15-28-from-browser', 'test-15-28-skill'].includes(id)) return true;
  // name/desc 含测试关键词
  if (name.includes('15.28') || desc.includes('15.28')) return true;
  if (desc.includes('e2e test') || desc.includes('verification') || desc.includes('从 editor 导出')) return true;
  return false;
}

// domain → 友好中文 + 配图标（缺失 domain 回落 kind / 其他）。
const DOMAIN_LABEL: Record<string, string> = {
  general: '通用',
  design: '设计',
  engineering: '工程',
  product: '产品',
  research: '研究',
  writing: '写作',
  data: '数据',
  business: '商业',
};
const KIND_ICON: Record<string, LucideIcon> = {
  workflow: Workflow,
  generator: FileCode,
  capability: Wrench,
};
const DOMAIN_ICON: Record<string, LucideIcon> = {
  general: Boxes,
  design: FileCode,
  engineering: Wrench,
  product: Bot,
  research: FileText,
};

function catOf(s: SkillInfo): string {
  return (s.domain && DOMAIN_LABEL[s.domain]) || s.domain || '其他';
}
function iconOf(s: SkillInfo): LucideIcon {
  return (s.domain && DOMAIN_ICON[s.domain]) || (s.kind && KIND_ICON[s.kind]) || Sparkles;
}

export function StartGallery({ onPick }: { onPick: (token: string) => void }) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [cat, setCat] = useState<string>('全部');
  // 滑动下划线指示条（参照 RightPaneTabs.tsx .rs-tab-ind 实现）
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const activeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const measure = () => {
    const btn = activeBtnRef.current;
    if (!btn || !btn.offsetWidth) { setInd(null); return; }
    const next = { x: btn.offsetLeft, w: btn.offsetWidth };
    setInd((prev) => (prev && prev.x === next.x && prev.w === next.w ? prev : next));
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useLayoutEffect(() => { measureRef.current(); });
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureRef.current());
    if (tabsRef.current) ro.observe(tabsRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    listSkills()
      .then((rows) => {
        if (alive) setSkills(rows.filter((s) => s.enabled !== false && !isTestSkill(s)));
      })
      .catch(() => { if (alive) setSkills([]); });
    return () => { alive = false; };
  }, []);

  const cats = useMemo(() => {
    if (!skills) return ['全部'];
    const seen: string[] = [];
    for (const s of skills) {
      const c = catOf(s);
      if (!seen.includes(c)) seen.push(c);
    }
    return ['全部', ...seen];
  }, [skills]);

  const shown = useMemo(() => {
    if (!skills) return [];
    return cat === '全部' ? skills : skills.filter((s) => catOf(s) === cat);
  }, [skills, cat]);

  if (skills === null) {
    // 真加载骨架（批1 .sf-skeleton）
    return (
      <div className="sg-grid" aria-busy="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sf-skeleton" style={{ height: 96, borderRadius: 'var(--r-card)' }} />
        ))}
      </div>
    );
  }
  if (skills.length === 0) return null;

  return (
    <div className="sg-wrap">
      <div
        className={`sg-tabs${ind ? ' has-ind' : ''}`}
        role="tablist"
        aria-label="模板分类"
        ref={tabsRef}
      >
        {cats.map((c) => {
          const isActive = cat === c;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`sg-tab${isActive ? ' on' : ''}`}
              onClick={() => setCat(c)}
              ref={isActive ? (el) => { activeBtnRef.current = el; } : undefined}
            >
              {c}
            </button>
          );
        })}
        {/* 滑动指示条 — 测量成功才渲染；失败时 .sg-tab.on 的 border 兜底 */}
        {ind && (
          <span
            aria-hidden
            className="sg-tab-ind"
            style={{ transform: `translateX(${ind.x}px)`, width: ind.w }}
          />
        )}
      </div>
      <div key={cat} className="sg-grid sg-grid-fade">
        {shown.map((s) => {
          const Icon = iconOf(s);
          return (
            <button
              key={s.skill_id}
              type="button"
              className="sg-card"
              data-testid={`sg-card-${s.skill_id}`}
              onClick={() => onPick(`@${s.skill_id} `)}
              title={s.description}
            >
              <div className="sg-card-head">
                <span className="sg-card-icon"><Icon size={15} strokeWidth={1.9} aria-hidden /></span>
                <span className="sg-card-name">{s.name}</span>
                {s.has_team && <span className="sg-card-team">团队</span>}
              </div>
              <div className="sg-card-desc">{s.description}</div>
              <div className="sg-card-foot">
                <span className="sg-card-cat">{catOf(s)}</span>
                {s.source === 'user' && <span className="sg-card-user">自建</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
