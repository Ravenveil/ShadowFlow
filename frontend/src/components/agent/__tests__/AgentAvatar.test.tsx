/**
 * AgentAvatar 种子兜底唯一约定测试（2026-11-05 用户反馈批）。
 *
 * 用户反馈：侧边栏与灵魂页「驱动后端（Claw）」预览显示不同头像。
 * 根因：种子为空时两条兜底规则并存——调用方 `avatar_seed ?? name`（名字直作
 * 种子）vs 组件内 `hashSeed(name)`（名字 hash 作种子），同一种子空值落在
 * 不同链路画出两张脸。
 *
 * 修复约定：空/缺省种子 → name 直作种子（唯一规则，收敛在 AgentAvatar）。
 * 本文件锁定：
 *  1. 空串种子 = 缺省种子 = name 直作种子（三态同脸）；
 *  2. name 直作种子 ≠ hashSeed(name)（正是修复前的 bug 形态，防回归）；
 *  3. 真实种子仍生效（空白种子不影响自定义种子）；
 *  4. 生成图（avatar_image）优先，种子不影响渲染分支。
 */
import { render, screen } from '../../../test/utils';
import { describe, expect, it } from 'vitest';
import { createAvatar } from '@dicebear/core';
import { botttsNeutral } from '@dicebear/collection';
import { AgentAvatar } from '../AgentAvatar';
import { hashSeed } from '../../../config/clawhub';

/** 与 clawhub-config.test.ts 同法：剥随机 id 后比较 SVG 内容（randomizeIds）。 */
function stripRandomIds(svg: string): string {
  return svg
    .replace(/\sid="[^"]*"/g, '')
    .replace(/\smask="url\([^)]*\)"/g, '')
    .replace(/\sclip-path="url\([^)]*\)"/g, '')
    .replace(/url\(['"]?#[^'"]*['"]?\)/g, 'url(#id)');
}

/** 直接用 DiceBear 渲染参考 SVG（等价于旧 hashSeed 兜底链路会画出的脸）。 */
function referenceSvg(seed: string): string {
  return createAvatar(botttsNeutral, {
    seed,
    backgroundColor: ['e5e7eb'],
    radius: 50,
    randomizeIds: true,
  }).toString();
}

/** 经 DOM 解析再序列化：dangerouslySetInnerHTML 渲染出的 innerHTML 是 HTML
 *  序列化形态（<rect/> → <rect></rect>、rdf:RDF 小写化），与 toString()
 *  直出的字符串逐字不同但内容一致。两边统一走 DOM 归一后再比较。 */
function domNormalize(svg: string): string {
  const div = document.createElement('div');
  div.innerHTML = svg;
  return div.innerHTML;
}

describe('AgentAvatar — 空种子兜底唯一约定（2026-11-05 修复）', () => {
  const NAME = '我的agent';

  it('空串种子 = 缺省种子 = name 直作种子（三态同脸）', () => {
    const { container: c1 } = render(<AgentAvatar name={NAME} />);
    const { container: c2 } = render(<AgentAvatar name={NAME} seed="" />);
    const { container: c3 } = render(<AgentAvatar name={NAME} seed={null} />);
    const svgs = [c1, c2, c3].map((c) => c.querySelector('[data-testid="agent-avatar"]')!);
    expect(svgs[0].innerHTML).toBeTruthy();
    expect(stripRandomIds(svgs[0].innerHTML)).toBe(stripRandomIds(svgs[1].innerHTML));
    expect(stripRandomIds(svgs[1].innerHTML)).toBe(stripRandomIds(svgs[2].innerHTML));
  });

  it('name 直作种子 ≠ hashSeed(name)（修复前两规则并存会画出两张脸，防回归）', () => {
    // 名字与其 FNV hash 是不同种子 → DiceBear 输出不同 SVG（这正是侧栏与
    // 灵魂页预览不一致的根因；锁定唯一规则后组件不再走 hash 分支）
    expect(hashSeed(NAME)).not.toBe(NAME);
    const { container } = render(<AgentAvatar name={NAME} />);
    const node = container.querySelector('[data-testid="agent-avatar"]')!;
    expect(stripRandomIds(node.innerHTML)).not.toBe(stripRandomIds(domNormalize(referenceSvg(hashSeed(NAME)))));
    expect(stripRandomIds(node.innerHTML)).toBe(stripRandomIds(domNormalize(referenceSvg(NAME))));
  });

  it('自定义种子仍生效（空白兜底不覆盖显式种子）', () => {
    const { container } = render(<AgentAvatar name={NAME} seed="custom-seed" />);
    const node = container.querySelector('[data-testid="agent-avatar"]')!;
    expect(stripRandomIds(node.innerHTML)).toBe(stripRandomIds(domNormalize(referenceSvg('custom-seed'))));
  });

  it('生成图（image）优先渲染 img 分支，不受种子影响', () => {
    const { container } = render(
      <AgentAvatar name={NAME} seed="whatever" image="data:image/png;base64,AAA" />,
    );
    expect(container.querySelector('img')).toBeTruthy();
    expect(container.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(screen.queryByTestId('agent-avatar')).toBeTruthy();
  });
});
