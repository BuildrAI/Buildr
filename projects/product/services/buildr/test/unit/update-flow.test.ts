import assert from 'node:assert/strict';
import test from 'node:test';

import { createWebUpdateFlow } from '../../src/modules/installation/application/update-flow.ts';

function source(mode: any = 'npm', version: any = '1.0.0'): any  {
  return {
    mode, version, package: '@buildr-ai/buildr', productRoot: '/fixture/product',
    installationIdentity: 'install-identity-1', updateAuthority: { prefix: '/prefix' },
  };
}

const AUTHORITY = { type: 'npm-prefix', identity: 'fixture-authority', nodeExecutable: '/node', npmCliPath: '/npm-cli.js', prefix: '/prefix' };

function awareness(version: any = '1.1.0'): any  {
  const track = (name: any) => ({ track: name, tag: name === 'stable' ? 'latest' : 'next', label: name, version, observedVersion: version, status: 'update-available', available: true, installable: true });
  return { freshness: { status: 'fresh' }, tracks: { stable: track('stable'), candidate: track('candidate') } };
}

function deferred() {
  let resolve: any, reject: any;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture(options: any = {}): any  {
  const spawnCalls: any[] = [];
  const pending = options.pending || null;
  const handoffs: any[] = [];
  const flow = createWebUpdateFlow({
    productRoot: () => '/fixture/product',
    identifySource: () => options.source || source(),
    inspectAuthority: () => options.authorityResult || { status: 'ready', authority: AUTHORITY, reason: null },
    releaseAwareness: () => options.awareness || awareness(),
    handoffUpdatedBuildrWeb: async (input: any) => { handoffs.push(input); return options.handoff || { status: 'restarted', version: '1.1.0' }; },
    spawnProcess: async (executable: any, args: any) => {
      spawnCalls.push({ executable, args });
      if (pending) return pending.promise;
      return options.spawnResult || { ok: true, status: 0, stdout: '', stderr: '', error: null };
    },
    now: () => '2026-08-23T00:00:00.000Z',
  });
  return { flow, spawnCalls, handoffs };
}

test('update-flow：prepare 钉住版本并后台下载，就绪后可 apply 并交接', async () => {
  const pending = deferred();
  const { flow, spawnCalls, handoffs } = fixture({ pending });
  const snapshot = flow.webUpdatePrepare({ track: 'candidate', expectedVersion: '1.1.0' });
  assert.equal(snapshot.status, 'preparing');
  assert.equal(snapshot.version, '1.1.0');
  assert.equal(spawnCalls.length, 1);
  assert.deepEqual(spawnCalls[0].args.slice(0, 3), ['/npm-cli.js', 'cache', 'add']);
  assert.equal(spawnCalls[0].args[3], '@buildr-ai/buildr@1.1.0');

  assert.throws(() => flow.webUpdatePrepare({ track: 'candidate', expectedVersion: '1.1.0' }), (error: any) => error.code === 'update_flow_busy' && error.status === 409);
  assert.throws(() => flow.webUpdateApply({ expectedVersion: '1.1.0' }), (error: any) => error.code === 'update_flow_apply_conflict');

  pending.resolve({ ok: true, status: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.webUpdateStatus().status, 'ready');

  const applying = flow.webUpdateApply({ expectedVersion: '1.1.0' });
  assert.equal(applying.status, 'applying');
  await new Promise((resolve) => setImmediate(resolve));
  const install = spawnCalls[1];
  assert.deepEqual(install.args.slice(0, 3), ['/npm-cli.js', 'install', '--global']);
  assert.ok(install.args.includes('--prefer-offline'));
  assert.ok(install.args.includes('@buildr-ai/buildr@1.1.0'));
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].expectedVersion, '1.1.0');
  assert.equal(handoffs[0].previousInstallationIdentity, 'install-identity-1');
  assert.equal(flow.webUpdateStatus().status, 'partial');
  assert.equal(flow.webUpdateStatus().runningVersion, '1.0.0');
});

test('update-flow：registry 当前版本与请求版本不一致时拒绝并返回 409', () => {
  const { flow } = fixture({ awareness: awareness('1.2.0') });
  assert.throws(
    () => flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' }),
    (error: any) => error.code === 'update_flow_version_conflict' && error.status === 409 && error.details.registryVersion === '1.2.0',
  );
  assert.equal(flow.webUpdateStatus().status, 'idle');
});

