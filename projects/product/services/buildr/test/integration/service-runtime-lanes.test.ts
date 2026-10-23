import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { createServiceRuntimeApplication } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { createServiceTaskRuntimeApplication } from '../../src/modules/service-runtime/application/service-task-runtime-application.ts';
import { createServiceRuntimeView } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import { isActiveRun } from '../../src/modules/service-runtime/domain/runs.ts';
import { startManagedProcess } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';
import { routingDigest } from '../../src/modules/service-runtime/infrastructure/local-routing-context.ts';
import { createServiceRuntimeHttp } from '../../src/modules/service-runtime/interfaces/http/service-runtime-http.ts';
import { createServiceRuntimeCliContributions } from '../../src/modules/service-runtime/interfaces/cli/service-runtime-cli.ts';
import { freeRuntimePort } from '../helpers/service-runtime-fixture.ts';

// 应用端协议替身；产品负责真实进程、文件与记录，不模拟 Nacos 或宣称业务验证。
const server = `
const fs=require('fs'), http=require('http');
const routingFile=process.env.LOCAL_SERVICE_ROUTING_FILE||null;
const value=routingFile?JSON.parse(fs.readFileSync(routingFile,'utf8')):{};
const port=Number(process.argv.find(x=>x.startsWith('--port=')).slice(7));
http.createServer((req,res)=>{
 if(req.headers['x-buildr-expected-run'] && req.headers['x-buildr-expected-run']!==value.runId){res.statusCode=409;res.end('changed');return;}
 res.setHeader('content-type','application/json');
 res.end(JSON.stringify({...value,routingFile,environment:process.env.RUNTIME_TEST_GATEWAY,observations:{},digest:process.argv.includes('--wrong-observation')?'wrong':value.digest}));
}).listen(port,'127.0.0.1');
`;

