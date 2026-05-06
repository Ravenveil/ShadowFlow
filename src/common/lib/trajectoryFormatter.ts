/**
 * Story 4.8 — build a Markdown snapshot of a trajectory bundle.
 */

export function buildTrajectoryMarkdown(trajectory: Record<string, unknown> | null): string {
  if (!trajectory) return '# (empty trajectory)';

  const run = trajectory.run as Record<string, unknown> | undefined;
  const steps = (trajectory.steps as Array<Record<string, unknown>>) ?? [];
  const handoffs = (trajectory.handoffs as Array<Record<string, unknown>>) ?? [];

  const lines: string[] = [];
  lines.push(`# Trajectory · ${run?.run_id ?? '(unknown)'}`);
  lines.push('');
  lines.push(`- workflow: \`${run?.workflow_id ?? ''}\``);
  lines.push(`- status: \`${run?.status ?? ''}\``);
  if (run?.started_at) lines.push(`- started: \`${String(run.started_at)}\``);
  if (run?.ended_at) lines.push(`- ended: \`${String(run.ended_at)}\``);
  lines.push('');
  lines.push(`## Steps`);
  lines.push('');
  for (const step of steps) {
    lines.push(`### ${step.node_id ?? step.step_id}`);
    lines.push('');
    lines.push(`- status: \`${step.status}\``);
    if (step.output) {
      const msg = (step.output as Record<string, unknown>).message;
      if (typeof msg === 'string') lines.push(`- output: ${msg}`);
    }
    lines.push('');
  }
  if (handoffs.length) {
    lines.push(`## Handoffs`);
    for (const h of handoffs) {
      lines.push(`- ${h.from_node_id} → ${h.to_node_id ?? '?'} (${h.goal ?? ''})`);
    }
  }
  return lines.join('\n');
}
