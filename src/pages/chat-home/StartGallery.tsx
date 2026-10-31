/**
 * StartGallery — clawsgo 式开始页模板画廊（2026-06-13）。
 *
 * 对标 clawsgo 进站首屏：大输入框下方 = 分类 tab + 模板卡片网格。
 * **真实数据，零 mock**：卡片来自 GET /api/skills（listSkills），每张卡 =
 * 一个 skill（name + description + domain/kind 标签）。点击卡片 → 把
 * `@<skill_id> ` 预填进 UnifiedComposer（其 parseSkillToken 自动选中该
 * skill），用户接着打字即带 skill 发起 run。
 *
 * 不臆造 clawsgo 卡片上的「交付X · 约N分钟」——SkillInfo（src/api/skills.ts）
 * 没有交付物/耗时字段，编造即 mock。故无 meta 行，只渲染 skill 的真实字段。
 *
 * 2026-08-19 二次改版（用户拍板）：列表嫌丑，简化成「药丸 chip 流」——
 * 只保留名称，去掉描述与箭头，chip 横向流动自动换行（flex-wrap），形态与
 * 上方分类 tab 胶囊统一。不再渲染任何封面/缩略图（cover_url 字段保留在
 * 数据里，前端不展示）。分类 tab 仍为分段胶囊轨。样式在 neo-chat.css，
 * 作用域 .neo-empty。
 */
import { useEffect, useMemo, useState } from 'react';
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

// domain → 友好中文（缺失 domain 回落原值 / 其他）。分类名是 ShadowFlow
// 自己的 taxonomy，不跟随 clawsgo（用户拍板 2026-08-19）。
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

function catOf(s: SkillInfo): string {
  return (s.domain && DOMAIN_LABEL[s.domain]) || s.domain || '其他';
}

export function StartGallery({
  onPick,
}: {
  onPick: (token: string) => void;
}) {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [cat, setCat] = useState('全部');

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
    // 真加载骨架（批1 .sf-skeleton），chip 尺寸
    return (
      <div className="sg-list" aria-busy="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sf-skeleton" style={{ width: 88 + (i % 3) * 22, height: 28, borderRadius: 999 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="sg-wrap">
      {/* ClawHub 入口已移除（2026-10-31 用户需求）：首页不再显示 Claw 分区，
          改为 composer 加号菜单内「从 ClawHub 挑选」（NeoComposer PlusMenu）。 */}
      <div
        className="sg-tabs"
        role="tablist"
        aria-label="模板分类"
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
            >
              {c}
            </button>
          );
        })}
      </div>
      <div key={cat} className="sg-list sg-grid-fade">
        {shown.map((s) => (
          <button
            key={s.skill_id}
            type="button"
            className="sg-chip"
            data-testid={`sg-card-${s.skill_id}`}
            onClick={() => onPick(`@${s.skill_id} `)}
            title={s.description}
          >
            {/* chip 流：只保留名称，描述进 title 悬停提示 */}
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
