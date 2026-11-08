/**
 * PricingSection.tsx — 价格方案区块（按设计稿导出的独立 React 组件）
 * 对应设计：标题「从一个项目开始，搭建你的 AI 公司。」+ 副标题 + 三张价格卡（体验版 / 工作室版 / 专业定制版）
 * 用法：<PricingSection onAction={(planName) => console.log(planName)} />
 * 无外部依赖；样式经组件内 <style> 注入，类名以 sp- 前缀隔离。
 * （原交付为 .jsx，落库改 .tsx 仅为通过项目 strict 类型检查，内容与设计一致）
 */

export interface PricingPlan {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
}

const defaultPlans: PricingPlan[] = [
  {
    name: "体验版",
    price: "免费",
    features: ["3 位预设 AI 员工", "500基础积分"],
  },
  {
    name: "工作室版",
    price: "66RMB/ 月",
    features: ["1000+2000赠送积分", "多客户项目管理", "客户品牌知识库"],
    featured: true,
  },
  {
    name: "专业定制版",
    price: "定制",
    features: ["专属 Skill 与员工", "知识库迁移", "定制工作流与部署"],
  },
];

const buttonLabels: Record<string, string> = {
  体验版: "免费开始",
  工作室版: "开始 14 天试用",
  专业定制版: "联系方案顾问",
};

export default function PricingSection({
  plans = defaultPlans,
  onAction,
}: {
  plans?: PricingPlan[];
  onAction?: (planName: string) => void;
}) {
  return (
    <section className="sp-section">
      <style>{styles}</style>
      <div className="sp-shell">
        <div className="sp-heading">
          <h2>从一个项目开始，搭建你的 AI 公司。</h2>
          <p>以下为产品规划参考，正式价格与方案以公布为准。</p>
        </div>
        <div className="sp-grid">
          {plans.map((plan) => (
            <article key={plan.name} className={plan.featured ? "sp-card sp-featured" : "sp-card"}>
              <h3>{plan.name}</h3>
              <div className="sp-price">{plan.price}</div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button type="button" onClick={() => onAction && onAction(plan.name)}>
                {buttonLabels[plan.name] || "联系我们"}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const styles = `
.sp-section {
  background: #f7f4ed;
  padding: 96px 24px;
  font-family: "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
  color: #17162d;
}
.sp-shell {
  max-width: 1180px;
  margin: 0 auto;
}
.sp-heading {
  text-align: center;
}
.sp-heading h2 {
  margin: 0;
  font-size: clamp(1.75rem, 3.2vw, 2.4rem);
  font-weight: 900;
  letter-spacing: -0.04em;
}
.sp-heading p {
  margin: 18px 0 0;
  color: #77737d;
  font-size: 13px;
}
.sp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-top: 60px;
  align-items: stretch;
}
.sp-card {
  display: flex;
  flex-direction: column;
  border: 1px solid #c5c1ba;
  background: #ffffff;
  padding: 32px;
}
.sp-featured {
  border: 2px solid #ff5e3a;
}
.sp-card h3 {
  margin: 0;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: -0.03em;
}
.sp-price {
  margin-top: 20px;
  font-size: 34px;
  font-weight: 900;
  letter-spacing: -0.05em;
}
.sp-card ul {
  margin: 22px 0 24px;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sp-card li {
  color: #77737d;
  font-size: 11px;
  line-height: 1.7;
}
.sp-card button {
  margin-top: auto;
  border: 1px solid #17162d;
  background: transparent;
  color: #17162d;
  padding: 13px 15px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.sp-card button:hover,
.sp-featured button {
  background: #17162d;
  color: #ffffff;
}
@media (max-width: 900px) {
  .sp-grid {
    grid-template-columns: 1fr;
    max-width: 600px;
    margin-inline: auto;
    margin-top: 45px;
  }
}
@media (max-width: 640px) {
  .sp-section {
    padding: 72px 16px;
  }
  .sp-card {
    padding: 26px;
  }
}
`;
