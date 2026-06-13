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
import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Workflow, FileCode, FileText, Boxes, Bot, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { listSkills, type SkillInfo } from '../../api/skills';

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

  useEffect(() => {
    let alive = true;
    listSkills()
      .then((rows) => { if (alive) setSkills(rows.filter((s) => s.enabled !== false)); })
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
      <div className="sg-tabs" role="tablist" aria-label="模板分类">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            className={`sg-tab${cat === c ? ' on' : ''}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="sg-grid">
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