async function fixture(t: test.TestContext, options: { fail?: string; wrongObservation?: string; onWorktreeRead?(serviceCode: string): void } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-runtime-lanes-'));
  const codes = ['a', 'b', 'c'];
  const worktrees = Object.fromEntries(codes.map(code => [code, ['task', 'other', 'main'].map(scope => {
    const directory = path.join(root, `${code}-${scope}`); fs.mkdirSync(directory);
    return { id: `${code}-${scope}`, path: directory, label: scope, main: scope === 'main', branch: `codex/${scope}`,
      head: `${code}-head`, dirty: false, taskId: scope === 'main' ? null : scope, taskTitle: scope === 'main' ? null : scope };
  })]));
  const catalog = { listServices: () => codes.map(code => ({ id: code, code, name: code, type: 'backend', modulePath: '', repositoryId: code, projects: ['project'] })) };
  const runtime = createServiceRuntimeApplication({
    resolveService: (_root, code) => codes.includes(code) ? { id: code, code, workspaceId: 'test-workspace' } : null,
    listWorktrees: (_root, code) => { options.onWorktreeRead?.(code); return worktrees[code] ?? []; },
    startProcess: async input => {
      if (options.fail && path.basename(input.cwd) === `${options.fail}-task`) throw new Error('fixture launch failed');
      return startManagedProcess(input);
    },
  });
  for (const [index, code] of codes.entries()) {
    const next = codes[(index + 1) % codes.length]!;
    const command = [process.execPath, '-e', server, '--', ...(options.wrongObservation === code ? ['--wrong-observation'] : [])];
    await runtime.writeDefinition(root, code, YAML.stringify({ version: 2, source: 'agent', verifiedAt: new Date().toISOString(), local: {
      command, cwd: '.', preferredPort: await freeRuntimePort(), portOverride: '--port',
      readiness: { kind: 'http', path: '/actuator/local-service-routing' }, timeoutSeconds: 10,
      routing: { serviceId: `${code}-app`, environmentVariable: 'LOCAL_SERVICE_ROUTING_FILE', format: 'buildr.local-service-routing/v1', observationPath: '/actuator/local-service-routing' },
      backends: [{ kind: 'service-discovery', serviceCode: next, serviceId: `${next}-app`, fallback: { kind: 'existing-discovery', context: 'qa' } }],
    } }));
  }
  const view = createServiceRuntimeView({ catalog, runtime });
  const tasks = createServiceTaskRuntimeApplication({ catalog, runtime, view,
    readTaskScope: (_root, taskId) => ({ taskId, title: taskId, scope: { projects: ['project'], services: [] } }),
  });
  const source = (code: string, task = 'task') => worktrees[code]!.find(value => task === 'main' ? value.main : value.taskId === task)!;
  const start = async (code: string, task = 'task') => {
    const worktree = source(code, task);
    const run = await runtime.startRun(root, { serviceCode: code, worktreeId: worktree.id, ...(worktree.taskId ? { taskId: worktree.taskId } : {}) });
    return runtime.waitForRun(root, run.id);
  };
  t.after(async () => {
    try { for (const run of await runtime.listRuns(root)) if (isActiveRun(run)) await runtime.stopRun(root, run.id); }
    finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  return { root, runtime, view, tasks, worktrees, source, start };
}

test('单服务使用所选远程环境，任务目录与独立工作树均不注入任务上下文', async t => {
  const f = await fixture(t);
  const existing = f.runtime.readDefinition(f.root, 'a')!.definition;
  existing.local.remoteEnvironments = [
    { code: 'qa', name: '测试环境', url: 'https://qa.example.com', variables: { RUNTIME_TEST_GATEWAY: 'https://qa.example.com' } },
    { code: 'stage', name: '联调环境', url: 'https://stage.example.com', variables: { RUNTIME_TEST_GATEWAY: 'https://stage.example.com' } },
  ];
  await f.runtime.writeDefinition(f.root, 'a', YAML.stringify(existing));
  const source = f.source('a');
  const running = await f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: source.id, standalone: true, environment: 'stage' });
  const run = await f.runtime.waitForRun(f.root, running.id);
  assert.equal(run.status, 'running'); assert.equal(run.taskId, null); assert.equal(run.routing, undefined); assert.equal(run.environment?.code, 'stage');
  const response = await fetch(run.url).then(value => value.json()) as any;
  assert.equal(response.routingFile, null); assert.equal(response.environment, 'https://stage.example.com');
  await assert.rejects(f.runtime.restartRun(f.root, run.id, { environment: 'removed' }), { code: 'service_runtime_environment_unknown' });
  assert.equal((await f.runtime.listRuns(f.root)).find(item => item.id === run.id)?.status, 'running');
  await f.runtime.stopRun(f.root, run.id);
  source.taskId = null;
  const independent = await f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: source.id, standalone: true });
  assert.equal((await f.runtime.waitForRun(f.root, independent.id)).status, 'running');
  assert.equal(independent.routing, undefined); assert.equal(independent.environment?.code, 'qa');
});

test('发现缺失回落声明的 QA，文件不制造 URL；其他任务不会成为候选', async t => {
  const f = await fixture(t);
  const other = await f.start('b', 'other');
  const caller = await f.start('a');
  assert.equal(caller.status, 'running'); assert.equal(caller.connection, null);
  assert.deepEqual(caller.connections.map(value => [value.kind, value.mode, value.url, value.runId]), [['service-discovery', 'remote', null, null]]);
  assert.notEqual(caller.routing?.laneId, other.routing?.laneId);
  const file = JSON.parse(fs.readFileSync(caller.routing!.contextPath, 'utf8'));
  const { digest, ...body } = file;
  assert.equal(digest, routingDigest(body));
  assert.equal(file.format, 'buildr.local-service-routing/v1');
  assert.equal(file.taskId, 'task');
  assert.equal('scope' in file, false);
  assert.deepEqual(file.targets, [{ serviceCode: 'b', serviceId: 'b-app', mode: 'qa' }]);
  assert.deepEqual(f.runtime.connectionTarget(f.root, 'a', f.source('a'))?.[0]?.candidates, []);
  assert.equal((await f.runtime.listRuns(f.root, 'a'))[0]?.routing?.observation?.status, 'observed');
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'c', worktreeId: f.source('c').id, taskId: 'task', backendTargets: [{ serviceCode: 'a', target: 'run', runId: other.id }] }));
});

