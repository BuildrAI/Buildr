import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  dailyProgressActionContext,
  dailyProgressActivityPath,
  dailyProgressGroup,
  isDailyProgressDate,
  legacyDailyProgressPath,
  localDailyProgressDate,
} from '../src/features/project-daily-progress/dailyProgressNavigation.ts';

test('daily progress links preserve the selected project, historical date and grouping', () => {
  const path = dailyProgressActivityPath('项目 & alpha', '2026-09-19', 'person');
  const url = new URL(path, 'http://buildr.local');
  assert.equal(url.pathname, '/activity');
  assert.equal(url.searchParams.get('project'), '项目 & alpha');
  assert.equal(url.searchParams.get('date'), '2026-09-19');
  assert.equal(url.searchParams.get('group'), 'person');
  assert.equal(dailyProgressActivityPath('demo'), '/activity?project=demo');
  assert.equal(dailyProgressActivityPath(), '/activity');
  assert.deepEqual(dailyProgressActionContext('demo', '2026-09-19'), { projectCode: 'demo', date: '2026-09-19' });
});

test('legacy project links migrate to activity without losing date or group', () => {
  assert.equal(legacyDailyProgressPath('demo', '?document=daily&date=2026-09-19&group=task'), '/activity?project=demo&date=2026-09-19&group=task');
  assert.equal(legacyDailyProgressPath('demo', '?document=readme'), null);
  assert.equal(legacyDailyProgressPath('demo', '?document=daily'), `/activity?project=demo&date=${localDailyProgressDate()}`);
  assert.equal(dailyProgressGroup('person'), 'person');
  assert.equal(dailyProgressGroup('task'), 'task');
  assert.equal(dailyProgressGroup('unknown'), 'day');
  assert.equal(dailyProgressGroup(null), 'day');
});

test('invalid dates are rejected before rendering or requesting a daily record', () => {
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-01-00', '2026-9-20', 'Invalid Date', '']) {
    assert.equal(isDailyProgressDate(value), false, value);
  }
  assert.equal(isDailyProgressDate('2024-02-29'), true);
  assert.equal(isDailyProgressDate('2026-09-19'), true);
  // Keep malformed deep-link input visible to the page's error state rather than silently selecting today.
  assert.equal(legacyDailyProgressPath('demo', '?document=daily&date=2026-02-30'), '/activity?project=demo&date=2026-02-30');
});

test('default generation and legacy-link dates follow the local calendar across timezones', () => {
  const moduleUrl = new URL('../src/features/project-daily-progress/dailyProgressNavigation.ts', import.meta.url).href;
  const source = `
    import { localDailyProgressDate, dailyProgressActionContext, legacyDailyProgressPath } from ${JSON.stringify(moduleUrl)};
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    console.log(JSON.stringify({
      fixed: localDailyProgressDate(new Date('2026-09-19T16:10:00Z')),
      action: dailyProgressActionContext('demo'),
      legacy: legacyDailyProgressPath('demo', '?document=daily'),
      today,
    }));
  `;
  for (const [timezone, expected] of [['Asia/Shanghai', '2026-09-20'], ['America/Los_Angeles', '2026-09-19']]) {
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' }));
    assert.equal(result.fixed, expected);
    assert.deepEqual(result.action, { projectCode: 'demo', date: result.today });
    assert.equal(result.legacy, `/activity?project=demo&date=${result.today}`);
  }
});
