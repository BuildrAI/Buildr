import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';

test('DELETE without a body still requires the same local write session', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  let headersRead = 0;
  const client = createApiClient({
    getWorkspaceId: () => 'space-a',
    sessionAdapter: { writeHeaders() { headersRead++; return { 'x-buildr-session': 'local-session' }; } },
  });
  await client('/api/v1/workbench/preferences/pinned-task/task-a', { method: 'DELETE' });
  assert.equal(headersRead, 1);
  assert.equal(requests[0].url, '/api/v1/workspaces/space-a/workbench/preferences/pinned-task/task-a');
  assert.equal(requests[0].init.headers.get('x-buildr-session'), 'local-session');
  await client('/api/v1/tasks');
  assert.equal(headersRead, 1, 'read operations do not acquire a write session');
});

test('missing write session fails before any preference deletion request', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('must not fetch'); });
  const client = createApiClient({
    getWorkspaceId: () => 'space-a',
    sessionAdapter: { writeHeaders() { throw new Error('session expired'); } },
  });
  await assert.rejects(client('/api/v1/workbench/preferences/planned-task/task-a', { method: 'DELETE' }), /session expired/);
  assert.equal(requests, 0);
});

test('read errors retain HTTP status and code so unavailable sources are distinguished from transient failures', async t => {
  let status = 404;
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'task_file_checkout_unavailable', message: '所选来源不可用' } }), { status }));
  const client = createApiClient({ getWorkspaceId: () => 'space-a', sessionAdapter: { writeHeaders() { throw Error('read must not acquire a write session'); } } });
  await assert.rejects(client('/api/v1/tasks/one/file-diff'), error => error.status === 404 && error.code === 'task_file_checkout_unavailable');
  status = 503;
  await assert.rejects(client('/api/v1/tasks/one/file-diff'), error => error.status === 503 && error.code === 'task_file_checkout_unavailable');
});
