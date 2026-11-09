import test from 'node:test';

import assert from 'node:assert/strict';

import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registerQoderProvider, unregisterQoderProvider } from '../../src/executors/qoder/provider-registration.ts';
import { qoderGatewayProvider, type ExecutorGateway } from '../../src/executors/model-gateway.ts';

const lease: ExecutorGateway = { identity: 'source/account/model/conversation', baseUrl: 'http://127.0.0.1:8317/v1', apiKey: 'local-only-lease', models: [{ id: 'swe-2-flash', label: 'SWE-2 Flash', tools: true }] };

test('register merges into the connection settings file and keeps user providers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qoder-settings-'));
  await writeFile(join(dir, 'settings.json'), JSON.stringify({ providers: { bailian: { type: 'openai-compatible' } }, theme: 'dark' }));
  const registration = qoderGatewayProvider(lease);
  await registerQoderProvider(dir, registration);
  const settings = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
  assert.equal(settings.theme, 'dark');
  assert.ok(settings.providers.bailian);
  assert.equal(settings.providers[registration.id].baseUrl, lease.baseUrl);
  assert.equal(settings.providers[registration.id].apiKey, lease.apiKey);
  assert.equal(settings.providers[registration.id].models[0].model, 'swe-2-flash');
  assert.equal((await stat(join(dir, 'settings.json'))).mode & 0o777, 0o600);
  await registerQoderProvider(dir, registration);
  const again = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
  assert.deepEqual(Object.keys(again.providers).sort(), ['bailian', registration.id].sort());
});

test('unregister removes only the exact route this lease wrote', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qoder-settings-'));
  const registration = qoderGatewayProvider(lease);
  await registerQoderProvider(dir, registration);
  const rotated = { ...registration, provider: { ...registration.provider, baseUrl: 'http://127.0.0.1:9000/v1' } };
  await registerQoderProvider(dir, rotated);
  await unregisterQoderProvider(dir, registration);
  let settings = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
  assert.equal(settings.providers[registration.id].baseUrl, rotated.provider.baseUrl);
  await unregisterQoderProvider(dir, rotated);
  settings = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
  assert.deepEqual(settings.providers, {});
});

test('missing files stay absent and unreadable settings are never replaced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qoder-settings-'));
  await unregisterQoderProvider(dir, qoderGatewayProvider(lease));
  await assert.rejects(() => readFile(join(dir, 'settings.json')), /ENOENT/);
  await writeFile(join(dir, 'settings.json'), 'not json');
  await assert.rejects(() => registerQoderProvider(dir, qoderGatewayProvider(lease)), /qoder_settings_unreadable/);
  assert.equal(await readFile(join(dir, 'settings.json'), 'utf8'), 'not json');
});
