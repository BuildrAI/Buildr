import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceTaskRuntimeApplication } from '../../src/modules/service-runtime/application/service-task-runtime-application.ts';
import type { ManagedRunRecord } from '../../src/modules/service-runtime/domain/runs.ts';
import type { ServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import type { ServiceRuntimeSummary, ServiceRuntimeView } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import type { ServiceWorktree } from '../../src/modules/service-runtime/domain/worktrees.ts';

function fixture(options: { backend?: boolean; failFrontend?: boolean; ambiguous?: boolean } = {}) {
  const worktree = (code: string): ServiceWorktree => ({ id: code + '-task', path: '/task/' + code, label: '任务', main: false, branch: 'task', head: code + '-head', dirty: false, taskId: 'task', taskTitle: '测试任务' });
  const local = (code: string) => ({ command: ['node', 'server.js'], cwd: '.', profile: null, preferredPort: code === 'back' ? 8080 : 3000, portOverride: '--port', readiness: { kind: 'http' as const, path: '/' }, timeoutSeconds: 10,
    ...(code === 'front' ? { backends: [{ serviceCode: 'back', environmentVariable: 'PROXY_TARGET', remoteUrl: 'https://test.example.com' }] } : {}) });
  const summary = (code: string): ServiceRuntimeSummary => ({ id: code, code, name: code, type: 'backend', projects: ['project'], repositoryId: code, definition: { source: 'agent', verifiedAt: '2026-10-22', path: code + '/runtime.yml', local: local(code) }, definitionDiagnostic: null, runs: [], local: { activeCount: 0, activePorts: [] } });
  const services = ['front', 'back'].map(summary), runs: ManagedRunRecord[] = [], calls: string[] = [];
  const worktrees = Object.fromEntries(['front', 'back'].map(code => [code, options.ambiguous && code === 'front' ? [worktree(code), { ...worktree(code), id: 'another' }] : [worktree(code), { ...worktree(code), id: code + '-other', taskId: 'other' }, { ...worktree(code), id: code + '-main', main: true, taskId: null }]]));
  const createRun = (code: string, mode?: 'local' | 'remote'): ManagedRunRecord => {
    const connections = code === 'front' ? [{ mode: mode || 'local' as const, url: mode === 'remote' ? 'https://test.example.com' : 'http://127.0.0.1:8081', serviceCode: 'back', runId: mode === 'remote' ? null : runs.find(run => run.serviceCode === 'back' && run.taskId === 'task')?.id || null }] : [];
    return { id: code + '-' + (runs.length + 1), serviceId: code, serviceCode: code, worktreeId: code + '-task', worktreePath: '/task/' + code, worktreeLabel: '任务', branch: 'task', head: code + '-head', main: false, dirty: false, taskId: 'task', taskTitle: '测试任务', origin: 'agent', pid: 12345, preferredPort: 8080, actualPort: code === 'back' ? 8081 : 3001, portNote: '', status: 'running', startedAt: '2026-10-22', stoppedAt: null, failure: null, logPath: '', launch: null, url: code === 'back' ? 'http://127.0.0.1:8081' : 'http://127.0.0.1:3001', connection: connections[0] ?? null, connections, processIdentity: null };
  };
  const runtime = {
    listWorktrees: (_root: string, code: string) => worktrees[code] || [],
    readDefinition: (_root: string, code: string) => ({ definition: { version: 1, source: 'agent', verifiedAt: 'now', local: local(code) }, path: code + '/runtime.yml' }),
    listRuns: async () => runs,
    connectionTarget: (_root: string, code: string, source: ServiceWorktree) => {
      if (code !== 'front') return null;
      // This fake supplies the runtime collaborator's result; real target selection is covered by integration tests.
      const backend = runs.find(run => run.serviceCode === 'back' && run.taskId === source.taskId && run.status === 'running');
      return [backend
        ? { serviceCode: 'back', environmentVariable: 'PROXY_TARGET', remoteUrl: 'https://test.example.com', candidates: [{ runId: backend.id, url: backend.url, worktreeLabel: backend.worktreeLabel, branch: backend.branch, sameScope: true }], target: { runId: backend.id, serviceCode: backend.serviceCode, url: backend.url, worktreeLabel: backend.worktreeLabel, branch: backend.branch }, reason: null }
        : { serviceCode: 'back', environmentVariable: 'PROXY_TARGET', remoteUrl: 'https://test.example.com', candidates: [], target: null, reason: '本地后端未就绪' }];
    },
    waitForRun: async (_root: string, id: string) => runs.find(run => run.id === id)!,
    startRun: async (_root: string, input: { serviceCode: string; connection?: 'local' | 'remote' }) => {
      calls.push(input.serviceCode);
      if (input.serviceCode === 'front' && (options.failFrontend || input.connection === 'local' && !runs.some(run => run.serviceCode === 'back' && run.taskId === 'task'))) throw Object.assign(new Error('前端启动失败或后端未就绪'), { code: 'service_runtime_backend_unavailable' });
      const run = createRun(input.serviceCode, input.connection); runs.push(run); return run;
    },
  };
  const task = { taskId: 'task', title: '测试任务', scope: { projects: ['project'], services: [{ project: 'project', service: 'front' }, { project: 'project', service: 'back' }] } };
  const app = createServiceTaskRuntimeApplication({ readTaskScope: () => task, catalog: { listServices: () => services.map(service => ({ ...service, modulePath: '' })) }, runtime: runtime as unknown as ServiceRuntimeApplication,
    view: { overview: async () => ({ services, runs }) } as unknown as ServiceRuntimeView });
  if (options.backend) runs.push(createRun('back'));
  return { app, calls, runs, createRun, task, runtime, worktrees };
}
const selection = (code: string) => ({ serviceCode: code, worktreeId: code + '-task' });

test('task read selects only unique task-owned worktrees', async () => {
  const { app } = fixture(); const result = await app.detail('/', 'task');
  assert.deepEqual(result.services.map(item => item.worktree?.id), ['front-task', 'back-task']);
  const ambiguous = await fixture({ ambiguous: true }).app.detail('/', 'task');
  assert.equal(ambiguous.services[0].worktree, null); assert.match(ambiguous.services[0].diagnostics.join(), /多个/);
});
test('single backend starts no frontend; remote frontend starts no backend', async () => {
  const one = fixture(); await one.app.start('/', { taskId: 'task', selected: [selection('back')] }); assert.deepEqual(one.calls, ['back']);
  const two = fixture(); const result = await two.app.start('/', { taskId: 'task', selected: [selection('front')], connection: 'remote' }); assert.deepEqual(two.calls, ['front']); assert.equal(result.results[0].run?.connection?.mode, 'remote');
});
test('local group orders backend first and uses its actual displaced port', async () => {
  const { app, calls } = fixture(); const result = await app.start('/', { taskId: 'task', selected: [selection('front'), selection('back')], connection: 'local' });
  assert.deepEqual(calls, ['back', 'front']); assert.equal(result.results[0].run?.connection?.url, 'http://127.0.0.1:8081'); assert.equal(result.results[0].error, null);
});
test('frontend failure preserves successful backend and independently reports both results', async () => {
  const { app, runs } = fixture({ failFrontend: true }); const result = await app.start('/', { taskId: 'task', selected: [selection('front'), selection('back')] });
  assert.ok(result.results[0].error); assert.equal(result.results[1].run?.status, 'running'); assert.equal(runs.length, 1);
});
test('frontend local alone does not start unselected dependency or borrow another task', async () => {
  const f = fixture(); const other = f.createRun('back'); other.taskId = 'other'; f.runs.push(other);
  const result = await f.app.start('/', { taskId: 'task', selected: [selection('front')], connection: 'local' }); assert.ok(result.results[0].error); assert.deepEqual(f.calls, ['front']); assert.equal(f.runs.length, 1);
});
test('already matching task runs are reused; different connection is an explicit conflict', async () => {
  const f = fixture(); await f.app.start('/', { taskId: 'task', selected: [selection('front'), selection('back')] });
  const again = await f.app.start('/', { taskId: 'task', selected: [selection('front'), selection('back')] }); assert.ok(again.results.every(result => result.reused)); assert.deepEqual(f.calls, ['back', 'front']);
  const changed = await f.app.start('/', { taskId: 'task', selected: [selection('front')], connection: 'remote' }); assert.equal(changed.results[0].error?.code, 'service_runtime_connection_conflict');
});
test('wrong source, out of scope, duplicate selection fail without starting those services', async () => {
  const f = fixture(); const wrong = await f.app.start('/', { taskId: 'task', selected: [{ ...selection('front'), worktreeId: 'front-main' }, selection('unknown')] });
  assert.ok(wrong.results.every(result => result.error)); assert.deepEqual(f.calls, []);
  const drift = await f.app.start('/', { taskId: 'task', selected: [{ ...selection('back'), expectedWorktree: { path: '/wrong', branch: 'task', head: 'back-head', dirty: false } }] }); assert.equal(drift.results[0].error?.code, 'service_runtime_worktree_changed');
  await assert.rejects(f.app.start('/', { taskId: 'task', selected: [selection('back'), selection('back')] })); assert.deepEqual(f.calls, []);
});
test('scope removed during backend readiness prevents starting frontend and preserves ready backend', async () => {
  const f = fixture();
  f.runtime.waitForRun = async (_root, id) => {
    f.task.scope.services = [{ project: 'project', service: 'back' }];
    return f.runs.find(run => run.id === id)!;
  };
  const result = await f.app.start('/', { taskId: 'task', selected: [selection('front'), selection('back')], connection: 'local' });
  assert.deepEqual(f.calls, ['back']);
  assert.equal(result.results[0].error?.code, 'service_runtime_task_scope_mismatch');
  assert.equal(result.results[1].run?.status, 'running');
});
test('scope removed during run reconciliation prevents the subsequent start', async () => {
  const f = fixture();
  f.runtime.listRuns = async () => {
    f.task.scope.services = [{ project: 'project', service: 'front' }];
    return f.runs;
  };
  const result = await f.app.start('/', { taskId: 'task', selected: [selection('back')] });
  assert.deepEqual(f.calls, []);
  assert.equal(result.results[0].error?.code, 'service_runtime_task_scope_mismatch');
});
test('worktree changed while waiting for an existing instance rejects stale reuse', async () => {
  const f = fixture();
  const existing = f.createRun('back'); existing.status = 'starting'; f.runs.push(existing);
  f.runtime.waitForRun = async () => {
    f.worktrees.back![0]!.head = 'new-head';
    existing.status = 'running';
    return existing;
  };
  const result = await f.app.start('/', { taskId: 'task', selected: [selection('back')] });
  assert.equal(result.results[0].error?.code, 'service_runtime_worktree_changed');
  assert.deepEqual(f.calls, []);
  assert.equal(existing.status, 'running');
});
