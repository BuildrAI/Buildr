import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeLcov } from '../../test/verification/unit-coverage.ts';

test('unit coverage summary 只统计 src 生产模块并生成版本化指标', () => {
  const summary: any = summarizeLcov([
    'SF:src/example.mjs',
    'FN:1,covered',
    'FNDA:1,covered',
    'FN:2,missing',
    'FNDA:0,missing',
    'BRDA:1,0,0,1',
    'BRDA:1,0,1,0',
    'DA:1,1',
    'DA:2,0',
    'end_of_record',
    'SF:test/unit/example.test.mjs',
    'DA:1,1',
    'end_of_record',
  ].join('\n'));
  assert.equal(summary.schemaVersion, 'buildr.unit-coverage/v1');
  assert.deepEqual(summary.files, ['src/example.mjs']);
  assert.deepEqual(summary.lines, { covered: 1, total: 2, percent: 50 });
  assert.deepEqual(summary.branches, { covered: 1, total: 2, percent: 50 });
  assert.deepEqual(summary.functions, { covered: 1, total: 2, percent: 50 });
});
