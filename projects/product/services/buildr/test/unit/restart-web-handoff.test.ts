import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { spawnBuildrWebRestartSuccessor } from '../../src/web/application/restart-web-handoff.ts';
import { buildrWebInstanceObservationDigest } from '../../src/web/infrastructure/instance-runtime.ts';
import { WEB_HANDOFF_SUCCESSOR_LOG, webHandoffSuccessorLogPath } from '../../src/web/application/web-handoff-successor-log.ts';
import { createWebRestartControl } from '../../src/web/application/restart-control.ts';
import { captureWebRestartAttempt, takeWebRestartAttempt } from '../../src/web/startup-context.ts';
import { runCli } from '../../src/bootstrap/cli/main.ts';

test('spawnBuildrWebRestartSuccessor 使用同一入口、观察摘要与原端口，并把后继输出落到实例日志', (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-handoff-log-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const state = {
    url: 'http://127.0.0.1:4567/', secret: 'instance-secret', pid: 4242,
    launcherIdentity: { bindingPath: '/binding' }, productIdentity: { channel: 'npm' },
    webProfile: { profile: 'released', dataRoot },
  };
  const child = Object.assign(new ChildProcess(), { channel: { unref() {} }, unref() {} });
  const spawns: any[] = [];
  const logs: any[] = [];
  const failures: any[] = [];
  const originalError = console.error;
  console.error = (...args: any[]) => { logs.push(args.join(' ')); };
  try {
    const result = spawnBuildrWebRestartSuccessor(state, {
      buildInvocation: () => ({ command: '/dev/node', argsPrefix: ['/dev/bin/buildr.mjs'] }),
      environment: {
        PATH: '/bin', BUILDR_APP_DATA_DIR: '/keep/app', BUILDR_PRODUCT_DATA_DIR: '/keep/product',
        BUILDR_LAUNCHER_IDENTITY: '/drop', BUILDR_LOCAL_APP_PREVIEW: '{}', BUILDR_NPM_ENTRY_PATH: '/drop',
        BUILDR_WEB_RESTART_ATTEMPT: 'stale-attempt',
      },
      attemptToken: 'private-attempt',
      onFailure: error => failures.push(error),
      spawnProcess: ((...args: unknown[]) => { spawns.push(args); return child; }) as typeof import('node:child_process').spawn,
    });
    assert.equal(result, child);
    child.emit('spawn');
    child.emit('message', { type: 'buildr.web-update-handoff-failed', code: 'launcher_handoff_shutdown_rejected', message: '拒绝退出（HTTP 403）。' });
  } finally {
    console.error = originalError;
  }
  const [command, args, options] = spawns[0];
  assert.equal(command, '/dev/node');
  assert.deepEqual(args, ['/dev/bin/buildr.mjs', 'web', '--restart', buildrWebInstanceObservationDigest(state), '--no-open', '--port', '4567']);
  assert.equal(options.detached, true);
  assert.equal(options.stdio[0], 'ignore');
  assert.equal(typeof options.stdio[1], 'number');
  assert.equal(options.stdio[2], options.stdio[1]);
  assert.equal(options.stdio[3], 'ipc');
  assert.deepEqual(options.env, { PATH: '/bin', BUILDR_APP_DATA_DIR: '/keep/app', BUILDR_PRODUCT_DATA_DIR: '/keep/product', BUILDR_WEB_RESTART_ATTEMPT: 'private-attempt' });
  const logFile = webHandoffSuccessorLogPath(dataRoot);
  assert.equal(logFile, path.join(dataRoot, 'logs', WEB_HANDOFF_SUCCESSOR_LOG));
  assert.match(fs.readFileSync(logFile, 'utf8'), /restart successor argv=web --restart sha256-[a-f0-9]{64} --no-open --port 4567/);
  assert.ok(logs.some(line => line.includes('拒绝退出（HTTP 403）')));
  assert.deepEqual(failures, [{ code: 'launcher_handoff_shutdown_rejected', message: '拒绝退出（HTTP 403）。' }]);
  assert.equal(args.join(' ').includes('private-attempt'), false);
  assert.equal(fs.readFileSync(logFile, 'utf8').includes('private-attempt'), false);
});

