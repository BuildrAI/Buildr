import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWebUpdateFlow } from '../../src/modules/installation/application/update-flow.ts';
import { createUpdateFlowStore } from '../../src/modules/installation/infrastructure/update-flow-store.ts';
import type { UpdateRecord } from '../../src/modules/installation/domain/update-flow-state.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t: any, overrides: any = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-update-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'product')); const productRoot = fs.realpathSync(path.join(root, 'product'));
  const dataRoot = path.join(root, 'data');
  const store = createUpdateFlowStore(productRoot, { dataRoot });
  let launcherFailed = true;
  let bootVersion = '1.0.0';
  const calls = { npm: [] as string[][], repairs: 0, handoffs: 0 };
  const dependencies = {
    productRoot: () => productRoot, store,
    identifySource: () => ({ productRoot, mode: 'npm', version: bootVersion, installationIdentity: 'slot-1', package: '@buildr-ai/buildr' }),
    inspectAuthority: () => ({ status: 'ready', authority: { nodeExecutable: '/node', npmCliPath: '/npm', prefix: '/prefix' } }),
    releaseAwareness: () => ({ freshness: { status: 'fresh' }, tracks: { stable: { version: '1.1.0', installable: true } } }),
    spawnProcess: async (_: string, args: string[]) => { calls.npm.push(args); return { ok: true, status: 0 }; },
    handoffUpdatedBuildrWeb: async () => { calls.handoffs++; return { status: 'restarted', version: '1.1.0' }; },
    launcher: {
      inspect: () => launcherFailed ? { status: 'failed', error: { code: 'launcher_denied', message: '入口暂时无法替换' } } : { status: 'ready' },
      repair: () => { calls.repairs++; return launcherFailed ? { status: 'failed', error: { code: 'launcher_denied', message: '入口暂时无法替换' } } : { status: 'ready' }; },
    },
    ...overrides,
  };
  return { root, store, calls, create: () => createWebUpdateFlow(dependencies as any), setVersion: (v: string) => { bootVersion = v; }, fixLauncher: () => { launcherFailed = false; } };
}
async function install(flow: ReturnType<typeof createWebUpdateFlow>) {
  flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' }); await tick();
  flow.webUpdateApply({ expectedVersion: '1.1.0' }); await tick();
}

test('持久更新：新进程继续同一任务，启动入口单独修复，不重复安装或重启', async t => {
  const f = fixture(t); const old = f.create(); await install(old);
  assert.equal(old.webUpdateStatus().status, 'partial');
  assert.equal(old.webUpdateStatus().runningVersion, '1.0.0');
  f.setVersion('1.1.0'); const successor = f.create();
  const partial = successor.webUpdateStatus();
  assert.equal(partial.status, 'partial'); assert.equal(partial.stage, 'launcher');
  assert.equal(partial.steps.verify, 'done'); assert.equal(partial.steps.launcher, 'failed');
  const before = fs.readFileSync(path.join(f.root, 'data', 'web-updates', fs.readdirSync(path.join(f.root, 'data', 'web-updates'))[0]), 'utf8');
  successor.webUpdateStatus();
  assert.equal(fs.readFileSync(path.join(f.root, 'data', 'web-updates', fs.readdirSync(path.join(f.root, 'data', 'web-updates'))[0]), 'utf8'), before, '状态查询不得写入记录');
  const recovery = { expectedJobId: partial.id, expectedVersion: '1.1.0', action: 'launcher' };
  assert.throws(() => successor.webUpdateRecover({ ...recovery, expectedJobId: 'stale' }), (e: any) => e.code === 'update_flow_recovery_conflict');
  assert.throws(() => successor.webUpdateRecover({ ...recovery, action: 'install' }), (e: any) => e.code === 'update_flow_recovery_conflict');
  f.fixLauncher(); successor.webUpdateRecover(recovery); await tick();
  assert.equal(successor.webUpdateStatus().status, 'completed');
  assert.equal(f.calls.npm.filter(args => args.includes('install')).length, 1);
  assert.equal(f.calls.handoffs, 1); assert.equal(f.calls.repairs, 2);
});

test('持久更新：旧进程退出后保留安装事实，网页恢复只交接，不重复下载', async t => {
  let healthy = false;
  const f = fixture(t, { handoffUpdatedBuildrWeb: async () => healthy ? { status: 'restarted', version: '1.1.0' } : { status: 'failed', code: 'handoff_timeout', message: '尚未连接' } });
  f.fixLauncher(); const flow = f.create(); await install(flow);
  const job = f.store.read()!;
  f.store.write({ ...job, revision: job.revision + 1, ownerPid: 2147483647, status: 'applying', stage: 'restart' }, job.revision);
  const resumed = f.create(); const partial = resumed.webUpdateStatus();
  assert.equal(partial.status, 'partial'); assert.equal(partial.installedVersion, '1.1.0');
  assert.equal(partial.steps.restart, 'failed');
  healthy = true;
  resumed.webUpdateRecover({ expectedJobId: partial.id, expectedVersion: partial.version, action: 'restart' }); await tick();
  assert.equal(f.calls.npm.length, 2, '仅初始下载与安装各一次');
  assert.equal(resumed.webUpdateStatus().runningVersion, '1.0.0', '交接成功不能改变原进程启动版本');
  f.setVersion('1.1.0'); assert.equal(f.create().webUpdateStatus().status, 'completed');
});

