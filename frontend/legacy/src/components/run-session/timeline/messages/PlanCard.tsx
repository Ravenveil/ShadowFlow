/**
 * PlanCard — Polynoia-parity orchestrator plan card.
 *
 * Shows the orchestrator's decomposition of the user goal into tasks and
 * their live status as workers pick them up (plan_update_task patches flip
 * rows pending → running → done). Same-batch tasks render as "parallel".
 */
import { memo } from 'react';
import { Circle, CircleCheck, CircleX, Loader2, Ban } from 'lucide-react';
import type { PlanTaskRow, TimelineMessage } from '../types';
import styles from '../timeline.module.css';

interface Props {
  msg: Extract<TimelineMessage, { kind: 'plan_card' }>;
}

const STATUS_LABEL: Record<PlanTaskRow['status'], string> = {
  pending: '待派发',
  running: '执行中',
  done: '完成',
  failed: '失败',
  blocked: '受阻',
};

function TaskStatusIcon({ status }: { status: PlanTaskRow['status'] }) {
  if (status === 'running')
    return <Loader2 size={13} className={styles.planSpin} aria-hidden />;
  if (status === 'done')
    return <CircleCheck size={13} className={styles.planIconDone} aria-hidden />;
  if (status === 'failed')
    return <CircleX size={13} className={styles.planIconFailed} aria-hidden />;
  if (status === 'blocked')
    return <Ban size={13} className={styles.planIconFailed} aria-hidden />;
  return <Circle size={13} className={styles.planIconPending} aria-hidden />;
}

export const PlanCard = memo(function PlanCard({ msg }: Props) {
  const done = msg.tasks.filter((t) => t.status === 'done').length;
  return (
    <div className={styles.planCard}>
      <div className={styles.planHead}>
        <span className={styles.planTitle}>{msg.title}</span>
        <span className={styles.planCount}>
          {done}/{msg.tasks.length}
        </span>
      </div>
      {msg.goal ? <div className={styles.planGoal}>{msg.goal}</div> : null}
      <div className={styles.planTasks}>
        {msg.tasks.map((t) => (
          <div key={t.id} className={styles.planTask} data-status={t.status}>
            <span className={styles.planTaskIcon}>
              <TaskStatusIcon status={t.status} />
            </span>
            <span className={styles.planTaskTitle}>{t.title}</span>
            {t.assignee ? (
              <span className={styles.planTaskAssignee}>{t.assignee}</span>
            ) : null}
            {t.elapsed_ms != null ? (
              <span className={styles.planTaskElapsed}>
                {(t.elapsed_ms / 1000).toFixed(1)}s
              </span>
            ) : (
              <span className={styles.planTaskStatus}>{STATUS_LABEL[t.status]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