test('restart control releases a failed attempt, ignores its delayed callbacks and preserves shutdown', () => {
  let closing = false;
  const control = createWebRestartControl(() => closing);
  assert.deepEqual(control.status(), { status: 'idle' });
  const first = control.begin();
  assert.equal(control.permitsShutdown(null), false);
  assert.equal(control.permitsShutdown(first), true);
  assert.deepEqual(control.status(), { status: 'restarting' });
  assert.throws(() => control.begin(), { code: 'restart_in_progress' });
  assert.equal(control.fail(first, { code: 'failed', message: 'first failure' }), true);
  assert.deepEqual(control.status(), { status: 'failed', error: { code: 'failed', message: 'first failure' } });
  assert.equal(control.permitsShutdown(null), true);
  const next = control.begin();
  assert.notEqual(first, next);
  assert.equal(control.fail(first, { code: 'late', message: 'late failure' }), false);
  assert.deepEqual(control.status(), { status: 'restarting' });
  assert.equal(control.permitsShutdown(first), false);
  assert.equal(control.permitsShutdown(next), true);
  closing = true;
  assert.equal(control.fail(next, { code: 'late', message: 'cannot revive a closing host' }), false);
  assert.equal(control.inProgress(), true);
});

test('restart control bounds diagnostics without exposing the private attempt', () => {
  const control = createWebRestartControl(() => false);
  const token = control.begin();
  control.fail(token, { code: 'c'.repeat(250), message: 'm'.repeat(5000) });
  const status = control.status();
  assert.equal(status.status, 'failed');
  if (status.status !== 'failed') throw new Error('expected failed status');
  assert.equal(status.error.code.length, 200);
  assert.equal(status.error.message.length, 4096);
  assert.equal(JSON.stringify(status).includes(token), false);
});

test('restart timeout revokes its token, permits retry and rejects a delayed successor', () => {
  const expirations: (() => void)[] = [];
  let cancellations = 0;
  const control = createWebRestartControl(() => false, { timeoutMs: 25, schedule: (expire, milliseconds) => {
    assert.equal(milliseconds, 25);
    expirations.push(expire);
    return () => { cancellations += 1; };
  } });
  const expired = control.begin();
  expirations[0]();
  assert.equal(control.status().status, 'failed');
  assert.equal(control.permitsShutdown(expired), false, 'expired token cannot quit an idle host');
  assert.equal(control.permitsShutdown(undefined), true);
  const next = control.begin();
  expirations[0]();
  assert.deepEqual(control.status(), { status: 'restarting' });
  assert.equal(control.permitsShutdown(next), true);
  assert.equal(control.permitsShutdown(expired), false);
  assert.equal(cancellations, 1);
  control.dispose();
  assert.equal(cancellations, 2);
});

test('CLI captures the private restart token before any full bootstrap work', async t => {
  const previousAttempt = process.env.BUILDR_WEB_RESTART_ATTEMPT;
  const previousFailure = process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP;
  t.after(() => {
    takeWebRestartAttempt();
    if (previousAttempt === undefined) delete process.env.BUILDR_WEB_RESTART_ATTEMPT;
    else process.env.BUILDR_WEB_RESTART_ATTEMPT = previousAttempt;
    if (previousFailure === undefined) delete process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP;
    else process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP = previousFailure;
  });
  process.env.BUILDR_WEB_RESTART_ATTEMPT = 'bootstrap-private-attempt';
  process.env.BUILDR_TEST_FAIL_FULL_BOOTSTRAP = '1';
  await assert.rejects(runCli(['node', 'buildr', 'web', '--restart', 'digest']), /Injected full runtime bootstrap failure/);
  assert.equal(process.env.BUILDR_WEB_RESTART_ATTEMPT, undefined);
  assert.equal(takeWebRestartAttempt(), 'bootstrap-private-attempt');
  assert.equal(takeWebRestartAttempt(), undefined);
  process.env.BUILDR_WEB_RESTART_ATTEMPT = 'unrelated-attempt';
  captureWebRestartAttempt(['node', 'buildr', 'update']);
  assert.equal(process.env.BUILDR_WEB_RESTART_ATTEMPT, undefined);
  assert.equal(takeWebRestartAttempt(), undefined);
});

test('spawnBuildrWebRestartSuccessor 缺少 dataRoot 或日志不可用时退化为 ignore，不阻断交接', () => {
  const state = {
    url: 'http://127.0.0.1:4567/', secret: 'instance-secret', pid: 4242,
    launcherIdentity: null, productIdentity: null, webProfile: { profile: 'released' },
  };
  for (const openLog of [undefined, () => { throw new Error('EACCES'); }]) {
    const child = Object.assign(new ChildProcess(), { channel: { unref() {} }, unref() {} });
    const spawns: any[] = [];
    spawnBuildrWebRestartSuccessor(state, {
      buildInvocation: () => ({ command: '/dev/node', argsPrefix: ['/dev/bin/buildr.mjs'] }),
      environment: {},
      openLog,
      spawnProcess: ((...args: unknown[]) => { spawns.push(args); return child; }) as typeof import('node:child_process').spawn,
    });
    assert.deepEqual(spawns[0][2].stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
  }
});

