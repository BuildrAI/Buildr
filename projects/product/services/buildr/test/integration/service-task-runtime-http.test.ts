import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { createServiceRuntimeView } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import { createServiceTaskRuntimeApplication } from '../../src/modules/service-runtime/application/service-task-runtime-application.ts';
import { createServiceRuntimeHttp } from '../../src/modules/service-runtime/interfaces/http/service-runtime-http.ts';
import { createServiceRuntimeCliContributions } from '../../src/modules/service-runtime/interfaces/cli/service-runtime-cli.ts';
import type { ServiceWorktree } from '../../src/modules/service-runtime/domain/worktrees.ts';

const script = `const http=require('node:http');const port=Number(process.argv.find(x=>x.startsWith('--port=')).slice(7));http.createServer((req,res)=>res.end(process.env.BUILDR_TEST_BACKEND||'backend-ok')).listen(port,'127.0.0.1',()=>console.log('ready'));`;
async function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-task-http-'));
  const codes = ['front', 'back'];
  const worktrees = (code: string): ServiceWorktree[] => [
    { id: code + '-task', path: path.join(root, 'task', code), label: '任务目录', main: false, taskId: 'task', taskTitle: '本地验证', branch: 'feature', head: 'task-head', dirty: true },
    { id: code + '-main', path: path.join(root, 'main', code), label: '主工作库', main: true, taskId: null, taskTitle: null, branch: 'qa', head: 'main-head', dirty: false },
  ];
  for (const code of codes) for (const w of worktrees(code)) fs.mkdirSync(w.path, { recursive: true });
  const catalog = { listServices: () => codes.map(code => ({ id: code, code, name: code, repositoryId: code, modulePath: '', projects: ['p'] })) };
  const runtime = createServiceRuntimeApplication({ resolveService: (_root, code) => codes.includes(code) ? { id: code, code } : null, listWorktrees: (_root, code) => worktrees(code) });
  const view = createServiceRuntimeView({ catalog, runtime });
  const taskRuntime = createServiceTaskRuntimeApplication({ readTaskScope: () => ({ taskId: 'task', title: '本地验证', scope: { projects: ['p'], services: [] } }), runtime, view, catalog });
  const http = createServiceRuntimeHttp({ runtime, view, taskRuntime });
  for (const code of codes) await runtime.writeDefinition(root, code, `version: 1\nsource: agent\nverifiedAt: '2026-10-22'\nlocal:\n  command: [${JSON.stringify(process.execPath)}, -e, ${JSON.stringify(script)}, --]\n  cwd: .\n  preferredPort: ${code === 'front' ? 24201 : 24202}\n  portOverride: --port\n  readiness: {kind: log, pattern: ready}\n  timeoutSeconds: 10\n${code === 'front' ? '  backend: {serviceCode: back, environmentVariable: BUILDR_TEST_BACKEND, remoteUrl: https://test.example.com}\n' : ''}`);
  t.after(async () => {
    for (const run of await runtime.listRuns(root)) if (run.status === 'starting' || run.status === 'running') await runtime.stopRun(root, run.id);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const call = (method: string, suffix: string, body: Record<string, unknown> = {}, write = true): Promise<any> => http.handle({ request: { method }, suffix, searchParams: new URLSearchParams(), root,
    authorizeWrite: () => { if (!write) throw Object.assign(new Error('unauthorized'), { status: 403 }); },
    readBody: async (allowed: Set<string>) => { for (const key of Object.keys(body)) assert.ok(allowed.has(key), key); return body; },
  });
  return { root, runtime, view, taskRuntime, call, cli: createServiceRuntimeCliContributions({ runtime, view, taskRuntime })[0] };
}

test('task HTTP serves scoped selection and real local/remote injected target with partial independent runs', async t => {
  const f = await fixture(t);
  const observed = await f.call('GET', '/service-runtime/tasks/task');
  assert.equal(observed?.status, 200); assert.equal(observed!.body.services.length, 2);
  assert.equal(observed!.body.services.find((s: any) => s.service.code === 'front').connectionTarget.target, null);
  assert.equal(observed!.body.services.find((s: any) => s.service.code === 'back').connectionTarget, null);
  assert.ok(observed!.body.services.every((s: any) => s.worktree.taskId === 'task' && !s.worktree.main));
  await assert.rejects(f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'front', worktreeId: 'front-task' }] }, false));
  const remote = await f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'front', worktreeId: 'front-task' }], connection: 'remote', origin: 'human' });
  const frontend = remote!.body.results[0].run;
  assert.equal(frontend.status, 'running'); assert.equal(frontend.origin, 'human');
  assert.equal(await (await fetch(frontend.url)).text(), 'https://test.example.com', 'actual spawned frontend must receive the selected remote target');
  assert.equal((await f.runtime.listRuns(f.root)).filter(r => r.status === 'running').length, 1);
  await f.runtime.stopRun(f.root, frontend.id);
  const local = await f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'front', worktreeId: 'front-task', expectedBackendRunId: 'stale-ui-backend' }, { serviceCode: 'back', worktreeId: 'back-task' }], connection: 'local' });
  const front = local!.body.results[0].run, back = local!.body.results[1].run;
  const connected = await f.call('GET', '/service-runtime/tasks/task');
  assert.equal(connected.body.services.find((s: any) => s.service.code === 'front').connectionTarget.target.url, back.url);
  assert.equal(connected.body.services.find((s: any) => s.service.code === 'front').connectionTarget.target.runId, back.id);
  assert.equal(front.connection.runId, back.id); assert.equal(await (await fetch(front.url)).text(), back.url);
  assert.equal(front.taskId, 'task'); assert.equal(back.taskId, 'task');
  const staleOnlyFront = await f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'front', worktreeId: 'front-task', expectedBackendRunId: 'stale-ui-backend' }], connection: 'local' });
  assert.equal(staleOnlyFront.body.results[0].error.code, 'service_runtime_backend_changed');
  assert.equal((await f.runtime.listRuns(f.root)).find(run => run.id === front.id)?.status, 'running');
  assert.equal(await f.call('GET', '/service-runtime/services/front/deployment-plan'), null);
  assert.equal(await f.call('POST', '/service-runtime/services/front/deployments'), null);
});

test('task HTTP rejects malformed and foreign selections, keeping unrelated main run alive', async t => {
  const f = await fixture(t);
  const main = await f.runtime.startRun(f.root, { serviceCode: 'back', worktreeId: 'back-main' }); await f.runtime.waitForRun(f.root, main.id);
  await assert.rejects(f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'front', worktreeId: 'front-task', path: '/outside' }] }));
  const missing = await f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'front', worktreeId: 'front-task' }], connection: 'local' });
  assert.ok(missing!.body.results[0].error); assert.equal(missing!.body.results[0].run, null);
  assert.equal((await f.runtime.listRuns(f.root)).find(r => r.id === main.id)?.status, 'running');
  const foreign = await f.call('POST', '/service-runtime/tasks/task/runs', { selected: [{ serviceCode: 'back', worktreeId: 'back-main' }] });
  assert.ok(foreign!.body.results[0].error);
});

test('CLI task-start waits for real process and returns the same records as HTTP detail', async t => {
  const f = await fixture(t);
  const result: any = await f.cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'task-start', '--task', 'task', '--services', 'back', '--target', f.root, '--json'] });
  assert.equal(result.results.length, 1); assert.equal(result.results[0].run.status, 'running');
  const detail = await f.call('GET', '/service-runtime/tasks/task'); assert.equal(detail!.body.runs[0].id, result.results[0].run.id);
  await assert.rejects(f.cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'deploy', '--target', f.root] }), /Unknown/);
});
