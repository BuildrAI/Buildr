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
  assert.equal(requests[1].init.cache, 'no-store', 'live reads bypass the browser cache lock before reaching the server');
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

test('session_forbidden write failures refresh the session once and retry with the new token', async t => {
  const requests = [];
  let first = true;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    if (first) {
      first = false;
      return new Response(JSON.stringify({ error: { code: 'session_forbidden', message: 'Buildr Web session 已失效，请刷新页面。' } }), { status: 403 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  let refreshes = 0;
  let token = 'stale-session';
  const client = createApiClient({
    getWorkspaceId: () => 'space-a',
    sessionAdapter: {
      writeHeaders() { return { 'x-buildr-session': token }; },
      async refreshSession() { refreshes++; token = 'fresh-session'; return true; },
    },
  });
  await client('/api/v1/tasks/task-a', { method: 'PATCH', body: '{}' });
  assert.equal(refreshes, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].init.headers.get('x-buildr-session'), 'stale-session');
  assert.equal(requests[1].init.headers.get('x-buildr-session'), 'fresh-session');
});

test('session_forbidden retry shares one refresh across concurrent writes and never retries twice', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, token: init.headers.get('x-buildr-session') });
    return new Response(JSON.stringify({ error: { code: 'session_forbidden', message: 'stale' } }), { status: 403 });
  });
  let refreshes = 0;
  const sessionAdapter = {
    writeHeaders() { return { 'x-buildr-session': 'token' }; },
    async refreshSession() { refreshes++; return true; },
  };
  const client = createApiClient({ getWorkspaceId: () => 'space-a', sessionAdapter });
  const [first, second] = await Promise.allSettled([
    client('/api/v1/tasks/task-a', { method: 'PATCH', body: '{}' }),
    client('/api/v1/tasks/task-b', { method: 'PATCH', body: '{}' }),
  ]);
  assert.equal(first.status, 'rejected');
  assert.equal(second.status, 'rejected');
  assert.equal(requests.length, 4, 'each write attempts at most one retry after refreshing');
  assert.equal(refreshes, 2, 'adapters dedupe refreshes themselves; the client only awaits its own refresh');
});

test('non-session write failures and failed refreshes keep the original error', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(JSON.stringify({ error: { code: 'task_conflict', message: '冲突' } }), { status: 409 });
  });
  let refreshes = 0;
  const client = createApiClient({
    getWorkspaceId: () => 'space-a',
    sessionAdapter: {
      writeHeaders() { return { 'x-buildr-session': 'token' }; },
      async refreshSession() { refreshes++; return false; },
    },
  });
  await assert.rejects(client('/api/v1/tasks/task-a', { method: 'PATCH', body: '{}' }), error => error.code === 'task_conflict' && error.status === 409);
  assert.equal(requests, 1);
  assert.equal(refreshes, 0, 'non-session errors never attempt a refresh');
});

test('a missing local session refreshes before the first write attempt', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  let token = null;
  const sessionError = () => { const error = new Error('Buildr Web session 已失效，请刷新页面。'); error.code = 'session_forbidden'; return error; };
  const client = createApiClient({
    getWorkspaceId: () => 'space-a',
    sessionAdapter: {
      writeHeaders() {
        if (!token) throw sessionError();
        return { 'x-buildr-session': token };
      },
      async refreshSession() { token = 'recovered-session'; return true; },
    },
  });
  await client('/api/v1/tasks/task-a', { method: 'DELETE' });
  assert.equal(requests.length, 1, 'refresh happens before any write request is sent');
  assert.equal(requests[0].init.headers.get('x-buildr-session'), 'recovered-session');
});

test('read errors retain HTTP status and code so unavailable sources are distinguished from transient failures', async t => {
  let status = 404;
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'task_file_checkout_unavailable', message: '所选来源不可用' } }), { status }));
  const client = createApiClient({ getWorkspaceId: () => 'space-a', sessionAdapter: { writeHeaders() { throw Error('read must not acquire a write session'); } } });
  await assert.rejects(client('/api/v1/tasks/one/file-diff'), error => error.status === 404 && error.code === 'task_file_checkout_unavailable');
  status = 503;
  await assert.rejects(client('/api/v1/tasks/one/file-diff'), error => error.status === 503 && error.code === 'task_file_checkout_unavailable');
});

test('安装资源位置保持本机全局路径，技能打开仍使用当前工作空间及写会话', async t => {
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push({url,init});return new Response('{"requested":true}',{status:200});});
  const client=createApiClient({getWorkspaceId:()=> 'space-a',sessionAdapter:{writeHeaders:()=>({'x-buildr-session':'token'})}});
  await client('/api/v1/installation/resources');
  await client('/api/v1/installation/resources/open',{method:'POST',body:'{"resourceSet":"set"}'});
  await client('/api/v1/agent-assets/skills/demo/open',{method:'POST',body:'{}'});
  assert.deepEqual(requests.map(r=>r.url),['/api/v1/installation/resources','/api/v1/installation/resources/open','/api/v1/workspaces/space-a/agent-assets/skills/demo/open']);
  assert.equal(requests[1].init.headers.get('x-buildr-session'),'token');assert.equal(requests[2].init.headers.get('x-buildr-session'),'token');
});

test('authenticated reads with an explicit old header refresh the actual retry instead of repeating the stale header',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});let token='old',refreshes=0;const seen=[];
 globalThis.fetch=async(_url,init)=>{seen.push(init.headers.get('x-buildr-session'));return new Response(JSON.stringify(seen.length===1?{error:{code:'session_forbidden'}}:{ok:true}),{status:seen.length===1?403:200});};
 const api=createApiClient({getWorkspaceId:()=>null,sessionAdapter:{writeHeaders:()=>({'x-buildr-session':token}),refreshSession:async()=>{refreshes++;token='fresh';return true;}}});
 assert.deepEqual(await api('/api/v1/app/agent-service/pending-requests',{headers:{'x-buildr-session':'old'}}),{ok:true});assert.deepEqual(seen,['old','fresh']);assert.equal(refreshes,1);
});

test('cancelled session refresh cannot resend a restart request', async t => {
  const controller = new AbortController();
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(JSON.stringify({ error: { code: 'session_forbidden' } }), { status: 403 });
  });
  const api = createApiClient({ getWorkspaceId: () => null, sessionAdapter: {
    writeHeaders: () => ({ 'x-buildr-session': 'old' }),
    refreshSession: async signal => { assert.equal(signal, controller.signal); controller.abort(); return true; },
  } });
  await assert.rejects(api('/api/v1/app/restart', { method: 'POST', body: '{}', signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(requests, 1);
});
