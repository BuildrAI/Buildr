import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { DESKTOP_HEADER, handoff } from '../src/handoff.ts';
import { desktopAdmission } from '../src/index.ts';
import { endpointIdFor, openDevelopment, probeHealthyInstance } from '../src/launcher.ts';

const origin = 'http://127.0.0.1:4458';
const valid = { origin, endpointId: 'a1b2c3d4e5f6a1b2c3d4e5f6', url: `${origin}/` };

test('handoff accepts only an exact loopback root origin without credentials, path, query or hash', () => {
  assert.deepEqual(handoff(valid), valid);
  for (const change of [
    { origin: 'http://localhost:4458' },
    { origin: 'https://127.0.0.1:4458' },
    { url: `${origin}/another` },
    { url: `${origin}/?next=https://example.com` },
    { url: `${origin}/#ticket=secret` },
    { url: valid.url.replace('4458', '4459') },
    { url: valid.url.replace('http://', 'http://user@') },
    { endpointId: '../other' },
  ]) assert.throws(() => handoff({ ...valid, ...change }), /invalid-handoff/);
});

test('Host admits only the local native-proxied authenticated browser peer with no input body', () => {
  const peer = { id: 'browser' };
  const ctx = { webServer: { host: '127.0.0.1', register: () => () => {} }, connection: { browserPeer: peer, admit: () => ({ peer }) } };
  const req = (headers: IncomingMessage['headers'] = {}, method = 'POST') =>
    ({ method, headers: { [DESKTOP_HEADER]: '1', ...headers } }) as IncomingMessage;
  assert.equal(desktopAdmission(ctx, req()), true);
  for (const request of [
    req({}, 'GET'),
    req({ origin: 'http://127.0.0.1:1234' }),
    req({ 'sec-fetch-site': 'same-origin' }),
    req({ [DESKTOP_HEADER]: undefined }),
    req({ 'x-buildr-harness-desktop': '1', [DESKTOP_HEADER]: undefined }),
    req({ 'content-length': '2' }),
    req({ 'transfer-encoding': 'chunked' }),
    req({ authorization: 'Bearer non-desktop' }),
  ]) {
    assert.equal(desktopAdmission(ctx, request), false);
  }
  assert.equal(desktopAdmission({ ...ctx, webServer: { ...ctx.webServer, host: '0.0.0.0' } }, req()), false);
  assert.equal(desktopAdmission({ ...ctx, connection: { browserPeer: peer, admit: () => ({ peer: { id: 'operator' } }) } }, req()), false);
  assert.equal(desktopAdmission({ ...ctx, connection: { browserPeer: peer, admit: () => ({ rejection: 401 }) } }, req()), false);
});

test('probeHealthyInstance verifies profile, dataRoot and sourceRoot match before returning handoff', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-probe-')));
  try {
    const dataRoot = path.join(root, 'data');
    const packageRoot = path.join(root, 'pkg');
    const otherRoot = path.join(root, 'other-pkg');
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.mkdirSync(otherRoot, { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'instance.json'), JSON.stringify({
      schemaVersion: 'buildr.local-app-instance/v2',
      url: origin,
      secret: 'secret-token',
      pid: 4242,
    }));
    const healthPayload = {
      schemaVersion: 'buildr.local-app-health/v1',
      status: 'ready',
      pid: 4242,
      webProfile: { profile: 'development', dataRoot },
      productIdentity: { channel: 'development', package: '@buildr-ai/buildr', sourceRoot: packageRoot, installationIdentity: 'id-1' },
    };
    const fakeFetch = (async () => Response.json(healthPayload)) as unknown as typeof fetch;

    const ok = await probeHealthyInstance(dataRoot, packageRoot, false, fakeFetch);
    assert.deepEqual(ok, {
      origin,
      endpointId: endpointIdFor(origin, dataRoot, 'id-1'),
      url: `${origin}/`,
    });
    assert.equal(await probeHealthyInstance(dataRoot, otherRoot, false, fakeFetch), null);
    assert.equal(await probeHealthyInstance(dataRoot, packageRoot, true, fakeFetch), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('openDevelopment reuses ready server without spawning, or spawns detached web --no-open when absent', async () => {
  let spawnedArgs: string[] = [];
  const reused = await openDevelopment(
    { node: '/node', packageRoot: '/pkg', dataRoot: '/data', port: 4458 },
    {
      isReleased: false,
      probe: async () => valid,
      spawnProcess: (() => { assert.fail('unexpected spawn'); }) as never,
    },
  );
  assert.deepEqual(reused, valid);

  let probes = 0;
  const fakeChild = Object.assign(new EventEmitter(), { unref() {} });
  const started = await openDevelopment(
    { node: '/node', packageRoot: '/pkg', dataRoot: '/data', port: 4458 },
    {
      isReleased: false,
      pollIntervalMs: 5,
      probe: async () => (++probes >= 2 ? valid : null),
      spawnProcess: ((_cmd: string, args: string[]) => {
        spawnedArgs = args;
        return fakeChild as never;
      }) as never,
    },
  );
  assert.deepEqual(started, valid);
  assert.deepEqual(spawnedArgs, ['/pkg/bin/buildr.mjs', 'web', '--no-open', '--port', '4458', '--replace-mismatched-development']);
});