test('持久更新：较新记录拒绝旧后台下载覆盖；读取不解除写入版本校验', async t => {
  let finish!: (value: any) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = fixture(t, { spawnProcess: () => pending }); const flow = f.create();
  flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  const job = f.store.read()!;
  const newer: UpdateRecord = { ...job, revision: job.revision + 1, status: 'failed', error: { code: 'new_writer', message: '新记录' } };
  f.store.write(newer, job.revision);
  assert.equal(flow.webUpdateStatus().error?.code, 'new_writer');
  finish({ ok: true, status: 0 }); await tick();
  assert.deepEqual(f.store.read(), newer);
  assert.throws(() => f.store.write({ ...newer, revision: job.revision + 1 }, job.revision), (e: any) => e.code === 'update_record_conflict');
});

test('持久更新：安装身份无法核实前不声称已安装，不调用启动入口修复', async t => {
  let repairs = 0;
  const f = fixture(t, { launcher: { inspect: () => { throw Object.assign(new Error('目标安装登记不符'), { code: 'slot_changed' }); }, repair: () => { repairs++; return { status: 'ready' }; } } });
  const flow = f.create(); await install(flow);
  assert.equal(flow.webUpdateStatus().status, 'failed'); assert.equal(flow.webUpdateStatus().installedVersion, null);
  assert.equal(flow.webUpdateStatus().error?.code, 'slot_changed'); assert.equal(repairs, 0); assert.equal(f.calls.handoffs, 0);
});

test('持久更新：损坏记录仅使更新查询失败，初始化不写文件', t => {
  const f = fixture(t); assert.equal(fs.existsSync(path.join(f.root, 'data')), false);
  const flow = f.create(); assert.equal(flow.webUpdateStatus().status, 'idle');
  assert.equal(fs.existsSync(path.join(f.root, 'data')), false);
  flow.webUpdatePrepare({ track: 'stable', expectedVersion: '1.1.0' });
  const folder = path.join(f.root, 'data', 'web-updates'); const file = path.join(folder, fs.readdirSync(folder).find(v => v.endsWith('.json'))!);
  fs.writeFileSync(file, 'damaged'); const successor = f.create();
  assert.throws(() => successor.webUpdateStatus(), (e: any) => e.code === 'update_record_invalid');
  assert.equal(fs.readFileSync(file, 'utf8'), 'damaged');
});

test('恢复失败：启动入口抛错保留失败步骤及已安装事实，不再执行 npm', async t => {
  let attempts = 0;
  const f = fixture(t, { launcher: {
    inspect: () => ({ status: 'failed', error: { code: 'launcher_denied', message: '入口不可写' } }),
    repair: () => { if (++attempts > 1) throw Object.assign(new Error('入口归属变化'), { code: 'ownership_changed' }); return { status: 'failed', error: { code: 'launcher_denied', message: '入口不可写' } }; },
  } });
  const flow = f.create(); await install(flow); const partial = flow.webUpdateStatus();
  flow.webUpdateRecover({ expectedJobId: partial.id, expectedVersion: partial.version, action: 'launcher' }); await tick();
  const failed = flow.webUpdateStatus();
  assert.equal(failed.status, 'partial'); assert.equal(failed.steps.launcher, 'failed');
  assert.equal(failed.launcherError?.code, 'ownership_changed'); assert.equal(failed.installedVersion, '1.1.0');
  assert.equal(f.calls.npm.length, 2);
});

test('重启核验：版本相同而安装归属变化，也不能报告更新完成', async t => {
  let changed = false;
  const f = fixture(t, { launcher: {
    inspect: () => { if(changed) throw Object.assign(new Error('安装归属变化'), {code:'web_update_installation_slot_conflict'}); return {status:'ready'}; },
    repair: () => ({status:'ready'}),
  } });
  const flow = f.create(); await install(flow); f.setVersion('1.1.0'); changed = true;
  const observed = f.create().webUpdateStatus();
  assert.equal(observed.runningVersion, '1.1.0'); assert.equal(observed.status, 'partial');
  assert.equal(observed.stage, 'verify'); assert.equal(observed.steps.verify, 'failed');
  assert.equal(observed.error?.code, 'web_update_installation_slot_conflict');
});
