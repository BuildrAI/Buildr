import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { inspectDevelopmentInstance, restartDevelopmentInstance } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';

const proof = (digit: string) => `sha256-${digit.repeat(64)}`;

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'development-restart-coordination-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(dataRoot);
  const identity = { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', source: 'checkout', sourceRoot: root,
    developmentRuntime: { executable: process.execPath }, checkout: { head: 'a'.repeat(40) } };
  const launcherIdentityPath = path.join(root, 'launcher.json');
  fs.writeFileSync(launcherIdentityPath, JSON.stringify(identity));
  const file = path.join(dataRoot, 'instance.json');
  let restarting = false;
  const write = (pid: number, digest = proof('1'), launcherIdentity = identity) => {
    fs.writeFileSync(file, JSON.stringify({ pid, url: 'http://127.0.0.1:4458', secret: `private-${pid}`, launcherIdentity,
      productIdentity: { developmentRuntimeIdentity: digest } }));
  };
  write(100);
  const stops: number[] = [];
  let spawns = 0;
  const base = {
    dataRoot, launcherIdentityPath, expectedSourceRoot: root, expectedHead: identity.checkout.head,
    nodeExecutable: process.execPath, expectedRuntimeIdentity: proof('2'), previousPid: 100,
    projectBridge: path.join(root, 'buildr'), timeoutMs: 300,
    fetchImpl: async (_url: any, init: any) => {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(init.headers['x-buildr-instance'], state.secret);
      if (init.method === 'POST') {
        stops.push(state.pid);
        fs.rmSync(file);
        return new Response('{}', { status: 202 });
      }
      return new Response(JSON.stringify({ ...state, schemaVersion: 'buildr.local-app-health/v1', status: 'ready', restartInProgress: restarting }));
    },
    spawnImpl: (() => { spawns++; write(300, proof('2')); return { pid: 300, once() {}, unref() {} }; }) as any,
    killProcess: () => { throw new Error('Must not kill a process in this scenario.'); },
  };
  return { root, identity, file, write, stops, base, restarting: (value: boolean) => { restarting = value; }, spawns: () => spawns };
}

test('continuity waits for an authenticated page restart and reuses its target even for forced restart', async t => {
  const f = fixture(t);
  f.restarting(true);
  const result = await restartDevelopmentInstance({ ...f.base, forceRestart: true,
    wait: async () => { f.write(200, proof('2')); f.restarting(false); } });
  assert.equal(result.disposition, 'reused');
  assert.equal(result.instance?.pid, 200);
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
});

test('continuity handles page restart accepted between its health observation and quit request', async t => {
  const f = fixture(t);
  let conflict = true;
  const result = await restartDevelopmentInstance({ ...f.base,
    fetchImpl: async (url: any, init: any) => {
      if (init.method === 'POST' && conflict) {
        conflict = false;
        f.write(200, proof('2'));
        return new Response(JSON.stringify({ error: { code: 'restart_in_progress' } }), { status: 409 });
      }
      return f.base.fetchImpl(url, init);
    }, wait: async () => {} });
  assert.equal(result.instance?.pid, 200);
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
});

test('continuity re-observes the same owner after page restart before applying changed content', async t => {
  const f = fixture(t);
  f.restarting(true);
  const result = await restartDevelopmentInstance({ ...f.base,
    wait: async () => { f.write(200); f.restarting(false); } });
  assert.equal(result.instance?.pid, 300);
  assert.deepEqual(f.stops, [200]);
  assert.equal(f.spawns(), 1);
});

test('continuity accepts a completed same-owner page restart observed after launcher installation', async t => {
  const f = fixture(t);
  f.write(200);
  const result = await restartDevelopmentInstance(f.base);
  assert.equal(result.instance?.pid, 300);
  assert.deepEqual(f.stops, [200]);
});

test('continuity preserves an unrelated owner that appeared while waiting', async t => {
  const f = fixture(t);
  f.restarting(true);
  await assert.rejects(restartDevelopmentInstance({ ...f.base,
    wait: async () => { f.write(200, proof('1'), { ...f.identity, sourceRoot: path.join(f.root, 'foreign') }); f.restarting(false); } }),
  (error: any) => error.code === 'development-web-continuity.owner-mismatch');
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).pid, 200);
});

test('continuity waiting has a deadline and does not stop the in-progress instance', async t => {
  const f = fixture(t);
  f.restarting(true);
  await assert.rejects(restartDevelopmentInstance({ ...f.base, timeoutMs: 15, wait: async () => { await new Promise(resolve => setTimeout(resolve, 5)); } }),
    (error: any) => error.code === 'development-web-continuity.restart-wait-timeout');
  assert.deepEqual(f.stops, []);
  assert.equal(f.spawns(), 0);
});

test('continuity health proof rejects launcher identity drift', async t => {
  const f = fixture(t);
  const observed = await inspectDevelopmentInstance({ dataRoot: f.base.dataRoot,
    fetchImpl: async () => new Response(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: 100,
      launcherIdentity: { ...f.identity, sourceRoot: path.join(f.root, 'foreign') }, productIdentity: { developmentRuntimeIdentity: proof('1') } })) });
  assert.equal(observed.status, 'stale');
  assert.equal(observed.reason, 'health-identity-mismatch');
});

function manualSource(f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) {
  f.write(100, proof('1'), null as any);
  const state = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  state.productIdentity = { channel: 'development', sourceRoot: f.root, runtime: { role: 'development', executable: process.execPath }, developmentRuntimeIdentity: proof('1'), ...patch };
  fs.writeFileSync(f.file, JSON.stringify(state));
}
test('authenticated manual source Web is updated through the same owner without inventing a Launcher identity', async t => {
  const f = fixture(t); manualSource(f);
  const observed = await inspectDevelopmentInstance({ dataRoot: f.base.dataRoot, fetchImpl: f.base.fetchImpl });
  assert.equal(observed.status, 'healthy-development'); assert.equal(observed.instance?.launcherIdentity, null);
  const result = await restartDevelopmentInstance(f.base);
  assert.equal(result.instance?.pid, 300); assert.deepEqual(f.stops, [100]); assert.equal(f.spawns(), 1);
});
for (const patch of [
  { channel: 'npm' }, { sourceRoot: undefined }, { developmentRuntimeIdentity: undefined },
  { runtime: { role: 'host', executable: process.execPath } }, { runtime: { role: 'development' } },
  { sourceRoot: '/unrelated/source' }, { runtime: { role: 'development', executable: '/unrelated/node' } },
]) test('manual source update preserves unknown or foreign ownership: ' + JSON.stringify(patch), async t => {
  const f = fixture(t); manualSource(f, patch);
  await assert.rejects(restartDevelopmentInstance(f.base), (error: any) => error.code === 'development-web-continuity.owner-mismatch');
  assert.deepEqual(f.stops, []); assert.equal(f.spawns(), 0);
});
