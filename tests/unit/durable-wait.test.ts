import { it, expect } from 'vitest';
import { waitSchedule, configSchemas } from '@eimax/workflow-schema';

it('intervalos em segundos/minutos/horas/dias e formato legado são determinísticos', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  for (const [unit, ms] of Object.entries({
    seconds: 1000,
    minutes: 60000,
    hours: 3600000,
    days: 86400000,
  })) {
    expect(waitSchedule({ mode: 'duration', amount: 2, unit }, now).resumeAt.getTime()).toBe(
      now.getTime() + 2 * ms,
    );
  }
  expect(waitSchedule({ minutes: 1 }, now).resumeAt.toISOString()).toBe('2026-10-21T12:01:00.000Z');
});
it('datas com offsets equivalentes apontam para o mesmo instante UTC', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  expect(waitSchedule({ mode: 'until', at: '2026-10-21T10:00:00-03:00' }, now).resumeAt.toISOString()).toBe(
    '2026-10-21T13:00:00.000Z',
  );
});
it.each([
  { mode: 'duration', amount: 0, unit: 'seconds' },
  { mode: 'duration', amount: -1, unit: 'days' },
  { mode: 'duration', amount: 1.5, unit: 'seconds' },
  { mode: 'duration', amount: 367, unit: 'days' },
  { mode: 'duration', amount: 1, unit: 'months' },
  { mode: 'until', at: '2026-10-21T10:00:00' },
  { mode: 'until', at: '2026-02-30T10:00:00Z' },
  { mode: 'until', at: 'invalid' },
])('rejeita configuração temporal inválida: %j', (config) =>
  expect(configSchemas.wait.safeParse(config).success).toBe(false),
);
it('rejeita data passada ao executar e calcula expiração opcional', () => {
  expect(() => waitSchedule({ mode: 'until', at: '2020-01-01T00:00:00Z' })).toThrow('WAIT_INVALID_DATE');
  const now = new Date();
  const result = waitSchedule(
    { mode: 'duration', amount: 1, unit: 'seconds', resumeDeadlineMinutes: 1 },
    now,
  );
  expect(result.expiresAt!.getTime() - result.resumeAt.getTime()).toBe(60000);
});
