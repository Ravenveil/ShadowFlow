/**
 * ProductVisual — Hero 右侧那台「产品窗口」装饰图。
 *
 * 纯渲染：内容全部来自 `content/landing.ts` 的 PREVIEW，颜色走 data-tone。
 */
import { AgentAvatar, AVATAR_SIZE } from '../avatar';
import { PREVIEW } from '../content/landing';

export function ProductVisual() {
  return (
    <div className="lp-visual">
      <div className="lp-visual-bar">
        <span className="lp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="lp-visual-title">{PREVIEW.title}</span>
        <span className="lp-visual-url">{PREVIEW.url}</span>
      </div>

      <div className="lp-visual-body">
        <aside className="lp-visual-rail">
          <span className="lp-vr-dot is-on" />
          <span className="lp-vr-dot" />
          <span className="lp-vr-dot" />
          <span className="lp-vr-dot" />
        </aside>

        <div className="lp-visual-main">
          <div className="lp-visual-kicker">{PREVIEW.kicker}</div>
          <div className="lp-visual-h">{PREVIEW.project}</div>
          <div className="lp-visual-sub">
            <span className="lp-live" />
            {PREVIEW.state}
          </div>

          <div className="lp-stats">
            {PREVIEW.stats.map((s) => (
              <div key={s.v} className="lp-stat">
                <b>{s.k}</b>
                <span>{s.v}</span>
              </div>
            ))}
          </div>

          <div className="lp-flow">
            <div className="lp-flow-head">
              <span>{PREVIEW.flowTitle}</span>
              <span className="lp-flow-live">{PREVIEW.flowLive}</span>
            </div>
            <ul>
              {PREVIEW.flow.map((r) => (
                <li key={r.t}>
                  <i data-tone={r.tone}>{r.n}</i>
                  <span>{r.t}</span>
                  <em>{r.s}</em>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="lp-float lp-float--a">
        <span className="lp-float-ico" />
        <div>
          <b>{PREVIEW.floatDoc.title}</b>
          <span>{PREVIEW.floatDoc.note}</span>
        </div>
      </div>
      <div className="lp-float lp-float--b">
        <AgentAvatar label={PREVIEW.floatAgent.face} size={AVATAR_SIZE.md} status={false} />
        <div>
          <b>{PREVIEW.floatAgent.title}</b>
          <span>{PREVIEW.floatAgent.note}</span>
        </div>
      </div>
    </div>
  );
}

export default ProductVisual;
