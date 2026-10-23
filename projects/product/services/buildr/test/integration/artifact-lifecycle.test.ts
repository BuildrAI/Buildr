import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerArtifactApplication } from '../../src/modules/artifact-lifecycle/application/artifact-application.ts';
import { registerArtifactDiscovery } from '../../src/modules/artifact-lifecycle/infrastructure/artifact-discovery.ts';
import { registerArtifactRepository } from '../../src/modules/artifact-lifecycle/persistence/artifact-repository.ts';
import { artifactRecordDigest } from '../../src/modules/artifact-lifecycle/domain/artifact.ts';

function fixture(taskStatuses: Record<string, string | null> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-lifecycle-'));
  const runtime: any = {
    ensureDirectory: (directory: string) => fs.mkdirSync(directory, { recursive: true }),
    existsFile: (file: string) => { try { return fs.statSync(file).isFile(); } catch { return false; } },
    existsDirectory: (directory: string) => { try { return fs.statSync(directory).isDirectory(); } catch { return false; } },
    atomicWriteJson: (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); },
    toPosixRelative: (base: string, file: string) => path.relative(base, file).split(path.sep).join('/'),
    assertCanonicalStructuredWorkspace: (target: string) => path.resolve(target),
    assetCatalog: () => ({ services: [], repositories: [] }),
    readTask: (_target: string, taskId: string) => {
      const status = taskStatuses[taskId];
      if (status === undefined || status === null) throw Object.assign(new Error('Task Record 不存在。'), { code: 'task_record_not_found' });
      return { record: { taskId, status } };
    },
  };
  registerArtifactRepository(runtime);
  registerArtifactDiscovery(runtime);
  registerArtifactApplication(runtime);
  return { root, runtime };
}

function makeScratch(root: string, name: string, bytes = 128) {
  const directory = path.join(root, 'build', name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'payload.bin'), Buffer.alloc(bytes));
  return directory;
}

