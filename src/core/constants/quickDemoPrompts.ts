export interface TemplateDemo {
  prompt: string;
  painPoint: { en: string; zh: string };
}

export const QUICK_DEMO_PROMPTS: Record<string, TemplateDemo> = {
  solo_company: {
    prompt: '修登录 bug + 发 CSV 推文 + 回邮件 + 评估 GDPR',
    painPoint: {
      en: 'Morning solo: squash a bug, tweet, reply emails, run GDPR check',
      zh: '早晨一个人要搞定 bug / 推文 / 邮件 / GDPR 评估',
    },
  },
  academic_paper: {
    prompt: '把本周实验日志编成带对比分析的 Results 章节,缺数据就问我',
    painPoint: {
      en: 'Lab notes scattered, advisor wants the Results section by Friday',
      zh: '实验日志散落不成章，导师催稿 deadline 逼近',
    },
  },
  newsroom: {
    prompt: '地震突发,30 分钟内出三条差异化稿件 + 改发稿制度为双审核',
    painPoint: {
      en: 'Breaking quake: 3 unique stories in 30 min, switch to dual-review',
      zh: '突发新闻 30 分钟出稿，还得核实来源赶排版',
    },
  },
  modern_startup: {
    prompt: 'PM 写 spec + 工程拆 ticket + 设计出原型 + 周五晨会汇报',
    painPoint: {
      en: 'PM specs, eng tickets, design mocks, Friday standup — all mouth-to-mouth',
      zh: 'PM 写 spec、工程拆 ticket、设计出图全靠嘴对嘴',
    },
  },
  ming_cabinet: {
    prompt: '拟一道旨意:罢免某官员,须经内阁票拟与六科给事中复核',
    painPoint: {
      en: 'Six ministries disagree — only the Cabinet veto system settles it',
      zh: '六部各执一词，内阁票拟谁说了算？制度即答案',
    },
  },
  blank: {
    prompt: '',
    painPoint: {
      en: 'Build your own AI team from scratch',
      zh: '从零组建你自己的 AI 协作团队',
    },
  },
};
