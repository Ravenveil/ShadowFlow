import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSchedule,
  listSchedules,
  patchSchedule,
  deleteSchedule,
  getScheduleRuns,
  ScheduleApiError,
  type ScheduleRecord,
} from '../schedules';

afterEach(() => vi.unstubAllGlobals());

const RECORD: ScheduleRecord = {
  schedule_id: 'sch-1',
  group_id: 'team-1',
  cron_expression: '0 9 * * *',
  start_at: null,
  agent_id: 'agent-1',
  task_description: '每天扫商机',
  duration_min: 30,
  created_at: '2026-08-23T00:00:00+00:00',
  next_run_time: '2026-08-24T09:00:00+00:00',
  completed: false,
  enabled: true,
  runs: [],
};

function okJson(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('schedules api client', () => {
  it('listSchedules unwraps envelope and passes group_id filter', async () => {
    const spy = vi.fn().mockResolvedValue(okJson({ data: [RECORD], meta: { count: 1 } }));
    vi.stubGlobal('fetch', spy);
    const out = await listSchedules('team-1');
    expect(out).toEqual([RECORD]);
    expect(String(spy.mock.calls[0][0])).toContain('/api/schedules?group_id=team-1');
  });

  it('createSchedule POSTs body and returns record', async () => {
    const spy = vi.fn().mockResolvedValue(okJson({ data: RECORD, meta: {} }, 201));
    vi.stubGlobal('fetch', spy);
    const out = await createSchedule({
      group_id: 'team-1',
      cron_expression: '0 9 * * *',
      agent_id: 'agent-1',
      task_description: '每天扫商机',
    });
    expect(out.schedule_id).toBe('sch-1');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/schedules');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).cron_expression).toBe('0 9 * * *');
  });

  it('createSchedule surfaces invalid_cron error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      okJson({ detail: { error: 'invalid_cron', detail: 'bad', example: '0 8 * * 1-5' } }, 422),
    ));
    await expect(
      createSchedule({ group_id: 'team-1', cron_expression: '* * * *' }),
    ).rejects.toMatchObject({ code: 'invalid_cron' });
  });

  it('patchSchedule sends enabled flag', async () => {
    const spy = vi.fn().mockResolvedValue(
      okJson({ data: { ...RECORD, enabled: false, next_run_time: null }, meta: {} }),
    );
    vi.stubGlobal('fetch', spy);
    const out = await patchSchedule('sch-1', { enabled: false });
    expect(out.enabled).toBe(false);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/schedules/sch-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false });
  });

  it('deleteSchedule resolves on 204 and throws ScheduleApiError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response));
    await expect(deleteSchedule('sch-1')).resolves.toBeUndefined();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      okJson({ detail: { error: { code: 'NOT_FOUND', message: 'Schedule not found' } } }, 404),
    ));
    await expect(deleteSchedule('sch-x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteSchedule('sch-x')).rejects.toBeInstanceOf(ScheduleApiError);
  });

  it('getScheduleRuns unwraps run list', async () => {
    const runs = [{ run_id: 'r1', triggered_at: '2026-08-23T09:00:00+00:00', status: 'succeeded' }];
    const spy = vi.fn().mockResolvedValue(okJson({ data: runs, meta: { count: 1 } }));
    vi.stubGlobal('fetch', spy);
    const out = await getScheduleRuns('sch-1');
    expect(out).toEqual(runs);
    expect(String(spy.mock.calls[0][0])).toContain('/api/schedules/sch-1/runs');
  });
});
