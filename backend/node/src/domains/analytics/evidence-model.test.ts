import { describe, expect, it } from 'vitest';
import {
  capNum,
  csvText,
  evidenceFilename,
  HOP_ABNORMAL,
  mdCell,
  stamp,
  windowLabel,
  yuan,
} from './evidence-model';

describe('金额与时间展示口径', () => {
  it('分 → ¥ 两位小数（整数分不丢精度）', () => {
    expect(yuan(0)).toBe('¥0.00');
    expect(yuan(1234)).toBe('¥12.34');
    expect(yuan(-500)).toBe('¥-5.00');
    expect(yuan(1)).toBe('¥0.01');
  });

  it('时间戳用本地时区格式化', () => {
    const ts = new Date(2026, 10, 19, 9, 5, 3).getTime();
    expect(stamp(ts)).toBe('2026-11-19 09:05:03');
  });

  it('空/非法时间戳显示 —（不显示 1970）', () => {
    expect(stamp(null)).toBe('—');
    expect(stamp(undefined)).toBe('—');
    expect(stamp(NaN)).toBe('—');
  });

  it('时间窗文案：全量 / 到现在 / 双端', () => {
    expect(windowLabel(null, null)).toBe('全部（开张至今）');
    const from = new Date(2026, 10, 1, 0, 0, 0).getTime();
    expect(windowLabel(from, null)).toContain('现在');
    const to = new Date(2026, 10, 19, 12, 0, 0).getTime();
    expect(windowLabel(from, to)).toBe('2026-11-01 00:00:00 ~ 2026-11-19 12:00:00');
  });
});

describe('Markdown 单元格转义', () => {
  it('竖线转义、换行压平、截断 160', () => {
    expect(mdCell('a|b')).toBe('a\\|b');
    expect(mdCell('a\nb\r\nc')).toBe('a b c');
    expect(mdCell('x'.repeat(200))).toHaveLength(160);
    expect(mdCell(null)).toBe('');
  });
});

describe('CSV 注入防护', () => {
  it('= + - @ 前缀补单引号（防 Excel 当公式执行）', () => {
    expect(csvText('=1+1')).toBe(`"'=1+1"`);
    expect(csvText('+86')).toBe(`"'+86"`);
    expect(csvText('-5')).toBe(`"'-5"`);
    expect(csvText('@cmd')).toBe(`"'@cmd"`);
  });

  it('普通文本加引号，内部引号双写', () => {
    expect(csvText('普通')).toBe(`"普通"`);
    expect(csvText('say "hi"')).toBe(`"say ""hi"""`);
    expect(csvText(null)).toBe(`""`);
  });

  it('换行压平成空格（不破坏行结构）', () => {
    expect(csvText('a\r\nb')).toBe(`"a b"`);
  });
});

describe('导出文件名', () => {
  it('ASCII 文件名带分钟级时间戳', () => {
    const ts = new Date(2026, 10, 19, 9, 5, 0).getTime();
    expect(evidenceFilename('md', ts)).toBe('shadowflow-evidence-20261119-0905.md');
    expect(evidenceFilename('csv', ts)).toBe('shadowflow-evidence-20261119-0905.csv');
    expect(evidenceFilename('scorecard', ts)).toBe('shadowflow-scorecard-20261119-0905.md');
  });

  it('不含中文/空格（跨浏览器 Content-Disposition 稳定）', () => {
    const name = evidenceFilename('csv');
    expect(/^[A-Za-z0-9._-]+$/.test(name)).toBe(true);
  });
});

describe('条数规整', () => {
  it('非法/<=0 回退默认，超上限截断', () => {
    expect(capNum(undefined, 20, 100)).toBe(20);
    expect(capNum(0, 20, 100)).toBe(20);
    expect(capNum(-1, 20, 100)).toBe(20);
    expect(capNum(5.9, 20, 100)).toBe(5);
    expect(capNum(999, 20, 100)).toBe(100);
  });
});

describe('异常 hop 状态清单', () => {
  it('覆盖失败/超时/拒绝/中止/空产出，不含 done/pending/running', () => {
    expect([...HOP_ABNORMAL]).toEqual(['failed', 'timeout', 'denied', 'aborted', 'empty']);
    expect((HOP_ABNORMAL as readonly string[]).includes('done')).toBe(false);
    expect((HOP_ABNORMAL as readonly string[]).includes('running')).toBe(false);
  });
});
