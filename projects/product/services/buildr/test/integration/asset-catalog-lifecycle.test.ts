import { createServiceDiagnostics } from '../../src/modules/workspace/application/diagnostics/service-diagnostics.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { resolveRuleScope } from '../../src/modules/agent-assets/infrastructure/runtime/rule-projection.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace, copyPreparedLegacyProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';
import { setup, setupLegacy, ready, addRepo, waitFor, makeOriginRepository, initRepository } from '../helpers/asset-relationships.ts';


test('自然显示名在初始化和编辑间一致，空白名称在写入前拒绝', (t: any) => {
  const runtime: any = createRuntime();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-display-name-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, '中文 工作目录');
  runtime.initBuildr(['--target', root, '--description', '中文资料工作空间', '--profile', 'personal', '--source-only']);
  const initial = runtime.getWorkspace(root);
  assert.equal(initial.workspace.name, '中文 工作目录');
  const renamed = runtime.updateWorkspaceMetadata(root, { revision: initial.revision, name: '  研究 🌱 项目  ' });
  assert.equal(renamed.workspace.name, '研究 🌱 项目');
  assert.equal(renamed.workspace.id, initial.workspace.id);
  const invalid = path.join(base, 'invalid');
  assert.throws(() => runtime.initializeWorkspace({ targetRoot: invalid, name: '   ', description: 'Description', profile: 'personal', agent: null, sourceOnly: true }), /name must be a non-empty string/u);
  assert.equal(fs.existsSync(invalid), false);
  const metadata = fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8');
  assert.throws(() => runtime.updateWorkspaceMetadata(root, { revision: renamed.revision, name: '\n\t ' }), /name must be a non-empty string/u);
  assert.equal(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'), metadata);
});

test('fresh initialization creates a current empty catalog and accepts the first project through HTTP', async (t: any) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-fresh-asset-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = createRuntime();
  runtime.initializeWorkspace({ targetRoot: root, name: 'fresh', description: 'First-use catalog fixture', profile: 'team', agent: null, sourceOnly: true });
  for (const [file, schemaVersion, key] of [
    ['projects/manifest.yml', 'buildr.projects/v2', 'projects'],
    ['services/manifest.yml', 'buildr.services/v3', 'services'],
    ['repositories/manifest.yml', 'buildr.repositories/v1', 'repositories'],
  ]) {
    assert.deepEqual(YAML.parse(fs.readFileSync(path.join(root, file), 'utf8')), { schemaVersion, [key]: {} });
  }
  const before = runtime.assetCatalog(root);
  assert.equal(before.migrationRequired, false);
  assert.deepEqual([before.projects, before.services, before.repositories], [[], [], []]);
  let authorized = 0;
  const response: any = await createWorkspaceHttpContribution(runtime).handle({
    request: { method: 'POST' }, suffix: '/asset-catalog/projects', root,
    authorizeWrite: () => authorized++,
    readJsonBody: async () => ({ revision: before.revision, code: 'first', name: '首个项目' }),
  });
  assert.equal(response.status, 200);
  assert.equal(authorized, 1);
  assert.equal(response.body.migrationRequired, false);
  assert.equal(response.body.projects[0].code, 'first');
  assert.ok(fs.existsSync(path.join(root, 'projects/first/AGENTS.md')));
  const files = ['.buildr/workspace.yml', 'projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml'];
  const bytes = files.map(file => fs.readFileSync(path.join(root, file)));
  runtime.initializeWorkspace({ targetRoot: root, name: 'reinitialized', description: 'Preserve registered assets', profile: 'team', agent: null, sourceOnly: true });
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes[i]));
  assert.equal(runtime.assetCatalog(root).revision, response.body.revision);
});


test('reinitializing a legacy layout preserves migration, service identities and physical content', (t: any) => {
  const { root, runtime } = setupLegacy(t);
  const source = path.join(root, 'incoming'); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'README.md'), 'legacy service bytes\n');
  const service = runtime.createServiceAsset({ targetRoot: root, project: 'demo', service: 'api', repoRef: source, attachRef: null, name: 'Legacy', description: 'Legacy service', type: 'service', rulesSource: null, integrationBranch: null, remote: 'origin', remoteExplicit: false, json: false }).service;
  const files = ['.buildr/workspace.yml', 'projects/manifest.yml', 'projects/demo/services/manifest.yml', 'projects/demo/services/api/README.md'];
  const bytes = files.map(file => fs.readFileSync(path.join(root, file)));
  const before = runtime.assetCatalog(root);
  assert.equal(before.migrationRequired, true);
  assert.equal(before.services[0].id, service.id);
  runtime.initializeWorkspace({ targetRoot: root, name: 'legacy', description: 'Preserve legacy assets', profile: 'team', agent: null, sourceOnly: true });
  assert.deepEqual(runtime.assetCatalog(root), before);
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes[i]));
  for (const file of ['services/manifest.yml', 'repositories/manifest.yml']) assert.equal(fs.existsSync(path.join(root, file)), false);
  assert.throws(() => runtime.createCatalogProject(root, { revision: before.revision, code: 'blocked', name: 'Requires migration' }), (e: any) => e.code === 'asset_migration_required');
  const after = ready(runtime, root);
  assert.equal(after.migrationRequired, false);
  assert.equal(after.services[0].id, service.id);
  assert.equal(fs.readFileSync(path.join(root, 'projects/demo/services/api/README.md'), 'utf8'), 'legacy service bytes\n');
});


