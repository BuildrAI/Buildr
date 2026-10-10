import assert from 'node:assert/strict';
import test from 'node:test';
import { createActivationMonitor, type ActivationView } from '../../plugin/activation-client.ts';
import type { ActivationStatus } from '../../plugin/src/types.ts';

const active: ActivationStatus = { active: true, packageName: 'candidate' };
const conflict: ActivationStatus = { active: false, packageName: 'candidate', code: 'plugin-conflict', message: 'conflict', ownerPackage: 'current' };

test('business contributions follow the Host lease and resume only after a positive recheck', async () => {
  let status: ActivationStatus = conflict;
  let mounts = 0, releases = 0;
  const views: ActivationView[] = [];
  const monitor = createActivationMonitor({ read: async () => status,
    mount: async () => { mounts++; return () => { releases++; }; }, publish: value => views.push(value) });
  await monitor.refresh();
  assert.equal(mounts, 0); assert.deepEqual(views.at(-1), { kind: 'conflict', ownerPackage: 'current' });
  status = active;
  await monitor.refresh(); await monitor.refresh();
  assert.equal(mounts, 1); assert.equal(releases, 0); assert.deepEqual(views.at(-1), { kind: 'active' });
  status = conflict; await monitor.refresh();
  assert.equal(releases, 1); await monitor.dispose(); assert.equal(releases, 1);
});

test('a bounded transport failure preserves already mounted business and allows retry', async () => {
  let failing = false, mounts = 0, releases = 0;
  const views: ActivationView[] = [];
  const monitor = createActivationMonitor({ timeoutMs: 10,
    read: () => failing ? new Promise(() => {}) : Promise.resolve(active),
    mount: async () => { mounts++; return () => { releases++; }; }, publish: value => views.push(value) });
  await monitor.refresh(); failing = true; await monitor.refresh();
  assert.equal(mounts, 1); assert.equal(releases, 0); assert.deepEqual(views.at(-1), { kind: 'unavailable' });
  failing = false; await monitor.refresh(); assert.equal(mounts, 1);
  await monitor.dispose(); assert.equal(releases, 1);
});

test('a late activation response cannot recreate a disabled plugin contribution', async () => {
  let resolve!: (status: ActivationStatus) => void, mounts = 0;
  const views: ActivationView[] = [];
  const monitor = createActivationMonitor({ read: () => new Promise(done => { resolve = done; }),
    mount: async () => { mounts++; return () => {}; }, publish: value => views.push(value) });
  const pending = monitor.refresh(); await monitor.dispose(); resolve(active); await pending;
  assert.equal(mounts, 0); assert.deepEqual(views, []);
});

test('disposal during mounting releases the late child without publishing it active', async () => {
  let finish!: (release: () => void) => void, releases = 0;
  const views: ActivationView[] = [];
  const monitor = createActivationMonitor({ read: async () => active,
    mount: () => new Promise(done => { finish = done; }), publish: value => views.push(value) });
  const pending = monitor.refresh();
  await Promise.resolve(); await Promise.resolve();
  await monitor.dispose(); finish(() => { releases++; }); await pending;
  assert.equal(releases, 1); assert.deepEqual(views, []);
});
