import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createWorkspaceManifestRepository } from '../../src/modules/workspace/persistence/workspace-manifest-repository.ts';
import { createWorkspaceRegistryRepository, WORKSPACE_REGISTRY_SCHEMA } from '../../src/modules/workspace/persistence/workspace-registry-repository.ts';
import { registerWorkspaceManagementFence } from '../../src/modules/workspace/infrastructure/workspace-management-fence.ts';
import { registerWorkspaceQueryApplication } from '../../src/modules/workspace/application/workspace-query-application.ts';
import { ensureRegisteredTarget, registerWorkspaceCommandApplication } from '../../src/modules/workspace/application/workspace-command-application.ts';
import { oppositeWebProfile, resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { createIsolatedWorkspaceState } from '../../tools/development/isolated-workspace-state.ts';
import { createTestStateWriteBoundary } from '../../src/infrastructure/filesystem/test-state-boundary.ts';

const DEVELOPMENT: any = { channel: 'development', runtime: { role: 'development' } };

function workspace(base: any, name: any, id: any = crypto.randomUUID()): any  {
  const root: any = path.join(base, name);
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Test\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${id}\nname: ${name}\ndescription: Test Workspace\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  return root;
}

function runtimeFor(profile: any, profiles: any, sharedProfileRegistryFile?: string): any  {
  const runtime: any = createRuntime();
  runtime.workspaceRepository = createWorkspaceManifestRepository(runtime);
  runtime.registryRepository = createWorkspaceRegistryRepository(runtime, { productIdentity: DEVELOPMENT, webProfile: profile, resolveWebProfile, sharedProfileRegistryFile });
  Object.assign(runtime, runtime.workspaceRepository, runtime.registryRepository);
  registerWorkspaceQueryApplication(runtime);
  registerWorkspaceManagementFence(runtime, { peerProfiles: profiles, oppositeWebProfile });
  registerWorkspaceCommandApplication(runtime);
  return runtime;
}

function register(runtime: any, root: any): any  {
  const before: any = runtime.listRegisteredWorkspaces();
  return runtime.registerLocalWorkspace({ rootPath: root, revision: before.revision });
}

test('共享 Profile 登记列表拒绝系统临时目录与 .worktrees 检出', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sharedRoot: any = path.join(base, 'shared');
  const profile: any = resolveWebProfile(DEVELOPMENT, { dataRoot: sharedRoot });
  const runtime: any = runtimeFor(profile, { development: profile }, path.join(sharedRoot, 'workspace-registry.json'));

  for (const root of [workspace(base, 'temp-workspace'), path.join(base, '.worktrees', 'task-demo')]) {
    if (!fs.existsSync(path.join(root, '.buildr'))) {
      // .worktrees 下也按合法 Workspace 结构准备，确保失败只来自位置判定。
      workspace(path.dirname(root), path.basename(root));
    }
    assert.throws(
      () => register(runtime, root),
      (error: any) => error.code === 'workspace_registry_ephemeral_root',
    );
  }
  assert.equal(runtime.listRegisteredWorkspaces().workspaces.length, 0);
  assert.equal(fs.existsSync(path.join(sharedRoot, 'workspace-registry.json')), false);
});

test('覆盖变量指向共享数据根仍拒绝临时目录', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sharedRoot: any = path.join(base, 'shared');
  // dataRoot 覆盖会置 overridden=true，但写入目标即共享登记文件时仍属共享范围。
  const profile: any = resolveWebProfile(DEVELOPMENT, { dataRoot: sharedRoot });
  assert.equal(profile.overridden, true);
  const runtime: any = runtimeFor(profile, { development: profile }, path.join(sharedRoot, 'workspace-registry.json'));

  const root: any = workspace(base, 'temp-workspace');
  assert.throws(
    () => register(runtime, root),
    (error: any) => error.code === 'workspace_registry_ephemeral_root',
  );
  assert.equal(runtime.listRegisteredWorkspaces().workspaces.length, 0);
  assert.equal(fs.existsSync(path.join(sharedRoot, 'workspace-registry.json')), false);
});