test('reinitializing either half of a global catalog preserves the incomplete state', (t: any) => {
  for (const missing of ['services/manifest.yml', 'repositories/manifest.yml']) {
    const { root, runtime } = setup(t);
    fs.rmSync(path.join(root, missing));
    const files = ['.buildr/workspace.yml', 'projects/manifest.yml', missing === 'services/manifest.yml' ? 'repositories/manifest.yml' : 'services/manifest.yml'];
    const bytes = files.map(file => fs.readFileSync(path.join(root, file)));
    assert.throws(() => runtime.assetCatalog(root), (e: any) => e.code === 'asset_registry_incomplete');
    runtime.initializeWorkspace({ targetRoot: root, name: 'incomplete', description: 'Preserve catalog recovery boundary', profile: 'team', agent: null, sourceOnly: true });
    assert.equal(fs.existsSync(path.join(root, missing)), false);
    files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes[i]));
    assert.throws(() => runtime.assetCatalog(root), (e: any) => e.code === 'asset_registry_incomplete');
  }
});


test('an existing dangling catalog entry is not treated as a fresh empty layout', (t: any) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-existing-catalog-entry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'services'));
  const manifest = path.join(root, 'services/manifest.yml');
  fs.symlinkSync('unavailable.yml', manifest);
  const runtime = createRuntime();
  runtime.initializeWorkspace({ targetRoot: root, name: 'existing', description: 'Preserve unknown catalog entries', profile: 'team', agent: null, sourceOnly: true });
  assert.equal(fs.lstatSync(manifest).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(manifest), 'unavailable.yml');
  assert.equal(fs.existsSync(path.join(root, 'repositories/manifest.yml')), false);
  assert.throws(() => runtime.assetCatalog(root), (e: any) => e.code === 'asset_symlink_forbidden');
});


test('global catalog read is zero-write; explicit migration is idempotent and stale mutations fail', (t: any) => {
  const { root, runtime } = setupLegacy(t);
  const file = path.join(root, 'projects/manifest.yml');
  const bytes = fs.readFileSync(file);
  const before = runtime.assetCatalog(root);
  assert.equal(before.migrationRequired, true);
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.equal(fs.existsSync(path.join(root, 'services/manifest.yml')), false);
  const after = ready(runtime, root);
  assert.equal(after.migrationRequired, false);
  assert.deepEqual(runtime.migrateAssetCatalog(root, { revision: after.revision }), after);
  assert.throws(() => addRepo(runtime, root, before.revision, 'pigs', 'dev-pigs'), (e: any) => e.code === 'asset_revision_conflict');
});


test('legacy service paths survive migration and unlink; compatibility HTTP accepts optional descriptions', async (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'api', 'dev');
  const project = c.projects[0];
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: project.id, service: { code: 'business', name: 'Business', repositoryId: c.repositories[0].id } });
  const http = createWorkspaceHttpContribution(runtime);
  const response: any = await http.handle({ request: { method: 'GET' }, suffix: `/projects/${project.code}/services`, root });
  assert.equal(response.status, 200); assert.equal(response.body.services[0].description, '');
  c = runtime.updateProjectServices(root, project.id, { revision: c.revision, serviceIds: [] });
  assert.equal(runtime.listServices(root, project.code).services.length, 0);
  assert.equal(runtime.serviceDetail(root, project.code, 'business').service.id, c.services[0].id);
});


test('existing broken references do not prevent unrelated metadata editing', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'api', 'dev');
  const file = path.join(root, 'projects/manifest.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('serviceIds: []', 'serviceIds: [aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa]'));
  c = runtime.assetCatalog(root);
  assert.equal(c.diagnostics[0].code, 'project_service_missing');
  const next = runtime.updateCatalogAsset(root, 'repository', c.repositories[0].id, { revision: c.revision, name: 'Updated' });
  assert.equal(next.repositories[0].name, 'Updated');
  assert.deepEqual(next.projects[0].serviceIds, ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']);
});