test('预分配编号支持 A→B→C→A；未启动未选服务，重用不改实际目标', async t => {
  const f = await fixture(t);
  const selected = ['a', 'b', 'c'].map(code => ({ serviceCode: code, worktreeId: f.source(code).id }));
  const result = await f.tasks.start(f.root, { taskId: 'task', selected });
  assert.ok(result.results.every(value => value.run?.status === 'running'), JSON.stringify(result));
  const runs = new Map(result.results.map(value => [value.serviceCode, value.run!]));
  assert.equal(new Set([...runs.values()].map(run => run.routing?.laneId)).size, 1);
  for (const [code, next] of [['a', 'b'], ['b', 'c'], ['c', 'a']] as const) {
    const run = runs.get(code)!; const connection = run.connections[0]!;
    assert.equal(connection.mode, 'local'); assert.equal(connection.runId, runs.get(next)?.id);
    const file = JSON.parse(fs.readFileSync(run.routing!.contextPath, 'utf8'));
    assert.equal(file.targets[0].runId, runs.get(next)?.id);
  }
  const again = await f.tasks.start(f.root, { taskId: 'task', selected });
  assert.ok(again.results.every(value => value.reused), JSON.stringify(again));
  assert.equal((await f.runtime.listRuns(f.root)).length, 3);
});

test('组合一项失败保留其他成功项，选择快照仍固定失败编号且不回落 QA', async t => {
  const f = await fixture(t, { fail: 'b' });
  const result = await f.tasks.start(f.root, { taskId: 'task', selected: ['a', 'b', 'c'].map(code => ({ serviceCode: code, worktreeId: f.source(code).id })) });
  assert.equal(result.results[0]?.run?.status, 'running'); assert.ok(result.results[1]?.error);
  assert.equal(result.results[2]?.run?.status, 'running');
  const caller = result.results[0]!.run!;
  assert.equal(caller.connections[0]?.mode, 'local');
  assert.equal(caller.connections[0]?.runId, result.results[1]?.run?.id);
  assert.equal((JSON.parse(fs.readFileSync(caller.routing!.contextPath, 'utf8'))).targets[0].mode, 'local');
});

test('切换缺少观察或旧目标失效时保留调用方，新实例必须重新明确选择', async t => {
  const f = await fixture(t);
  const target = await f.start('b'); const caller = await f.start('a');
  await assert.rejects(f.runtime.restartRun(f.root, caller.id, {}), /上下文观察/);
  await f.runtime.stopRun(f.root, target.id);
  const replacement = await f.start('b');
  assert.notEqual(target.id, replacement.id); assert.equal(target.actualPort, replacement.actualPort);
  const input = { expectedRoutingDigest: caller.routing!.contextDigest, backendTargets: [{ serviceCode: 'b', target: 'run' as const, runId: target.id }] };
  await assert.rejects(f.runtime.restartRun(f.root, caller.id, input), /所选运行/);
  assert.equal((await f.runtime.listRuns(f.root, 'a'))[0]?.status, 'running');
  const changed = await f.runtime.restartRun(f.root, caller.id, { ...input, backendTargets: [{ serviceCode: 'b', target: 'run', runId: replacement.id }] });
  await f.runtime.waitForRun(f.root, changed.id);
  assert.equal(changed.connections[0]?.runId, replacement.id);
  const rejected = await fetch(changed.url, { headers: { 'X-Buildr-Expected-Run': caller.id } });
  assert.equal(rejected.status, 409);
});

