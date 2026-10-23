import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { CODE_APPLICATION } from '../../src/modules/code/module.ts';
import { TASK_QUERY_APPLICATION, TASK_WORKTREE_PROVIDER } from '../../src/modules/task/module.ts';
import { registerGitWorktreeProvider } from '../../src/modules/task/infrastructure/git-worktree-provider.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { SERVICE_RUNTIME_APPLICATION, SERVICE_RUNTIME_MODULE, SERVICE_RUNTIME_VIEW, SERVICE_TASK_RUNTIME_APPLICATION } from '../../src/modules/service-runtime/module.ts';
import { createServiceRuntimeCliContributions } from '../../src/modules/service-runtime/interfaces/cli/service-runtime-cli.ts';
import { createServiceRuntimeView } from '../../src/modules/service-runtime/application/service-runtime-view.ts';
import { processAlive } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';
import { freeRuntimePort, runtimeDefinition, runtimeFixture } from '../helpers/service-runtime-fixture.ts';

test('模块从真实代码库解析服务目录与分支，不依赖部署连接', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-module-'));
  const repository = path.join(base, 'repository');
  const root = path.join(base, 'workspace');
  fs.mkdirSync(path.join(repository, 'app'), { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', repository, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=qa'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.com'); git('config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(repository, 'app', 'server.js'), 'fixture\n');
  git('add', '.'); git('commit', '-m', 'fixture');
  const missing = path.join(base, 'missing-module');
  git('worktree', 'add', '-b', 'missing-module', missing, 'HEAD');
  fs.rmSync(path.join(missing, 'app'), { recursive: true });
  const escaped = path.join(base, 'escaped-module');
  git('worktree', 'add', '-b', 'escaped-module', escaped, 'HEAD');
  fs.rmSync(path.join(escaped, 'app'), { recursive: true });
  const outside = path.join(base, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(escaped, 'app'), 'dir');
  const catalog = { diagnostics: [], repositories: [{ id: 'repo', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: repository } }], services: [{ id: 'backend', code: 'backend', name: '业务后端', repositoryId: 'repo', modulePath: 'app' }], projects: [{ id: 'pig', code: 'pig', serviceIds: ['backend'] }] };
  const code = createCodeApplication({ assetCatalog: () => catalog, resolveSourceRoot: (_root: string, source: { path: string }) => source.path, readTaskScope: () => { throw new Error('missing'); }, readTask: () => { throw new Error('missing'); }, readGitWorktreeEvidence: () => null } as any);
  const module: any = SERVICE_RUNTIME_MODULE.create({ [WORKSPACE_APPLICATION]: { assetCatalog: () => catalog }, [CODE_APPLICATION]: code, [TASK_QUERY_APPLICATION]: { inspectTaskSummaryView: () => { throw new Error('missing'); } }, [TASK_WORKTREE_PROVIDER]: { readGitWorktreeEvidence: () => null } });
  const runtime = module.provides[SERVICE_RUNTIME_APPLICATION];
  const view = module.provides[SERVICE_RUNTIME_VIEW];
  t.after(async () => { for (const record of await runtime.listRuns(root)) if (record.status === 'starting' || record.status === 'running') await runtime.stopRun(root, record.id); fs.rmSync(base, { recursive: true, force: true }); });
  assert.deepEqual(Object.keys(module.provides).sort(), [SERVICE_RUNTIME_APPLICATION, SERVICE_RUNTIME_VIEW, SERVICE_TASK_RUNTIME_APPLICATION].sort());
  assert.equal('service-runtime.deployment' in module.provides, false);
  assert.equal(SERVICE_RUNTIME_MODULE.requires.includes('connection-skills.application'), false);
  await runtime.writeDefinition(root, 'backend', runtimeDefinition(await freeRuntimePort()));
  const detail = await view.detail(root, 'backend');
  assert.equal(detail.worktrees.length, 1);
  assert.equal(detail.worktrees[0].main, true);
  assert.equal(detail.worktrees[0].label, '主工作库');
  assert.equal(detail.worktrees[0].branch, 'qa');
  assert.equal(detail.worktrees[0].head, git('rev-parse', 'HEAD'));
  assert.equal(detail.worktrees[0].path, path.join(fs.realpathSync(repository), 'app'));
  const ready = await runtime.waitForRun(root, (await runtime.startRun(root, { serviceCode: 'backend', worktreeId: detail.worktrees[0].id })).id);
  assert.equal(ready.status, 'running');
  assert.equal(ready.launch.cwd, path.join(fs.realpathSync(repository), 'app'));
  await runtime.stopRun(root, ready.id);
  fs.writeFileSync(path.join(repository, 'app', 'untracked'), 'dirty');
  assert.equal((await view.detail(root, 'backend')).worktrees[0].dirty, true);
});

