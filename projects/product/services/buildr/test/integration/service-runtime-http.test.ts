import test from 'node:test';
import type {ManagedRunRecord} from '../../src/modules/service-runtime/domain/runs.ts';
import assert from 'node:assert/strict';
import { createServiceRuntimeView, type ServiceRuntimeView, type ServiceRuntimeDetail } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import { createServiceRuntimeHttp } from '../../src/modules/service-runtime/interfaces/http/service-runtime-http.ts';
import { runtimeFixture } from '../helpers/service-runtime-fixture.ts';

type Overview = Awaited<ReturnType<ServiceRuntimeView['overview']>>;
// Interpret transport bytes with the owning public view type; assertions below
// still check the actual status, identity and fields returned by the handler.
async function response<T>(pending: Promise<{status:number;body:unknown}|null>) {
  const result=await pending;assert.ok(result,'the expected HTTP route must be handled');return {...result,body:result.body as T};
}

test('网页单项启动与共享视图、真实连接、日志和停止，旧QA入口移除', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const view = createServiceRuntimeView({ runtime: f.runtime, catalog: { listServices: () => [{ id: 'frontend', code: 'frontend', name: '前端', type: 'frontend', repositoryId: 'repo', modulePath: '', projects: ['pig'] }] } });
  const http = createServiceRuntimeHttp({ runtime: f.runtime, view });
  let writes = 0;
  const call = (method: string, suffix: string, body: Record<string, unknown> = {}, write = false, query = '') => http.handle({ request: { method }, suffix, root: f.root, searchParams: new URLSearchParams(query), authorizeWrite() { if (!write) throw Object.assign(new Error('forbidden'), { status: 403 }); writes += 1; }, readBody: async (allowed: Set<string>) => { if (Object.keys(body).some(key => !allowed.has(key))) throw Object.assign(new Error('input'), { status: 400 }); return body; } });
  const overview = await response<Overview>(call('GET', '/service-runtime/overview'));
  assert.equal(overview.body.services.length, 1);
  assert.ok(overview.body.services[0].definition);
  assert.equal('environments' in overview.body.services[0], false);
  const backend = overview.body.services[0].definition.local.backends?.[0];
  assert.ok(backend && 'environmentVariable' in backend);
  assert.equal(backend.environmentVariable, 'VITE_PROXY_URL');
  assert.equal(await call('GET', '/service-runtime/services/frontend/deployment-plan'), null);
  assert.equal(await call('POST', '/service-runtime/services/frontend/deployments', { branch: 'qa', commit: 'head' }), null);
  assert.equal(writes, 0);
  await assert.rejects(call('POST', '/service-runtime/services/frontend/runs', { worktreeId: 'frontend-main' }), (error: any) => error.status === 403);
  await assert.rejects(call('POST', '/service-runtime/services/frontend/runs', { worktreeId: 'frontend-main', path: '/tmp' }, true), (error: any) => error.status === 400);
  for (const invalid of [{ origin: 'unknown' }, { connection: 'arbitrary' }, { expectedWorktree: { path: '/tmp' } }, { taskId: '../escape' }]) await assert.rejects(call('POST', '/service-runtime/services/frontend/runs', { worktreeId: 'frontend-main', ...invalid }, true), (error: any) => error.status === 400);
  const source = f.worktrees.frontend![0]!;
  const started = await response<ManagedRunRecord>(call('POST', '/service-runtime/services/frontend/runs', { worktreeId: source.id, origin: 'agent', connection: 'remote', expectedWorktree: { path: source.path, branch: source.branch, head: source.head, dirty: source.dirty } }, true));
  assert.equal(started.status, 200);
  const ready = await f.runtime.waitForRun(f.root, started.body.id);
  assert.equal(ready.status, 'running');
  assert.equal(ready.origin, 'agent');
  const detail = await response<ServiceRuntimeDetail>(call('GET', '/service-runtime/services/frontend'));
  assert.equal(detail.body.service.runs[0].id, ready.id);
  assert.ok(detail.body.service.runs[0].connection);
  assert.equal(detail.body.service.runs[0].connection.url, 'https://test.example/api');
  assert.equal(detail.body.service.runs[0].branch, 'qa');
  assert.equal(detail.body.service.runs[0].main, true);
  assert.equal(detail.body.connectionTargets[source.id][0].target, null);
  await assert.rejects(call('POST', `/service-runtime/runs/${ready.id}/restart`, { connection: 'local' }, true), (error: any) => error.code === 'service_runtime_backend_unavailable' && error.status === 409);
  assert.equal((await response<ServiceRuntimeDetail>(call('GET', '/service-runtime/services/frontend'))).body.service.runs[0].status, 'running');
  await assert.rejects(call('POST', `/service-runtime/runs/${ready.id}/restart`, { connection: 'arbitrary' }, true), (error: any) => error.status === 400);
  await assert.rejects(call('POST', `/service-runtime/runs/${ready.id}/restart`, { connection: 'remote' }), (error: any) => error.status === 403);
  const localBackend = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })).id);
  await assert.rejects(call('POST', `/service-runtime/runs/${ready.id}/restart`, { connection: 'local', expectedBackendRunId: 'stale-backend' }, true), (error: any) => error.code === 'service_runtime_backend_changed' && error.status === 409);
  assert.equal((await response<ServiceRuntimeDetail>(call('GET', '/service-runtime/services/frontend'))).body.service.runs[0].status, 'running');
  await assert.rejects(call('POST', `/service-runtime/runs/${ready.id}/restart`, { connection: 'local', expectedBackendRunId: '../escape' }, true), (error: any) => error.status === 400);
  assert.match((await response<{log:string}>(call('GET', `/service-runtime/runs/${ready.id}/log`))).body.log, /Started Fixture/);
  const replacement = await response<ManagedRunRecord>(call('POST', `/service-runtime/runs/${ready.id}/restart`, { connection: 'remote', expectedWorktree: { path: source.path, branch: source.branch, head: source.head, dirty: source.dirty } }, true));
  assert.notEqual(replacement.body.id, ready.id);
  assert.equal(replacement.body.origin, 'human');
  assert.equal((await f.runtime.waitForRun(f.root, replacement.body.id)).status, 'running');
  assert.equal((await response<ManagedRunRecord>(call('POST', `/service-runtime/runs/${replacement.body.id}/stop`, {}, true))).body.status, 'stopped');
  await f.runtime.stopRun(f.root, localBackend.id);
  assert.equal((await response<Overview>(call('GET', '/service-runtime/overview'))).body.local.activeCount, 0);
  await assert.rejects(call('GET', '/service-runtime/overview', {}, false, 'unexpected=1'), (error: any) => error.status === 400);
});
