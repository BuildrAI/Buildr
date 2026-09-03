import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FINAL_DOCTOR_MAX_BUFFER,
  classifyFinalDoctorResult,
  finalDoctorArgs,
  runFinalDoctor,
} from '../../src/infrastructure/final-doctor-process.ts';

test('final Doctor runner始终请求bounded compact JSON', () => {
  let observed: any = null;
  const spawn: any = (command: any, args: any, options: any) => {
    observed = { command, args, options };
    return { status: 0, signal: null, stdout: '{"ok":true}', stderr: '' };
  };
  const executed: any = runFinalDoctor({ executable: '/node', cliPath: '/buildr.mjs', agent: 'codex', targetRoot: '/workspace', cwd: '/product', spawn });
  assert.equal(executed.classification.status, 'passed');
  assert.deepEqual(observed.args, ['/buildr.mjs', ...finalDoctorArgs('codex', '/workspace')]);
  assert.equal(observed.options.maxBuffer, 4 * 1024 * 1024);
  assert.equal(FINAL_DOCTOR_MAX_BUFFER, 4 * 1024 * 1024);
});

test('final Doctor runner不捕获超过1 MiB的full inventory', () => {
  const full: any = JSON.stringify({ inventory: 'x'.repeat(1024 * 1024) });
  assert.ok(Buffer.byteLength(full) > 1024 * 1024);
  const spawn: any = (_command: any, args: any) => {
    assert.deepEqual(args.slice(-2), ['--detail', 'compact']);
    return { status: 0, signal: null, stdout: '{"ok":true,"health":{"ready":true}}', stderr: '' };
  };
  assert.equal(runFinalDoctor({ executable: '/node', cliPath: '/buildr.mjs', agent: 'codex', targetRoot: '/workspace', cwd: '/product', spawn }).classification.status, 'passed');
});

test('final Doctor runner区分业务失败、输出超限与进程执行失败', () => {
  const business: any = classifyFinalDoctorResult({ status: 1, signal: null, stdout: '{"ok":false}', stderr: '' });
  assert.equal(business.status, 'doctor-failed');
  assert.equal(business.code, 'doctor.not-passed');

  const overflow: any = classifyFinalDoctorResult({ status: null, signal: null, stdout: '', stderr: '', error: { code: 'ENOBUFS', message: 'spawnSync ENOBUFS' } });
  assert.equal(overflow.status, 'output-limit-exceeded');
  assert.equal(overflow.code, 'doctor.output_limit_exceeded');
  assert.match(overflow.message, /4194304 bytes/);

  const execution: any = classifyFinalDoctorResult({ status: null, signal: null, stdout: '', stderr: '', error: { code: 'ENOENT', message: 'missing executable' } });
  assert.equal(execution.status, 'execution-failed');
  assert.equal(execution.code, 'doctor.process_failed');
  assert.match(execution.message, /ENOENT/);
});
