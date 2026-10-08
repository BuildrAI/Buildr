import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDiscoveringBuildrBridge, discoverBinding, registryFile } from '../../plugin/process.ts';

async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildr-entry-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const environment = { HOME: root };
  const registry = registryFile(environment, 'darwin');
  await fs.mkdir(path.dirname(registry), { recursive: true });
  const first = path.join(root, 'first.mjs'), second = path.join(root, 'second.mjs');
  await fs.writeFile(first, 'export {};\n');
  await fs.writeFile(second, 'export {};\n');
  async function register(entry: string) {
    await fs.writeFile(registry, JSON.stringify({ schemaVersion: 'buildr.product-installation-registry/v1', installations: [
      { origin: { channel: 'npm', package: '@buildr-ai/buildr' }, entryPath: entry, runtime: { executable: process.execPath } },
    ] }));
  }
  await register(first);
  const binding = { nodeExecutable: process.execPath, cliEntry: first };
  let discoveries = 0, queries = 0;
  const identity = { channel: 'npm', package: '@buildr-ai/buildr', ownershipIdentity: 'fixture-current', version: '1',
    protocolIdentity: 'buildr.web-protocol/v1', applicationPayloadDigest: 'fixture-payload' };
  const status = (ready = true) => ({ schemaVersion: 'buildr.installation-status/v1', channels: { npm: { status: 'installed', identity } },
    instances: { released: ready ? { status: 'ready', identity: { ...identity, url: 'http://127.0.0.1:49002' } } : { status: 'absent' } } });
  const dependencies = { platform: 'darwin', environment, exec: async () => { queries++; return { stdout: JSON.stringify(status()) }; } };
  const discover = async () => { discoveries++; return discoverBinding(environment, 'darwin', process.execPath); };
  return { first, second, binding, register, dependencies, discover, status,
    get discoveries() { return discoveries; }, get queries() { return queries; } };
}

test('automatic entry migration recovers once and concurrent clicks share discovery and query', async t => {
  const f = await fixture(t);
  const bridge = createDiscoveringBuildrBridge({}, 'npm', f.dependencies, f.discover);
  t.after(() => bridge.dispose());
  assert.equal((await bridge.open())?.ready, true);
  await f.register(f.second);
  await fs.rm(f.first);
  const results = await Promise.all([bridge.open(), bridge.open(), bridge.open()]);
  assert.ok(results.every(result => result?.ready));
  assert.equal(f.discoveries, 2);
  assert.equal(f.queries, 2);
});

test('an explicit entry never silently rebinds after migration', async t => {
  const f = await fixture(t);
  const bridge = createDiscoveringBuildrBridge({ binding: f.binding }, 'npm', f.dependencies,
    async () => assert.fail('explicit entry must not discover'));
  t.after(() => bridge.dispose());
  await f.register(f.second);
  await fs.rm(f.first);
  await assert.rejects(bridge.open(), { code: 'installation-drift' });
  assert.equal(f.queries, 0);
});

test('rediscovery still failing is bounded to one retry per click', async t => {
  const f = await fixture(t);
  await fs.rm(f.first);
  let discoveries = 0;
  const bridge = createDiscoveringBuildrBridge({}, 'npm', f.dependencies, async () => { discoveries++; return f.binding; });
  t.after(() => bridge.dispose());
  await assert.rejects(bridge.open(), { code: 'installation-drift' });
  assert.equal(discoveries, 2);
  await assert.rejects(bridge.open(), { code: 'installation-drift' });
  assert.equal(discoveries, 3);
});

test('query failure does not invalidate a discovered entry', async t => {
  const f = await fixture(t);
  const bridge = createDiscoveringBuildrBridge({}, 'npm', { ...f.dependencies, exec: async () => { throw Error('fixture query failure'); } }, f.discover);
  t.after(() => bridge.dispose());
  await assert.rejects(bridge.open(), { code: 'query-failed' });
  await assert.rejects(bridge.open(), { code: 'query-failed' });
  assert.equal(f.discoveries, 1);
});

test('launcher file drift does not rebind the installation entry', async t => {
  const f = await fixture(t);
  const status = { ...f.status(false), launchers: { npm: path.join(path.dirname(f.first), 'missing.app') } };
  const bridge = createDiscoveringBuildrBridge({}, 'npm', { ...f.dependencies, exec: async () => ({ stdout: JSON.stringify(status) }) }, f.discover);
  t.after(() => bridge.dispose());
  await assert.rejects(bridge.open(), { code: 'installation-drift' });
  assert.equal(f.discoveries, 1);
});

test('disposal cancels pending discovery and a late result cannot query or launch', async t => {
  const f = await fixture(t), found = Promise.withResolvers<typeof f.binding>(), started = Promise.withResolvers<void>();
  const bridge = createDiscoveringBuildrBridge({}, 'npm', f.dependencies, async () => { started.resolve(); return found.promise; });
  const pending = bridge.open();
  await started.promise;
  bridge.dispose();
  await assert.rejects(pending, { code: 'disposed' });
  found.resolve(f.binding);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.queries, 0);
  await assert.rejects(bridge.open(), { code: 'disposed' });
});

test('schema-empty binding can discover after a previously missing installation', async t => {
  const f = await fixture(t);
  let installed = false;
  const bridge = createDiscoveringBuildrBridge({ binding: {} } as any, 'npm', f.dependencies, async () => installed ? f.binding : null);
  t.after(() => bridge.dispose());
  assert.equal(await bridge.open(), null);
  installed = true;
  assert.equal((await bridge.open())?.ready, true);
});