test('无关服务仓库缺失不阻塞当前任务的真实目录、启动和最新提交快照', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-task-module-')));
  const repository = path.join(root, 'repository');
  const checkout = path.join(root, '.worktrees', 'current');
  fs.mkdirSync(path.join(repository, 'app'), { recursive: true });
  const git = (directory: string, ...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', directory, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(repository, 'init', '--initial-branch=qa');
  git(repository, 'config', 'user.name', 'Fixture'); git(repository, 'config', 'user.email', 'fixture@example.com'); git(repository, 'config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(repository, 'app', 'source.txt'), 'initial\n'); git(repository, 'add', '.'); git(repository, 'commit', '-m', 'initial');
  git(repository, 'worktree', 'add', '-b', 'codex/current', checkout, 'HEAD');
  const task = { taskId: 'current', title: '当前任务', scope: { projects: ['pig'], services: [{ project: 'pig', service: 'backend' }, { project: 'pig', service: 'frontend' }] } };
  const otherTask = { ...task, taskId: 'other', title: '其他任务' };
  const provider = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: directory => fs.realpathSync(directory),
    readProjectRegistryRecord: () => ({ registry: { migrationRequired: false }, projects: { pig: { source: { type: 'workspace', path: '.' } } } }),
    readServiceRegistryRecord: () => ({ services: { frontend: { source: { type: 'git', path: 'repository' } }, backend: { source: { type: 'git', path: 'repository' } }, unrelated: { source: { type: 'git', path: 'missing-repository' } } } }),
    sameGitIdentity: (left, right) => left === right,
    atomicWriteJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); },
    removePath: file => fs.rmSync(file, { force: true }),
  });
  provider.writeGitWorktreeEvidence(root, { schemaVersion: 'buildr.git-worktree-evidence/v1', taskId: task.taskId, workspaceRoot: root, branch: 'codex/current', planDigest: 'sha256-' + '0'.repeat(64), status: 'ready', repositories: [{ selector: 'service:pig/backend', entityType: 'service', sourcePath: 'repository', sourceRepository: fs.realpathSync(repository), checkoutPath: fs.realpathSync(checkout), branch: 'codex/current', startPoint: 'qa', head: git(repository, 'rev-parse', 'HEAD'), clean: true, registered: true, state: 'ready', diagnostic: null, remote: null, remoteUrl: null }], effects: [], updatedAt: new Date().toISOString() });
  // 证据保存后任务正常继续提交；运行快照必须取当前 Git，而不是创建证据时的旧 head。
  fs.writeFileSync(path.join(checkout, 'app', 'source.txt'), 'current task\n'); git(checkout, 'add', '.'); git(checkout, 'commit', '-m', 'task change');
  const taskHead = git(checkout, 'rev-parse', 'HEAD');
  const catalog = { diagnostics: [], repositories: [{ id: 'repo', code: 'repo', name: 'Current', source: { type: 'workspace', path: 'repository' } }, { id: 'missing', code: 'missing', name: 'Missing', source: { type: 'workspace', path: 'missing-repository' } }], services: [{ id: 'frontend', code: 'frontend', name: '业务前端', repositoryId: 'repo', modulePath: 'app' }, { id: 'backend', code: 'backend', name: '业务后端', repositoryId: 'repo', modulePath: 'app' }, { id: 'unrelated', code: 'unrelated', name: '无关服务', repositoryId: 'missing', modulePath: '' }], projects: [{ id: 'pig', code: 'pig', serviceIds: ['backend', 'frontend', 'unrelated'] }] };
  const code = createCodeApplication({ assetCatalog: () => catalog, resolveSourceRoot: (_root: string, source: { path: string }) => path.resolve(root, source.path), readTaskScope: () => task.scope, readTask: () => ({ taskId: task.taskId, title: task.title }), ...provider } as any);
  const module: any = SERVICE_RUNTIME_MODULE.create({ [WORKSPACE_APPLICATION]: { assetCatalog: () => catalog }, [CODE_APPLICATION]: code, [TASK_QUERY_APPLICATION]: { inspectTaskSummaryView: (_root: string, taskId: string) => ({ record: taskId === otherTask.taskId ? otherTask : task }) }, [TASK_WORKTREE_PROVIDER]: provider });
  const runtime = module.provides[SERVICE_RUNTIME_APPLICATION];
  const taskRuntime = module.provides[SERVICE_TASK_RUNTIME_APPLICATION];
  t.after(async () => { for (const run of await runtime.listRuns(root)) if (run.status === 'starting' || run.status === 'running') await runtime.stopRun(root, run.id); fs.rmSync(root, { recursive: true, force: true }); });
  await runtime.writeDefinition(root, 'backend', runtimeDefinition(await freeRuntimePort()));
  await runtime.writeDefinition(root, 'frontend', runtimeDefinition(await freeRuntimePort(), { backend: true }));
  assert.throws(() => provider.createGitWorktreeEvidenceReader(root, { requireComplete: true }), (error: any) => error.code === 'git_worktree_evidence_discovery_incomplete');
  const global = code.sourceControl(root, { repositoryId: 'repo' }).repositories.find(item => item.id === 'repo')!;
  assert.equal(global.worktrees.find(worktree => worktree.branch === 'codex/current')?.taskId, null, 'global uncertainty remains intact');
  const detail = await taskRuntime.detail(root, task.taskId);
  assert.equal(detail.services.length, 2);
  const source = detail.services.find((item: any) => item.service.code === 'backend').worktree;
  assert.ok(source);
  assert.equal(source.taskId, task.taskId);
  assert.equal(source.path, path.join(fs.realpathSync(checkout), 'app'));
  assert.equal(source.head, taskHead);
  const result = await taskRuntime.start(root, { taskId: task.taskId, selected: [{ serviceCode: 'backend', worktreeId: source.id, expectedWorktree: { path: source.path, branch: source.branch, head: source.head, dirty: source.dirty } }] });
  assert.equal(result.results[0].error, null);
  assert.equal(result.results[0].run.status, 'running');
  assert.equal(result.results[0].run.taskId, task.taskId);
  assert.equal(result.results[0].run.head, taskHead);
  const http = module.contributions.http[0];
  const query = (params: string) => http.handle({ request: { method: 'GET' }, suffix: '/service-runtime/services/frontend', searchParams: new URLSearchParams(params), root });
  const scoped = await query('taskId=current');
  assert.equal(scoped.body.worktrees.length, 1);
  const frontSource = scoped.body.worktrees[0];
  assert.equal(frontSource.taskId, task.taskId);
  assert.equal(frontSource.main, false);
  assert.equal(frontSource.path, source.path);
  assert.equal(scoped.body.connectionTargets[frontSource.id][0].target.runId, result.results[0].run.id);
  assert.equal(scoped.body.connectionTargets[frontSource.id][0].target.url, result.results[0].run.url);
  const foreign = await query('taskId=other');
  assert.deepEqual(foreign.body.worktrees, [], 'another task without its own provider evidence must not borrow the current checkout');
  assert.deepEqual(foreign.body.connectionTargets, {});
  for (const invalid of ['taskId=../escape', 'taskId=current&taskId=other', 'taskId=current&extra=1', 'taskId=']) await assert.rejects(query(invalid), (error: any) => error.status === 400);
  await runtime.stopRun(root, result.results[0].run.id);
  git(checkout, 'switch', '-c', 'different-task-branch');
  assert.equal((await taskRuntime.detail(root, task.taskId)).services.find((item: any) => item.service.code === 'backend').worktree, null);
  assert.deepEqual((await query('taskId=current')).body.worktrees, [], 'changed checkout identity must not fall back to the main checkout');
  await assert.rejects(runtime.startRun(root, { serviceCode: 'backend', worktreeId: source.id, taskId: task.taskId }), (error: any) => error.code === 'service_runtime_worktree_unknown');
});

