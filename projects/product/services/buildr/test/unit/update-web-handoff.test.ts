import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { handoffUpdatedBuildrWeb, updatedWebEnvironment } from '../../src/web/application/update-web-handoff.ts';
import { resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { buildrWebInstanceObservationDigest, healthyBuildrWebInstance } from '../../src/web/infrastructure/instance-runtime.ts';

function fixture() {
  const origin = { package: '@buildr-ai/buildr', version: '0.0.2', protocolIdentity: 'buildr.web-protocol/v1', applicationPayloadDigest: 'new-payload', channel: 'npm', ownershipIdentity: 'new-origin', sourceCommit: 'new-source' };
  const runtime = { role: 'host', executable: '/registered/node', identity: 'registered-node' };
  const identity = { ...origin, installationIdentity: origin.ownershipIdentity, runtime };
  const profile = resolveWebProfile(identity);
  const previous = { pid: 100, url: 'http://127.0.0.1:4458/', secret: 'old-secret', launcherIdentity: null, productIdentity: { ...identity, version: '0.0.1', installationIdentity: 'old-origin' }, webProfile: profile };
  const next = { ...previous, pid: 101, secret: 'new-secret', productIdentity: identity };
  const input = { productRoot: '/registered/package', expectedVersion: '0.0.2', previousInstallationIdentity: 'old-origin' };
  let current: any = previous;
  const child = Object.assign(new EventEmitter(), { connected: true, unrefs: 0, channel: { unref() {} }, unref() { this.unrefs += 1; }, disconnect() { this.connected = false; } });
  const spawns: any[] = [];
  const assertions: any[] = [];
  const dependencies: any = {
    readNpmUpdateHandoffInstallation: () => ({ entry: { origin, runtime, entryPath: '/registered/package/bin/buildr.mjs' } }),
    assertNpmUpdateHandoffTarget: (value: any) => { assertions.push(value); },
    readInstance: () => current,
    instanceRecordExists: () => false,
    healthyInstance: async (value: any) => value,
    spawnProcess: (...args: any[]) => { spawns.push(args); current = next; return child; },
    intervalMs: 1, waitMs: 20,
  };
  return { input, dependencies, previous, next, identity, child, spawns, assertions, setCurrent: (value: any) => { current = value; } };
}

test('更新子进程只移除旧产品和启动器环境，保留显式隔离根', () => {
  const env = updatedWebEnvironment({ BUILDR_INSTALLATION_IDENTITY: 'old', BUILDR_APPLICATION_PAYLOAD_ROOT: 'old', BUILDR_NPM_ENTRY_PATH: 'old', BUILDR_INTERNAL_PRODUCT_REENTRY: '1', BUILDR_LOCAL_APP_PREVIEW: 'old', BUILDR_LAUNCHER_IDENTITY: 'old', BUILDR_LAUNCHER_NO_OPEN: '1', BUILDR_LAUNCHER_NO_NOTIFY: '1', BUILDR_APP_DATA_DIR: '/isolated/web', BUILDR_PRODUCT_DATA_DIR: '/isolated/product', PATH: 'untrusted-node' });
  assert.deepEqual(env, { BUILDR_APP_DATA_DIR: '/isolated/web', BUILDR_PRODUCT_DATA_DIR: '/isolated/product', PATH: 'untrusted-node' });
});

test('没有运行实例不启动；损坏记录拒绝接管；当前实例核验归属后直接复用', async () => {
  const f = fixture();
  f.setCurrent(null);
  assert.deepEqual(await handoffUpdatedBuildrWeb(f.input, f.dependencies), { status: 'not-running' });
  assert.equal(f.spawns.length, 0);
  f.dependencies.instanceRecordExists = () => true;
  assert.equal((await handoffUpdatedBuildrWeb(f.input, f.dependencies)).code, 'web_update_instance_invalid');
  assert.equal(f.spawns.length, 0);
  f.dependencies.instanceRecordExists = () => false;
  f.setCurrent(f.next);
  assert.equal((await handoffUpdatedBuildrWeb(f.input, f.dependencies)).status, 'current');
  assert.equal(f.spawns.length, 0);
  assert.deepEqual(f.assertions, [f.next]);
});

test('自动交接使用登记中的Node和入口、原端口及观察摘要，成功后断开IPC', async () => {
  const f = fixture();
  const result = await handoffUpdatedBuildrWeb(f.input, f.dependencies);
  assert.deepEqual(result, { status: 'restarted', version: '0.0.2', pid: 101, url: f.next.url, previousPid: 100 });
  const [executable, args, options] = f.spawns[0];
  assert.equal(executable, '/registered/node');
  assert.deepEqual(args, ['/registered/package/bin/buildr.mjs', 'web', '--update-handoff', buildrWebInstanceObservationDigest(f.previous), '--no-open', '--port', '4458']);
  assert.equal(options.detached, true);
  assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
  assert.equal(f.child.connected, false);
  assert.ok(f.child.unrefs >= 2);
  assert.deepEqual(f.assertions, [f.previous, f.next]);
});

test('只有仍存活的精确child PID可直接证明新版来源，其他并发PID或已退出child继续核对slot', async () => {
  for (const state of [
    { pid: 101, exitCode: null, signalCode: null, killed: false, expected: 'restarted' },
    { pid: 999, exitCode: null, signalCode: null, killed: false, expected: 'failed' },
    { pid: 101, exitCode: 0, signalCode: null, killed: false, expected: 'failed' },
  ]) {
    const f = fixture();
    Object.assign(f.child, state);
    f.dependencies.assertNpmUpdateHandoffTarget = (value: any) => {
      if (value.pid === f.next.pid) throw Object.assign(new Error('new-version slot ambiguous'), { code: 'web_update_instance_ownership_ambiguous' });
    };
    const result = await handoffUpdatedBuildrWeb(f.input, f.dependencies);
    assert.equal(result.status, state.expected);
    if (state.expected === 'failed') assert.equal(result.code, 'web_update_instance_ownership_ambiguous');
    assert.equal(f.child.connected, false);
  }
});

test('接收底层认证失败的有界诊断，不用exit1覆盖其code与message', async () => {
  const f = fixture();
  f.dependencies.spawnProcess = () => {
    setImmediate(() => { f.child.emit('message', { type: 'buildr.web-update-handoff-failed', code: 'launcher_handoff_shutdown_rejected', message: '拒绝退出（HTTP 403）。' }); f.child.emit('exit', 1, null); });
    return f.child;
  };
  const result = await handoffUpdatedBuildrWeb(f.input, f.dependencies);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'launcher_handoff_shutdown_rejected');
  assert.match(result.message!, /HTTP 403/);
  assert.equal(f.child.connected, false);
});

