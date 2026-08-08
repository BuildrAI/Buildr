import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';
import {
  BUILDR,
  PRODUCT_ROOT,
  taskRecordFixture as fixture,
} from '../helpers/task-record-system-fixture.mjs';

after(() => cleanupLocalTaskLifecycleSystemContext());

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