test('隔离数据根继续允许登记临时位置', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const isolatedRoot: any = path.join(base, 'isolated');
  const profile: any = resolveWebProfile(DEVELOPMENT, { dataRoot: isolatedRoot });
  const runtime: any = runtimeFor(profile, { development: profile }, path.join(base, 'shared', 'workspace-registry.json'));

  const root: any = workspace(base, 'temp-workspace');
  const result: any = register(runtime, root);
  assert.equal(result.workspaces.length, 1);
  assert.equal(result.workspaces[0].rootPath, root);
  assert.equal(fs.existsSync(path.join(isolatedRoot, 'workspace-registry.json')), true);
});

function writeRegistry(file: any, roots: any) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots, lastOpenedRoot: null }, null, 2)}\n`);
}

function testEnvironment(t: any, env: NodeJS.ProcessEnv) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
}

test('Buildr 测试缺少生命周期身份不得回退用户状态，普通预览及外部 Node 测试不受影响', () => {
  const destination = path.join(os.tmpdir(), `simulated-user-${crypto.randomUUID()}`, 'workspace-registry.json');
  assert.throws(() => createTestStateWriteBoundary({ BUILDR_TEST_STATE_REQUIRED: '1' })(destination),
    (error: any) => error.code === 'buildr_test_state_boundary');
  assert.doesNotThrow(() => createTestStateWriteBoundary({
    NODE_TEST_CONTEXT: 'child-v8', BUILDR_LOCAL_APP_PREVIEW: '{"instance":"normal-preview"}',
  })(destination));
  assert.equal(fs.existsSync(path.dirname(destination)), false);
});

test('测试登记与管理归属拒绝继承的用户数据根，不依赖工作空间名称', t => {
  const state = createIsolatedWorkspaceState();
  t.after(() => state.cleanup());
  const userRoot = path.join(path.dirname(state.root), `user-profile-${crypto.randomUUID()}`);
  const root = workspace(state.root, 'repository/.buildr/local/inproc-probe/demo');
  testEnvironment(t, { ...state.env, BUILDR_APP_DATA_DIR: userRoot });
  const profile = resolveWebProfile(DEVELOPMENT);
  const runtime = runtimeFor(profile, { development: profile });
  const file = path.join(root, '.buildr/local/web-management.json');
  const before = runtime.listRegisteredWorkspaces();
  const blocked = (error: any) => error.code === 'buildr_test_state_boundary';
  assert.throws(() => register(runtime, root), blocked);
  assert.throws(() => runtime.ensureWorkspaceManagementClaim(root), blocked);
  assert.throws(() => runtime.registryRepository.withWorkspaceRegistryMutation(before.revision, (value: any) => value), blocked);
  assert.throws(() => runtime.registryRepository.writeWorkspaceRegistry(path.join(userRoot, 'workspace-registry.json'), {
    schemaVersion: WORKSPACE_REGISTRY_SCHEMA, roots: [root], lastOpenedRoot: null,
  }), blocked);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(`${file}.lock`), false);
  assert.equal(fs.existsSync(userRoot), false, '拒绝必须发生在用户目录、锁及登记创建前');
});

test('测试登记按真实路径拒绝数据目录的符号链接逃逸', t => {
  const state = createIsolatedWorkspaceState();
  t.after(() => state.cleanup());
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-test-state-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const alias = path.join(state.root, 'app-link');
  fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  testEnvironment(t, { ...state.env, BUILDR_APP_DATA_DIR: alias });
  const profile = resolveWebProfile(DEVELOPMENT);
  const runtime = runtimeFor(profile, { development: profile });
  const root = workspace(state.root, 'ordinary-workspace');
  assert.throws(() => register(runtime, root), (error: any) => error.code === 'buildr_test_state_boundary');
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.existsSync(path.join(root, '.buildr/local/web-management.json')), false);
});

test('缓存登记实例不能跨测试范围写入，移除环境变量也不能获得用户写入权限', t => {
  const first = createIsolatedWorkspaceState(), second = createIsolatedWorkspaceState();
  t.after(() => { first.cleanup(); second.cleanup(); });
  testEnvironment(t, first.env);
  const profile = resolveWebProfile(DEVELOPMENT);
  const runtime = runtimeFor(profile, { development: profile });
  const root = workspace(first.root, 'demo');
  Object.assign(process.env, second.env);
  assert.throws(() => register(runtime, root), (error: any) => error.code === 'buildr_test_state_boundary');
  delete process.env.BUILDR_TEST_LOCAL_STATE_ROOT;
  delete process.env.NODE_TEST_CONTEXT;
  assert.throws(() => runtime.ensureWorkspaceManagementClaim(root), (error: any) => error.code === 'buildr_test_state_boundary');
  assert.equal(fs.existsSync(path.join(profile.dataRoot, 'workspace-registry.json')), false);
  assert.equal(fs.existsSync(path.join(root, '.buildr/local/web-management.json')), false);
});

test('失效测试身份阻止写入，合法隔离身份恢复后仍可正常登记', t => {
  const state = createIsolatedWorkspaceState();
  t.after(() => state.cleanup());
  testEnvironment(t, state.env);
  const profile = resolveWebProfile(DEVELOPMENT);
  const runtime = runtimeFor(profile, { development: profile });
  const root = workspace(state.root, 'ordinary-workspace');
  const marker = path.join(state.root, '.buildr-test-state.json');
  const original = fs.readFileSync(marker, 'utf8');
  fs.writeFileSync(marker, JSON.stringify({ ...JSON.parse(original), completed: true }));
  assert.throws(() => register(runtime, root), (error: any) => error.code === 'buildr_test_state_boundary');
  assert.equal(fs.existsSync(path.join(root, '.buildr/local/web-management.json')), false);
  fs.rmSync(marker);
  assert.throws(() => register(runtime, root), (error: any) => error.code === 'buildr_test_state_boundary');
  fs.writeFileSync(marker, original);
  assert.equal(register(runtime, root).workspaces.length, 1);
});

test('预览登记列表合并共享条目并标注只读来源', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sharedRoot: any = path.join(base, 'shared');
  const previewRoot: any = path.join(sharedRoot, 'previews', 'case-a');
  fs.mkdirSync(previewRoot, { recursive: true });

  // 共享登记文件按持久 Workspace 的真实形态直接准备；本测试不经过登记入口。
  const sharedWorkspace: any = workspace(base, 'persistent');
  writeRegistry(path.join(sharedRoot, 'workspace-registry.json'), [sharedWorkspace]);

  const previous: any = process.env.BUILDR_LOCAL_APP_PREVIEW;
  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({ schemaVersion: 'buildr.local-app-preview/v1', instance: 'case-a' });
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previous;
  });

  const previewProfile: any = resolveWebProfile(DEVELOPMENT, { dataRoot: previewRoot });
  const preview: any = runtimeFor(previewProfile, { development: previewProfile });
  assert.equal(preview.registryRepository.sharedRegistryFile(), path.join(sharedRoot, 'workspace-registry.json'));

  const listed: any = preview.listRegisteredWorkspaces();
  assert.equal(listed.workspaces.length, 1);
  assert.equal(listed.workspaces[0].rootPath, sharedWorkspace);
  assert.equal(listed.workspaces[0].registryScope, 'shared');
  const sharedBefore = fs.readFileSync(path.join(sharedRoot, 'workspace-registry.json'), 'utf8');
  assert.equal(ensureRegisteredTarget(preview, sharedWorkspace), listed.workspaces[0].workspace.id);
  assert.equal(preview.resolveRegisteredWorkspace(listed.workspaces[0].workspace.id).rootPath, sharedWorkspace);
  assert.equal(preview.resolveRegisteredWorkspace(listed.workspaces[0].workspace.id, { touch: true }).rootPath, sharedWorkspace);
  assert.equal(fs.existsSync(path.join(previewRoot, 'workspace-registry.json')), false);
  assert.equal(fs.readFileSync(path.join(sharedRoot, 'workspace-registry.json'), 'utf8'), sharedBefore);
  const alias = path.join(base, 'workspace-alias');
  fs.symlinkSync(sharedWorkspace, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(ensureRegisteredTarget(preview, alias), listed.workspaces[0].workspace.id);
  assert.equal(fs.existsSync(path.join(previewRoot, 'workspace-registry.json')), false);

  // 预览登记自己的工作空间后共享条目仍在且保持只读来源。
  const ownWorkspace: any = workspace(previewRoot, 'own');
  const afterOwn: any = preview.listRegisteredWorkspaces();
  const beforeRevision: any = afterOwn.revision;
  const registered: any = preview.registerLocalWorkspace({ rootPath: ownWorkspace, revision: beforeRevision });
  assert.equal(registered.workspaces.length, 2);
  const scopes: any = new Map(registered.workspaces.map((entry: any) => [entry.rootPath, entry.registryScope]));
  assert.equal(scopes.get(sharedWorkspace), 'shared');
  assert.equal(scopes.get(ownWorkspace), 'local');
  assert.equal(fs.existsSync(path.join(previewRoot, 'workspace-registry.json')), true);

  // 预览移除仅存在于共享列表的目标返回明确诊断。
  const final: any = preview.listRegisteredWorkspaces();
  assert.throws(
    () => preview.removeRegisteredWorkspace({ rootPath: sharedWorkspace, revision: final.revision }),
    (error: any) => error.code === 'workspace_registry_shared_scope',
  );
  // --workspace or an older local registry may contain the same physical root.
  // That is one object, not two identities, even when path spellings differ.
  writeRegistry(path.join(previewRoot, 'workspace-registry.json'), [ownWorkspace, alias]);
  assert.equal(preview.listRegisteredWorkspaces().workspaces.length, 2);
  assert.equal(preview.resolveRegisteredWorkspace(listed.workspaces[0].workspace.id).rootPath, alias);
  assert.equal(fs.readFileSync(path.join(sharedRoot, 'workspace-registry.json'), 'utf8'), sharedBefore);
});

test('快照预览不合并同 ID 主目录，工作树副本可独立登记和解析', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-snapshot-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sharedRoot = path.join(base, 'shared');
  const previewRoot = path.join(sharedRoot, 'previews', 'snapshot');
  const id = crypto.randomUUID();
  const canonical = workspace(base, 'canonical', id);
  const worktree = workspace(base, 'worktree', id);
  const file = path.join(sharedRoot, 'workspace-registry.json');
  writeRegistry(file, [canonical]);
  const before = fs.readFileSync(file, 'utf8');
  const previous = process.env.BUILDR_LOCAL_APP_PREVIEW;
  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1', instance: 'snapshot',
    workspaceMode: 'snapshot', worktree, environmentRoot: worktree,
  });
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previous;
  });
  const profile = resolveWebProfile(DEVELOPMENT, { dataRoot: previewRoot });
  const preview = runtimeFor(profile, { development: profile });
  assert.equal(preview.registryRepository.sharedRegistryFile(), null);
  assert.equal(ensureRegisteredTarget(preview, worktree), id);
  assert.equal(preview.resolveRegisteredWorkspace(id).rootPath, worktree);
  assert.deepEqual(preview.listRegisteredWorkspaces().workspaces.map((entry: any) => [entry.rootPath, entry.status]), [[worktree, 'ready']]);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('预览上下文中共享登记仍参与 Workspace identity 去重', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sharedRoot: any = path.join(base, 'shared');
  const previewRoot: any = path.join(sharedRoot, 'previews', 'case-b');
  fs.mkdirSync(previewRoot, { recursive: true });

  const workspaceId: any = crypto.randomUUID();
  const sharedWorkspace: any = workspace(base, 'persistent', workspaceId);
  writeRegistry(path.join(sharedRoot, 'workspace-registry.json'), [sharedWorkspace]);

  const previous: any = process.env.BUILDR_LOCAL_APP_PREVIEW;
  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({ schemaVersion: 'buildr.local-app-preview/v1', instance: 'case-b' });
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previous;
  });

  const previewProfile: any = resolveWebProfile(DEVELOPMENT, { dataRoot: previewRoot });
  const preview: any = runtimeFor(previewProfile, { development: previewProfile });
  const duplicate: any = workspace(base, 'duplicate', workspaceId);
  const before: any = preview.listRegisteredWorkspaces();
  assert.throws(
    () => preview.registerLocalWorkspace({ rootPath: duplicate, revision: before.revision }),
    (error: any) => error.code === 'workspace_registry_identity_conflict',
  );
  assert.equal(fs.existsSync(path.join(previewRoot, 'workspace-registry.json')), false);
});
