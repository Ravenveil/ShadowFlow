/**
 * NeoPricingQuestions — 「手工艺品代卖」定价提问卡（2026-11-07 用户定版）。
 *
 * 用户发来产品图片后，输入框上方弹出固定提问卡（内容固定、不走 LLM 动态
 * 生成——2026-11-07 用户要求「收到图片后固定一些提问」）：
 *   ① 售价定多少？② 成本多少？③ 快递费按单算多少？
 * 业务口径（2026-11-07 改版）：我们是手艺人自己在平台营销售卖——原第 2 问
 * 「给手艺人多少」改成「成本多少」，原第 4 问「营销分摊」整条删掉。
 *
 * 交互：点提问卡把答案脚手架（如「成本：」）填入输入框（不直接发送，用户
 * 补上数字自己发）；「×」收起。挂载点在 NeoChat / NeoGroupChat 的 composer
 * 容器内（NeoComposer 之前），触发条件由挂载方把控（发出带图片的提交后出现，
 * 回答或收起后隐藏）。
 */
import { X } from 'lucide-react';
import { useI18n } from '../common/i18n';
import './neo-pricing-questions.css';

export interface PricingQuestion {
  key: 'price' | 'cost' | 'shipping';
  /** 提问正文。 */
  title: string;
  /** 提示/举例（卡片副行，对应原提问的括号说明）。 */
  hint: string;
  /** 点击填入输入框的答案脚手架（用户补数字后发送）。 */
  fill: string;
}

/** 三条固定提问（2026-11-07 用户定版文案）。 */
export const PRICING_QUESTIONS: PricingQuestion[] = [
  {
    key: 'price',
    title: '售价定多少？',
    hint: '比如 9.9 / 15 / 19.9 元',
    fill: '售价：',
  },
  {
    key: 'cost',
    title: '成本多少？',
    hint: '材料+制作成本，按单件算',
    fill: '成本：',
  },
  {
    key: 'shipping',
    title: '快递费按单算多少？',
    hint: '一般 4-8 元，我也可以让快递联络员去谈个合作价',
    fill: '快递费：',
  },
];

export interface NeoPricingQuestionsProps {
  /** 点击提问卡 → 答案脚手架填入输入框（不直接发送）。 */
  onPick: (text: string) => void;
  /** 「×」收起提问卡。 */
  onDismiss: () => void;
}

export function NeoPricingQuestions({ onPick, onDismiss }: NeoPricingQuestionsProps) {
  const { t } = useI18n();
  return (
    <div className="neo-pricing-q" data-testid="neo-pricing-questions">
      <div className="neo-pricing-q-head">
        <span className="neo-pricing-q-title">
          {t('neo.pricing.title', { defaultValue: '定价提问' })}
        </span>
        <span className="neo-pricing-q-note">
          {t('neo.pricing.note', { defaultValue: '回答这几项就能上架 · 点一条填入输入框' })}
        </span>
        <button
          type="button"
          className="neo-pricing-q-close"
          onClick={onDismiss}
          aria-label={t('neo.pricing.dismiss', { defaultValue: '收起定价提问' })}
          data-testid="neo-pricing-dismiss"
        >
          <X size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="neo-pricing-q-list">
        {PRICING_QUESTIONS.map((q) => (
          <button
            key={q.key}
            type="button"
            className="neo-pricing-q-card"
            data-testid={`neo-pricing-q-${q.key}`}
            onClick={() => onPick(q.fill)}
          >
            <span className="neo-pricing-q-text">{q.title}</span>
            <span className="neo-pricing-q-hint">{q.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default NeoPricingQuestions;