test('登记在 .buildr/local/artifacts/registry 写记录并在 list 中呈现', (t) => {
  const { root, runtime } = fixture({ 'task-a': 'active' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  makeScratch(root, 'scene-a');
  const result = runtime.registerArtifact(root, { path: 'build/scene-a', purpose: '隔离构建现场', disposition: 'ephemeral', taskId: 'task-a' });
  assert.equal(result.status, 'applied');
  assert.equal(result.path, 'build/scene-a');
  const file = path.join(root, '.buildr', 'local', 'artifacts', 'registry', `${result.artifactId}.json`);
  assert.equal(fs.existsSync(file), true);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(record.schemaVersion, 'buildr.workspace-artifact/v1');
  const list = runtime.listArtifacts(root);
  const item = list.artifacts.find((view: any) => view.path === 'build/scene-a');
  assert.equal(item.state, 'active');
  assert.equal(item.taskStatus, 'active');
  assert.equal(item.sizeBytes, 128);
});

test('retained 缺少引用方被拒绝且不写文件', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  makeScratch(root, 'scene-retained');
  assert.throws(
    () => runtime.registerArtifact(root, { path: 'build/scene-retained', purpose: '保留', disposition: 'retained' }),
    (error: any) => error.code === 'artifact_retained_reference_required',
  );
  const list = runtime.listArtifacts(root);
  assert.equal(list.artifacts.find((view: any) => view.path === 'build/scene-retained').state, 'unattributed');
});

test('ephemeral 归属任务终态后进入 expired，clean dry-run 计划且 execute 删除', (t) => {
  const { root, runtime } = fixture({ 'task-done': 'completed' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = makeScratch(root, 'scene-done', 256);
  runtime.registerArtifact(root, { path: 'build/scene-done', purpose: '验证现场', disposition: 'ephemeral', taskId: 'task-done' });
  const dry = runtime.cleanArtifacts(root);
  assert.equal(dry.mode, 'dry-run');
  const planned = dry.plan.find((item: any) => item.path === 'build/scene-done');
  assert.equal(planned.action, 'delete');
  assert.equal(fs.existsSync(directory), true);
  const executed = runtime.cleanArtifacts(root, { execute: true });
  const item = executed.results.find((result: any) => result.path === 'build/scene-done');
  assert.equal(item.result, 'deleted');
  assert.equal(fs.existsSync(directory), false);
  const list = runtime.listArtifacts(root);
  assert.equal(list.artifacts.find((view: any) => view.path === 'build/scene-done').state, 'missing');
});

test('unattributed 对象进入计划但 execute 永不删除', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = makeScratch(root, 'scene-unknown');
  const dry = runtime.cleanArtifacts(root);
  const planned = dry.plan.find((item: any) => item.path === 'build/scene-unknown');
  assert.equal(planned.state, 'unattributed');
  assert.equal(planned.action, 'retain');
  const executed = runtime.cleanArtifacts(root, { execute: true });
  assert.equal(executed.results.find((result: any) => result.path === 'build/scene-unknown').result, 'retained');
  assert.equal(fs.existsSync(directory), true);
});

test('更新既有登记必须提交当前 recordDigest；冲突报告当前 digest', (t) => {
  const { root, runtime } = fixture({ 'task-b': 'active' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  makeScratch(root, 'scene-b');
  const first = runtime.registerArtifact(root, { path: 'build/scene-b', purpose: '现场', disposition: 'ephemeral', taskId: 'task-b' });
  assert.throws(
    () => runtime.registerArtifact(root, { path: 'build/scene-b', purpose: '变更', disposition: 'ephemeral', taskId: 'task-b' }),
    (error: any) => error.code === 'artifact_record_conflict' && error.details.currentRecordDigest === first.recordDigest,
  );
  const second = runtime.registerArtifact(root, { path: 'build/scene-b', purpose: '变更', disposition: 'ephemeral', taskId: 'task-b', expectedRecord: first.recordDigest });
  assert.equal(second.updated, true);
  assert.equal(second.record.purpose, '变更');
});

test('.buildr/local 证据类目录仅观察不进入删除集', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evidence = path.join(root, '.buildr', 'local', 'task-evidence');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'log.txt'), 'x');
  const list = runtime.listArtifacts(root);
  const item = list.artifacts.find((view: any) => view.path === '.buildr/local/task-evidence');
  assert.equal(item.kind, 'evidence');
  assert.equal(item.state, 'evidence');
  const executed = runtime.cleanArtifacts(root, { execute: true });
  assert.equal(executed.results.find((result: any) => result.path === '.buildr/local/task-evidence').result, 'retained');
});

test('逐项失败隔离：单项删除失败不影响其余项且状态为 partial', (t) => {
  const { root, runtime } = fixture({ 'task-c': 'completed' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  makeScratch(root, 'scene-fail');
  makeScratch(root, 'scene-ok');
  runtime.registerArtifact(root, { path: 'build/scene-fail', purpose: 'a', disposition: 'ephemeral', taskId: 'task-c' });
  runtime.registerArtifact(root, { path: 'build/scene-ok', purpose: 'b', disposition: 'ephemeral', taskId: 'task-c' });
  const original = fs.rmSync;
  t.mock.method(fs, 'rmSync', (target: any, options: any) => {
    if (String(target).endsWith('scene-fail')) throw new Error('injected removal failure');
    return original.call(fs, target, options);
  });
  const executed = runtime.cleanArtifacts(root, { execute: true });
  assert.equal(executed.status, 'partial');
  assert.equal(executed.results.find((result: any) => result.path === 'build/scene-fail').result, 'error');
  assert.equal(executed.results.find((result: any) => result.path === 'build/scene-ok').result, 'deleted');
});

test('release 需要当前 digest 并把 retained 标记为 released', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  makeScratch(root, 'scene-keep');
  const registered = runtime.registerArtifact(root, {
    path: 'build/scene-keep', purpose: '保留 SDK', disposition: 'retained',
    retainReason: '运行引用', references: [{ summary: '桌面配置引用', checkPath: 'build/scene-keep' }],
  });
  const list = runtime.listArtifacts(root);
  assert.equal(list.artifacts.find((view: any) => view.path === 'build/scene-keep').state, 'retained');
  assert.throws(
    () => runtime.releaseArtifact(root, registered.artifactId, { reason: 'x', expectedRecord: 'sha256-wrong' }),
    (error: any) => error.code === 'artifact_record_conflict',
  );
  const released = runtime.releaseArtifact(root, registered.artifactId, { reason: '改用自足包', expectedRecord: registered.recordDigest });
  assert.equal(released.record.state, 'released');
  const executed = runtime.cleanArtifacts(root, { execute: true });
  assert.equal(executed.results.find((result: any) => result.path === 'build/scene-keep').result, 'deleted');
});

test('retained 引用核验失败标记 retained-stale 且不可清扫', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  makeScratch(root, 'scene-sdk');
  runtime.registerArtifact(root, {
    path: 'build/scene-sdk', purpose: 'SDK 输入', disposition: 'retained',
    retainReason: '应用引用', references: [{ summary: '配置文件', checkPath: 'config/app.yml' }],
  });
  const list = runtime.listArtifacts(root);
  const item = list.artifacts.find((view: any) => view.path === 'build/scene-sdk');
  assert.equal(item.state, 'retained-stale');
  const executed = runtime.cleanArtifacts(root, { execute: true });
  assert.equal(executed.results.find((result: any) => result.path === 'build/scene-sdk').result, 'retained');
});

test('Workspace 外路径、符号链接与受保护根被拒绝', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => runtime.registerArtifact(root, { path: '..', purpose: 'x', disposition: 'ephemeral' }), (error: any) => error.code === 'artifact_outside_workspace');
  assert.throws(() => runtime.registerArtifact(root, { path: '.git/config', purpose: 'x', disposition: 'ephemeral' }), (error: any) => ['artifact_protected_path', 'artifact_target_missing'].includes(error.code));
  assert.throws(() => runtime.registerArtifact(root, { path: '.buildr/local/artifacts/x', purpose: 'x', disposition: 'ephemeral' }), (error: any) => error.code === 'artifact_protected_path');
});
