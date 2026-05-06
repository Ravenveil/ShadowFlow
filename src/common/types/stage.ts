/**
 * Stage — 5 canonical lifecycle stages shared by Stories 4.8 + 4.9.
 *
 * Stage values are kept stringly-typed to match backend JSON payloads.
 */

export enum Stage {
  Intent  = 'intent',
  Plan    = 'plan',
  Review  = 'review',
  Execute = 'execute',
  Deliver = 'deliver',
}

export const STAGE_ORDER: Stage[] = [
  Stage.Intent,
  Stage.Plan,
  Stage.Review,
  Stage.Execute,
  Stage.Deliver,
];

export type StageOutcome = 'ok' | 'retried' | 'aborted';

export interface StageResult {
  name: Stage;
  outcome: StageOutcome;
  retry_count: number;
}
