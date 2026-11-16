import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAntigravityUsage } from '../../src/executors/antigravity/usage.ts';

const official = [
  'Gemini Models\tWeekly Limit Remaining\t80%\t2026-11-21T00:25:49Z',
  'Gemini Models\tFive Hour Limit Remaining\t99%\t2026-11-16T12:03:56Z',
  'Claude and GPT models\tWeekly Limit Remaining\t68%\t2026-11-20T10:35:31Z',
  'Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-11-16T12:06:04Z',
].join('\n');

test('parses official Gemini and Claude/GPT weekly and five-hour windows', () => {
  assert.deepEqual(parseAntigravityUsage(official), [
    { id: 'gemini-weekly', groupLabel: 'Gemini 模型', label: '每周限额', remainingPercent: 80, resetsAt: '2026-11-21T00:25:49Z' },
    { id: 'gemini-5h', groupLabel: 'Gemini 模型', label: '5 小时限额', remainingPercent: 99, resetsAt: '2026-11-16T12:03:56Z' },
    { id: '3p-weekly', groupLabel: 'Claude 与 GPT 模型', label: '每周限额', remainingPercent: 68, resetsAt: '2026-11-20T10:35:31Z' },
    { id: '3p-5h', groupLabel: 'Claude 与 GPT 模型', label: '5 小时限额', remainingPercent: 100, resetsAt: '2026-11-16T12:06:04Z' },
  ]);
});

test('ignores unknown, malformed, duplicate and out-of-range rows', () => {
  const output = [
    'Gemini Models\tWeekly Limit Remaining\t80%\t2026-11-21T00:25:49Z',
    'Gemini Models\tWeekly Limit Remaining\t75%\t2026-11-21T00:25:49Z',
    'Gemini Models\tMonthly Limit Remaining\t10%\t2026-11-21T00:25:49Z',
    'Unknown Models\tWeekly Limit Remaining\t10%\t2026-11-21T00:25:49Z',
    'Claude and GPT models\tFive Hour Limit Remaining\t101%\t2026-11-16T12:06:04Z',
    'Claude and GPT models\tFive Hour Limit Remaining\t68%\tnot-a-date',
    'noise',
  ].join('\n');
  assert.deepEqual(parseAntigravityUsage(output), [
    { id: 'gemini-weekly', groupLabel: 'Gemini 模型', label: '每周限额', remainingPercent: 75, resetsAt: '2026-11-21T00:25:49Z' },
  ]);
});

test('returns no windows for empty or unrecognized output', () => {
  assert.deepEqual(parseAntigravityUsage(''), []);
  assert.deepEqual(parseAntigravityUsage('Fetching available models...\n'), []);
});

test('strips ANSI formatting and keeps decimal percentages', () => {
  const output = '\u001b[32mGemini Models\u001b[0m\tWeekly Limit Remaining\t80.5%\t2026-11-21T00:25:49Z';
  assert.deepEqual(parseAntigravityUsage(output), [
    { id: 'gemini-weekly', groupLabel: 'Gemini 模型', label: '每周限额', remainingPercent: 80.5, resetsAt: '2026-11-21T00:25:49Z' },
  ]);
});
