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
import { registerWorkspaceCommandApplication } from '../../src/modules/workspace/application/workspace-command-application.ts';
import { oppositeWebProfile, resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';

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

function runtimeFor(profile: any, profiles: any): any  {
  const runtime: any = createRuntime();
  runtime.workspaceRepository = createWorkspaceManifestRepository(runtime);
  runtime.registryRepository = createWorkspaceRegistryRepository(runtime, { productIdentity: DEVELOPMENT, webProfile: profile, resolveWebProfile });
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

function sharedProfile(dataRoot: any): any  {
  // options.dataRoot 会置 overridden=true；共享 Profile 语义需要 overridden=false。
  return { ...resolveWebProfile(DEVELOPMENT, { dataRoot }), overridden: false };
}

test('共享 Profile 登记列表拒绝系统临时目录与 .worktrees 检出', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sharedRoot: any = path.join(base, 'shared');
  const profile: any = sharedProfile(sharedRoot);
  const runtime: any = runtimeFor(profile, { development: profile });

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

test('隔离数据根继续允许登记临时位置', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-registry-scope-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const isolatedRoot: any = path.join(base, 'isolated');
  const profile: any = resolveWebProfile(DEVELOPMENT, { dataRoot: isolatedRoot });
  const runtime: any = runtimeFor(profile, { development: profile });

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
