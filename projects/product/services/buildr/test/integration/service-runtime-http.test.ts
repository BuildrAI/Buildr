import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceDeploymentApplication, type DeploymentConnectionPort } from '../../src/modules/service-runtime/application/service-deployment-application.ts';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { createServiceRuntimeView } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import { DEPLOYMENT_ADAPTER_PROTOCOL, type ProgramObservation } from '../../src/modules/service-runtime/domain/deployment.ts';
import type { ServiceWorktree } from '../../src/modules/service-runtime/domain/worktrees.ts';
import { createServiceRuntimeHttp } from '../../src/modules/service-runtime/interfaces/http/service-runtime-http.ts';

const serverScript = `
const port = Number((process.argv.find(item => item.startsWith('--port=')) || '--port=0').slice(7));
require('http').createServer((request, response) => { response.end('ok'); }).listen(port, '127.0.0.1', () => {
  console.log('Started TestApp on ' + port);
});
setInterval(() => {}, 1000);
`;

function definitionYaml(port: number, qa: boolean) {
  return `version: 1
source: agent
verifiedAt: '2026-10-21T14:02:00+08:00'
local:
  command: [${JSON.stringify(process.execPath)}, -e, ${JSON.stringify(serverScript)}, --]
  cwd: .
  preferredPort: ${port}
  portOverride: --port
  readiness:
    kind: log
    pattern: Started TestApp
  timeoutSeconds: 15
${qa ? `environments:
  qa:
    connectionId: jixian-yunque
    program: deploy
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-QA
    integrationBranch: dev-pigs
    timeoutSeconds: 30
` : ''}`;
}

const branchOutput = JSON.stringify({ protocol: DEPLOYMENT_ADAPTER_PROTOCOL, branches: [{ branch: 'dev-pigs', commit: '3f2a1c9d0e', integration: true }, { branch: 'feature/portfolios', commit: 'a11c0ffee0' }] });

type Fixture = {
  root: string;
  worktrees: ServiceWorktree[];
  connection: { describe: DeploymentConnectionPort['describe']; responses: Array<ProgramObservation | Error>; calls: Array<{ program: string; input: any }> };
  http: ReturnType<typeof createServiceRuntimeHttp>;
  call(method: string, suffix: string, options?: { query?: string; body?: unknown; write?: boolean }): Promise<any>;
  writes: () => number;
};