test('explicit migration code mappings preserve legacy identities and physical content', (t: any) => {
  const { root, runtime } = setupLegacy(t);
  runtime.createProjectAsset({ targetRoot: root, project: 'other', repoRef: null, attachRef: null, name: 'Other', description: 'Other project', remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const original: Record<string, string> = {};
  for (const project of ['demo', 'other']) {
    const source = path.join(root, `incoming-${project}`); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'README.md'), project);
    original[project] = runtime.createServiceAsset({ targetRoot: root, project, service: 'api', repoRef: source, attachRef: null, name: project, description: 'Legacy', type: 'service', rulesSource: null, integrationBranch: null, remote: 'origin', remoteExplicit: false, json: false }).service.id;
  }
  const before = runtime.assetCatalog(root);
  assert.throws(() => runtime.migrateAssetCatalog(root, { revision: before.revision }), (e: any) => e.code === 'asset_duplicate');
  assert.equal(fs.existsSync(path.join(root, 'services/manifest.yml')), false);
  const after = runtime.migrateAssetCatalog(root, { revision: before.revision, codeMappings: { 'demo/api': 'demo-api', 'other/api': 'other-api' } });
  for (const project of ['demo', 'other']) {
    assert.equal(runtime.serviceDetail(root, project, 'api').service.id, original[project]);
    assert.equal(fs.readFileSync(path.join(root, 'projects', project, 'services/api/README.md'), 'utf8'), project);
  }
  assert.equal(after.repositories.length, 2);
  assert.equal(runtime.catalogServiceDocument(root, original.demo, 'README.md').content, 'demo');
});


test('global service documents preserve rule access and reject escaping symlinks', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'code', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'api', name: 'API', repositoryId: c.repositories[0].id } });
  const document = runtime.catalogServiceDocument(root, c.services[0].id, 'AGENTS.md');
  assert.equal(document.exists, false); assert.equal(document.content, null);
  fs.mkdirSync(path.join(root, 'services/api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'services/api/AGENTS.md'), '# API\n\n服务级规则占位。\n');
  assert.match(runtime.catalogServiceDocument(root, c.services[0].id, 'AGENTS.md').content, /服务级规则占位/);
  assert.throws(() => runtime.catalogServiceDocument(root, c.services[0].id, '../manifest.yml'), /范围内/);
  fs.symlinkSync(path.join(root, 'projects/demo/AGENTS.md'), path.join(root, 'services/api/README.md'));
  assert.throws(() => runtime.catalogServiceDocument(root, c.services[0].id, 'README.md'), (e: any) => e.code === 'service_document_path_forbidden');
});


test('independent list HTTP contracts omit full catalog and never observe Git', async (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'light', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'light-api', name: 'Light', repositoryId: c.repositories[0].id } });
  const http = createWorkspaceHttpContribution(runtime);
  const observed = runtime.observeProjectGit;
  runtime.observeProjectGit = () => { throw new Error('list must not scan Git'); };
  try {
    for (const suffix of ['/services', '/repositories', '/asset-catalog']) {
      const response: any = await http.handle({ request: { method: 'GET' }, suffix, root });
      assert.equal(response.status, 200);
      assert.equal(response.body.revision, c.revision);
      if (suffix === '/services') { assert.equal(response.body.repositories, undefined); assert.equal(response.body.services[0].repository.name, 'light'); assert.equal(response.body.services[0].projects.length, 1); }
      if (suffix === '/repositories') { assert.equal(response.body.services, undefined); assert.equal(response.body.repositories[0].serviceCount, 1); }
    }
  } finally { runtime.observeProjectGit = observed; }
});


test('delete service and project uses observed revision and preserves all physical content', async (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'shared-delete', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'delete-api', name: 'Delete', repositoryId: c.repositories[0].id } });
  const serviceId = c.services[0].id;
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'other-delete', name: 'Other', serviceIds: [serviceId] });
  const stale = c.revision;
  c = runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, name: 'Changed' });
  assert.throws(() => runtime.deleteCatalogAsset(root, 'service', serviceId, { revision: stale }), (e: any) => e.code === 'asset_revision_conflict');
  assert.equal(runtime.assetCatalog(root).services.length, 1);
  const directory = path.join(root, 'services/delete-api'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'AGENTS.md'); fs.writeFileSync(file, '# Delete\n\n人工服务规则。\n'); const bytes = fs.readFileSync(file);
  const http = createWorkspaceHttpContribution(runtime); let authorization = 0;
  const result: any = await http.handle({ request: { method: 'DELETE' }, suffix: `/asset-catalog/service/${serviceId}`, root, authorizeWrite: () => { authorization++; }, readJsonBody: async () => ({ revision: c.revision }) });
  assert.equal(authorization, 1); assert.equal(result.status, 200); c = result.body;
  assert.equal(c.services.length, 0); assert.equal(c.repositories.length, 1);
  assert.ok(c.projects.every((p: any) => !p.serviceIds.includes(serviceId)));
  assert.deepEqual(fs.readFileSync(file), bytes);
  c = runtime.deleteCatalogAsset(root, 'project', 'other-delete', { revision: c.revision });
  assert.equal(c.projects.length, 1); assert.ok(fs.existsSync(path.join(root, 'projects/other-delete/AGENTS.md')));
  assert.equal(c.repositories.length, 1);
});
