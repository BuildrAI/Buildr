import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { spawnBuildrWebRestartSuccessor } from '../../src/web/application/restart-web-handoff.ts';
import { buildrWebInstanceObservationDigest } from '../../src/web/infrastructure/instance-runtime.ts';
import { WEB_HANDOFF_SUCCESSOR_LOG, webHandoffSuccessorLogPath } from '../../src/web/application/web-handoff-successor-log.ts';

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
  assert.deepEqual(options.env, { PATH: '/bin', BUILDR_APP_DATA_DIR: '/keep/app', BUILDR_PRODUCT_DATA_DIR: '/keep/product' });
  const logFile = webHandoffSuccessorLogPath(dataRoot);
  assert.equal(logFile, path.join(dataRoot, 'logs', WEB_HANDOFF_SUCCESSOR_LOG));
  assert.match(fs.readFileSync(logFile, 'utf8'), /restart successor argv=web --restart sha256-[a-f0-9]{64} --no-open --port 4567/);
  assert.ok(logs.some(line => line.includes('拒绝退出（HTTP 403）')));
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

