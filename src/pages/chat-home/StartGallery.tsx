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
import { PawPrint } from 'lucide-react';
import { listSkills, type SkillInfo } from '../../api/skills';
import { listDetectedClis, type DetectedCli } from '../../api/cli';
import { resolveClawMeta } from '../../config/clawhub';
import { useI18n } from '../../common/i18n';
// ClawHub（2026-06）：.sg-claw-* 样式（增量引入，不动 neo-chat.css / index.css）
import '../clawhub/clawhub.css';

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
  onPickClaw,
}: {
  onPick: (token: string) => void;
  /** ClawHub（2026-06）：点击已安装 Claw → 父级把它设为聊天 target。 */
  onPickClaw?: (cliId: string) => void;
}) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [cat, setCat] = useState('全部');
  // ── ClawHub（2026-06，FR-03）：「已安装 Claw」分区（增量；后端未起时空区不渲染）
  const [claws, setClaws] = useState<DetectedCli[]>([]);

  useEffect(() => {
    let alive = true;
    listSkills()
      .then((rows) => {
        if (alive) setSkills(rows.filter((s) => s.enabled !== false && !isTestSkill(s)));
      })
      .catch(() => { if (alive) setSkills([]); });
    // Claw 分区数据（已安装 is_claw 条目）；接口失败静默降级为空
    listDetectedClis()
      .then((snap) => {
        if (alive) setClaws(snap.items.filter((i) => i.is_claw && i.installed));
      })
      .catch(() => { if (alive) setClaws([]); });
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
      {/* ── ClawHub（2026-06，FR-03）：「已安装 Claw」分区（增量；点击 = 选为聊天
          target：父级 NeoChat 消费 onPickClaw 注入 executor:'cli:<id>'）────────── */}
      {claws.length > 0 && (
        <div className="sg-claw-section">
          <span className="sg-claw-label">
            <PawPrint size={12} strokeWidth={2} aria-hidden />
            {t('clawhub.gallery.label', { defaultValue: '已安装 Claw（点击直接对话）' })}
          </span>
          <div className="sg-claw-list">
            {claws.map((c) => {
              const brand = resolveClawMeta(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="sg-claw-chip"
                  data-testid={`sg-claw-${c.id}`}
                  title={c.description ?? c.id}
                  onClick={() => onPickClaw?.(c.id)}
                >
                  <span
                    className="claw-brand-badge"
                    style={{
                      background: `color-mix(in oklab, ${brand.tint} 18%, transparent)`,
                      color: brand.tint,
                    }}
                    aria-hidden
                  >
                    {brand.monogram}
                  </span>
                  {c.id}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