test('严格本地与跨任务显式目标均拒绝；全部停止后创建新泳道身份', async t => {
  const f = await fixture(t); const other = await f.start('b', 'other');
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a').id, taskId: 'task', connection: 'local' }), /严格本地/);
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a').id, taskId: 'task', backendTargets: [{ serviceCode: 'b', target: 'run', runId: other.id }] }), /本任务泳道/);
  const one = await f.start('a'); await f.runtime.stopRun(f.root, one.id); const two = await f.start('a');
  assert.notEqual(one.routing?.laneId, two.routing?.laneId);
});

test('主工作库普通启动不进入任务泳道，并清空父进程遗留的路由文件变量', async t => {
  const f = await fixture(t);
  const taskBackend = await f.start('b');
  const previous = process.env.LOCAL_SERVICE_ROUTING_FILE;
  process.env.LOCAL_SERVICE_ROUTING_FILE = taskBackend.routing!.contextPath;
  try {
    const mainBackend = await f.start('b', 'main');
    const caller = await f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a', 'main').id,
      backendTargets: [{ serviceCode: 'b', target: 'auto', expectedRunId: taskBackend.id }] });
    await f.runtime.waitForRun(f.root, caller.id);
    for (const run of [mainBackend, caller]) {
      assert.equal(run.main, true); assert.equal(run.taskId, null); assert.equal(run.routing, undefined);
      assert.equal((await (await fetch(run.url)).json()).routingFile, null);
      assert.deepEqual(run.connections.map(value => [value.kind, value.mode, value.runId, value.context]), [['service-discovery', 'remote', null, 'qa']]);
    }
    assert.deepEqual(fs.readdirSync(path.dirname(taskBackend.routing!.contextPath)), [`${taskBackend.id}.json`]);
    const availability = f.runtime.connectionTarget(f.root, 'a', f.source('a', 'main'))![0]!;
    assert.equal(availability.target, null); assert.deepEqual(availability.candidates, []);
    assert.doesNotMatch(availability.reason ?? '', /请先启动/);
    const taskCaller = await f.start('a');
    assert.equal(taskCaller.connections[0]?.runId, taskBackend.id);
    assert.equal(taskCaller.routing?.laneId, taskBackend.routing?.laneId);
    await f.runtime.stopRun(f.root, caller.id);
    assert.equal((await f.runtime.listRuns(f.root)).find(run => run.id === taskCaller.id)?.status, 'running');
  } finally {
    if (previous === undefined) delete process.env.LOCAL_SERVICE_ROUTING_FILE;
    else process.env.LOCAL_SERVICE_ROUTING_FILE = previous;
  }
});

test('普通主工作库拒绝本地发现切换并保留原实例，无上下文重启不要求摘要', async t => {
  const f = await fixture(t);
  const target = await f.start('b'); const caller = await f.start('a', 'main');
  for (const input of [{ connection: 'local' as const }, { backendTargets: [{ serviceCode: 'b', target: 'run' as const, runId: target.id }] }]) {
    await assert.rejects(f.runtime.restartRun(f.root, caller.id, input), /主工作库.*应用.*配置/);
    assert.equal((await f.runtime.listRuns(f.root)).find(run => run.id === caller.id)?.status, 'running');
  }
  const main = f.source('a', 'main');
  main.taskId = 'task';
  await assert.rejects(f.runtime.restartRun(f.root, caller.id, {}), /身份|归属/);
  assert.equal((await f.runtime.listRuns(f.root)).find(run => run.id === caller.id)?.status, 'running');
  main.taskId = null;
  const replacement = await f.runtime.restartRun(f.root, caller.id, {});
  assert.equal((await f.runtime.waitForRun(f.root, replacement.id)).status, 'running');
  assert.equal(replacement.routing, undefined); assert.equal(replacement.taskId, null);
  assert.equal((await f.runtime.listRuns(f.root)).find(run => run.id === caller.id)?.status, 'stopped');
  assert.equal((await f.runtime.listRuns(f.root)).find(run => run.id === target.id)?.status, 'running');
});

