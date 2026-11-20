import { useState } from 'react';
import { AgentAvatar } from '../avatar';
import type { RunPayload, StepStatus } from '../data/types';
import { IconCheck, IconChevron, IconSparkle } from '../shell/icons';

function fmtMs(ms?: number): string {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: '已完成',
  running: '进行中',
  wait: '等待中',
  failed: '失败',
};

export function StepStatusMark({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <span className="sf-step-mark is-done">
        <IconCheck size={10} />
      </span>
    );
  }
  if (status === 'running') {
    return <span className="sf-step-mark is-running" />;
  }
  if (status === 'failed') {
    return <span className="sf-step-mark is-failed" />;
  }
  return <span className="sf-step-mark is-wait" />;
}

/** 管道执行块：默认收起，展开看到逐步骤（谁是执行者、耗时、状态）。 */
export function RunBlock({ run }: { run: RunPayload }) {
  const [open, setOpen] = useState(false);
  const done = run.steps.filter((s) => s.status === 'done').length;
  const running = run.steps.some((s) => s.status === 'running');

  return (
    <div className="sf-run" data-open={open ? 'true' : undefined}>
      <button className="sf-run-head" onClick={() => setOpen((v) => !v)}>
        <span className="sf-run-icon">
          <IconSparkle size={13} />
        </span>
        <span className="sf-run-title">{run.title}</span>
        <span className="sf-run-meta">
          {running ? <i className="sf-run-pulse" /> : null}
          运行 {fmtMs(run.durationMs)} · {run.steps.length} 个步骤
          {!running && done === run.steps.length ? ' · 全部完成' : ''}
        </span>
        <span className="sf-run-chevron" data-open={open ? 'true' : undefined}>
          <IconChevron size={13} />
        </span>
      </button>

      {open ? (
        <ol className="sf-run-steps">
          {run.steps.map((s) => (
            <li key={s.n} className="sf-run-step" data-status={s.status}>
              <span className="sf-run-step-n">{String(s.n).padStart(2, '0')}</span>
              <StepStatusMark status={s.status} />
              <span className="sf-run-step-title">{s.title}</span>
              <span className="sf-run-step-agent">
                <AgentAvatar label={s.agent} size={16} status={false} />
                {s.agent}
              </span>
              <span className="sf-run-step-tail">
                {s.status === 'running' ? STATUS_TEXT.running : fmtMs(s.ms)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sf-run-preview">
          {run.steps.slice(0, 4).map((s) => (
            <span key={s.n} className="sf-run-chip" data-status={s.status}>
              <StepStatusMark status={s.status} />
              {s.agent}
            </span>
          ))}
          {run.steps.length > 4 ? (
            <span className="sf-run-chip is-more">+{run.steps.length - 4}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
