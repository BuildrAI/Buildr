import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function run(args, expected = 0, env = process.env) {
  const result = spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8', env });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function json(args, expected = 0, env = process.env) {
  return JSON.parse(run([...args, '--json'], expected, env).stdout);
}

let baseline = null;

function fixtureBaseline() {
  if (baseline) return baseline;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-record-baseline-'));
  const root = path.join(base, 'workspace');
  run(['init', '--target', root, '--name', 'task-record-baseline', '--description', 'Task Record shared fixture baseline', '--profile', 'team']);
  run(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo Project']);
  run(['project', 'create', 'other', '--target', root, '--name', 'Other', '--description', 'Other Project']);
  const serviceSource = path.join(base, 'service-source'); fs.mkdirSync(serviceSource); fs.writeFileSync(path.join(serviceSource, 'README.md'), '# API\n');
  run(['service', 'create', 'demo/api', serviceSource, '--target', root, '--name', 'API', '--description', 'API Service', '--type', 'backend']);
  for (const [project, change] of [['demo', 'same-change'], ['demo', 'second-change'], ['other', 'same-change']]) {
    const changeRoot = path.join(root, 'projects', project, 'openspec', 'changes', change);
    fs.mkdirSync(changeRoot, { recursive: true });
    fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
    fs.writeFileSync(path.join(changeRoot, 'proposal.md'), `# ${change}\n`);
  }
  baseline = { base, root };
  return baseline;
}

after(() => {
  if (baseline) fs.rmSync(baseline.base, { recursive: true, force: true });
});

function fixture(t, name = 'task-record') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${name}-`));
  const root = path.join(base, 'workspace');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  fs.cpSync(fixtureBaseline().root, root, { recursive: true });
  return { base, root };
}

test('CLI 和 Application 覆盖五个动作、0/1/N Change、跨 Project 同名与三态结果', (t) => {
  const { root } = fixture(t, 'task-lifecycle');
  const empty = json(['task', 'create', 'empty-task', '--title', '空引用', '--intent', '允许没有 Change', '--target', root]);
  assert.equal(empty.schemaVersion, 'buildr.task-record-result/v1'); assert.deepEqual(empty.record.changes, []); assert.equal(empty.status, 'created');

  const created = json(['task', 'create', 'multi-task', '--title', '多范围任务', '--intent', '验证限定引用', '--project', 'demo', '--service', 'demo/api', '--change', 'demo/same-change', '--change', 'demo/second-change', '--change', 'other/same-change', '--target', root]);
  assert.equal(created.record.changes.length, 3); assert.match(created.recordDigest, /^sha256-/); assert.equal(created.effects[0].path, '.buildr/tasks/multi-task/task.yml');
  const bytes = fs.readFileSync(created.path, 'utf8'); assert.doesNotMatch(bytes, /recordDigest|revision|workspaceId|worktree|environment/);
  const inspected = json(['task', 'inspect', 'multi-task', '--target', root]); assert.equal(inspected.recordDigest, created.recordDigest); assert.deepEqual(inspected.effects, []); assert.equal(fs.readFileSync(created.path, 'utf8'), bytes);

  const updated = json(['task', 'update', 'multi-task', '--title', '更新标题', '--remove-change', 'demo/second-change', '--add-project', 'other', '--target', root]);
  assert.equal(updated.status, 'updated'); assert.equal(updated.record.title, '更新标题'); assert.deepEqual(updated.record.scope.projects, ['demo', 'other']); assert.equal(updated.record.changes.length, 2);
  assert.equal(json(['task', 'create', 'peer-task', '--title', '共享 Change', '--intent', '不扫描其他 Task ownership', '--change', 'demo/same-change', '--target', root]).status, 'created');

  const completed = json(['task', 'complete', 'empty-task', '--summary', '确认无需修改', '--no-change', '--target', root]);
  assert.deepEqual(completed.record.result, { summary: '确认无需修改', noChange: true });
  const abandoned = json(['task', 'create', 'abandoned-task', '--title', '取消任务', '--intent', '验证放弃', '--target', root]);
  assert.equal(abandoned.status, 'created');
  const ended = json(['task', 'abandon', 'abandoned-task', '--reason', '目标取消', '--target', root]); assert.deepEqual(ended.record.result, { summary: '目标取消' });
  const terminal = json(['task', 'update', 'abandoned-task', '--title', '不可重开', '--target', root], 1); assert.equal(terminal.status, 'blocked'); assert.equal(terminal.diagnostic.code, 'task_record_terminal'); assert.deepEqual(terminal.effects, []);
  const duplicate = json(['task', 'create', 'multi-task', '--title', '重复', '--intent', '不得覆盖', '--target', root], 1); assert.equal(duplicate.diagnostic.code, 'task_record_already_exists');
  const syntax = json(['task', 'create', 'missing-title', '--intent', '语法错误', '--target', root], 2); assert.equal(syntax.schemaVersion, 'buildr.cli-error/v1'); assert.equal(syntax.error.code, 'task_record_cli.syntax');
});

test('引用、closed input、损坏 YAML、陈旧 digest 与原子替换失败均保留最后有效 bytes', (t) => {
  const { root } = fixture(t, 'task-failures');
  const runtime = createRuntime();
  const created = runtime.createTaskRecord(root, { taskId: 'safe-task', title: '安全写入', intent: '验证失败边界', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] });
  const original = fs.readFileSync(created.path, 'utf8');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'unknown-fields', title: '非法', intent: '非法输入', projects: [], services: [], changes: [], worktree: '/tmp/example' }), (error) => error.code === 'task_record_field_forbidden');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-project', title: '非法引用', intent: '项目不存在', projects: ['missing'], services: [], changes: [] }), (error) => error.code === 'task_record_project_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-service', title: '非法引用', intent: '服务不存在', projects: [], services: ['demo/missing'], changes: [] }), (error) => error.code === 'task_record_service_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'bad-change', title: '非法引用', intent: 'Change 不存在', projects: [], services: [], changes: ['demo/missing'] }), (error) => error.code === 'task_record_change_not_found');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'duplicate-change', title: '重复引用', intent: '当前记录去重', projects: [], services: [], changes: ['demo/same-change', 'demo/same-change'] }), (error) => error.code === 'task_record_reference_duplicate');

  const staleDigest = created.recordDigest;
  runtime.updateTaskRecord(root, 'safe-task', { intent: '由另一客户端更新' });
  const currentBytes = fs.readFileSync(created.path, 'utf8');
  const environmentFile = path.join(path.dirname(created.path), 'environment.json');
  fs.writeFileSync(environmentFile, '{"owner":"task-environment"}\n');
  const environmentBytes = fs.readFileSync(environmentFile, 'utf8');
  const reviewsDirectory = path.join(path.dirname(created.path), 'reviews');
  fs.mkdirSync(reviewsDirectory);
  const reviewSiblings = new Map([
    [path.join(reviewsDirectory, 'planning.yml'), 'slot: planning\n'],
    [path.join(reviewsDirectory, 'completion.yml'), 'slot: completion\n'],
  ]);
  for (const [file, content] of reviewSiblings) fs.writeFileSync(file, content);
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { expectedRecordDigest: staleDigest, title: '陈旧页面' }), (error) => error.code === 'task_record_conflict' && Boolean(error.details.currentRecordDigest));
  assert.equal(fs.readFileSync(created.path, 'utf8'), currentBytes);

  const originalAtomicWrite = runtime.atomicWriteFile;
  runtime.atomicWriteFile = (file, content, encoding) => { if (file === created.path) throw new Error('injected replace failure'); return originalAtomicWrite(file, content, encoding); };
  assert.throws(() => runtime.updateTaskRecord(root, 'safe-task', { title: '不应留下' }), (error) => error.code === 'task_record_write_failed');
  runtime.atomicWriteFile = originalAtomicWrite;
  assert.equal(fs.readFileSync(created.path, 'utf8'), currentBytes, 'failed exact-file replacement must preserve original bytes');
  assert.equal(fs.readFileSync(environmentFile, 'utf8'), environmentBytes, 'Task Record failure must not rewrite sibling professional files');
  for (const [file, content] of reviewSiblings) assert.equal(fs.readFileSync(file, 'utf8'), content, 'Task Record failure must preserve Task Review slots');

  const failedCreateDirectory = path.join(root, '.buildr', 'tasks', 'failed-create');
  runtime.atomicWriteFile = (file, content, encoding) => { if (file === path.join(failedCreateDirectory, 'task.yml')) throw new Error('injected create failure'); return originalAtomicWrite(file, content, encoding); };
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'failed-create', title: '失败创建', intent: '验证精确目录清理', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_write_failed');
  runtime.atomicWriteFile = originalAtomicWrite;
  assert.equal(fs.existsSync(failedCreateDirectory), false, 'failed create may only remove the empty directory created by that call');

  const occupiedDirectory = path.join(root, '.buildr', 'tasks', 'occupied-task');
  fs.mkdirSync(occupiedDirectory);
  const reviewFile = path.join(occupiedDirectory, 'review.yml');
  fs.writeFileSync(reviewFile, 'owner: user-defined-sibling\n');
  assert.throws(() => runtime.createTaskRecord(root, { taskId: 'occupied-task', title: '不得覆盖', intent: '保留未知 sibling', projects: [], services: [], changes: [] }), (error) => error.code === 'task_record_path_occupied');
  assert.equal(fs.readFileSync(reviewFile, 'utf8'), 'owner: user-defined-sibling\n');

  fs.appendFileSync(created.path, 'revision: 1\n');
  const broken = json(['task', 'inspect', 'safe-task', '--target', root], 1); assert.equal(broken.diagnostic.code, 'task_record_invalid'); assert.equal(broken.record, null);
  const corruptDuplicate = json(['task', 'create', 'safe-task', '--title', '不得覆盖损坏记录', '--intent', '区分有效重复与损坏记录', '--target', root], 1); assert.equal(corruptDuplicate.diagnostic.code, 'task_record_invalid');
  const list = runtime.listTaskRecords(root); assert.equal(list.tasks.length, 0); assert.equal(list.diagnostics.some((item) => item.taskId === 'safe-task' && item.code === 'task_record_invalid'), true);
  assert.notEqual(original, currentBytes);
});

test('Task-scoped Change Resolver 在 Application 与 Local App 复用候选、baseline 和不可用事实', async (t) => {
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-change-resolver-app-'));
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    fs.rmSync(appData, { recursive: true, force: true });
  });
  const { base, root } = fixture(t, 'task-change-resolver');
  const candidateProjectRoot = path.join(base, 'candidate-demo');
  fs.cpSync(path.join(root, 'projects', 'demo'), candidateProjectRoot, { recursive: true });
  const candidateChanges = path.join(candidateProjectRoot, 'openspec', 'changes');
  const writeCandidate = (directory, content) => {
    const changeRoot = path.join(candidateChanges, directory);
    fs.mkdirSync(changeRoot, { recursive: true });
    fs.writeFileSync(path.join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
    fs.writeFileSync(path.join(changeRoot, 'proposal.md'), `# ${content}\n`);
  };
  writeCandidate('candidate-only', 'candidate only');
  writeCandidate(path.join('archive', '2026-08-01-candidate-archived'), 'candidate archived');
  fs.writeFileSync(path.join(candidateChanges, 'same-change', 'proposal.md'), '# candidate version\n');

  const runtime = createRuntime();
  runtime.inspectTaskEnvironment = () => ({
    status: 'ready',
    environment: {
      scopes: [{ selector: 'project:demo', executionRoot: candidateProjectRoot, validationRoot: base }],
    },
  });
  runtime.createTaskRecord(root, { taskId: 'resolver-task', title: 'Resolver Task', intent: '读取任务环境 Change', projects: ['demo'], services: [], changes: [] });
  const linked = runtime.updateTaskRecord(root, 'resolver-task', { addChanges: ['demo/candidate-only', 'demo/candidate-archived', 'demo/same-change'] });
  const byReference = new Map(linked.changeReferences.map((item) => [`${item.reference.project}/${item.reference.change}`, item]));
  assert.equal(byReference.get('demo/candidate-only').workingCopy.provenance, 'task-environment-candidate');
  assert.equal(byReference.get('demo/candidate-archived').workingCopy.change.lifecycle, 'archived');
  assert.equal(byReference.get('demo/same-change').workingCopy.provenance, 'task-environment-candidate');
  assert.equal(byReference.get('demo/same-change').retainedBaseline.provenance, 'retained-baseline');
  assert.equal(runtime.listProjectChanges(root, 'demo').changes.some((change) => change.code === 'candidate-only'), false, 'Workspace 全局 Change 列表保持 retained-only');

  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  let response = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/resolver-task/changes/demo/same-change`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const detail = await response.json();
  assert.equal(detail.resolution.workingCopy.provenance, 'task-environment-candidate');
  assert.equal(detail.resolution.retainedBaseline.provenance, 'retained-baseline');
  assert.equal(detail.resolution.workingCopy.change.artifacts.proposal.content, '# candidate version\n');

  fs.rmSync(path.join(candidateChanges, 'candidate-only'), { recursive: true });
  const unavailable = runtime.inspectTaskRecord(root, 'resolver-task');
  const unavailableReference = unavailable.changeReferences.find((item) => item.reference.change === 'candidate-only');
  assert.equal(unavailableReference.availability, 'unavailable');
  assert.equal(unavailableReference.diagnostic.code, 'task_change_unavailable');
  const unrelatedUpdate = runtime.updateTaskRecord(root, 'resolver-task', { title: '仍可更新' });
  assert.equal(unrelatedUpdate.record.title, '仍可更新');
  const removed = runtime.updateTaskRecord(root, 'resolver-task', { removeChanges: ['demo/candidate-only'] });
  assert.equal(removed.record.changes.some((item) => item.change === 'candidate-only'), false);
  assert.equal(runtime.abandonTaskRecord(root, 'resolver-task', { reason: 'resolver fixture complete' }).status, 'abandoned');
});

test('安装版 Local App 使用 Receipt controller 读取 Task worktree 的 candidate-only Change', async (t) => {
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-installed-task-change-reader-app-'));
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    fs.rmSync(appData, { recursive: true, force: true });
  });

  const { base, root } = fixture(t, 'installed-task-change-reader');
  const workspaceRoot = fs.realpathSync(root);
  const candidateProjectRoot = path.join(fs.realpathSync(base), 'candidate-demo');
  fs.cpSync(path.join(workspaceRoot, 'projects', 'demo'), candidateProjectRoot, { recursive: true });
  const candidateChangeRoot = path.join(candidateProjectRoot, 'openspec', 'changes', 'candidate-only');
  fs.mkdirSync(candidateChangeRoot, { recursive: true });
  fs.writeFileSync(path.join(candidateChangeRoot, '.openspec.yaml'), 'schema: spec-driven\n');
  fs.writeFileSync(path.join(candidateChangeRoot, 'proposal.md'), '# candidate only\n');

  const runtime = createRuntime();
  const taskId = 'installed-reader-task';
  runtime.createTaskRecord(workspaceRoot, { taskId, title: 'Installed reader', intent: '读取候选 Change', projects: ['demo'], services: [], changes: [] });
  const observedAt = new Date().toISOString();
  runtime.writeTaskEnvironmentPersistence(root, {
    schemaVersion: 'buildr.task-environment-receipt/v2',
    taskId,
    workspace: { id: runtime.readWorkspaceRecord(workspaceRoot).workspace.id, root: workspaceRoot },
    controller: { sourceRoot: PRODUCT_ROOT, cliSource: BUILDR, identity: 'sha256-installed-reader-fixture', adapter: 'codex' },
    status: 'ready',
    scopes: [{
      selector: 'project:demo', kind: 'project', project: 'demo', service: null, sourcePath: 'projects/demo', executionRoot: candidateProjectRoot, validationRoot: workspaceRoot, shared: true, provider: null,
      runtime: { status: 'ready', identity: 'node', observedAt, diagnostic: null },
      cli: { status: 'ready', identity: 'cli', observedAt, diagnostic: null },
      dependencies: { status: 'not-applicable', identity: 'stable-controller', observedAt, diagnostic: null },
      projection: { status: 'ready', identity: 'projection', observedAt, diagnostic: null },
    }],
    resources: [],
    latest: { ready: { status: 'ready', observedAt, diagnostic: null }, cleanup: null },
    createdAt: observedAt,
    updatedAt: observedAt,
  });
  runtime.workspaceNodeExecution = () => ({ ready: true, identity: { digest: 'workspace-node' }, executable: process.execPath, npmExecutable: process.execPath, environment: process.env });
  runtime.checkRuntimeAdapter = () => ({ runtimeSourceEvidence: { projectionReady: true, projectionIdentity: 'projection' } });
  const bundleRoot = path.join(base, 'Buildr Dev.app', 'Contents', 'Resources', 'buildr');
  fs.mkdirSync(bundleRoot, { recursive: true });
  runtime.productRoot = () => bundleRoot;

  const inspected = runtime.inspectTaskEnvironment(workspaceRoot, taskId);
  assert.equal(inspected.status, 'ready', JSON.stringify(inspected, null, 2));
  const linked = runtime.updateTaskRecord(workspaceRoot, taskId, { addChanges: ['demo/candidate-only'] });
  assert.equal(linked.changeReferences[0].workingCopy.provenance, 'task-environment-candidate');
  assert.equal(runtime.listProjectChanges(workspaceRoot, 'demo').changes.some((change) => change.code === 'candidate-only'), false, '全局 Change collection 保持 retained-only');

  const instance = createLocalWorkspaceServer(runtime, { targetRoot: workspaceRoot });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId } = await instance.ready;
  const response = await fetch(`${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/${taskId}/changes/demo/candidate-only`);
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.resolution.workingCopy.provenance, 'task-environment-candidate');
  assert.equal(detail.resolution.workingCopy.change.artifacts.proposal.content, '# candidate only\n');
});

test('Task Record target 必须是 canonical Workspace，不能是 linked worktree checkout', (t) => {
  const { base, root } = fixture(t, 'task-canonical');
  run(['task', 'create', 'canonical-task', '--title', 'Canonical', '--intent', '写入 retained root', '--target', root]);
  assert.equal(spawnSync('git', ['init', '--initial-branch=main'], { cwd: root, encoding: 'utf8' }).status, 0);
  spawnSync('git', ['config', 'user.email', 'buildr-test@example.com'], { cwd: root }); spawnSync('git', ['config', 'user.name', 'Buildr Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root }); assert.equal(spawnSync('git', ['commit', '-m', 'fixture'], { cwd: root, encoding: 'utf8' }).status, 0);
  const worktree = path.join(base, 'linked-task');
  const added = spawnSync('git', ['worktree', 'add', '-b', 'codex/linked-task', worktree, 'HEAD'], { cwd: root, encoding: 'utf8' }); assert.equal(added.status, 0, added.stderr);
  const blocked = json(['task', 'create', 'linked-task', '--title', '错误目标', '--intent', '不得写入 worktree', '--target', worktree], 1);
  assert.equal(blocked.diagnostic.code, 'task_record_workspace_not_canonical'); assert.equal(fs.existsSync(path.join(worktree, '.buildr', 'tasks', 'linked-task')), false);
  const standalone = path.join(base, '.worktrees', 'standalone-workspace');
  run(['init', '--target', standalone, '--name', 'standalone', '--description', 'non-Git canonical workspace']);
  assert.equal(json(['task', 'create', 'standalone-task', '--title', '独立 Workspace', '--intent', '目录名不决定 authority', '--target', standalone]).status, 'created');
  const uninitialized = json(['task', 'create', 'missing-root', '--title', '错误目标', '--intent', '未初始化', '--target', path.join(root, 'not-a-workspace')], 1);
  assert.equal(uninitialized.diagnostic.code, 'task_record_workspace_invalid');
});

test('Local App Task API 保持 workspaceId、Origin/session/JSON/body/字段边界和 digest 冲突', async (t) => {
  const { base, root } = fixture(t, 'task-local-app');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks`;
  const writeHeaders = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options); return { status: response.status, headers: response.headers, body: await response.json() };
  };

  let response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'app-task', title: '页面任务', intent: '通过共享 Application 创建', projects: ['demo'], services: ['demo/api'], changes: ['demo/same-change'] }) });
  assert.equal(response.status, 201); assert.equal(response.body.status, 'created'); const staleDigest = response.body.recordDigest;
  response = await request(endpoint); assert.deepEqual(response.body.tasks.map((item) => item.record.taskId), ['app-task']);
  const taskEndpoint = `${endpoint}/app-task`;
  response = await request(`${taskEndpoint}/environment`); assert.equal(response.status, 200); assert.equal(response.body.schemaVersion, 'buildr.task-environment-result/v1'); assert.equal(response.body.status, 'unavailable'); assert.equal(response.body.source, 'current-machine'); assert.equal(response.headers.get('cache-control'), 'no-store');
  response = await request(`${taskEndpoint}/environment?target=${encodeURIComponent(root)}`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'target_forbidden');
  response = await request(`${endpoint}/missing-task/environment`); assert.equal(response.status, 404); assert.equal(response.body.error.code, 'task_record_not_found');
  response = await request(`${taskEndpoint}/changes/demo/same-change`); assert.equal(response.status, 200); assert.equal(response.body.resolution.workingCopy.provenance, 'retained-active'); assert.equal(response.body.resolution.workingCopy.change.code, 'same-change');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: staleDigest, title: '页面已更新' }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.title, '页面已更新');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: staleDigest, title: '陈旧覆盖' }) });
  assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_record_conflict');

  for (const [body, code] of [[{ taskId: 'path-task', title: 'x', intent: 'x', path: root }, 'target_forbidden'], [{ taskId: 'unknown-task', title: 'x', intent: 'x', revision: 1 }, 'task_api_field_forbidden']]) {
    response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify(body) }); assert.equal(response.status, 400); assert.equal(response.body.error.code, code);
  }
  response = await request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ taskId: 'origin-task', title: 'x', intent: 'x' }) }); assert.equal(response.status, 403); assert.equal(response.body.error.code, 'origin_forbidden');
  response = await request(endpoint, { method: 'POST', headers: { origin: url, 'x-buildr-session': 'wrong', 'content-type': 'application/json' }, body: '{}' }); assert.equal(response.status, 403); assert.equal(response.body.error.code, 'session_forbidden');
  response = await request(endpoint, { method: 'POST', headers: { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'text/plain' }, body: '{}' }); assert.equal(response.status, 415); assert.equal(response.body.error.code, 'content_type_unsupported');
  response = await request(`${endpoint}?filter=active`); assert.equal(response.status, 400); assert.equal(response.body.error.code, 'task_api_query_forbidden');
  response = await request(endpoint, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ taskId: 'large-task', title: 'x', intent: 'x'.repeat(40 * 1024) }) }); assert.equal(response.status, 413); assert.equal(response.body.error.code, 'request_body_too_large');

  const latest = (await request(taskEndpoint)).body;
  response = await request(`${taskEndpoint}/complete`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: latest.recordDigest, summary: '页面确认完成', noChange: false }) });
  assert.equal(response.status, 200); assert.equal(response.body.record.status, 'completed');
  response = await request(taskEndpoint, { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ expectedRecordDigest: response.body.recordDigest, title: '不可重开' }) }); assert.equal(response.status, 409); assert.equal(response.body.error.code, 'task_record_terminal');

  const other = path.join(base, 'other-workspace'); run(['init', '--target', other, '--name', 'other', '--description', 'other fixture', '--profile', 'team']);
  let registry = runtime.listRegisteredWorkspaces(); registry = runtime.registerLocalWorkspace({ rootPath: other, revision: registry.revision }); const otherId = registry.workspaces.find((item) => item.rootPath === other).workspace.id;
  response = await request(`${url}/api/v1/workspaces/${otherId}/tasks`); assert.deepEqual(response.body.tasks, []);
});