test('不明或矛盾目录不进入普通启动，预分配任务计划不能用于主工作库', async t => {
  const f = await fixture(t);
  const source = f.source('a', 'main');
  for (const identity of [{ main: false, taskId: null }, { main: true, taskId: 'task' }, { main: true, taskId: '' }]) {
    Object.assign(source, identity);
    await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: source.id }), /身份|归属/);
  }
  Object.assign(source, { main: true, taskId: null });
  const plan = (await f.runtime.prepareTaskRouting(f.root, [{ serviceCode: 'a', worktreeId: f.source('a').id, taskId: 'task' }]))!;
  await assert.rejects(f.runtime.startRunWithRoutingPlan(f.root, { serviceCode: 'a', worktreeId: source.id }, plan), /任务.*泳道/);
  assert.deepEqual(await f.runtime.listRuns(f.root), []);
});

test('普通启动最终观察发现目录变成任务时拒绝，不带过期主库身份创建进程', async t => {
  let reads = 0;
  const f = await fixture(t, { onWorktreeRead: code => {
    if (code === 'a' && ++reads === 2) Object.assign(f.source('a', 'main'), { main: false, taskId: 'task' });
  } });
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a', 'main').id }), /身份已变化/);
  assert.deepEqual(await f.runtime.listRuns(f.root), []);
});

test('错误观察不会采信或使已就绪进程失败', async t => {
  const f = await fixture(t, { wrongObservation: 'a' }); const caller = await f.start('a');
  const observed = (await f.runtime.listRuns(f.root, 'a'))[0]!;
  assert.equal(observed.status, 'running'); assert.equal(observed.id, caller.id);
  assert.equal(observed.routing?.observation?.status, 'unavailable');
  assert.match(observed.routing?.observation?.error ?? '', /其他运行身份/);
});

test('自动选择重验已观察编号，明确缺失不采用后来出现的实例', async t => {
  const f = await fixture(t);
  const missing = f.runtime.connectionTarget(f.root, 'a', f.source('a'))![0]!;
  assert.equal(missing.state, 'missing');
  const first = await f.start('b');
  const qa = await f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a').id, taskId: 'task',
    backendTargets: [{ serviceCode: 'b', target: 'auto', expectedRunId: null }] });
  await f.runtime.waitForRun(f.root, qa.id);
  assert.equal(qa.connections[0]?.mode, 'remote');
  await f.runtime.stopRun(f.root, qa.id);
  await f.runtime.stopRun(f.root, first.id);
  const replacement = await f.start('b');
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a').id, taskId: 'task',
    backendTargets: [{ serviceCode: 'b', target: 'auto', expectedRunId: first.id }] }), /所选运行/);
  await assert.rejects(f.runtime.startRun(f.root, { serviceCode: 'a', worktreeId: f.source('a').id, taskId: 'task', connection: 'local',
    backendTargets: [{ serviceCode: 'b', target: 'auto', expectedRunId: null }] }), /严格本地/);
  assert.equal((await f.runtime.listRuns(f.root, 'b')).find(run => run.id === replacement.id)?.status, 'running');
});

test('发现循环和直接地址前端混合时，只等待直接地址边', async t => {
  const f = await fixture(t);
  const original = f.runtime.readDefinition(f.root, 'c')!.definition;
  await f.runtime.writeDefinition(f.root, 'c', YAML.stringify({ ...original, local: { ...original.local, backends: [
    { kind: 'direct-url', serviceCode: 'a', environmentVariable: 'BACKEND_URL', remoteUrl: 'https://qa.example.com' },
  ] } }));
  const result = await f.tasks.start(f.root, { taskId: 'task', selected: ['c', 'a', 'b'].map(code => ({ serviceCode: code, worktreeId: f.source(code).id })) });
  assert.ok(result.results.every(value => value.run?.status === 'running'), JSON.stringify(result));
  const a = result.results.find(value => value.serviceCode === 'a')!.run!;
  const c = result.results.find(value => value.serviceCode === 'c')!.run!;
  assert.equal(c.connections[0]?.runId, a.id);
  assert.equal(c.connections[0]?.url, a.url);
  assert.equal(a.connections[0]?.kind, 'service-discovery');
});