test('并发外来实例与归属冲突均不能被当成新版成功', async () => {
  const f = fixture();
  f.dependencies.spawnProcess = () => { f.setCurrent({ ...f.next, productIdentity: { ...f.identity, installationIdentity: 'foreign' } }); return f.child; };
  assert.equal((await handoffUpdatedBuildrWeb(f.input, f.dependencies)).code, 'web_update_instance_changed');
  assert.equal(f.child.connected, false);
  const current = fixture();
  current.setCurrent(current.next);
  current.dependencies.assertNpmUpdateHandoffTarget = () => { throw Object.assign(new Error('ambiguous slot'), { code: 'web_update_instance_ownership_ambiguous' }); };
  assert.equal((await handoffUpdatedBuildrWeb(current.input, current.dependencies)).code, 'web_update_instance_ownership_ambiguous');
  assert.equal(current.spawns.length, 0);
});

test('新版receipt短暂未通过健康检查时继续等候，不误判为外来替换', async () => {
  const f = fixture();
  let probes = 0;
  f.dependencies.healthyInstance = async (value: any) => value === f.next && probes++ === 0 ? null : value;
  assert.equal((await handoffUpdatedBuildrWeb(f.input, f.dependencies)).status, 'restarted');
});

test('更新的健康证据必须来自响应自身，并核对真实响应PID', async (t) => {
  const f = fixture();
  let body: any = { schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: 999, productIdentity: f.identity, launcherIdentity: null, webProfile: f.next.webProfile };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body)));
  assert.equal(await healthyBuildrWebInstance(f.next, { strictIdentity: true }), null);
  body.pid = f.next.pid;
  assert.ok(await healthyBuildrWebInstance(f.next, { strictIdentity: true }));
  delete body.productIdentity;
  assert.equal(await healthyBuildrWebInstance(f.next, { strictIdentity: true }), null);
  body.productIdentity = f.identity;
  delete body.launcherIdentity;
  assert.equal(await healthyBuildrWebInstance(f.next, { strictIdentity: true }), null);
});

test('启动失败或就绪超时保留具体结果，始终解除父进程IPC引用', async () => {
  const failed = fixture();
  failed.dependencies.spawnProcess = () => { throw Object.assign(new Error('registered Node unavailable'), { code: 'ENOENT' }); };
  assert.equal((await handoffUpdatedBuildrWeb(failed.input, failed.dependencies)).code, 'ENOENT');
  const timeout = fixture();
  timeout.dependencies.waitMs = 1;
  timeout.dependencies.spawnProcess = () => timeout.child;
  assert.equal((await handoffUpdatedBuildrWeb(timeout.input, timeout.dependencies)).code, 'web_update_readiness_timeout');
  assert.equal(timeout.child.connected, false);
});