test('update-flow：不高于当前版本、非 npm 来源与失效轨道被拒绝且无副作用', () => {
  const { flow, spawnCalls } = fixture();
  assert.throws(() => flow.webUpdatePrepare({ track: 'stable', expectedVersion: '0.9.0' }), (error: any) => error.code === 'update_flow_target_invalid');
  assert.throws(() => flow.webUpdatePrepare({ track: 'beta', expectedVersion: '1.1.0' }), (error: any) => error.code === 'update_flow_track_invalid' && error.status === 400);
  const unknown = fixture({ source: source('unknown') });
  assert.throws(() => unknown.flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' }), (error: any) => error.code === 'update_flow_not_supported' && error.status === 409);
  assert.equal(spawnCalls.length, 0);
  assert.equal(unknown.spawnCalls.length, 0);
});

function devFixture(overrides: any = {}): any  {
  const spawnCalls: any[] = [];
  const handoffs: any[] = [];
  let awarenessCalls = 0;
  const flow = createWebUpdateFlow({
    productRoot: () => '/fixture/product',
    identifySource: () => ({ mode: 'development', version: '0.1.0', productRoot: '/fixture/product' }),
    inspectAuthority: () => { throw new Error('development 来源不应检查 npm authority'); },
    releaseAwareness: () => { awarenessCalls += 1; throw new Error('development 来源不应查询 registry'); },
    handoffUpdatedBuildrWeb: async (input: any) => { handoffs.push(input); return { status: 'restarted', version: '1.1.0' }; },
    spawnProcess: async (executable: any, args: any) => { spawnCalls.push({ executable, args }); return { ok: true, status: 0 }; },
    devTiming: { downloadMs: 0, installMs: 0 },
    now: () => '2026-08-23T00:00:00.000Z',
    ...overrides,
  });
  return { flow, spawnCalls, handoffs, awarenessCalls: () => awarenessCalls };
}

test('update-flow：development checkout 走本地模拟流程，不产生外部副作用', async () => {
  const { flow, spawnCalls, handoffs, awarenessCalls } = devFixture();
  const prepared = flow.webUpdatePrepare({ track: 'stable', expectedVersion: '0.1.1' });
  assert.equal(prepared.status, 'preparing');
  assert.equal(prepared.version, '0.1.1');
  assert.equal(flow.webUpdateStatus().status, 'preparing');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(flow.webUpdateStatus().status, 'ready');

  const applying = flow.webUpdateApply({ expectedVersion: '0.1.1' });
  assert.equal(applying.status, 'applying');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(flow.webUpdateStatus().status, 'completed');
  assert.equal(spawnCalls.length, 0, '模拟流程不得执行真实子进程');
  assert.equal(awarenessCalls(), 0, '模拟流程不得查询 registry');
  assert.equal(handoffs.length, 0, '模拟流程不触发 npm 交接');
});

test('update-flow：development 模拟仍校验目标版本与钉住版本', () => {
  const { flow } = devFixture();
  assert.throws(() => flow.webUpdatePrepare({ track: 'stable', expectedVersion: '0.1.0' }), (error: any) => error.code === 'update_flow_target_invalid');
  assert.throws(() => flow.webUpdateApply({ expectedVersion: '0.1.1' }), (error: any) => error.code === 'update_flow_apply_conflict');
});

test('update-flow：下载失败转为 failed，可重新准备', async () => {
  const { flow } = fixture({ spawnResult: { ok: false, status: 1, stderr: 'network reset' } });
  flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  await Promise.resolve(); await Promise.resolve(); await new Promise((resolve) => setImmediate(resolve));
  const failed = flow.webUpdateStatus();
  assert.equal(failed.status, 'failed');
  assert.ok(failed.error);
  assert.equal(failed.error.code, 'update_download_failed');
  assert.match(failed.error.message, /network reset/);

  const pending = deferred();
  const retried = fixture({ pending });
  retried.flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  assert.equal(retried.flow.webUpdateStatus().status, 'preparing');
});

test('update-flow：apply 校验钉住版本，安装失败与交接失败转为 failed', async () => {
  const { flow } = fixture();
  assert.throws(() => flow.webUpdateApply({ expectedVersion: '1.1.0' }), (error: any) => error.code === 'update_flow_apply_conflict' && error.status === 409);

  flow.webUpdatePrepare({ track: 'candidate', expectedVersion: '1.1.0' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.webUpdateStatus().status, 'ready');
  assert.throws(() => flow.webUpdateApply({ expectedVersion: '1.2.0' }), (error: any) => error.code === 'update_flow_apply_conflict' && error.details.preparedVersion === '1.1.0');

  // 下载成功、安装失败：按调用次数区分两次 spawn 结果。
  let calls = 0;
  const staged = createWebUpdateFlow({
    productRoot: () => '/fixture/product',
    identifySource: () => source(),
    inspectAuthority: () => ({ status: 'ready', authority: AUTHORITY, reason: null }),
    releaseAwareness: () => awareness(),
    handoffUpdatedBuildrWeb: async () => ({ status: 'restarted', version: '1.1.0' }),
    spawnProcess: async () => { calls += 1; return calls === 1 ? { ok: true, status: 0 } : { ok: false, status: 1, stderr: 'EACCES' }; },
  });
  staged.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  await new Promise((resolve) => setImmediate(resolve));
  staged.webUpdateApply({ expectedVersion: '1.1.0' });
  await new Promise((resolve) => setImmediate(resolve));
  const failed = staged.webUpdateStatus();
  assert.equal(failed.status, 'failed');
  assert.ok(failed.error);
  assert.equal(failed.error.code, 'update_install_failed');

  const handoffFailed = createWebUpdateFlow({
    productRoot: () => '/fixture/product',
    identifySource: () => source(),
    inspectAuthority: () => ({ status: 'ready', authority: AUTHORITY, reason: null }),
    releaseAwareness: () => awareness(),
    handoffUpdatedBuildrWeb: async () => ({ status: 'failed', code: 'web_update_no_healthy_instance', message: '新实例未就绪' }),
    spawnProcess: async () => ({ ok: true, status: 0 }),
  });
  handoffFailed.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  await new Promise((resolve) => setImmediate(resolve));
  handoffFailed.webUpdateApply({ expectedVersion: '1.1.0' });
  await new Promise((resolve) => setImmediate(resolve));
  const handoff = handoffFailed.webUpdateStatus();
  assert.equal(handoff.status, 'partial');
  assert.equal(handoff.installedVersion, '1.1.0');
  assert.ok(handoff.error);
  assert.equal(handoff.error.code, 'web_update_no_healthy_instance');
});

test('update-flow：下载后安装身份变化拒绝确认，不安装也不交接', async () => {
  const selected = source();
  const { flow, spawnCalls, handoffs } = fixture({ source: selected });
  flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  await new Promise(resolve => setImmediate(resolve));
  selected.installationIdentity = 'other-installation';
  assert.throws(() => flow.webUpdateApply({ expectedVersion: '1.1.0' }), (e: any) => e.code === 'update_flow_installation_changed');
  assert.equal(spawnCalls.length, 1); assert.equal(handoffs.length, 0);
});