test('CLI start 等待就绪并退出，服务保持独立存活，其他应用可按身份停止', async t => {
  const f = await runtimeFixture(t);
  const applicationUrl = pathToFileURL(path.resolve('src/modules/service-runtime/application/service-runtime-application.ts')).href;
  const cliUrl = pathToFileURL(path.resolve('src/modules/service-runtime/interfaces/cli/service-runtime-cli.ts')).href;
  const viewUrl = pathToFileURL(path.resolve('src/modules/service-runtime/application/service-runtime-view.ts')).href;
  const script = `
import {createServiceRuntimeApplication} from ${JSON.stringify(applicationUrl)};
import {createServiceRuntimeCliContributions} from ${JSON.stringify(cliUrl)};
import {createServiceRuntimeView} from ${JSON.stringify(viewUrl)};
const root=${JSON.stringify(f.root)};
const runtime=createServiceRuntimeApplication({resolveService:()=>({id:'backend',code:'backend'}),listWorktrees:()=>${JSON.stringify(f.worktrees.backend)}});
const view=createServiceRuntimeView({runtime,catalog:{listServices:()=>[]}});
await createServiceRuntimeCliContributions({runtime,view})[0].run(null,{argv:['node','buildr','service-runtime','start','--service','backend','--worktree','backend-main','--target',root,'--json']});
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout);
  assert.equal(record.status, 'running');
  assert.equal(record.origin, 'agent');
  assert.equal(processAlive(record.pid), true);
  assert.equal((await f.runtime.listRuns(f.root))[0]?.id, record.id);
  assert.equal((await f.runtime.stopRun(f.root, record.id)).status, 'stopped');
});

test('CLI 拒绝退役 QA 动作与无效连接，读取共享本地事实', async t => {
  const f = await runtimeFixture(t);
  const view = createServiceRuntimeView({ runtime: f.runtime, catalog: { listServices: () => [] } });
  const cli = createServiceRuntimeCliContributions({ runtime: f.runtime, view })[0]!;
  const call = (...args: string[]) => cli.run(null, { argv: ['node', 'buildr', 'service-runtime', ...args, '--target', f.root] });
  await assert.rejects(call('plan', '--service', 'backend'), /Unknown service-runtime action/);
  await assert.rejects(call('deploy', '--service', 'backend'), /Unknown service-runtime action/);
  await assert.rejects(call('start', '--service', 'backend', '--worktree', 'backend-main', '--connection', 'arbitrary'), /单选/);
  const overview: any = await call('overview');
  assert.equal(overview.local.activeCount, 0);
  assert.equal((await call('worktrees', '--service', 'backend') as any[])[0]?.main, true);
});


test('CLI restart 共用先校验后停启的连接能力，并等待新实例就绪', async t => {
  const f = await runtimeFixture(t, { frontendConnection: true });
  const view = createServiceRuntimeView({ runtime: f.runtime, catalog: { listServices: () => [] } });
  const cli = createServiceRuntimeCliContributions({ runtime: f.runtime, view })[0]!;
  const call = (...args: string[]) => cli.run(null, { argv: ['node', 'buildr', 'service-runtime', ...args, '--target', f.root] });
  const original: any = await call('start', '--service', 'frontend', '--worktree', 'frontend-main', '--connection', 'remote', '--origin', 'human');
  assert.equal(original.origin, 'human');
  await assert.rejects(call('restart', '--run', original.id, '--connection', 'local'), (error: any) => error.code === 'service_runtime_backend_unavailable');
  assert.equal(processAlive(original.pid), true);
  await assert.rejects(call('restart', '--run', original.id, '--worktree', 'frontend-other'), /不接受/);
  await assert.rejects(call('restart', '--run', original.id, '--connection', 'arbitrary'), /单选/);
  const backend = await f.runtime.waitForRun(f.root, (await f.runtime.startRun(f.root, { serviceCode: 'backend', worktreeId: 'backend-main' })).id);
  await assert.rejects(call('restart', '--run', original.id, '--connection', 'local', '--expected-backend-run', 'old-backend'), (error: any) => error.code === 'service_runtime_backend_changed');
  assert.equal(processAlive(original.pid), true);
  const ready: any = await call('restart', '--run', original.id, '--connection', 'local', '--expected-backend-run', backend.id);
  assert.equal(ready.status, 'running');
  assert.equal(ready.origin, 'agent');
  assert.equal(ready.connection.runId, backend.id);
  assert.equal(ready.connection.url, backend.url);
  assert.equal(processAlive(original.pid), false);
  assert.equal(processAlive(backend.pid), true);
});
