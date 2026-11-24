/**
 * DemoShowcase — 案例演示播放器（版式对齐 shadow-merge DemoShowcase，文案见 content/landing.ts）。
 *
 * 用 CSS 类承载版式（landing.css 的 .lp-demo-*），颜色走 CSS 变量与 data-tone。
 * 交互：播放 / 暂停 / 下一步 / 重置，逐步渲染事件流与右侧指标板。
 */
import { useEffect, useRef, useState } from 'react';
import { DEMO, type DemoEventBase } from '../content/landing';
import { IconCheck, IconPlay, IconZap } from '../shell/icons';

function EventView({ event, index }: { event: DemoEventBase; index: number }) {
  if (event.kind === 'ceo') {
    return (
      <div className="lp-demo-msg lp-demo-msg--lead" key={index}>
        <span className="lp-demo-avatar">👔</span>
        <div>
          <small>{DEMO.leadLabel}</small>
          <p>{event.text}</p>
        </div>
      </div>
    );
  }
  if (event.kind === 'user') {
    return (
      <div className="lp-demo-msg lp-demo-msg--user" key={index}>
        <div>
          <small>{DEMO.userLabel}</small>
          <p>{event.text}</p>
          {event.chips?.length ? (
            <div className="lp-demo-chips">
              {event.chips.map((c) => (
                <span key={c}>📎 {c}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  if (event.kind === 'note') {
    return (
      <div className="lp-demo-note" key={index}>
        🗄 {event.text}
      </div>
    );
  }
  if (event.kind === 'team') {
    return (
      <div className="lp-demo-team" key={index}>
        <p>👥 {DEMO.teamHead}</p>
        <div>
          {event.members?.map(([role, duty]) => (
            <span key={role}>
              <strong>{role}</strong>
              <small>{duty}</small>
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (event.kind === 'card') {
    return (
      <div className="lp-demo-card" data-tone={event.tone ?? 'accent'} key={index}>
        <span className="lp-demo-card-dot">●</span>
        <div>
          <small>{event.role} · {DEMO.syncedLabel}</small>
          <strong>{event.title}</strong>
          <p>{event.detail}</p>
        </div>
        <IconCheck size={13} />
      </div>
    );
  }
  return (
    <div className="lp-demo-done" key={index}>
      <IconCheck size={13} />
      {event.text}
    </div>
  );
}

export function DemoShowcase() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const total = DEMO.events.length;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setStep((s) => {
        if (s >= total) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1400);
    return () => window.clearInterval(t);
  }, [playing, total]);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step]);

  const togglePlay = () => {
    if (step >= total) setStep(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="lp-demo">
      <div className="lp-demo-bar">
        <span className="lp-demo-tag">● {DEMO.kicker}</span>
        <strong>{DEMO.title}</strong>
        <div className="lp-demo-controls">
          <button className="lp-demo-btn is-primary" onClick={togglePlay}>
            <IconPlay size={12} />
            {playing ? DEMO.playing : step >= total ? DEMO.replay : step === 0 ? DEMO.play : DEMO.play}
          </button>
          <button
            className="lp-demo-btn"
            disabled={step >= total}
            onClick={() => {
              setPlaying(false);
              setStep((s) => Math.min(s + 1, total));
            }}
          >
            {DEMO.next}
          </button>
          <button
            className="lp-demo-btn"
            onClick={() => {
              setPlaying(false);
              setStep(0);
            }}
          >
            {DEMO.reset}
          </button>
          <small>{DEMO.progress(step, total)}</small>
        </div>
      </div>

      <div className="lp-demo-body">
        <div className="lp-demo-stream" ref={streamRef}>
          {DEMO.events.slice(0, step).map((e, i) => (
            <EventView key={i} event={e} index={i} />
          ))}
          {step === 0 ? <div className="lp-demo-hint">{DEMO.hint}</div> : null}
        </div>
        <aside className="lp-demo-board">
          <p className="lp-demo-board-title">{DEMO.boardTitle}</p>
          <div className="lp-demo-board-grid">
            {DEMO.metrics.map((m) => {
              const on = step > m.at;
              return (
                <div key={m.key} data-on={on ? 'true' : undefined}>
                  <span>{on ? '▦' : '▢'}</span>
                  <small>{m.label}</small>
                  <strong>{on ? m.value : '—'}</strong>
                </div>
              );
            })}
          </div>
          <div className="lp-demo-board-foot">
            <IconZap size={13} />
            {step >= total ? DEMO.finished : playing ? DEMO.running : step === 0 ? DEMO.idle : DEMO.paused}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default DemoShowcase;
