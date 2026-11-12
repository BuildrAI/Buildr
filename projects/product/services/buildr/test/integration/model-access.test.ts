import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { createAgentService as createService } from '@buildr-ai/buildr-agent';
import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createAgentServiceHttpContribution } from '../../src/modules/agent-service/interfaces/http/agent-service-http.ts';

// HTTP fixtures must not load host credentials or start host-configured notification delivery.
function createAgentService(options: Parameters<typeof createService>[0]) {
  return createService({ ...options, environment: options.environment ?? { HOME: path.dirname(options.dataRoot) } });
}

test('custom provider HTTP configures a BYOK endpoint, discovers candidates and stays secret-free', { timeout: 30_000 }, async t => {
  const { base, root } = taskRecordFixture(t, 'custom-model-http');
  const dataRoot = path.join(base, 'model-profile'), seen: string[] = [], seenHeaders: Array<Record<string, string | undefined>> = [];
  const upstream = createServer((request, response) => {
    seen.push(`${request.method} ${request.url} ${request.headers.authorization ?? '-'}`);
    seenHeaders.push({ apiKey: request.headers['x-api-key'] as string | undefined, googleKey: request.headers['x-goog-api-key'] as string | undefined, anthropicVersion: request.headers['anthropic-version'] as string | undefined });
    if (request.url?.startsWith('/v1/models')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.url.includes('pageSize=1000')) response.end(JSON.stringify({ models: [{ name: 'models/gemini-x', displayName: 'Gemini X', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] }));
      else if (request.url.includes('limit=1000')) response.end(JSON.stringify({ data: [{ id: 'claude-x', display_name: 'Claude X' }], has_more: false }));
      else response.end(JSON.stringify({ data: [{ id: 'my-model', display_name: '我的模型' }, { id: 'my-model-2' }] }));
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`;
  const service = createAgentService({ dataRoot, executors: [], resolveWorkspace: () => ({ rootPath: root }), assertTask() {} });
  const runtime = createRuntime(), contributions = runtimeContributions(runtime, 'http').filter((item: { id: string }) => item.id !== 'agent-service.http');
  contributions.push(createAgentServiceHttpContribution(() => service));
  const server = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions: contributions }), { url, sessionToken } = await server.ready;
  t.after(async () => {
    await service.close(); server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve()));
    upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve()));
  });
  const endpoint = url + '/api/v1/app/agent-service/model-accounts', discoveryEndpoint = url + '/api/v1/app/agent-service/model-custom/discovery';
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const listed = await (await fetch(endpoint, { headers })).json();
  assert.deepEqual(listed.providers.find((provider: any) => provider.id === 'custom'), { id: 'custom', label: '自定义供应商', custom: true });

  const discover = (body: unknown) => fetch(discoveryEndpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  let response = await discover({ baseUrl, protocol: 'chat-completions', useApiKey: true });
  assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'model_custom_api_key_required');
  for (const invalid of [{ baseUrl, protocol: 'openai-responses', useApiKey: false }, { baseUrl, protocol: 'gemini-vertex', useApiKey: false }, { baseUrl: 'ftp://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false }, { baseUrl: 'https://user:pass@gateway.example.com/v1', protocol: 'chat-completions', useApiKey: false }])
    assert.equal((await discover(invalid)).status, 400);
  response = await discover({ baseUrl, protocol: 'chat-completions', useApiKey: false });
  assert.equal(response.status, 200); const discovered = await response.json();
  assert.deepEqual(discovered.models, [{ id: 'my-model', label: '我的模型' }, { id: 'my-model-2' }]); assert.ok(discovered.observedAt);
  assert.equal(seen.at(-1), 'GET /v1/models -', 'a keyless discovery must not send an Authorization header');
  response = await discover({ baseUrl, protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-private' });
  assert.equal(response.status, 200); const withKey = await response.text();
  assert.ok(withKey.includes('my-model')); assert.ok(!withKey.includes('sk-private'));
  assert.equal(seen.at(-1), 'GET /v1/models Bearer sk-private');
  response = await discover({ baseUrl, protocol: 'responses', useApiKey: false });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).models, [{ id: 'my-model', label: '我的模型' }, { id: 'my-model-2' }]);
  response = await discover({ baseUrl, protocol: 'anthropic-messages', useApiKey: true, apiKey: 'sk-anthropic' });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).models, [{ id: 'claude-x', label: 'Claude X' }]);
  assert.equal(seen.at(-1), 'GET /v1/models?limit=1000 Bearer sk-anthropic');
  assert.deepEqual(seenHeaders.at(-1), { apiKey: 'sk-anthropic', googleKey: undefined, anthropicVersion: '2023-06-01' });
  response = await discover({ baseUrl, protocol: 'gemini', useApiKey: true, apiKey: 'google-key' });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).models, [{ id: 'gemini-x', label: 'Gemini X' }]);
  assert.equal(seen.at(-1), 'GET /v1/models?pageSize=1000 -');
  assert.deepEqual(seenHeaders.at(-1), { apiKey: undefined, googleKey: 'google-key', anthropicVersion: undefined });

  response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ provider: 'custom' }) });
  assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'model_custom_config_required');
  const config = { label: '  我的网关 ', baseUrl, protocol: 'chat-completions', useApiKey: false, models: [{ id: 'manual-model', label: 'Manual', contextWindow: 32000 }] };
  response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ provider: 'custom', custom: config }) });
  assert.equal(response.status, 201); const account = await response.json(), serialized = JSON.stringify(account);
  assert.equal(account.label, '我的网关'); assert.equal(account.provider, 'custom'); assert.equal(account.status, 'ready');
  assert.equal(account.modeLabel, 'OpenAI 兼容');
  assert.equal(account.credentialConfigured, false); assert.equal(account.quota, undefined, 'a custom endpoint has no observable quota');
  assert.deepEqual(account.custom, { protocol: 'chat-completions', baseUrl, useApiKey: false, models: [{ id: 'manual-model', label: 'Manual', contextWindow: 32000 }] });
  assert.ok(account.models.some((model: any) => model.id === 'manual-model' && model.label === 'Manual' && model.contextWindow === 32000));
  assert.ok(!serialized.includes('apiKey'));

  const customEndpoint = endpoint + '/' + account.id + '/custom', reconfigure = (body: unknown) => fetch(customEndpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await reconfigure({ ...config, expectedRevision: 'stale', useApiKey: true, apiKey: 'sk-rotated' })).status, 409);
  response = await reconfigure({ ...config, expectedRevision: account.revision, useApiKey: true, apiKey: 'sk-rotated' });
  assert.equal(response.status, 200); const configured = await response.json();
  assert.equal(configured.credentialConfigured, true); assert.equal(configured.custom.useApiKey, true); assert.ok(!JSON.stringify(configured).includes('sk-rotated'));
  assert.equal(seen.at(-1), 'GET /v1/models Bearer sk-rotated');
  const accessRoot = path.join(dataRoot, 'agent-service', 'model-access'), privateFile = path.join(accessRoot, 'accounts', account.id, 'model-api-key.json');
  assert.equal((await stat(privateFile)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(privateFile, 'utf8')).apiKey, 'sk-rotated');
  assert.ok(!(await readFile(path.join(accessRoot, 'accounts.json'), 'utf8')).includes('sk-rotated'));

  const refreshed = await (await fetch(endpoint, { headers })).json();
  const row = refreshed.accounts.find((item: any) => item.id === account.id);
  assert.equal(row.custom.baseUrl, baseUrl); assert.equal(row.custom.protocol, 'chat-completions'); assert.equal(row.custom.useApiKey, true);
  assert.equal(row.credentialConfigured, true); assert.equal(JSON.stringify(refreshed).includes('sk-rotated'), false);
  assert.equal((await fetch(endpoint + '/' + account.id, { headers })).status, 200);

  for (const [protocol, label, modelId] of [['responses', 'OpenAI Responses', 'my-model'], ['anthropic-messages', 'Anthropic Messages', 'claude-x'], ['gemini', 'Gemini', 'gemini-x']] as const) {
    response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ provider: 'custom', custom: { label: `网关 ${label}`, baseUrl, protocol, useApiKey: false, models: [{ id: modelId, label: modelId }] } }) });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.custom.protocol, protocol); assert.equal(created.modeLabel, label);
    assert.ok(created.models.some((model: any) => model.id === modelId));
  }
});
