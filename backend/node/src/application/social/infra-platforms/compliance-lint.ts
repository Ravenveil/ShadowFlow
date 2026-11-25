/**
 * social-platforms/compliance-lint.ts — 发布前合规校验（2026-11-07）。
 *
 * 依据《内容生成规范与模板库 v1》第五章「合规校验清单」与《平台规则矩阵》
 * 三红线（2.2）：卖惨红线 / 广告法红线 / 功效红线，命中即打回并附违规词。
 *
 * 四道检查的机器可判部分：
 *   1. 词表检查  — 三红线词表逐条扫描（violations 附词与位置）；
 *   2. 结构检查  — 标题/正文字数对平台 title_max/content_max 越界报告
 *                  （只报告不裁剪——裁剪是 copy.clip 的事，lint 是审计视角）；
 *   3. 标识检查  — AIGC 显式声明是否在位（ai_label 勾选或文内声明块）；
 *   4. 人工门    — 不在本模块（发布链的 WAITING_HUMAN 审批，T09 语义）。
 *
 * 词表版本化（ruleset_version）：《规则矩阵》V10「各平台对助残/公益表述的
 * 审核口径」仍在待核，红线词表会随平台校准迭代——每次词表变更必须升版本号，
 * lint 结果连同 ruleset_version 一起入库，保证任何一条历史内容可回溯「当时
 * 按哪一版规则判的」。
 *
 * v1 匹配策略：子串匹配（广告法「最」类超高频字用常见搭配组代替裸字，
 * 降低误伤；裸字留给人工门）。lint 是打回候选不是终审，人工门复核误伤。
 */

import { findPlatform } from './index';

/** 词表版本——词表任何变更必须升版本（2026-11-07 初版）。 */
export const RULESET_VERSION = '2026-11-07.v1';

/** 卖惨红线（去标签化）：不以残障身份制造消费愧疚感。 */
export const SELL_PITY_WORDS: readonly string[] = [
  '卖惨',
  '施舍',
  '可怜',
  '残废',
  '脑瘫儿',
  '脑瘫',
  '苦日子',
  '献爱心',
  '救助',
  '帮扶',
  '爱心义卖',
  '残障人士手作',
  '残障人士',
  '残疾人手作',
  '残疾人',
];

/**
 * 广告法红线：绝对化用语与虚假宣传。「最」「第一」按常见搭配组匹配
 * （裸「最」误伤「最后/最近」，留给人工门），其余逐字照抄词表。
 */
export const AD_LAW_WORDS: readonly string[] = [
  '最好',
  '最佳',
  '最优',
  '最强',
  '最低',
  '最高',
  '最快',
  '最新',
  '第一',
  '顶级',
  '国家级',
  '全网最低',
  '100%',
  '绝对',
  '永久',
  '根治',
  '治愈',
  '药到病除',
];

/** 功效红线：无资质不得宣称功效（v1 无资质档位，一刀切保守禁）。 */
export const EFFICACY_WORDS: readonly string[] = [
  '美白',
  '祛痘',
  '抗衰',
  '杀菌',
  '抗菌',
  '保健',
  '疗效',
  '消炎',
  '防脱',
  '生发',
];

export type ViolationType = 'sell_pity' | 'ad_law' | 'efficacy' | 'structure' | 'ai_label';

export interface ComplianceViolation {
  /** 违规类别：sell_pity / ad_law / efficacy / structure / ai_label。 */
  type: ViolationType;
  /** 命中的词（structure/ai_label 类为规则描述）。 */
  word: string;
  /** 命中位置：'title' | 'content'。 */
  field: 'title' | 'content' | '';
  /** 命中下标（field 内）。 */
  index: number;
}

export interface LintResult {
  /** 恒 true——该对象落 sp_posts.compliance_json 标记「已过 lint」。 */
  checked: true;
  /** 是否零违规（机器可判面；人工门是另一道独立关卡）。 */
  passed: boolean;
  violations: ComplianceViolation[];
  /** 结构检查：只报告，不裁剪。 */
  structural: {
    platform: string;
    title_max: number;
    content_max: number;
    title_len: number;
    content_len: number;
    title_over: boolean;
    content_over: boolean;
  };
  /** AIGC 标识检查：显式声明是否在位。 */
  ai_label_present: boolean;
  /** 词表版本（入库可回溯）。 */
  ruleset_version: string;
}

export interface LintInput {
  platform: string;
  title?: string;
  content?: string;
  /** 发布器勾选的 AI 生成声明（sp_posts.ai_label）。 */
  ai_label?: boolean;
  /** 声明文案（sp_posts.label_text）；content 内含此文案也视同在位。 */
  label_text?: string;
}

function scanWords(
  text: string,
  words: readonly string[],
  type: ViolationType,
  field: 'title' | 'content',
  out: ComplianceViolation[],
): void {
  for (const w of words) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(w, from);
      if (idx === -1) break;
      out.push({ type, word: w, field, index: idx });
      from = idx + w.length; // 同词不重复报重叠命中
    }
  }
}

/** AIGC 显式声明的常见落位文样（发布器勾选 or 文内声明块）。 */
const AI_LABEL_PATTERNS = ['内容由 AI 生成', '内容由AI生成', 'AI 生成', 'AI生成', '人工智能生成'];

/**
 * 发布前合规校验。纯函数、不落库（路由层负责把结果写进
 * sp_posts.compliance_json / ruleset_version）。
 */
export function lintContent(input: LintInput): LintResult {
  const title = input.title ?? '';
  const content = input.content ?? '';
  const spec = findPlatform(input.platform);
  const title_max = spec?.title_max ?? 0;
  const content_max = spec?.content_max ?? 0;

  const violations: ComplianceViolation[] = [];
  scanWords(title, SELL_PITY_WORDS, 'sell_pity', 'title', violations);
  scanWords(title, AD_LAW_WORDS, 'ad_law', 'title', violations);
  scanWords(title, EFFICACY_WORDS, 'efficacy', 'title', violations);
  scanWords(content, SELL_PITY_WORDS, 'sell_pity', 'content', violations);
  scanWords(content, AD_LAW_WORDS, 'ad_law', 'content', violations);
  scanWords(content, EFFICACY_WORDS, 'efficacy', 'content', violations);

  // 结构检查：越界报告（裁剪是 copy.clip 的职责，lint 审计只报告）。
  const title_over = title_max > 0 && title.length > title_max;
  const content_over = content_max > 0 && content.length > content_max;
  if (title_over) {
    violations.push({ type: 'structure', word: `title 超 ${title_max} 字`, field: 'title', index: title_max });
  }
  if (content_over) {
    violations.push({ type: 'structure', word: `content 超 ${content_max} 字`, field: 'content', index: content_max });
  }

  // 标识检查：发布器勾选（ai_label=true）或文内声明块（label_text / 常见文样）。
  const labelCandidates = [
    ...(input.label_text ? [input.label_text] : []),
    ...AI_LABEL_PATTERNS,
  ];
  const ai_label_present =
    input.ai_label === true || labelCandidates.some((p) => p.length > 0 && content.includes(p));
  if (!ai_label_present) {
    violations.push({ type: 'ai_label', word: 'AIGC 显式声明缺失', field: 'content', index: 0 });
  }

  return {
    checked: true,
    passed: violations.length === 0,
    violations,
    structural: {
      platform: input.platform,
      title_max,
      content_max,
      title_len: title.length,
      content_len: content.length,
      title_over,
      content_over,
    },
    ai_label_present,
    ruleset_version: RULESET_VERSION,
  };
}