test('上下文派生目录拒绝符号链接，不在外部目录产生文件', async t => {
  const f = await fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-routing-external-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const directory = path.join(f.root, '.buildr/local/service-runtime');
  fs.mkdirSync(directory, { recursive: true });
  fs.symlinkSync(external, path.join(directory, 'routing'));
  const run = await f.start('a');
  assert.equal(run.status, 'failed');
  assert.match(run.failure ?? '', /目录身份已变化/);
  assert.deepEqual(fs.readdirSync(external), []);
});

test('HTTP 和 CLI 只接受已声明的身份选择，拒绝任意地址、注入字段与失效观察', async t => {
  const f = await fixture(t);
  const http = createServiceRuntimeHttp({ runtime: f.runtime, view: f.view, taskRuntime: f.tasks });
  const call = (suffix: string, body: Record<string, unknown>) => http.handle({ request: { method: 'POST' }, suffix, searchParams: new URLSearchParams(), root: f.root,
    authorizeWrite() {}, readBody: async (allowed: Set<string>) => { for (const key of Object.keys(body)) assert.ok(allowed.has(key)); return body; } });
  const base = { worktreeId: f.source('a').id, taskId: 'task' };
  for (const extra of [{ url: 'https://untrusted.example' }, { environmentVariable: 'SECRET' }]) {
    await assert.rejects(call('/service-runtime/services/a/runs', { ...base, backendTargets: [{ serviceCode: 'b', target: 'auto', ...extra }] }), /未知字段/);
  }
  await assert.rejects(call('/service-runtime/services/a/runs', { ...base, backendTargets: [{ serviceCode: 'c', target: 'remote' }] }), /未.*声明/);
  const first = await f.start('b'); const caller = await f.start('a');
  await f.runtime.stopRun(f.root, first.id); await f.start('b');
  await assert.rejects(call(`/service-runtime/runs/${caller.id}/restart`, { expectedRoutingDigest: caller.routing!.contextDigest, backendTargets: [{ serviceCode: 'b', target: 'auto', expectedRunId: first.id }] }), /所选运行/);
  assert.equal((await f.runtime.listRuns(f.root, 'a'))[0]!.status, 'running');
  const cli = createServiceRuntimeCliContributions({ runtime: f.runtime, view: f.view, taskRuntime: f.tasks })[0]!;
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'restart', '--run', caller.id, '--target', f.root] }), /上下文观察/);
  await assert.rejects(cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'start', '--service', 'c', '--worktree', f.source('c').id, '--task', 'task', '--backend-target', 'b:unknown', '--target', f.root] }), /未.*声明/);
});

test('并发组合只建立一个活跃泳道和每项唯一运行', async t => {
  const f = await fixture(t);
  const selected = ['a', 'b', 'c'].map(code => ({ serviceCode: code, worktreeId: f.source(code).id }));
  const attempts = await Promise.all([f.tasks.start(f.root, { taskId: 'task', selected }), f.tasks.start(f.root, { taskId: 'task', selected })]);
  const runs = (await f.runtime.listRuns(f.root)).filter(isActiveRun);
  assert.equal(runs.length, 3, JSON.stringify(attempts));
  assert.equal(new Set(runs.map(run => run.routing?.laneId)).size, 1);
  assert.equal(new Set(runs.map(run => run.worktreeId)).size, 3);
});
