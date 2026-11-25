/**
 * RunBlock — 聊天流里的「管道执行」块（默认收起，展开看逐步骤）。
 * 文案见 `content/app.ts` 的 RUN / STEP_STATUS_TEXT。
 */
import { useState } from 'react';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { RUN, STEP_STATUS_TEXT } from '@/shared/content/app';
import type { RunPayload, StepStatus } from '@/shared/data/types';
import { IconCheck, IconChevron, IconSparkle } from '@/shared/ui/icons';

/** 收起态最多露几个步骤 chip，多出来的折成「+N」。 */
const PREVIEW_CHIPS = 4;

function fmtMs(ms?: number): string {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

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

export function RunBlock({ run }: { run: RunPayload }) {
  const [open, setOpen] = useState(false);
  const done = run.steps.filter((s) => s.status === 'done').length;
  const running = run.steps.some((s) => s.status === 'running');
  const allDone = !running && done === run.steps.length;

  return (
    <div className="sf-run" data-open={open ? 'true' : undefined}>
      <button className="sf-run-head" onClick={() => setOpen((v) => !v)}>
        <span className="sf-run-icon">
          <IconSparkle size={13} />
        </span>
        <span className="sf-run-title">{run.title}</span>
        <span className="sf-run-meta">
          {running ? <i className="sf-run-pulse" /> : null}
          {RUN.running} {fmtMs(run.durationMs)} · {RUN.steps(run.steps.length)}
          {allDone ? ` · ${RUN.allDone}` : ''}
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
                <AgentAvatar label={s.agent} size={AVATAR_SIZE.sm} status={false} />
                {s.agent}
              </span>
              <span className="sf-run-step-tail">
                {s.status === 'running' ? STEP_STATUS_TEXT.running : fmtMs(s.ms)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sf-run-preview">
          {run.steps.slice(0, PREVIEW_CHIPS).map((s) => (
            <span key={s.n} className="sf-run-chip" data-status={s.status}>
              <StepStatusMark status={s.status} />
              {s.agent}
            </span>
          ))}
          {run.steps.length > PREVIEW_CHIPS ? (
            <span className="sf-run-chip is-more">+{run.steps.length - PREVIEW_CHIPS}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
