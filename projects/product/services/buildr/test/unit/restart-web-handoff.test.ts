import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import test from 'node:test';

import { spawnBuildrWebRestartSuccessor } from '../../src/web/application/restart-web-handoff.ts';
import { buildrWebInstanceObservationDigest } from '../../src/web/infrastructure/instance-runtime.ts';

test('spawnBuildrWebRestartSuccessor 使用同一入口、观察摘要与原端口，并隔离交接环境', () => {
  const state = {
    url: 'http://127.0.0.1:4567/', secret: 'instance-secret', pid: 4242,
    launcherIdentity: { bindingPath: '/binding' }, productIdentity: { channel: 'npm' }, webProfile: { profile: 'released' },
  };
  const child = Object.assign(new ChildProcess(), { channel: { unref() {} }, unref() {} });
  const spawns: any[] = [];
  const logs: any[] = [];
  const originalError = console.error;
  console.error = (...args: any[]) => { logs.push(args.join(' ')); };
  try {
    const result = spawnBuildrWebRestartSuccessor(state, {
      buildInvocation: () => ({ command: '/dev/node', argsPrefix: ['/dev/bin/buildr.mjs'] }),
      environment: {
        PATH: '/bin', BUILDR_APP_DATA_DIR: '/keep/app', BUILDR_PRODUCT_DATA_DIR: '/keep/product',
        BUILDR_LAUNCHER_IDENTITY: '/drop', BUILDR_LOCAL_APP_PREVIEW: '{}', BUILDR_NPM_ENTRY_PATH: '/drop',
      },
      spawnProcess: ((...args: unknown[]) => { spawns.push(args); return child; }) as typeof import('node:child_process').spawn,
    });
    assert.equal(result, child);
    child.emit('message', { type: 'buildr.web-update-handoff-failed', code: 'launcher_handoff_shutdown_rejected', message: '拒绝退出（HTTP 403）。' });
  } finally {
    console.error = originalError;
  }
  const [command, args, options] = spawns[0];
  assert.equal(command, '/dev/node');
  assert.deepEqual(args, ['/dev/bin/buildr.mjs', 'web', '--restart', buildrWebInstanceObservationDigest(state), '--no-open', '--port', '4567']);
  assert.equal(options.detached, true);
  assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
  assert.deepEqual(options.env, { PATH: '/bin', BUILDR_APP_DATA_DIR: '/keep/app', BUILDR_PRODUCT_DATA_DIR: '/keep/product' });
  assert.ok(logs.some(line => line.includes('拒绝退出（HTTP 403）')));
});

