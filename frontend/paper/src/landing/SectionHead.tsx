/**
 * SectionHead — 落地页每节的「小标签 + 两行大标题 + 右侧说明」骨架。
 *
 * 四节结构一模一样，抽出来后：改版式只改这里，改文案只改 content/landing.ts。
 */
import { Fragment } from 'react';

export function SectionHead({
  kicker,
  title,
  side,
  light = false,
}: {
  kicker: string;
  /** 标题按行给，行内不写 <br />。 */
  title: string[];
  side?: string;
  /** 深色区用浅色字。 */
  light?: boolean;
}) {
  return (
    <div className="lp-two">
      <div>
        <div className="lp-kicker">{kicker}</div>
        <h2 className={`lp-h2${light ? ' lp-h2--light' : ''}`}>
          {title.map((line, i) => (
            <Fragment key={line}>
              {i > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </h2>
      </div>
      {side ? <p className={`lp-side${light ? ' lp-side--light' : ''}`}>{side}</p> : null}
    </div>
  );
}

export default SectionHead;