function fixture(t: { after(callback: () => void): void }, options: { port: number; qa?: boolean; connection?: DeploymentConnectionPort['describe']; responses?: Array<ProgramObservation | Error> } = { port: 18091 }): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-http-'));
  const checkout = path.join(root, 'checkout');
  fs.mkdirSync(checkout, { recursive: true });
  fs.mkdirSync(path.join(root, 'services', 'pigs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'services', 'pigs', 'runtime.yml'), definitionYaml(options.port, options.qa !== false), 'utf8');
  const worktrees: ServiceWorktree[] = [
    { id: 'wt-main', path: checkout, label: '主检出', main: true, branch: 'dev-pigs', head: '99887766', dirty: false, taskId: null, taskTitle: null },
    { id: 'wt-task', path: checkout, label: 'task-worktree', main: false, branch: 'task/service-runtime', head: '11223344', dirty: true, taskId: 'service-runtime-prototype', taskTitle: '服务运行与部署', },
  ];
  const calls: Array<{ program: string; input: any }> = [];
  const responses = options.responses ?? [];
  const connection = {
    describe: options.describe ?? ((_root: string, id: string) => ({ id, name: '云雀（集鲜）', revision: 'rev-1', diagnostic: null })),
    async run(_root: string, call: { connection: { id: string; revision: string }; program: string; args: string[]; input: string; timeoutMs: number }): Promise<ProgramObservation> {
      calls.push({ program: call.program, input: JSON.parse(call.input) });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? { status: 'exited', exitCode: 0, signal: null, stdout: call.input.includes('list-branches') ? branchOutput : JSON.stringify({ state: 'submitted', externalUrl: 'https://yunque.example/builds/91' }), diagnostics: [] };
    },
  };
  const runtime = createServiceRuntimeApplication({ resolveService: () => ({ id: 'service-pigs', code: 'pigs' }), listWorktrees: () => worktrees });
  // 断言失败时也要停止受管进程，否则测试进程会等待子进程退出。
  t.after(async () => { for (const run of await runtime.listRuns(root)) if (run.status === 'starting' || run.status === 'running') await runtime.stopRun(root, run.id); });
  const deployment = createServiceDeploymentApplication({ resolveService: () => ({ id: 'service-pigs', code: 'pigs' }), listWorktrees: () => worktrees, connection });
  const view = createServiceRuntimeView({ catalog: { listServices: () => [{ id: 'service-pigs', code: 'pigs', name: '农牧后端业务服务', modulePath: '', repositoryId: 'repo-pigs', projects: ['jixian'] }] }, runtime, deployment });
  const http = createServiceRuntimeHttp({ view, runtime, deployment });
  let writes = 0;
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    worktrees,
    connection: { describe: connection.describe, responses, calls },
    http,
    writes: () => writes,
    async call(method, suffix, callOptions = {}) {
      return http.handle({
        request: { method },
        root,
        suffix,
        searchParams: new URLSearchParams(callOptions.query ?? ''),
        authorizeWrite: () => {
          if (callOptions.write !== true) throw Object.assign(new Error('写请求必须来自当前 Buildr Web。'), { code: 'origin_forbidden', status: 403 });
          writes += 1;
        },
        readBody: async (allowed: Set<string>) => {
          const body = (callOptions.body ?? {}) as Record<string, unknown>;
          for (const field of Object.keys(body)) if (!allowed.has(field)) throw Object.assign(new Error(`不支持字段：${field}。`), { code: 'task_api_input_invalid', status: 400 });
          return body;
        },
      });
    },
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('等待超时');
}

test('运行定义、运行列表、启动、日志与停止经 HTTP 表面可用', async t => {
  const f = fixture(t, { port: 18091 });
  assert.equal(await f.http.handle({ request: { method: 'GET' }, root: f.root, suffix: '/workbench', searchParams: new URLSearchParams(), authorizeWrite: () => {}, readBody: async () => ({}) }), null);

  const overview = await f.call('GET', '/service-runtime/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.body.services.length, 1);
  assert.equal(overview.body.services[0].environments.qa.defined, true);
  assert.equal(overview.body.local.activeCount, 0);

  const detail = await f.call('GET', '/service-runtime/services/pigs');
  assert.equal(detail.body.service.definition?.local.preferredPort, 18091);
  assert.equal(detail.body.worktrees.length, 2);
  assert.equal(detail.body.service.projects[0], 'jixian');

  await assert.rejects(f.call('GET', '/service-runtime/overview', { query: 'unexpected=1' }), (error: any) => error.code === 'service_runtime_query_forbidden' && error.status === 400);

  await assert.rejects(f.call('POST', '/service-runtime/services/pigs/runs', { body: { worktreeId: 'wt-main' } }), (error: any) => error.code === 'origin_forbidden' && error.status === 403);
  await assert.rejects(f.call('POST', '/service-runtime/services/pigs/runs', { write: true, body: { worktreeId: 'wt-main', path: '/tmp' } }), (error: any) => error.status === 400);

  const authorized = f.writes();
  const started = await f.call('POST', '/service-runtime/services/pigs/runs', { write: true, body: { worktreeId: 'wt-main' } });
  assert.equal(started.status, 200);
  assert.equal(started.body.status, 'starting');
  assert.equal(f.writes(), authorized + 1);
  const runId = started.body.id as string;

  await assert.rejects(f.call('POST', '/service-runtime/services/pigs/runs', { write: true, body: { worktreeId: 'wt-main' } }), (error: any) => error.code === 'service_runtime_worktree_busy' && error.status === 409);

  await waitFor(async () => (await f.call('GET', '/service-runtime/services/pigs')).body.service.runs.some((run: any) => run.id === runId && run.status === 'running'));
  const running = (await f.call('GET', '/service-runtime/services/pigs')).body.service.runs.find((run: any) => run.id === runId);
  assert.equal(running.status, 'running');
  assert.ok(running.actualPort >= 18091, `实际端口应不低于首选端口：${running.actualPort}`);
  assert.equal((await f.call('GET', '/service-runtime/overview')).body.local.activeCount, 1);

  const log = await f.call('GET', `/service-runtime/runs/${runId}/log`);
  assert.match(log.body.log, new RegExp(`Started TestApp on ${running.actualPort}`));
  assert.equal(log.body.truncated, false);
  const bounded = await f.call('GET', `/service-runtime/runs/${runId}/log`, { query: 'maxBytes=1024' });
  assert.equal(bounded.body.maxBytes, 1024);

  const stopped = await f.call('POST', `/service-runtime/runs/${runId}/stop`, { write: true, body: {} });
  assert.equal(stopped.body.status, 'stopped');
  assert.equal((await f.call('GET', '/service-runtime/overview')).body.local.activeCount, 0);
});

test('QA 计划只读、提交保存最近结果，未知结果不自动重试', async t => {
  const f = fixture(t, { port: 18092 });
  const plan = await f.call('GET', '/service-runtime/services/pigs/deployment-plan');
  assert.equal(plan.status, 200);
  assert.equal(plan.body.branch, 'dev-pigs');
  assert.equal(plan.body.integration, true);
  assert.equal(plan.body.remoteCommit, '3f2a1c9d0e');
  assert.equal(plan.body.version, 'dev-pigs@3f2a1c9');
  assert.equal(plan.body.available, true);
  assert.equal(plan.body.local.id, 'wt-main');
  assert.equal(plan.body.branches.length, 2);
  assert.equal(f.connection.calls[0]!.input.action, 'list-branches');

  const other = await f.call('GET', '/service-runtime/services/pigs/deployment-plan', { query: 'branch=feature%2Fportfolios&worktreeId=wt-task' });
  assert.equal(other.body.integration, false);
  assert.equal(other.body.remoteCommit, 'a11c0ffee0');
  assert.equal(other.body.local.dirty, true);

  await assert.rejects(f.call('POST', '/service-runtime/services/pigs/deployments', { write: true, body: { branch: 'dev-pigs' } }), (error: any) => error.status === 400);
  const submitted = await f.call('POST', '/service-runtime/services/pigs/deployments', { write: true, body: { branch: 'dev-pigs', commit: '3f2a1c9d0e' } });
  assert.equal(submitted.body.state, 'submitted');
  assert.equal(submitted.body.externalUrl, 'https://yunque.example/builds/91');
  const submit = f.connection.calls.find(call => call.input.action === 'submit')!;
  assert.deepEqual(submit.input.plan, { branch: 'dev-pigs', commit: '3f2a1c9d0e' });
  assert.equal(submit.input.targetRef, 'JX-FRESHX-PIGS-QA');
  const overview = await f.call('GET', '/service-runtime/overview');
  assert.equal(overview.body.services[0].environments.qa.latest.state, 'submitted');
  assert.equal(overview.body.services[0].environments.qa.targetRef, 'JX-FRESHX-PIGS-QA');

  const timeout = fixture(t, { port: 18093, responses: [{ status: 'timeout', exitCode: null, signal: 'SIGTERM', stdout: '', diagnostics: [] }] });
  const unknown = await timeout.call('POST', '/service-runtime/services/pigs/deployments', { write: true, body: { branch: 'dev-pigs', commit: '3f2a1c9d0e' } });
  assert.equal(unknown.body.state, 'unknown');
  await assert.rejects(timeout.call('POST', '/service-runtime/services/pigs/deployments', { write: true, body: { branch: 'dev-pigs', commit: '3f2a1c9d0e' } }), (error: any) => error.code === 'service_deployment_unknown_pending' && error.status === 409);
  assert.equal(timeout.connection.calls.filter(call => call.input.action === 'submit').length, 1);
  const acknowledged = await timeout.call('POST', '/service-runtime/services/pigs/deployments', { write: true, body: { branch: 'dev-pigs', commit: '3f2a1c9d0e', acknowledgeUnknown: true } });
  assert.equal(acknowledged.status, 200);
});

test('提供者缺失或未登记环境时只降级部署动作', async t => {
  const missing = fixture(t, { port: 18094, describe: () => null });
  const plan = await missing.call('GET', '/service-runtime/services/pigs/deployment-plan');
  assert.equal(plan.status, 200);
  assert.equal(plan.body.available, false);
  assert.match(plan.body.diagnostics.join(' '), /部署动作不可用/);
  await assert.rejects(missing.call('POST', '/service-runtime/services/pigs/deployments', { write: true, body: { branch: 'dev-pigs', commit: '3f2a1c9d0e' } }), (error: any) => error.code === 'service_deployment_provider_unavailable' && error.status === 409);
  assert.equal((await missing.call('GET', '/service-runtime/overview')).status, 200);

  const undefinedQa = fixture(t, { port: 18095, qa: false });
  await assert.rejects(undefinedQa.call('GET', '/service-runtime/services/pigs/deployment-plan'), (error: any) => error.code === 'service_deployment_environment_undefined' && error.status === 409);
  assert.equal((await undefinedQa.call('GET', '/service-runtime/services/pigs')).body.service.environments.qa.defined, false);
  await assert.rejects(undefinedQa.call('GET', '/service-runtime/services/unknown'), (error: any) => error.status === 404);
});
